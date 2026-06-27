"""Backend ADMIN > DASHBOARD.

Semua ANGKA/agregasi dihitung di sini (backend), frontend tinggal nampilin.
Tidak ada angka/aturan yang dikarang di frontend.
"""
from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ...models import Order, OrderItem, Product, Return, User

# stok di bawah/sama dengan nilai ini dianggap "menipis"
LOW_STOCK_THRESHOLD = 5

# bulan order yang dihitung sebagai pendapatan benar-benar terealisasi
REVENUE_STATUS = 'selesai'

# label status biar frontend nggak perlu bikin teksnya sendiri
STATUS_LABELS = {
    'waiting_admin_approval': 'Menunggu Persetujuan',
    'rejected': 'Ditolak',
    'pengemasan': 'Pengemasan',
    'pengiriman': 'Pengiriman',
    'selesai': 'Selesai',
}

MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']


def _last_six_months(now):
    """List 6 (year, month) terakhir, urut lama -> baru, termasuk bulan ini."""
    result = []
    year, month = now.year, now.month
    for offset in range(5, -1, -1):
        m = month - offset
        y = year
        while m <= 0:
            m += 12
            y -= 1
        result.append((y, m))
    return result


@api_view(['GET'])
def notification_counts(request):
    """Jumlah pesanan & retur 'baru' (butuh aksi admin) untuk badge sidebar admin.

    'Baru' = order status 'waiting_admin_approval' dan retur 'waiting_admin_review'.
    Aturan ini sengaja dihitung di backend (bukan di frontend).
    """
    return Response({
        'pending_orders': Order.objects.filter(status='waiting_admin_approval').count(),
        'pending_returns': Return.objects.filter(status='waiting_admin_review').count(),
    })


@api_view(['GET'])
def dashboard_stats(request):
    """Ringkasan untuk halaman dashboard admin."""
    now = timezone.now()
    today = timezone.localdate()

    # ── kartu statistik ──
    revenue_total = (
        Order.objects.filter(status=REVENUE_STATUS).aggregate(total=Sum('grand_total'))['total'] or 0
    )
    orders_total = Order.objects.count()
    orders_today = Order.objects.filter(created_at__date=today).count()

    products_total = Product.objects.count()
    products_active = Product.objects.filter(is_active=True).count()

    customers_total = User.objects.filter(role='customer').count()
    customers_new_month = User.objects.filter(
        role='customer', created_at__year=now.year, created_at__month=now.month
    ).count()

    # ── perlu perhatian ──
    pending_approval = Order.objects.filter(status='waiting_admin_approval').count()
    low_stock_count = Product.objects.filter(is_active=True, stock__lte=LOW_STOCK_THRESHOLD).count()

    # ── breakdown status pesanan ──
    status_breakdown = {
        row['status']: row['c']
        for row in Order.objects.values('status').annotate(c=Count('id'))
    }

    # ── grafik pendapatan 6 bulan terakhir ──
    revenue_series = []
    for (y, m) in _last_six_months(now):
        total = (
            Order.objects.filter(status=REVENUE_STATUS, created_at__year=y, created_at__month=m)
            .aggregate(total=Sum('grand_total'))['total']
            or 0
        )
        revenue_series.append({'label': MONTHS_ID[m - 1], 'value': int(total)})

    # ── pesanan terbaru ──
    recent_orders = []
    for o in Order.objects.select_related('user').order_by('-created_at')[:6]:
        recent_orders.append({
            'order_code': o.order_code or f'ORD-{o.id}',
            'customer': (o.user.name if o.user else '') or o.recipient_name or '-',
            'grand_total': o.grand_total,
            'status': o.status,
            'status_label': STATUS_LABELS.get(o.status, o.status),
            'created_at': o.created_at.isoformat() if o.created_at else '',
        })

    # ── produk terlaris (dari jumlah unit terjual di order_item) ──
    top_rows = (
        OrderItem.objects.values('product_id')
        .annotate(sold=Sum('quantity'))
        .order_by('-sold')[:5]
    )
    product_ids = [r['product_id'] for r in top_rows if r['product_id']]
    product_map = {
        p.id: p for p in Product.objects.select_related('category').filter(id__in=product_ids)
    }
    top_products = []
    for r in top_rows:
        product = product_map.get(r['product_id'])
        # kalau produk sudah dihapus, pakai nama snapshot dari order_item
        snapshot_name = (
            OrderItem.objects.filter(product_id=r['product_id'])
            .values_list('product_name', flat=True)
            .first()
        )
        top_products.append({
            'id': r['product_id'],
            'name': product.name if product else (snapshot_name or 'Produk'),
            'category': product.category.name if (product and product.category) else '',
            'image': product.image if product else '',
            'sold': int(r['sold'] or 0),
        })

    return Response({
        'revenue_total': int(revenue_total),
        'orders_total': orders_total,
        'orders_today': orders_today,
        'products_total': products_total,
        'products_active': products_active,
        'customers_total': customers_total,
        'customers_new_month': customers_new_month,
        'pending_approval': pending_approval,
        'low_stock_count': low_stock_count,
        'low_stock_threshold': LOW_STOCK_THRESHOLD,
        'status_breakdown': status_breakdown,
        'revenue_series': revenue_series,
        'recent_orders': recent_orders,
        'top_products': top_products,
        'generated_at': now.isoformat(),
    })
