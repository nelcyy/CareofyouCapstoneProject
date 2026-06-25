'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiUrl, mediaUrl } from '@/api';

const API = apiUrl('/api/admin/pesanan');
const QR_READY_STATUSES = ['pengemasan', 'pengiriman', 'selesai'];

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

function imgUrl(path) {
  return mediaUrl(path);
}

function fileUrl(path) {
  return mediaUrl(path);
}

function isQrReadyStatus(status) {
  return QR_READY_STATUSES.includes(status);
}

function buildOrderQrSlots(orderDetail) {
  if (!orderDetail?.order_code || !Array.isArray(orderDetail.items)) return [];

  const slots = [];
  orderDetail.items.forEach((item, itemIndex) => {
    const qty = Number(item.quantity) || 0;
    for (let unitIndex = 1; unitIndex <= qty; unitIndex += 1) {
      slots.push({
        unitId: `${orderDetail.order_code}-ITEM${String(itemIndex).padStart(2, '0')}-U${unitIndex}`,
        orderId: orderDetail.order_code,
        productId: String(item.product_id ?? item.id ?? ''),
        productName: item.product_name || `Produk ${itemIndex + 1}`,
        unitIndex,
        itemIndex,
        qrToken: '',
        qrImageUrl: '',
        generatedAt: '',
        generatedBy: '',
        qrStatus: 'pending',
        isReturned: false,
        verificationCount: 0,
      });
    }
  });
  return slots;
}

function mergeQrUnits(baseSlots, backendUnits) {
  const backendMap = new Map(
    (backendUnits || []).map((unit) => [unit.order_item_id, unit]),
  );

  return baseSlots.map((slot) => {
    const match = backendMap.get(slot.unitId);
    if (!match) return slot;
    return {
      ...slot,
      qrToken: match.qr_token || '',
      qrImageUrl: match.qr_image_url || '',
      generatedAt: match.generated_at || '',
      generatedBy: match.generated_by || '',
      qrStatus: match.qr_status || 'pending',
      isReturned: Boolean(match.is_returned),
      verificationCount: match.verification_count ?? 0,
      backendId: match.id || '',
    };
  });
}

function getAdminUser() {
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

export default function DetailPesananPage() {
  const params = useParams();
  const orderCode = decodeURIComponent(params?.orderCode || '');
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptMessage, setReceiptMessage] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [qrMessage, setQrMessage] = useState('');
  const [qrUnits, setQrUnits] = useState([]);
  const [showCompleteStep, setShowCompleteStep] = useState(false);
  const [completionProofFile, setCompletionProofFile] = useState(null);
  const completionProofInputRef = useRef(null);

  async function postAction(path, payload) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return { res, data };
  }

  async function loadQrUnits(orderDetail) {
    const baseSlots = buildOrderQrSlots(orderDetail);
    setQrUnits(baseSlots);

    if (!orderDetail?.order_code || !isQrReadyStatus(orderDetail.status)) {
      return;
    }

    setQrLoading(true);
    try {
      const res = await fetch(`${API}/qr/order/${encodeURIComponent(orderDetail.order_code)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengambil data QR.');
      }
      setQrUnits(mergeQrUnits(baseSlots, data.units || []));
    } catch (err) {
      console.error(err);
      setQrUnits(baseSlots);
    } finally {
      setQrLoading(false);
    }
  }

  async function loadDetail(options = {}) {
    const { preserveDetail = false, preserveMessages = false } = options;

    if (!preserveDetail) {
      setDetail(null);
      setQrUnits([]);
    }

    setError('');
    if (!preserveMessages) {
      setActionMessage('');
      setReceiptMessage('');
      setQrMessage('');
    }

    try {
      const res = await fetch(`${API}/detail?order_code=${encodeURIComponent(orderCode)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengambil detail pesanan.');
      }
      setDetail(data);
      await loadQrUnits(data);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Gagal mengambil detail pesanan.');
    }
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
          await loadQrUnits(confirmData.order || null);
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

    const adminUser = getAdminUser();
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
      await loadQrUnits(data.order || null);
      setActionMessage(data.message || `Pesanan berhasil di-${actionSlug}.`);
    } catch (err) {
      console.error(err);
      setError(err.message || `Gagal ${actionSlug} pesanan.`);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleGenerateReceipt() {
    if (!detail?.ereceipt_eligible || detail?.ereceipt_available || receiptLoading) return;

    const adminUser = getAdminUser();
    if (!adminUser?.id || adminUser.role !== 'admin') {
      setError('User admin tidak ditemukan. Silakan login ulang sebagai admin.');
      return;
    }

    setReceiptLoading(true);
    setReceiptMessage('');
    setError('');

    try {
      const result = await postAction(`${API}/ereceipt/generate`, {
        order_code: detail.order_code,
        admin_user_id: adminUser.id,
      });
      if (!result.res.ok) {
        throw new Error(result.data.error || 'Gagal membuat e-receipt.');
      }
      setReceiptMessage(result.data.message || 'E-receipt berhasil dibuat.');
      await loadDetail({ preserveDetail: true, preserveMessages: true });
    } catch (err) {
      console.error(err);
      setError(err.message || 'Gagal membuat e-receipt.');
    } finally {
      setReceiptLoading(false);
    }
  }

  function handleOpenReceipt(mode) {
    if (!detail?.ereceipt_eligible) return;

    const adminUser = getAdminUser();
    if (!adminUser?.id || adminUser.role !== 'admin') {
      setError('User admin tidak ditemukan. Silakan login ulang sebagai admin.');
      return;
    }

    const action = mode === 'download' ? 'download' : 'view';
    const url = `${API}/ereceipt/${action}?order_code=${encodeURIComponent(
      detail.order_code,
    )}&admin_user_id=${encodeURIComponent(adminUser.id)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function handleGenerateUnitQr(slot) {
    if (!detail?.order_code || !slot || slot.generatedAt || qrLoading) return;

    const adminUser = getAdminUser();
    if (!adminUser?.id || adminUser.role !== 'admin') {
      setError('User admin tidak ditemukan. Silakan login ulang sebagai admin.');
      return;
    }

    setQrLoading(true);
    setQrMessage('');
    setError('');

    try {
      const result = await postAction(`${API}/qr/generate`, {
        order_id: detail.order_code,
        order_item_id: slot.unitId,
        product_id: slot.productId,
        product_name: slot.productName,
        unit_index: slot.unitIndex,
        generated_by: adminUser.id,
      });
      if (!result.res.ok) {
        throw new Error(result.data.error || 'Gagal membuat QR.');
      }

      setQrUnits((current) => current.map((item) => {
        if (item.unitId !== slot.unitId) return item;
        return {
          ...item,
          backendId: result.data.id || '',
          qrToken: result.data.qr_token || '',
          qrImageUrl: result.data.qr_image_url || '',
          generatedAt: result.data.generated_at || '',
          generatedBy: result.data.generated_by || '',
          qrStatus: result.data.qr_status || 'active',
          isReturned: Boolean(result.data.is_returned),
          verificationCount: result.data.verification_count ?? 0,
        };
      }));
      setQrMessage(
        result.data.already_exists
          ? `QR untuk ${slot.productName} unit #${slot.unitIndex} sudah tersedia.`
          : `QR untuk ${slot.productName} unit #${slot.unitIndex} berhasil dibuat.`,
      );
    } catch (err) {
      console.error(err);
      setError(err.message || 'Gagal membuat QR.');
    } finally {
      setQrLoading(false);
    }
  }

  async function handleGenerateAllQrs() {
    const pendingUnits = qrUnits.filter((unit) => !unit.generatedAt);
    if (pendingUnits.length === 0) return;

    for (const unit of pendingUnits) {
      // eslint-disable-next-line no-await-in-loop
      await handleGenerateUnitQr(unit);
    }
  }

  function handleDownloadQr(unit) {
    if (!unit?.qrImageUrl) return;

    const link = document.createElement('a');
    link.href = unit.qrImageUrl;
    link.download = `qr-${unit.productName.replace(/\s+/g, '-')}-u${unit.unitIndex}-${detail.order_code}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function resetCompleteStep() {
    setShowCompleteStep(false);
    setCompletionProofFile(null);
    if (completionProofInputRef.current) {
      completionProofInputRef.current.value = '';
    }
  }

  async function handleShipOrder() {
    if (!detail?.order_code || actionLoading || detail.status !== 'pengemasan') return;

    const adminUser = getAdminUser();
    if (!adminUser?.id || adminUser.role !== 'admin') {
      setError('User admin tidak ditemukan. Silakan login ulang sebagai admin.');
      return;
    }

    const trackingNumber = window.prompt('Masukkan nomor resi pengiriman:', detail.tracking_number || '');
    if (trackingNumber === null) {
      setActionMessage('Pengiriman dibatalkan.');
      return;
    }

    const trackingNumberClean = trackingNumber.trim();
    if (!trackingNumberClean) {
      setError('Nomor resi wajib diisi.');
      return;
    }

    const shippingNotes = window.prompt('Catatan pengiriman (opsional):', detail.shipping_notes || '');

    setActionLoading(true);
    setActionMessage('');
    setError('');

    try {
      const result = await postAction(`${API}/ship`, {
        order_code: orderCode,
        admin_user_id: adminUser.id,
        tracking_number: trackingNumberClean,
        shipping_notes: shippingNotes === null ? '' : shippingNotes.trim(),
      });
      const data = result.data;

      if (!result.res.ok) {
        throw new Error(data.error || 'Gagal mengirim pesanan.');
      }

      setDetail(data.order || null);
      await loadQrUnits(data.order || null);
      setActionMessage(data.message || 'Pesanan berhasil dikirim.');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Gagal mengirim pesanan.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCompleteOrder() {
    if (!detail?.order_code || actionLoading || detail.status !== 'pengiriman') return;
    if (!completionProofFile) {
      setError('Upload bukti selesai / terkirim wajib diisi.');
      return;
    }

    const adminUser = getAdminUser();
    if (!adminUser?.id || adminUser.role !== 'admin') {
      setError('User admin tidak ditemukan. Silakan login ulang sebagai admin.');
      return;
    }

    setActionLoading(true);
    setActionMessage('');
    setError('');

    try {
      const formData = new FormData();
      formData.append('order_code', orderCode);
      formData.append('admin_user_id', adminUser.id);
      formData.append('delivery_proof', completionProofFile);

      const res = await fetch(`${API}/complete`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Gagal menyelesaikan pesanan.');
      }

      setDetail(data.order || null);
      await loadQrUnits(data.order || null);
      resetCompleteStep();
      setActionMessage(data.message || 'Pesanan berhasil diselesaikan.');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Gagal menyelesaikan pesanan.');
    } finally {
      setActionLoading(false);
    }
  }

  function handleStartCompleteOrder() {
    if (!detail?.order_code || actionLoading || detail.status !== 'pengiriman') return;
    setError('');
    setActionMessage('');
    setShowCompleteStep(true);
    completionProofInputRef.current?.click();
  }

  useEffect(() => {
    if (!orderCode) return;
    loadDetail();
  }, [orderCode]);

  const canProcess = detail?.status === 'waiting_admin_approval';
  const qrReady = isQrReadyStatus(detail?.status);
  const pendingQrCount = qrUnits.filter((unit) => !unit.generatedAt).length;
  const showShipAction = detail?.status === 'pengemasan';
  const canShip = showShipAction && pendingQrCount === 0;
  const showCompleteAction = detail?.status === 'pengiriman';

  return (
    <div style={{ padding: 16 }}>
      <h2>Detail Pesanan</h2>

      {!detail && !error && <p>Memuat detail pesanan...</p>}
      {error && <p style={{ color: 'red', marginTop: 12 }}>{error}</p>}
      {actionMessage && <p style={{ color: 'green', marginTop: 12 }}>{actionMessage}</p>}
      {receiptMessage && <p style={{ color: 'green', marginTop: 12 }}>{receiptMessage}</p>}
      {qrMessage && <p style={{ color: 'green', marginTop: 12 }}>{qrMessage}</p>}

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
          </DataTable>

          <h3 style={{ marginTop: 24 }}>Product</h3>
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
                <td>Dikirim Oleh</td>
                <td>{detail.shipped_by_name || '-'}</td>
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
                <td>Selesai Oleh</td>
                <td>{detail.completed_by_name || '-'}</td>
              </tr>
              <tr>
                <td>Bukti Terkirim</td>
                <td>
                  {detail.delivery_proof ? (
                    <a href={fileUrl(detail.delivery_proof)} target="_blank" rel="noreferrer">
                      Lihat Bukti
                    </a>
                  ) : '-'}
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
                  ) : '-'}
                </td>
              </tr>
            </tbody>
          </DataTable>

          <h3 style={{ marginTop: 24 }}>E-Receipt</h3>
          <DataTable>
            <tbody>
              <tr>
                <td>Boleh Dibuat</td>
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
            {!detail.ereceipt_available && (
              <>
                <button
                  type="button"
                  onClick={handleGenerateReceipt}
                  disabled={!detail.ereceipt_eligible || receiptLoading}
                >
                  {receiptLoading ? 'Memproses...' : 'Generate E-Receipt'}
                </button>{' '}
              </>
            )}
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
              E-receipt baru tersedia setelah order di-approve admin.
            </p>
          )}

          <h3 style={{ marginTop: 24 }}>QR Code Produk</h3>
          {!qrReady && (
            <p>QR produk baru tampil setelah order masuk tahap pengemasan.</p>
          )}
          {qrReady && (
            <>
              <p style={{ marginBottom: 8 }}>
                Total slot QR: {qrUnits.length} | Belum digenerate: {pendingQrCount}
              </p>
              <p style={{ marginBottom: 12 }}>
                {detail.status === 'pengemasan' && pendingQrCount > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={handleGenerateAllQrs}
                      disabled={qrLoading}
                    >
                      {qrLoading ? 'Memproses...' : 'Generate Semua QR'}
                    </button>{' '}
                  </>
                )}
              </p>
              <DataTable>
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th>Produk</th>
                    <th>Status</th>
                    <th>Token</th>
                    <th>Generated</th>
                    <th>Preview</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {qrUnits.map((unit) => (
                    <tr key={unit.unitId}>
                      <td>{unit.unitId}</td>
                      <td>
                        {unit.productName}
                        <br />
                        Unit #{unit.unitIndex}
                      </td>
                      <td>
                        {unit.qrStatus || 'pending'}
                        <br />
                        Returned: {unit.isReturned ? 'Ya' : 'Tidak'}
                        <br />
                        Verify Count: {unit.verificationCount ?? 0}
                      </td>
                      <td style={{ maxWidth: 220, wordBreak: 'break-word' }}>
                        {unit.qrToken || '-'}
                      </td>
                      <td>
                        {formatTanggal(unit.generatedAt)}
                        <br />
                        {unit.generatedBy || '-'}
                      </td>
                      <td>
                        {unit.qrImageUrl ? (
                          <img
                            src={unit.qrImageUrl}
                            alt={`QR ${unit.productName} unit ${unit.unitIndex}`}
                            style={{ width: 88, height: 88, objectFit: 'contain' }}
                          />
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        {!unit.generatedAt && detail.status === 'pengemasan' ? (
                          <button
                            type="button"
                            onClick={() => handleGenerateUnitQr(unit)}
                            disabled={qrLoading}
                          >
                            Generate
                          </button>
                        ) : (
                          <span>-</span>
                        )}
                        {unit.qrImageUrl && (
                          <>
                            <br />
                            <a href={unit.qrImageUrl} target="_blank" rel="noreferrer">
                              Buka
                            </a>
                            <br />
                            <button
                              type="button"
                              onClick={() => handleDownloadQr(unit)}
                              style={{ marginTop: 6 }}
                            >
                              Download
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                  {qrUnits.length === 0 && (
                    <tr>
                      <td colSpan={7}>{qrLoading ? 'Memuat data QR...' : '(belum ada slot QR)'}</td>
                    </tr>
                  )}
                </tbody>
              </DataTable>
            </>
          )}

          <h3 style={{ marginTop: 24 }}>Monitoring</h3>
          <p style={{ marginTop: 8 }}><b>Device</b></p>
          <DataTable>
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
          </DataTable>

          <p style={{ marginTop: 12 }}><b>Password</b></p>
          <DataTable>
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
          </DataTable>

          <p style={{ marginTop: 12 }}><b>OTP</b></p>
          <DataTable>
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
          </DataTable>

          <p style={{ marginTop: 12 }}><b>Fraud - Alamat</b></p>
          <DataTable>
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
          </DataTable>

          <p style={{ marginTop: 12 }}><b>Fraud - Nominal</b></p>
          <DataTable>
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
          </DataTable>

          <p style={{ marginTop: 12 }}><b>Fraud - Qty</b></p>
          <DataTable>
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
          </DataTable>

          <p style={{ marginTop: 12 }}><b>Fraud - Akun Baru</b></p>
          <DataTable>
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
          </DataTable>

          <p style={{ marginTop: 12 }}><b>Fraud - Order Cepat</b></p>
          <DataTable>
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
          </DataTable>

          <p style={{ marginTop: 12 }}><b>Ringkasan</b></p>
          <DataTable>
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
          </DataTable>

          <p style={{ marginTop: 12 }}><b>Keputusan Admin</b></p>
          <DataTable>
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
          </DataTable>

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
            <p style={{ marginTop: 16 }}>
              {canProcess && (
                <>
                  <button
                    type="button"
                    onClick={() => handleAdminAction('Approve')}
                    disabled={actionLoading}
                  >
                    {actionLoading ? 'Memproses...' : 'Approve'}
                  </button>{' '}
                  <button
                    type="button"
                    onClick={() => handleAdminAction('Reject')}
                    disabled={actionLoading}
                  >
                    Reject
                  </button>
                </>
              )}
              {showShipAction && (
                <>
                  <button
                    type="button"
                    onClick={handleShipOrder}
                    disabled={actionLoading || !canShip}
                  >
                    {actionLoading ? 'Memproses...' : 'Kirim'}
                  </button>
                </>
              )}
              {showCompleteAction && (
                <>
                  {' '}
                  <input
                    ref={completionProofInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(event) => setCompletionProofFile(event.target.files?.[0] || null)}
                    disabled={actionLoading}
                    style={{ display: 'none' }}
                  />
                  {!showCompleteStep && (
                    <button
                      type="button"
                      onClick={handleStartCompleteOrder}
                      disabled={actionLoading}
                    >
                      Selesai
                    </button>
                  )}
                  {showCompleteStep && (
                    <>
                      <button
                        type="button"
                        onClick={() => completionProofInputRef.current?.click()}
                        disabled={actionLoading}
                      >
                        {completionProofFile ? 'Ganti Bukti' : 'Pilih Bukti'}
                      </button>{' '}
                      <button
                        type="button"
                        onClick={handleCompleteOrder}
                        disabled={actionLoading || !completionProofFile}
                      >
                        {actionLoading ? 'Memproses...' : 'Konfirmasi Selesai'}
                      </button>{' '}
                      <button
                        type="button"
                        onClick={resetCompleteStep}
                        disabled={actionLoading}
                      >
                        Batal
                      </button>
                    </>
                  )}
                </>
              )}
            </p>
            {showShipAction && !canShip && (
              <p style={{ marginTop: 8 }}>
                Semua QR unit harus sudah digenerate sebelum pesanan dikirim.
              </p>
            )}
            {showCompleteAction && showCompleteStep && (
              <p style={{ marginTop: 8 }}>
                {completionProofFile
                  ? `File terpilih: ${completionProofFile.name}`
                  : 'Pilih bukti terkirim terlebih dahulu sebelum konfirmasi selesai.'}
              </p>
            )}
          </div>
        </>
      )}

      <Link href="/admin/pesanan">Kembali ke daftar pesanan</Link>
    </div>
  );
}
