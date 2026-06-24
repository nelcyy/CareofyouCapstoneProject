from django.urls import path

from .ereceipt import views as ereceipt_views
from .order import views as order_views


urlpatterns = [
    path('list', order_views.list_orders),
    path('detail', order_views.detail_order),
    path('approve', order_views.approve_order),
    path('approve/confirm', order_views.confirm_approve_order),
    path('approve/resend', order_views.resend_approve_order_otp),
    path('reject', order_views.reject_order),
    path('reject/confirm', order_views.confirm_reject_order),
    path('reject/resend', order_views.resend_reject_order_otp),
    path('ereceipt/generate', ereceipt_views.generate_receipt),
    path('ereceipt/view', ereceipt_views.view_receipt),
    path('ereceipt/download', ereceipt_views.download_receipt),
]
