"""Backend ADMIN > PESANAN > MONITORING."""
from ....models import OrderMonitoring


# ======================= DEVICE =======================
TRUSTED_DEVICE_STATUS_LABELS = {
    'usual': 'Yang Biasa Dipakai',
    'known_rare': 'Dikenal Tapi Jarang Dipakai',
    'new_trusted': 'Trusted Device Baru',
    'not_registered': 'Tidak Ada di Trusted Device',
}


def serialize_device_monitoring(monitoring):
    return {
        'login_id': monitoring.login_id,
        'trusted_device_id': monitoring.trusted_device_id,
        'device_label_snapshot': monitoring.device_label_snapshot,
        'trusted_device_status': monitoring.trusted_device_status,
        'trusted_device_status_label': TRUSTED_DEVICE_STATUS_LABELS.get(
            monitoring.trusted_device_status,
            monitoring.trusted_device_status,
        ),
        'device_risk_score': monitoring.device_risk_score,
        'trusted_device_created_at_snapshot': (
            monitoring.trusted_device_created_at_snapshot.isoformat()
            if monitoring.trusted_device_created_at_snapshot else ''
        ),
    }


# ======================= PASSWORD =======================
def serialize_password_monitoring(monitoring):
    return {
        'failed_password_count': monitoring.failed_password_count,
        'failed_password_score': monitoring.failed_password_score,
    }


# ======================= OTP =======================
def serialize_otp_monitoring(monitoring):
    return {
        'failed_otp_count': monitoring.failed_otp_count,
        'failed_otp_score': monitoring.failed_otp_score,
    }


# ======================= GABUNGAN MONITORING =======================
def serialize_order_monitoring(monitoring):
    return {
        'device': serialize_device_monitoring(monitoring),
        'password': serialize_password_monitoring(monitoring),
        'otp': serialize_otp_monitoring(monitoring),
        'total_risk_score': monitoring.total_risk_score,
    }

# ======================= HELPER ORDER =======================
def get_order_monitoring_payload(order):
    try:
        monitoring = order.monitoring
    except OrderMonitoring.DoesNotExist:
        return None
    return serialize_order_monitoring(monitoring)