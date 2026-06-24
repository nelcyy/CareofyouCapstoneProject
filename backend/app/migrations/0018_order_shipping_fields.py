from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0017_productunit_qrverification'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='tracking_number',
            field=models.CharField(blank=True, db_column='TRACKING_NUMBER', default='', max_length=100),
        ),
        migrations.AddField(
            model_name='order',
            name='shipping_notes',
            field=models.CharField(blank=True, db_column='SHIPPING_NOTES', default='', max_length=255),
        ),
        migrations.AddField(
            model_name='order',
            name='shipped_at',
            field=models.DateTimeField(blank=True, db_column='SHIPPED_AT', null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='shipped_by',
            field=models.ForeignKey(
                blank=True,
                db_column='SHIPPED_BY',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='shipped_orders',
                to='app.user',
            ),
        ),
    ]
