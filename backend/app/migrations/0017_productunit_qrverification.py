import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0016_ereceipt'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProductUnit',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('order_id', models.CharField(max_length=30)),
                ('order_item_id', models.CharField(max_length=100)),
                ('product_id', models.CharField(blank=True, default='', max_length=100)),
                ('qr_token', models.CharField(max_length=120, unique=True)),
                ('qr_image_url', models.TextField(blank=True, default='')),
                ('qr_status', models.CharField(default='active', max_length=20)),
                ('generated_at', models.DateTimeField(blank=True, null=True)),
                ('generated_by', models.CharField(blank=True, default='', max_length=100)),
                ('is_returned', models.BooleanField(default=False)),
                ('verification_count', models.IntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'product_units',
            },
        ),
        migrations.CreateModel(
            name='QrVerification',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('raw_qr_token', models.CharField(blank=True, default='', max_length=120)),
                ('scanned_by', models.CharField(blank=True, default='', max_length=100)),
                ('verification_result', models.CharField(max_length=30)),
                ('notes', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('product_unit', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='verifications', to='app.productunit')),
            ],
            options={
                'db_table': 'qr_verifications',
            },
        ),
    ]
