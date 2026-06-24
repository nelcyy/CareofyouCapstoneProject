from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0014_order_admin_decision_fields'),
    ]

    operations = [
        migrations.AlterField(
            model_name='order',
            name='status',
            field=models.CharField(
                choices=[
                    ('waiting_admin_approval', 'Waiting Admin Approval'),
                    ('rejected', 'Rejected'),
                    ('pengemasan', 'Pengemasan'),
                    ('pengiriman', 'Pengiriman'),
                    ('selesai', 'Selesai'),
                ],
                db_column='STATUS',
                default='waiting_admin_approval',
                max_length=30,
            ),
        ),
        migrations.AlterField(
            model_name='otpsession',
            name='purpose',
            field=models.CharField(
                choices=[
                    ('login', 'Login'),
                    ('register', 'Register'),
                    ('admin_action', 'Admin Action'),
                ],
                db_column='PURPOSE',
                max_length=20,
            ),
        ),
        migrations.CreateModel(
            name='AdminOrderActionSession',
            fields=[
                ('id', models.BigAutoField(db_column='ID', primary_key=True, serialize=False)),
                ('session_id', models.CharField(db_column='SESSION_ID', max_length=64, unique=True)),
                ('action', models.CharField(choices=[('approve', 'Approve'), ('reject', 'Reject')], db_column='ACTION', max_length=20)),
                ('decision_reason', models.CharField(blank=True, db_column='DECISION_REASON', default='', max_length=255)),
                ('decision_risk_score', models.IntegerField(db_column='DECISION_RISK_SCORE', default=0)),
                ('decision_risk_level', models.CharField(blank=True, db_column='DECISION_RISK_LEVEL', default='', max_length=10)),
                ('otp_required', models.BooleanField(db_column='OTP_REQUIRED', default=False)),
                ('otp_verified', models.BooleanField(db_column='OTP_VERIFIED', default=False)),
                ('is_completed', models.BooleanField(db_column='IS_COMPLETED', default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_column='CREATED_AT')),
                ('completed_at', models.DateTimeField(blank=True, db_column='COMPLETED_AT', null=True)),
                ('admin_user', models.ForeignKey(db_column='ADMIN_USER_ID', on_delete=django.db.models.deletion.CASCADE, related_name='admin_order_action_sessions', to='app.user')),
                ('order', models.ForeignKey(db_column='ORDER_ID', on_delete=django.db.models.deletion.CASCADE, related_name='admin_action_sessions', to='app.order')),
            ],
            options={
                'db_table': 'admin_order_action_session',
            },
        ),
    ]
