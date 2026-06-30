'use client';

import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiUrl, mediaUrl } from '@/api';
import './page.css';

const API = apiUrl('/api/customer/profile/return');

const RETURN_STATUS_META = {
  waiting_admin_review: { color: '#e09a3a', bg: 'rgba(224,154,58,0.12)' },
  approved: { color: '#4a9fd4', bg: 'rgba(74,159,212,0.12)' },
  rejected: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  cancelled: { color: '#a59b99', bg: 'rgba(165,155,153,0.12)' },
  shipped_back: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  received: { color: '#0ea5e9', bg: 'rgba(14,165,233,0.12)' },
  completed: { color: '#16a34a', bg: 'rgba(34,197,94,0.12)' },
};

const TIMELINE_STEPS = [
  { key: 'waiting_admin_review', label: 'Diajukan', icon: 'clock' },
  { key: 'approved', label: 'Disetujui', icon: 'check' },
  { key: 'shipped_back', label: 'Dikirim Balik', icon: 'truck' },
  { key: 'received', label: 'Diterima', icon: 'inbox' },
  { key: 'completed', label: 'Selesai', icon: 'party' },
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

function proofPreview(path, label) {
  if (!path) return null;
  return { src: fileUrl(path), label };
}

function isPreviewableProof(path) {
  return /\.(jpe?g|png|webp)(?:[?#].*)?$/i.test(String(path || ''));
}

function waLink(number, text) {
  const digits = String(number || '').replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function getStoredUser() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(window.localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

/* ── Icons (line-style) ── */
function IconBack() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
function IconClock(props) {
  return (
    <svg width={props?.size || 16} height={props?.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function IconReceipt() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}
function IconShieldX() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="9.5" y1="9.5" x2="14.5" y2="14.5" />
      <line x1="14.5" y1="9.5" x2="9.5" y2="14.5" />
    </svg>
  );
}
function IconShieldCheck() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11.5 14.5 16 9.5" />
    </svg>
  );
}
function IconTruck() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}
function IconInbox() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}
function IconPartyPopper() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5.8 11.3 2 22l10.7-3.8" />
      <path d="M4 3h.01" /><path d="M22 8h.01" /><path d="M15 2h.01" /><path d="M22 20h.01" />
      <path d="m22 2-3.5 3.5" /><path d="m21 15-4.5-4.5" /><path d="m3 21.5 2.5-2.5" /><path d="m20 12-3 3" /><path d="m12 2-2.5 2.5" />
    </svg>
  );
}
function IconBan() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  );
}
function IconPackage() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}
function IconImage() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}
function IconWhatsapp() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M17.5 14.4c-.3-.1-1.6-.8-1.9-.9-.2-.1-.4-.1-.6.1-.2.2-.6.9-.8 1-.1.2-.3.2-.5.1-.8-.3-1.6-.8-2.3-1.4-.6-.6-1.1-1.3-1.5-2-.1-.2 0-.4.1-.5.2-.2.4-.4.5-.6.1-.2.1-.4 0-.6-.1-.2-.6-1.5-.8-2-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.7.7-1 1.7-.9 2.7.2 1.2.7 2.3 1.5 3.3 1.2 1.6 2.7 2.8 4.5 3.6.5.2 1 .4 1.5.5.6.2 1.2.2 1.8.1.7-.1 1.3-.6 1.7-1.2.1-.3.1-.6.1-.9-.1-.1-.2-.2-.3-.2zM12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z" />
    </svg>
  );
}

function TimelineIcon({ name }) {
  if (name === 'clock') return <IconClock size={17} />;
  if (name === 'check') return <IconCheck />;
  if (name === 'truck') return <IconTruck />;
  if (name === 'inbox') return <IconInbox />;
  return <IconPartyPopper />;
}

function MetaRow({ label, value }) {
  return (
    <div className="rd-meta-row">
      <span className="rd-meta-label">{label}</span>
      <span className="rd-meta-val">{value}</span>
    </div>
  );
}

function ProofAction({ path, label, onPreview }) {
  if (!path) return <span className="rd-meta-val--muted">-</span>;
  if (!isPreviewableProof(path)) {
    return <span className="rd-meta-val--muted">Berkas tidak bisa dipreview</span>;
  }
  return (
    <button type="button" className="rd-view-proof-btn" onClick={() => onPreview(proofPreview(path, label))}>
      <IconImage /> Lihat Bukti
    </button>
  );
}

function IconZoomIn() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}
function IconZoomOut() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

function ImagePreviewModal({ preview, onClose }) {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setZoom(1);
  }, [preview]);

  if (!preview) return null;

  return (
    <div className="rd-modal-overlay" role="presentation" onClick={onClose}>
      <div className="rd-modal" role="dialog" aria-modal="true" aria-label={preview.label} onClick={(e) => e.stopPropagation()}>
        <div className="rd-modal-header">
          <h3>{preview.label}</h3>
          <button type="button" className="rd-modal-close" onClick={onClose} aria-label="Tutup preview">×</button>
        </div>
        <div className={`rd-zoom-body${zoom > 1 ? ' rd-zoom-body--zoomed' : ''}`}>
          <img src={preview.src} alt={preview.label} style={{ transform: `scale(${zoom})` }} />
        </div>
        <div className="rd-zoom-controls">
          <button type="button" className="rd-zoom-btn" onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)))} disabled={zoom <= 1} aria-label="Perkecil">
            <IconZoomOut />
          </button>
          <span className="rd-zoom-level">{Math.round(zoom * 100)}%</span>
          <button type="button" className="rd-zoom-btn" onClick={() => setZoom((z) => Math.min(3, +(z + 0.5).toFixed(1)))} disabled={zoom >= 3} aria-label="Perbesar">
            <IconZoomIn />
          </button>
        </div>
      </div>
    </div>
  );
}

function EReceiptVerificationModal({ open, onClose, verification }) {
  if (!open) return null;
  const v = verification || {};
  const kind = v.status === 'valid' ? 'valid' : v.status === 'invalid' ? 'invalid' : 'pending';

  return (
    <div className="rd-modal-overlay" role="presentation" onClick={onClose}>
      <div className="rd-modal rd-verify-modal" role="dialog" aria-modal="true" aria-label="Hasil Verifikasi E-Receipt" onClick={(e) => e.stopPropagation()}>
        <div className="rd-modal-header">
          <h3><IconReceipt /> Hasil Verifikasi E-Receipt</h3>
          <button type="button" className="rd-modal-close" onClick={onClose} aria-label="Tutup">×</button>
        </div>
        <div className="rd-verify-body">
          <div className={`rd-verify-status rd-verify-status--${kind}`}>
            {kind === 'valid' && <><IconShieldCheck /> E-Receipt Asli &amp; Terverifikasi</>}
            {kind === 'invalid' && <><IconShieldX /> E-Receipt Tidak Valid</>}
            {kind === 'pending' && <><IconClock /> Menunggu Verifikasi Admin</>}
          </div>

          {kind === 'valid' && (
            <p className="rd-verify-note">E-receipt yang kamu upload sudah kami periksa dan sesuai dengan pesanan ini.</p>
          )}
          {kind === 'invalid' && (
            <p className="rd-verify-note">E-receipt yang kamu upload tidak dapat kami verifikasi keasliannya. Jika menurutmu ini keliru, silakan hubungi admin.</p>
          )}
          {kind === 'pending' && (
            <p className="rd-verify-note">File e-receipt sudah kami terima. Admin belum memeriksa keasliannya.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProfileReturnDetailPage() {
  const params = useParams();
  const returnCode = decodeURIComponent(params?.returnCode || '');
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shipCourier, setShipCourier] = useState('');
  const [shipTracking, setShipTracking] = useState('');
  const [shipLoading, setShipLoading] = useState(false);
  const [shipMessage, setShipMessage] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [showVerification, setShowVerification] = useState(false);

  const refundInfo = detail?.refund_info || {};
  const exchangeInfo = detail?.exchange_info || {};
  const destination = detail?.return_destination || {};
  const returnShipment = detail?.return_shipment || {};
  const completion = detail?.completion || {};

  async function loadDetail() {
    const user = getStoredUser();
    if (!user || user.role !== 'customer') {
      setError('Login dulu sebagai customer untuk melihat detail retur.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(
        `${API}/detail?user_id=${encodeURIComponent(user.id)}&return_code=${encodeURIComponent(returnCode)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengambil detail retur.');
      setDetail(data);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Gagal mengambil detail retur.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnCode]);

  useEffect(() => {
    if (!imagePreview) return undefined;
    function handleKeyDown(event) {
      if (event.key === 'Escape') setImagePreview(null);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [imagePreview]);

  async function handleShipBack(event) {
    event?.preventDefault();
    if (shipLoading) return;

    const user = getStoredUser();
    if (!user || user.role !== 'customer') {
      setError('Login dulu sebagai customer.');
      return;
    }
    if (!shipTracking.trim()) {
      setError('Nomor resi wajib diisi.');
      return;
    }

    setShipLoading(true);
    setError('');
    setShipMessage('');

    try {
      const res = await fetch(`${API}/ship-back`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          return_code: detail.return_code,
          return_courier_name: shipCourier.trim(),
          return_tracking_number: shipTracking.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengirim status pengiriman balik.');
      setDetail(data.return_entry || null);
      setShipMessage(data.message || 'Status retur diperbarui.');
      setShipCourier('');
      setShipTracking('');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Gagal mengirim status pengiriman balik.');
    } finally {
      setShipLoading(false);
    }
  }

  const status = detail?.status || '';
  const statusMeta = RETURN_STATUS_META[status] || { color: '#c4706a', bg: 'rgba(214,134,124,0.12)' };
  const isBadState = status === 'rejected' || status === 'cancelled';
  const currentStepIndex = TIMELINE_STEPS.findIndex((step) => step.key === status);

  return (
    <div className="rd-wrap">
      <Link href="/customer/profile/return" className="rd-back-btn">
        <IconBack /> Kembali ke Retur Saya
      </Link>

      {loading && <p className="rd-banner rd-banner--info">Memuat detail retur...</p>}
      {error && <p className="rd-banner rd-banner--error">{error}</p>}
      {shipMessage && <p className="rd-banner rd-banner--success">{shipMessage}</p>}

      {detail && (
        <>
          <div className="rd-header">
            <div className="rd-header-left">
              <h1 className="rd-title">Detail Retur</h1>
              <p className="rd-sub">
                #{detail.return_code} · Pesanan{' '}
                <Link href={`/customer/profile/order/detail/${encodeURIComponent(detail.order_code || '-')}`}>
                  {detail.order_code}
                </Link>
              </p>
            </div>
            <span className="rd-status-badge" style={{ color: statusMeta.color, background: statusMeta.bg }}>
              {detail.status_label || detail.status || '-'}
            </span>
          </div>

          {isBadState && (
            <div className="rd-state-banner">
              <span className="rd-state-icon"><IconBan /></span>
              <div>
                <p className="rd-state-title">Retur {detail.status_label || detail.status}</p>
                <p className="rd-state-desc">{detail.decision_reason || 'Pengajuan retur ini tidak dilanjutkan.'}</p>
              </div>
            </div>
          )}

          {!isBadState && currentStepIndex >= 0 && (
            <div className="rd-card">
              <p className="rd-section-label">Status Retur</p>
              <div className="rd-steps">
                {TIMELINE_STEPS.map((step, i) => {
                  const isLastStep = i === TIMELINE_STEPS.length - 1;
                  // Step terakhir yang udah tercapai dianggap "selesai" penuh,
                  // bukan "lagi berjalan" — gak ada step sesudahnya buat ditunggu.
                  const isDone = i < currentStepIndex || (i === currentStepIndex && isLastStep);
                  const isActive = i === currentStepIndex && !isLastStep;
                  const dotState = isDone ? 'done' : isActive ? 'active' : 'pending';
                  return (
                    <Fragment key={step.key}>
                      <div className="rd-step">
                        <div className={`rd-step-dot rd-step-dot--${dotState}`}>
                          <TimelineIcon name={step.icon} />
                        </div>
                        <span className={`rd-step-label rd-step-label--${dotState}`}>{step.label}</span>
                      </div>
                      {i < TIMELINE_STEPS.length - 1 && (
                        <div className={`rd-step-line rd-step-line--${dotState}`} />
                      )}
                    </Fragment>
                  );
                })}
              </div>
              {(detail.processed_at || detail.decision_reason) && (
                <div className="rd-timeline-foot">
                  {detail.processed_at && <span>Diproses {formatTanggal(detail.processed_at)}{detail.processed_by_name ? ` oleh ${detail.processed_by_name}` : ''}</span>}
                  {detail.decision_reason && <span>{detail.decision_reason}</span>}
                </div>
              )}
            </div>
          )}

          {/* ── Aksi: kirim produk kembali (status approved) ── */}
          {status === 'approved' && (
            <div className="rd-card rd-action-card">
              <p className="rd-section-label">Kirim Produk Kembali</p>
              <p className="rd-card-subtitle">Retur kamu disetujui. Kirim produk ke alamat berikut, lalu isi nomor resinya di bawah.</p>

              <div className="rd-meta-list">
                <MetaRow label="Penerima" value={destination.recipient_name || '-'} />
                <MetaRow label="Telepon" value={destination.phone || '-'} />
                <MetaRow
                  label="Alamat"
                  value={[destination.address_line, destination.city, destination.province, destination.postal_code].filter(Boolean).join(', ') || '-'}
                />
                {destination.notes && <MetaRow label="Catatan" value={destination.notes} />}
              </div>

              {destination.whatsapp_number && (
                <a
                  className="rd-wa-btn"
                  href={waLink(destination.whatsapp_number, `Halo, saya mau retur dengan kode ${detail.return_code}`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <IconWhatsapp /> Chat WhatsApp Toko
                </a>
              )}

              <div className="rd-section-divider" />

              <p className="rd-field-label">Sudah kirim? Isi nomor resinya</p>
              <form onSubmit={handleShipBack}>
                <input
                  type="text"
                  className="rd-input"
                  placeholder="Kurir (opsional) — mis. JNE / J&T"
                  value={shipCourier}
                  onChange={(e) => setShipCourier(e.target.value)}
                />
                <input
                  type="text"
                  className="rd-input"
                  placeholder="Nomor resi pengiriman balik"
                  value={shipTracking}
                  onChange={(e) => setShipTracking(e.target.value)}
                />
                <button type="submit" className="rd-btn-primary" disabled={shipLoading || !shipTracking.trim()}>
                  {shipLoading ? 'Mengirim...' : 'Saya Sudah Kirim Produk'}
                </button>
              </form>
            </div>
          )}

          {/* ── Info pengiriman balik + penyelesaian (digabung satu card biar gak kebanyakan kotak) ── */}
          {['shipped_back', 'received', 'completed'].includes(status) && (
            <div className="rd-card">
              <p className="rd-section-label"><IconTruck /> Pengiriman Balik</p>
              <div className="rd-meta-list">
                <MetaRow label="Kurir" value={returnShipment.courier_name || '-'} />
                <MetaRow label="Nomor Resi" value={returnShipment.tracking_number || '-'} />
                <MetaRow label="Dikirim Pada" value={formatTanggal(returnShipment.shipped_back_at)} />
                <MetaRow label="Diterima Toko" value={formatTanggal(detail.received_at)} />
                {detail.received_by_name && <MetaRow label="Diterima Oleh" value={detail.received_by_name} />}
              </div>

              {status === 'completed' && (
                <>
                  <div className="rd-section-divider" />
                  <p className="rd-section-label"><IconCheck /> Penyelesaian</p>
                  <div className="rd-meta-list">
                    {detail.resolution_type === 'refund' ? (
                      <MetaRow label="Bukti Transfer Refund" value={<ProofAction path={completion.refund_proof} label="Bukti Transfer Refund" onPreview={setImagePreview} />} />
                    ) : (
                      <MetaRow label="Resi Barang Pengganti" value={completion.exchange_shipment_tracking || '-'} />
                    )}
                    <MetaRow label="Diselesaikan Pada" value={formatTanggal(completion.completed_at)} />
                    {completion.completed_by_name && <MetaRow label="Diselesaikan Oleh" value={completion.completed_by_name} />}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="rd-grid">
            <div className="rd-col-main">
              <div className="rd-card">
                <p className="rd-section-label"><IconPackage /> Produk yang Diretur</p>
                <div className="rd-items">
                  {(detail.items || []).map((item, i) => (
                    <div key={item.id || i} className="rd-item">
                      <div className="rd-item-img">
                        <span>{(item.product_name || '?')[0]}</span>
                      </div>
                      <div className="rd-item-info">
                        <p className="rd-item-name">{item.product_name || '-'}</p>
                        <p className="rd-item-qty">Diretur {item.quantity || 0} dari {item.ordered_quantity || 0} pcs dibeli</p>
                      </div>
                      <div className="rd-item-right">
                        <p className="rd-item-unit">Rp {formatRibuan(item.product_price)} / pcs</p>
                        <p className="rd-item-subtotal">Rp {formatRibuan(item.subtotal)}</p>
                      </div>
                    </div>
                  ))}
                  {(detail.items || []).length === 0 && <p className="rd-meta-note">Tidak ada item retur.</p>}
                </div>
                <div className="rd-section-divider" />
                <div className="rd-summary-row rd-summary-row--total">
                  <span>Total Diajukan ({detail.total_requested_quantity || 0} pcs)</span>
                  <span>Rp {formatRibuan(detail.total_requested_amount)}</span>
                </div>

                <div className="rd-section-divider" />

                <p className="rd-section-label">{detail.resolution_type_label || 'Penyelesaian'}</p>
                {detail.resolution_type === 'refund' && (
                  <div className="rd-meta-list">
                    <MetaRow label="Nama Bank" value={refundInfo.bank_name || '-'} />
                    <MetaRow label="No. Rekening" value={refundInfo.account_number || '-'} />
                    <MetaRow label="Nama Pemilik" value={refundInfo.account_holder_name || '-'} />
                  </div>
                )}
                {detail.resolution_type === 'exchange' && (
                  <div className="rd-meta-list">
                    <MetaRow label="Kurir" value={exchangeInfo.courier_name || '-'} />
                    <MetaRow label="Penerima" value={`${exchangeInfo.recipient_name || '-'}${exchangeInfo.address_label ? ` · ${exchangeInfo.address_label}` : ''}`} />
                    <MetaRow label="Telepon" value={exchangeInfo.phone || '-'} />
                    <MetaRow
                      label="Alamat"
                      value={[exchangeInfo.address_line, exchangeInfo.city, exchangeInfo.province, exchangeInfo.postal_code].filter(Boolean).join(', ') || '-'}
                    />
                    {exchangeInfo.notes && <MetaRow label="Catatan" value={exchangeInfo.notes} />}
                  </div>
                )}
              </div>
            </div>

            <div className="rd-col-side">
              <div className="rd-card">
                <p className="rd-section-label">Alasan Retur</p>
                <p className="rd-reason-text">{detail.reason || '-'}</p>

                <div className="rd-section-divider" />

                <p className="rd-section-label">Info Pengajuan</p>
                <div className="rd-meta-list">
                  <MetaRow label="Diajukan Pada" value={formatTanggal(detail.created_at)} />
                  <MetaRow label="Customer" value={detail.customer_name || '-'} />
                </div>

                <div className="rd-section-divider" />

                <p className="rd-section-label">Bukti Pengajuan</p>
                <div className="rd-meta-list">
                  <MetaRow label="Foto Produk" value={<ProofAction path={detail.product_photo} label="Foto Produk Retur" onPreview={setImagePreview} />} />
                  <MetaRow
                    label="E-Receipt"
                    value={detail.ereceipt_proof ? (
                      <button type="button" className="rd-view-proof-btn" onClick={() => setShowVerification(true)}>
                        <IconReceipt /> Lihat Hasil Verifikasi
                      </button>
                    ) : <span className="rd-meta-val--muted">-</span>}
                  />
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <ImagePreviewModal preview={imagePreview} onClose={() => setImagePreview(null)} />
      <EReceiptVerificationModal open={showVerification} onClose={() => setShowVerification(false)} verification={detail?.ereceipt_verification} />
    </div>
  );
}
