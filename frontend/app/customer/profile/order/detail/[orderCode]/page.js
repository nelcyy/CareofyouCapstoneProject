'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiUrl, mediaUrl } from '@/api';

const ORDER_API = apiUrl('/api/customer/profile/order');
const RETURN_API = apiUrl('/api/customer/profile/return');
const ADDRESS_API = apiUrl('/api/customer/profile/address');
const RETURN_TOTAL_STEPS = 6;
const EXCHANGE_COURIERS = [
  { id: 'jne-reg', name: 'JNE REG' },
  { id: 'jnt-reg', name: 'J&T REG' },
  { id: 'sicepat-reg', name: 'SiCepat REG' },
];

function formatRibuan(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '0';
  return Number(digits).toLocaleString('id-ID');
}

function formatTanggal(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('id-ID');
}

function fileUrl(path) {
  return mediaUrl(path);
}

function getStoredUser() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(window.localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

function buildInitialReturnSelections(detail) {
  const nextState = {};
  (detail?.items || []).forEach((item) => {
    nextState[item.id] = '';
  });
  return nextState;
}

function buildInitialRefundForm() {
  return {
    bank_name: '',
    account_number: '',
    account_holder_name: '',
  };
}

function buildInitialExchangeForm() {
  return {
    exchange_courier_id: '',
    exchange_address_id: '',
  };
}

function getSelectedReturnItems(detail, returnSelections) {
  return (detail?.items || [])
    .map((item) => {
      const quantity = Number(returnSelections[item.id] || 0);
      return {
        order_item_id: item.id,
        product_name: item.product_name,
        ordered_quantity: item.quantity || 0,
        quantity,
        subtotal: (item.product_price || 0) * quantity,
      };
    })
    .filter((item) => item.quantity > 0);
}

function getResolutionError(returnResolutionType, refundForm, exchangeForm) {
  if (!returnResolutionType) {
    return 'Tipe penyelesaian retur wajib dipilih.';
  }
  if (returnResolutionType === 'refund') {
    if (!refundForm.bank_name.trim()) return 'Nama bank wajib diisi untuk refund.';
    if (!refundForm.account_number.trim()) return 'Nomor rekening wajib diisi untuk refund.';
    if (!refundForm.account_holder_name.trim()) return 'Nama pemilik rekening wajib diisi untuk refund.';
    return '';
  }
  if (!exchangeForm.exchange_courier_id) return 'Kurir exchange wajib dipilih.';
  if (!exchangeForm.exchange_address_id) return 'Alamat exchange wajib dipilih.';
  return '';
}

function DataTable({ children }) {
  return (
    <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse', width: '100%', marginTop: 8 }}>
      {children}
    </table>
  );
}

export default function ProfileOrderDetailPage() {
  const params = useParams();
  const orderCode = decodeURIComponent(params?.orderCode || '');
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showReturnWizard, setShowReturnWizard] = useState(false);
  const [returnStep, setReturnStep] = useState(1);
  const [returnSelections, setReturnSelections] = useState({});
  const [returnReason, setReturnReason] = useState('');
  const [productPhoto, setProductPhoto] = useState(null);
  const [receiptProof, setReceiptProof] = useState(null);
  const [returnResolutionType, setReturnResolutionType] = useState('');
  const [refundForm, setRefundForm] = useState(buildInitialRefundForm());
  const [exchangeForm, setExchangeForm] = useState(buildInitialExchangeForm());
  const [addresses, setAddresses] = useState([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [submittingReturn, setSubmittingReturn] = useState(false);

  async function loadAddresses({ silent = true } = {}) {
    const user = getStoredUser();
    if (!user || user.role !== 'customer') {
      if (!silent) {
        setError('Login dulu sebagai customer untuk mengambil alamat.');
      }
      return;
    }

    setAddressesLoading(true);
    try {
      const res = await fetch(`${ADDRESS_API}/list?user_id=${encodeURIComponent(user.id)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengambil alamat customer.');
      }
      setAddresses(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      if (!silent) {
        setError(err.message || 'Gagal mengambil alamat customer.');
      }
    } finally {
      setAddressesLoading(false);
    }
  }

  async function loadDetail(options = {}) {
    const { keepMessage = true } = options;
    const user = getStoredUser();
    if (!user || user.role !== 'customer') {
      setError('Login dulu sebagai customer untuk melihat detail pesanan.');
      setLoading(false);
      return;
    }

    if (!keepMessage) {
      setMessage('');
    }

    const res = await fetch(
      `${ORDER_API}/detail?user_id=${encodeURIComponent(user.id)}&order_code=${encodeURIComponent(orderCode)}`,
    );
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Gagal mengambil detail pesanan.');
    }

    setDetail(data);
    setReturnSelections((current) => {
      const nextState = buildInitialReturnSelections(data);
      return Object.keys(current).length > 0 ? { ...nextState, ...current } : nextState;
    });

    if (data?.return_info?.eligible) {
      loadAddresses({ silent: true });
    }
    if (!data?.return_info?.eligible) {
      setShowReturnWizard(false);
    }
  }

  function resetReturnWizard(nextDetail = detail) {
    setShowReturnWizard(false);
    setReturnStep(1);
    setReturnReason('');
    setProductPhoto(null);
    setReceiptProof(null);
    setReturnResolutionType('');
    setRefundForm(buildInitialRefundForm());
    setExchangeForm(buildInitialExchangeForm());
    setReturnSelections(buildInitialReturnSelections(nextDetail));
  }

  function handleOpenReceipt(mode) {
    const user = getStoredUser();
    if (!user || user.role !== 'customer') {
      setError('Login dulu sebagai customer untuk melihat e-receipt.');
      return;
    }

    const action = mode === 'download' ? 'download' : 'view';
    const url = `${ORDER_API}/ereceipt/${action}?user_id=${encodeURIComponent(
      user.id,
    )}&order_code=${encodeURIComponent(orderCode)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function handleStartReturn() {
    resetReturnWizard(detail);
    setShowReturnWizard(true);
    setMessage('');
    setError('');
    loadAddresses({ silent: true });
  }

  function handleReturnQtyChange(itemId, rawValue, maxQty) {
    const digits = String(rawValue ?? '').replace(/\D/g, '');
    if (!digits) {
      setReturnSelections((current) => ({ ...current, [itemId]: '' }));
      return;
    }

    const nextQuantity = Math.max(0, Math.min(Number(digits), Number(maxQty) || 0));
    setReturnSelections((current) => ({ ...current, [itemId]: String(nextQuantity) }));
  }

  async function handleSubmitReturn() {
    if (!detail) return;

    const user = getStoredUser();
    if (!user || user.role !== 'customer') {
      setError('Login dulu sebagai customer untuk mengajukan retur.');
      return;
    }

    const selectedItems = getSelectedReturnItems(detail, returnSelections);
    if (selectedItems.length === 0) {
      setError('Pilih minimal satu produk untuk diretur.');
      return;
    }
    if (!returnReason.trim()) {
      setError('Alasan retur wajib diisi.');
      return;
    }
    if (!productPhoto) {
      setError('Foto produk wajib diupload.');
      return;
    }
    if (!receiptProof) {
      setError('E-receipt wajib diupload.');
      return;
    }

    const resolutionError = getResolutionError(returnResolutionType, refundForm, exchangeForm);
    if (resolutionError) {
      setError(resolutionError);
      return;
    }

    setSubmittingReturn(true);
    setError('');
    setMessage('');

    try {
      const formData = new FormData();
      formData.append('user_id', user.id);
      formData.append('order_code', orderCode);
      formData.append('login_id', window.localStorage.getItem('login_id') || '');
      formData.append('trust_token', window.localStorage.getItem('trust_token') || '');
      formData.append('reason', returnReason.trim());
      formData.append('resolution_type', returnResolutionType);
      formData.append(
        'items_json',
        JSON.stringify(
          selectedItems.map((item) => ({
            order_item_id: item.order_item_id,
            quantity: item.quantity,
          })),
        ),
      );
      formData.append('product_photo', productPhoto);
      formData.append('ereceipt_proof', receiptProof);

      if (returnResolutionType === 'refund') {
        formData.append('bank_name', refundForm.bank_name.trim());
        formData.append('account_number', refundForm.account_number.trim());
        formData.append('account_holder_name', refundForm.account_holder_name.trim());
      } else {
        formData.append('exchange_courier_id', exchangeForm.exchange_courier_id);
        formData.append('exchange_address_id', exchangeForm.exchange_address_id);
      }

      const res = await fetch(`${RETURN_API}/create`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengirim pengajuan retur.');
      }

      setMessage(data.message || 'Pengajuan retur berhasil dikirim ke admin.');
      await loadDetail({ keepMessage: true });
      resetReturnWizard(detail);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Gagal mengirim pengajuan retur.');
    } finally {
      setSubmittingReturn(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    loadDetail({ keepMessage: true })
      .catch((err) => {
        console.error(err);
        setError(err.message || 'Gagal mengambil detail pesanan.');
      })
      .finally(() => setLoading(false));
  }, [orderCode]);

  const returnInfo = detail?.return_info || {};
  const selectedReturnItems = getSelectedReturnItems(detail, returnSelections);
  const selectedExchangeAddress = addresses.find(
    (item) => String(item.id) === String(exchangeForm.exchange_address_id),
  );
  const resolutionError = getResolutionError(returnResolutionType, refundForm, exchangeForm);
  const canContinueStep1 = selectedReturnItems.length > 0;
  const canContinueStep2 = Boolean(returnReason.trim());
  const canContinueStep3 = Boolean(productPhoto);
  const canContinueStep4 = Boolean(receiptProof);
  const canContinueStep5 = Boolean(returnResolutionType);
  const canSubmitStep6 = !submittingReturn && !addressesLoading && !resolutionError;

  return (
    <div style={{ paddingBottom: 24 }}>
      <h2>Detail Pesanan</h2>

      {loading && <p style={{ marginTop: 12 }}>Memuat detail pesanan...</p>}
      {error && <p style={{ color: 'red', marginTop: 12 }}>{error}</p>}
      {message && <p style={{ color: '#166534', marginTop: 12 }}>{message}</p>}

      {detail && (
        <>
          <h3 style={{ marginTop: 20 }}>Info Pesanan</h3>
          <DataTable>
            <tbody>
              <tr>
                <td>Kode Order</td>
                <td>{detail.order_code || '-'}</td>
              </tr>
              <tr>
                <td>Status</td>
                <td>{detail.status || '-'}</td>
              </tr>
              <tr>
                <td>Decision</td>
                <td>{detail.decision || '-'}</td>
              </tr>
              <tr>
                <td>Tanggal Order</td>
                <td>{formatTanggal(detail.created_at)}</td>
              </tr>
              <tr>
                <td>Diproses Pada</td>
                <td>{formatTanggal(detail.processed_at)}</td>
              </tr>
              <tr>
                <td>Alasan / Remarks</td>
                <td>{detail.decision_reason || '-'}</td>
              </tr>
            </tbody>
          </DataTable>

          <h3 style={{ marginTop: 24 }}>Produk</h3>
          <DataTable>
            <thead>
              <tr>
                <th>Nama</th>
                <th>Harga</th>
                <th>Qty</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {(detail.items || []).map((item, index) => (
                <tr key={item.id || index}>
                  <td>{item.product_name || '-'}</td>
                  <td>Rp {formatRibuan(item.product_price)}</td>
                  <td>{item.quantity || 0}</td>
                  <td>Rp {formatRibuan(item.subtotal)}</td>
                </tr>
              ))}
              {(detail.items || []).length === 0 && (
                <tr>
                  <td colSpan={4}>(tidak ada item)</td>
                </tr>
              )}
            </tbody>
          </DataTable>

          <h3 style={{ marginTop: 24 }}>Alamat</h3>
          <DataTable>
            <tbody>
              <tr>
                <td>Label</td>
                <td>{detail.address_label || '-'}</td>
              </tr>
              <tr>
                <td>Penerima</td>
                <td>{detail.recipient_name || '-'}</td>
              </tr>
              <tr>
                <td>Telepon</td>
                <td>{detail.recipient_phone || '-'}</td>
              </tr>
              <tr>
                <td>Alamat</td>
                <td>{detail.address_line || '-'}</td>
              </tr>
              <tr>
                <td>Kota</td>
                <td>{detail.city || '-'}</td>
              </tr>
              <tr>
                <td>Provinsi</td>
                <td>{detail.province || '-'}</td>
              </tr>
              <tr>
                <td>Kode Pos</td>
                <td>{detail.postal_code || '-'}</td>
              </tr>
              <tr>
                <td>Catatan</td>
                <td>{detail.address_notes || '-'}</td>
              </tr>
            </tbody>
          </DataTable>

          <h3 style={{ marginTop: 24 }}>Pengiriman</h3>
          <DataTable>
            <tbody>
              <tr>
                <td>Kurir</td>
                <td>{detail.courier_name || '-'}</td>
              </tr>
              <tr>
                <td>Ongkir</td>
                <td>Rp {formatRibuan(detail.shipping_fee)}</td>
              </tr>
              <tr>
                <td>Nomor Resi</td>
                <td>{detail.tracking_number || '-'}</td>
              </tr>
              <tr>
                <td>Dikirim Pada</td>
                <td>{formatTanggal(detail.shipped_at)}</td>
              </tr>
              <tr>
                <td>Catatan Pengiriman</td>
                <td>{detail.shipping_notes || '-'}</td>
              </tr>
              <tr>
                <td>Selesai Pada</td>
                <td>{formatTanggal(detail.completed_at)}</td>
              </tr>
              <tr>
                <td>Bukti Terkirim</td>
                <td>
                  {detail.delivery_proof ? (
                    <a href={fileUrl(detail.delivery_proof)} target="_blank" rel="noreferrer">
                      Lihat Bukti
                    </a>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            </tbody>
          </DataTable>

          <h3 style={{ marginTop: 24 }}>Pembayaran</h3>
          <DataTable>
            <tbody>
              <tr>
                <td>Metode</td>
                <td>{detail.payment_method || '-'}</td>
              </tr>
              <tr>
                <td>Tujuan Transfer</td>
                <td>{detail.payment_target || '-'}</td>
              </tr>
              <tr>
                <td>Bukti Transfer</td>
                <td>
                  {detail.payment_proof ? (
                    <a href={fileUrl(detail.payment_proof)} target="_blank" rel="noreferrer">
                      Lihat Bukti
                    </a>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            </tbody>
          </DataTable>

          <h3 style={{ marginTop: 24 }}>E-Receipt</h3>
          <DataTable>
            <tbody>
              <tr>
                <td>Boleh Dilihat</td>
                <td>{detail.ereceipt_eligible ? 'Ya' : 'Tidak'}</td>
              </tr>
              <tr>
                <td>Sudah Tersedia</td>
                <td>{detail.ereceipt_available ? 'Ya' : 'Tidak'}</td>
              </tr>
              <tr>
                <td>Receipt ID</td>
                <td>{detail.ereceipt_id || '-'}</td>
              </tr>
              <tr>
                <td>Generated At</td>
                <td>{formatTanggal(detail.ereceipt_generated_at)}</td>
              </tr>
            </tbody>
          </DataTable>
          <p style={{ marginTop: 12 }}>
            <button
              type="button"
              onClick={() => handleOpenReceipt('view')}
              disabled={!detail.ereceipt_eligible}
            >
              Lihat PDF
            </button>{' '}
            <button
              type="button"
              onClick={() => handleOpenReceipt('download')}
              disabled={!detail.ereceipt_eligible}
            >
              Download PDF
            </button>
          </p>
          {!detail.ereceipt_eligible && (
            <p style={{ marginTop: 8 }}>
              E-receipt baru tersedia setelah pesanan di-approve admin.
            </p>
          )}

          <div style={{ marginTop: 24, marginBottom: 24 }}>
            <p>
              <b>Subtotal: Rp {formatRibuan(detail.subtotal)}</b>
            </p>
            <p>
              <b>Ongkir: Rp {formatRibuan(detail.shipping_fee)}</b>
            </p>
            <p>
              <b>Grand Total: Rp {formatRibuan(detail.grand_total)}</b>
            </p>
          </div>

          {returnInfo.eligible && (
            <div
              style={{
                marginTop: 20,
                marginBottom: 24,
                padding: 16,
                borderRadius: 14,
                border: '1px solid rgba(196,112,106,0.2)',
                background: 'rgba(255,245,243,0.9)',
              }}
            >
              <p style={{ margin: 0, color: '#7b5a56' }}>
                Retur tersedia sampai {formatTanggal(returnInfo.deadline_at)}.
              </p>
              {!showReturnWizard && (
                <button
                  type="button"
                  onClick={handleStartReturn}
                  style={{
                    display: 'inline-block',
                    marginTop: 12,
                    padding: '10px 16px',
                    borderRadius: 999,
                    background: '#c4706a',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Ajukan Retur
                </button>
              )}

              {showReturnWizard && (
                <div
                  style={{
                    marginTop: 16,
                    padding: 16,
                    borderRadius: 12,
                    background: '#fff',
                    border: '1px solid rgba(196,112,106,0.12)',
                  }}
                >
                  <p style={{ marginTop: 0, marginBottom: 12, fontWeight: 700 }}>
                    Step {returnStep} dari {RETURN_TOTAL_STEPS}
                  </p>

                  {returnStep === 1 && (
                    <>
                      <p style={{ marginTop: 0 }}>Pilih produk dan jumlah pcs yang ingin diretur.</p>
                      <DataTable>
                        <thead>
                          <tr>
                            <th>Produk</th>
                            <th>Qty Dibeli</th>
                            <th>Qty Retur</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(detail.items || []).map((item) => (
                            <tr key={item.id}>
                              <td>{item.product_name}</td>
                              <td>{item.quantity}</td>
                              <td>
                                <input
                                  type="number"
                                  min="0"
                                  max={item.quantity || 0}
                                  value={returnSelections[item.id] ?? ''}
                                  onChange={(event) => handleReturnQtyChange(item.id, event.target.value, item.quantity)}
                                  style={{ width: 88 }}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </DataTable>
                    </>
                  )}

                  {returnStep === 2 && (
                    <>
                      <p style={{ marginTop: 0 }}>Tulis alasan retur.</p>
                      <textarea
                        value={returnReason}
                        onChange={(event) => setReturnReason(event.target.value)}
                        rows={5}
                        placeholder="Contoh: produk rusak saat diterima / shade tidak sesuai / segel terbuka."
                        style={{ width: '100%', padding: 12, resize: 'vertical' }}
                      />
                    </>
                  )}

                  {returnStep === 3 && (
                    <>
                      <p style={{ marginTop: 0 }}>Upload foto produk sebagai bukti kondisi barang.</p>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => setProductPhoto(event.target.files?.[0] || null)}
                      />
                      <p style={{ marginBottom: 0, color: '#7b5a56' }}>
                        {productPhoto ? `File terpilih: ${productPhoto.name}` : 'Belum ada file dipilih.'}
                      </p>
                    </>
                  )}

                  {returnStep === 4 && (
                    <>
                      <p style={{ marginTop: 0 }}>Upload file e-receipt PDF untuk melanjutkan pengajuan retur.</p>
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        onChange={(event) => setReceiptProof(event.target.files?.[0] || null)}
                      />
                      <p style={{ marginTop: 12, marginBottom: 0, color: '#7b5a56' }}>
                        {receiptProof ? `File terpilih: ${receiptProof.name}` : 'Belum ada file dipilih.'}
                      </p>
                    </>
                  )}

                  {returnStep === 5 && (
                    <>
                      <p style={{ marginTop: 0 }}>Pilih jenis penyelesaian retur yang kamu inginkan.</p>
                      <label style={{ display: 'block', marginBottom: 8 }}>
                        <input
                          type="radio"
                          name="return-resolution-type"
                          value="refund"
                          checked={returnResolutionType === 'refund'}
                          onChange={(event) => setReturnResolutionType(event.target.value)}
                        />{' '}
                        Refund
                      </label>
                      <label style={{ display: 'block' }}>
                        <input
                          type="radio"
                          name="return-resolution-type"
                          value="exchange"
                          checked={returnResolutionType === 'exchange'}
                          onChange={(event) => setReturnResolutionType(event.target.value)}
                        />{' '}
                        Exchange
                      </label>
                    </>
                  )}

                  {returnStep === 6 && (
                    <>
                      {returnResolutionType === 'refund' && (
                        <>
                          <p style={{ marginTop: 0 }}>Isi data rekening untuk refund.</p>
                          <p style={{ marginBottom: 8 }}>
                            <input
                              type="text"
                              placeholder="Nama bank"
                              value={refundForm.bank_name}
                              onChange={(event) => {
                                setRefundForm((current) => ({ ...current, bank_name: event.target.value }));
                              }}
                              style={{ width: '100%', padding: 10 }}
                            />
                          </p>
                          <p style={{ marginBottom: 8 }}>
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="Nomor rekening"
                              value={refundForm.account_number}
                              onChange={(event) => {
                                setRefundForm((current) => ({ ...current, account_number: event.target.value }));
                              }}
                              style={{ width: '100%', padding: 10 }}
                            />
                          </p>
                          <p style={{ marginBottom: 0 }}>
                            <input
                              type="text"
                              placeholder="Nama pemilik rekening"
                              value={refundForm.account_holder_name}
                              onChange={(event) => {
                                setRefundForm((current) => ({
                                  ...current,
                                  account_holder_name: event.target.value,
                                }));
                              }}
                              style={{ width: '100%', padding: 10 }}
                            />
                          </p>
                        </>
                      )}

                      {returnResolutionType === 'exchange' && (
                        <>
                          <p style={{ marginTop: 0 }}>Pilih kurir dan alamat untuk exchange.</p>
                          <p style={{ marginBottom: 8 }}>
                            <select
                              value={exchangeForm.exchange_courier_id}
                              onChange={(event) => {
                                setExchangeForm((current) => ({
                                  ...current,
                                  exchange_courier_id: event.target.value,
                                }));
                              }}
                              style={{ width: '100%', padding: 10 }}
                            >
                              <option value="">Pilih kurir</option>
                              {EXCHANGE_COURIERS.map((courier) => (
                                <option key={courier.id} value={courier.id}>
                                  {courier.name}
                                </option>
                              ))}
                            </select>
                          </p>

                          {addressesLoading && <p style={{ marginTop: 0 }}>Memuat alamat customer...</p>}
                          {!addressesLoading && addresses.length === 0 && (
                            <p style={{ marginTop: 0 }}>
                              Belum ada alamat tersimpan. Tambah dulu di{' '}
                              <Link href="/customer/profile/address">halaman address</Link>.
                            </p>
                          )}
                          {!addressesLoading && addresses.length > 0 && (
                            <>
                              <p style={{ marginBottom: 8 }}>
                                <select
                                  value={exchangeForm.exchange_address_id}
                                  onChange={(event) => {
                                    setExchangeForm((current) => ({
                                      ...current,
                                      exchange_address_id: event.target.value,
                                    }));
                                  }}
                                  style={{ width: '100%', padding: 10 }}
                                >
                                  <option value="">Pilih alamat</option>
                                  {addresses.map((address) => (
                                    <option key={address.id} value={address.id}>
                                      {address.label} - {address.recipient_name}
                                    </option>
                                  ))}
                                </select>
                              </p>

                              {selectedExchangeAddress && (
                                <DataTable>
                                  <tbody>
                                    <tr>
                                      <td>Label</td>
                                      <td>{selectedExchangeAddress.label || '-'}</td>
                                    </tr>
                                    <tr>
                                      <td>Penerima</td>
                                      <td>{selectedExchangeAddress.recipient_name || '-'}</td>
                                    </tr>
                                    <tr>
                                      <td>Telepon</td>
                                      <td>{selectedExchangeAddress.phone || '-'}</td>
                                    </tr>
                                    <tr>
                                      <td>Alamat</td>
                                      <td>{selectedExchangeAddress.address_line || '-'}</td>
                                    </tr>
                                    <tr>
                                      <td>Kota</td>
                                      <td>{selectedExchangeAddress.city || '-'}</td>
                                    </tr>
                                    <tr>
                                      <td>Provinsi</td>
                                      <td>{selectedExchangeAddress.province || '-'}</td>
                                    </tr>
                                    <tr>
                                      <td>Kode Pos</td>
                                      <td>{selectedExchangeAddress.postal_code || '-'}</td>
                                    </tr>
                                    <tr>
                                      <td>Catatan</td>
                                      <td>{selectedExchangeAddress.notes || '-'}</td>
                                    </tr>
                                  </tbody>
                                </DataTable>
                              )}
                            </>
                          )}
                        </>
                      )}

                      <div style={{ marginTop: 16 }}>
                        <p style={{ marginTop: 0, fontWeight: 700 }}>Ringkasan retur</p>
                        <ul style={{ marginTop: 0, paddingLeft: 18 }}>
                          {selectedReturnItems.map((item) => (
                            <li key={item.order_item_id}>
                              {item.product_name}: {item.quantity} pcs
                            </li>
                          ))}
                        </ul>
                        <p style={{ marginBottom: 0 }}>
                          Tipe penyelesaian: <b>{returnResolutionType || '-'}</b>
                        </p>
                      </div>
                    </>
                  )}

                  <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (returnStep === 1) {
                          resetReturnWizard(detail);
                          return;
                        }
                        setReturnStep((current) => Math.max(1, current - 1));
                      }}
                      disabled={submittingReturn}
                    >
                      {returnStep === 1 ? 'Batal' : 'Kembali'}
                    </button>

                    {returnStep === 1 && (
                      <button type="button" onClick={() => setReturnStep(2)} disabled={!canContinueStep1}>
                        Lanjut
                      </button>
                    )}
                    {returnStep === 2 && (
                      <button type="button" onClick={() => setReturnStep(3)} disabled={!canContinueStep2}>
                        Lanjut
                      </button>
                    )}
                    {returnStep === 3 && (
                      <button type="button" onClick={() => setReturnStep(4)} disabled={!canContinueStep3}>
                        Lanjut
                      </button>
                    )}
                    {returnStep === 4 && (
                      <button type="button" onClick={() => setReturnStep(5)} disabled={!canContinueStep4}>
                        Lanjut
                      </button>
                    )}
                    {returnStep === 5 && (
                      <button type="button" onClick={() => setReturnStep(6)} disabled={!canContinueStep5}>
                        Lanjut
                      </button>
                    )}
                    {returnStep === 6 && (
                      <button type="button" onClick={handleSubmitReturn} disabled={!canSubmitStep6}>
                        {submittingReturn ? 'Mengirim...' : 'Kirim ke Admin'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {!returnInfo.eligible && returnInfo.has_return && (
            <div
              style={{
                marginTop: 20,
                marginBottom: 24,
                padding: 16,
                borderRadius: 14,
                border: '1px solid rgba(74,159,212,0.2)',
                background: 'rgba(240,248,255,0.9)',
              }}
            >
              <p style={{ margin: 0, color: '#355f7d' }}>
                Retur untuk pesanan ini sudah diajukan dengan kode {returnInfo.return_code || '-'} dan status{' '}
                {returnInfo.return_status_label || returnInfo.return_status || '-'}.
              </p>
              <Link
                href={`/customer/profile/return/detail/${encodeURIComponent(returnInfo.return_code || '-')}`}
                style={{ display: 'inline-block', marginTop: 10, color: '#355f7d', fontWeight: 600 }}
              >
                Lihat detail retur
              </Link>
            </div>
          )}

          {!returnInfo.eligible && !returnInfo.has_return && returnInfo.expired && (
            <p style={{ marginTop: 12, color: '#8a6a65' }}>
              Masa retur 2 hari untuk pesanan ini sudah berakhir.
            </p>
          )}
        </>
      )}

      <Link href="/customer/profile/order">Kembali ke daftar pesanan</Link>
    </div>
  );
}
