"""Backend REGISTRASI."""
from datetime import timedelta

from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ..models import User, OtpSession, ActivityLog
from ..common import (OTP_TTL_SECONDS, MAX_OTP_ATTEMPTS, generate_otp, send_otp_email,
                      create_trusted_device, otp_session_state)


def _latest_register_otp_session(email):
    return (
        OtpSession.objects
        .filter(email=email, purpose='register', is_used=False)
        .order_by('-created_at')
        .first()
    )


@api_view(['POST'])
def send_otp(request):
    """Langkah 1: terima data, bikin OTP, kirim ke email. BELUM bikin user."""
    name = (request.data.get('name') or '').strip()
    phone = (request.data.get('phone') or '').strip()
    email = (request.data.get('email') or '').strip().lower()
    password = request.data.get('password') or ''

    if not name or not phone or not email or not password:
        return Response({'error': 'Nama, nomor HP, email, dan password wajib diisi.'}, status=400)
    if User.objects.filter(email=email).exists():
        return Response({'error': 'Email sudah terdaftar.'}, status=400)

    existing_otp = _latest_register_otp_session(email)
    existing_otp_state = otp_session_state(existing_otp)
    if existing_otp and not existing_otp_state['resend_allowed']:
        error_message = 'OTP masih aktif. Tunggu countdown selesai untuk kirim ulang OTP.'
        if existing_otp_state['is_locked']:
            error_message = (
                'Batas percobaan OTP habis. '
                'Tunggu countdown selesai untuk kirim ulang OTP.'
            )
        return Response({
            'error': error_message,
            'otp': existing_otp_state,
        }, status=http_status.HTTP_429_TOO_MANY_REQUESTS)

    if existing_otp:
        existing_otp.is_used = True
        existing_otp.save(update_fields=['is_used'])

    code = generate_otp()
    otp_row = OtpSession.objects.create(
        email=email, code=code, purpose='register',
        expires_at=timezone.now() + timedelta(seconds=OTP_TTL_SECONDS),
    )
    send_otp_email(name, email, code)
    ActivityLog.objects.create(email=email, event_type='register_otp_sent', result='sukses')
    return Response({
        'message': f'OTP terkirim ke {email} (cek Mailpit).',
        'otp': otp_session_state(otp_row),
    }, status=200)


@api_view(['POST'])
def verify_otp(request):
    """Langkah 2: cek OTP. Kalau bener -> baru BIKIN user."""
    name = (request.data.get('name') or '').strip()
    phone = (request.data.get('phone') or '').strip()
    email = (request.data.get('email') or '').strip().lower()
    password = request.data.get('password') or ''
    otp = (request.data.get('otp') or '').strip()
    trust_device = bool(request.data.get('trust_device'))

    if not name or not phone or not email or not password or not otp:
        return Response({'error': 'Nama, nomor HP, email, password, dan OTP wajib diisi.'}, status=400)

    otp_row = _latest_register_otp_session(email)

    if otp_row is None:
        return Response({
            'error': 'OTP tidak ditemukan. Kirim ulang OTP untuk lanjut.',
            'otp': otp_session_state(None),
        }, status=http_status.HTTP_400_BAD_REQUEST)
    otp_state = otp_session_state(otp_row)
    if otp_state['is_expired']:
        otp_row.is_used = True
        otp_row.save(update_fields=['is_used'])
        return Response({
            'error': 'OTP kadaluarsa. Kirim ulang OTP untuk lanjut.',
            'otp': otp_session_state(otp_row),
        }, status=http_status.HTTP_400_BAD_REQUEST)
    if otp_state['is_locked']:
        return Response({
            'error': (
                f'Sudah salah {MAX_OTP_ATTEMPTS}x. '
                'Tunggu countdown selesai untuk kirim ulang OTP.'
            ),
            'otp': otp_state,
        }, status=http_status.HTTP_400_BAD_REQUEST)
    if otp_row.code != otp:
        otp_row.attempts += 1
        otp_row.save(update_fields=['attempts'])
        ActivityLog.objects.create(email=email, event_type='register_otp_failed',
                                   result='gagal', reason='salah_otp')
        otp_state = otp_session_state(otp_row)
        if otp_state['verify_allowed']:
            return Response({
                'error': f'Kode OTP salah. Sisa percobaan: {otp_state["attempts_left"]}.',
                'otp': otp_state,
            }, status=http_status.HTTP_400_BAD_REQUEST)
        return Response({
            'error': (
                'Kode OTP salah. Batas percobaan habis. '
                'Tunggu countdown selesai untuk kirim ulang OTP.'
            ),
            'otp': otp_state,
        }, status=http_status.HTTP_400_BAD_REQUEST)

    if User.objects.filter(email=email).exists():
        return Response({'error': 'Email sudah terdaftar.'}, status=400)

    otp_row.is_used = True
    otp_row.save(update_fields=['is_used'])
    user = User.objects.create(name=name, phone=phone, email=email, password=password, role='customer')
    ActivityLog.objects.create(user=user, email=email, event_type='register_success', result='sukses')

    resp = {'message': 'Registrasi berhasil!', 'user_id': user.id, 'email': user.email}
    if trust_device:
        resp['trust_token'] = create_trusted_device(user, request)  # langsung stempel perangkat
    return Response(resp, status=201)
