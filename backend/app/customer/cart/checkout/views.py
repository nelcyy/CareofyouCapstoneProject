"""Backend CUSTOMER > CART > CHECKOUT."""
import os
import uuid
from datetime import timedelta

from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ....common import device_label, is_proof_image_upload
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
ADDRESS_FRESH_WINDOW_MINUTES = 30
ADDRESS_RECENT_WINDOW_MINUTES = 24 * 60
RAPID_ORDER_WINDOW = timedelta(minutes=30)
TOTAL_RISK_SUPPORTING_WEIGHT = 0.45

DEVICE_STATUS_SCORES = {
    'usual_device': 0,
    'known_rare_device': 12,
    'new_trusted_device': 22,
    'not_registered_device': 35,
}
PASSWORD_STATUS_SCORES = {
    'clean_password': 0,
    'one_failed_password': 8,
    'two_failed_password': 18,
    'many_failed_password': 30,
}
OTP_STATUS_SCORES = {
    'clean_otp': 0,
    'one_failed_otp': 6,
    'two_failed_otp': 14,
    'many_failed_otp': 24,
}
ADDRESS_STATUS_SCORES = {
    'stable_address': 0,
    'recent_address': 6,
    'fresh_address': 12,
}
ACCOUNT_ORDER_STATUS_SCORES = {
    'normal_new_account_order': 0,
    'watch_new_account_order': 8,
    'high_new_account_order': 14,
    'very_high_new_account_order': 20,
}
ORDER_STATUS_SCORES = {
    'normal_order_frequency': 0,
    'one_recent_order': 6,
    'two_recent_order': 12,
    'many_recent_order': 18,
}


def _status_score(status, score_map):
    return int(score_map.get(status, 0))


def _device_status_from_snapshot(trusted_device, same_device_count, is_top_device, is_new_device):
    if trusted_device is None:
        return 'not_registered_device'
    if same_device_count == 0 and is_new_device:
        return 'new_trusted_device'
    if is_top_device and same_device_count >= 2:
        return 'usual_device'
    return 'known_rare_device'


def _device_score_for_status(status):
    return _status_score(status, DEVICE_STATUS_SCORES)


def _password_status_for_count(password_count):
    password_count = max(0, int(password_count or 0))
    if password_count == 0:
        return 'clean_password'
    if password_count == 1:
        return 'one_failed_password'
    if password_count == 2:
        return 'two_failed_password'
    return 'many_failed_password'


def _password_score_for_status(status):
    return _status_score(status, PASSWORD_STATUS_SCORES)


def _otp_status_for_count(otp_count):
    otp_count = max(0, int(otp_count or 0))
    if otp_count == 0:
        return 'clean_otp'
    if otp_count == 1:
        return 'one_failed_otp'
    if otp_count == 2:
        return 'two_failed_otp'
    return 'many_failed_otp'


def _otp_score_for_status(status):
    return _status_score(status, OTP_STATUS_SCORES)


def _address_status_for_age(address_age_minutes):
    address_age_minutes = max(0, int(address_age_minutes or 0))
    if address_age_minutes <= ADDRESS_FRESH_WINDOW_MINUTES:
        return 'fresh_address'
    if address_age_minutes <= ADDRESS_RECENT_WINDOW_MINUTES:
        return 'recent_address'
    return 'stable_address'


def _address_score_for_status(status):
    return _status_score(status, ADDRESS_STATUS_SCORES)


def _account_order_status_for_snapshot(account_age_days, grand_total):
    account_age_days = max(0, int(account_age_days or 0))
    grand_total = max(0, int(grand_total or 0))
    if account_age_days <= 1 and grand_total >= 500000:
        return 'very_high_new_account_order'
    if account_age_days <= 7 and grand_total >= 1000000:
        return 'high_new_account_order'
    if account_age_days <= 30 and grand_total >= 1500000:
        return 'watch_new_account_order'
    return 'normal_new_account_order'


def _account_order_score_for_status(status):
    return _status_score(status, ACCOUNT_ORDER_STATUS_SCORES)


def _order_status_for_count(recent_orders_30m_count):
    recent_orders_30m_count = max(0, int(recent_orders_30m_count or 0))
    if recent_orders_30m_count <= 0:
        return 'normal_order_frequency'
    if recent_orders_30m_count == 1:
        return 'one_recent_order'
    if recent_orders_30m_count == 2:
        return 'two_recent_order'
    return 'many_recent_order'


def _order_score_for_status(status):
    return _status_score(status, ORDER_STATUS_SCORES)


def _order_monitoring_summary_from_scores(
    device_score,
    password_score,
    otp_score,
    address_score,
    account_order_score,
    order_score,
):
    hijack_risk_score = min(
        100,
        max(0, int(device_score or 0))
        + max(0, int(password_score or 0))
        + max(0, int(otp_score or 0)),
    )
    fraud_risk_score = min(
        100,
        max(0, int(address_score or 0))
        + max(0, int(account_order_score or 0))
        + max(0, int(order_score or 0)),
    )
    dominant_risk = max(hijack_risk_score, fraud_risk_score)
    supporting_risk = min(hijack_risk_score, fraud_risk_score)
    total_risk_score = min(
        100,
        dominant_risk + int(round(supporting_risk * TOTAL_RISK_SUPPORTING_WEIGHT)),
    )
    return {
        'hijack_risk_score': hijack_risk_score,
        'fraud_risk_score': fraud_risk_score,
        'total_risk_score': total_risk_score,
    }


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
    ext = (os.path.splitext(uploaded_file.name or '')[1] or '.jpg').lower()
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


def _device_status_for_order(user, trusted_device):
    if trusted_device is None:
        return 'not_registered_device'

    previous_monitorings = OrderMonitoring.objects.filter(order__user=user)
    same_device_count = previous_monitorings.filter(trusted_device=trusted_device).count()
    is_new_device = timezone.now() - trusted_device.created_at <= DEVICE_NEW_WINDOW

    device_counts = list(
        previous_monitorings
        .filter(trusted_device__isnull=False)
        .values('trusted_device_id')
        .annotate(total=Count('id'))
        .order_by('-total', 'trusted_device_id')
    )
    top_device = device_counts[0] if device_counts else None
    return _device_status_from_snapshot(
        trusted_device,
        same_device_count=same_device_count,
        is_top_device=bool(top_device and top_device['trusted_device_id'] == trusted_device.id),
        is_new_device=is_new_device,
    )


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


def _address_age_minutes_for_order(address, current_time):
    if not address or not address.created_at:
        return 0
    delta = current_time - address.created_at
    return max(0, int(delta.total_seconds() // 60))


def _account_age_days_for_order(user, current_time):
    if not user or not user.created_at:
        return 0
    delta = current_time - user.created_at
    return max(0, int(delta.total_seconds() // 86400))


def _recent_orders_30m_count_for_order(user, current_time):
    return (
        Order.objects
        .filter(user=user, created_at__gte=current_time - RAPID_ORDER_WINDOW)
        .count()
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
    if not is_proof_image_upload(payment_proof):
        return Response({'error': 'Bukti transfer harus berupa foto JPG, PNG, atau WebP.'}, status=400)

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
    device_status = _device_status_for_order(user, trusted_device)
    device_score = _device_score_for_status(device_status)
    password_count = _failed_password_count_for_login(user, login_id)
    password_status = _password_status_for_count(password_count)
    password_score = _password_score_for_status(password_status)
    otp_count = _failed_otp_count_for_login(user, login_id)
    otp_status = _otp_status_for_count(otp_count)
    otp_score = _otp_score_for_status(otp_status)
    address_age_minutes = _address_age_minutes_for_order(address, current_time)
    address_status = _address_status_for_age(address_age_minutes)
    address_score = _address_score_for_status(address_status)
    account_age_days = _account_age_days_for_order(user, current_time)
    account_order_status = _account_order_status_for_snapshot(account_age_days, grand_total)
    account_order_score = _account_order_score_for_status(account_order_status)
    recent_orders_30m_count = _recent_orders_30m_count_for_order(user, current_time)
    order_status = _order_status_for_count(recent_orders_30m_count)
    order_score = _order_score_for_status(order_status)
    summary = _order_monitoring_summary_from_scores(
        device_score,
        password_score,
        otp_score,
        address_score,
        account_order_score,
        order_score,
    )
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
            device_status=device_status,
            device_score=device_score,
            password_count=password_count,
            password_status=password_status,
            password_score=password_score,
            otp_count=otp_count,
            otp_status=otp_status,
            otp_score=otp_score,
            address_status=address_status,
            address_score=address_score,
            account_order_status=account_order_status,
            account_order_score=account_order_score,
            order_status=order_status,
            order_score=order_score,
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
        'risk_score': summary['total_risk_score'],
    }, status=201)
