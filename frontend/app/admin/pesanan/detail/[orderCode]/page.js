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
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');

  async function loadDetail() {
    setDetail(null);
    setError('');
    setActionMessage('');

    try {
      const res = await fetch(`${API}/detail?order_code=${encodeURIComponent(orderCode)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengambil detail pesanan.');
      }
      setDetail(data);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Gagal mengambil detail pesanan.');
    }
  }

  async function postAction(path, payload) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return { res, data };
  }

  async function handleOtpChallenge(action, initialPayload, adminUser) {
    let payload = initialPayload;

    while (payload?.otp_required) {
      if (!payload.otp?.verify_allowed) {
        setError(payload.error || 'OTP belum bisa diverifikasi.');
        return;
      }

      const promptLines = [
        payload.message || `Masukkan OTP untuk ${action}.`,
        `Risk: ${payload.risk_level || '-'}`,
      ];
      if (payload.otp?.expires_in_seconds > 0) {
        promptLines.push(`Sisa waktu OTP: ${payload.otp.expires_in_seconds} detik`);
      }
      const otp = window.prompt(promptLines.join('\n'), '');
      if (otp === null) {
        setActionMessage('Verifikasi OTP dibatalkan.');
        return;
      }

      setActionLoading(true);
      setError('');

      try {
        const confirmResult = await postAction(`${API}/${action}/confirm`, {
          action_session_id: payload.action_session_id,
          admin_user_id: adminUser.id,
          otp,
        });
        const confirmData = confirmResult.data;
        if (confirmResult.res.ok) {
          setDetail(confirmData.order || null);
          setActionMessage(confirmData.message || `Pesanan berhasil di-${action}.`);
          return;
        }

        if (confirmData.otp?.resend_allowed) {
          const wantsResend = window.confirm(
            `${confirmData.error || 'OTP gagal diverifikasi.'}\n\nKirim ulang OTP sekarang?`,
          );
          if (wantsResend) {
            const resendResult = await postAction(`${API}/${action}/resend`, {
              action_session_id: payload.action_session_id,
              admin_user_id: adminUser.id,
            });
            if (!resendResult.res.ok) {
              setError(resendResult.data.error || 'Gagal mengirim ulang OTP.');
              return;
            }
            payload = resendResult.data;
            continue;
          }
        }

        setError(confirmData.error || 'Verifikasi OTP gagal.');
        return;
      } finally {
        setActionLoading(false);
      }
    }
  }

  async function handleAdminAction(action) {
    if (!orderCode || actionLoading) return;

    const adminUser = JSON.parse(localStorage.getItem('user') || 'null');
    if (!adminUser?.id || adminUser.role !== 'admin') {
      setError('User admin tidak ditemukan. Silakan login ulang sebagai admin.');
      return;
    }

    const actionSlug = action.toLowerCase();
    let decisionReason = '';
    if (action === 'Reject') {
      const promptReason = window.prompt('Tulis alasan / remarks untuk reject pesanan:', '');
      if (promptReason === null) {
        setActionMessage('Reject dibatalkan.');
        return;
      }
      decisionReason = promptReason.trim();
      if (!decisionReason) {
        setError('Alasan reject wajib diisi.');
        return;
      }
    }

    setActionLoading(true);
    setActionMessage('');
    setError('');

    try {
      const result = await postAction(`${API}/${actionSlug}`, {
        order_code: orderCode,
        admin_user_id: adminUser.id,
        decision_reason: decisionReason,
      });
      const data = result.data;

      if (data.otp_required) {
        setActionLoading(false);
        await handleOtpChallenge(actionSlug, data, adminUser);
        return;
      }

      if (!result.res.ok) {
        throw new Error(data.error || `Gagal ${actionSlug} pesanan.`);
      }

      setDetail(data.order || null);
      setActionMessage(data.message || `Pesanan berhasil di-${actionSlug}.`);
    } catch (err) {
      console.error(err);
      setError(err.message || `Gagal ${actionSlug} pesanan.`);
    } finally {
      setActionLoading(false);
    }
  }

  useEffect(() => {
    if (!orderCode) return;

    loadDetail();
  }, [orderCode]);

  const canProcess = detail?.status === 'waiting_admin_approval';

  return (
    <div>
      <h2>Detail Pesanan</h2>

      {!detail && !error && <p>Memuat detail pesanan...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {actionMessage && <p style={{ color: 'green' }}>{actionMessage}</p>}

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
                <td>Risk Level</td>
                <td>{detail.risk_level || '-'}</td>
              </tr>
              <tr>
                <td>Approve Butuh OTP</td>
                <td>{detail.approve_requires_otp ? 'Ya' : 'Tidak'}</td>
              </tr>
              <tr>
                <td>Reject Butuh OTP</td>
                <td>{detail.reject_requires_otp ? 'Ya' : 'Tidak'}</td>
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
              <tr>
                <td>Score Device</td>
                <td>{detail.monitoring?.device?.device_risk_score ?? 0}</td>
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
              <tr>
                <td>Score Password</td>
                <td>{detail.monitoring?.password?.failed_password_score ?? 0}</td>
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
              <tr>
                <td>Score OTP</td>
                <td>{detail.monitoring?.otp?.failed_otp_score ?? 0}</td>
              </tr>
            </tbody>
          </table>

          <p style={{ marginTop: 12, marginBottom: 0 }}><b>Fraud - Alamat</b></p>
          <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td>Umur Alamat Saat Order</td>
                <td>{detail.monitoring?.fraud?.address?.address_age_minutes ?? 0} menit</td>
              </tr>
              <tr>
                <td>Score Alamat Baru</td>
                <td>{detail.monitoring?.fraud?.address?.new_address_score ?? 0}</td>
              </tr>
            </tbody>
          </table>

          <p style={{ marginTop: 12, marginBottom: 0 }}><b>Fraud - Nominal</b></p>
          <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td>Rasio Nominal vs Kebiasaan</td>
                <td>
                  {detail.monitoring?.fraud?.amount?.order_amount_ratio_percent
                    ? `${detail.monitoring?.fraud?.amount?.order_amount_ratio_percent}%`
                    : '-'}
                </td>
              </tr>
              <tr>
                <td>Score Nominal</td>
                <td>{detail.monitoring?.fraud?.amount?.amount_anomaly_score ?? 0}</td>
              </tr>
            </tbody>
          </table>

          <p style={{ marginTop: 12, marginBottom: 0 }}><b>Fraud - Qty</b></p>
          <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td>Total Qty Item</td>
                <td>{detail.monitoring?.fraud?.qty?.total_item_quantity ?? 0}</td>
              </tr>
              <tr>
                <td>Qty Terbanyak per Produk</td>
                <td>{detail.monitoring?.fraud?.qty?.max_single_product_quantity ?? 0}</td>
              </tr>
              <tr>
                <td>Score Borong</td>
                <td>{detail.monitoring?.fraud?.qty?.bulk_order_score ?? 0}</td>
              </tr>
            </tbody>
          </table>

          <p style={{ marginTop: 12, marginBottom: 0 }}><b>Fraud - Akun Baru</b></p>
          <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td>Umur Akun Saat Order</td>
                <td>{detail.monitoring?.fraud?.new_account?.account_age_days ?? 0} hari</td>
              </tr>
              <tr>
                <td>Score Akun Baru + Order Besar</td>
                <td>{detail.monitoring?.fraud?.new_account?.new_account_big_order_score ?? 0}</td>
              </tr>
            </tbody>
          </table>

          <p style={{ marginTop: 12, marginBottom: 0 }}><b>Fraud - Order Cepat</b></p>
          <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td>Order Sebelumnya 30 Menit</td>
                <td>{detail.monitoring?.fraud?.rapid_order?.recent_orders_30m_count ?? 0}</td>
              </tr>
              <tr>
                <td>Score Order Cepat</td>
                <td>{detail.monitoring?.fraud?.rapid_order?.rapid_order_score ?? 0}</td>
              </tr>
            </tbody>
          </table>

          <p style={{ marginTop: 12, marginBottom: 0 }}><b>Ringkasan</b></p>
          <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td>Hijack Risk Score</td>
                <td>{detail.monitoring?.summary?.hijack_risk_score ?? 0}</td>
              </tr>
              <tr>
                <td>Fraud Risk Score</td>
                <td>{detail.monitoring?.summary?.fraud_risk_score ?? 0}</td>
              </tr>
              <tr>
                <td>Total Risk Score</td>
                <td>{detail.monitoring?.summary?.total_risk_score ?? 0}</td>
              </tr>
            </tbody>
          </table>

          <p style={{ marginTop: 12, marginBottom: 0 }}><b>Keputusan Admin</b></p>
          <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td>Decision</td>
                <td>{detail.decision || '-'}</td>
              </tr>
              <tr>
                <td>Diproses Oleh</td>
                <td>{detail.processed_by_name || '-'}</td>
              </tr>
              <tr>
                <td>Diproses Pada</td>
                <td>{formatTanggal(detail.processed_at)}</td>
              </tr>
              <tr>
                <td>OTP Verified For Action</td>
                <td>{detail.otp_verified_for_action ? 'Ya' : 'Tidak'}</td>
              </tr>
              <tr>
                <td>Decision Risk Score</td>
                <td>{detail.decision_risk_score ?? '-'}</td>
              </tr>
              <tr>
                <td>Decision Risk Level</td>
                <td>{detail.decision_risk_level || '-'}</td>
              </tr>
              <tr>
                <td>Decision Reason</td>
                <td>{detail.decision_reason || '-'}</td>
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
              <button
                type="button"
                onClick={() => handleAdminAction('Approve')}
                disabled={actionLoading || !canProcess}
              >
                {actionLoading ? 'Memproses...' : 'Approve'}
              </button>{' '}
              <button
                type="button"
                onClick={() => handleAdminAction('Reject')}
                disabled={actionLoading || !canProcess}
              >
                Reject
              </button>
            </p>
            {!canProcess && (
              <p style={{ marginTop: 8, marginBottom: 0 }}>
                Order ini sudah tidak berada di tahap waiting admin approval.
              </p>
            )}
          </div>
        </>
      )}

      <Link href="/admin/pesanan">Kembali ke daftar pesanan</Link>
    </div>
  );
}
