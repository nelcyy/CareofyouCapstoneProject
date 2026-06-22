from django.db import models


# ======================= USER & AUTH =======================
class User(models.Model):
    """Tabel user (bukan auth_user bawaan Django). Password disimpan ke-hash (nanti)."""
    ROLE_CHOICES = [('customer', 'Customer'), ('admin', 'Admin')]

    id = models.BigAutoField(primary_key=True, db_column='ID')
    email = models.EmailField(unique=True, db_column='EMAIL')
    password = models.CharField(max_length=255, db_column='PASSWORD')
    name = models.CharField(max_length=150, db_column='NAME')
    phone = models.CharField(max_length=30, blank=True, default='', db_column='PHONE')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='customer', db_column='ROLE')
    created_at = models.DateTimeField(auto_now_add=True, db_column='CREATED_AT')

    class Meta:
        db_table = 'users'

    def __str__(self):
        return f'{self.email} ({self.role})'


class OtpSession(models.Model):
    """Kode OTP + statusnya. 90 detik, maks salah 2x, sekali pakai."""
    PURPOSE_CHOICES = [('login', 'Login'), ('register', 'Register')]

    id = models.BigAutoField(primary_key=True, db_column='ID')
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True,
                             db_column='USER_ID', related_name='otp_sessions')  # null saat register
    login_id = models.CharField(max_length=64, blank=True, default='', db_column='LOGIN_ID')
    email = models.CharField(max_length=254, blank=True, default='', db_column='EMAIL')
    code = models.CharField(max_length=6, db_column='CODE')
    purpose = models.CharField(max_length=20, choices=PURPOSE_CHOICES, db_column='PURPOSE')
    attempts = models.IntegerField(default=0, db_column='ATTEMPTS')
    is_used = models.BooleanField(default=False, db_column='IS_USED')
    created_at = models.DateTimeField(auto_now_add=True, db_column='CREATED_AT')
    expires_at = models.DateTimeField(db_column='EXPIRES_AT')

    class Meta:
        db_table = 'otp_session'


class TrustedDevice(models.Model):
    """Stempel perangkat (per-browser)."""
    id = models.BigAutoField(primary_key=True, db_column='ID')
    user = models.ForeignKey(User, on_delete=models.CASCADE, db_column='USER_ID', related_name='trusted_devices')
    token = models.CharField(max_length=255, db_column='TOKEN')
    device_label = models.CharField(max_length=200, db_column='DEVICE_LABEL')
    ip_address = models.CharField(max_length=50, blank=True, default='', db_column='IP_ADDRESS')
    is_active = models.BooleanField(default=True, db_column='IS_ACTIVE')
    created_at = models.DateTimeField(auto_now_add=True, db_column='CREATED_AT')
    expires_at = models.DateTimeField(db_column='EXPIRES_AT')
    last_used = models.DateTimeField(db_column='LAST_USED')

    class Meta:
        db_table = 'trusted_device'


class ActivityLog(models.Model):
    """Catatan semua kejadian (login, gagal login, OTP) -> bahan monitoring."""
    id = models.BigAutoField(primary_key=True, db_column='ID')
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                             db_column='USER_ID', related_name='activity_logs')
    login_id = models.CharField(max_length=64, blank=True, default='', db_column='LOGIN_ID')
    email = models.CharField(max_length=254, blank=True, default='', db_column='EMAIL')
    event_type = models.CharField(max_length=50, db_column='EVENT_TYPE')
    result = models.CharField(max_length=20, blank=True, default='', db_column='RESULT')
    reason = models.CharField(max_length=100, blank=True, default='', db_column='REASON')
    ip_address = models.CharField(max_length=50, blank=True, default='', db_column='IP_ADDRESS')
    created_at = models.DateTimeField(auto_now_add=True, db_column='CREATED_AT')

    class Meta:
        db_table = 'activity_log'


# ======================= STORE =======================
class Category(models.Model):
    """Kategori produk (mis. Lipstick, Foundation)."""
    id = models.BigAutoField(primary_key=True, db_column='ID')
    name = models.CharField(max_length=100, db_column='NAME')
    created_at = models.DateTimeField(auto_now_add=True, db_column='CREATED_AT')

    class Meta:
        db_table = 'category'

    def __str__(self):
        return self.name


class Product(models.Model):
    """Produk yang dijual."""
    id = models.BigAutoField(primary_key=True, db_column='ID')
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True,
                                 db_column='CATEGORY_ID', related_name='products')
    name = models.CharField(max_length=200, db_column='NAME')
    description = models.TextField(blank=True, default='', db_column='DESCRIPTION')
    price = models.BigIntegerField(default=0, db_column='PRICE')        # rupiah, tanpa desimal
    stock = models.IntegerField(default=0, db_column='STOCK')
    image = models.TextField(blank=True, default='', db_column='IMAGE')  # link/path foto
    is_active = models.BooleanField(default=True, db_column='IS_ACTIVE')
    created_at = models.DateTimeField(auto_now_add=True, db_column='CREATED_AT')

    class Meta:
        db_table = 'product'

    def __str__(self):
        return self.name


class Address(models.Model):
    """Alamat customer untuk kebutuhan checkout dan pengiriman."""
    id = models.BigAutoField(primary_key=True, db_column='ID')
    user = models.ForeignKey(User, on_delete=models.CASCADE, db_column='USER_ID', related_name='addresses')
    label = models.CharField(max_length=50, default='Rumah', db_column='LABEL')
    recipient_name = models.CharField(max_length=150, db_column='RECIPIENT_NAME')
    phone = models.CharField(max_length=30, db_column='PHONE')
    address_line = models.TextField(db_column='ADDRESS_LINE')
    city = models.CharField(max_length=100, db_column='CITY')
    province = models.CharField(max_length=100, db_column='PROVINCE')
    postal_code = models.CharField(max_length=10, db_column='POSTAL_CODE')
    notes = models.CharField(max_length=255, blank=True, default='', db_column='NOTES')
    is_default = models.BooleanField(default=False, db_column='IS_DEFAULT')
    created_at = models.DateTimeField(auto_now_add=True, db_column='CREATED_AT')
    updated_at = models.DateTimeField(auto_now=True, db_column='UPDATED_AT')

    class Meta:
        db_table = 'address'

    def __str__(self):
        return f'{self.label} - {self.recipient_name}'


class CartItem(models.Model):
    """Item di keranjang seorang customer."""
    id = models.BigAutoField(primary_key=True, db_column='ID')
    user = models.ForeignKey(User, on_delete=models.CASCADE, db_column='USER_ID', related_name='cart_items')
    product = models.ForeignKey(Product, on_delete=models.CASCADE, db_column='PRODUCT_ID', related_name='cart_items')
    quantity = models.IntegerField(default=1, db_column='QUANTITY')
    created_at = models.DateTimeField(auto_now_add=True, db_column='CREATED_AT')

    class Meta:
        db_table = 'cart_item'
        unique_together = [('user', 'product')]


class Favorite(models.Model):
    """Produk favorit seorang customer."""
    id = models.BigAutoField(primary_key=True, db_column='ID')
    user = models.ForeignKey(User, on_delete=models.CASCADE, db_column='USER_ID', related_name='favorites')
    product = models.ForeignKey(Product, on_delete=models.CASCADE, db_column='PRODUCT_ID', related_name='favorites')
    created_at = models.DateTimeField(auto_now_add=True, db_column='CREATED_AT')

    class Meta:
        db_table = 'favorite'
        unique_together = [('user', 'product')]


class Order(models.Model):
    """Header pesanan customer yang sudah checkout."""
    STATUS_CHOICES = [
        ('waiting_admin_approval', 'Waiting Admin Approval'),
        ('pengemasan', 'Pengemasan'),
        ('pengiriman', 'Pengiriman'),
        ('selesai', 'Selesai'),
    ]

    id = models.BigAutoField(primary_key=True, db_column='ID')
    user = models.ForeignKey(User, on_delete=models.CASCADE, db_column='USER_ID', related_name='orders')
    login_id = models.CharField(max_length=64, blank=True, default='', db_column='LOGIN_ID')
    order_code = models.CharField(max_length=30, blank=True, default='', db_column='ORDER_CODE')
    address_label = models.CharField(max_length=50, blank=True, default='', db_column='ADDRESS_LABEL')
    recipient_name = models.CharField(max_length=150, db_column='RECIPIENT_NAME')
    recipient_phone = models.CharField(max_length=30, db_column='RECIPIENT_PHONE')
    address_line = models.TextField(db_column='ADDRESS_LINE')
    city = models.CharField(max_length=100, db_column='CITY')
    province = models.CharField(max_length=100, db_column='PROVINCE')
    postal_code = models.CharField(max_length=10, db_column='POSTAL_CODE')
    address_notes = models.CharField(max_length=255, blank=True, default='', db_column='ADDRESS_NOTES')
    courier_name = models.CharField(max_length=50, db_column='COURIER_NAME')
    shipping_fee = models.BigIntegerField(default=0, db_column='SHIPPING_FEE')
    payment_method = models.CharField(max_length=30, db_column='PAYMENT_METHOD')
    payment_target = models.CharField(max_length=100, blank=True, default='', db_column='PAYMENT_TARGET')
    payment_proof = models.TextField(blank=True, default='', db_column='PAYMENT_PROOF')
    subtotal = models.BigIntegerField(default=0, db_column='SUBTOTAL')
    grand_total = models.BigIntegerField(default=0, db_column='GRAND_TOTAL')
    status = models.CharField(max_length=30, choices=STATUS_CHOICES,
                              default='waiting_admin_approval', db_column='STATUS')
    created_at = models.DateTimeField(auto_now_add=True, db_column='CREATED_AT')
    updated_at = models.DateTimeField(auto_now=True, db_column='UPDATED_AT')

    class Meta:
        db_table = 'orders'


class OrderMonitoring(models.Model):
    """Snapshot monitoring per order, mulai dari sisi device yang dipakai."""
    TRUSTED_DEVICE_STATUS_CHOICES = [
        ('usual', 'Yang Biasa Dipakai'),
        ('known_rare', 'Dikenal Tapi Jarang Dipakai'),
        ('new_trusted', 'Trusted Device Baru'),
        ('not_registered', 'Tidak Ada di Trusted Device'),
    ]

    id = models.BigAutoField(primary_key=True, db_column='ID')
    order = models.OneToOneField(Order, on_delete=models.CASCADE, db_column='ORDER_ID', related_name='monitoring')
    login_id = models.CharField(max_length=64, blank=True, default='', db_column='LOGIN_ID')
    trusted_device = models.ForeignKey(
        TrustedDevice,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='TRUSTED_DEVICE_ID',
        related_name='order_monitorings',
    )
    device_label_snapshot = models.CharField(max_length=200, blank=True, default='', db_column='DEVICE_LABEL_SNAPSHOT')
    trusted_device_status = models.CharField(
        max_length=30,
        choices=TRUSTED_DEVICE_STATUS_CHOICES,
        default='not_registered',
        db_column='TRUSTED_DEVICE_STATUS',
    )
    device_risk_score = models.IntegerField(default=0, db_column='DEVICE_RISK_SCORE')
    failed_password_count = models.IntegerField(default=0, db_column='FAILED_PASSWORD_COUNT')
    failed_password_score = models.IntegerField(default=0, db_column='FAILED_PASSWORD_SCORE')
    failed_otp_count = models.IntegerField(default=0, db_column='FAILED_OTP_COUNT')
    failed_otp_score = models.IntegerField(default=0, db_column='FAILED_OTP_SCORE')
    total_risk_score = models.IntegerField(default=0, db_column='TOTAL_RISK_SCORE')
    trusted_device_created_at_snapshot = models.DateTimeField(
        null=True,
        blank=True,
        db_column='TRUSTED_DEVICE_CREATED_AT_SNAPSHOT',
    )
    created_at = models.DateTimeField(auto_now_add=True, db_column='CREATED_AT')

    class Meta:
        db_table = 'order_monitoring'


class OrderItem(models.Model):
    """Snapshot item produk di dalam satu pesanan."""
    id = models.BigAutoField(primary_key=True, db_column='ID')
    order = models.ForeignKey(Order, on_delete=models.CASCADE, db_column='ORDER_ID', related_name='items')
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True,
                                db_column='PRODUCT_ID', related_name='order_items')
    product_name = models.CharField(max_length=200, db_column='PRODUCT_NAME')
    product_price = models.BigIntegerField(default=0, db_column='PRODUCT_PRICE')
    quantity = models.IntegerField(default=1, db_column='QUANTITY')
    subtotal = models.BigIntegerField(default=0, db_column='SUBTOTAL')
    created_at = models.DateTimeField(auto_now_add=True, db_column='CREATED_AT')

    class Meta:
        db_table = 'order_item'
