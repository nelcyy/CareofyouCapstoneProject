"""Helper/view bareng yang dipakai beberapa fitur (login, register, dll)."""
import random
import secrets
from datetime import timedelta

from django.core.mail import send_mail
from django.utils import timezone

from .models import TrustedDevice

OTP_TTL_SECONDS = 90
MAX_OTP_ATTEMPTS = 2
TRUST_TTL_DAYS = 30
MAX_TRUSTED_DEVICES = 2


def format_duration_id(total_seconds):
    total_seconds = max(0, int(total_seconds))
    minutes, seconds = divmod(total_seconds, 60)
    parts = []
    if minutes:
        parts.append(f'{minutes} menit')
    if seconds:
        parts.append(f'{seconds} detik')
    return ' '.join(parts) or '0 detik'


def otp_time_remaining_seconds(otp_row, now=None):
    if otp_row is None or not otp_row.expires_at:
        return 0
    current_time = now or timezone.now()
    remaining = (otp_row.expires_at - current_time).total_seconds()
    if remaining <= 0:
        return 0
    return int(remaining + 0.999999)


def otp_session_state(otp_row, now=None):
    current_time = now or timezone.now()
    remaining_seconds = otp_time_remaining_seconds(otp_row, current_time)

    if otp_row is None:
        return {
            'status': 'missing',
            'ttl_seconds': OTP_TTL_SECONDS,
            'ttl_label': format_duration_id(OTP_TTL_SECONDS),
            'max_attempts': MAX_OTP_ATTEMPTS,
            'attempts_left': 0,
            'expires_at': '',
            'expires_in_seconds': 0,
            'verify_allowed': False,
            'resend_allowed': True,
            'resend_after_seconds': 0,
            'is_locked': False,
            'is_expired': True,
        }

    attempts_left = max(0, MAX_OTP_ATTEMPTS - int(otp_row.attempts or 0))
    is_expired = remaining_seconds == 0
    is_locked = (not otp_row.is_used) and (not is_expired) and attempts_left == 0
    verify_allowed = (not otp_row.is_used) and (not is_expired) and attempts_left > 0
    resend_allowed = is_expired

    status = 'used'
    if is_expired:
        status = 'expired'
    elif is_locked:
        status = 'locked'
    elif verify_allowed:
        status = 'active'

    return {
        'status': status,
        'ttl_seconds': OTP_TTL_SECONDS,
        'ttl_label': format_duration_id(OTP_TTL_SECONDS),
        'max_attempts': MAX_OTP_ATTEMPTS,
        'attempts_left': attempts_left,
        'expires_at': otp_row.expires_at.isoformat() if otp_row.expires_at else '',
        'expires_in_seconds': remaining_seconds,
        'verify_allowed': verify_allowed,
        'resend_allowed': resend_allowed,
        'resend_after_seconds': remaining_seconds,
        'is_locked': is_locked,
        'is_expired': is_expired,
    }


def generate_otp():
    """Kode OTP 6 digit, mis. '048391'."""
    return f"{random.randint(0, 999999):06d}"


def send_otp_email(name, email, code):
    send_mail(
        subject='Kode OTP CareOfYou',
        message=(
            f'Halo {name or ""},\n\n'
            f'Kode OTP kamu: {code}\n'
            f'Berlaku {format_duration_id(OTP_TTL_SECONDS)}.\n\n'
            'Jangan kasih kode ini ke siapa pun.'
        ),
        from_email=None,  # pakai DEFAULT_FROM_EMAIL
        recipient_list=[email],
    )


def client_ip(request):
    return request.META.get('REMOTE_ADDR', '')


def device_label(request):
    return request.META.get('HTTP_USER_AGENT', '')[:200]


def user_public(user):
    """Data user yang aman dikirim ke frontend (tanpa password)."""
    return {'id': user.id, 'email': user.email, 'name': user.name, 'phone': user.phone, 'role': user.role}


def create_trusted_device(user, request):
    """Bikin stempel 'percayai perangkat ini', balikin token-nya. Maks 2 device aktif (LRU)."""
    now = timezone.now()
    TrustedDevice.objects.filter(user=user, is_active=True, expires_at__lte=now).update(is_active=False)
    token = secrets.token_urlsafe(32)
    TrustedDevice.objects.create(
        user=user, token=token, device_label=device_label(request),
        ip_address=client_ip(request),
        is_active=True,
        expires_at=now + timedelta(days=TRUST_TTL_DAYS),
        last_used=now,
    )
    extra = list(
        TrustedDevice.objects
        .filter(user=user, is_active=True, expires_at__gt=now)
        .order_by('-last_used', '-created_at')[MAX_TRUSTED_DEVICES:]
    )
    if extra:
        TrustedDevice.objects.filter(id__in=[old.id for old in extra]).update(is_active=False)
    return token
