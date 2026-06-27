from django.urls import include, path
from .login import views as login_views
from .register import views as register_views
from .admin.produk import views as admin_produk_views
from .admin.dashboard import views as admin_dashboard_views
from .customer.home import views as customer_home_views
from .customer.product import views as customer_product_views
from .customer.cart import views as customer_cart_views
from .customer.cart.checkout import views as customer_checkout_views
from .customer.favorites import views as customer_favorites_views
from .customer.profile.address import views as customer_profile_address_views
from .customer.profile.edit import views as customer_profile_edit_views
from .customer.profile.pesanan import views as customer_profile_order_views
from .customer.profile.retur import views as customer_profile_return_views

urlpatterns = [
    # register
    path('api/register/send-otp', register_views.send_otp),
    path('api/register/verify-otp', register_views.verify_otp),

    # login
    path('api/login', login_views.login),
    path('api/login/verify-otp', login_views.verify_otp),

    # admin > dashboard
    path('api/admin/dashboard/stats', admin_dashboard_views.dashboard_stats),
    path('api/admin/notifications', admin_dashboard_views.notification_counts),

    # admin > produk
    path('api/admin/produk/categories', admin_produk_views.list_categories),
    path('api/admin/produk/list', admin_produk_views.list_products),
    path('api/admin/produk/create', admin_produk_views.create_product),
    path('api/admin/produk/update', admin_produk_views.update_product),
    path('api/admin/produk/upload-image', admin_produk_views.upload_image),
    path('api/admin/produk/delete', admin_produk_views.delete_product),

    # admin > pesanan
    path('api/admin/pesanan/', include('app.admin.pesanan.urls')),
    path('api/admin/retur/', include('app.admin.retur.urls')),

    # customer > home
    path('api/customer/home/summary', customer_home_views.summary),

    # customer > product
    path('api/customer/product/list', customer_product_views.list_products),

    # customer > cart (keranjang)
    path('api/customer/cart/add', customer_cart_views.add_to_cart),
    path('api/customer/cart/list', customer_cart_views.list_cart),
    path('api/customer/cart/update-qty', customer_cart_views.update_qty),
    path('api/customer/cart/delete', customer_cart_views.remove_from_cart),

    # customer > favorites
    path('api/customer/favorites/add', customer_favorites_views.add_to_favorite),
    path('api/customer/favorites/list', customer_favorites_views.list_favorites),
    path('api/customer/favorites/delete', customer_favorites_views.remove_from_favorite),

    # customer > profile
    path('api/customer/profile/detail', customer_profile_edit_views.detail_profile),
    path('api/customer/profile/update', customer_profile_edit_views.update_profile),
    path('api/customer/profile/address/list', customer_profile_address_views.list_addresses),
    path('api/customer/profile/address/create', customer_profile_address_views.create_address),
    path('api/customer/profile/address/update', customer_profile_address_views.update_address),
    path('api/customer/profile/address/delete', customer_profile_address_views.delete_address),
    path('api/customer/profile/address/set-default', customer_profile_address_views.set_default_address),
    path('api/customer/profile/order/list', customer_profile_order_views.list_orders),
    path('api/customer/profile/order/detail', customer_profile_order_views.detail_order),
    path('api/customer/profile/order/ereceipt/view', customer_profile_order_views.view_receipt),
    path('api/customer/profile/order/ereceipt/download', customer_profile_order_views.download_receipt),
    path('api/customer/profile/return/list', customer_profile_return_views.list_returns),
    path('api/customer/profile/return/detail', customer_profile_return_views.detail_return),
    path('api/customer/profile/return/create', customer_profile_return_views.create_return),
    path('api/customer/profile/return/ship-back', customer_profile_return_views.ship_back_return),

    # customer > cart > checkout
    path('api/customer/cart/checkout/user', customer_checkout_views.checkout_user),
    path('api/customer/cart/checkout/address/list', customer_checkout_views.list_addresses),
    path('api/customer/cart/checkout/address/create', customer_checkout_views.create_address),
    path('api/customer/cart/checkout/order/create', customer_checkout_views.create_order),
]
