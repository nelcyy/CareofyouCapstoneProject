'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const CART_API = 'http://localhost:8000/api/customer/cart';
const CHECKOUT_API = 'http://localhost:8000/api/customer/cart/checkout';
const BACKEND = 'http://localhost:8000';

function formatRibuan(value) {
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('id-ID');
}

function imgUrl(path) {
  if (!path) return '';
  return path.startsWith('http') ? path : BACKEND + path;
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

  const selectedCourier = COURIER_OPTIONS.find((it) => it.id === selectedCourierId) || COURIER_OPTIONS[0];
  const selectedPayment = PAYMENT_OPTIONS.find((it) => it.id === selectedPaymentId) || PAYMENT_OPTIONS[0];
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
      router.push('/customer/cart');
    } catch (error) {
      console.error(error);
      setOrderError('Gagal membuat order.');
    } finally {
      setIsSubmittingOrder(false);
    }
  }

  if (userId === null) {
    return (
      <div>
        <h2>Checkout</h2>
        <p>Login dulu sebagai customer buat lanjut checkout.</p>
        <Link href="/customer/cart">Kembali ke keranjang</Link>
      </div>
    );
  }

  return (
    <div>
      <h2>Checkout</h2>

      <h3 style={{ marginBottom: 0 }}>Product</h3>
      <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>Foto</th>
            <th>Nama</th>
            <th>Harga</th>
            <th>Qty</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td>{it.image ? <img src={imgUrl(it.image)} alt="" width={40} /> : '-'}</td>
              <td>{it.name}</td>
              <td>Rp {formatRibuan(it.price)}</td>
              <td>{it.quantity}</td>
              <td>Rp {formatRibuan(it.price * it.quantity)}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={5}>(keranjang kosong)</td>
            </tr>
          )}
        </tbody>
      </table>

      <p>
        <b>Total Checkout: Rp {formatRibuan(total)}</b>
      </p>

      <h3 style={{ marginTop: 24, marginBottom: 0 }}>Alamat</h3>
      <p style={{ marginTop: 8, marginBottom: 8 }}>
        <button type="button" onClick={openAddressPopup}>
          Tambah Alamat
        </button>
      </p>
      {addresses.length === 0 ? (
        <p>Belum ada alamat.</p>
      ) : (
        <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>Label</th>
              <th>Penerima</th>
              <th>Telepon</th>
              <th>Alamat</th>
              <th>Kota</th>
              <th>Provinsi</th>
              <th>Kode Pos</th>
              <th>Catatan</th>
              <th>Default</th>
              <th>Pilih</th>
            </tr>
          </thead>
          <tbody>
            {addresses.map((it) => (
              <tr key={it.id}>
                <td>{it.label}</td>
                <td>{it.recipient_name}</td>
                <td>{it.phone}</td>
                <td>{it.address_line}</td>
                <td>{it.city}</td>
                <td>{it.province}</td>
                <td>{it.postal_code}</td>
                <td>{it.notes || '-'}</td>
                <td>{it.is_default ? 'Ya' : '-'}</td>
                <td>
                  <input
                    type="radio"
                    name="selected_address"
                    checked={selectedAddressId === it.id}
                    onChange={() => setSelectedAddressId(it.id)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 style={{ marginTop: 24, marginBottom: 0 }}>Kurir</h3>
      <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>Kurir</th>
            <th>Ongkir</th>
            <th>Pilih</th>
          </tr>
        </thead>
        <tbody>
          {COURIER_OPTIONS.map((it) => (
            <tr key={it.id}>
              <td>{it.name}</td>
              <td>Rp {formatRibuan(it.fee)}</td>
              <td>
                <input
                  type="radio"
                  name="selected_courier"
                  checked={selectedCourierId === it.id}
                  onChange={() => setSelectedCourierId(it.id)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ marginTop: 24, marginBottom: 0 }}>Pembayaran</h3>
      <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>Metode</th>
            <th>Pilih</th>
          </tr>
        </thead>
        <tbody>
          {PAYMENT_OPTIONS.map((it) => (
            <tr key={it.id}>
              <td>{it.name}</td>
              <td>
                <input
                  type="radio"
                  name="selected_payment"
                  checked={selectedPaymentId === it.id}
                  onChange={() => setSelectedPaymentId(it.id)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 24, marginBottom: 24 }}>
        <p>
          <b>Grand Total: Rp {formatRibuan(grandTotal)}</b>
        </p>
        <button type="button" disabled={!selectedAddressId || items.length === 0} onClick={openOrderPopup}>
          Order
        </button>
      </div>

      {showAddressPopup && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#fff',
              width: '100%',
              maxWidth: 560,
              padding: 20,
              borderRadius: 8,
            }}
          >
            <h3>Tambah Alamat</h3>
            <form onSubmit={submitAddress}>
              <table cellPadding="6" style={{ width: '100%' }}>
                <tbody>
                  <tr>
                    <td>Label</td>
                    <td>
                      <input
                        type="text"
                        value={addressForm.label}
                        onChange={(e) => updateAddressField('label', e.target.value)}
                        style={{ width: '100%' }}
                      />
                    </td>
                  </tr>
                  <tr>
                    <td>Nama Penerima</td>
                    <td>
                      <input
                        type="text"
                        value={addressForm.recipient_name}
                        onChange={(e) => updateAddressField('recipient_name', e.target.value)}
                        style={{ width: '100%' }}
                        required
                      />
                    </td>
                  </tr>
                  <tr>
                    <td>Telepon</td>
                    <td>
                      <input
                        type="text"
                        value={addressForm.phone}
                        onChange={(e) => updateAddressField('phone', e.target.value)}
                        style={{ width: '100%' }}
                        required
                      />
                    </td>
                  </tr>
                  <tr>
                    <td>Alamat</td>
                    <td>
                      <textarea
                        value={addressForm.address_line}
                        onChange={(e) => updateAddressField('address_line', e.target.value)}
                        rows={3}
                        style={{ width: '100%' }}
                        required
                      />
                    </td>
                  </tr>
                  <tr>
                    <td>Kota</td>
                    <td>
                      <input
                        type="text"
                        value={addressForm.city}
                        onChange={(e) => updateAddressField('city', e.target.value)}
                        style={{ width: '100%' }}
                        required
                      />
                    </td>
                  </tr>
                  <tr>
                    <td>Provinsi</td>
                    <td>
                      <input
                        type="text"
                        value={addressForm.province}
                        onChange={(e) => updateAddressField('province', e.target.value)}
                        style={{ width: '100%' }}
                        required
                      />
                    </td>
                  </tr>
                  <tr>
                    <td>Kode Pos</td>
                    <td>
                      <input
                        type="text"
                        value={addressForm.postal_code}
                        onChange={(e) => updateAddressField('postal_code', e.target.value)}
                        style={{ width: '100%' }}
                        required
                      />
                    </td>
                  </tr>
                  <tr>
                    <td>Catatan</td>
                    <td>
                      <input
                        type="text"
                        value={addressForm.notes}
                        onChange={(e) => updateAddressField('notes', e.target.value)}
                        style={{ width: '100%' }}
                      />
                    </td>
                  </tr>
                  <tr>
                    <td>Default</td>
                    <td>
                      <label>
                        <input
                          type="checkbox"
                          checked={addressForm.is_default}
                          onChange={(e) => updateAddressField('is_default', e.target.checked)}
                        />{' '}
                        Jadikan alamat utama
                      </label>
                    </td>
                  </tr>
                </tbody>
              </table>

              {addressError && <p style={{ color: 'red' }}>{addressError}</p>}

              <p style={{ marginBottom: 0 }}>
                <button type="submit" disabled={isSavingAddress}>
                  {isSavingAddress ? 'Menyimpan...' : 'Simpan Alamat'}
                </button>{' '}
                <button type="button" onClick={closeAddressPopup} disabled={isSavingAddress}>
                  Batal
                </button>
              </p>
            </form>
          </div>
        </div>
      )}

      {showOrderPopup && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#fff',
              width: '100%',
              maxWidth: 560,
              padding: 20,
              borderRadius: 8,
            }}
          >
            <h3>Pembayaran Order</h3>
            <p>Metode pembayaran: <b>{selectedPayment.name}</b></p>
            <p>{selectedPayment.targetLabel}: <b>{selectedPayment.target}</b></p>
            <p>Total transfer: <b>Rp {formatRibuan(grandTotal)}</b></p>
            <p>Waktu transfer dan upload bukti: <b>{countdownMinutes}:{countdownSeconds}</b></p>
            {paymentCountdown === 0 && (
              <p style={{ color: 'red' }}>Waktu habis. Tutup popup lalu ulangi proses order.</p>
            )}

            <p style={{ marginTop: 16, marginBottom: 8 }}>
              <label>
                Upload Bukti Transfer:
                <br />
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    setPaymentProofFile(e.target.files?.[0] || null);
                    setOrderError('');
                  }}
                  disabled={paymentCountdown === 0}
                />
              </label>
            </p>
            {paymentProofFile && (
              <p>File dipilih: <b>{paymentProofFile.name}</b></p>
            )}
            {orderError && <p style={{ color: 'red' }}>{orderError}</p>}

            <p style={{ marginBottom: 0 }}>
              <button
                type="button"
                disabled={!paymentProofFile || paymentCountdown === 0 || isSubmittingOrder}
                onClick={submitOrder}
              >
                {isSubmittingOrder ? 'Menyimpan...' : 'Order'}
              </button>{' '}
              <button type="button" onClick={closeOrderPopup} disabled={isSubmittingOrder}>
                Tutup
              </button>
            </p>
          </div>
        </div>
      )}

      <Link href="/customer/cart">Kembali ke keranjang</Link>
    </div>
  );
}
