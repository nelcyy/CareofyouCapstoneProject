"""Backend CUSTOMER > HOME."""
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ...models import Product


def _serialize(p):
    return {
        'id': p.id,
        'name': p.name,
        'price': p.price,
        'stock': p.stock,
        'category': p.category.name if p.category else '',
        'image': p.image,
    }


@api_view(['GET'])
def summary(request):
    """Ringkasan buat halaman home: kategori (nama, jumlah produk, 1 foto contoh) + produk terbaru."""
    products = list(
        Product.objects.select_related('category').filter(is_active=True).order_by('-created_at')
    )

    categories = {}
    for p in products:
        cat_name = p.category.name if p.category else 'Lainnya'
        entry = categories.setdefault(cat_name, {'name': cat_name, 'count': 0, 'image': p.image})
        entry['count'] += 1

    return Response({
        'total_products': len(products),
        'categories': list(categories.values()),
        'newest': [_serialize(p) for p in products[:3]],
    })
