from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0009_order_monitoring_device_risk_score'),
    ]

    operations = [
        migrations.AddField(
            model_name='ordermonitoring',
            name='total_risk_score',
            field=models.IntegerField(db_column='TOTAL_RISK_SCORE', default=0),
        ),
    ]
