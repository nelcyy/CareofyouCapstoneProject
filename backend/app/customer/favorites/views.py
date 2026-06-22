"""Backend CUSTOMER > FAVORITES."""
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ...models import User, Product, Favorite


@api_view(['POST'])
def add_to_favorite(request):
    """Tambah produk ke favorit user (gak dobel, unique user+product)."""
    user = User.objects.filter(id=request.data.get('user_id')).first()
    product = Product.objects.filter(id=request.data.get('product_id')).first()
    if user is None or product is None:
        return Response({'error': 'User atau produk tidak valid.'}, status=400)
    Favorite.objects.get_or_create(user=user, product=product)
    return Response({'message': 'Ditambahkan ke favorit.'}, status=200)


@api_view(['GET'])
def list_favorites(request):
    """Favorit seorang user (pakai ?user_id=)."""
    favs = (Favorite.objects
            .select_related('product', 'product__category')
            .filter(user_id=request.GET.get('user_id'))
            .order_by('id'))
    return Response([{
        'id': f.id,
        'product_id': f.product.id,
        'name': f.product.name,
        'category': f.product.category.name if f.product.category else '',
        'price': f.product.price,
        'image': f.product.image,
    } for f in favs])


@api_view(['POST'])
def remove_from_favorite(request):
    """Hapus satu produk dari favorit."""
    fav = Favorite.objects.filter(id=request.data.get('id')).first()
    if fav is None:
        return Response({'error': 'Item tidak ditemukan.'}, status=404)
    fav.delete()
    return Response({'message': 'Dihapus dari favorit.'}, status=200)
