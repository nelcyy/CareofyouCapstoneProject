"""Backend LOGIN (adaptive OTP + trusted device)."""
import secrets
from datetime import timedelta

from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ..models import User, OtpSession, ActivityLog, TrustedDevice
from ..common import (OTP_TTL_SECONDS, generate_otp, send_otp_email,
                      client_ip, user_public, create_trusted_device)


def _new_login_id():
    return secrets.token_urlsafe(24)


def _log_login_event(user, email, event_type, result='', reason='', request=None, login_id=''):
    ActivityLog.objects.create(
        user=user,
        login_id=login_id,
        email=email,
        event_type=event_type,
        result=result,
        reason=reason,
        ip_address=client_ip(request) if request else '',
    )


def _failed_logins_since_success(user):
    """Hitung gagal password sejak login sukses terakhir (dari activity_log)."""
    last_success = (ActivityLog.objects
                    .filter(user=user, event_type='login', result='sukses')
                    .order_by('-created_at').first())
    qs = ActivityLog.objects.filter(user=user, event_type='login',
                                    result='gagal', reason='salah_password')
    if last_success:
        qs = qs.filter(created_at__gt=last_success.created_at)
    return qs.count()


def _trusted_device(user, trust_token):
    if not trust_token:
        return None
    return (TrustedDevice.objects
            .filter(user=user, token=trust_token, is_active=True, expires_at__gt=timezone.now())
            .first())


@api_view(['POST'])
def login(request):
    """Cek email+password. Kalau bener, putuskan perlu OTP atau langsung masuk (adaptif)."""
    email = (request.data.get('email') or '').strip().lower()
    password = request.data.get('password') or ''
    trust_token = request.data.get('trust_token') or ''
    login_id = (request.data.get('login_id') or '').strip() or _new_login_id()

    user = User.objects.filter(email=email).first()
    if user is None:
        # email gak kedaftar -> gak usah dicatat di activity_log
        return Response({'error': 'Email atau password salah.'}, status=400)
    if user.password != password:  # password masih polos (belum di-hash)
        _log_login_event(user, email, 'login', 'gagal', 'salah_password', request, login_id)
        return Response({'error': 'Email atau password salah.', 'login_id': login_id}, status=400)

    device = _trusted_device(user, trust_token)
    fails = _failed_logins_since_success(user)
    need_otp = (user.role == 'admin') or (device is None) or (fails >= 2)

    if need_otp:
        code = generate_otp()
        OtpSession.objects.create(user=user, login_id=login_id, email=email, code=code, purpose='login',
                                  expires_at=timezone.now() + timedelta(seconds=OTP_TTL_SECONDS))
        send_otp_email(user.name, email, code)
        _log_login_event(user, email, 'login_otp_sent', 'sukses', '', request, login_id)
        return Response({'need_otp': True,
                         'login_id': login_id,
                         'can_trust': device is None and user.role != 'admin',
                         'message': 'OTP dikirim ke email.'}, status=200)

    if device:
        device.last_used = timezone.now()
        device.save()
    _log_login_event(user, email, 'login', 'sukses', '', request, login_id)
    return Response({'logged_in': True, 'login_id': login_id, 'user': user_public(user)}, status=200)


@api_view(['POST'])
def verify_otp(request):
    """Cek OTP login. Kalau bener -> masuk. Kalau 'trust_device' -> bikin stempel."""
    email = (request.data.get('email') or '').strip().lower()
    otp = (request.data.get('otp') or '').strip()
    trust_device = bool(request.data.get('trust_device'))
    login_id = (request.data.get('login_id') or '').strip()

    user = User.objects.filter(email=email).first()
    if user is None:
        return Response({'error': 'User tidak ditemukan.'}, status=400)

    otp_rows = OtpSession.objects.filter(user=user, purpose='login', is_used=False)
    if login_id:
        otp_rows = otp_rows.filter(login_id=login_id)
    otp_row = otp_rows.order_by('-created_at').first()

    if otp_row is None:
        return Response({'error': 'OTP tidak ditemukan, login ulang.'}, status=400)
    login_id = otp_row.login_id or login_id or _new_login_id()
    if timezone.now() > otp_row.expires_at:
        otp_row.is_used = True
        otp_row.save(update_fields=['is_used'])
        _log_login_event(user, email, 'login_otp_failed', 'gagal', 'otp_kadaluarsa', request, login_id)
        return Response({'error': 'OTP kadaluarsa, login ulang.'}, status=400)
    if otp_row.attempts >= 2:
        otp_row.is_used = True
        otp_row.save(update_fields=['is_used'])
        return Response({'error': 'Sudah salah 2x, OTP hangus. Login ulang.'}, status=400)
    if otp_row.code != otp:
        otp_row.attempts += 1
        otp_row.save()
        _log_login_event(user, email, 'login_otp_failed', 'gagal', 'salah_otp', request, login_id)
        return Response({'error': f'Kode OTP salah. Sisa percobaan: {2 - otp_row.attempts}.'}, status=400)

    otp_row.is_used = True
    otp_row.save()
    _log_login_event(user, email, 'login', 'sukses', '', request, login_id)

    resp = {'logged_in': True, 'login_id': login_id, 'user': user_public(user)}
    if trust_device:
        resp['trust_token'] = create_trusted_device(user, request)
    return Response(resp, status=200)
