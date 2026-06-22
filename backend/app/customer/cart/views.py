"""Backend CUSTOMER > CART (keranjang)."""
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ...models import User, Product, CartItem


@api_view(['POST'])
def add_to_cart(request):
    """Tambah produk ke keranjang user. Kalau udah ada, qty +1."""
    user = User.objects.filter(id=request.data.get('user_id')).first()
    product = Product.objects.filter(id=request.data.get('product_id')).first()
    if user is None or product is None:
        return Response({'error': 'User atau produk tidak valid.'}, status=400)

    item, created = CartItem.objects.get_or_create(user=user, product=product, defaults={'quantity': 1})
    if not created:
        item.quantity += 1
        item.save()
    return Response({'message': 'Ditambahkan ke keranjang.'}, status=200)


@api_view(['GET'])
def list_cart(request):
    """Isi keranjang seorang user (pakai ?user_id=)."""
    items = (CartItem.objects
             .select_related('product', 'product__category')
             .filter(user_id=request.GET.get('user_id'))
             .order_by('id'))
    return Response([{
        'id': it.id,
        'product_id': it.product.id,
        'name': it.product.name,
        'category': it.product.category.name if it.product.category else '',
        'price': it.product.price,
        'image': it.product.image,
        'quantity': it.quantity,
    } for it in items])


@api_view(['POST'])
def update_qty(request):
    """Ubah jumlah (pcs) satu item keranjang. Minimal 1."""
    item = CartItem.objects.filter(id=request.data.get('id')).first()
    if item is None:
        return Response({'error': 'Item tidak ditemukan.'}, status=404)
    try:
        qty = int(request.data.get('quantity') or 1)
    except (ValueError, TypeError):
        qty = 1
    item.quantity = max(1, qty)
    item.save()
    return Response({'message': 'Jumlah diupdate.'}, status=200)


@api_view(['POST'])
def remove_from_cart(request):
    """Hapus satu item dari keranjang."""
    item = CartItem.objects.filter(id=request.data.get('id')).first()
    if item is None:
        return Response({'error': 'Item tidak ditemukan.'}, status=404)
    item.delete()
    return Response({'message': 'Dihapus dari keranjang.'}, status=200)
