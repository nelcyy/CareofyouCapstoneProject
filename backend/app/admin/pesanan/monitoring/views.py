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


# ======================= FRAUD: ALAMAT =======================
def serialize_address_fraud_monitoring(monitoring):
    return {
        'address_age_minutes': monitoring.address_age_minutes,
        'new_address_score': monitoring.new_address_score,
    }


# ======================= FRAUD: NOMINAL =======================
def serialize_amount_fraud_monitoring(monitoring):
    return {
        'order_amount_ratio_percent': monitoring.order_amount_ratio_percent,
        'amount_anomaly_score': monitoring.amount_anomaly_score,
    }


# ======================= FRAUD: QTY =======================
def serialize_qty_fraud_monitoring(monitoring):
    return {
        'total_item_quantity': monitoring.total_item_quantity,
        'max_single_product_quantity': monitoring.max_single_product_quantity,
        'bulk_order_score': monitoring.bulk_order_score,
    }


# ======================= FRAUD: AKUN BARU =======================
def serialize_new_account_fraud_monitoring(monitoring):
    return {
        'account_age_days': monitoring.account_age_days,
        'new_account_big_order_score': monitoring.new_account_big_order_score,
    }


# ======================= FRAUD: ORDER CEPAT =======================
def serialize_rapid_order_fraud_monitoring(monitoring):
    return {
        'recent_orders_30m_count': monitoring.recent_orders_30m_count,
        'rapid_order_score': monitoring.rapid_order_score,
    }


# ======================= FRAUD: GABUNGAN =======================
def serialize_fraud_monitoring(monitoring):
    return {
        'address': serialize_address_fraud_monitoring(monitoring),
        'amount': serialize_amount_fraud_monitoring(monitoring),
        'qty': serialize_qty_fraud_monitoring(monitoring),
        'new_account': serialize_new_account_fraud_monitoring(monitoring),
        'rapid_order': serialize_rapid_order_fraud_monitoring(monitoring),
        'fraud_risk_score': monitoring.fraud_risk_score,
    }


# ======================= RINGKASAN =======================
def serialize_summary_monitoring(monitoring):
    return {
        'hijack_risk_score': monitoring.hijack_risk_score,
        'fraud_risk_score': monitoring.fraud_risk_score,
        'total_risk_score': monitoring.total_risk_score,
    }


# ======================= GABUNGAN MONITORING =======================
def serialize_order_monitoring(monitoring):
    return {
        'device': serialize_device_monitoring(monitoring),
        'password': serialize_password_monitoring(monitoring),
        'otp': serialize_otp_monitoring(monitoring),
        'fraud': serialize_fraud_monitoring(monitoring),
        'summary': serialize_summary_monitoring(monitoring),
    }


# ======================= HELPER ORDER =======================
def get_order_monitoring_payload(order):
    try:
        monitoring = order.monitoring
    except OrderMonitoring.DoesNotExist:
        return None
    return serialize_order_monitoring(monitoring)
