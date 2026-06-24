from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0015_admin_order_action_session_and_rejected_status'),
    ]

    operations = [
        migrations.CreateModel(
            name='EReceipt',
            fields=[
                ('id', models.BigAutoField(db_column='ID', primary_key=True, serialize=False)),
                ('receipt_id', models.CharField(blank=True, db_column='RECEIPT_ID', default='', max_length=30, unique=True)),
                ('customer_name', models.CharField(blank=True, db_column='CUSTOMER_NAME', default='', max_length=150)),
                ('customer_email', models.CharField(blank=True, db_column='CUSTOMER_EMAIL', default='', max_length=254)),
                ('total', models.BigIntegerField(db_column='TOTAL', default=0)),
                ('signature_hash', models.CharField(db_column='SIGNATURE_HASH', max_length=64)),
                ('generated_at', models.DateTimeField(db_column='GENERATED_AT')),
                ('pdf_b64', models.TextField(db_column='PDF_B64')),
                ('is_revoked', models.BooleanField(db_column='IS_REVOKED', default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_column='CREATED_AT')),
                ('updated_at', models.DateTimeField(auto_now=True, db_column='UPDATED_AT')),
                ('order', models.OneToOneField(db_column='ORDER_ID', on_delete=django.db.models.deletion.CASCADE, related_name='e_receipt', to='app.order')),
            ],
            options={
                'db_table': 'e_receipts',
            },
        ),
    ]
