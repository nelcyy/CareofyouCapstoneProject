from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0010_order_monitoring_total_risk_score'),
    ]

    operations = [
        migrations.AddField(
            model_name='ordermonitoring',
            name='failed_password_count',
            field=models.IntegerField(db_column='FAILED_PASSWORD_COUNT', default=0),
        ),
        migrations.AddField(
            model_name='ordermonitoring',
            name='failed_password_score',
            field=models.IntegerField(db_column='FAILED_PASSWORD_SCORE', default=0),
        ),
    ]
