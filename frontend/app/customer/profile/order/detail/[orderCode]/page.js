'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

const API = 'http://localhost:8000/api/customer/profile/order';
const BACKEND = 'http://localhost:8000';

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
  if (!path) return '';
  return path.startsWith('http') ? path : `${BACKEND}${path}`;
}

function getStoredUser() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(window.localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
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

  function handleOpenReceipt(mode) {
    const user = getStoredUser();
    if (!user || user.role !== 'customer') {
      setError('Login dulu sebagai customer untuk melihat e-receipt.');
      return;
    }

    const action = mode === 'download' ? 'download' : 'view';
    const url = `${API}/ereceipt/${action}?user_id=${encodeURIComponent(
      user.id,
    )}&order_code=${encodeURIComponent(orderCode)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  useEffect(() => {
    const user = getStoredUser();
    if (!user || user.role !== 'customer') {
      setError('Login dulu sebagai customer untuk melihat detail pesanan.');
      setLoading(false);
      return;
    }

    fetch(
      `${API}/detail?user_id=${encodeURIComponent(user.id)}&order_code=${encodeURIComponent(orderCode)}`,
    )
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Gagal mengambil detail pesanan.');
        }
        setDetail(data);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message || 'Gagal mengambil detail pesanan.');
      })
      .finally(() => setLoading(false));
  }, [orderCode]);

  return (
    <div style={{ paddingBottom: 24 }}>
      <h2>Detail Pesanan</h2>

      {loading && <p style={{ marginTop: 12 }}>Memuat detail pesanan...</p>}
      {error && <p style={{ color: 'red', marginTop: 12 }}>{error}</p>}

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
        </>
      )}

      <Link href="/customer/profile/order">Kembali ke daftar pesanan</Link>
    </div>
  );
}
