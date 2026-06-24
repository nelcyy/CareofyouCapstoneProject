"""Backend ADMIN > PESANAN > E-RECEIPT."""
import base64
import hashlib
import io

from django.db import IntegrityError
from django.http import HttpResponse
from django.utils import timezone
from django.utils.html import escape
from rest_framework import status as http_status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ....models import EReceipt, Order, User


def _receipt_order_queryset():
    return Order.objects.select_related('user', 'processed_by', 'e_receipt').prefetch_related('items')


def _request_value(request, key):
    if request.method == 'GET':
        return request.query_params.get(key)
    return request.data.get(key)


def _get_admin_user(admin_user_id):
    if not admin_user_id:
        return None
    return User.objects.filter(id=admin_user_id, role='admin').first()


def _get_order(order_code):
    if not order_code:
        return None
    return _receipt_order_queryset().filter(order_code=order_code).first()


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


def _fmt_idr(amount):
    amount = int(amount or 0)
    return f"Rp {amount:,}".replace(',', '.')


def _generate_signature(order_code, email, total, generated_at_iso):
    raw = f'{order_code}:{email}:{total}:{generated_at_iso}'
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def _barcode_bars(order_code):
    seed = 0
    for char in order_code or '':
        seed = ((seed << 5) - seed + ord(char)) & 0xFFFFFFFF
    if seed >= 0x80000000:
        seed -= 0x100000000

    bars = []
    for index in range(58):
        value = abs(seed ^ (index * 2654435761)) % 100
        height = 14 + (value % 30)
        width = 3 if value % 3 == 0 else (2 if value % 2 == 0 else 1)
        bars.append(f'<div class="rc-bar" style="width:{width}px;height:{height}px"></div>')
    return ''.join(bars)


def _payment_label(order):
    method = (order.payment_method or '').replace('_', ' ').title()
    if order.payment_target:
        return f'{method} - {order.payment_target}'
    return method or '-'


def _approval_date_label(order):
    when = order.processed_at or order.created_at or timezone.now()
    return timezone.localtime(when).strftime('%d %b %Y %H:%M')


def _build_receipt_html(order):
    customer_name = escape((order.user.name if order.user else '') or order.recipient_name or '-')
    recipient_name = escape(order.recipient_name or '-')
    customer_email = escape(order.user.email if order.user else '-')
    address_line = escape(order.address_line or '-')
    city = escape(order.city or '-')
    province = escape(order.province or '-')
    postal_code = escape(order.postal_code or '-')
    courier_name = escape(order.courier_name or '-')
    payment_label = escape(_payment_label(order))
    order_code = escape(order.order_code or '-')
    order_ref = escape((order.order_code or '').replace('-', '') + ' 0 1 7 5 8 3')
    barcode = _barcode_bars(order.order_code or '')
    address_summary = f'{address_line}, {city}, {province} {postal_code}'
    items_html = ''

    for item in order.items.all().order_by('id'):
        product_name = escape(item.product_name or '-')
        item_qty = int(item.quantity or 0)
        product_price = _fmt_idr(item.product_price)
        item_subtotal = _fmt_idr(item.subtotal)
        items_html += f"""
        <div class="rc-item">
          <div class="rc-item-header">
            <div class="rc-item-dot"></div>
            <span class="rc-item-name">{product_name}</span>
          </div>
          <div class="rc-item-footer">
            <span class="rc-item-qty">{item_qty} pcs x {product_price}</span>
            <span class="rc-item-total">{item_subtotal}</span>
          </div>
        </div>"""

    return f"""<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>E-Receipt careofyou - {order_code}</title>
  <style>
    @page {{ margin: 0; size: 520px auto; }}
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
      background: white;
      padding: 32px 20px 48px;
    }}
    .receipt {{
      background: white;
      width: 100%;
      max-width: 480px;
      margin: 0 auto;
      border-radius: 20px;
      overflow: hidden;
      border: 1.5px solid #f0d5d2;
    }}
    .rc-head {{
      background: linear-gradient(135deg, #d6867c 0%, #c97269 40%, #b05a52 100%);
      padding: 28px 24px 20px;
      text-align: center;
      color: white;
    }}
    .rc-logo-text {{
      font-size: 26px;
      font-weight: 900;
      letter-spacing: 1.5px;
      margin-bottom: 6px;
    }}
    .rc-tagline {{
      font-size: 10px;
      letter-spacing: 2.5px;
      text-transform: uppercase;
      opacity: 0.85;
    }}
    .rc-head-id {{
      display: inline-block;
      margin-top: 10px;
      background: rgba(255,255,255,0.18);
      border: 1px solid rgba(255,255,255,0.3);
      border-radius: 50px;
      padding: 4px 14px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }}
    .rc-success {{
      background: linear-gradient(90deg, #f0fdf4, #ecfdf5);
      border-bottom: 1.5px dashed #86efac;
      padding: 14px 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      color: #15803d;
      font-size: 13.5px;
      font-weight: 700;
    }}
    .rc-success-dot {{
      width: 24px;
      height: 24px;
      background: linear-gradient(135deg, #22c55e, #16a34a);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 13px;
      font-weight: 900;
      flex-shrink: 0;
    }}
    .rc-body {{ padding: 20px 20px 0; }}
    .rc-section-label {{
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      color: #c97269;
      margin-bottom: 10px;
    }}
    .rc-info-grid {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 18px;
    }}
    .rc-info-box {{
      background: linear-gradient(135deg, #fffaf9, #fdf5f3);
      border-radius: 10px;
      padding: 11px 13px;
      border: 1.5px solid #f0d5d2;
    }}
    .rc-info-box-label {{
      font-size: 10px;
      color: #b0a8a6;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      margin-bottom: 4px;
    }}
    .rc-info-box-val {{
      font-size: 12.5px;
      font-weight: 800;
      color: #2d2d2d;
      line-height: 1.3;
      word-break: break-word;
    }}
    .rc-items {{
      margin-bottom: 14px;
      display: flex;
      flex-direction: column;
      gap: 7px;
    }}
    .rc-item {{
      padding: 12px 14px;
      background: linear-gradient(135deg, #fffaf9, #fdf5f3);
      border-radius: 10px;
      border: 1.5px solid #f0d5d2;
    }}
    .rc-item-header {{
      display: flex;
      align-items: flex-start;
      gap: 9px;
      margin-bottom: 7px;
    }}
    .rc-item-dot {{
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: linear-gradient(135deg, #d6867c, #c97269);
      flex-shrink: 0;
      margin-top: 3px;
    }}
    .rc-item-name {{
      font-size: 13px;
      font-weight: 700;
      color: #2d2d2d;
      line-height: 1.45;
      word-break: break-word;
    }}
    .rc-item-footer {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-left: 17px;
      gap: 12px;
    }}
    .rc-item-qty {{
      font-size: 11px;
      color: #b0a8a6;
      font-weight: 500;
    }}
    .rc-item-total {{
      font-size: 13.5px;
      font-weight: 900;
      color: #c97269;
    }}
    .rc-summary {{
      border-top: 1.5px dashed #f0d5d2;
      padding: 12px 0;
      margin: 0 20px;
    }}
    .rc-summary-row {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      color: #7a7a7a;
      margin-bottom: 6px;
    }}
    .rc-total-row {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      background: linear-gradient(135deg, rgba(201,114,105,0.1) 0%, rgba(201,114,105,0.05) 100%);
      border-top: 2px solid #f0d5d2;
      margin-top: 4px;
    }}
    .rc-total-label {{
      font-size: 14px;
      font-weight: 700;
      color: #2d2d2d;
    }}
    .rc-total-val {{
      font-size: 24px;
      font-weight: 900;
      color: #c97269;
      letter-spacing: -0.5px;
    }}
    .rc-barcode-wrap {{
      padding: 18px 20px 14px;
      text-align: center;
      border-top: 1px solid #f5eeec;
      background: #fffcfb;
    }}
    .rc-barcode {{
      display: flex;
      justify-content: center;
      align-items: flex-end;
      gap: 1.5px;
      height: 44px;
      margin-bottom: 8px;
    }}
    .rc-bar {{
      background: #2d2d2d;
      border-radius: 1px;
    }}
    .rc-order-ref {{
      font-size: 10.5px;
      color: #b0a8a6;
      font-weight: 600;
      letter-spacing: 2px;
    }}
    .rc-footer {{
      background: linear-gradient(135deg, #fdf0ef, #fff5f3);
      border-top: 1.5px solid #f0d5d2;
      padding: 16px 24px;
      text-align: center;
    }}
    .rc-footer-main {{
      font-size: 13.5px;
      color: #2d2d2d;
      font-weight: 700;
      margin-bottom: 4px;
    }}
    .rc-footer-sub {{
      font-size: 11px;
      color: #b0a8a6;
      font-weight: 500;
      line-height: 1.5;
    }}
    .rc-footer-brand {{
      margin-top: 10px;
      font-size: 10px;
      color: #c97269;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      opacity: 0.7;
    }}
  </style>
</head>
<body>
  <div class="receipt">
    <div class="rc-head">
      <div class="rc-logo-text">careofyou</div>
      <div class="rc-tagline">Struk Pembelian Resmi</div>
      <div class="rc-head-id">{order_code}</div>
    </div>
    <div class="rc-success">
      <div class="rc-success-dot">&#10003;</div>
      Pembayaran Berhasil Dikonfirmasi
    </div>
    <div class="rc-body">
      <p class="rc-section-label">Info Transaksi</p>
      <div class="rc-info-grid">
        <div class="rc-info-box">
          <div class="rc-info-box-label">No. Pesanan</div>
          <div class="rc-info-box-val">{order_code}</div>
        </div>
        <div class="rc-info-box">
          <div class="rc-info-box-label">Tanggal Approve</div>
          <div class="rc-info-box-val">{escape(_approval_date_label(order))}</div>
        </div>
        <div class="rc-info-box">
          <div class="rc-info-box-label">Metode Bayar</div>
          <div class="rc-info-box-val">{payment_label}</div>
        </div>
        <div class="rc-info-box">
          <div class="rc-info-box-label">Penerima</div>
          <div class="rc-info-box-val">{recipient_name}</div>
        </div>
        <div class="rc-info-box">
          <div class="rc-info-box-label">Customer</div>
          <div class="rc-info-box-val">{customer_name}</div>
        </div>
        <div class="rc-info-box">
          <div class="rc-info-box-label">Email</div>
          <div class="rc-info-box-val">{customer_email}</div>
        </div>
        <div class="rc-info-box">
          <div class="rc-info-box-label">Kurir</div>
          <div class="rc-info-box-val">{courier_name}</div>
        </div>
        <div class="rc-info-box">
          <div class="rc-info-box-label">Alamat</div>
          <div class="rc-info-box-val">{address_summary}</div>
        </div>
      </div>
      <p class="rc-section-label">Produk Dipesan</p>
      <div class="rc-items">{items_html}</div>
    </div>
    <div class="rc-summary">
      <div class="rc-summary-row">
        <span>Subtotal</span>
        <span style="font-weight:700;color:#2d2d2d">{_fmt_idr(order.subtotal)}</span>
      </div>
      <div class="rc-summary-row">
        <span>Ongkos Kirim</span>
        <span style="font-weight:700;color:#2d2d2d">{_fmt_idr(order.shipping_fee)}</span>
      </div>
    </div>
    <div class="rc-total-row">
      <span class="rc-total-label">Total Pembayaran</span>
      <span class="rc-total-val">{_fmt_idr(order.grand_total)}</span>
    </div>
    <div class="rc-barcode-wrap">
      <div class="rc-barcode">{barcode}</div>
      <div class="rc-order-ref">{order_ref}</div>
    </div>
    <div class="rc-footer">
      <div class="rc-footer-main">Terima kasih sudah belanja di careofyou</div>
      <div class="rc-footer-sub">Simpan struk ini sebagai bukti pembelian resmi.</div>
      <div class="rc-footer-sub">Barang akan diproses setelah approval admin selesai.</div>
      <div class="rc-footer-brand">careofyou.id</div>
    </div>
  </div>
</body>
</html>"""


def _generate_receipt_pdf(order):
    from pypdf import PdfReader, PdfWriter
    from weasyprint import HTML

    generated_at = timezone.now()
    generated_at_iso = generated_at.isoformat()
    customer_email = order.user.email if order.user else ''
    signature = _generate_signature(order.order_code, customer_email, order.grand_total, generated_at_iso)
    html_content = _build_receipt_html(order)
    pdf_bytes = HTML(string=html_content).write_pdf()

    reader = PdfReader(io.BytesIO(pdf_bytes))
    writer = PdfWriter()
    writer.append(reader)
    writer.add_metadata({
        '/Title': f'E-Receipt careofyou - {order.order_code}',
        '/Author': 'careofyou',
        '/Subject': 'CAREOFYOU-VERIFIED',
        '/Keywords': f'sig:{signature}:end',
    })

    final_buffer = io.BytesIO()
    writer.write(final_buffer)
    final_buffer.seek(0)
    pdf_b64 = base64.b64encode(final_buffer.read()).decode('utf-8')
    return pdf_b64, signature, generated_at


def _receipt_payload(receipt):
    return {
        'receipt_id': receipt.receipt_id,
        'order_code': receipt.order.order_code,
        'customer_name': receipt.customer_name,
        'customer_email': receipt.customer_email,
        'total': receipt.total,
        'generated_at': receipt.generated_at.isoformat() if receipt.generated_at else '',
        'is_revoked': receipt.is_revoked,
    }


def ensure_order_receipt(order):
    receipt = _active_receipt(order)
    if receipt:
        return receipt, True
    if not _order_allows_receipt(order):
        raise ValueError('E-receipt hanya tersedia setelah pesanan di-approve admin.')

    pdf_b64, signature, generated_at = _generate_receipt_pdf(order)

    try:
        receipt = EReceipt.objects.create(
            order=order,
            customer_name=(order.user.name if order.user else '') or order.recipient_name or '',
            customer_email=order.user.email if order.user else '',
            total=order.grand_total,
            signature_hash=signature,
            generated_at=generated_at,
            pdf_b64=pdf_b64,
        )
    except IntegrityError:
        receipt = EReceipt.objects.filter(order=order, is_revoked=False).first()
        if receipt:
            return receipt, True
        raise

    return receipt, False


def generate_receipt_for_order_id(order_id):
    order = _receipt_order_queryset().filter(id=order_id).first()
    if order is None or not _order_allows_receipt(order):
        return None
    receipt, _ = ensure_order_receipt(order)
    return receipt


def _missing_dependency_response(exc):
    message = f'Gagal memuat dependency e-receipt: {exc}'
    if isinstance(exc, ModuleNotFoundError):
        package_name = getattr(exc, 'name', '') or str(exc)
        message = (
            f'Dependency backend untuk e-receipt belum terpasang: {package_name}. '
            'Jalankan install dependency backend terlebih dahulu.'
        )
    elif isinstance(exc, OSError):
        error_text = str(exc).lower()
        if 'gobject' in error_text or 'pango' in error_text or 'cairo' in error_text:
            message = (
                'WeasyPrint sudah terpasang, tapi dependency native Windows belum lengkap. '
                'Pastikan library GTK/Pango/Cairo untuk WeasyPrint sudah tersedia.'
            )
    return Response({'error': message}, status=http_status.HTTP_500_INTERNAL_SERVER_ERROR)


def _get_admin_and_order(request):
    order_code = str(_request_value(request, 'order_code') or '').strip()
    admin_user_id = _request_value(request, 'admin_user_id')

    if not order_code:
        return None, None, Response({'error': 'order_code wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)
    if not admin_user_id:
        return None, None, Response({'error': 'admin_user_id wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)

    admin_user = _get_admin_user(admin_user_id)
    if not admin_user:
        return None, None, Response({'error': 'Admin tidak valid.'}, status=http_status.HTTP_400_BAD_REQUEST)

    order = _get_order(order_code)
    if not order:
        return admin_user, None, Response({'error': 'Pesanan tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)

    return admin_user, order, None


def _receipt_response(request, as_attachment):
    _, order, error_response = _get_admin_and_order(request)
    if error_response is not None:
        return error_response
    if not _order_allows_receipt(order):
        return Response(
            {'error': 'E-receipt belum tersedia. Pesanan harus di-approve admin terlebih dahulu.'},
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


@api_view(['POST'])
def generate_receipt(request):
    """Generate e-receipt secara idempotent untuk admin."""
    _, order, error_response = _get_admin_and_order(request)
    if error_response is not None:
        return error_response
    if not _order_allows_receipt(order):
        return Response(
            {'error': 'E-receipt hanya bisa dibuat setelah pesanan di-approve admin.'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    try:
        receipt, already_exists = ensure_order_receipt(order)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=http_status.HTTP_400_BAD_REQUEST)
    except (ModuleNotFoundError, OSError) as exc:
        return _missing_dependency_response(exc)

    return Response({
        'message': 'E-receipt siap digunakan.' if already_exists else 'E-receipt berhasil dibuat.',
        'already_exists': already_exists,
        'receipt': _receipt_payload(receipt),
    }, status=http_status.HTTP_200_OK if already_exists else http_status.HTTP_201_CREATED)


@api_view(['GET'])
def view_receipt(request):
    """Lihat PDF e-receipt langsung di browser/admin frontend."""
    return _receipt_response(request, as_attachment=False)


@api_view(['GET'])
def download_receipt(request):
    """Download PDF e-receipt untuk admin."""
    return _receipt_response(request, as_attachment=True)
