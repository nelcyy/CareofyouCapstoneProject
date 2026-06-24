"""Backend CUSTOMER > PROFILE > EDIT."""

from rest_framework.decorators import api_view
from rest_framework.response import Response

from ..common import get_customer_profile_user, profile_payload


@api_view(['GET'])
def detail_profile(request):
    """Detail profil customer untuk halaman edit profil."""
    user = get_customer_profile_user(request.GET.get('user_id'))
    if user is None:
        return Response({'error': 'User customer tidak ditemukan.'}, status=404)
    return Response(profile_payload(user))


@api_view(['POST'])
def update_profile(request):
    """Update profil customer sederhana: nama dan telepon."""
    user = get_customer_profile_user(request.data.get('user_id'))
    if user is None:
        return Response({'error': 'User customer tidak ditemukan.'}, status=404)

    name = str(request.data.get('name') or '').strip()
    phone = str(request.data.get('phone') or '').strip()

    if not name:
        return Response({'error': 'Nama wajib diisi.'}, status=400)

    user.name = name
    user.phone = phone
    user.save(update_fields=['name', 'phone'])
    return Response({
        'message': 'Profil berhasil diupdate.',
        'profile': profile_payload(user),
    }, status=200)
