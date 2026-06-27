"""Backend ADMIN > PESANAN > MONITORING."""
from ....models import OrderMonitoring

TOTAL_RISK_SUPPORTING_WEIGHT = 0.45

DEVICE_STATUS_LABELS = {
    'usual_device': 'Yang Biasa Dipakai',
    'known_rare_device': 'Dikenal Tapi Jarang Dipakai',
    'new_trusted_device': 'Trusted Device Baru',
    'not_registered_device': 'Tidak Ada di Trusted Device',
}
PASSWORD_STATUS_LABELS = {
    'clean_password': 'Tidak Ada Salah Password',
    'one_failed_password': '1x Salah Password',
    'two_failed_password': '2x Salah Password',
    'many_failed_password': '3x+ Salah Password',
}
OTP_STATUS_LABELS = {
    'clean_otp': 'Tidak Ada Gagal OTP',
    'one_failed_otp': '1x Gagal OTP',
    'two_failed_otp': '2x Gagal OTP',
    'many_failed_otp': '3x+ Gagal OTP',
}
ADDRESS_STATUS_LABELS = {
    'stable_address': 'Alamat Lama',
    'recent_address': 'Alamat Baru',
    'fresh_address': 'Alamat Sangat Baru',
}
ACCOUNT_ORDER_STATUS_LABELS = {
    'normal_new_account_order': 'Normal',
    'watch_new_account_order': 'Perlu Diperhatikan',
    'high_new_account_order': 'Risiko Tinggi',
    'very_high_new_account_order': 'Risiko Sangat Tinggi',
}
ORDER_STATUS_LABELS = {
    'normal_order_frequency': 'Frekuensi Normal',
    'one_recent_order': '1 Order Berdekatan',
    'two_recent_order': '2 Order Berdekatan',
    'many_recent_order': '3+ Order Berdekatan',
}


def _order_monitoring_summary(monitoring):
    hijack_risk_score = min(
        100,
        max(0, int(getattr(monitoring, 'device_score', 0) or 0))
        + max(0, int(getattr(monitoring, 'password_score', 0) or 0))
        + max(0, int(getattr(monitoring, 'otp_score', 0) or 0)),
    )
    fraud_risk_score = min(
        100,
        max(0, int(getattr(monitoring, 'address_score', 0) or 0))
        + max(0, int(getattr(monitoring, 'account_order_score', 0) or 0))
        + max(0, int(getattr(monitoring, 'order_score', 0) or 0)),
    )
    dominant_risk = max(hijack_risk_score, fraud_risk_score)
    supporting_risk = min(hijack_risk_score, fraud_risk_score)
    total_risk_score = min(
        100,
        dominant_risk + int(round(supporting_risk * TOTAL_RISK_SUPPORTING_WEIGHT)),
    )
    return {
        'hijack_risk_score': hijack_risk_score,
        'fraud_risk_score': fraud_risk_score,
        'total_risk_score': total_risk_score,
    }


# ======================= DEVICE =======================
def serialize_device_monitoring(monitoring):
    device_status_label = DEVICE_STATUS_LABELS.get(monitoring.device_status, monitoring.device_status)
    return {
        'login_id': monitoring.login_id,
        'trusted_device_id': monitoring.trusted_device_id,
        'device_label_snapshot': monitoring.device_label_snapshot,
        'device_status': monitoring.device_status,
        'device_status_label': device_status_label,
        'device_score': monitoring.device_score,
        'trusted_device_status': monitoring.device_status,
        'trusted_device_status_label': device_status_label,
        'device_risk_score': monitoring.device_score,
    }


# ======================= PASSWORD =======================
def serialize_password_monitoring(monitoring):
    password_status_label = PASSWORD_STATUS_LABELS.get(monitoring.password_status, monitoring.password_status)
    return {
        'password_count': monitoring.password_count,
        'password_status': monitoring.password_status,
        'password_status_label': password_status_label,
        'password_score': monitoring.password_score,
        'failed_password_count': monitoring.password_count,
        'failed_password_score': monitoring.password_score,
    }


# ======================= OTP =======================
def serialize_otp_monitoring(monitoring):
    otp_status_label = OTP_STATUS_LABELS.get(monitoring.otp_status, monitoring.otp_status)
    return {
        'otp_count': monitoring.otp_count,
        'otp_status': monitoring.otp_status,
        'otp_status_label': otp_status_label,
        'otp_score': monitoring.otp_score,
        'failed_otp_count': monitoring.otp_count,
        'failed_otp_score': monitoring.otp_score,
    }


# ======================= FRAUD: ALAMAT =======================
def serialize_address_fraud_monitoring(monitoring):
    address_status_label = ADDRESS_STATUS_LABELS.get(monitoring.address_status, monitoring.address_status)
    return {
        'address_status': monitoring.address_status,
        'address_status_label': address_status_label,
        'address_score': monitoring.address_score,
        'new_address_score': monitoring.address_score,
    }


# ======================= FRAUD: AKUN BARU + ORDER BESAR =======================
def serialize_account_order_fraud_monitoring(monitoring):
    account_order_status_label = ACCOUNT_ORDER_STATUS_LABELS.get(
        monitoring.account_order_status,
        monitoring.account_order_status,
    )
    return {
        'account_order_status': monitoring.account_order_status,
        'account_order_status_label': account_order_status_label,
        'account_order_score': monitoring.account_order_score,
        'new_account_big_order_score': monitoring.account_order_score,
    }


# ======================= FRAUD: ORDER CEPAT =======================
def serialize_order_frequency_fraud_monitoring(monitoring):
    order_status_label = ORDER_STATUS_LABELS.get(monitoring.order_status, monitoring.order_status)
    return {
        'order_status': monitoring.order_status,
        'order_status_label': order_status_label,
        'order_score': monitoring.order_score,
        'rapid_order_score': monitoring.order_score,
    }


# ======================= FRAUD: GABUNGAN =======================
def serialize_fraud_monitoring(monitoring):
    summary = _order_monitoring_summary(monitoring)
    account_order_payload = serialize_account_order_fraud_monitoring(monitoring)
    order_frequency_payload = serialize_order_frequency_fraud_monitoring(monitoring)
    return {
        'address': serialize_address_fraud_monitoring(monitoring),
        'account_order': account_order_payload,
        'new_account': account_order_payload,
        'order_frequency': order_frequency_payload,
        'rapid_order': order_frequency_payload,
        'fraud_risk_score': summary['fraud_risk_score'],
    }


# ======================= RINGKASAN =======================
def serialize_summary_monitoring(monitoring):
    return _order_monitoring_summary(monitoring)


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
