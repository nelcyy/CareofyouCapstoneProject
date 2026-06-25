'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiUrl, mediaUrl } from '@/api';
import './page.css';

const CART_API = apiUrl('/api/customer/cart');
const CHECKOUT_API = apiUrl('/api/customer/cart/checkout');

function formatRibuan(value) {
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('id-ID');
}

function imgUrl(path) {
  return mediaUrl(path);
}

const EMPTY_ADDRESS_FORM = {
  label: 'Rumah',
  recipient_name: '',
  phone: '',
  address_line: '',
  city: '',
  province: '',
  postal_code: '',
  notes: '',
  is_default: false,
};

const COURIER_OPTIONS = [
  { id: 'jne-reg', name: 'JNE REG', fee: 12000 },
  { id: 'jnt-reg', name: 'J&T REG', fee: 10000 },
  { id: 'sicepat-reg', name: 'SiCepat REG', fee: 11000 },
];

const PAYMENT_OPTIONS = [
  { id: 'gopay', name: 'GoPay', target: '12345', targetLabel: 'Nomor GoPay' },
  { id: 'ovo', name: 'OVO', target: '5678', targetLabel: 'Nomor OVO' },
  { id: 'bca-transfer', name: 'Transfer Bank BCA', target: '23456', targetLabel: 'No. Rekening BCA' },
];

/* ── inline icons ── */
const IconMapPin = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);
const IconStore = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);
const IconCard = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
    <line x1="1" y1="10" x2="23" y2="10" />
  </svg>
);
const IconClock = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);
const IconClip = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

export default function CheckoutPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [selectedCourierId, setSelectedCourierId] = useState(COURIER_OPTIONS[0].id);
  const [selectedPaymentId, setSelectedPaymentId] = useState(PAYMENT_OPTIONS[0].id);
  const [currentUser, setCurrentUser] = useState(null);
  const [userId, setUserId] = useState(null);
  const [showAddressPopup, setShowAddressPopup] = useState(false);
  const [showOrderPopup, setShowOrderPopup] = useState(false);
  const [addressForm, setAddressForm] = useState(EMPTY_ADDRESS_FORM);
  const [addressError, setAddressError] = useState('');
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [paymentProofFile, setPaymentProofFile] = useState(null);
  const [paymentCountdown, setPaymentCountdown] = useState(180);
  const [orderError, setOrderError] = useState('');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  // UI-only state (bukan backend): drag-drop + preview gambar bukti transfer
  const [proofDrag, setProofDrag] = useState(false);
  const [proofPreview, setProofPreview] = useState(null);

  function loadAddresses(uid) {
    fetch(`${CHECKOUT_API}/address/list?user_id=${uid}`)
      .then((r) => r.json())
      .then(setAddresses)
      .catch(console.error);
  }

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (!user) return;

    setCurrentUser(user);
    setUserId(user.id);

    fetch(`${CHECKOUT_API}/user?user_id=${user.id}`)
      .then((r) => r.json())
      .then((freshUser) => {
        if (freshUser?.id) {
          setCurrentUser(freshUser);
          localStorage.setItem('user', JSON.stringify(freshUser));
        }
      })
      .catch(console.error);

    fetch(`${CART_API}/list?user_id=${user.id}`)
      .then((r) => r.json())
      .then(setItems)
      .catch(console.error);

    loadAddresses(user.id);
  }, []);

  useEffect(() => {
    if (addresses.length === 0) {
      setSelectedAddressId(null);
      return;
    }

    setSelectedAddressId((prev) => {
      if (addresses.some((it) => it.id === prev)) {
        return prev;
      }
      return addresses.find((it) => it.is_default)?.id ?? addresses[0].id;
    });
  }, [addresses]);

  useEffect(() => {
    if (!showOrderPopup) return undefined;

    const timer = window.setInterval(() => {
      setPaymentCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [showOrderPopup]);

  // preview gambar bukti transfer (UI-only)
  useEffect(() => {
    if (!paymentProofFile) {
      setProofPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(paymentProofFile);
    setProofPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [paymentProofFile]);

  const selectedCourier = COURIER_OPTIONS.find((it) => it.id === selectedCourierId) || COURIER_OPTIONS[0];
  const selectedPayment = PAYMENT_OPTIONS.find((it) => it.id === selectedPaymentId) || PAYMENT_OPTIONS[0];
  const selectedAddress = addresses.find((it) => it.id === selectedAddressId);
  const total = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
  const grandTotal = total + (selectedCourier?.fee || 0);
  const countdownMinutes = String(Math.floor(paymentCountdown / 60)).padStart(2, '0');
  const countdownSeconds = String(paymentCountdown % 60).padStart(2, '0');

  function openAddressPopup() {
    setAddressForm({
      ...EMPTY_ADDRESS_FORM,
      recipient_name: currentUser?.name || '',
      phone: currentUser?.phone || '',
      is_default: addresses.length === 0,
    });
    setAddressError('');
    setShowAddressPopup(true);
  }

  function closeAddressPopup() {
    setShowAddressPopup(false);
    setAddressError('');
    setIsSavingAddress(false);
  }

  function openOrderPopup() {
    setPaymentProofFile(null);
    setPaymentCountdown(180);
    setOrderError('');
    setIsSubmittingOrder(false);
    setShowOrderPopup(true);
  }

  function closeOrderPopup() {
    setShowOrderPopup(false);
    setPaymentProofFile(null);
    setPaymentCountdown(180);
    setOrderError('');
    setIsSubmittingOrder(false);
  }

  function updateAddressField(field, value) {
    setAddressForm((prev) => ({ ...prev, [field]: value }));
  }

  function pickProofFile(file) {
    if (!file) return;
    setPaymentProofFile(file);
    setOrderError('');
  }

  function handleProofDrop(e) {
    e.preventDefault();
    setProofDrag(false);
    if (paymentCountdown === 0) return;
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) pickProofFile(file);
  }

  async function submitAddress(e) {
    e.preventDefault();
    if (!userId) return;

    setIsSavingAddress(true);
    setAddressError('');

    try {
      const res = await fetch(`${CHECKOUT_API}/address/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          ...addressForm,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAddressError(data.error || 'Gagal menambah alamat.');
        return;
      }

      closeAddressPopup();
      loadAddresses(userId);
    } catch (error) {
      console.error(error);
      setAddressError('Gagal menambah alamat.');
    } finally {
      setIsSavingAddress(false);
    }
  }

  async function submitOrder() {
    if (!userId || !selectedAddressId || !paymentProofFile) return;

    setIsSubmittingOrder(true);
    setOrderError('');

    try {
      const loginId = localStorage.getItem('login_id') || '';
      const trustToken = localStorage.getItem('trust_token') || '';
      const formData = new FormData();
      formData.append('user_id', String(userId));
      formData.append('address_id', String(selectedAddressId));
      formData.append('courier_id', selectedCourierId);
      formData.append('payment_id', selectedPaymentId);
      formData.append('login_id', loginId);
      formData.append('trust_token', trustToken);
      formData.append('payment_proof', paymentProofFile);

      const res = await fetch(`${CHECKOUT_API}/order/create`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setOrderError(data.error || 'Gagal membuat order.');
        return;
      }

      setItems([]);
      closeOrderPopup();
      alert(`Order berhasil dibuat. Kode order: ${data.order_code}`);
      router.replace('/customer/profile/order');
    } catch (error) {
      console.error(error);
      setOrderError('Gagal membuat order.');
    } finally {
      setIsSubmittingOrder(false);
    }
  }

  if (userId === null) {
    return (
      <div className="co-page">
        <main className="co-main">
          <div className="co-container">
            <div className="co-guard">
              <span className="co-card-icon"><IconCard /></span>
              <p className="co-guard-text">Login dulu sebagai customer</p>
              <p className="co-guard-sub">Masuk untuk melanjutkan checkout.</p>
              <Link href="/customer/cart" className="co-back-link">← Kembali ke keranjang</Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const timerClass = paymentCountdown === 0
    ? ' co-proof-timer--expired'
    : paymentCountdown <= 30
      ? ' co-proof-timer--warn'
      : '';

  return (
    <div className="co-page">
      <main className="co-main">
        <div className="co-container">
          <Link href="/customer/cart" className="co-back-link">← Kembali ke keranjang</Link>
          <h1 className="co-page-title">Pembayaran</h1>

          <div className="co-layout">
            {/* ════ LEFT ════ */}
            <div className="co-left">
              {/* 1 · ALAMAT */}
              <section className="co-card">
                <div className="co-card-heading">
                  <span className="co-card-icon"><IconMapPin /></span>
                  <h2 className="co-card-title">Alamat Pengiriman</h2>
                </div>

                <div className="co-addr-list">
                  {addresses.length === 0 ? (
                    <p className="co-addr-empty">Belum ada alamat tersimpan. Tambahkan di bawah.</p>
                  ) : (
                    addresses.map((addr) => (
                      <label
                        key={addr.id}
                        className={`co-addr-option${selectedAddressId === addr.id ? ' co-addr-option--active' : ''}`}
                      >
                        <input
                          type="radio"
                          name="selected_address"
                          className="co-radio"
                          checked={selectedAddressId === addr.id}
                          onChange={() => setSelectedAddressId(addr.id)}
                        />
                        <div className="co-addr-body">
                          <div className="co-addr-top">
                            <span className="co-addr-label">{addr.label}</span>
                            {addr.is_default && <span className="co-addr-badge">Utama</span>}
                          </div>
                          <p className="co-addr-name">{addr.recipient_name} · {addr.phone}</p>
                          <p className="co-addr-text">
                            {addr.address_line}, {addr.city}, {addr.province} {addr.postal_code}
                            {addr.notes ? ` (${addr.notes})` : ''}
                          </p>
                        </div>
                      </label>
                    ))
                  )}
                </div>

                <button className="co-add-addr-btn" onClick={openAddressPopup}>
                  + Tambah alamat
                </button>
              </section>

              {/* 2 · DETAIL PESANAN */}
              <section className="co-card">
                <div className="co-card-heading">
                  <span className="co-card-icon"><IconStore /></span>
                  <h2 className="co-card-title">Detail Pesanan</h2>
                </div>
                <div className="co-store-name">Careofyou Official Store</div>
                <div className="co-item-list">
                  {items.length === 0 ? (
                    <p className="co-addr-empty">Keranjang kosong.</p>
                  ) : (
                    items.map((it) => (
                      <div key={it.id} className="co-item">
                        {it.image ? (
                          <img src={imgUrl(it.image)} alt={it.name} className="co-item-img" />
                        ) : (
                          <span className="co-item-img-placeholder">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <path d="M21 15l-5-5L5 21" />
                            </svg>
                          </span>
                        )}
                        <div className="co-item-info">
                          {it.category && <p className="co-item-brand">{it.category}</p>}
                          <p className="co-item-name">{it.name}</p>
                        </div>
                        <div className="co-item-right">
                          <p className="co-item-price">Rp {formatRibuan(it.price)}</p>
                          <p className="co-item-qty">Jml: {it.quantity}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {/* 3 · KURIR */}
              <section className="co-card">
                <h2 className="co-card-title" style={{ marginBottom: 16 }}>Pilihan Pengiriman</h2>
                <div className="co-delivery-list">
                  {COURIER_OPTIONS.map((opt) => (
                    <label
                      key={opt.id}
                      className={`co-delivery-option${selectedCourierId === opt.id ? ' co-delivery-option--active' : ''}`}
                    >
                      <input
                        type="radio"
                        name="selected_courier"
                        className="co-radio"
                        checked={selectedCourierId === opt.id}
                        onChange={() => setSelectedCourierId(opt.id)}
                      />
                      <div className="co-delivery-body">
                        <span className="co-delivery-label">{opt.name}</span>
                      </div>
                      <span className="co-delivery-fee">Rp {formatRibuan(opt.fee)}</span>
                    </label>
                  ))}
                </div>
              </section>

              {/* 4 · PEMBAYARAN */}
              <section className="co-card">
                <h2 className="co-card-title" style={{ marginBottom: 16 }}>Metode Pembayaran</h2>
                <div className="co-payment-grid">
                  {PAYMENT_OPTIONS.map((opt) => (
                    <label
                      key={opt.id}
                      className={`co-payment-option${selectedPaymentId === opt.id ? ' co-payment-option--active' : ''}`}
                    >
                      <input
                        type="radio"
                        name="selected_payment"
                        className="co-radio"
                        checked={selectedPaymentId === opt.id}
                        onChange={() => setSelectedPaymentId(opt.id)}
                      />
                      <span className="co-payment-label">{opt.name}</span>
                    </label>
                  ))}
                </div>

                {selectedPayment && (
                  <div className="co-payment-detail">
                    <p className="co-payment-detail-title">{selectedPayment.targetLabel}</p>
                    <p className="co-payment-detail-bank">{selectedPayment.name}</p>
                    <p className="co-payment-detail-account">{selectedPayment.target}</p>
                  </div>
                )}
              </section>
            </div>

            {/* ════ RIGHT — RINGKASAN ════ */}
            <div className="co-right">
              <div className="co-summary">
                <h2 className="co-summary-title">Ringkasan Pesanan</h2>

                <div className="co-summary-items">
                  {items.map((it) => (
                    <div key={it.id} className="co-summary-item">
                      <span className="co-summary-item-name">
                        {it.name} <span className="co-summary-item-qty">×{it.quantity}</span>
                      </span>
                      <span className="co-summary-item-price">Rp {formatRibuan(it.price * it.quantity)}</span>
                    </div>
                  ))}
                </div>

                <div className="co-summary-divider" />

                <div className="co-summary-row">
                  <span>Subtotal</span>
                  <span>Rp {formatRibuan(total)}</span>
                </div>
                <div className="co-summary-row">
                  <span>Pengiriman ({selectedCourier?.name})</span>
                  <span>Rp {formatRibuan(selectedCourier?.fee || 0)}</span>
                </div>

                <div className="co-summary-divider" />

                <div className="co-summary-total">
                  <span>Total</span>
                  <span>Rp {formatRibuan(grandTotal)}</span>
                </div>

                {selectedAddress && (
                  <div className="co-summary-addr">
                    <p className="co-summary-addr-label">Dikirim ke</p>
                    <p className="co-summary-addr-name">{selectedAddress.recipient_name}</p>
                    <p className="co-summary-addr-text">
                      {selectedAddress.address_line}, {selectedAddress.city}
                    </p>
                  </div>
                )}

                <button
                  className="co-checkout-btn"
                  disabled={!selectedAddressId || items.length === 0}
                  onClick={openOrderPopup}
                >
                  {!selectedAddressId ? 'Pilih Alamat Dulu' : 'Buat Pesanan'}
                </button>

                <p className="co-checkout-note">
                  Dengan membuat pesanan, kamu menyetujui syarat dan ketentuan kami.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ════ MODAL: TAMBAH ALAMAT ════ */}
      {showAddressPopup && (
        <div className="co-modal-overlay" onClick={() => !isSavingAddress && closeAddressPopup()}>
          <div className="co-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="co-modal-title">Tambah Alamat</h3>
            <form className="co-addr-form" onSubmit={submitAddress}>
              <div className="co-form-row">
                <div className="co-form-group">
                  <label className="co-form-label">Label</label>
                  <input className="co-input" value={addressForm.label} onChange={(e) => updateAddressField('label', e.target.value)} />
                </div>
                <div className="co-form-group">
                  <label className="co-form-label">Nama Penerima</label>
                  <input className="co-input" value={addressForm.recipient_name} onChange={(e) => updateAddressField('recipient_name', e.target.value)} required />
                </div>
              </div>

              <div className="co-form-group">
                <label className="co-form-label">Telepon</label>
                <input className="co-input" value={addressForm.phone} onChange={(e) => updateAddressField('phone', e.target.value)} required />
              </div>

              <div className="co-form-group">
                <label className="co-form-label">Alamat Lengkap</label>
                <textarea className="co-input co-textarea" rows={3} value={addressForm.address_line} onChange={(e) => updateAddressField('address_line', e.target.value)} required />
              </div>

              <div className="co-form-row">
                <div className="co-form-group">
                  <label className="co-form-label">Kota</label>
                  <input className="co-input" value={addressForm.city} onChange={(e) => updateAddressField('city', e.target.value)} required />
                </div>
                <div className="co-form-group">
                  <label className="co-form-label">Provinsi</label>
                  <input className="co-input" value={addressForm.province} onChange={(e) => updateAddressField('province', e.target.value)} required />
                </div>
              </div>

              <div className="co-form-row">
                <div className="co-form-group">
                  <label className="co-form-label">Kode Pos</label>
                  <input className="co-input" value={addressForm.postal_code} onChange={(e) => updateAddressField('postal_code', e.target.value)} required />
                </div>
                <div className="co-form-group">
                  <label className="co-form-label">Catatan (opsional)</label>
                  <input className="co-input" value={addressForm.notes} onChange={(e) => updateAddressField('notes', e.target.value)} />
                </div>
              </div>

              <label className="co-checkbox-row">
                <input type="checkbox" checked={addressForm.is_default} onChange={(e) => updateAddressField('is_default', e.target.checked)} />
                Jadikan alamat utama
              </label>

              {addressError && <p className="co-error">{addressError}</p>}

              <div className="co-modal-actions">
                <button type="submit" className="co-save-addr-btn" disabled={isSavingAddress}>
                  {isSavingAddress ? 'Menyimpan…' : 'Simpan Alamat'}
                </button>
                <button type="button" className="co-cancel-btn" onClick={closeAddressPopup} disabled={isSavingAddress}>
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════ MODAL: BUKTI PEMBAYARAN ════ */}
      {showOrderPopup && (
        <div className="co-modal-overlay" onClick={() => !isSubmittingOrder && closeOrderPopup()}>
          <div className="co-modal" onClick={(e) => e.stopPropagation()}>
            <div className="co-proof-header">
              <div className="co-proof-header-left">
                <span className="co-proof-icon-wrap"><IconCard /></span>
                <div>
                  <h3 className="co-proof-title">Upload Bukti Pembayaran</h3>
                  <p className="co-proof-subtitle">Selesaikan dalam batas waktu</p>
                </div>
              </div>
              <div className={`co-proof-timer${timerClass}`}>
                <IconClock />{countdownMinutes}:{countdownSeconds}
              </div>
            </div>

            {paymentCountdown === 0 && (
              <div className="co-proof-expired-banner">
                Waktu habis. Tutup popup lalu ulangi proses order.
              </div>
            )}

            {/* Payment info */}
            <div className="co-proof-payment-box">
              <div className="co-proof-payment-label">Transfer ke</div>
              <div className="co-proof-payment-row">
                <span className="co-proof-bank-name">{selectedPayment?.name}</span>
                <span className="co-proof-bank-account">{selectedPayment?.target}</span>
              </div>
              <div className="co-proof-amount">
                Total transfer: <strong>Rp {formatRibuan(grandTotal)}</strong>
              </div>
            </div>

            {/* Dropzone */}
            <label
              className={`co-proof-dropzone${proofDrag ? ' co-proof-dropzone--drag' : ''}${proofPreview ? ' co-proof-dropzone--filled' : ''}${paymentCountdown === 0 ? ' co-proof-dropzone--disabled' : ''}`}
              onDragOver={(e) => { e.preventDefault(); if (paymentCountdown !== 0) setProofDrag(true); }}
              onDragLeave={() => setProofDrag(false)}
              onDrop={handleProofDrop}
            >
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                disabled={paymentCountdown === 0}
                onChange={(e) => pickProofFile(e.target.files?.[0] || null)}
              />
              {proofPreview ? (
                <div className="co-proof-preview-wrap">
                  <img src={proofPreview} alt="preview" className="co-proof-preview-img" />
                  <div className="co-proof-preview-info">
                    <span className="co-proof-preview-name">✓ {paymentProofFile?.name}</span>
                    <span className="co-proof-preview-change">Ketuk untuk ganti</span>
                  </div>
                </div>
              ) : (
                <div className="co-proof-dropzone-inner">
                  <IconClip />
                  <p className="co-proof-drop-text">Drag &amp; drop foto bukti transfer</p>
                  <p className="co-proof-drop-sub">atau klik untuk pilih gambar</p>
                </div>
              )}
            </label>

            {orderError && <p className="co-error" style={{ marginBottom: 12 }}>{orderError}</p>}

            <button
              className="co-proof-submit-btn"
              disabled={!paymentProofFile || paymentCountdown === 0 || isSubmittingOrder}
              onClick={submitOrder}
            >
              {isSubmittingOrder ? 'Menyimpan…' : !paymentProofFile ? 'Pilih foto terlebih dahulu' : 'Kirim Bukti Pembayaran →'}
            </button>

            <button className="co-proof-ghost-btn" onClick={closeOrderPopup} disabled={isSubmittingOrder}>
              Tutup
            </button>

            <p className="co-proof-note">Pastikan foto bukti transfer terlihat jelas dan terbaca.</p>
          </div>
        </div>
      )}
    </div>
  );
}
