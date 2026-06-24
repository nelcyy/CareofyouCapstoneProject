"""Backend CUSTOMER > PROFILE > ADDRESS."""

from django.db import transaction
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ....models import Address
from ..common import get_customer_profile_user


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


def _is_truthy(value):
    return str(value or '').lower() in ('true', '1', 'yes', 'on')


@api_view(['GET'])
def list_addresses(request):
    """Daftar alamat customer untuk halaman profile > address."""
    user = get_customer_profile_user(request.GET.get('user_id'))
    if user is None:
        return Response({'error': 'User customer tidak ditemukan.'}, status=404)

    items = (
        Address.objects
        .filter(user=user)
        .order_by('-is_default', '-id')
    )
    return Response([_serialize_address(item) for item in items], status=200)


@api_view(['POST'])
def create_address(request):
    """Tambah alamat baru customer dari halaman profile."""
    user = get_customer_profile_user(request.data.get('user_id'))
    if user is None:
        return Response({'error': 'User customer tidak ditemukan.'}, status=404)

    label = str(request.data.get('label') or 'Rumah').strip() or 'Rumah'
    recipient_name = str(request.data.get('recipient_name') or '').strip() or user.name
    phone = str(request.data.get('phone') or '').strip() or user.phone
    address_line = str(request.data.get('address_line') or '').strip()
    city = str(request.data.get('city') or '').strip()
    province = str(request.data.get('province') or '').strip()
    postal_code = str(request.data.get('postal_code') or '').strip()
    notes = str(request.data.get('notes') or '').strip()

    required_fields = (
        (recipient_name, 'Nama penerima wajib diisi.'),
        (phone, 'Nomor telepon wajib diisi.'),
        (address_line, 'Alamat wajib diisi.'),
        (city, 'Kota wajib diisi.'),
        (province, 'Provinsi wajib diisi.'),
        (postal_code, 'Kode pos wajib diisi.'),
    )
    for value, message in required_fields:
        if not value:
            return Response({'error': message}, status=400)

    wants_default = _is_truthy(request.data.get('is_default'))
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

    return Response({
        'message': 'Alamat berhasil ditambahkan.',
        'address': _serialize_address(item),
    }, status=201)


@api_view(['POST'])
def update_address(request):
    """Update alamat customer dari halaman profile."""
    user = get_customer_profile_user(request.data.get('user_id'))
    if user is None:
        return Response({'error': 'User customer tidak ditemukan.'}, status=404)

    item = Address.objects.filter(id=request.data.get('address_id'), user=user).first()
    if item is None:
        return Response({'error': 'Alamat tidak ditemukan.'}, status=404)

    label = str(request.data.get('label') or 'Rumah').strip() or 'Rumah'
    recipient_name = str(request.data.get('recipient_name') or '').strip() or user.name
    phone = str(request.data.get('phone') or '').strip() or user.phone
    address_line = str(request.data.get('address_line') or '').strip()
    city = str(request.data.get('city') or '').strip()
    province = str(request.data.get('province') or '').strip()
    postal_code = str(request.data.get('postal_code') or '').strip()
    notes = str(request.data.get('notes') or '').strip()

    required_fields = (
        (recipient_name, 'Nama penerima wajib diisi.'),
        (phone, 'Nomor telepon wajib diisi.'),
        (address_line, 'Alamat wajib diisi.'),
        (city, 'Kota wajib diisi.'),
        (province, 'Provinsi wajib diisi.'),
        (postal_code, 'Kode pos wajib diisi.'),
    )
    for value, message in required_fields:
        if not value:
            return Response({'error': message}, status=400)

    item.label = label
    item.recipient_name = recipient_name
    item.phone = phone
    item.address_line = address_line
    item.city = city
    item.province = province
    item.postal_code = postal_code
    item.notes = notes
    item.save(
        update_fields=[
            'label',
            'recipient_name',
            'phone',
            'address_line',
            'city',
            'province',
            'postal_code',
            'notes',
            'updated_at',
        ]
    )

    return Response({
        'message': 'Alamat berhasil diupdate.',
        'address': _serialize_address(item),
    }, status=200)


@api_view(['POST'])
def delete_address(request):
    """Hapus alamat customer dari halaman profile."""
    user = get_customer_profile_user(request.data.get('user_id'))
    if user is None:
        return Response({'error': 'User customer tidak ditemukan.'}, status=404)

    item = Address.objects.filter(id=request.data.get('address_id'), user=user).first()
    if item is None:
        return Response({'error': 'Alamat tidak ditemukan.'}, status=404)

    was_default = item.is_default
    with transaction.atomic():
        item.delete()
        if was_default:
            next_item = Address.objects.filter(user=user).order_by('id').first()
            if next_item is not None:
                next_item.is_default = True
                next_item.save(update_fields=['is_default', 'updated_at'])

    return Response({'message': 'Alamat berhasil dihapus.'}, status=200)


@api_view(['POST'])
def set_default_address(request):
    """Jadikan satu alamat sebagai alamat utama customer."""
    user = get_customer_profile_user(request.data.get('user_id'))
    if user is None:
        return Response({'error': 'User customer tidak ditemukan.'}, status=404)

    item = Address.objects.filter(id=request.data.get('address_id'), user=user).first()
    if item is None:
        return Response({'error': 'Alamat tidak ditemukan.'}, status=404)

    with transaction.atomic():
        Address.objects.filter(user=user, is_default=True).exclude(id=item.id).update(is_default=False)
        if not item.is_default:
            item.is_default = True
            item.save(update_fields=['is_default', 'updated_at'])

    return Response({
        'message': 'Alamat utama berhasil diubah.',
        'address': _serialize_address(item),
    }, status=200)
