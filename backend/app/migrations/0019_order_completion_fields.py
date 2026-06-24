from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0018_order_shipping_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='delivery_proof',
            field=models.TextField(blank=True, db_column='DELIVERY_PROOF', default=''),
        ),
        migrations.AddField(
            model_name='order',
            name='completed_at',
            field=models.DateTimeField(blank=True, db_column='COMPLETED_AT', null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='completed_by',
            field=models.ForeignKey(
                blank=True,
                db_column='COMPLETED_BY',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='completed_orders',
                to='app.user',
            ),
        ),
    ]
