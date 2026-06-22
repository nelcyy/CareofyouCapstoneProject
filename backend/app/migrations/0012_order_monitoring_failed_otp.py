from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0011_order_monitoring_failed_password'),
    ]

    operations = [
        migrations.AddField(
            model_name='ordermonitoring',
            name='failed_otp_count',
            field=models.IntegerField(db_column='FAILED_OTP_COUNT', default=0),
        ),
        migrations.AddField(
            model_name='ordermonitoring',
            name='failed_otp_score',
            field=models.IntegerField(db_column='FAILED_OTP_SCORE', default=0),
        ),
    ]
