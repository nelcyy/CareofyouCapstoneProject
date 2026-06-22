from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0008_order_monitoring'),
    ]

    operations = [
        migrations.AddField(
            model_name='ordermonitoring',
            name='device_risk_score',
            field=models.IntegerField(db_column='DEVICE_RISK_SCORE', default=0),
        ),
    ]
