"""Backend CUSTOMER > PRODUCT."""
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ...models import Product


@api_view(['GET'])
def list_products(request):
    """Daftar produk AKTIF buat ditampilin ke customer."""
    products = Product.objects.select_related('category').filter(is_active=True).order_by('-created_at')
    return Response([{
        'id': p.id,
        'name': p.name,
        'price': p.price,
        'stock': p.stock,
        'category': p.category.name if p.category else '',
        'image': p.image,
    } for p in products])
