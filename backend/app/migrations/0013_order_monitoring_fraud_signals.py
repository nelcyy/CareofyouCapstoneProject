from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0012_order_monitoring_failed_otp'),
    ]

    operations = [
        migrations.AddField(
            model_name='ordermonitoring',
            name='hijack_risk_score',
            field=models.IntegerField(db_column='HIJACK_RISK_SCORE', default=0),
        ),
        migrations.AddField(
            model_name='ordermonitoring',
            name='address_age_minutes',
            field=models.IntegerField(db_column='ADDRESS_AGE_MINUTES', default=0),
        ),
        migrations.AddField(
            model_name='ordermonitoring',
            name='new_address_score',
            field=models.IntegerField(db_column='NEW_ADDRESS_SCORE', default=0),
        ),
        migrations.AddField(
            model_name='ordermonitoring',
            name='order_amount_ratio_percent',
            field=models.IntegerField(db_column='ORDER_AMOUNT_RATIO_PERCENT', default=0),
        ),
        migrations.AddField(
            model_name='ordermonitoring',
            name='amount_anomaly_score',
            field=models.IntegerField(db_column='AMOUNT_ANOMALY_SCORE', default=0),
        ),
        migrations.AddField(
            model_name='ordermonitoring',
            name='total_item_quantity',
            field=models.IntegerField(db_column='TOTAL_ITEM_QUANTITY', default=0),
        ),
        migrations.AddField(
            model_name='ordermonitoring',
            name='max_single_product_quantity',
            field=models.IntegerField(db_column='MAX_SINGLE_PRODUCT_QUANTITY', default=0),
        ),
        migrations.AddField(
            model_name='ordermonitoring',
            name='bulk_order_score',
            field=models.IntegerField(db_column='BULK_ORDER_SCORE', default=0),
        ),
        migrations.AddField(
            model_name='ordermonitoring',
            name='account_age_days',
            field=models.IntegerField(db_column='ACCOUNT_AGE_DAYS', default=0),
        ),
        migrations.AddField(
            model_name='ordermonitoring',
            name='new_account_big_order_score',
            field=models.IntegerField(db_column='NEW_ACCOUNT_BIG_ORDER_SCORE', default=0),
        ),
        migrations.AddField(
            model_name='ordermonitoring',
            name='recent_orders_30m_count',
            field=models.IntegerField(db_column='RECENT_ORDERS_30M_COUNT', default=0),
        ),
        migrations.AddField(
            model_name='ordermonitoring',
            name='rapid_order_score',
            field=models.IntegerField(db_column='RAPID_ORDER_SCORE', default=0),
        ),
        migrations.AddField(
            model_name='ordermonitoring',
            name='fraud_risk_score',
            field=models.IntegerField(db_column='FRAUD_RISK_SCORE', default=0),
        ),
    ]
