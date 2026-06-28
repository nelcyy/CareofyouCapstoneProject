"""Backend CUSTOMER > PROFILE > PESANAN."""

import base64

from django.http import HttpResponse
from django.views.decorators.clickjacking import xframe_options_exempt
from rest_framework import status as http_status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ....admin.pesanan.ereceipt.views import ensure_order_receipt, _missing_dependency_response
from ....models import EReceipt, Order
from ..common import get_customer_profile_user
from ..retur.views import get_order_return_state


def _order_queryset():
    return (
        Order.objects
        .select_related('user', 'shipped_by', 'completed_by', 'e_receipt', 'return_data')
        .prefetch_related('items')
    )


def _active_receipt(order):
    try:
        receipt = order.e_receipt
    except EReceipt.DoesNotExist:
        return None
    if receipt.is_revoked:
        return None
    return receipt


def _order_allows_receipt(order):
    return order.decision == 'approved' or order.status in ('pengemasan', 'pengiriman', 'selesai')


def _list_order_payload(order):
    return_state = get_order_return_state(order)
    return {
        'order_code': order.order_code,
        'grand_total': order.grand_total,
        'status': order.status,
        'decision': order.decision,
        'created_at': order.created_at.isoformat() if order.created_at else '',
        'total_item_quantity': sum((item.quantity or 0) for item in order.items.all()),
        'has_return': return_state['has_return'],
        'return_status': return_state['return_status'],
    }


def _detail_order_payload(order):
    receipt = _active_receipt(order)
    return_state = get_order_return_state(order)
    return {
        'order_code': order.order_code,
        'customer_name': (order.user.name if order.user else '') or order.recipient_name or '',
        'customer_email': order.user.email if order.user else '',
        'status': order.status,
        'decision': order.decision,
        'decision_reason': order.decision_reason,
        'processed_at': order.processed_at.isoformat() if order.processed_at else '',
        'created_at': order.created_at.isoformat() if order.created_at else '',
        'recipient_name': order.recipient_name,
        'recipient_phone': order.recipient_phone,
        'address_label': order.address_label,
        'address_line': order.address_line,
        'city': order.city,
        'province': order.province,
        'postal_code': order.postal_code,
        'address_notes': order.address_notes,
        'courier_name': order.courier_name,
        'shipping_fee': order.shipping_fee,
        'tracking_number': order.tracking_number,
        'shipping_notes': order.shipping_notes,
        'shipped_at': order.shipped_at.isoformat() if order.shipped_at else '',
        'shipped_by_name': order.shipped_by.name if order.shipped_by else '',
        'delivery_proof': order.delivery_proof,
        'completed_at': order.completed_at.isoformat() if order.completed_at else '',
        'completed_by_name': order.completed_by.name if order.completed_by else '',
        'payment_method': order.payment_method,
        'payment_target': order.payment_target,
        'payment_proof': order.payment_proof,
        'subtotal': order.subtotal,
        'grand_total': order.grand_total,
        'ereceipt_eligible': _order_allows_receipt(order),
        'ereceipt_available': receipt is not None,
        'ereceipt_id': receipt.receipt_id if receipt else '',
        'ereceipt_generated_at': receipt.generated_at.isoformat() if receipt and receipt.generated_at else '',
        'return_info': return_state,
        'items': [{
            'id': item.id,
            'product_id': item.product_id,
            'product_name': item.product_name,
            'product_price': item.product_price,
            'quantity': item.quantity,
            'subtotal': item.subtotal,
        } for item in order.items.all().order_by('id')],
    }


@api_view(['GET'])
def list_orders(request):
    """Daftar pesanan milik customer untuk halaman profile > order."""
    user = get_customer_profile_user(request.GET.get('user_id'))
    if user is None:
        return Response({'error': 'User customer tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)

    items = _order_queryset().filter(user=user).order_by('-created_at', '-id')
    return Response([_list_order_payload(item) for item in items], status=http_status.HTTP_200_OK)


@api_view(['GET'])
def detail_order(request):
    """Detail satu pesanan milik customer berdasarkan order_code."""
    user = get_customer_profile_user(request.GET.get('user_id'))
    if user is None:
        return Response({'error': 'User customer tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)

    order_code = str(request.GET.get('order_code') or '').strip()
    if not order_code:
        return Response({'error': 'order_code wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)

    order = _order_queryset().filter(user=user, order_code=order_code).first()
    if order is None:
        return Response({'error': 'Pesanan tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)

    return Response(_detail_order_payload(order), status=http_status.HTTP_200_OK)


def _get_customer_order_for_receipt(request):
    user = get_customer_profile_user(request.GET.get('user_id'))
    if user is None:
        return None, Response({'error': 'User customer tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)

    order_code = str(request.GET.get('order_code') or '').strip()
    if not order_code:
        return None, Response({'error': 'order_code wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)

    order = _order_queryset().filter(user=user, order_code=order_code).first()
    if order is None:
        return None, Response({'error': 'Pesanan tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)

    return order, None


def _receipt_response(request, as_attachment):
    order, error_response = _get_customer_order_for_receipt(request)
    if error_response is not None:
        return error_response
    if not _order_allows_receipt(order):
        return Response(
            {'error': 'E-receipt belum tersedia. Pesanan harus sudah di-approve admin.'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    try:
        receipt, _ = ensure_order_receipt(order)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=http_status.HTTP_400_BAD_REQUEST)
    except (ModuleNotFoundError, OSError) as exc:
        return _missing_dependency_response(exc)

    filename = f'e-receipt-{order.order_code}.pdf'
    pdf_bytes = base64.b64decode(receipt.pdf_b64)
    response = HttpResponse(pdf_bytes, content_type='application/pdf')
    disposition = 'attachment' if as_attachment else 'inline'
    response['Content-Disposition'] = f'{disposition}; filename="{filename}"'
    response['Access-Control-Expose-Headers'] = 'Content-Disposition'
    return response


@xframe_options_exempt
@api_view(['GET'])
def view_receipt(request):
    """Lihat PDF e-receipt untuk customer pemilik order (di-embed dalam iframe popup)."""
    return _receipt_response(request, as_attachment=False)


@api_view(['GET'])
def download_receipt(request):
    """Download PDF e-receipt untuk customer pemilik order."""
    return _receipt_response(request, as_attachment=True)
