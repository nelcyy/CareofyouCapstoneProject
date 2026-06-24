from django.urls import path

from .ereceipt import views as ereceipt_views
from .order import views as order_views
from .qr import views as qr_views


urlpatterns = [
    path('list', order_views.list_orders),
    path('detail', order_views.detail_order),
    path('approve', order_views.approve_order),
    path('approve/confirm', order_views.confirm_approve_order),
    path('approve/resend', order_views.resend_approve_order_otp),
    path('reject', order_views.reject_order),
    path('reject/confirm', order_views.confirm_reject_order),
    path('reject/resend', order_views.resend_reject_order_otp),
    path('ship', order_views.ship_order),
    path('complete', order_views.complete_order),
    path('ereceipt/generate', ereceipt_views.generate_receipt),
    path('ereceipt/view', ereceipt_views.view_receipt),
    path('ereceipt/download', ereceipt_views.download_receipt),
    path('qr/generate', qr_views.generate_unit_qr),
    path('qr/order/<str:order_id>', qr_views.get_order_qrs),
    path('qr/verify', qr_views.verify_qr),
    path('qr/approve', qr_views.approve_qr),
    path('qr/<str:qr_token>', qr_views.get_qr_detail),
]
