from django.db import migrations


TOTAL_RISK_SUPPORTING_WEIGHT = 0.45


def _decision_risk_level(score):
    score = int(score or 0)
    if score >= 70:
        return 'critical'
    if score >= 50:
        return 'high'
    if score >= 25:
        return 'medium'
    return 'low'


def _recalculate_order_monitoring_scores(apps, schema_editor):
    Order = apps.get_model('app', 'Order')
    OrderMonitoring = apps.get_model('app', 'OrderMonitoring')
    AdminOrderActionSession = apps.get_model('app', 'AdminOrderActionSession')

    order_scores = {}

    for monitoring in OrderMonitoring.objects.all().iterator():
        fraud_risk_score = min(
            100,
            int(monitoring.new_address_score or 0)
            + int(monitoring.new_account_big_order_score or 0)
            + int(monitoring.rapid_order_score or 0),
        )
        hijack_risk_score = int(monitoring.hijack_risk_score or 0)
        dominant_risk = max(hijack_risk_score, fraud_risk_score)
        supporting_risk = min(hijack_risk_score, fraud_risk_score)
        total_risk_score = min(
            100,
            dominant_risk + int(round(supporting_risk * TOTAL_RISK_SUPPORTING_WEIGHT)),
        )

        monitoring_updates = {}
        if monitoring.fraud_risk_score != fraud_risk_score:
            monitoring_updates['fraud_risk_score'] = fraud_risk_score
        if monitoring.total_risk_score != total_risk_score:
            monitoring_updates['total_risk_score'] = total_risk_score
        if monitoring_updates:
            OrderMonitoring.objects.filter(pk=monitoring.pk).update(**monitoring_updates)

        order_scores[monitoring.order_id] = (
            total_risk_score,
            _decision_risk_level(total_risk_score),
        )

    for order in Order.objects.filter(id__in=order_scores.keys()).iterator():
        total_risk_score, risk_level = order_scores[order.id]
        order_updates = {}
        if order.decision_risk_score is not None and order.decision_risk_score != total_risk_score:
            order_updates['decision_risk_score'] = total_risk_score
        if order.decision_risk_level and order.decision_risk_level != risk_level:
            order_updates['decision_risk_level'] = risk_level
        if order_updates:
            Order.objects.filter(pk=order.pk).update(**order_updates)

    for action_session in AdminOrderActionSession.objects.filter(order_id__in=order_scores.keys()).iterator():
        total_risk_score, risk_level = order_scores[action_session.order_id]
        session_updates = {}
        if action_session.decision_risk_score != total_risk_score:
            session_updates['decision_risk_score'] = total_risk_score
        if action_session.decision_risk_level != risk_level:
            session_updates['decision_risk_level'] = risk_level
        if session_updates:
            AdminOrderActionSession.objects.filter(pk=action_session.pk).update(**session_updates)


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0026_remove_returnmonitoring_ereceipt_risk_score'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='ordermonitoring',
            name='amount_anomaly_score',
        ),
        migrations.RemoveField(
            model_name='ordermonitoring',
            name='bulk_order_score',
        ),
        migrations.RemoveField(
            model_name='ordermonitoring',
            name='max_single_product_quantity',
        ),
        migrations.RemoveField(
            model_name='ordermonitoring',
            name='order_amount_ratio_percent',
        ),
        migrations.RemoveField(
            model_name='ordermonitoring',
            name='total_item_quantity',
        ),
        migrations.RunPython(_recalculate_order_monitoring_scores, migrations.RunPython.noop),
    ]
