"""Backend CUSTOMER > PROFILE > RETUR."""
import json
import os
from collections import Counter
from datetime import timedelta

from django.core.exceptions import ObjectDoesNotExist
from django.core.files.storage import default_storage
from django.db import transaction
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ....common import device_label
from ....models import (
    ActivityLog,
    Address,
    Order,
    OrderMonitoring,
    Return,
    ReturnEReceiptVerification,
    ReturnItem,
    ReturnMonitoring,
    TrustedDevice,
)
from ..common import get_customer_profile_user

RETURN_WINDOW = timedelta(days=2)
DEVICE_NEW_WINDOW = timedelta(days=1)
ADDRESS_FRESH_WINDOW_MINUTES = 30
ADDRESS_RECENT_WINDOW_MINUTES = 24 * 60
TOTAL_RISK_SUPPORTING_WEIGHT = 0.45

EXCHANGE_COURIER_OPTIONS = {
    'jne-reg': {'name': 'JNE REG'},
    'jnt-reg': {'name': 'J&T REG'},
    'sicepat-reg': {'name': 'SiCepat REG'},
}
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
TRUSTED_DEVICE_STATUS_LABELS = {
    'usual': 'Yang Biasa Dipakai',
    'known_rare': 'Dikenal Tapi Jarang Dipakai',
    'new_trusted': 'Trusted Device Baru',
    'not_registered': 'Tidak Ada di Trusted Device',
}
RETURN_STATUS_LABELS = {
    'waiting_admin_review': 'Menunggu Review Admin',
    'approved': 'Disetujui',
    'rejected': 'Ditolak',
    'cancelled': 'Dibatalkan',
    'shipped_back': 'Produk Dikirim Balik',
    'received': 'Produk Diterima Toko',
    'completed': 'Selesai',
}
RESOLUTION_TYPE_LABELS = {
    'refund': 'Refund',
    'exchange': 'Exchange',
}

# Alamat tujuan retur + kontak WA (hardcode, konsisten dgn PAYMENT_OPTIONS & WA di home).
# Ganti dgn data toko asli; WA pakai format internasional tanpa '+'.
RETURN_DESTINATION = {
    'recipient_name': 'CareOfYou Returns',
    'phone': '62800000000000',
    'whatsapp_number': '62800000000000',
    'address_line': 'Jl. Contoh Alamat Toko No. 1',
    'city': 'Tomohon',
    'province': 'Sulawesi Utara',
    'postal_code': '95416',
    'notes': 'Cantumkan kode retur di dalam paket, lalu chat WA toko setelah kirim.',
}


def _return_queryset():
    return (
        Return.objects
        .select_related(
            'user',
            'order',
            'processed_by',
            'received_by',
            'completed_by',
            'exchange_address',
            'ereceipt_verification',
            'ereceipt_verification__verified_by',
            'order__user',
            'order__monitoring',
            'monitoring__trusted_device',
        )
        .prefetch_related('items')
    )


def _save_return_upload(user_id, folder, uploaded_file):
    ext = os.path.splitext(uploaded_file.name or '')[1] or '.jpg'
    filename = f'returns/{folder}/user-{user_id}-{timezone.now().strftime("%Y%m%d%H%M%S")}{ext}'
    return default_storage.save(filename, uploaded_file)


def _is_pdf_upload(uploaded_file):
    file_name = str(getattr(uploaded_file, 'name', '') or '').lower()
    content_type = str(getattr(uploaded_file, 'content_type', '') or '').lower()
    return file_name.endswith('.pdf') or content_type == 'application/pdf'


def _safe_related(obj, relation_name):
    try:
        return getattr(obj, relation_name)
    except ObjectDoesNotExist:
        return None
    except Exception:
        return None


def _decision_risk_level(score):
    score = int(score or 0)
    if score >= 70:
        return 'critical'
    if score >= 50:
        return 'high'
    if score >= 25:
        return 'medium'
    return 'low'


def _normalized_text(value):
    return ' '.join(str(value or '').strip().lower().split())


def get_order_return_state(order, now=None):
    current_time = now or timezone.now()
    existing_return = _safe_related(order, 'return_data')
    deadline = order.completed_at + RETURN_WINDOW if order.completed_at else None
    expired = bool(deadline and current_time > deadline)
    eligible = (
        order.status == 'selesai'
        and order.completed_at is not None
        and not expired
        and existing_return is None
    )
    return {
        'eligible': eligible,
        'has_return': existing_return is not None,
        'expired': expired,
        'deadline_at': deadline.isoformat() if deadline else '',
        'return_code': existing_return.return_code if existing_return else '',
        'return_status': existing_return.status if existing_return else '',
        'return_status_label': RETURN_STATUS_LABELS.get(existing_return.status, existing_return.status)
        if existing_return else '',
        'decision_reason': existing_return.decision_reason if existing_return else '',
    }


def _trusted_device_for_return(user, trust_token):
    token = str(trust_token or '').strip()
    if not token:
        return None
    return (
        TrustedDevice.objects
        .filter(user=user, token=token, is_active=True, expires_at__gt=timezone.now())
        .first()
    )


def _trusted_device_status_for_return(user, trusted_device):
    if trusted_device is None:
        return 'not_registered'

    order_same_device_count = OrderMonitoring.objects.filter(
        order__user=user,
        trusted_device=trusted_device,
    ).count()
    return_same_device_count = ReturnMonitoring.objects.filter(
        return_entry__user=user,
        trusted_device=trusted_device,
    ).count()
    same_device_count = order_same_device_count + return_same_device_count
    if same_device_count == 0 and timezone.now() - trusted_device.created_at <= DEVICE_NEW_WINDOW:
        return 'new_trusted'

    device_counts = Counter()
    for device_id in (
        OrderMonitoring.objects
        .filter(order__user=user, trusted_device__isnull=False)
        .values_list('trusted_device_id', flat=True)
    ):
        device_counts[device_id] += 1
    for device_id in (
        ReturnMonitoring.objects
        .filter(return_entry__user=user, trusted_device__isnull=False)
        .values_list('trusted_device_id', flat=True)
    ):
        device_counts[device_id] += 1

    top_device_id = ''
    if device_counts:
        top_device_id = sorted(device_counts.items(), key=lambda row: (-row[1], row[0]))[0][0]
    if top_device_id == trusted_device.id and same_device_count >= 2:
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


def _same_device_as_order(order, trusted_device, current_device_label):
    order_monitoring = _safe_related(order, 'monitoring')
    order_device_label = order_monitoring.device_label_snapshot if order_monitoring else ''
    if order_monitoring and order_monitoring.trusted_device_id and trusted_device is not None:
        same_device = order_monitoring.trusted_device_id == trusted_device.id
    else:
        same_device = bool(order_device_label) and order_device_label == current_device_label
    return same_device, order_device_label


def _device_mismatch_score(same_device_as_order, trusted_device_status):
    if same_device_as_order:
        return 0
    if trusted_device_status in ('new_trusted', 'not_registered'):
        return 20
    return 10


def _hijack_risk_score(device_risk_score, failed_password_score, failed_otp_score, device_mismatch_score):
    return min(100, device_risk_score + failed_password_score + failed_otp_score + device_mismatch_score)


def _same_exchange_address_as_order(order, exchange_address):
    if exchange_address is None:
        return False

    comparison_pairs = [
        (order.recipient_name, exchange_address.recipient_name),
        (order.recipient_phone, exchange_address.phone),
        (order.address_line, exchange_address.address_line),
        (order.city, exchange_address.city),
        (order.province, exchange_address.province),
        (order.postal_code, exchange_address.postal_code),
    ]
    return all(_normalized_text(left) == _normalized_text(right) for left, right in comparison_pairs)


def _exchange_address_age_minutes(exchange_address, current_time):
    if exchange_address is None or exchange_address.created_at is None:
        return 0
    delta = current_time - exchange_address.created_at
    return max(0, int(delta.total_seconds() // 60))


def _exchange_new_address_score(exchange_address_age_minutes):
    if exchange_address_age_minutes <= ADDRESS_FRESH_WINDOW_MINUTES:
        return 12
    if exchange_address_age_minutes <= ADDRESS_RECENT_WINDOW_MINUTES:
        return 6
    return 0


def _exchange_address_mismatch_score(exchange_address_same_as_order):
    return 0 if exchange_address_same_as_order else 8


def _exchange_address_risk_score(exchange_new_address_score, exchange_address_mismatch_score):
    return min(100, exchange_new_address_score + exchange_address_mismatch_score)


def _account_age_days(user, current_time):
    if not user or not user.created_at:
        return 0
    delta = current_time - user.created_at
    return max(0, int(delta.total_seconds() // 86400))


def _recent_returns_count(user, current_time, days):
    window_start = current_time - timedelta(days=days)
    return Return.objects.filter(user=user, created_at__gte=window_start).count()


def _frequent_return_score(recent_returns_30d_count, recent_returns_90d_count):
    if recent_returns_30d_count >= 3 or recent_returns_90d_count >= 5:
        return 22
    if recent_returns_30d_count >= 2 or recent_returns_90d_count >= 3:
        return 14
    if recent_returns_30d_count >= 1 or recent_returns_90d_count >= 2:
        return 8
    return 0


def _return_after_completion_minutes(order, current_time):
    if order.completed_at is None:
        return 0
    delta = current_time - order.completed_at
    return max(0, int(delta.total_seconds() // 60))


def _rapid_return_score(return_after_completion_minutes):
    if return_after_completion_minutes <= 30:
        return 18
    if return_after_completion_minutes <= 180:
        return 12
    if return_after_completion_minutes <= 24 * 60:
        return 6
    return 0


def _new_account_return_score(account_age_days, recent_returns_90d_count):
    if account_age_days <= 7 and recent_returns_90d_count >= 2:
        return 16
    if account_age_days <= 30 and recent_returns_90d_count >= 2:
        return 8
    return 0


def _return_abuse_score(frequent_return_score, rapid_return_score, new_account_return_score):
    return min(100, frequent_return_score + rapid_return_score + new_account_return_score)


def _total_risk_score(*risk_scores):
    normalized_scores = sorted(
        (max(0, int(score or 0)) for score in risk_scores),
        reverse=True,
    )
    if not normalized_scores:
        return 0

    dominant_risk = normalized_scores[0]
    supporting_risk = sum(
        int(round(score * TOTAL_RISK_SUPPORTING_WEIGHT))
        for score in normalized_scores[1:]
    )
    return min(100, dominant_risk + supporting_risk)


def _serialize_return_monitoring(monitoring):
    return {
        'device': {
            'login_id': monitoring.login_id,
            'trusted_device_id': monitoring.trusted_device_id,
            'device_label_snapshot': monitoring.device_label_snapshot,
            'trusted_device_status': monitoring.trusted_device_status,
            'trusted_device_status_label': TRUSTED_DEVICE_STATUS_LABELS.get(
                monitoring.trusted_device_status,
                monitoring.trusted_device_status,
            ),
            'device_risk_score': monitoring.device_risk_score,
            'order_device_label_snapshot': monitoring.order_device_label_snapshot,
            'same_device_as_order': monitoring.same_device_as_order,
            'device_mismatch_score': monitoring.device_mismatch_score,
            'trusted_device_created_at_snapshot': (
                monitoring.trusted_device_created_at_snapshot.isoformat()
                if monitoring.trusted_device_created_at_snapshot else ''
            ),
        },
        'password': {
            'failed_password_count': monitoring.failed_password_count,
            'failed_password_score': monitoring.failed_password_score,
        },
        'otp': {
            'failed_otp_count': monitoring.failed_otp_count,
            'failed_otp_score': monitoring.failed_otp_score,
        },
        'address': {
            'exchange_address_same_as_order': monitoring.exchange_address_same_as_order,
            'exchange_address_age_minutes': monitoring.exchange_address_age_minutes,
            'exchange_new_address_score': monitoring.exchange_new_address_score,
            'exchange_address_mismatch_score': monitoring.exchange_address_mismatch_score,
            'exchange_address_risk_score': monitoring.exchange_address_risk_score,
        },
        'behavior': {
            'account_age_days': monitoring.account_age_days,
            'recent_returns_30d_count': monitoring.recent_returns_30d_count,
            'recent_returns_90d_count': monitoring.recent_returns_90d_count,
            'frequent_return_score': monitoring.frequent_return_score,
            'return_after_completion_minutes': monitoring.return_after_completion_minutes,
            'rapid_return_score': monitoring.rapid_return_score,
            'new_account_return_score': monitoring.new_account_return_score,
            'return_abuse_score': monitoring.return_abuse_score,
        },
        'summary': {
            'hijack_risk_score': monitoring.hijack_risk_score,
            'return_abuse_score': monitoring.return_abuse_score,
            'address_risk_score': monitoring.exchange_address_risk_score,
            'total_risk_score': monitoring.total_risk_score,
            'risk_level': _decision_risk_level(monitoring.total_risk_score),
        },
    }


def _serialize_return_ereceipt_verification(verification):
    if verification is None:
        return {
            'status': '',
            'is_valid': False,
            'failure_reason': '',
            'pdf_order_code': '',
            'receipt_id': '',
            'customer_name': '',
            'customer_email': '',
            'total': 0,
            'generated_at': '',
            'file_name': '',
            'verified_by_name': '',
            'verified_at': '',
        }

    return {
        'status': verification.status,
        'is_valid': verification.status == 'valid',
        'failure_reason': verification.failure_reason,
        'pdf_order_code': verification.pdf_order_code,
        'receipt_id': verification.receipt_id,
        'customer_name': verification.customer_name,
        'customer_email': verification.customer_email,
        'total': verification.total,
        'generated_at': verification.generated_at.isoformat() if verification.generated_at else '',
        'file_name': verification.file_name,
        'verified_by_name': verification.verified_by.name if verification.verified_by else '',
        'verified_at': verification.verified_at.isoformat() if verification.verified_at else '',
    }


def serialize_return_payload(return_entry, include_monitoring=False):
    monitoring = _safe_related(return_entry, 'monitoring')
    ereceipt_verification = _safe_related(return_entry, 'ereceipt_verification')
    total_requested_quantity = sum(int(item.quantity or 0) for item in return_entry.items.all())
    total_requested_amount = sum(int(item.subtotal or 0) for item in return_entry.items.all())
    payload = {
        'return_code': return_entry.return_code,
        'order_code': return_entry.order.order_code if return_entry.order else '',
        'status': return_entry.status,
        'status_label': RETURN_STATUS_LABELS.get(return_entry.status, return_entry.status),
        'reason': return_entry.reason,
        'product_photo': return_entry.product_photo,
        'ereceipt_proof': return_entry.ereceipt_proof,
        'resolution_type': return_entry.resolution_type,
        'resolution_type_label': RESOLUTION_TYPE_LABELS.get(
            return_entry.resolution_type,
            return_entry.resolution_type,
        ),
        'refund_info': {
            'bank_name': return_entry.bank_name,
            'account_number': return_entry.account_number,
            'account_holder_name': return_entry.account_holder_name,
        },
        'exchange_info': {
            'address_id': return_entry.exchange_address_id,
            'courier_name': return_entry.exchange_courier_name,
            'address_label': return_entry.exchange_address_label,
            'recipient_name': return_entry.exchange_recipient_name,
            'phone': return_entry.exchange_phone,
            'address_line': return_entry.exchange_address_line,
            'city': return_entry.exchange_city,
            'province': return_entry.exchange_province,
            'postal_code': return_entry.exchange_postal_code,
            'notes': return_entry.exchange_address_notes,
        },
        'decision_reason': return_entry.decision_reason,
        'otp_verified_for_action': return_entry.otp_verified_for_action,
        'return_destination': RETURN_DESTINATION,
        'return_shipment': {
            'courier_name': return_entry.return_courier_name,
            'tracking_number': return_entry.return_tracking_number,
            'shipped_back_at': return_entry.shipped_back_at.isoformat() if return_entry.shipped_back_at else '',
        },
        'received_by_name': return_entry.received_by.name if return_entry.received_by else '',
        'received_at': return_entry.received_at.isoformat() if return_entry.received_at else '',
        'completion': {
            'refund_proof': return_entry.refund_proof,
            'exchange_shipment_tracking': return_entry.exchange_shipment_tracking,
            'completed_by_name': return_entry.completed_by.name if return_entry.completed_by else '',
            'completed_at': return_entry.completed_at.isoformat() if return_entry.completed_at else '',
        },
        'processed_at': return_entry.processed_at.isoformat() if return_entry.processed_at else '',
        'processed_by_name': return_entry.processed_by.name if return_entry.processed_by else '',
        'created_at': return_entry.created_at.isoformat() if return_entry.created_at else '',
        'updated_at': return_entry.updated_at.isoformat() if return_entry.updated_at else '',
        'customer_name': return_entry.user.name if return_entry.user else '',
        'customer_email': return_entry.user.email if return_entry.user else '',
        'total_requested_quantity': total_requested_quantity,
        'total_requested_amount': total_requested_amount,
        'risk_level': _decision_risk_level(monitoring.total_risk_score) if monitoring else 'low',
        'total_risk_score': monitoring.total_risk_score if monitoring else 0,
        'ereceipt_verification': _serialize_return_ereceipt_verification(ereceipt_verification),
        'items': [{
            'id': item.id,
            'order_item_id': item.order_item_id,
            'product_id': item.product_id,
            'product_name': item.product_name,
            'product_price': item.product_price,
            'ordered_quantity': item.ordered_quantity,
            'quantity': item.quantity,
            'subtotal': item.subtotal,
        } for item in return_entry.items.all().order_by('id')],
    }
    if include_monitoring:
        payload['monitoring'] = _serialize_return_monitoring(monitoring) if monitoring else None
    return payload


def _validate_return_items(order, raw_items):
    if not isinstance(raw_items, list) or not raw_items:
        return None, 'Pilih minimal satu produk untuk diretur.'

    order_items = {item.id: item for item in order.items.all().order_by('id')}
    selected_items = []
    seen_ids = set()

    for row in raw_items:
        if not isinstance(row, dict):
            return None, 'Format item retur tidak valid.'
        try:
            order_item_id = int(row.get('order_item_id') or 0)
            quantity = int(row.get('quantity') or 0)
        except (TypeError, ValueError):
            return None, 'Jumlah retur harus berupa angka.'

        if order_item_id in seen_ids:
            return None, 'Produk retur tidak boleh dobel.'
        seen_ids.add(order_item_id)

        order_item = order_items.get(order_item_id)
        if order_item is None:
            return None, 'Ada item retur yang tidak cocok dengan order.'
        if quantity <= 0:
            return None, 'Jumlah retur harus lebih dari 0.'
        if quantity > int(order_item.quantity or 0):
            return None, f'Jumlah retur untuk {order_item.product_name} melebihi jumlah pembelian.'

        selected_items.append({
            'order_item': order_item,
            'quantity': quantity,
        })

    return selected_items, ''


def _snapshot_exchange_address(exchange_address):
    return {
        'exchange_address_label': exchange_address.label,
        'exchange_recipient_name': exchange_address.recipient_name,
        'exchange_phone': exchange_address.phone,
        'exchange_address_line': exchange_address.address_line,
        'exchange_city': exchange_address.city,
        'exchange_province': exchange_address.province,
        'exchange_postal_code': exchange_address.postal_code,
        'exchange_address_notes': exchange_address.notes,
    }


def _validate_return_resolution(user, request_data):
    resolution_type = str(request_data.get('resolution_type') or '').strip()
    if resolution_type not in RESOLUTION_TYPE_LABELS:
        return None, 'Tipe penyelesaian retur wajib dipilih.'

    if resolution_type == 'refund':
        bank_name = str(request_data.get('bank_name') or '').strip()
        account_number = str(request_data.get('account_number') or '').strip()
        account_holder_name = str(request_data.get('account_holder_name') or '').strip()
        if not bank_name:
            return None, 'Nama bank wajib diisi untuk refund.'
        if not account_number:
            return None, 'Nomor rekening wajib diisi untuk refund.'
        if not account_holder_name:
            return None, 'Nama pemilik rekening wajib diisi untuk refund.'

        return {
            'resolution_type': 'refund',
            'bank_name': bank_name,
            'account_number': account_number,
            'account_holder_name': account_holder_name,
            'exchange_address': None,
            'exchange_courier_name': '',
            'exchange_address_label': '',
            'exchange_recipient_name': '',
            'exchange_phone': '',
            'exchange_address_line': '',
            'exchange_city': '',
            'exchange_province': '',
            'exchange_postal_code': '',
            'exchange_address_notes': '',
        }, ''

    courier_id = str(request_data.get('exchange_courier_id') or '').strip()
    courier = EXCHANGE_COURIER_OPTIONS.get(courier_id)
    if courier is None:
        return None, 'Kurir exchange wajib dipilih.'

    exchange_address = Address.objects.filter(
        id=request_data.get('exchange_address_id'),
        user=user,
    ).first()
    if exchange_address is None:
        return None, 'Alamat exchange wajib dipilih.'

    return {
        'resolution_type': 'exchange',
        'bank_name': '',
        'account_number': '',
        'account_holder_name': '',
        'exchange_address': exchange_address,
        'exchange_courier_name': courier['name'],
        **_snapshot_exchange_address(exchange_address),
    }, ''


def _create_return_monitoring(
    order,
    return_entry,
    user,
    request,
    login_id,
    trust_token,
    current_time,
    exchange_address=None,
):
    trusted_device = _trusted_device_for_return(user, trust_token)
    trusted_device_status = _trusted_device_status_for_return(user, trusted_device)
    current_device_label = trusted_device.device_label if trusted_device else device_label(request)
    device_risk_score = _device_risk_score_for_status(trusted_device_status)
    failed_password_count = _failed_password_count_for_login(user, login_id)
    failed_password_score = _failed_password_score_for_count(failed_password_count)
    failed_otp_count = _failed_otp_count_for_login(user, login_id)
    failed_otp_score = _failed_otp_score_for_count(failed_otp_count)
    same_device_as_order, order_device_label_snapshot = _same_device_as_order(
        order,
        trusted_device,
        current_device_label,
    )
    device_mismatch_score = _device_mismatch_score(same_device_as_order, trusted_device_status)
    hijack_risk_score = _hijack_risk_score(
        device_risk_score,
        failed_password_score,
        failed_otp_score,
        device_mismatch_score,
    )

    exchange_address_same_as_order = False
    exchange_address_age_minutes = 0
    exchange_new_address_score = 0
    exchange_address_mismatch_score = 0
    exchange_address_risk_score = 0
    if return_entry.resolution_type == 'exchange' and exchange_address is not None:
        exchange_address_same_as_order = _same_exchange_address_as_order(order, exchange_address)
        exchange_address_age_minutes = _exchange_address_age_minutes(exchange_address, current_time)
        exchange_new_address_score = _exchange_new_address_score(exchange_address_age_minutes)
        exchange_address_mismatch_score = _exchange_address_mismatch_score(exchange_address_same_as_order)
        exchange_address_risk_score = _exchange_address_risk_score(
            exchange_new_address_score,
            exchange_address_mismatch_score,
        )

    account_age_days = _account_age_days(user, current_time)
    recent_returns_30d_count = _recent_returns_count(user, current_time, 30)
    recent_returns_90d_count = _recent_returns_count(user, current_time, 90)
    frequent_return_score = _frequent_return_score(recent_returns_30d_count, recent_returns_90d_count)
    return_after_completion_minutes = _return_after_completion_minutes(order, current_time)
    rapid_return_score = _rapid_return_score(return_after_completion_minutes)
    new_account_return_score = _new_account_return_score(account_age_days, recent_returns_90d_count)
    return_abuse_score = _return_abuse_score(
        frequent_return_score,
        rapid_return_score,
        new_account_return_score,
    )
    total_risk_score = _total_risk_score(
        hijack_risk_score,
        return_abuse_score,
        exchange_address_risk_score,
    )

    ReturnMonitoring.objects.create(
        return_entry=return_entry,
        login_id=login_id,
        trusted_device=trusted_device,
        device_label_snapshot=current_device_label,
        trusted_device_status=trusted_device_status,
        device_risk_score=device_risk_score,
        failed_password_count=failed_password_count,
        failed_password_score=failed_password_score,
        failed_otp_count=failed_otp_count,
        failed_otp_score=failed_otp_score,
        order_device_label_snapshot=order_device_label_snapshot,
        same_device_as_order=same_device_as_order,
        device_mismatch_score=device_mismatch_score,
        hijack_risk_score=hijack_risk_score,
        exchange_address_same_as_order=exchange_address_same_as_order,
        exchange_address_age_minutes=exchange_address_age_minutes,
        exchange_new_address_score=exchange_new_address_score,
        exchange_address_mismatch_score=exchange_address_mismatch_score,
        exchange_address_risk_score=exchange_address_risk_score,
        account_age_days=account_age_days,
        recent_returns_30d_count=recent_returns_30d_count,
        recent_returns_90d_count=recent_returns_90d_count,
        frequent_return_score=frequent_return_score,
        return_after_completion_minutes=return_after_completion_minutes,
        rapid_return_score=rapid_return_score,
        new_account_return_score=new_account_return_score,
        return_abuse_score=return_abuse_score,
        total_risk_score=total_risk_score,
        trusted_device_created_at_snapshot=trusted_device.created_at if trusted_device else None,
    )


@api_view(['GET'])
def list_returns(request):
    user = get_customer_profile_user(request.GET.get('user_id'))
    if user is None:
        return Response({'error': 'User customer tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)

    items = _return_queryset().filter(user=user).order_by('-created_at', '-id')
    return Response(
        [serialize_return_payload(item, include_monitoring=False) for item in items],
        status=http_status.HTTP_200_OK,
    )


@api_view(['GET'])
def detail_return(request):
    user = get_customer_profile_user(request.GET.get('user_id'))
    if user is None:
        return Response({'error': 'User customer tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)

    return_code = str(request.GET.get('return_code') or '').strip()
    if not return_code:
        return Response({'error': 'return_code wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)

    return_entry = _return_queryset().filter(user=user, return_code=return_code).first()
    if return_entry is None:
        return Response({'error': 'Data retur tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)

    return Response(serialize_return_payload(return_entry, include_monitoring=True), status=http_status.HTTP_200_OK)


@api_view(['POST'])
def create_return(request):
    user = get_customer_profile_user(request.data.get('user_id'))
    if user is None:
        return Response({'error': 'User customer tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)

    order_code = str(request.data.get('order_code') or '').strip()
    if not order_code:
        return Response({'error': 'order_code wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)

    order = (
        Order.objects
        .select_related('user', 'monitoring')
        .prefetch_related('items')
        .filter(user=user, order_code=order_code)
        .first()
    )
    if order is None:
        return Response({'error': 'Pesanan tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)

    return_state = get_order_return_state(order)
    if not return_state['eligible']:
        error_message = 'Pesanan ini sudah tidak bisa diajukan retur.'
        if return_state['has_return']:
            error_message = 'Pesanan ini sudah pernah diajukan retur.'
        elif return_state['expired']:
            error_message = 'Batas 2 hari pengajuan retur untuk pesanan ini sudah lewat.'
        return Response({
            'error': error_message,
            'return_info': return_state,
        }, status=http_status.HTTP_400_BAD_REQUEST)

    reason = str(request.data.get('reason') or '').strip()
    if not reason:
        return Response({'error': 'Alasan retur wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)

    product_photo = request.FILES.get('product_photo')
    if product_photo is None:
        return Response({'error': 'Foto produk wajib diupload.'}, status=http_status.HTTP_400_BAD_REQUEST)

    ereceipt_proof = request.FILES.get('ereceipt_proof')
    if ereceipt_proof is None:
        return Response({'error': 'E-receipt wajib diupload.'}, status=http_status.HTTP_400_BAD_REQUEST)
    if not _is_pdf_upload(ereceipt_proof):
        return Response(
            {'error': 'E-receipt harus berupa file PDF asli dari sistem.'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    try:
        raw_items = json.loads(request.data.get('items_json') or '[]')
    except json.JSONDecodeError:
        return Response({'error': 'Format item retur tidak valid.'}, status=http_status.HTTP_400_BAD_REQUEST)

    selected_items, item_error = _validate_return_items(order, raw_items)
    if item_error:
        return Response({'error': item_error}, status=http_status.HTTP_400_BAD_REQUEST)

    resolution_data, resolution_error = _validate_return_resolution(user, request.data)
    if resolution_error:
        return Response({'error': resolution_error}, status=http_status.HTTP_400_BAD_REQUEST)

    login_id = str(request.data.get('login_id') or '').strip()
    trust_token = str(request.data.get('trust_token') or '').strip()
    current_time = timezone.now()

    with transaction.atomic():
        return_entry = Return.objects.create(
            user=user,
            order=order,
            login_id=login_id,
            reason=reason,
            product_photo=_save_return_upload(user.id, 'photos', product_photo),
            ereceipt_proof=_save_return_upload(user.id, 'receipts', ereceipt_proof),
            status='waiting_admin_review',
            **resolution_data,
        )
        ReturnItem.objects.bulk_create([
            ReturnItem(
                return_entry=return_entry,
                order_item=item['order_item'],
                product=item['order_item'].product,
                product_name=item['order_item'].product_name,
                product_price=item['order_item'].product_price,
                ordered_quantity=item['order_item'].quantity,
                quantity=item['quantity'],
                subtotal=int(item['order_item'].product_price or 0) * int(item['quantity'] or 0),
            )
            for item in selected_items
        ])
        _create_return_monitoring(
            order,
            return_entry,
            user,
            request,
            login_id,
            trust_token,
            current_time,
            exchange_address=resolution_data.get('exchange_address'),
        )
        ActivityLog.objects.create(
            user=user,
            login_id=login_id,
            email=user.email,
            event_type='return_submit',
            result='sukses',
            reason=return_entry.return_code,
        )

    return_entry = _return_queryset().filter(id=return_entry.id).first() or return_entry
    return Response({
        'message': 'Pengajuan retur berhasil dikirim ke admin.',
        'return_entry': serialize_return_payload(return_entry, include_monitoring=True),
    }, status=http_status.HTTP_201_CREATED)


@api_view(['POST'])
def ship_back_return(request):
    """Customer menandai produk sudah dikirim balik ke toko (input no resi)."""
    user = get_customer_profile_user(request.data.get('user_id'))
    if user is None:
        return Response({'error': 'User customer tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)

    return_code = str(request.data.get('return_code') or '').strip()
    return_courier_name = str(request.data.get('return_courier_name') or '').strip()
    return_tracking_number = str(request.data.get('return_tracking_number') or '').strip()

    if not return_code:
        return Response({'error': 'return_code wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)
    if not return_tracking_number:
        return Response({'error': 'Nomor resi pengiriman balik wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)

    return_entry = _return_queryset().filter(user=user, return_code=return_code).first()
    if return_entry is None:
        return Response({'error': 'Data retur tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)
    if return_entry.status != 'approved':
        return Response({
            'error': 'Hanya retur yang sudah disetujui yang bisa dikirim balik.',
            'return_entry': serialize_return_payload(return_entry, include_monitoring=False),
        }, status=http_status.HTTP_400_BAD_REQUEST)

    return_entry.status = 'shipped_back'
    return_entry.return_courier_name = return_courier_name
    return_entry.return_tracking_number = return_tracking_number
    return_entry.shipped_back_at = timezone.now()
    return_entry.save(update_fields=[
        'status',
        'return_courier_name',
        'return_tracking_number',
        'shipped_back_at',
        'updated_at',
    ])
    ActivityLog.objects.create(
        user=user,
        login_id=return_entry.return_code,
        email=user.email,
        event_type='return_shipped_back',
        result='sukses',
        reason=return_tracking_number,
    )

    return_entry = _return_queryset().filter(id=return_entry.id).first() or return_entry
    return Response({
        'message': 'Terima kasih! Status retur diperbarui jadi "Produk Dikirim Balik".',
        'return_entry': serialize_return_payload(return_entry, include_monitoring=False),
    }, status=http_status.HTTP_200_OK)
