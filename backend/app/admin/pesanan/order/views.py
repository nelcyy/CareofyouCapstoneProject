"""Backend ADMIN > PESANAN > ORDER."""
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status as http_status

from ....models import Order
from ..monitoring.views import get_order_monitoring_payload


@api_view(['GET'])
def list_orders(request):
    """Daftar pesanan sederhana untuk halaman admin."""
    items = Order.objects.select_related('user').order_by('-created_at', '-id')
    return Response([{
        'customer_name': (it.user.name if it.user else '') or it.recipient_name or '',
        'order_code': it.order_code,
        'grand_total': it.grand_total,
        'status': it.status,
    } for it in items])


@api_view(['GET'])
def detail_order(request):
    """Detail sederhana satu pesanan untuk halaman admin."""
    order_code = (request.query_params.get('order_code') or '').strip()
    if not order_code:
        return Response({'error': 'order_code wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)

    order = (
        Order.objects.select_related('user')
        .prefetch_related('items')
        .filter(order_code=order_code)
        .first()
    )
    if not order:
        return Response({'error': 'Pesanan tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)

    return Response({
        'order_code': order.order_code,
        'customer_name': (order.user.name if order.user else '') or order.recipient_name or '',
        'customer_email': order.user.email if order.user else '',
        'status': order.status,
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
        'payment_method': order.payment_method,
        'payment_target': order.payment_target,
        'payment_proof': order.payment_proof,
        'subtotal': order.subtotal,
        'grand_total': order.grand_total,
        'monitoring': get_order_monitoring_payload(order),
        'items': [{
            'id': item.id,
            'product_name': item.product_name,
            'product_price': item.product_price,
            'quantity': item.quantity,
            'subtotal': item.subtotal,
        } for item in order.items.all().order_by('id')],
    })
