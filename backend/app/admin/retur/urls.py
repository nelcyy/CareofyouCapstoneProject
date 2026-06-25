from django.urls import path

from .ereceipt import views as ereceipt_views
from .returns import views as returns_views
from .monitoring import views as monitoring_views
from .qr import views as qr_views


urlpatterns = [
    path('list', returns_views.list_returns),
    path('detail', returns_views.detail_return),
    path('approve', returns_views.approve_return),
    path('approve/confirm', returns_views.confirm_approve_return),
    path('approve/resend', returns_views.resend_approve_return_otp),
    path('reject', returns_views.reject_return),
    path('reject/confirm', returns_views.confirm_reject_return),
    path('reject/resend', returns_views.resend_reject_return_otp),
    path('receive', returns_views.receive_return),
    path('complete', returns_views.complete_return),
    path('monitoring/detail', monitoring_views.detail_monitoring),
    path('ereceipt/verify', ereceipt_views.verify_return_ereceipt),
    path('qr/units', qr_views.list_return_qr_units),
    path('qr/verify', qr_views.verify_return_qr),
    path('qr/approve', qr_views.approve_return_qr),
]
