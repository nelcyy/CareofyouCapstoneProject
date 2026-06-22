from django.urls import include, path
from .login import views as login_views
from .register import views as register_views
from .admin.produk import views as admin_produk_views
from .customer.product import views as customer_product_views
from .customer.cart import views as customer_cart_views
from .customer.cart.checkout import views as customer_checkout_views
from .customer.favorites import views as customer_favorites_views

urlpatterns = [
    # register
    path('api/register/send-otp', register_views.send_otp),
    path('api/register/verify-otp', register_views.verify_otp),

    # login
    path('api/login', login_views.login),
    path('api/login/verify-otp', login_views.verify_otp),

    # admin > produk
    path('api/admin/produk/categories', admin_produk_views.list_categories),
    path('api/admin/produk/list', admin_produk_views.list_products),
    path('api/admin/produk/create', admin_produk_views.create_product),
    path('api/admin/produk/update', admin_produk_views.update_product),
    path('api/admin/produk/upload-image', admin_produk_views.upload_image),
    path('api/admin/produk/delete', admin_produk_views.delete_product),

    # admin > pesanan
    path('api/admin/pesanan/', include('app.admin.pesanan.urls')),

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

    # customer > cart > checkout
    path('api/customer/cart/checkout/user', customer_checkout_views.checkout_user),
    path('api/customer/cart/checkout/address/list', customer_checkout_views.list_addresses),
    path('api/customer/cart/checkout/address/create', customer_checkout_views.create_address),
    path('api/customer/cart/checkout/order/create', customer_checkout_views.create_order),
]
