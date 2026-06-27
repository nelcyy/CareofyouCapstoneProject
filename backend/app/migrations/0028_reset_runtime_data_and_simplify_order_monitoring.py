from django.db import migrations, models


RUNTIME_MODELS = [
    'QrVerification',
    'ProductUnit',
    'ReturnEReceiptVerification',
    'AdminReturnActionSession',
    'ReturnMonitoring',
    'ReturnItem',
    'Return',
    'EReceipt',
    'AdminOrderActionSession',
    'OrderMonitoring',
    'OrderItem',
    'Order',
    'Favorite',
    'CartItem',
    'Address',
    'ActivityLog',
    'OtpSession',
    'TrustedDevice',
]


def _clear_runtime_data(apps, schema_editor):
    for model_name in RUNTIME_MODELS:
        apps.get_model('app', model_name)._default_manager.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0027_remove_ordermonitoring_amount_and_qty_fields'),
    ]

    operations = [
        migrations.RunPython(_clear_runtime_data, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='ordermonitoring',
            name='trusted_device_status',
        ),
        migrations.RemoveField(
            model_name='ordermonitoring',
            name='device_risk_score',
        ),
        migrations.RemoveField(
            model_name='ordermonitoring',
            name='failed_password_count',
        ),
        migrations.RemoveField(
            model_name='ordermonitoring',
            name='failed_password_score',
        ),
        migrations.RemoveField(
            model_name='ordermonitoring',
            name='failed_otp_count',
        ),
        migrations.RemoveField(
            model_name='ordermonitoring',
            name='failed_otp_score',
        ),
        migrations.RemoveField(
            model_name='ordermonitoring',
            name='hijack_risk_score',
        ),
        migrations.RemoveField(
            model_name='ordermonitoring',
            name='address_age_minutes',
        ),
        migrations.RemoveField(
            model_name='ordermonitoring',
            name='new_address_score',
        ),
        migrations.RemoveField(
            model_name='ordermonitoring',
            name='account_age_days',
        ),
        migrations.RemoveField(
            model_name='ordermonitoring',
            name='new_account_big_order_score',
        ),
        migrations.RemoveField(
            model_name='ordermonitoring',
            name='recent_orders_30m_count',
        ),
        migrations.RemoveField(
            model_name='ordermonitoring',
            name='rapid_order_score',
        ),
        migrations.RemoveField(
            model_name='ordermonitoring',
            name='fraud_risk_score',
        ),
        migrations.RemoveField(
            model_name='ordermonitoring',
            name='total_risk_score',
        ),
        migrations.RemoveField(
            model_name='ordermonitoring',
            name='trusted_device_created_at_snapshot',
        ),
        migrations.AddField(
            model_name='ordermonitoring',
            name='device_status',
            field=models.CharField(blank=True, db_column='DEVICE_STATUS', default='not_registered_device', max_length=50),
        ),
        migrations.AddField(
            model_name='ordermonitoring',
            name='device_score',
            field=models.IntegerField(db_column='DEVICE_SCORE', default=0),
        ),
        migrations.AddField(
            model_name='ordermonitoring',
            name='password_count',
            field=models.IntegerField(db_column='PASSWORD_COUNT', default=0),
        ),
        migrations.AddField(
            model_name='ordermonitoring',
            name='password_status',
            field=models.CharField(blank=True, db_column='PASSWORD_STATUS', default='clean_password', max_length=50),
        ),
        migrations.AddField(
            model_name='ordermonitoring',
            name='password_score',
            field=models.IntegerField(db_column='PASSWORD_SCORE', default=0),
        ),
        migrations.AddField(
            model_name='ordermonitoring',
            name='otp_count',
            field=models.IntegerField(db_column='OTP_COUNT', default=0),
        ),
        migrations.AddField(
            model_name='ordermonitoring',
            name='otp_status',
            field=models.CharField(blank=True, db_column='OTP_STATUS', default='clean_otp', max_length=50),
        ),
        migrations.AddField(
            model_name='ordermonitoring',
            name='otp_score',
            field=models.IntegerField(db_column='OTP_SCORE', default=0),
        ),
        migrations.AddField(
            model_name='ordermonitoring',
            name='address_status',
            field=models.CharField(blank=True, db_column='ADDRESS_STATUS', default='stable_address', max_length=50),
        ),
        migrations.AddField(
            model_name='ordermonitoring',
            name='address_score',
            field=models.IntegerField(db_column='ADDRESS_SCORE', default=0),
        ),
        migrations.AddField(
            model_name='ordermonitoring',
            name='account_order_status',
            field=models.CharField(blank=True, db_column='ACCOUNT_ORDER_STATUS', default='normal_new_account_order', max_length=50),
        ),
        migrations.AddField(
            model_name='ordermonitoring',
            name='account_order_score',
            field=models.IntegerField(db_column='ACCOUNT_ORDER_SCORE', default=0),
        ),
        migrations.AddField(
            model_name='ordermonitoring',
            name='order_status',
            field=models.CharField(blank=True, db_column='ORDER_STATUS', default='normal_order_frequency', max_length=50),
        ),
        migrations.AddField(
            model_name='ordermonitoring',
            name='order_score',
            field=models.IntegerField(db_column='ORDER_SCORE', default=0),
        ),
    ]
