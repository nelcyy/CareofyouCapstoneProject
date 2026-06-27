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
RETURN_FAST_WINDOW_MINUTES = 2 * 60
RETURN_SAME_DAY_WINDOW_MINUTES = 24 * 60
TOTAL_RISK_SUPPORTING_WEIGHT = 0.45

EXCHANGE_COURIER_OPTIONS = {
    'jne-reg': {'name': 'JNE REG'},
    'jnt-reg': {'name': 'J&T REG'},
    'sicepat-reg': {'name': 'SiCepat REG'},
}
DEVICE_STATUS_SCORES = {
    'same_order_device': 0,
    'different_known_device': 12,
    'different_new_trusted_device': 22,
    'different_unregistered_device': 35,
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
EXCHANGE_ADDRESS_STATUS_SCORES = {
    'same_exchange_address': 0,
    'different_exchange_address': 12,
}
RETURN_TIMING_STATUS_SCORES = {
    'normal_return_timing': 0,
    'same_day_return_timing': 6,
    'fast_return_timing': 18,
}
DEVICE_STATUS_LABELS = {
    'same_order_device': 'Sama dengan Device Order',
    'different_known_device': 'Device Berbeda tapi Dikenal',
    'different_new_trusted_device': 'Device Berbeda dan Trusted Baru',
    'different_unregistered_device': 'Device Berbeda dan Belum Dikenal',
}
PASSWORD_STATUS_LABELS = {
    'clean_password': 'Aman',
    'one_failed_password': '1x Salah Password',
    'two_failed_password': '2x Salah Password',
    'many_failed_password': '3x+ Salah Password',
}
OTP_STATUS_LABELS = {
    'clean_otp': 'Aman',
    'one_failed_otp': '1x Gagal OTP',
    'two_failed_otp': '2x Gagal OTP',
    'many_failed_otp': '3x+ Gagal OTP',
}
EXCHANGE_ADDRESS_STATUS_LABELS = {
    'same_exchange_address': 'Alamat Sama',
    'different_exchange_address': 'Alamat Berbeda',
}
RETURN_TIMING_STATUS_LABELS = {
    'normal_return_timing': 'Normal',
    'same_day_return_timing': 'Hari yang Sama',
    'fast_return_timing': 'Sangat Cepat',
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


def _status_score(status, score_map):
    return int(score_map.get(status, 0))


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


def _same_device_as_order(order, trusted_device, current_device_label):
    order_monitoring = _safe_related(order, 'monitoring')
    order_device_label = order_monitoring.device_label_snapshot if order_monitoring else ''
    if order_monitoring and order_monitoring.trusted_device_id and trusted_device is not None:
        return order_monitoring.trusted_device_id == trusted_device.id
    return bool(order_device_label) and order_device_label == current_device_label


def _device_status_for_return(order, user, trusted_device, current_device_label):
    if _same_device_as_order(order, trusted_device, current_device_label):
        return 'same_order_device'

    trusted_device_status = _trusted_device_status_for_return(user, trusted_device)
    if trusted_device_status in ('usual', 'known_rare'):
        return 'different_known_device'
    if trusted_device_status == 'new_trusted':
        return 'different_new_trusted_device'
    return 'different_unregistered_device'


def _device_score_for_status(status):
    return _status_score(status, DEVICE_STATUS_SCORES)


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


def _exchange_address_status_for_return(return_entry, order, exchange_address):
    if return_entry.resolution_type != 'exchange' or exchange_address is None:
        return ''
    if _same_exchange_address_as_order(order, exchange_address):
        return 'same_exchange_address'
    return 'different_exchange_address'


def _exchange_address_score_for_status(status):
    return _status_score(status, EXCHANGE_ADDRESS_STATUS_SCORES)


def _return_after_completion_minutes(order, current_time):
    if order.completed_at is None:
        return 0
    delta = current_time - order.completed_at
    return max(0, int(delta.total_seconds() // 60))


def _return_timing_status_for_minutes(return_after_completion_minutes):
    if return_after_completion_minutes <= RETURN_FAST_WINDOW_MINUTES:
        return 'fast_return_timing'
    if return_after_completion_minutes <= RETURN_SAME_DAY_WINDOW_MINUTES:
        return 'same_day_return_timing'
    return 'normal_return_timing'


def _return_timing_score_for_status(status):
    return _status_score(status, RETURN_TIMING_STATUS_SCORES)


def _return_monitoring_summary_from_scores(
    device_score,
    password_score,
    otp_score,
    exchange_address_score,
    return_timing_score,
):
    identity_risk_score = min(
        100,
        max(0, int(device_score or 0))
        + max(0, int(password_score or 0))
        + max(0, int(otp_score or 0)),
    )
    return_pattern_score = min(
        100,
        max(0, int(exchange_address_score or 0))
        + max(0, int(return_timing_score or 0)),
    )
    dominant_risk = max(identity_risk_score, return_pattern_score)
    supporting_risk = min(identity_risk_score, return_pattern_score)
    total_risk_score = min(
        100,
        dominant_risk + int(round(supporting_risk * TOTAL_RISK_SUPPORTING_WEIGHT)),
    )
    return {
        'total_risk_score': total_risk_score,
        'risk_level': _decision_risk_level(total_risk_score),
    }


def _serialize_return_monitoring(monitoring):
    return {
        'device': {
            'login_id': monitoring.login_id,
            'trusted_device_id': monitoring.trusted_device_id,
            'device_label_snapshot': monitoring.device_label_snapshot,
            'device_status': monitoring.device_status,
            'device_status_label': DEVICE_STATUS_LABELS.get(
                monitoring.device_status,
                monitoring.device_status,
            ),
            'device_score': monitoring.device_score,
        },
        'password': {
            'password_count': monitoring.password_count,
            'password_status': monitoring.password_status,
            'password_status_label': PASSWORD_STATUS_LABELS.get(
                monitoring.password_status,
                monitoring.password_status,
            ),
            'password_score': monitoring.password_score,
        },
        'otp': {
            'otp_count': monitoring.otp_count,
            'otp_status': monitoring.otp_status,
            'otp_status_label': OTP_STATUS_LABELS.get(
                monitoring.otp_status,
                monitoring.otp_status,
            ),
            'otp_score': monitoring.otp_score,
        },
        'exchange_address': {
            'exchange_address_status': monitoring.exchange_address_status,
            'exchange_address_status_label': EXCHANGE_ADDRESS_STATUS_LABELS.get(
                monitoring.exchange_address_status,
                monitoring.exchange_address_status,
            ),
            'exchange_address_score': monitoring.exchange_address_score,
        },
        'return_timing': {
            'return_timing_status': monitoring.return_timing_status,
            'return_timing_status_label': RETURN_TIMING_STATUS_LABELS.get(
                monitoring.return_timing_status,
                monitoring.return_timing_status,
            ),
            'return_timing_score': monitoring.return_timing_score,
        },
        'summary': {
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
    current_device_label = trusted_device.device_label if trusted_device else device_label(request)
    device_status = _device_status_for_return(
        order,
        user,
        trusted_device,
        current_device_label,
    )
    device_score = _device_score_for_status(device_status)
    password_count = _failed_password_count_for_login(user, login_id)
    password_status = _password_status_for_count(password_count)
    password_score = _password_score_for_status(password_status)
    otp_count = _failed_otp_count_for_login(user, login_id)
    otp_status = _otp_status_for_count(otp_count)
    otp_score = _otp_score_for_status(otp_status)
    exchange_address_status = _exchange_address_status_for_return(
        return_entry,
        order,
        exchange_address,
    )
    exchange_address_score = _exchange_address_score_for_status(exchange_address_status)
    return_after_completion_minutes = _return_after_completion_minutes(order, current_time)
    return_timing_status = _return_timing_status_for_minutes(return_after_completion_minutes)
    return_timing_score = _return_timing_score_for_status(return_timing_status)
    summary = _return_monitoring_summary_from_scores(
        device_score,
        password_score,
        otp_score,
        exchange_address_score,
        return_timing_score,
    )

    ReturnMonitoring.objects.create(
        return_entry=return_entry,
        login_id=login_id,
        trusted_device=trusted_device,
        device_label_snapshot=current_device_label,
        device_status=device_status,
        device_score=device_score,
        password_count=password_count,
        password_status=password_status,
        password_score=password_score,
        otp_count=otp_count,
        otp_status=otp_status,
        otp_score=otp_score,
        exchange_address_status=exchange_address_status,
        exchange_address_score=exchange_address_score,
        return_timing_status=return_timing_status,
        return_timing_score=return_timing_score,
        total_risk_score=summary['total_risk_score'],
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
