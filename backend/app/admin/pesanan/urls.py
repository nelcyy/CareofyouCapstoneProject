from django.urls import path

from .order import views as order_views


urlpatterns = [
    path('list', order_views.list_orders),
    path('detail', order_views.detail_order),
]
