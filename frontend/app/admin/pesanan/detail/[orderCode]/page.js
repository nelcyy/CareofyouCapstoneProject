'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiUrl, mediaUrl } from '@/api';
import './page.css';

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

function initials(name) {
  return (
    (name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?'
  );
}

// Label + warna pill — MURNI presentasi; nilai status/risk tetap dari backend.
const STATUS_META = {
  waiting_admin_approval: { label: 'Menunggu Persetujuan', color: '#e09a3a', bg: 'rgba(224,154,58,0.12)' },
  pengemasan: { label: 'Pengemasan', color: '#4a9fd4', bg: 'rgba(74,159,212,0.12)' },
  pengiriman: { label: 'Pengiriman', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  selesai: { label: 'Selesai', color: '#16a34a', bg: 'rgba(34,197,94,0.12)' },
  rejected: { label: 'Ditolak', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};

const RISK_META = {
  low: { label: 'Rendah', color: '#16a34a', bg: 'rgba(34,197,94,0.1)' },
  medium: { label: 'Sedang', color: '#e09a3a', bg: 'rgba(224,154,58,0.12)' },
  high: { label: 'Tinggi', color: '#ef6c2f', bg: 'rgba(239,108,47,0.12)' },
  critical: { label: 'Kritis', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};

function statusMeta(status) {
  return STATUS_META[status] || { label: status || '-', color: '#c4706a', bg: 'rgba(214,134,124,0.12)' };
}
function riskMeta(level) {
  return RISK_META[level] || { label: level || '-', color: '#9ca3af', bg: 'rgba(156,163,175,0.14)' };
}

/* ── presentational helpers ── */
function Card({ title, action, children, className = '' }) {
  return (
    <section className={`adm-card adm-od-card ${className}`}>
      {(title || action) && (
        <div className="adm-od-card-head">
          {title && <h3 className="adm-card-title">{title}</h3>}
          {action && <div className="adm-od-card-action">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

function Row({ label, children }) {
  return (
    <div className="adm-od-row">
      <span className="adm-od-row-label">{label}</span>
      <span className="adm-od-row-val">{children}</span>
    </div>
  );
}

function getAdminUser() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(window.localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
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

  const st = detail ? statusMeta(detail.status) : null;
  const risk = detail ? riskMeta(detail.risk_level) : null;
  const hasAction = canProcess || showShipAction || showCompleteAction;

  return (
    <div className="adm-od-page">
      <div className="adm-od-inner">
        <Link href="/admin/pesanan" className="adm-od-back">← Kembali ke daftar pesanan</Link>

        {!detail && !error && <p className="adm-od-loading">Memuat detail pesanan...</p>}
        {error && <div className="adm-od-msg adm-od-msg--error">{error}</div>}
        {actionMessage && <div className="adm-od-msg adm-od-msg--ok">{actionMessage}</div>}
        {receiptMessage && <div className="adm-od-msg adm-od-msg--ok">{receiptMessage}</div>}
        {qrMessage && <div className="adm-od-msg adm-od-msg--ok">{qrMessage}</div>}

        {detail && (
          <>
            {/* HEADER */}
            <div className="adm-card adm-od-head">
              <div className="adm-od-head-left">
                <div className="adm-od-head-titlerow">
                  <h2 className="adm-od-title">Detail Pesanan</h2>
                  <span className="adm-order-id">{detail.order_code || '-'}</span>
                </div>
                <p className="adm-od-head-sub">Tanggal order · {formatTanggal(detail.created_at)}</p>
              </div>
              <div className="adm-od-head-right">
                <div className="adm-od-customer">
                  <span className="adm-avatar">{initials(detail.customer_name)}</span>
                  <div className="adm-od-customer-meta">
                    <span className="adm-customer-name">{detail.customer_name || '-'}</span>
                    {detail.customer_email && <span className="adm-customer-email">{detail.customer_email}</span>}
                  </div>
                </div>
                <div className="adm-od-pills">
                  <span className="adm-status-pill" style={{ color: st.color, background: st.bg }}>{st.label}</span>
                  <span className="adm-risk-pill" style={{ color: risk.color, background: risk.bg }}>Risiko {risk.label}</span>
                </div>
              </div>
            </div>

            <div className="adm-od-layout">
              {/* ── MAIN ── */}
              <div className="adm-od-main">
                {/* Produk */}
                <Card title="Produk Dipesan">
                  <div className="adm-od-table-scroll">
                    <table className="adm-od-items">
                      <thead>
                        <tr><th>Nama</th><th>Harga</th><th>Qty</th><th>Subtotal</th></tr>
                      </thead>
                      <tbody>
                        {detail.items.map((item, index) => (
                          <tr key={item.id || index}>
                            <td className="adm-od-item-name">{item.product_name}</td>
                            <td>Rp {formatRibuan(item.product_price)}</td>
                            <td>{item.quantity}</td>
                            <td><strong>Rp {formatRibuan(item.subtotal)}</strong></td>
                          </tr>
                        ))}
                        {detail.items.length === 0 && (
                          <tr><td colSpan={4} className="adm-od-empty">(tidak ada item)</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>

                {/* Alamat */}
                <Card title="Alamat Pengiriman">
                  <div className="adm-od-rows">
                    <Row label="Label">{detail.address_label || '-'}</Row>
                    <Row label="Penerima">{detail.recipient_name || '-'}</Row>
                    <Row label="Telepon">{detail.recipient_phone || '-'}</Row>
                    <Row label="Alamat">{detail.address_line || '-'}</Row>
                    <Row label="Kota">{detail.city || '-'}</Row>
                    <Row label="Provinsi">{detail.province || '-'}</Row>
                    <Row label="Kode Pos">{detail.postal_code || '-'}</Row>
                    <Row label="Catatan">{detail.address_notes || '-'}</Row>
                  </div>
                </Card>

                {/* Pengiriman */}
                <Card title="Pengiriman">
                  <div className="adm-od-rows">
                    <Row label="Kurir">{detail.courier_name || '-'}</Row>
                    <Row label="Ongkir">Rp {formatRibuan(detail.shipping_fee)}</Row>
                    <Row label="Nomor Resi">{detail.tracking_number || '-'}</Row>
                    <Row label="Dikirim Pada">{formatTanggal(detail.shipped_at)}</Row>
                    <Row label="Dikirim Oleh">{detail.shipped_by_name || '-'}</Row>
                    <Row label="Catatan Pengiriman">{detail.shipping_notes || '-'}</Row>
                    <Row label="Selesai Pada">{formatTanggal(detail.completed_at)}</Row>
                    <Row label="Selesai Oleh">{detail.completed_by_name || '-'}</Row>
                    <Row label="Bukti Terkirim">
                      {detail.delivery_proof
                        ? <a className="adm-od-link" href={fileUrl(detail.delivery_proof)} target="_blank" rel="noreferrer">Lihat Bukti</a>
                        : '-'}
                    </Row>
                  </div>
                </Card>

                {/* Pembayaran */}
                <Card title="Pembayaran">
                  <div className="adm-od-rows">
                    <Row label="Metode">{detail.payment_method || '-'}</Row>
                    <Row label="Tujuan Transfer">{detail.payment_target || '-'}</Row>
                    <Row label="Bukti Transfer">
                      {detail.payment_proof
                        ? <a className="adm-od-link" href={fileUrl(detail.payment_proof)} target="_blank" rel="noreferrer">Lihat Bukti</a>
                        : '-'}
                    </Row>
                  </div>
                </Card>

                {/* E-Receipt */}
                <Card title="E-Receipt">
                  <div className="adm-od-rows">
                    <Row label="Boleh Dibuat">{detail.ereceipt_eligible ? 'Ya' : 'Tidak'}</Row>
                    <Row label="Sudah Tersedia">{detail.ereceipt_available ? 'Ya' : 'Tidak'}</Row>
                    <Row label="Receipt ID">{detail.ereceipt_id || '-'}</Row>
                    <Row label="Generated At">{formatTanggal(detail.ereceipt_generated_at)}</Row>
                  </div>
                  <div className="adm-od-btn-row">
                    {!detail.ereceipt_available && (
                      <button
                        type="button"
                        className="adm-btn adm-btn--primary"
                        onClick={handleGenerateReceipt}
                        disabled={!detail.ereceipt_eligible || receiptLoading}
                      >
                        {receiptLoading ? 'Memproses...' : 'Generate E-Receipt'}
                      </button>
                    )}
                    <button type="button" className="adm-btn adm-btn--ghost" onClick={() => handleOpenReceipt('view')} disabled={!detail.ereceipt_eligible}>
                      Lihat PDF
                    </button>
                    <button type="button" className="adm-btn adm-btn--ghost" onClick={() => handleOpenReceipt('download')} disabled={!detail.ereceipt_eligible}>
                      Download PDF
                    </button>
                  </div>
                  {!detail.ereceipt_eligible && (
                    <p className="adm-od-note">E-receipt baru tersedia setelah order di-approve admin.</p>
                  )}
                </Card>

                {/* QR */}
                <Card
                  title="QR Code Produk"
                  action={qrReady && detail.status === 'pengemasan' && pendingQrCount > 0 ? (
                    <button type="button" className="adm-btn adm-btn--primary adm-btn--sm" onClick={handleGenerateAllQrs} disabled={qrLoading}>
                      {qrLoading ? 'Memproses...' : 'Generate Semua QR'}
                    </button>
                  ) : null}
                >
                  {!qrReady ? (
                    <p className="adm-od-note">QR produk baru tampil setelah order masuk tahap pengemasan.</p>
                  ) : (
                    <>
                      <p className="adm-od-qr-meta">
                        Total slot QR: <strong>{qrUnits.length}</strong> · Belum digenerate: <strong>{pendingQrCount}</strong>
                      </p>
                      <div className="adm-od-table-scroll">
                        <table className="adm-od-items adm-od-qr-table">
                          <thead>
                            <tr>
                              <th>Unit</th><th>Produk</th><th>Status</th><th>Token</th><th>Generated</th><th>Preview</th><th>Aksi</th>
                            </tr>
                          </thead>
                          <tbody>
                            {qrUnits.map((unit) => (
                              <tr key={unit.unitId}>
                                <td className="adm-od-mono">{unit.unitId}</td>
                                <td>{unit.productName}<span className="adm-od-sub">Unit #{unit.unitIndex}</span></td>
                                <td>
                                  <span className="adm-od-sub-strong">{unit.qrStatus || 'pending'}</span>
                                  <span className="adm-od-sub">Returned: {unit.isReturned ? 'Ya' : 'Tidak'}</span>
                                  <span className="adm-od-sub">Verify: {unit.verificationCount ?? 0}</span>
                                </td>
                                <td className="adm-od-token">{unit.qrToken || '-'}</td>
                                <td>{formatTanggal(unit.generatedAt)}<span className="adm-od-sub">{unit.generatedBy || '-'}</span></td>
                                <td>
                                  {unit.qrImageUrl
                                    ? <img src={unit.qrImageUrl} alt={`QR ${unit.productName} unit ${unit.unitIndex}`} className="adm-od-qr-img" />
                                    : '-'}
                                </td>
                                <td>
                                  <div className="adm-od-qr-actions">
                                    {!unit.generatedAt && detail.status === 'pengemasan' && (
                                      <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => handleGenerateUnitQr(unit)} disabled={qrLoading}>
                                        Generate
                                      </button>
                                    )}
                                    {unit.qrImageUrl && (
                                      <>
                                        <a className="adm-od-link" href={unit.qrImageUrl} target="_blank" rel="noreferrer">Buka</a>
                                        <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => handleDownloadQr(unit)}>Download</button>
                                      </>
                                    )}
                                    {unit.generatedAt && !unit.qrImageUrl && <span>-</span>}
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {qrUnits.length === 0 && (
                              <tr><td colSpan={7} className="adm-od-empty">{qrLoading ? 'Memuat data QR...' : '(belum ada slot QR)'}</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </Card>

                {/* Monitoring */}
                <Card title="Monitoring Risiko">
                  <div className="adm-od-mon">
                    <div className="adm-od-mon-block">
                      <p className="adm-od-subhead">Device</p>
                      <Row label="Device Label">{detail.monitoring?.device?.device_label_snapshot || '-'}</Row>
                      <Row label="Status Saat Order">{detail.monitoring?.device?.trusted_device_status_label || '-'}</Row>
                      <Row label="Score Device">{detail.monitoring?.device?.device_risk_score ?? 0}</Row>
                    </div>
                    <div className="adm-od-mon-block">
                      <p className="adm-od-subhead">Password</p>
                      <Row label="Jumlah Salah Password">{detail.monitoring?.password?.failed_password_count ?? 0}</Row>
                      <Row label="Score Password">{detail.monitoring?.password?.failed_password_score ?? 0}</Row>
                    </div>
                    <div className="adm-od-mon-block">
                      <p className="adm-od-subhead">OTP</p>
                      <Row label="Jumlah Gagal OTP">{detail.monitoring?.otp?.failed_otp_count ?? 0}</Row>
                      <Row label="Score OTP">{detail.monitoring?.otp?.failed_otp_score ?? 0}</Row>
                    </div>
                    <div className="adm-od-mon-block">
                      <p className="adm-od-subhead">Fraud — Alamat</p>
                      <Row label="Umur Alamat Saat Order">{detail.monitoring?.fraud?.address?.address_age_minutes ?? 0} menit</Row>
                      <Row label="Score Alamat Baru">{detail.monitoring?.fraud?.address?.new_address_score ?? 0}</Row>
                    </div>
                    <div className="adm-od-mon-block">
                      <p className="adm-od-subhead">Fraud — Nominal</p>
                      <Row label="Rasio Nominal vs Kebiasaan">
                        {detail.monitoring?.fraud?.amount?.order_amount_ratio_percent
                          ? `${detail.monitoring?.fraud?.amount?.order_amount_ratio_percent}%`
                          : '-'}
                      </Row>
                      <Row label="Score Nominal">{detail.monitoring?.fraud?.amount?.amount_anomaly_score ?? 0}</Row>
                    </div>
                    <div className="adm-od-mon-block">
                      <p className="adm-od-subhead">Fraud — Qty</p>
                      <Row label="Total Qty Item">{detail.monitoring?.fraud?.qty?.total_item_quantity ?? 0}</Row>
                      <Row label="Qty Terbanyak per Produk">{detail.monitoring?.fraud?.qty?.max_single_product_quantity ?? 0}</Row>
                      <Row label="Score Borong">{detail.monitoring?.fraud?.qty?.bulk_order_score ?? 0}</Row>
                    </div>
                    <div className="adm-od-mon-block">
                      <p className="adm-od-subhead">Fraud — Akun Baru</p>
                      <Row label="Umur Akun Saat Order">{detail.monitoring?.fraud?.new_account?.account_age_days ?? 0} hari</Row>
                      <Row label="Score Akun Baru + Order Besar">{detail.monitoring?.fraud?.new_account?.new_account_big_order_score ?? 0}</Row>
                    </div>
                    <div className="adm-od-mon-block">
                      <p className="adm-od-subhead">Fraud — Order Cepat</p>
                      <Row label="Order Sebelumnya 30 Menit">{detail.monitoring?.fraud?.rapid_order?.recent_orders_30m_count ?? 0}</Row>
                      <Row label="Score Order Cepat">{detail.monitoring?.fraud?.rapid_order?.rapid_order_score ?? 0}</Row>
                    </div>
                  </div>

                  <div className="adm-od-score-grid">
                    <div className="adm-od-score">
                      <span className="adm-od-score-val">{detail.monitoring?.summary?.hijack_risk_score ?? 0}</span>
                      <span className="adm-od-score-label">Hijack Risk</span>
                    </div>
                    <div className="adm-od-score">
                      <span className="adm-od-score-val">{detail.monitoring?.summary?.fraud_risk_score ?? 0}</span>
                      <span className="adm-od-score-label">Fraud Risk</span>
                    </div>
                    <div className="adm-od-score adm-od-score--total">
                      <span className="adm-od-score-val">{detail.monitoring?.summary?.total_risk_score ?? 0}</span>
                      <span className="adm-od-score-label">Total Risk</span>
                    </div>
                  </div>
                </Card>

                {/* Keputusan Admin */}
                <Card title="Keputusan Admin">
                  <div className="adm-od-rows">
                    <Row label="Decision">{detail.decision || '-'}</Row>
                    <Row label="Diproses Oleh">{detail.processed_by_name || '-'}</Row>
                    <Row label="Diproses Pada">{formatTanggal(detail.processed_at)}</Row>
                    <Row label="OTP Verified For Action">{detail.otp_verified_for_action ? 'Ya' : 'Tidak'}</Row>
                    <Row label="Decision Risk Score">{detail.decision_risk_score ?? '-'}</Row>
                    <Row label="Decision Risk Level">{detail.decision_risk_level || '-'}</Row>
                    <Row label="Decision Reason">{detail.decision_reason || '-'}</Row>
                  </div>
                </Card>
              </div>

              {/* ── SIDE: ringkasan + aksi ── */}
              <div className="adm-od-side">
                <div className="adm-card adm-od-summary">
                  <h3 className="adm-card-title">Ringkasan</h3>
                  <div className="adm-od-sum-row"><span>Subtotal</span><span>Rp {formatRibuan(detail.subtotal)}</span></div>
                  <div className="adm-od-sum-row"><span>Ongkir</span><span>Rp {formatRibuan(detail.shipping_fee)}</span></div>
                  <div className="adm-od-sum-divider" />
                  <div className="adm-od-sum-total"><span>Grand Total</span><span>Rp {formatRibuan(detail.grand_total)}</span></div>

                  <div className="adm-od-sum-meta">
                    <Row label="Approve butuh OTP">{detail.approve_requires_otp ? 'Ya' : 'Tidak'}</Row>
                    <Row label="Reject butuh OTP">{detail.reject_requires_otp ? 'Ya' : 'Tidak'}</Row>
                  </div>

                  {hasAction ? (
                    <div className="adm-od-actions">
                      {canProcess && (
                        <>
                          <button type="button" className="adm-btn adm-btn--primary adm-btn--block" onClick={() => handleAdminAction('Approve')} disabled={actionLoading}>
                            {actionLoading ? 'Memproses...' : 'Approve Pesanan'}
                          </button>
                          <button type="button" className="adm-btn adm-btn--danger adm-btn--block" onClick={() => handleAdminAction('Reject')} disabled={actionLoading}>
                            Reject Pesanan
                          </button>
                        </>
                      )}

                      {showShipAction && (
                        <>
                          <button type="button" className="adm-btn adm-btn--primary adm-btn--block" onClick={handleShipOrder} disabled={actionLoading || !canShip}>
                            {actionLoading ? 'Memproses...' : 'Kirim Pesanan'}
                          </button>
                          {!canShip && (
                            <p className="adm-od-note">Semua QR unit harus sudah digenerate sebelum pesanan dikirim.</p>
                          )}
                        </>
                      )}

                      {showCompleteAction && (
                        <>
                          <input
                            ref={completionProofInputRef}
                            type="file"
                            accept="image/*,.pdf"
                            onChange={(event) => setCompletionProofFile(event.target.files?.[0] || null)}
                            disabled={actionLoading}
                            style={{ display: 'none' }}
                          />
                          {!showCompleteStep && (
                            <button type="button" className="adm-btn adm-btn--primary adm-btn--block" onClick={handleStartCompleteOrder} disabled={actionLoading}>
                              Selesaikan Pesanan
                            </button>
                          )}
                          {showCompleteStep && (
                            <>
                              <button type="button" className="adm-btn adm-btn--ghost adm-btn--block" onClick={() => completionProofInputRef.current?.click()} disabled={actionLoading}>
                                {completionProofFile ? 'Ganti Bukti' : 'Pilih Bukti'}
                              </button>
                              <button type="button" className="adm-btn adm-btn--primary adm-btn--block" onClick={handleCompleteOrder} disabled={actionLoading || !completionProofFile}>
                                {actionLoading ? 'Memproses...' : 'Konfirmasi Selesai'}
                              </button>
                              <button type="button" className="adm-btn adm-btn--ghost adm-btn--block" onClick={resetCompleteStep} disabled={actionLoading}>
                                Batal
                              </button>
                              <p className="adm-od-note">
                                {completionProofFile
                                  ? `File terpilih: ${completionProofFile.name}`
                                  : 'Pilih bukti terkirim terlebih dahulu sebelum konfirmasi selesai.'}
                              </p>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="adm-od-note adm-od-note--center">Tidak ada aksi untuk status saat ini.</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
