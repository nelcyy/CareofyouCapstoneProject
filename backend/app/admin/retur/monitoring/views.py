"""Backend ADMIN > RETUR > MONITORING."""

from rest_framework import status as http_status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ..returns.views import get_return_entry, serialized_return_entry


@api_view(['GET'])
def detail_monitoring(request):
    return_code = str(request.query_params.get('return_code') or '').strip()
    if not return_code:
        return Response({'error': 'return_code wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)

    return_entry = get_return_entry(return_code)
    if return_entry is None:
        return Response({'error': 'Data retur tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)

    payload = serialized_return_entry(return_entry, include_monitoring=True)
    return Response({
        'return_code': return_entry.return_code,
        'monitoring': payload.get('monitoring'),
    }, status=http_status.HTTP_200_OK)
