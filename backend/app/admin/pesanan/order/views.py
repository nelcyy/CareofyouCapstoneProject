"""Backend ADMIN > PESANAN > ORDER."""
import os
import secrets
import uuid
from collections import defaultdict
from datetime import timedelta

from django.core.files.storage import default_storage
from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ....common import OTP_TTL_SECONDS, MAX_OTP_ATTEMPTS, generate_otp, otp_session_state, send_otp_email
from ....models import ActivityLog, AdminOrderActionSession, Order, OtpSession, Product, ProductUnit, User
from ..monitoring.views import get_order_monitoring_payload


class OrderApprovalStockError(Exception):
    """Approval gagal karena stok produk tidak bisa dipenuhi."""

    pass


def _order_queryset():
    return (
        Order.objects
        .select_related('user', 'processed_by', 'shipped_by', 'completed_by', 'e_receipt')
        .prefetch_related('items')
    )


def _decision_risk_level(score):
    score = int(score or 0)
    if score >= 70:
        return 'critical'
    if score >= 50:
        return 'high'
    if score >= 25:
        return 'medium'
    return 'low'


def _action_requires_otp(action, risk_level):
    if action == 'approve':
        return risk_level in ('high', 'critical')
    if action == 'reject':
        return risk_level == 'critical'
    return False


def _order_risk_policy(order):
    monitoring_payload = get_order_monitoring_payload(order) or {}
    summary = monitoring_payload.get('summary') or {}
    risk_score = int(summary.get('total_risk_score') or 0)
    risk_level = _decision_risk_level(risk_score)
    return {
        'monitoring': monitoring_payload,
        'risk_score': risk_score,
        'risk_level': risk_level,
        'approve_requires_otp': _action_requires_otp('approve', risk_level),
        'reject_requires_otp': _action_requires_otp('reject', risk_level),
    }


def _active_order_receipt(order):
    try:
        receipt = order.e_receipt
    except ObjectDoesNotExist:
        return None
    if receipt.is_revoked:
        return None
    return receipt


def _order_allows_ereceipt(order):
    return order.decision == 'approved' or order.status in ('pengemasan', 'pengiriman', 'selesai')


def _schedule_approved_order_receipt(order_id):
    def _generate():
        try:
            from ..ereceipt.views import generate_receipt_for_order_id
            generate_receipt_for_order_id(order_id)
        except Exception:
            return None
        return None

    transaction.on_commit(_generate)


def _save_delivery_proof(order_code, uploaded_file):
    ext = os.path.splitext(uploaded_file.name or '')[1] or '.jpg'
    filename = f'delivery_proofs/{order_code}-{uuid.uuid4().hex}{ext}'
    return default_storage.save(filename, uploaded_file)


def _expected_order_unit_ids(order):
    unit_ids = []
    for item_index, item in enumerate(order.items.all().order_by('id')):
        qty = int(item.quantity or 0)
        for unit_index in range(1, qty + 1):
            unit_ids.append(f'{order.order_code}-ITEM{item_index:02d}-U{unit_index}')
    return unit_ids


def _missing_qr_units_count(order):
    expected_unit_ids = _expected_order_unit_ids(order)
    if not expected_unit_ids:
        return 0

    generated_unit_ids = set(
        ProductUnit.objects
        .filter(order_id=order.order_code, order_item_id__in=expected_unit_ids)
        .values_list('order_item_id', flat=True)
        .distinct()
    )
    return len(expected_unit_ids) - len(generated_unit_ids)


def _detail_order_payload(order):
    risk_policy = _order_risk_policy(order)
    receipt = _active_order_receipt(order)
    missing_qr_units = _missing_qr_units_count(order) if order.status in ('pengemasan', 'pengiriman', 'selesai') else 0
    return {
        'order_code': order.order_code,
        'customer_name': (order.user.name if order.user else '') or order.recipient_name or '',
        'customer_email': order.user.email if order.user else '',
        'status': order.status,
        'decision': order.decision,
        'decision_reason': order.decision_reason,
        'processed_at': order.processed_at.isoformat() if order.processed_at else '',
        'processed_by_id': order.processed_by_id,
        'processed_by_name': order.processed_by.name if order.processed_by else '',
        'otp_verified_for_action': order.otp_verified_for_action,
        'decision_risk_score': order.decision_risk_score,
        'decision_risk_level': order.decision_risk_level,
        'risk_score': risk_policy['risk_score'],
        'risk_level': risk_policy['risk_level'],
        'approve_requires_otp': risk_policy['approve_requires_otp'],
        'reject_requires_otp': risk_policy['reject_requires_otp'],
        'ereceipt_eligible': _order_allows_ereceipt(order),
        'ereceipt_available': receipt is not None,
        'ereceipt_id': receipt.receipt_id if receipt else '',
        'ereceipt_generated_at': receipt.generated_at.isoformat() if receipt and receipt.generated_at else '',
        'tracking_number': order.tracking_number,
        'shipping_notes': order.shipping_notes,
        'shipped_at': order.shipped_at.isoformat() if order.shipped_at else '',
        'shipped_by_id': order.shipped_by_id,
        'shipped_by_name': order.shipped_by.name if order.shipped_by else '',
        'delivery_proof': order.delivery_proof,
        'completed_at': order.completed_at.isoformat() if order.completed_at else '',
        'completed_by_id': order.completed_by_id,
        'completed_by_name': order.completed_by.name if order.completed_by else '',
        'missing_qr_units_count': missing_qr_units,
        'created_at': order.created_at.isoformat() if order.created_at else '',
        'recipient_name': order.recipient_name,
        'recipient_phone': order.recipient_phone,
        'address_label': order.address_label,
        'address_line': order.address_line,
        'city': order.city,
        'province': order.province,
        'postal_code': order.postal_code,
        'address_notes': order.address_notes,
        'courier_name': order.courier_name,
        'shipping_fee': order.shipping_fee,
        'payment_method': order.payment_method,
        'payment_target': order.payment_target,
        'payment_proof': order.payment_proof,
        'subtotal': order.subtotal,
        'grand_total': order.grand_total,
        'monitoring': risk_policy['monitoring'],
        'items': [{
            'id': item.id,
            'product_id': item.product_id,
            'product_name': item.product_name,
            'product_price': item.product_price,
            'quantity': item.quantity,
            'subtotal': item.subtotal,
        } for item in order.items.all().order_by('id')],
    }


def _action_session_payload(action_session, otp_state=None):
    return {
        'otp_required': action_session.otp_required,
        'action_session_id': action_session.session_id,
        'action': action_session.action,
        'order_code': action_session.order.order_code,
        'decision_reason': action_session.decision_reason,
        'risk_score': action_session.decision_risk_score,
        'risk_level': action_session.decision_risk_level,
        'otp': otp_state,
    }


def _get_admin_user(admin_user_id):
    if not admin_user_id:
        return None
    return User.objects.filter(id=admin_user_id, role='admin').first()


def _get_order(order_code):
    if not order_code:
        return None
    return _order_queryset().filter(order_code=order_code).first()


def _get_action_session(session_id, admin_user, action):
    if not session_id or admin_user is None:
        return None
    return (
        AdminOrderActionSession.objects
        .select_related('admin_user', 'order__user', 'order__processed_by')
        .prefetch_related('order__items')
        .filter(session_id=session_id, admin_user=admin_user, action=action, is_completed=False)
        .order_by('-created_at', '-id')
        .first()
    )


def _latest_pending_action_session(order, admin_user, action):
    return (
        AdminOrderActionSession.objects
        .select_related('admin_user', 'order__user', 'order__processed_by')
        .prefetch_related('order__items')
        .filter(order=order, admin_user=admin_user, action=action, is_completed=False)
        .order_by('-created_at', '-id')
        .first()
    )


def _latest_admin_action_otp_session(admin_user, session_id):
    otp_rows = OtpSession.objects.filter(
        user=admin_user,
        purpose='admin_action',
        login_id=session_id,
        is_used=False,
    )
    return otp_rows.order_by('-created_at', '-id').first()


def _log_admin_activity(admin_user, order, event_type, result='sukses', reason=''):
    ActivityLog.objects.create(
        user=admin_user,
        login_id=order.order_code,
        email=admin_user.email,
        event_type=event_type,
        result=result,
        reason=reason,
    )


def _close_other_pending_sessions(order, admin_user, keep_session_id=''):
    sessions = list(
        AdminOrderActionSession.objects
        .filter(order=order, admin_user=admin_user, is_completed=False)
        .exclude(session_id=keep_session_id)
        .values_list('session_id', flat=True)
    )
    if sessions:
        AdminOrderActionSession.objects.filter(session_id__in=sessions).update(
            is_completed=True,
            completed_at=timezone.now(),
        )
        OtpSession.objects.filter(
            user=admin_user,
            purpose='admin_action',
            login_id__in=sessions,
            is_used=False,
        ).update(is_used=True)


def _prepare_action_session(order, admin_user, action, decision_reason, risk_score, risk_level, otp_required):
    action_session = _latest_pending_action_session(order, admin_user, action)
    if action_session is None:
        action_session = AdminOrderActionSession.objects.create(
            session_id=secrets.token_urlsafe(24),
            admin_user=admin_user,
            order=order,
            action=action,
            decision_reason=decision_reason,
            decision_risk_score=risk_score,
            decision_risk_level=risk_level,
            otp_required=otp_required,
            otp_verified=False,
            is_completed=False,
        )
    else:
        action_session.decision_reason = decision_reason
        action_session.decision_risk_score = risk_score
        action_session.decision_risk_level = risk_level
        action_session.otp_required = otp_required
        action_session.otp_verified = False
        action_session.save(update_fields=[
            'decision_reason',
            'decision_risk_score',
            'decision_risk_level',
            'otp_required',
            'otp_verified',
        ])
    _close_other_pending_sessions(order, admin_user, keep_session_id=action_session.session_id)
    return action_session


def _issue_admin_action_otp(action_session):
    existing_otp = _latest_admin_action_otp_session(action_session.admin_user, action_session.session_id)
    existing_state = otp_session_state(existing_otp)
    if existing_otp and not existing_state['resend_allowed']:
        error_message = 'OTP masih aktif. Tunggu countdown selesai untuk kirim ulang OTP.'
        if existing_state['is_locked']:
            error_message = (
                'Batas percobaan OTP habis. '
                'Tunggu countdown selesai untuk kirim ulang OTP.'
            )
        return None, existing_state, error_message

    if existing_otp:
        existing_otp.is_used = True
        existing_otp.save(update_fields=['is_used'])

    code = generate_otp()
    otp_row = OtpSession.objects.create(
        user=action_session.admin_user,
        login_id=action_session.session_id,
        email=action_session.admin_user.email,
        code=code,
        purpose='admin_action',
        expires_at=timezone.now() + timedelta(seconds=OTP_TTL_SECONDS),
    )
    send_otp_email(action_session.admin_user.name, action_session.admin_user.email, code)
    _log_admin_activity(
        action_session.admin_user,
        action_session.order,
        'admin_action_otp_sent',
        'sukses',
        action_session.action,
    )
    return otp_row, otp_session_state(otp_row), ''


def _deduct_order_stock(order):
    required_quantities = defaultdict(int)
    missing_products = []

    for item in order.items.all():
        quantity = max(0, int(item.quantity or 0))
        if quantity <= 0:
            continue
        if not item.product_id:
            missing_products.append(item.product_name or f'Item #{item.id}')
            continue
        required_quantities[item.product_id] += quantity

    if missing_products:
        raise OrderApprovalStockError(
            'Ada produk pada pesanan ini yang sudah tidak tersedia: '
            + ', '.join(missing_products[:3])
            + (', dll.' if len(missing_products) > 3 else '')
        )

    if not required_quantities:
        return

    locked_products = {
        product.id: product
        for product in Product.objects.select_for_update().filter(id__in=required_quantities.keys())
    }
    missing_product_ids = [product_id for product_id in required_quantities if product_id not in locked_products]
    if missing_product_ids:
        raise OrderApprovalStockError(
            'Ada produk pada pesanan ini yang sudah tidak tersedia, jadi pesanan belum bisa di-approve.'
        )

    insufficient_products = []
    for product_id, required_quantity in required_quantities.items():
        product = locked_products[product_id]
        current_stock = int(product.stock or 0)
        if current_stock < required_quantity:
            insufficient_products.append(
                f'{product.name} (stok {current_stock}, butuh {required_quantity})'
            )

    if insufficient_products:
        raise OrderApprovalStockError(
            'Stok produk tidak cukup untuk approve pesanan: '
            + ', '.join(insufficient_products[:3])
            + (', dll.' if len(insufficient_products) > 3 else '')
        )

    for product_id, required_quantity in required_quantities.items():
        product = locked_products[product_id]
        product.stock = int(product.stock or 0) - required_quantity
        product.save(update_fields=['stock'])


def _apply_order_decision(order, admin_user, action, decision_reason, otp_verified, risk_score, risk_level):
    if action == 'approve':
        _deduct_order_stock(order)

    order.status = 'pengemasan' if action == 'approve' else 'rejected'
    order.processed_by = admin_user
    order.processed_at = timezone.now()
    order.decision = 'approved' if action == 'approve' else 'rejected'
    order.decision_reason = decision_reason if action == 'reject' else ''
    order.otp_verified_for_action = otp_verified
    order.decision_risk_score = risk_score
    order.decision_risk_level = risk_level
    order.save(update_fields=[
        'status',
        'processed_by',
        'processed_at',
        'decision',
        'decision_reason',
        'otp_verified_for_action',
        'decision_risk_score',
        'decision_risk_level',
        'updated_at',
    ])
    _log_admin_activity(
        admin_user,
        order,
        f'admin_order_{action}',
        'sukses',
        risk_level,
    )
    if action == 'approve':
        _schedule_approved_order_receipt(order.id)


def _ship_order(order, admin_user, tracking_number, shipping_notes):
    order.status = 'pengiriman'
    order.tracking_number = tracking_number
    order.shipping_notes = shipping_notes
    order.shipped_by = admin_user
    order.shipped_at = timezone.now()
    order.save(update_fields=[
        'status',
        'tracking_number',
        'shipping_notes',
        'shipped_by',
        'shipped_at',
        'updated_at',
    ])
    _log_admin_activity(admin_user, order, 'admin_order_ship', 'sukses', tracking_number)


def _complete_order(order, admin_user, delivery_proof_path):
    order.status = 'selesai'
    order.delivery_proof = delivery_proof_path
    order.completed_by = admin_user
    order.completed_at = timezone.now()
    order.save(update_fields=[
        'status',
        'delivery_proof',
        'completed_by',
        'completed_at',
        'updated_at',
    ])
    _log_admin_activity(admin_user, order, 'admin_order_complete', 'sukses', delivery_proof_path)


def _complete_action_session(action_session, otp_verified):
    action_session.otp_verified = otp_verified
    action_session.is_completed = True
    action_session.completed_at = timezone.now()
    action_session.save(update_fields=['otp_verified', 'is_completed', 'completed_at'])


def _request_admin_order_action(request, action):
    order_code = (request.data.get('order_code') or '').strip()
    admin_user_id = request.data.get('admin_user_id')
    decision_reason = str(request.data.get('decision_reason') or '').strip()

    if not order_code:
        return Response({'error': 'order_code wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)
    if not admin_user_id:
        return Response({'error': 'admin_user_id wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)
    if action == 'reject' and not decision_reason:
        return Response({'error': 'Alasan reject wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)

    admin_user = _get_admin_user(admin_user_id)
    if not admin_user:
        return Response({'error': 'Admin tidak valid.'}, status=http_status.HTTP_400_BAD_REQUEST)

    order = _get_order(order_code)
    if not order:
        return Response({'error': 'Pesanan tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)
    if order.status != 'waiting_admin_approval':
        return Response({
            'error': 'Hanya pesanan dengan status waiting_admin_approval yang bisa diproses.',
            'order': _detail_order_payload(order),
        }, status=http_status.HTTP_400_BAD_REQUEST)

    risk_policy = _order_risk_policy(order)
    otp_required = risk_policy[f'{action}_requires_otp']
    action_session = _prepare_action_session(
        order,
        admin_user,
        action,
        decision_reason,
        risk_policy['risk_score'],
        risk_policy['risk_level'],
        otp_required,
    )

    if not otp_required:
        try:
            with transaction.atomic():
                _apply_order_decision(
                    order,
                    admin_user,
                    action,
                    decision_reason,
                    otp_verified=False,
                    risk_score=risk_policy['risk_score'],
                    risk_level=risk_policy['risk_level'],
                )
                _complete_action_session(action_session, otp_verified=False)
        except OrderApprovalStockError as exc:
            order = _get_order(order.order_code) or order
            return Response({
                'error': str(exc),
                'order': _detail_order_payload(order),
            }, status=http_status.HTTP_400_BAD_REQUEST)
        order = _get_order(order.order_code) or order
        return Response({
            'message': (
                'Pesanan berhasil di-approve dan masuk ke pengemasan.'
                if action == 'approve'
                else 'Pesanan berhasil di-reject.'
            ),
            'order': _detail_order_payload(order),
        }, status=http_status.HTTP_200_OK)

    otp_row, otp_state, error_message = _issue_admin_action_otp(action_session)
    if otp_row is None:
        payload = _action_session_payload(action_session, otp_state)
        payload['error'] = error_message
        return Response(payload, status=http_status.HTTP_429_TOO_MANY_REQUESTS)

    payload = _action_session_payload(action_session, otp_state)
    payload['message'] = (
        'OTP dikirim ke email admin untuk approve pesanan.'
        if action == 'approve'
        else 'OTP dikirim ke email admin untuk reject pesanan.'
    )
    return Response(payload, status=http_status.HTTP_200_OK)


def _confirm_admin_order_action(request, action):
    session_id = (request.data.get('action_session_id') or '').strip()
    admin_user_id = request.data.get('admin_user_id')
    otp = (request.data.get('otp') or '').strip()

    if not session_id:
        return Response({'error': 'action_session_id wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)
    if not admin_user_id:
        return Response({'error': 'admin_user_id wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)
    if not otp:
        return Response({'error': 'otp wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)

    admin_user = _get_admin_user(admin_user_id)
    if not admin_user:
        return Response({'error': 'Admin tidak valid.'}, status=http_status.HTTP_400_BAD_REQUEST)

    action_session = _get_action_session(session_id, admin_user, action)
    if action_session is None:
        return Response({'error': 'Session action tidak ditemukan atau sudah selesai.'}, status=http_status.HTTP_400_BAD_REQUEST)

    order = _get_order(action_session.order.order_code)
    if order is None:
        return Response({'error': 'Pesanan tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)
    if order.status != 'waiting_admin_approval':
        return Response({
            'error': 'Pesanan sudah tidak menunggu approval admin.',
            'order': _detail_order_payload(order),
        }, status=http_status.HTTP_400_BAD_REQUEST)

    otp_row = _latest_admin_action_otp_session(admin_user, action_session.session_id)
    if otp_row is None:
        payload = _action_session_payload(action_session, otp_session_state(None))
        payload['error'] = 'OTP tidak ditemukan. Kirim ulang OTP untuk lanjut.'
        return Response(payload, status=http_status.HTTP_400_BAD_REQUEST)

    otp_state = otp_session_state(otp_row)
    if otp_state['is_expired']:
        otp_row.is_used = True
        otp_row.save(update_fields=['is_used'])
        _log_admin_activity(admin_user, order, 'admin_action_otp_failed', 'gagal', 'otp_kadaluarsa')
        payload = _action_session_payload(action_session, otp_session_state(otp_row))
        payload['error'] = 'OTP kadaluarsa. Kirim ulang OTP untuk lanjut.'
        return Response(payload, status=http_status.HTTP_400_BAD_REQUEST)
    if otp_state['is_locked']:
        payload = _action_session_payload(action_session, otp_state)
        payload['error'] = (
            f'Sudah salah {MAX_OTP_ATTEMPTS}x. '
            'Tunggu countdown selesai untuk kirim ulang OTP.'
        )
        return Response(payload, status=http_status.HTTP_400_BAD_REQUEST)
    if otp_row.code != otp:
        otp_row.attempts += 1
        otp_row.save(update_fields=['attempts'])
        _log_admin_activity(admin_user, order, 'admin_action_otp_failed', 'gagal', 'salah_otp')
        otp_state = otp_session_state(otp_row)
        payload = _action_session_payload(action_session, otp_state)
        if otp_state['verify_allowed']:
            payload['error'] = f'Kode OTP salah. Sisa percobaan: {otp_state["attempts_left"]}.'
        else:
            payload['error'] = (
                'Kode OTP salah. Batas percobaan habis. '
                'Tunggu countdown selesai untuk kirim ulang OTP.'
            )
        return Response(payload, status=http_status.HTTP_400_BAD_REQUEST)

    otp_row.is_used = True
    otp_row.save(update_fields=['is_used'])

    try:
        with transaction.atomic():
            _apply_order_decision(
                order,
                admin_user,
                action,
                action_session.decision_reason,
                otp_verified=True,
                risk_score=action_session.decision_risk_score,
                risk_level=action_session.decision_risk_level,
            )
            _complete_action_session(action_session, otp_verified=True)
    except OrderApprovalStockError as exc:
        order = _get_order(order.order_code) or order
        return Response({
            'error': str(exc),
            'order': _detail_order_payload(order),
        }, status=http_status.HTTP_400_BAD_REQUEST)
    order = _get_order(order.order_code) or order

    return Response({
        'message': (
            'Pesanan berhasil di-approve dan masuk ke pengemasan.'
            if action == 'approve'
            else 'Pesanan berhasil di-reject.'
        ),
        'order': _detail_order_payload(order),
    }, status=http_status.HTTP_200_OK)


def _resend_admin_order_action_otp(request, action):
    session_id = (request.data.get('action_session_id') or '').strip()
    admin_user_id = request.data.get('admin_user_id')

    if not session_id:
        return Response({'error': 'action_session_id wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)
    if not admin_user_id:
        return Response({'error': 'admin_user_id wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)

    admin_user = _get_admin_user(admin_user_id)
    if not admin_user:
        return Response({'error': 'Admin tidak valid.'}, status=http_status.HTTP_400_BAD_REQUEST)

    action_session = _get_action_session(session_id, admin_user, action)
    if action_session is None:
        return Response({'error': 'Session action tidak ditemukan atau sudah selesai.'}, status=http_status.HTTP_400_BAD_REQUEST)

    order = _get_order(action_session.order.order_code)
    if order is None:
        return Response({'error': 'Pesanan tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)
    if order.status != 'waiting_admin_approval':
        return Response({
            'error': 'Pesanan sudah tidak menunggu approval admin.',
            'order': _detail_order_payload(order),
        }, status=http_status.HTTP_400_BAD_REQUEST)

    otp_row, otp_state, error_message = _issue_admin_action_otp(action_session)
    if otp_row is None:
        payload = _action_session_payload(action_session, otp_state)
        payload['error'] = error_message
        return Response(payload, status=http_status.HTTP_429_TOO_MANY_REQUESTS)

    payload = _action_session_payload(action_session, otp_state)
    payload['message'] = (
        'OTP approve berhasil dikirim ulang ke email admin.'
        if action == 'approve'
        else 'OTP reject berhasil dikirim ulang ke email admin.'
    )
    return Response(payload, status=http_status.HTTP_200_OK)


@api_view(['GET'])
def list_orders(request):
    """Daftar pesanan sederhana untuk halaman admin."""
    items = _order_queryset().order_by('-created_at', '-id')
    return Response([{
        'customer_name': (it.user.name if it.user else '') or it.recipient_name or '',
        'order_code': it.order_code,
        'grand_total': it.grand_total,
        'status': it.status,
        'decision': it.decision,
        'risk_level': _order_risk_policy(it)['risk_level'],
    } for it in items])


@api_view(['GET'])
def detail_order(request):
    """Detail sederhana satu pesanan untuk halaman admin."""
    order_code = (request.query_params.get('order_code') or '').strip()
    if not order_code:
        return Response({'error': 'order_code wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)

    order = _get_order(order_code)
    if not order:
        return Response({'error': 'Pesanan tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)

    return Response(_detail_order_payload(order))


@api_view(['POST'])
def approve_order(request):
    """Request approve order. Bisa langsung sukses atau minta OTP."""
    return _request_admin_order_action(request, 'approve')


@api_view(['POST'])
def confirm_approve_order(request):
    """Konfirmasi OTP untuk approve order."""
    return _confirm_admin_order_action(request, 'approve')


@api_view(['POST'])
def resend_approve_order_otp(request):
    """Kirim ulang OTP approve order."""
    return _resend_admin_order_action_otp(request, 'approve')


@api_view(['POST'])
def reject_order(request):
    """Request reject order. Alasan wajib diisi dan OTP bisa diperlukan."""
    return _request_admin_order_action(request, 'reject')


@api_view(['POST'])
def confirm_reject_order(request):
    """Konfirmasi OTP untuk reject order."""
    return _confirm_admin_order_action(request, 'reject')


@api_view(['POST'])
def resend_reject_order_otp(request):
    """Kirim ulang OTP reject order."""
    return _resend_admin_order_action_otp(request, 'reject')


@api_view(['POST'])
def ship_order(request):
    """Ubah status pengemasan menjadi pengiriman dengan nomor resi."""
    order_code = str(request.data.get('order_code') or '').strip()
    admin_user_id = request.data.get('admin_user_id')
    tracking_number = str(request.data.get('tracking_number') or '').strip()
    shipping_notes = str(request.data.get('shipping_notes') or '').strip()

    if not order_code:
        return Response({'error': 'order_code wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)
    if not admin_user_id:
        return Response({'error': 'admin_user_id wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)
    if not tracking_number:
        return Response({'error': 'Nomor resi wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)

    admin_user = _get_admin_user(admin_user_id)
    if not admin_user:
        return Response({'error': 'Admin tidak valid.'}, status=http_status.HTTP_400_BAD_REQUEST)

    order = _get_order(order_code)
    if not order:
        return Response({'error': 'Pesanan tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)
    if order.status != 'pengemasan':
        return Response({
            'error': 'Hanya pesanan dengan status pengemasan yang bisa dikirim.',
            'order': _detail_order_payload(order),
        }, status=http_status.HTTP_400_BAD_REQUEST)

    missing_qr_units = _missing_qr_units_count(order)
    if missing_qr_units > 0:
        return Response({
            'error': f'Masih ada {missing_qr_units} QR unit yang belum digenerate. Lengkapi dulu sebelum kirim.',
            'order': _detail_order_payload(order),
        }, status=http_status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        _ship_order(order, admin_user, tracking_number, shipping_notes)
    order = _get_order(order.order_code) or order

    return Response({
        'message': 'Pesanan berhasil dikirim dan status berubah ke pengiriman.',
        'order': _detail_order_payload(order),
    }, status=http_status.HTTP_200_OK)


@api_view(['POST'])
def complete_order(request):
    """Ubah status pengiriman menjadi selesai dengan bukti pengiriman/terkirim."""
    order_code = str(request.data.get('order_code') or '').strip()
    admin_user_id = request.data.get('admin_user_id')
    delivery_proof = request.FILES.get('delivery_proof')

    if not order_code:
        return Response({'error': 'order_code wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)
    if not admin_user_id:
        return Response({'error': 'admin_user_id wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)
    if delivery_proof is None:
        return Response({'error': 'Bukti selesai / terkirim wajib diupload.'}, status=http_status.HTTP_400_BAD_REQUEST)

    admin_user = _get_admin_user(admin_user_id)
    if not admin_user:
        return Response({'error': 'Admin tidak valid.'}, status=http_status.HTTP_400_BAD_REQUEST)

    order = _get_order(order_code)
    if not order:
        return Response({'error': 'Pesanan tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)
    if order.status != 'pengiriman':
        return Response({
            'error': 'Hanya pesanan dengan status pengiriman yang bisa diselesaikan.',
            'order': _detail_order_payload(order),
        }, status=http_status.HTTP_400_BAD_REQUEST)

    proof_path = _save_delivery_proof(order.order_code, delivery_proof)

    with transaction.atomic():
        _complete_order(order, admin_user, proof_path)
    order = _get_order(order.order_code) or order

    return Response({
        'message': 'Pesanan selesai dan bukti pengiriman berhasil disimpan.',
        'order': _detail_order_payload(order),
    }, status=http_status.HTTP_200_OK)
