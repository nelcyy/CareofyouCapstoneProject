"""Backend ADMIN > RETUR > E-RECEIPT."""
import os

from django.core.files.storage import default_storage
from django.db import transaction
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ...pesanan.ereceipt.views import _missing_dependency_response
from ....models import EReceipt, ReturnEReceiptVerification
from ..returns.views import (
    get_admin_user,
    get_return_entry,
    log_admin_return_activity,
    serialized_return_entry,
)


def _invalid_result(reason):
    return {
        'valid': False,
        'failure_reason': reason,
        'order_code': '',
        'pdf_order_code': '',
        'customer_name': '',
        'customer_email': '',
        'total': 0,
        'generated_at': None,
        'receipt_id': '',
    }, None


def _verify_receipt_file(pdf_file, expected_order_code=None):
    from pypdf import PdfReader

    try:
        reader = PdfReader(pdf_file)
        metadata = reader.metadata or {}
        keywords = metadata.get('/Keywords', '') or ''
    except Exception:
        return _invalid_result('File tidak dapat dibaca atau bukan PDF yang valid')

    signature_hash = None
    if 'sig:' in keywords and ':end' in keywords:
        try:
            start = keywords.index('sig:') + 4
            end = keywords.index(':end', start)
            signature_hash = keywords[start:end].strip()
        except ValueError:
            signature_hash = None

    if not signature_hash:
        return _invalid_result('Signature tidak ditemukan dalam file')

    receipt = (
        EReceipt.objects
        .select_related('order')
        .filter(signature_hash=signature_hash, is_revoked=False)
        .first()
    )
    if receipt is None:
        return _invalid_result('Signature tidak cocok dengan database')

    if expected_order_code and receipt.order.order_code != expected_order_code:
        return {
            'valid': False,
            'failure_reason': (
                f'E-receipt bukan milik pesanan ini '
                f'(PDF: {receipt.order.order_code}, Retur: {expected_order_code})'
            ),
            'order_code': expected_order_code,
            'pdf_order_code': receipt.order.order_code,
            'customer_name': receipt.customer_name,
            'customer_email': receipt.customer_email,
            'total': receipt.total,
            'generated_at': receipt.generated_at.isoformat() if receipt.generated_at else '',
            'receipt_id': receipt.receipt_id,
        }, receipt.generated_at

    return {
        'valid': True,
        'failure_reason': '',
        'order_code': receipt.order.order_code,
        'pdf_order_code': receipt.order.order_code,
        'customer_name': receipt.customer_name,
        'customer_email': receipt.customer_email,
        'total': receipt.total,
        'generated_at': receipt.generated_at.isoformat() if receipt.generated_at else '',
        'receipt_id': receipt.receipt_id,
    }, receipt.generated_at


@api_view(['POST'])
def verify_return_ereceipt(request):
    return_code = str(request.data.get('return_code') or '').strip()
    admin_user_id = request.data.get('admin_user_id')

    if not return_code:
        return Response({'error': 'return_code wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)
    if not admin_user_id:
        return Response({'error': 'admin_user_id wajib diisi.'}, status=http_status.HTTP_400_BAD_REQUEST)

    admin_user = get_admin_user(admin_user_id)
    if admin_user is None:
        return Response({'error': 'Admin tidak valid.'}, status=http_status.HTTP_400_BAD_REQUEST)

    return_entry = get_return_entry(return_code)
    if return_entry is None:
        return Response({'error': 'Data retur tidak ditemukan.'}, status=http_status.HTTP_404_NOT_FOUND)
    if not return_entry.ereceipt_proof:
        return Response({'error': 'Belum ada file e-receipt pada pengajuan retur ini.'}, status=http_status.HTTP_400_BAD_REQUEST)
    if not default_storage.exists(return_entry.ereceipt_proof):
        return Response({'error': 'File e-receipt tidak ditemukan di storage.'}, status=http_status.HTTP_404_NOT_FOUND)

    file_name = os.path.basename(return_entry.ereceipt_proof or '')

    try:
        with default_storage.open(return_entry.ereceipt_proof, 'rb') as pdf_file:
            result, generated_at_value = _verify_receipt_file(
                pdf_file,
                expected_order_code=return_entry.order.order_code if return_entry.order else None,
            )
    except (ModuleNotFoundError, OSError) as exc:
        return _missing_dependency_response(exc)

    with transaction.atomic():
        verification, _ = ReturnEReceiptVerification.objects.update_or_create(
            return_entry=return_entry,
            defaults={
                'status': 'valid' if result['valid'] else 'invalid',
                'failure_reason': result.get('failure_reason', ''),
                'pdf_order_code': result.get('pdf_order_code', ''),
                'receipt_id': result.get('receipt_id', ''),
                'customer_name': result.get('customer_name', ''),
                'customer_email': result.get('customer_email', ''),
                'total': int(result.get('total') or 0),
                'generated_at': generated_at_value,
                'file_name': file_name,
                'verified_by': admin_user,
                'verified_at': timezone.now(),
            },
        )
        event_type = 'admin_return_ereceipt_valid' if result['valid'] else 'admin_return_ereceipt_invalid'
        log_reason = result.get('failure_reason', '') or result.get('receipt_id', '') or file_name
        log_admin_return_activity(admin_user, return_entry, event_type, log_reason)

    return_entry = get_return_entry(return_code) or return_entry
    response_message = (
        'E-receipt valid dan cocok dengan data toko.'
        if verification.status == 'valid'
        else 'E-receipt tidak valid atau tidak cocok dengan pesanan ini.'
    )
    return Response({
        'message': response_message,
        'verification': serialized_return_entry(return_entry, include_monitoring=True).get('ereceipt_verification'),
        'return_entry': serialized_return_entry(return_entry, include_monitoring=True),
    }, status=http_status.HTTP_200_OK)
