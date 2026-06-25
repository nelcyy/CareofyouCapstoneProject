"""Backend ADMIN > RETUR > RETURNS."""
import os
import secrets
from datetime import timedelta

from django.core.files.storage import default_storage
from django.db import transaction
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ....common import OTP_TTL_SECONDS, generate_otp, otp_session_state, send_otp_email
from ....customer.profile.retur.views import (
    _decision_risk_level,
    _return_queryset,
    serialize_return_payload,
)
from ....models import ActivityLog, AdminReturnActionSession, OtpSession, ProductUnit, User


def get_admin_user(admin_user_id):
    if not admin_user_id:
        return None
    return User.objects.filter(id=admin_user_id, role='admin').first()


def get_return_entry(return_code):
    if not return_code:
        return None
    return _return_queryset().filter(return_code=return_code).first()


def return_queryset():
    return _return_queryset()


def log_admin_return_activity(admin_user, return_entry, event_type, reason='', result='sukses'):
    ActivityLog.objects.create(
        user=admin_user,
        login_id=return_entry.return_code,
        email=admin_user.email,
        event_type=event_type,
        result=result,
        reason=reason,
    )


def serialized_return_entry(return_entry, include_monitoring=False):
    return serialize_return_payload(return_entry, include_monitoring=include_monitoring)


def _return_monitoring(return_entry):
    return return_entry.monitoring if hasattr(return_entry, 'monitoring') else None


def _return_ereceipt_verification(return_entry):
    return return_entry.ereceipt_verification if hasattr(return_entry, 'ereceipt_verification') else None


def _action_requires_otp(action, risk_level):
    if action == 'approve':
        return risk_level in ('high', 'critical')
    if action == 'reject':
        return risk_level == 'critical'
    return False


def _return_units_summary(return_entry):
    """Progres unit fisik yang sudah di-scan & approve QR-nya (buat gating 'received')."""
    order_code = return_entry.order.order_code if return_entry.order else ''
    required = sum(int(item.quantity or 0) for item in return_entry.items.all())
    returned = 0
    if order_code:
        returned = ProductUnit.objects.filter(order_id=order_code, is_returned=True).count()
    return {
        'required': required,
        'returned': returned,
        'all_returned': required > 0 and returned >= required,
    }


def _save_refund_proof(return_code, uploaded_file):
    ext = os.path.splitext(uploaded_file.name or '')[1] or '.jpg'
    filename = f'returns/refund_proofs/{return_code}-{secrets.token_hex(8)}{ext}'
    return default_storage.save(filename, uploaded_file)


def _return_risk_policy(return_entry):
    monitoring = _return_monitoring(return_entry)
    risk_score = int(monitoring.total_risk_score or 0) if monitoring else 0
    risk_level = _decision_risk_level(risk_score)
    return {
        'risk_score': risk_score,
        'risk_level': risk_level,
        'approve_requires_otp': _action_requires_otp('approve', risk_level),
        'reject_requires_otp': _action_requires_otp('reject', risk_level),
    }


def _action_session_payload(action_session, otp_state=None):
    return {
        'otp_required': action_session.otp_required,
        'action_session_id': action_session.session_id,
        'action': action_session.action,
        'return_code': action_session.return_entry.return_code,
        'decision_reason': action_session.decision_reason,
        'risk_score': action_session.decision_risk_score,
        'risk_level': action_session.decision_risk_level,
        'otp': otp_state,
    }


def _get_action_session(session_id, admin_user, action):
    if not session_id or admin_user is None:
        return None
    return (
        AdminReturnActionSession.objects
        .select_related('admin_user', 'return_entry')
        .filter(session_id=session_id, admin_user=admin_user, action=action, is_completed=False)
        .order_by('-created_at', '-id')
        .first()
    )


def _latest_pending_action_session(return_entry, admin_user, action):
    return (
        AdminReturnActionSession.objects
        .select_related('admin_user', 'return_entry')
        .filter(return_entry=return_entry, admin_user=admin_user, action=action, is_completed=False)
        .order_by('-created_at', '-id')
        .first()
    )


def _latest_admin_action_otp_session(admin_user, session_id):
    return (
        OtpSession.objects
        .filter(user=admin_user, purpose='admin_action', login_id=session_id, is_used=False)
        .order_by('-created_at', '-id')
        .first()
    )


def _close_other_pending_sessions(return_entry, admin_user, keep_session_id=''):
    sessions = list(
        AdminReturnActionSession.objects
        .filter(return_entry=return_entry, admin_user=admin_user, is_completed=False)
        .exclude(session_id=keep_session_id)
        .values_list('session_id', flat=True)
    )
    if sessions:
        AdminReturnActionSession.objects.filter(session_id__in=sessions).update(
            is_completed=True,
            completed_at=timezone.now(),
        )
        OtpSession.objects.filter(
            user=admin_user,
            purpose='admin_action',
            login_id__in=sessions,
            is_used=False,
        ).update(is_used=True)


def _prepare_action_session(return_entry, admin_user, action, decision_reason, risk_score, risk_level, otp_required):
    action_session = _latest_pending_action_session(return_entry, admin_user, action)
    if action_session is None:
        action_session = AdminReturnActionSession.objects.create(
            session_id=secrets.token_urlsafe(24),
            admin_user=admin_user,
            return_entry=return_entry,
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
    _close_other_pending_sessions(return_entry, admin_user, keep_session_id=action_session.session_id)
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
    log_admin_return_activity(
        action_session.admin_user,
        action_session.return_entry,
        'admin_return_action_otp_sent',
        action_session.action,
    )
    return otp_row, otp_session_state(otp_row), ''


def _complete_action_session(action_session, otp_verified):
    action_session.otp_verified = otp_verified
    action_session.is_completed = True
    action_session.completed_at = timezone.now()
    action_session.save(update_fields=['otp_verified', 'is_completed', 'completed_at'])


def _apply_return_decision(return_entry, admin_user, action, decision_reason, otp_verified):
    return_entry.status = 'approved' if action == 'approve' else 'rejected'
    return_entry.processed_by = admin_user
    return_entry.processed_at = timezone.now()
    return_entry.decision_reason = decision_reason
    return_entry.otp_verified_for_action = otp_verified
    return_entry.save(update_fields=[
        'status',
        'processed_by',
        'processed_at',
        'decision_reason',
        'otp_verified_for_action',
        'updated_at',
    ])
    event_type = 'admin_return_approve' if action == 'approve' else 'admin_return_reject'
    log_admin_return_activity(admin_user, return_entry, event_type, decision_reason)


def _request_admin_return_action(request, action):
    return_code = str(request.data.get('return_code') or '').strip()
    admin_user_id = request.data.get('admin_user_id')
    decision_reason = str(request.data.get('decision_reason') or '').strip()

    if not return_code:
        return Response({'error': 'return_code wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)
    if not admin_user_id:
        return Response({'error': 'admin_user_id wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)
    if action == 'reject' and not decision_reason:
        return Response({'error': 'Alasan reject wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)

    admin_user = get_admin_user(admin_user_id)
    if admin_user is None:
        return Response({'error': 'Admin tidak valid.'}, status=http_status.HTTP_400_BAD_REQUEST)

    return_entry = get_return_entry(return_code)
    if return_entry is None:
        return Response({'error': 'Data retur tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)
    if return_entry.status != 'waiting_admin_review':
        return Response({
            'error': 'Hanya retur dengan status waiting_admin_review yang bisa diproses.',
            'return_entry': serialized_return_entry(return_entry, include_monitoring=True),
        }, status=http_status.HTTP_400_BAD_REQUEST)

    if action == 'approve':
        ereceipt_verification = _return_ereceipt_verification(return_entry)
        if ereceipt_verification is None or not ereceipt_verification.status:
            return Response({
                'error': 'E-receipt harus diverifikasi dulu sebelum retur bisa di-approve.',
                'return_entry': serialized_return_entry(return_entry, include_monitoring=True),
            }, status=http_status.HTTP_400_BAD_REQUEST)

    risk_policy = _return_risk_policy(return_entry)
    otp_required = risk_policy[f'{action}_requires_otp']
    action_session = _prepare_action_session(
        return_entry,
        admin_user,
        action,
        decision_reason,
        risk_policy['risk_score'],
        risk_policy['risk_level'],
        otp_required,
    )

    if not otp_required:
        with transaction.atomic():
            _apply_return_decision(return_entry, admin_user, action, decision_reason, otp_verified=False)
            _complete_action_session(action_session, otp_verified=False)
        return_entry = get_return_entry(return_code) or return_entry
        return Response({
            'message': (
                'Pengajuan retur berhasil di-approve.'
                if action == 'approve'
                else 'Pengajuan retur berhasil di-reject.'
            ),
            'return_entry': serialized_return_entry(return_entry, include_monitoring=True),
        }, status=http_status.HTTP_200_OK)

    otp_row, otp_state, error_message = _issue_admin_action_otp(action_session)
    if otp_row is None:
        payload = _action_session_payload(action_session, otp_state)
        payload['error'] = error_message
        return Response(payload, status=http_status.HTTP_429_TOO_MANY_REQUESTS)

    payload = _action_session_payload(action_session, otp_state)
    payload['message'] = (
        'OTP dikirim ke email admin untuk approve retur.'
        if action == 'approve'
        else 'OTP dikirim ke email admin untuk reject retur.'
    )
    return Response(payload, status=http_status.HTTP_200_OK)


def _confirm_admin_return_action(request, action):
    session_id = (request.data.get('action_session_id') or '').strip()
    admin_user_id = request.data.get('admin_user_id')
    otp = (request.data.get('otp') or '').strip()

    if not session_id:
        return Response({'error': 'action_session_id wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)
    if not admin_user_id:
        return Response({'error': 'admin_user_id wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)
    if not otp:
        return Response({'error': 'otp wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)

    admin_user = get_admin_user(admin_user_id)
    if admin_user is None:
        return Response({'error': 'Admin tidak valid.'}, status=http_status.HTTP_400_BAD_REQUEST)

    action_session = _get_action_session(session_id, admin_user, action)
    if action_session is None:
        return Response({'error': 'Session action tidak ditemukan atau sudah selesai.'}, status=http_status.HTTP_400_BAD_REQUEST)

    return_entry = get_return_entry(action_session.return_entry.return_code)
    if return_entry is None:
        return Response({'error': 'Data retur tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)
    if return_entry.status != 'waiting_admin_review':
        return Response({
            'error': 'Retur sudah tidak menunggu review admin.',
            'return_entry': serialized_return_entry(return_entry, include_monitoring=True),
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
        log_admin_return_activity(admin_user, return_entry, 'admin_return_action_otp_failed', 'otp_kadaluarsa', 'gagal')
        payload = _action_session_payload(action_session, otp_session_state(otp_row))
        payload['error'] = 'OTP kadaluarsa. Kirim ulang OTP untuk lanjut.'
        return Response(payload, status=http_status.HTTP_400_BAD_REQUEST)
    if otp_state['is_locked']:
        payload = _action_session_payload(action_session, otp_state)
        payload['error'] = 'Batas percobaan OTP habis. Tunggu countdown selesai untuk kirim ulang OTP.'
        return Response(payload, status=http_status.HTTP_400_BAD_REQUEST)
    if otp_row.code != otp:
        otp_row.attempts += 1
        otp_row.save(update_fields=['attempts'])
        log_admin_return_activity(admin_user, return_entry, 'admin_return_action_otp_failed', 'salah_otp', 'gagal')
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

    with transaction.atomic():
        _apply_return_decision(
            return_entry,
            admin_user,
            action,
            action_session.decision_reason,
            otp_verified=True,
        )
        _complete_action_session(action_session, otp_verified=True)

    return_entry = get_return_entry(return_entry.return_code) or return_entry
    return Response({
        'message': (
            'Pengajuan retur berhasil di-approve.'
            if action == 'approve'
            else 'Pengajuan retur berhasil di-reject.'
        ),
        'return_entry': serialized_return_entry(return_entry, include_monitoring=True),
    }, status=http_status.HTTP_200_OK)


def _resend_admin_return_action_otp(request, action):
    session_id = (request.data.get('action_session_id') or '').strip()
    admin_user_id = request.data.get('admin_user_id')

    if not session_id:
        return Response({'error': 'action_session_id wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)
    if not admin_user_id:
        return Response({'error': 'admin_user_id wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)

    admin_user = get_admin_user(admin_user_id)
    if admin_user is None:
        return Response({'error': 'Admin tidak valid.'}, status=http_status.HTTP_400_BAD_REQUEST)

    action_session = _get_action_session(session_id, admin_user, action)
    if action_session is None:
        return Response({'error': 'Session action tidak ditemukan atau sudah selesai.'}, status=http_status.HTTP_400_BAD_REQUEST)

    return_entry = get_return_entry(action_session.return_entry.return_code)
    if return_entry is None:
        return Response({'error': 'Data retur tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)
    if return_entry.status != 'waiting_admin_review':
        return Response({
            'error': 'Retur sudah tidak menunggu review admin.',
            'return_entry': serialized_return_entry(return_entry, include_monitoring=True),
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
def list_returns(request):
    items = return_queryset().order_by('-created_at', '-id')
    return Response(
        [serialized_return_entry(item, include_monitoring=False) for item in items],
        status=http_status.HTTP_200_OK,
    )


@api_view(['GET'])
def detail_return(request):
    return_code = str(request.query_params.get('return_code') or '').strip()
    if not return_code:
        return Response({'error': 'return_code wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)

    return_entry = get_return_entry(return_code)
    if return_entry is None:
        return Response({'error': 'Data retur tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)

    payload = serialized_return_entry(return_entry, include_monitoring=True)
    risk_policy = _return_risk_policy(return_entry)
    payload['approve_requires_otp'] = risk_policy['approve_requires_otp']
    payload['reject_requires_otp'] = risk_policy['reject_requires_otp']
    payload['return_units'] = _return_units_summary(return_entry)
    return Response(payload, status=http_status.HTTP_200_OK)


@api_view(['POST'])
def approve_return(request):
    """Request approve retur. Bisa langsung sukses atau minta OTP."""
    return _request_admin_return_action(request, 'approve')


@api_view(['POST'])
def confirm_approve_return(request):
    """Konfirmasi OTP untuk approve retur."""
    return _confirm_admin_return_action(request, 'approve')


@api_view(['POST'])
def resend_approve_return_otp(request):
    """Kirim ulang OTP approve retur."""
    return _resend_admin_return_action_otp(request, 'approve')


@api_view(['POST'])
def reject_return(request):
    """Request reject retur. Alasan wajib diisi dan OTP bisa diperlukan."""
    return _request_admin_return_action(request, 'reject')


@api_view(['POST'])
def confirm_reject_return(request):
    """Konfirmasi OTP untuk reject retur."""
    return _confirm_admin_return_action(request, 'reject')


@api_view(['POST'])
def resend_reject_return_otp(request):
    """Kirim ulang OTP reject retur."""
    return _resend_admin_return_action_otp(request, 'reject')


@api_view(['POST'])
def receive_return(request):
    """Admin tandai produk retur sudah diterima. Wajib semua unit di-scan QR dulu."""
    return_code = str(request.data.get('return_code') or '').strip()
    admin_user_id = request.data.get('admin_user_id')

    if not return_code:
        return Response({'error': 'return_code wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)
    if not admin_user_id:
        return Response({'error': 'admin_user_id wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)

    admin_user = get_admin_user(admin_user_id)
    if admin_user is None:
        return Response({'error': 'Admin tidak valid.'}, status=http_status.HTTP_400_BAD_REQUEST)

    return_entry = get_return_entry(return_code)
    if return_entry is None:
        return Response({'error': 'Data retur tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)
    if return_entry.status != 'shipped_back':
        return Response({
            'error': 'Hanya retur yang sudah dikirim balik yang bisa ditandai diterima.',
            'return_entry': serialized_return_entry(return_entry, include_monitoring=True),
        }, status=http_status.HTTP_400_BAD_REQUEST)

    # Keputusan akhir tetap di admin (konsisten dgn e-receipt): QR yang belum lengkap
    # / ada yang invalid TIDAK memblok, cuma jadi peringatan di UI.
    with transaction.atomic():
        return_entry.status = 'received'
        return_entry.received_by = admin_user
        return_entry.received_at = timezone.now()
        return_entry.save(update_fields=['status', 'received_by', 'received_at', 'updated_at'])
        log_admin_return_activity(admin_user, return_entry, 'admin_return_received')

    return_entry = get_return_entry(return_code) or return_entry
    return Response({
        'message': 'Produk retur ditandai sudah diterima toko.',
        'return_units': _return_units_summary(return_entry),
        'return_entry': serialized_return_entry(return_entry, include_monitoring=True),
    }, status=http_status.HTTP_200_OK)


@api_view(['POST'])
def complete_return(request):
    """Admin menyelesaikan retur. Refund wajib bukti transfer, exchange wajib resi pengganti."""
    return_code = str(request.data.get('return_code') or '').strip()
    admin_user_id = request.data.get('admin_user_id')

    if not return_code:
        return Response({'error': 'return_code wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)
    if not admin_user_id:
        return Response({'error': 'admin_user_id wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)

    admin_user = get_admin_user(admin_user_id)
    if admin_user is None:
        return Response({'error': 'Admin tidak valid.'}, status=http_status.HTTP_400_BAD_REQUEST)

    return_entry = get_return_entry(return_code)
    if return_entry is None:
        return Response({'error': 'Data retur tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)
    if return_entry.status != 'received':
        return Response({
            'error': 'Hanya retur yang sudah diterima toko yang bisa diselesaikan.',
            'return_entry': serialized_return_entry(return_entry, include_monitoring=True),
        }, status=http_status.HTTP_400_BAD_REQUEST)

    if return_entry.resolution_type == 'refund':
        refund_proof = request.FILES.get('refund_proof')
        if refund_proof is None:
            return Response({'error': 'Bukti transfer refund wajib diupload.'}, status=http_status.HTTP_400_BAD_REQUEST)
        return_entry.refund_proof = _save_refund_proof(return_entry.return_code, refund_proof)
    elif return_entry.resolution_type == 'exchange':
        exchange_shipment_tracking = str(request.data.get('exchange_shipment_tracking') or '').strip()
        if not exchange_shipment_tracking:
            return Response(
                {'error': 'Resi pengiriman barang pengganti wajib diisi.'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        return_entry.exchange_shipment_tracking = exchange_shipment_tracking
    else:
        return Response({'error': 'Tipe penyelesaian retur tidak valid.'}, status=http_status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        return_entry.status = 'completed'
        return_entry.completed_by = admin_user
        return_entry.completed_at = timezone.now()
        return_entry.save(update_fields=[
            'status',
            'refund_proof',
            'exchange_shipment_tracking',
            'completed_by',
            'completed_at',
            'updated_at',
        ])
        log_admin_return_activity(admin_user, return_entry, 'admin_return_completed', return_entry.resolution_type)

    return_entry = get_return_entry(return_code) or return_entry
    return Response({
        'message': 'Retur berhasil diselesaikan.',
        'return_entry': serialized_return_entry(return_entry, include_monitoring=True),
    }, status=http_status.HTTP_200_OK)
