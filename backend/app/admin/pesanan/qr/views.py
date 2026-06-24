"""
QR code API views.

Endpoints (all under /api/admin/pesanan/qr/):
  POST   generate/              -> generate one unit QR after payment approval
  GET    order/<order_id>/      -> list all QR units for an order
  GET    <qr_token>/            -> fetch a single unit by QR token
  POST   verify/                -> verify a scanned QR for return processing
"""
import base64
import io
import secrets
import string

import qrcode
from django.db import IntegrityError
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ....models import ProductUnit, QrVerification


_CHARS = string.ascii_uppercase + string.digits


def generate_qr_token(order_id: str, product_name: str, unit_index: int) -> str:
    """
    Build a human-readable, globally-unique token.

    Format:  UNIT-{ORDER6}-{PROD4}-U{n}-{RAND7}
    Example: UNIT-ORD011-MOIS-U2-X3K9M2P
    """
    order_code = ''.join(char for char in order_id if char.isalnum()).upper()[-6:]
    prod_code = ''.join(char for char in product_name if char.isalnum()).upper()[:4]
    suffix = ''.join(secrets.choice(_CHARS) for _ in range(7))
    return f'UNIT-{order_code}-{prod_code}-U{unit_index}-{suffix}'


def generate_qr_png_base64(token: str) -> str:
    """
    Render a real, scannable QR code from `token` and return it as a
    base64-encoded PNG data-URL ("data:image/png;base64,...").
    """
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(token)
    qr.make(fit=True)

    image = qr.make_image(fill_color='black', back_color='white')
    buffer = io.BytesIO()
    image.save(buffer, kind='PNG')
    buffer.seek(0)

    payload = base64.b64encode(buffer.read()).decode('utf-8')
    return f'data:image/png;base64,{payload}'


def _unit_to_dict(unit: ProductUnit) -> dict:
    generated_at = unit.generated_at or unit.created_at
    return {
        'id': str(unit.id),
        'order_id': unit.order_id,
        'order_item_id': unit.order_item_id,
        'product_id': unit.product_id,
        'qr_token': unit.qr_token,
        'qr_image_url': unit.qr_image_url,
        'qr_status': unit.qr_status,
        'generated_at': generated_at.isoformat() if generated_at else None,
        'generated_by': unit.generated_by,
        'is_returned': unit.is_returned,
        'verification_count': unit.verification_count,
    }


def create_product_unit(
    order_id: str,
    order_item_id: str,
    product_id: str,
    product_name: str,
    unit_index: int,
    generated_by: str,
) -> tuple[dict, bool]:
    """
    Generate a QR token + PNG image, then insert a product_units row.
    Satu unit fisik hanya boleh punya satu QR aktif. Jika sudah pernah dibuat,
    kembalikan data QR yang ada tanpa membuat ulang.
    """
    existing_unit = ProductUnit.objects.filter(
        order_id=order_id,
        order_item_id=order_item_id,
    ).order_by('-created_at').first()
    if existing_unit is not None:
        return _unit_to_dict(existing_unit), True

    for attempt in range(5):
        token = generate_qr_token(order_id, product_name, unit_index)
        qr_image_url = generate_qr_png_base64(token)

        try:
            unit = ProductUnit.objects.create(
                order_id=order_id,
                order_item_id=order_item_id,
                product_id=product_id,
                qr_token=token,
                qr_image_url=qr_image_url,
                qr_status='active',
                generated_at=timezone.now(),
                generated_by=generated_by,
            )
            return _unit_to_dict(unit), False
        except IntegrityError as exc:
            if 'unique' in str(exc).lower() and attempt < 4:
                continue
            raise

    raise RuntimeError('Could not generate a unique QR token after 5 attempts.')


def get_product_unit_by_token(token: str) -> dict | None:
    unit = ProductUnit.objects.filter(qr_token=token).first()
    return _unit_to_dict(unit) if unit else None


def get_product_units_for_order(order_id: str) -> list[dict]:
    units = ProductUnit.objects.filter(order_id=order_id).order_by('order_item_id', 'generated_at', 'created_at')
    return [_unit_to_dict(unit) for unit in units]


def approve_qr_return(unit_id: str, approved_by: str) -> dict:
    """
    Mark a product_unit as returned (qr_status -> 'returned', is_returned -> true).
    Called when admin completes the return process after successful QR verification.
    """
    del approved_by
    unit = ProductUnit.objects.filter(id=unit_id).first()
    if unit is None:
        raise ValueError(f'Unit {unit_id} not found.')

    unit.qr_status = 'returned'
    unit.is_returned = True
    unit.save(update_fields=['qr_status', 'is_returned', 'updated_at'])
    return {
        'unit_id': str(unit.id),
        'qr_token': unit.qr_token,
        'qr_status': unit.qr_status,
        'is_returned': unit.is_returned,
    }


def _log_verification(unit, token: str, scanned_by: str, result: str, notes: str) -> str | None:
    """
    Insert a row into qr_verifications.
    Returns the new row's UUID string or None if logging fails.
    """
    try:
        log_row = QrVerification.objects.create(
            product_unit=unit,
            raw_qr_token=token,
            scanned_by=scanned_by,
            verification_result=result,
            notes=notes,
        )
        return str(log_row.id)
    except Exception:
        return None


def verify_qr_token(
    token: str,
    scanned_by: str,
    claimed_order_id: str | None = None,
    claimed_product_id: str | None = None,
    claimed_order_item_id: str | None = None,
) -> dict:
    """
    Verify a scanned QR token.

    Checks:
      1. Token exists in product_units
      2. qr_status is 'active' and unit not already returned
      3. Optional: order_id cross-check
      4. Optional: product_id cross-check
      5. Optional: order_item_id cross-check
    Logs every scan to qr_verifications regardless of outcome.
    """
    unit = ProductUnit.objects.filter(qr_token=token).first()
    if unit is None:
        _log_verification(None, token, scanned_by, 'not_found', 'Token tidak ditemukan dalam sistem')
        return {
            'is_valid': False,
            'result_code': 'not_found',
            'message': 'QR code tidak ditemukan. Pastikan kode QR benar dan belum rusak.',
            'unit_id': None,
            'order_id': None,
            'product_id': None,
            'verification_id': None,
            'fraud_flag_id': None,
        }

    unit_id_str = str(unit.id)
    order_id = unit.order_id
    product_id = unit.product_id
    order_item_id = unit.order_item_id

    if unit.is_returned or unit.qr_status == 'returned':
        _log_verification(unit, token, scanned_by, 'already_returned', 'Unit sudah dikembalikan sebelumnya')
        return {
            'is_valid': False,
            'result_code': 'already_returned',
            'message': 'Produk ini sudah pernah dikembalikan sebelumnya.',
            'unit_id': unit_id_str,
            'order_id': order_id,
            'product_id': product_id,
            'verification_id': None,
            'fraud_flag_id': None,
        }

    if unit.qr_status != 'active':
        _log_verification(unit, token, scanned_by, 'invalid', f'qr_status bukan active: {unit.qr_status}')
        return {
            'is_valid': False,
            'result_code': 'invalid',
            'message': 'QR code ini tidak aktif dan tidak dapat digunakan.',
            'unit_id': unit_id_str,
            'order_id': order_id,
            'product_id': product_id,
            'verification_id': None,
            'fraud_flag_id': None,
        }

    if claimed_order_id and order_id != claimed_order_id:
        _log_verification(unit, token, scanned_by, 'invalid', f'Order mismatch - QR: {order_id}, klaim: {claimed_order_id}')
        return {
            'is_valid': False,
            'result_code': 'invalid',
            'message': (
                f'QR ini terdaftar untuk pesanan {order_id}, '
                f'bukan {claimed_order_id}. Pastikan QR sesuai dengan produk yang di-return.'
            ),
            'unit_id': unit_id_str,
            'order_id': order_id,
            'product_id': product_id,
            'verification_id': None,
            'fraud_flag_id': None,
        }

    if claimed_product_id and str(product_id) != str(claimed_product_id):
        _log_verification(unit, token, scanned_by, 'invalid', f'Product mismatch - QR: {product_id}, klaim: {claimed_product_id}')
        return {
            'is_valid': False,
            'result_code': 'wrong_product',
            'message': 'QR ini milik produk lain dalam pesanan ini. Pastikan kamu scan QR produk yang benar.',
            'unit_id': unit_id_str,
            'order_id': order_id,
            'product_id': product_id,
            'verification_id': None,
            'fraud_flag_id': None,
        }

    if claimed_order_item_id and str(order_item_id) != str(claimed_order_item_id):
        _log_verification(unit, token, scanned_by, 'invalid', f'Unit mismatch - QR: {order_item_id}, klaim: {claimed_order_item_id}')
        return {
            'is_valid': False,
            'result_code': 'wrong_unit',
            'message': 'QR ini untuk unit lain dari produk yang sama. Pastikan kamu scan QR yang sesuai dengan unit yang di-return.',
            'unit_id': unit_id_str,
            'order_id': order_id,
            'product_id': product_id,
            'verification_id': None,
            'fraud_flag_id': None,
        }

    verification_id = _log_verification(unit, token, scanned_by, 'valid', 'Verifikasi berhasil')
    return {
        'is_valid': True,
        'result_code': 'valid',
        'message': 'Verifikasi berhasil. Produk dapat diproses untuk pengembalian.',
        'unit_id': unit_id_str,
        'order_id': order_id,
        'product_id': product_id,
        'verification_id': verification_id,
        'fraud_flag_id': None,
    }


@api_view(['POST'])
def generate_unit_qr(request):
    """
    Generate a real QR code for one physical product unit.

    Called by the admin dashboard after payment approval, once per unit.
    """
    order_id = request.data.get('order_id', '')
    order_item_id = request.data.get('order_item_id', '')
    product_id = request.data.get('product_id', '')
    product_name = request.data.get('product_name', product_id or 'Product')
    unit_index = request.data.get('unit_index', 1)
    generated_by = request.data.get('generated_by', 'admin')

    if not order_id or not order_item_id:
        return Response(
            {'error': 'order_id dan order_item_id wajib diisi.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        unit, already_exists = create_product_unit(
            order_id=order_id,
            order_item_id=order_item_id,
            product_id=str(product_id or ''),
            product_name=product_name,
            unit_index=int(unit_index),
            generated_by=str(generated_by or 'admin'),
        )
        return Response(
            {
                **unit,
                'already_exists': already_exists,
                'message': 'QR untuk unit ini sudah tersedia.' if already_exists else 'QR berhasil dibuat.',
            },
            status=status.HTTP_200_OK if already_exists else status.HTTP_201_CREATED,
        )
    except Exception as exc:
        return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
def get_order_qrs(request, order_id):
    """
    Return all product_unit QR records for a given order.

    Response:
      { "units": [ { ...unit fields... }, ... ] }
    """
    try:
        units = get_product_units_for_order(order_id)
        return Response({'units': units})
    except Exception as exc:
        return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
def get_qr_detail(request, qr_token):
    """
    Fetch a single product_unit by its QR token.

    Response (200):  { ...unit fields... }
    Response (404):  { "error": "QR token tidak ditemukan." }
    """
    unit = get_product_unit_by_token(qr_token)
    if unit is None:
        return Response(
            {'error': 'QR token tidak ditemukan.'},
            status=status.HTTP_404_NOT_FOUND,
        )
    return Response(unit)


@api_view(['POST'])
def verify_qr(request):
    """
    Verify a scanned QR token for a return request.
    """
    qr_token = request.data.get('qr_token', '')
    scanned_by = request.data.get('scanned_by', '')
    claimed_order_id = request.data.get('claimed_order_id') or None
    claimed_product_id = request.data.get('claimed_product_id') or None
    claimed_order_item_id = request.data.get('claimed_order_item_id') or None

    if not qr_token or not scanned_by:
        return Response(
            {'error': 'qr_token dan scanned_by wajib diisi.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        result = verify_qr_token(
            token=qr_token,
            scanned_by=scanned_by,
            claimed_order_id=claimed_order_id,
            claimed_product_id=claimed_product_id,
            claimed_order_item_id=claimed_order_item_id,
        )
        return Response(result)
    except Exception as exc:
        return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
def approve_qr(request):
    """
    Mark a product_unit as returned after admin confirms the physical return.
    """
    unit_id = request.data.get('unit_id', '')
    approved_by = request.data.get('approved_by', '')

    if not unit_id:
        return Response(
            {'error': 'unit_id wajib diisi.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        result = approve_qr_return(unit_id=unit_id, approved_by=approved_by)
        return Response(result)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_404_NOT_FOUND)
    except Exception as exc:
        return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
