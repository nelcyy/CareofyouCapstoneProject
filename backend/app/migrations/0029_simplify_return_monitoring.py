from django.db import migrations, models


TOTAL_RISK_SUPPORTING_WEIGHT = 0.45

DEVICE_STATUS_SCORES = {
    'same_order_device': 0,
    'different_known_device': 12,
    'different_new_trusted_device': 22,
    'different_unregistered_device': 35,
}
PASSWORD_STATUS_SCORES = {
    'clean_password': 0,
    'one_failed_password': 8,
    'two_failed_password': 18,
    'many_failed_password': 30,
}
OTP_STATUS_SCORES = {
    'clean_otp': 0,
    'one_failed_otp': 6,
    'two_failed_otp': 14,
    'many_failed_otp': 24,
}
EXCHANGE_ADDRESS_STATUS_SCORES = {
    'same_exchange_address': 0,
    'different_exchange_address': 12,
}
RETURN_TIMING_STATUS_SCORES = {
    'normal_return_timing': 0,
    'same_day_return_timing': 6,
    'fast_return_timing': 18,
}


def _decision_risk_level(score):
    score = int(score or 0)
    if score >= 70:
        return 'critical'
    if score >= 50:
        return 'high'
    if score >= 25:
        return 'medium'
    return 'low'


def _password_status_for_count(password_count):
    password_count = max(0, int(password_count or 0))
    if password_count == 0:
        return 'clean_password'
    if password_count == 1:
        return 'one_failed_password'
    if password_count == 2:
        return 'two_failed_password'
    return 'many_failed_password'


def _otp_status_for_count(otp_count):
    otp_count = max(0, int(otp_count or 0))
    if otp_count == 0:
        return 'clean_otp'
    if otp_count == 1:
        return 'one_failed_otp'
    if otp_count == 2:
        return 'two_failed_otp'
    return 'many_failed_otp'


def _device_status_from_legacy(same_device_as_order, trusted_device_status):
    if same_device_as_order:
        return 'same_order_device'
    if trusted_device_status in ('usual', 'known_rare'):
        return 'different_known_device'
    if trusted_device_status == 'new_trusted':
        return 'different_new_trusted_device'
    return 'different_unregistered_device'


def _exchange_address_status_from_legacy(return_entry, exchange_address_same_as_order):
    if getattr(return_entry, 'resolution_type', '') != 'exchange':
        return ''
    if exchange_address_same_as_order:
        return 'same_exchange_address'
    return 'different_exchange_address'


def _return_timing_status_from_minutes(return_after_completion_minutes):
    minutes = max(0, int(return_after_completion_minutes or 0))
    if minutes <= 120:
        return 'fast_return_timing'
    if minutes <= 24 * 60:
        return 'same_day_return_timing'
    return 'normal_return_timing'


def _total_risk_score(device_score, password_score, otp_score, exchange_address_score, return_timing_score):
    identity_risk_score = min(
        100,
        max(0, int(device_score or 0))
        + max(0, int(password_score or 0))
        + max(0, int(otp_score or 0)),
    )
    return_pattern_score = min(
        100,
        max(0, int(exchange_address_score or 0))
        + max(0, int(return_timing_score or 0)),
    )
    dominant_risk = max(identity_risk_score, return_pattern_score)
    supporting_risk = min(identity_risk_score, return_pattern_score)
    return min(
        100,
        dominant_risk + int(round(supporting_risk * TOTAL_RISK_SUPPORTING_WEIGHT)),
    )


def _simplify_return_monitoring(apps, schema_editor):
    ReturnMonitoring = apps.get_model('app', 'ReturnMonitoring')
    AdminReturnActionSession = apps.get_model('app', 'AdminReturnActionSession')

    return_scores = {}
    for monitoring in ReturnMonitoring.objects.select_related('return_entry').all():
        password_count = max(0, int(monitoring.failed_password_count or 0))
        password_status = _password_status_for_count(password_count)
        password_score = PASSWORD_STATUS_SCORES[password_status]

        otp_count = max(0, int(monitoring.failed_otp_count or 0))
        otp_status = _otp_status_for_count(otp_count)
        otp_score = OTP_STATUS_SCORES[otp_status]

        device_status = _device_status_from_legacy(
            getattr(monitoring, 'same_device_as_order', False),
            getattr(monitoring, 'trusted_device_status', ''),
        )
        device_score = DEVICE_STATUS_SCORES[device_status]

        exchange_address_status = _exchange_address_status_from_legacy(
            monitoring.return_entry,
            getattr(monitoring, 'exchange_address_same_as_order', False),
        )
        exchange_address_score = EXCHANGE_ADDRESS_STATUS_SCORES.get(exchange_address_status, 0)

        return_timing_status = _return_timing_status_from_minutes(
            getattr(monitoring, 'return_after_completion_minutes', 0),
        )
        return_timing_score = RETURN_TIMING_STATUS_SCORES[return_timing_status]

        total_risk_score = _total_risk_score(
            device_score,
            password_score,
            otp_score,
            exchange_address_score,
            return_timing_score,
        )

        monitoring.device_status = device_status
        monitoring.device_score = device_score
        monitoring.password_count = password_count
        monitoring.password_status = password_status
        monitoring.password_score = password_score
        monitoring.otp_count = otp_count
        monitoring.otp_status = otp_status
        monitoring.otp_score = otp_score
        monitoring.exchange_address_status = exchange_address_status
        monitoring.exchange_address_score = exchange_address_score
        monitoring.return_timing_status = return_timing_status
        monitoring.return_timing_score = return_timing_score
        monitoring.total_risk_score = total_risk_score
        monitoring.save(update_fields=[
            'device_status',
            'device_score',
            'password_count',
            'password_status',
            'password_score',
            'otp_count',
            'otp_status',
            'otp_score',
            'exchange_address_status',
            'exchange_address_score',
            'return_timing_status',
            'return_timing_score',
            'total_risk_score',
        ])
        return_scores[monitoring.return_entry_id] = (
            total_risk_score,
            _decision_risk_level(total_risk_score),
        )

    for action_session in AdminReturnActionSession.objects.all():
        if action_session.return_entry_id not in return_scores:
            continue
        total_risk_score, risk_level = return_scores[action_session.return_entry_id]
        session_updates = {}
        if int(action_session.decision_risk_score or 0) != total_risk_score:
            session_updates['decision_risk_score'] = total_risk_score
        if (action_session.decision_risk_level or '') != risk_level:
            session_updates['decision_risk_level'] = risk_level
        if session_updates:
            AdminReturnActionSession.objects.filter(pk=action_session.pk).update(**session_updates)


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0028_reset_runtime_data_and_simplify_order_monitoring'),
    ]

    operations = [
        migrations.AddField(
            model_name='returnmonitoring',
            name='device_status',
            field=models.CharField(blank=True, db_column='DEVICE_STATUS', default='different_unregistered_device', max_length=50),
        ),
        migrations.AddField(
            model_name='returnmonitoring',
            name='device_score',
            field=models.IntegerField(db_column='DEVICE_SCORE', default=0),
        ),
        migrations.AddField(
            model_name='returnmonitoring',
            name='password_count',
            field=models.IntegerField(db_column='PASSWORD_COUNT', default=0),
        ),
        migrations.AddField(
            model_name='returnmonitoring',
            name='password_status',
            field=models.CharField(blank=True, db_column='PASSWORD_STATUS', default='clean_password', max_length=50),
        ),
        migrations.AddField(
            model_name='returnmonitoring',
            name='password_score',
            field=models.IntegerField(db_column='PASSWORD_SCORE', default=0),
        ),
        migrations.AddField(
            model_name='returnmonitoring',
            name='otp_count',
            field=models.IntegerField(db_column='OTP_COUNT', default=0),
        ),
        migrations.AddField(
            model_name='returnmonitoring',
            name='otp_status',
            field=models.CharField(blank=True, db_column='OTP_STATUS', default='clean_otp', max_length=50),
        ),
        migrations.AddField(
            model_name='returnmonitoring',
            name='otp_score',
            field=models.IntegerField(db_column='OTP_SCORE', default=0),
        ),
        migrations.AddField(
            model_name='returnmonitoring',
            name='exchange_address_status',
            field=models.CharField(blank=True, db_column='EXCHANGE_ADDRESS_STATUS', default='', max_length=50),
        ),
        migrations.AddField(
            model_name='returnmonitoring',
            name='exchange_address_score',
            field=models.IntegerField(db_column='EXCHANGE_ADDRESS_SCORE', default=0),
        ),
        migrations.AddField(
            model_name='returnmonitoring',
            name='return_timing_status',
            field=models.CharField(blank=True, db_column='RETURN_TIMING_STATUS', default='normal_return_timing', max_length=50),
        ),
        migrations.AddField(
            model_name='returnmonitoring',
            name='return_timing_score',
            field=models.IntegerField(db_column='RETURN_TIMING_SCORE', default=0),
        ),
        migrations.RunPython(_simplify_return_monitoring, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='returnmonitoring',
            name='trusted_device_status',
        ),
        migrations.RemoveField(
            model_name='returnmonitoring',
            name='device_risk_score',
        ),
        migrations.RemoveField(
            model_name='returnmonitoring',
            name='failed_password_count',
        ),
        migrations.RemoveField(
            model_name='returnmonitoring',
            name='failed_password_score',
        ),
        migrations.RemoveField(
            model_name='returnmonitoring',
            name='failed_otp_count',
        ),
        migrations.RemoveField(
            model_name='returnmonitoring',
            name='failed_otp_score',
        ),
        migrations.RemoveField(
            model_name='returnmonitoring',
            name='order_device_label_snapshot',
        ),
        migrations.RemoveField(
            model_name='returnmonitoring',
            name='same_device_as_order',
        ),
        migrations.RemoveField(
            model_name='returnmonitoring',
            name='device_mismatch_score',
        ),
        migrations.RemoveField(
            model_name='returnmonitoring',
            name='hijack_risk_score',
        ),
        migrations.RemoveField(
            model_name='returnmonitoring',
            name='exchange_address_same_as_order',
        ),
        migrations.RemoveField(
            model_name='returnmonitoring',
            name='exchange_address_age_minutes',
        ),
        migrations.RemoveField(
            model_name='returnmonitoring',
            name='exchange_new_address_score',
        ),
        migrations.RemoveField(
            model_name='returnmonitoring',
            name='exchange_address_mismatch_score',
        ),
        migrations.RemoveField(
            model_name='returnmonitoring',
            name='exchange_address_risk_score',
        ),
        migrations.RemoveField(
            model_name='returnmonitoring',
            name='account_age_days',
        ),
        migrations.RemoveField(
            model_name='returnmonitoring',
            name='recent_returns_30d_count',
        ),
        migrations.RemoveField(
            model_name='returnmonitoring',
            name='recent_returns_90d_count',
        ),
        migrations.RemoveField(
            model_name='returnmonitoring',
            name='frequent_return_score',
        ),
        migrations.RemoveField(
            model_name='returnmonitoring',
            name='return_after_completion_minutes',
        ),
        migrations.RemoveField(
            model_name='returnmonitoring',
            name='rapid_return_score',
        ),
        migrations.RemoveField(
            model_name='returnmonitoring',
            name='new_account_return_score',
        ),
        migrations.RemoveField(
            model_name='returnmonitoring',
            name='return_abuse_score',
        ),
        migrations.RemoveField(
            model_name='returnmonitoring',
            name='trusted_device_created_at_snapshot',
        ),
    ]
