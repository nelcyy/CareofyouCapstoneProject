"""Helper/view bareng yang dipakai beberapa fitur (login, register, dll)."""
import random
import secrets
from datetime import timedelta

from django.core.mail import send_mail
from django.utils import timezone

from .models import TrustedDevice

OTP_TTL_SECONDS = 90
TRUST_TTL_DAYS = 30
MAX_TRUSTED_DEVICES = 2


def generate_otp():
    """Kode OTP 6 digit, mis. '048391'."""
    return f"{random.randint(0, 999999):06d}"


def send_otp_email(name, email, code):
    send_mail(
        subject='Kode OTP CareOfYou',
        message=f'Halo {name or ""},\n\nKode OTP kamu: {code}\nBerlaku 90 detik.\n\nJangan kasih kode ini ke siapa pun.',
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
