"""Backend ADMIN > RETUR > QR."""

from rest_framework import status as http_status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ...pesanan.qr.views import approve_qr_return, get_product_units_for_order, verify_qr_token
from ..returns.views import get_return_entry


def _return_item_by_order_item_id(return_entry, order_item_id):
    for item in return_entry.items.all():
        if str(item.order_item_id or '') == str(order_item_id or ''):
            return item
    return None


@api_view(['GET'])
def list_return_qr_units(request):
    return_code = str(request.query_params.get('return_code') or '').strip()
    if not return_code:
        return Response({'error': 'return_code wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)

    return_entry = get_return_entry(return_code)
    if return_entry is None:
        return Response({'error': 'Data retur tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)

    order_code = return_entry.order.order_code if return_entry.order else ''
    all_units = get_product_units_for_order(order_code) if order_code else []
    items_payload = []

    for item in return_entry.items.all().order_by('id'):
        product_id = str(item.product_id or '')
        item_units = [unit for unit in all_units if str(unit.get('product_id') or '') == product_id]
        items_payload.append({
            'return_item_id': item.id,
            'order_item_id': item.order_item_id,
            'product_id': item.product_id,
            'product_name': item.product_name,
            'ordered_quantity': item.ordered_quantity,
            'requested_quantity': item.quantity,
            'units': item_units,
        })

    return Response({
        'return_code': return_entry.return_code,
        'order_code': order_code,
        'items': items_payload,
    }, status=http_status.HTTP_200_OK)


@api_view(['POST'])
def verify_return_qr(request):
    return_code = str(request.data.get('return_code') or '').strip()
    order_item_id = request.data.get('order_item_id')
    qr_token = str(request.data.get('qr_token') or '').strip()
    scanned_by = str(request.data.get('scanned_by') or '').strip()

    if not return_code:
        return Response({'error': 'return_code wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)
    if not qr_token or not scanned_by:
        return Response({'error': 'qr_token dan scanned_by wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)

    return_entry = get_return_entry(return_code)
    if return_entry is None:
        return Response({'error': 'Data retur tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)

    target_item = _return_item_by_order_item_id(return_entry, order_item_id)
    if target_item is None:
        return Response({'error': 'order_item_id tidak cocok dengan item retur.'}, status=http_status.HTTP_400_BAD_REQUEST)

    try:
        result = verify_qr_token(
            token=qr_token,
            scanned_by=scanned_by,
            claimed_order_id=return_entry.order.order_code if return_entry.order else None,
            claimed_product_id=str(target_item.product_id or '') or None,
            claimed_order_item_id=None,  # unit dipetakan via product_id, bukan slot order_item_id
        )
    except Exception as exc:
        return Response({'error': str(exc)}, status=http_status.HTTP_500_INTERNAL_SERVER_ERROR)

    return Response(result, status=http_status.HTTP_200_OK)


@api_view(['POST'])
def approve_return_qr(request):
    unit_id = str(request.data.get('unit_id') or '').strip()
    approved_by = str(request.data.get('approved_by') or '').strip()

    if not unit_id:
        return Response({'error': 'unit_id wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)

    try:
        result = approve_qr_return(unit_id=unit_id, approved_by=approved_by)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=http_status.HTTP_404_NOT_FOUND)
    except Exception as exc:
        return Response({'error': str(exc)}, status=http_status.HTTP_500_INTERNAL_SERVER_ERROR)

    return Response(result, status=http_status.HTTP_200_OK)
