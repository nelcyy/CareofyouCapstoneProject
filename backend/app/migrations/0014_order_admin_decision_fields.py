from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0013_order_monitoring_fraud_signals'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='decision',
            field=models.CharField(
                choices=[('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected')],
                db_column='DECISION',
                default='pending',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='order',
            name='decision_reason',
            field=models.CharField(blank=True, db_column='DECISION_REASON', default='', max_length=255),
        ),
        migrations.AddField(
            model_name='order',
            name='decision_risk_level',
            field=models.CharField(blank=True, db_column='DECISION_RISK_LEVEL', default='', max_length=10),
        ),
        migrations.AddField(
            model_name='order',
            name='decision_risk_score',
            field=models.IntegerField(blank=True, db_column='DECISION_RISK_SCORE', null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='otp_verified_for_action',
            field=models.BooleanField(db_column='OTP_VERIFIED_FOR_ACTION', default=False),
        ),
        migrations.AddField(
            model_name='order',
            name='processed_at',
            field=models.DateTimeField(blank=True, db_column='PROCESSED_AT', null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='processed_by',
            field=models.ForeignKey(
                blank=True,
                db_column='PROCESSED_BY',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='processed_orders',
                to='app.user',
            ),
        ),
    ]
