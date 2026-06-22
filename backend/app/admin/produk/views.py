"""Backend ADMIN > PRODUK."""
from django.conf import settings
from django.core.files.storage import default_storage
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ...models import Category, Product


@api_view(['POST'])
def upload_image(request):
    """Terima file gambar, simpan ke media/products/, balikin URL-nya."""
    f = request.FILES.get('image')
    if f is None:
        return Response({'error': 'Tidak ada file.'}, status=400)
    path = default_storage.save(f'products/{f.name}', f)  # simpan ke MEDIA_ROOT/products/
    # balikin PATH relatif (mis. /media/products/foto.jpg), BUKAN URL full localhost
    return Response({'url': settings.MEDIA_URL + path}, status=201)


@api_view(['GET'])
def list_categories(request):
    """Daftar kategori buat select input di form tambah produk."""
    cats = Category.objects.all().order_by('name')
    return Response([{'id': c.id, 'name': c.name} for c in cats])


@api_view(['GET'])
def list_products(request):
    """Daftar produk buat ditampilin di tabel."""
    products = Product.objects.select_related('category').order_by('-created_at')
    return Response([{
        'id': p.id,
        'name': p.name,
        'description': p.description,
        'price': p.price,
        'stock': p.stock,
        'category': p.category.name if p.category else '',
        'category_id': p.category_id,
        'is_active': p.is_active,
        'image': p.image,
    } for p in products])


@api_view(['POST'])
def create_product(request):
    """Simpan produk baru ke database."""
    name = (request.data.get('name') or '').strip()
    description = (request.data.get('description') or '').strip()
    category_id = request.data.get('category_id') or None
    is_active = bool(request.data.get('is_active', True))

    if not name:
        return Response({'error': 'Nama produk wajib diisi.'}, status=400)
    try:
        price = int(request.data.get('price') or 0)
        stock = int(request.data.get('stock') or 0)
    except (ValueError, TypeError):
        return Response({'error': 'Harga & stok harus angka.'}, status=400)

    category = Category.objects.filter(id=category_id).first() if category_id else None
    product = Product.objects.create(
        name=name, description=description, price=price, stock=stock,
        category=category, is_active=is_active,
        image=(request.data.get('image') or '').strip(),
    )
    return Response({'id': product.id, 'message': 'Produk disimpan!'}, status=201)


@api_view(['POST'])
def update_product(request):
    """Update produk: cuma nama, deskripsi, harga, stok, aktif (kategori TIDAK diubah)."""
    product = Product.objects.filter(id=request.data.get('id')).first()
    if product is None:
        return Response({'error': 'Produk tidak ditemukan.'}, status=404)

    name = (request.data.get('name') or '').strip()
    if not name:
        return Response({'error': 'Nama produk wajib diisi.'}, status=400)
    try:
        price = int(request.data.get('price') or 0)
        stock = int(request.data.get('stock') or 0)
    except (ValueError, TypeError):
        return Response({'error': 'Harga & stok harus angka.'}, status=400)

    product.name = name
    product.description = (request.data.get('description') or '').strip()
    product.price = price
    product.stock = stock
    product.is_active = bool(request.data.get('is_active', True))
    product.image = (request.data.get('image') or '').strip()
    product.save()
    return Response({'message': 'Produk diupdate!'}, status=200)


@api_view(['POST'])
def delete_product(request):
    """Hapus produk dari database."""
    product = Product.objects.filter(id=request.data.get('id')).first()
    if product is None:
        return Response({'error': 'Produk tidak ditemukan.'}, status=404)
    product.delete()
    return Response({'message': 'Produk dihapus!'}, status=200)
