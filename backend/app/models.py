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
    PURPOSE_CHOICES = [
        ('login', 'Login'),
        ('register', 'Register'),
        ('admin_action', 'Admin Action'),
    ]

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
        ('rejected', 'Rejected'),
        ('pengemasan', 'Pengemasan'),
        ('pengiriman', 'Pengiriman'),
        ('selesai', 'Selesai'),
    ]
    DECISION_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
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
    processed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='PROCESSED_BY',
        related_name='processed_orders',
    )
    processed_at = models.DateTimeField(null=True, blank=True, db_column='PROCESSED_AT')
    decision = models.CharField(
        max_length=20,
        choices=DECISION_CHOICES,
        default='pending',
        db_column='DECISION',
    )
    decision_reason = models.CharField(max_length=255, blank=True, default='', db_column='DECISION_REASON')
    otp_verified_for_action = models.BooleanField(default=False, db_column='OTP_VERIFIED_FOR_ACTION')
    decision_risk_score = models.IntegerField(null=True, blank=True, db_column='DECISION_RISK_SCORE')
    decision_risk_level = models.CharField(max_length=10, blank=True, default='', db_column='DECISION_RISK_LEVEL')
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
    hijack_risk_score = models.IntegerField(default=0, db_column='HIJACK_RISK_SCORE')
    address_age_minutes = models.IntegerField(default=0, db_column='ADDRESS_AGE_MINUTES')
    new_address_score = models.IntegerField(default=0, db_column='NEW_ADDRESS_SCORE')
    order_amount_ratio_percent = models.IntegerField(default=0, db_column='ORDER_AMOUNT_RATIO_PERCENT')
    amount_anomaly_score = models.IntegerField(default=0, db_column='AMOUNT_ANOMALY_SCORE')
    total_item_quantity = models.IntegerField(default=0, db_column='TOTAL_ITEM_QUANTITY')
    max_single_product_quantity = models.IntegerField(default=0, db_column='MAX_SINGLE_PRODUCT_QUANTITY')
    bulk_order_score = models.IntegerField(default=0, db_column='BULK_ORDER_SCORE')
    account_age_days = models.IntegerField(default=0, db_column='ACCOUNT_AGE_DAYS')
    new_account_big_order_score = models.IntegerField(default=0, db_column='NEW_ACCOUNT_BIG_ORDER_SCORE')
    recent_orders_30m_count = models.IntegerField(default=0, db_column='RECENT_ORDERS_30M_COUNT')
    rapid_order_score = models.IntegerField(default=0, db_column='RAPID_ORDER_SCORE')
    fraud_risk_score = models.IntegerField(default=0, db_column='FRAUD_RISK_SCORE')
    total_risk_score = models.IntegerField(default=0, db_column='TOTAL_RISK_SCORE')
    trusted_device_created_at_snapshot = models.DateTimeField(
        null=True,
        blank=True,
        db_column='TRUSTED_DEVICE_CREATED_AT_SNAPSHOT',
    )
    created_at = models.DateTimeField(auto_now_add=True, db_column='CREATED_AT')

    class Meta:
        db_table = 'order_monitoring'


class AdminOrderActionSession(models.Model):
    """Session action admin yang mungkin menunggu OTP sebelum order diproses."""
    ACTION_CHOICES = [
        ('approve', 'Approve'),
        ('reject', 'Reject'),
    ]

    id = models.BigAutoField(primary_key=True, db_column='ID')
    session_id = models.CharField(max_length=64, unique=True, db_column='SESSION_ID')
    admin_user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        db_column='ADMIN_USER_ID',
        related_name='admin_order_action_sessions',
    )
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        db_column='ORDER_ID',
        related_name='admin_action_sessions',
    )
    action = models.CharField(max_length=20, choices=ACTION_CHOICES, db_column='ACTION')
    decision_reason = models.CharField(max_length=255, blank=True, default='', db_column='DECISION_REASON')
    decision_risk_score = models.IntegerField(default=0, db_column='DECISION_RISK_SCORE')
    decision_risk_level = models.CharField(max_length=10, blank=True, default='', db_column='DECISION_RISK_LEVEL')
    otp_required = models.BooleanField(default=False, db_column='OTP_REQUIRED')
    otp_verified = models.BooleanField(default=False, db_column='OTP_VERIFIED')
    is_completed = models.BooleanField(default=False, db_column='IS_COMPLETED')
    created_at = models.DateTimeField(auto_now_add=True, db_column='CREATED_AT')
    completed_at = models.DateTimeField(null=True, blank=True, db_column='COMPLETED_AT')

    class Meta:
        db_table = 'admin_order_action_session'


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


class EReceipt(models.Model):
    """E-receipt hasil approval admin untuk kebutuhan view/download."""
    id = models.BigAutoField(primary_key=True, db_column='ID')
    receipt_id = models.CharField(max_length=30, unique=True, blank=True, default='', db_column='RECEIPT_ID')
    order = models.OneToOneField(
        Order,
        on_delete=models.CASCADE,
        db_column='ORDER_ID',
        related_name='e_receipt',
    )
    customer_name = models.CharField(max_length=150, blank=True, default='', db_column='CUSTOMER_NAME')
    customer_email = models.CharField(max_length=254, blank=True, default='', db_column='CUSTOMER_EMAIL')
    total = models.BigIntegerField(default=0, db_column='TOTAL')
    signature_hash = models.CharField(max_length=64, db_column='SIGNATURE_HASH')
    generated_at = models.DateTimeField(db_column='GENERATED_AT')
    pdf_b64 = models.TextField(db_column='PDF_B64')
    is_revoked = models.BooleanField(default=False, db_column='IS_REVOKED')
    created_at = models.DateTimeField(auto_now_add=True, db_column='CREATED_AT')
    updated_at = models.DateTimeField(auto_now=True, db_column='UPDATED_AT')

    class Meta:
        db_table = 'e_receipts'

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.receipt_id:
            self.receipt_id = f'RCP-{self.pk:03d}'
            type(self).objects.filter(pk=self.pk).update(receipt_id=self.receipt_id)

    def __str__(self):
        return f'{self.receipt_id} ({self.order.order_code})'
