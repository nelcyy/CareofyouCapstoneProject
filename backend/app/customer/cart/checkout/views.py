"""Backend CUSTOMER > CART > CHECKOUT."""
import os
import uuid
from datetime import timedelta

from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import Avg, Count
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ....common import device_label
from ....models import ActivityLog, Address, CartItem, Order, OrderItem, OrderMonitoring, TrustedDevice, User

COURIER_OPTIONS = {
    'jne-reg': {'name': 'JNE REG', 'fee': 12000},
    'jnt-reg': {'name': 'J&T REG', 'fee': 10000},
    'sicepat-reg': {'name': 'SiCepat REG', 'fee': 11000},
}

PAYMENT_OPTIONS = {
    'gopay': {'name': 'GoPay', 'target': '12345'},
    'ovo': {'name': 'OVO', 'target': '5678'},
    'bca-transfer': {'name': 'Transfer Bank BCA', 'target': '23456'},
}

DEVICE_NEW_WINDOW = timedelta(days=1)
# Hijack indicators stay the most important, but a single device anomaly
# should not jump straight to an extreme score on its own.
DEVICE_RISK_SCORES = {
    'usual': 0,
    'known_rare': 12,
    'new_trusted': 22,
    'not_registered': 35,
}
FAILED_PASSWORD_SCORES = {
    0: 0,
    1: 8,
    2: 18,
}
FAILED_OTP_SCORES = {
    0: 0,
    1: 6,
    2: 14,
}
ADDRESS_FRESH_WINDOW_MINUTES = 30
ADDRESS_RECENT_WINDOW_MINUTES = 24 * 60
RAPID_ORDER_WINDOW = timedelta(minutes=30)
TOTAL_RISK_SUPPORTING_WEIGHT = 0.45


def _serialize_address(item):
    return {
        'id': item.id,
        'label': item.label,
        'recipient_name': item.recipient_name,
        'phone': item.phone,
        'address_line': item.address_line,
        'city': item.city,
        'province': item.province,
        'postal_code': item.postal_code,
        'notes': item.notes,
        'is_default': item.is_default,
    }


def _serialize_user(user):
    return {
        'id': user.id,
        'email': user.email,
        'name': user.name,
        'phone': user.phone,
        'role': user.role,
    }


@api_view(['GET'])
def checkout_user(request):
    """Data user terbaru untuk kebutuhan default checkout."""
    user = User.objects.filter(id=request.GET.get('user_id')).first()
    if user is None:
        return Response({'error': 'User tidak valid.'}, status=400)
    return Response(_serialize_user(user))


def _generate_order_code(user_id):
    timestamp = timezone.localtime().strftime('%Y%m%d%H%M%S')
    return f'ORD-{timestamp}-{user_id}'


def _save_payment_proof(user_id, uploaded_file):
    ext = os.path.splitext(uploaded_file.name or '')[1] or '.jpg'
    filename = f'payment_proofs/user-{user_id}-{uuid.uuid4().hex}{ext}'
    return default_storage.save(filename, uploaded_file)


def _trusted_device_for_order(user, trust_token):
    token = str(trust_token or '').strip()
    if not token:
        return None
    return (
        TrustedDevice.objects
        .filter(user=user, token=token, is_active=True, expires_at__gt=timezone.now())
        .first()
    )


def _trusted_device_status_for_order(user, trusted_device):
    if trusted_device is None:
        return 'not_registered'

    previous_monitorings = OrderMonitoring.objects.filter(order__user=user)
    same_device_count = previous_monitorings.filter(trusted_device=trusted_device).count()
    if same_device_count == 0 and timezone.now() - trusted_device.created_at <= DEVICE_NEW_WINDOW:
        return 'new_trusted'

    device_counts = list(
        previous_monitorings
        .filter(trusted_device__isnull=False)
        .values('trusted_device_id')
        .annotate(total=Count('id'))
        .order_by('-total', 'trusted_device_id')
    )
    top_device = device_counts[0] if device_counts else None
    if top_device and top_device['trusted_device_id'] == trusted_device.id and same_device_count >= 2:
        return 'usual'
    return 'known_rare'


def _device_risk_score_for_status(trusted_device_status):
    return DEVICE_RISK_SCORES.get(trusted_device_status, 0)


def _failed_password_count_for_login(user, login_id):
    login_id = str(login_id or '').strip()
    if not login_id:
        return 0
    return (
        ActivityLog.objects
        .filter(
            user=user,
            login_id=login_id,
            event_type='login',
            result='gagal',
            reason='salah_password',
        )
        .count()
    )


def _failed_password_score_for_count(failed_password_count):
    if failed_password_count >= 3:
        return 30
    return FAILED_PASSWORD_SCORES.get(failed_password_count, 0)


def _failed_otp_count_for_login(user, login_id):
    login_id = str(login_id or '').strip()
    if not login_id:
        return 0
    return (
        ActivityLog.objects
        .filter(
            user=user,
            login_id=login_id,
            event_type='login_otp_failed',
            result='gagal',
            reason__in=['salah_otp', 'otp_kadaluarsa'],
        )
        .count()
    )


def _failed_otp_score_for_count(failed_otp_count):
    if failed_otp_count >= 3:
        return 24
    return FAILED_OTP_SCORES.get(failed_otp_count, 0)


# ======================= HIJACK SCORE =======================
def _hijack_risk_score_for_order(device_risk_score, failed_password_score, failed_otp_score):
    return min(100, device_risk_score + failed_password_score + failed_otp_score)


# ======================= FRAUD: ALAMAT BARU =======================
def _address_age_minutes_for_order(address, current_time):
    if not address or not address.created_at:
        return 0
    delta = current_time - address.created_at
    return max(0, int(delta.total_seconds() // 60))


def _new_address_score_for_age(address_age_minutes):
    if address_age_minutes <= ADDRESS_FRESH_WINDOW_MINUTES:
        return 12
    if address_age_minutes <= ADDRESS_RECENT_WINDOW_MINUTES:
        return 6
    return 0


# ======================= FRAUD: NOMINAL TIDAK WAJAR =======================
def _order_amount_ratio_percent_for_order(user, grand_total):
    previous_orders = Order.objects.filter(user=user)
    if previous_orders.count() < 3:
        return 0
    average_total = previous_orders.aggregate(avg_total=Avg('grand_total'))['avg_total'] or 0
    if not average_total:
        return 0
    return int(round((grand_total * 100) / average_total))


def _amount_anomaly_score_for_ratio(order_amount_ratio_percent):
    if order_amount_ratio_percent <= 150:
        return 0
    if order_amount_ratio_percent <= 250:
        return 8
    if order_amount_ratio_percent <= 400:
        return 18
    return 30


# ======================= FRAUD: BORONG / QTY =======================
def _order_quantity_snapshot(cart_items):
    quantities = [int(it.quantity or 0) for it in cart_items]
    return {
        'total_item_quantity': sum(quantities),
        'max_single_product_quantity': max(quantities, default=0),
    }


def _bulk_order_score_for_quantities(total_item_quantity, max_single_product_quantity):
    if max_single_product_quantity >= 10 or total_item_quantity >= 18:
        return 16
    if max_single_product_quantity >= 7 or total_item_quantity >= 12:
        return 10
    if max_single_product_quantity >= 5 or total_item_quantity >= 8:
        return 5
    return 0


# ======================= FRAUD: AKUN BARU + ORDER BESAR =======================
def _account_age_days_for_order(user, current_time):
    if not user or not user.created_at:
        return 0
    delta = current_time - user.created_at
    return max(0, int(delta.total_seconds() // 86400))


def _new_account_big_order_score_for_order(account_age_days, grand_total):
    if account_age_days <= 1 and grand_total >= 500000:
        return 20
    if account_age_days <= 7 and grand_total >= 1000000:
        return 14
    if account_age_days <= 30 and grand_total >= 1500000:
        return 8
    return 0


# ======================= FRAUD: BANYAK ORDER CEPAT =======================
def _recent_orders_30m_count_for_order(user, current_time):
    return (
        Order.objects
        .filter(user=user, created_at__gte=current_time - RAPID_ORDER_WINDOW)
        .count()
    )


def _rapid_order_score_for_count(recent_orders_30m_count):
    if recent_orders_30m_count <= 0:
        return 0
    if recent_orders_30m_count == 1:
        return 6
    if recent_orders_30m_count == 2:
        return 12
    return 18


# ======================= FRAUD SCORE =======================
def _fraud_risk_score_for_order(
    new_address_score,
    amount_anomaly_score,
    bulk_order_score,
    new_account_big_order_score,
    rapid_order_score,
):
    return min(
        100,
        new_address_score
        + amount_anomaly_score
        + bulk_order_score
        + new_account_big_order_score
        + rapid_order_score,
    )


# ======================= TOTAL SCORE =======================
def _total_risk_score_for_order(hijack_risk_score, fraud_risk_score):
    dominant_risk = max(hijack_risk_score, fraud_risk_score)
    supporting_risk = min(hijack_risk_score, fraud_risk_score)
    # The strongest category sets the baseline; the second category only
    # amplifies it partially so we avoid inflated totals from simple addition.
    return min(
        100,
        dominant_risk + int(round(supporting_risk * TOTAL_RISK_SUPPORTING_WEIGHT)),
    )


@api_view(['GET'])
def list_addresses(request):
    """Daftar alamat seorang customer (pakai ?user_id=)."""
    items = (Address.objects
             .filter(user_id=request.GET.get('user_id'))
             .order_by('-is_default', 'id'))
    return Response([_serialize_address(it) for it in items])


@api_view(['POST'])
def create_address(request):
    """Tambah alamat baru customer."""
    user = User.objects.filter(id=request.data.get('user_id')).first()
    if user is None:
        return Response({'error': 'User tidak valid.'}, status=400)

    recipient_name = str(request.data.get('recipient_name') or '').strip() or user.name
    phone = str(request.data.get('phone') or '').strip() or user.phone
    address_line = str(request.data.get('address_line') or '').strip()
    city = str(request.data.get('city') or '').strip()
    province = str(request.data.get('province') or '').strip()
    postal_code = str(request.data.get('postal_code') or '').strip()

    required_fields = {
        'recipient_name': (recipient_name, 'Nama penerima wajib diisi.'),
        'phone': (phone, 'Nomor telepon wajib diisi.'),
        'address_line': (address_line, 'Alamat wajib diisi.'),
        'city': (city, 'Kota wajib diisi.'),
        'province': (province, 'Provinsi wajib diisi.'),
        'postal_code': (postal_code, 'Kode pos wajib diisi.'),
    }
    for _, (value, message) in required_fields.items():
        if not value:
            return Response({'error': message}, status=400)

    label = str(request.data.get('label') or 'Rumah').strip() or 'Rumah'
    notes = str(request.data.get('notes') or '').strip()
    wants_default = str(request.data.get('is_default') or '').lower() in ('true', '1', 'yes', 'on')
    has_address = Address.objects.filter(user=user).exists()
    is_default = wants_default or not has_address

    with transaction.atomic():
        if is_default:
            Address.objects.filter(user=user, is_default=True).update(is_default=False)

        item = Address.objects.create(
            user=user,
            label=label,
            recipient_name=recipient_name,
            phone=phone,
            address_line=address_line,
            city=city,
            province=province,
            postal_code=postal_code,
            notes=notes,
            is_default=is_default,
        )

    return Response(_serialize_address(item), status=201)


@api_view(['POST'])
def create_order(request):
    """Simpan order final setelah customer upload bukti transfer."""
    user = User.objects.filter(id=request.data.get('user_id')).first()
    if user is None:
        return Response({'error': 'User tidak valid.'}, status=400)
    login_id = str(request.data.get('login_id') or '').strip()
    trust_token = str(request.data.get('trust_token') or '').strip()

    address = Address.objects.filter(id=request.data.get('address_id'), user=user).first()
    if address is None:
        return Response({'error': 'Alamat tidak valid.'}, status=400)

    courier = COURIER_OPTIONS.get(str(request.data.get('courier_id') or ''))
    if courier is None:
        return Response({'error': 'Kurir tidak valid.'}, status=400)

    payment = PAYMENT_OPTIONS.get(str(request.data.get('payment_id') or ''))
    if payment is None:
        return Response({'error': 'Metode pembayaran tidak valid.'}, status=400)

    payment_proof = request.FILES.get('payment_proof')
    if payment_proof is None:
        return Response({'error': 'Bukti transfer wajib diupload.'}, status=400)

    cart_items = list(
        CartItem.objects.select_related('product')
        .filter(user=user)
        .order_by('id')
    )
    if not cart_items:
        return Response({'error': 'Keranjang kosong.'}, status=400)

    subtotal = sum((it.product.price if it.product else 0) * it.quantity for it in cart_items)
    shipping_fee = courier['fee']
    grand_total = subtotal + shipping_fee
    current_time = timezone.now()
    proof_path = _save_payment_proof(user.id, payment_proof)
    trusted_device = _trusted_device_for_order(user, trust_token)
    trusted_device_status = _trusted_device_status_for_order(user, trusted_device)
    device_risk_score = _device_risk_score_for_status(trusted_device_status)
    failed_password_count = _failed_password_count_for_login(user, login_id)
    failed_password_score = _failed_password_score_for_count(failed_password_count)
    failed_otp_count = _failed_otp_count_for_login(user, login_id)
    failed_otp_score = _failed_otp_score_for_count(failed_otp_count)
    hijack_risk_score = _hijack_risk_score_for_order(
        device_risk_score,
        failed_password_score,
        failed_otp_score,
    )
    address_age_minutes = _address_age_minutes_for_order(address, current_time)
    new_address_score = _new_address_score_for_age(address_age_minutes)
    order_amount_ratio_percent = _order_amount_ratio_percent_for_order(user, grand_total)
    amount_anomaly_score = _amount_anomaly_score_for_ratio(order_amount_ratio_percent)
    quantity_snapshot = _order_quantity_snapshot(cart_items)
    total_item_quantity = quantity_snapshot['total_item_quantity']
    max_single_product_quantity = quantity_snapshot['max_single_product_quantity']
    bulk_order_score = _bulk_order_score_for_quantities(total_item_quantity, max_single_product_quantity)
    account_age_days = _account_age_days_for_order(user, current_time)
    new_account_big_order_score = _new_account_big_order_score_for_order(account_age_days, grand_total)
    recent_orders_30m_count = _recent_orders_30m_count_for_order(user, current_time)
    rapid_order_score = _rapid_order_score_for_count(recent_orders_30m_count)
    fraud_risk_score = _fraud_risk_score_for_order(
        new_address_score,
        amount_anomaly_score,
        bulk_order_score,
        new_account_big_order_score,
        rapid_order_score,
    )
    total_risk_score = _total_risk_score_for_order(hijack_risk_score, fraud_risk_score)
    current_device_label = device_label(request)

    with transaction.atomic():
        order = Order.objects.create(
            user=user,
            login_id=login_id,
            order_code=_generate_order_code(user.id),
            address_label=address.label,
            recipient_name=address.recipient_name,
            recipient_phone=address.phone,
            address_line=address.address_line,
            city=address.city,
            province=address.province,
            postal_code=address.postal_code,
            address_notes=address.notes,
            courier_name=courier['name'],
            shipping_fee=shipping_fee,
            payment_method=payment['name'],
            payment_target=payment['target'],
            payment_proof=proof_path,
            subtotal=subtotal,
            grand_total=grand_total,
            status='waiting_admin_approval',
        )
        OrderMonitoring.objects.create(
            order=order,
            login_id=login_id,
            trusted_device=trusted_device,
            device_label_snapshot=trusted_device.device_label if trusted_device else current_device_label,
            trusted_device_status=trusted_device_status,
            device_risk_score=device_risk_score,
            failed_password_count=failed_password_count,
            failed_password_score=failed_password_score,
            failed_otp_count=failed_otp_count,
            failed_otp_score=failed_otp_score,
            hijack_risk_score=hijack_risk_score,
            address_age_minutes=address_age_minutes,
            new_address_score=new_address_score,
            order_amount_ratio_percent=order_amount_ratio_percent,
            amount_anomaly_score=amount_anomaly_score,
            total_item_quantity=total_item_quantity,
            max_single_product_quantity=max_single_product_quantity,
            bulk_order_score=bulk_order_score,
            account_age_days=account_age_days,
            new_account_big_order_score=new_account_big_order_score,
            recent_orders_30m_count=recent_orders_30m_count,
            rapid_order_score=rapid_order_score,
            fraud_risk_score=fraud_risk_score,
            total_risk_score=total_risk_score,
            trusted_device_created_at_snapshot=trusted_device.created_at if trusted_device else None,
        )

        OrderItem.objects.bulk_create([
            OrderItem(
                order=order,
                product=it.product,
                product_name=it.product.name if it.product else '',
                product_price=it.product.price if it.product else 0,
                quantity=it.quantity,
                subtotal=(it.product.price if it.product else 0) * it.quantity,
            )
            for it in cart_items
        ])

        CartItem.objects.filter(user=user).delete()

    return Response({
        'message': 'Order berhasil dibuat.',
        'order_id': order.id,
        'order_code': order.order_code,
        'status': order.status,
    }, status=201)
