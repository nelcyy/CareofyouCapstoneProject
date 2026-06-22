'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

const API = 'http://localhost:8000/api/admin/pesanan';
const BACKEND = 'http://localhost:8000';

function formatRibuan(value) {
  const digits = String(value).replace(/\D/g, '');
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

export default function DetailPesananPage() {
  const params = useParams();
  const orderCode = decodeURIComponent(params?.orderCode || '');
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');

  function handleAdminAction(action) {
    window.alert(`Tombol ${action} belum diproses ke backend.`);
  }

  useEffect(() => {
    if (!orderCode) return;

    setDetail(null);
    setError('');
    fetch(`${API}/detail?order_code=${encodeURIComponent(orderCode)}`)
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
      });
  }, [orderCode]);

  return (
    <div>
      <h2>Detail Pesanan</h2>

      {!detail && !error && <p>Memuat detail pesanan...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {detail && (
        <>
          <h3 style={{ marginBottom: 0 }}>Info Pesanan</h3>
          <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td>Kode Order</td>
                <td>{detail.order_code || '-'}</td>
              </tr>
              <tr>
                <td>Customer</td>
                <td>{detail.customer_name || '-'}</td>
              </tr>
              <tr>
                <td>Email</td>
                <td>{detail.customer_email || '-'}</td>
              </tr>
              <tr>
                <td>Status</td>
                <td>{detail.status || '-'}</td>
              </tr>
              <tr>
                <td>Tanggal Order</td>
                <td>{formatTanggal(detail.created_at)}</td>
              </tr>
            </tbody>
          </table>

          <h3 style={{ marginTop: 24, marginBottom: 0 }}>Product</h3>
          <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>Nama</th>
                <th>Harga</th>
                <th>Qty</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {detail.items.map((item, index) => (
                <tr key={item.id || index}>
                  <td>{item.product_name}</td>
                  <td>Rp {formatRibuan(item.product_price)}</td>
                  <td>{item.quantity}</td>
                  <td>Rp {formatRibuan(item.subtotal)}</td>
                </tr>
              ))}
              {detail.items.length === 0 && (
                <tr>
                  <td colSpan={4}>(tidak ada item)</td>
                </tr>
              )}
            </tbody>
          </table>

          <h3 style={{ marginTop: 24, marginBottom: 0 }}>Alamat</h3>
          <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
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
          </table>

          <h3 style={{ marginTop: 24, marginBottom: 0 }}>Pengiriman</h3>
          <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td>Kurir</td>
                <td>{detail.courier_name || '-'}</td>
              </tr>
              <tr>
                <td>Ongkir</td>
                <td>Rp {formatRibuan(detail.shipping_fee)}</td>
              </tr>
            </tbody>
          </table>

          <h3 style={{ marginTop: 24, marginBottom: 0 }}>Pembayaran</h3>
          <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
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
                  ) : '-'}
                </td>
              </tr>
            </tbody>
          </table>

          <h3 style={{ marginTop: 24, marginBottom: 0 }}>Monitoring</h3>
          <p style={{ marginTop: 8, marginBottom: 0 }}><b>Device</b></p>
          <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td>Device Label</td>
                <td>{detail.monitoring?.device?.device_label_snapshot || '-'}</td>
              </tr>
              <tr>
                <td>Status Saat Order</td>
                <td>{detail.monitoring?.device?.trusted_device_status_label || '-'}</td>
              </tr>
            </tbody>
          </table>

          <p style={{ marginTop: 12, marginBottom: 0 }}><b>Password</b></p>
          <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td>Jumlah Salah Password</td>
                <td>{detail.monitoring?.password?.failed_password_count ?? 0}</td>
              </tr>
            </tbody>
          </table>

          <p style={{ marginTop: 12, marginBottom: 0 }}><b>OTP</b></p>
          <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td>Jumlah Gagal OTP</td>
                <td>{detail.monitoring?.otp?.failed_otp_count ?? 0}</td>
              </tr>
            </tbody>
          </table>

          <p style={{ marginTop: 12, marginBottom: 0 }}><b>Ringkasan</b></p>
          <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td>Total Risk Score</td>
                <td>{detail.monitoring?.total_risk_score ?? '-'}</td>
              </tr>
            </tbody>
          </table>

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
            <p style={{ marginTop: 16, marginBottom: 0 }}>
              <button type="button" onClick={() => handleAdminAction('Approve')}>
                Approve
              </button>{' '}
              <button type="button" onClick={() => handleAdminAction('Reject')}>
                Reject
              </button>
            </p>
          </div>
        </>
      )}

      <Link href="/admin/pesanan">Kembali ke daftar pesanan</Link>
    </div>
  );
}
