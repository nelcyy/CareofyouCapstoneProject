"""Backend REGISTRASI."""
from datetime import timedelta

from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ..models import User, OtpSession, ActivityLog
from ..common import OTP_TTL_SECONDS, generate_otp, send_otp_email, create_trusted_device


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

    code = generate_otp()
    OtpSession.objects.create(
        email=email, code=code, purpose='register',
        expires_at=timezone.now() + timedelta(seconds=OTP_TTL_SECONDS),
    )
    send_otp_email(name, email, code)
    ActivityLog.objects.create(email=email, event_type='register_otp_sent', result='sukses')
    return Response({'message': f'OTP terkirim ke {email} (cek Mailpit).'}, status=200)


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

    otp_row = (OtpSession.objects
               .filter(email=email, purpose='register', is_used=False)
               .order_by('-created_at').first())

    if otp_row is None:
        return Response({'error': 'OTP tidak ditemukan, minta kirim ulang.'}, status=400)
    if timezone.now() > otp_row.expires_at:
        return Response({'error': 'OTP kadaluarsa (lebih dari 90 detik), minta baru.'}, status=400)
    if otp_row.attempts >= 2:
        return Response({'error': 'Sudah salah 2x, OTP hangus. Minta baru.'}, status=400)
    if otp_row.code != otp:
        otp_row.attempts += 1
        otp_row.save()
        ActivityLog.objects.create(email=email, event_type='register_otp_failed',
                                   result='gagal', reason='salah_otp')
        return Response({'error': f'Kode OTP salah. Sisa percobaan: {2 - otp_row.attempts}.'}, status=400)

    if User.objects.filter(email=email).exists():
        return Response({'error': 'Email sudah terdaftar.'}, status=400)

    otp_row.is_used = True
    otp_row.save()
    user = User.objects.create(name=name, phone=phone, email=email, password=password, role='customer')
    ActivityLog.objects.create(user=user, email=email, event_type='register_success', result='sukses')

    resp = {'message': 'Registrasi berhasil!', 'user_id': user.id, 'email': user.email}
    if trust_device:
        resp['trust_token'] = create_trusted_device(user, request)  # langsung stempel perangkat
    return Response(resp, status=201)
