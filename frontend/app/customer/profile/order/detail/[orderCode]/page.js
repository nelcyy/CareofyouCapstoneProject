'use client';

import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiUrl, mediaUrl } from '@/api';
import '../../../../favorites/page.css';

const ORDER_API = apiUrl('/api/customer/profile/order');
const RETURN_API = apiUrl('/api/customer/profile/return');
const ADDRESS_API = apiUrl('/api/customer/profile/address');
const RETURN_STEP_LABELS = ['Produk & Alasan', 'Foto Produk', 'E-Receipt', 'Penyelesaian', 'Konfirmasi'];
const RETURN_REASON_OPTIONS = [
  'Produk rusak / cacat',
  'Produk tidak sesuai deskripsi',
  'Barang salah dikirim',
  'Reaksi alergi terhadap produk',
  'Produk kedaluwarsa',
  'Lainnya',
];
const PROOF_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
const PROOF_IMAGE_TYPES = new Set(PROOF_IMAGE_ACCEPT.split(','));
const RECEIPT_PDF_ACCEPT = 'application/pdf,.pdf';
const EXCHANGE_COURIERS = [
  { id: 'jne-reg', name: 'JNE REG' },
  { id: 'jnt-reg', name: 'J&T REG' },
  { id: 'sicepat-reg', name: 'SiCepat REG' },
];
const TIMELINE_STEPS = [
  { key: 'pending', label: 'Menunggu', icon: 'clock' },
  { key: 'packing', label: 'Dikemas', icon: 'package' },
  { key: 'shipped', label: 'Dikirim', icon: 'truck' },
  { key: 'delivered', label: 'Sampai', icon: 'party' },
];

/* ── Helpers (murni presentasi, nilai datang apa adanya dari backend) ── */
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

function isAllowedProofImage(file) {
  if (!file) return false;
  const hasAllowedType = !file.type || PROOF_IMAGE_TYPES.has(file.type);
  const hasAllowedName = /\.(jpe?g|png|webp)$/i.test(file.name || '');
  return hasAllowedType && hasAllowedName;
}

function isAllowedPdf(file) {
  if (!file) return false;
  const hasAllowedType = !file.type || file.type === 'application/pdf';
  const hasAllowedName = /\.pdf$/i.test(file.name || '');
  return hasAllowedType && hasAllowedName;
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
  return { bank_name: '', account_number: '', account_holder_name: '' };
}

function buildInitialExchangeForm() {
  return { exchange_courier_id: '', exchange_address_id: '' };
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
  if (!returnResolutionType) return 'Tipe penyelesaian retur wajib dipilih.';
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

// Label tampilan buat tiap value asli Order.STATUS_CHOICES — murni
// terjemahan presentasi, bukan rule baru.
const ORDER_STATUS_LABELS = {
  waiting_admin_approval: 'Menunggu Persetujuan',
  rejected: 'Ditolak',
  pengemasan: 'Pengemasan',
  pengiriman: 'Pengiriman',
  selesai: 'Selesai',
};

function orderStatusLabel(status) {
  return ORDER_STATUS_LABELS[status] || status || '-';
}

// Sama persis substring matching yang dipakai di halaman daftar pesanan —
// dipakai juga buat nentuin step timeline mana yang aktif, biar gak ada
// anggapan urutan status baru yang gak sesuai sama backend.
// Dicocokin dulu ke value asli `Order.STATUS_CHOICES` di backend
// (waiting_admin_approval/rejected/pengemasan/pengiriman/selesai), baru fallback
// ke substring umum buat jaga-jaga kalau ada variasi label lain.
function statusStyle(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'rejected' || s.includes('batal') || s.includes('cancel') || s.includes('tolak') || s.includes('reject'))
    return { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', group: 'cancelled' };
  if (s === 'selesai' || s.includes('terkirim') || s.includes('deliver') || s.includes('complete'))
    return { color: '#16a34a', bg: 'rgba(34,197,94,0.12)', group: 'delivered' };
  if (s === 'pengiriman' || s.includes('kirim') || s.includes('ship'))
    return { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', group: 'shipped' };
  if (s === 'pengemasan' || s.includes('kemas') || s.includes('packing') || s.includes('proses') || s.includes('process'))
    return { color: '#4a9fd4', bg: 'rgba(74,159,212,0.12)', group: 'packing' };
  if (s === 'waiting_admin_approval' || s.includes('tunggu') || s.includes('pending') || s.includes('bayar') || s.includes('konfirmasi'))
    return { color: '#e09a3a', bg: 'rgba(224,154,58,0.12)', group: 'pending' };
  return { color: '#c4706a', bg: 'rgba(214,134,124,0.12)', group: null };
}

function timelineIndex(group) {
  return TIMELINE_STEPS.findIndex((step) => step.key === group);
}

/* ── Icon set (line-style, sama gaya sama yang udah dipakai di halaman lain) ── */
function IconBack() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
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
function IconMapPin() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function IconTruck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}
function IconCreditCard() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}
function IconDownload() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
function IconEye() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function IconRotate() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
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
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function IconCheckCircle(props) {
  return (
    <svg width={props?.size || 18} height={props?.size || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}
function IconXCircle(props) {
  return (
    <svg width={props?.size || 22} height={props?.size || 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}
function IconX() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function IconMinus() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function IconUploadCloud() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
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
function IconExternal() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}
function IconAlert(props) {
  return (
    <svg width={props?.size || 18} height={props?.size || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
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
function IconStar(props) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={props?.filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function IconPartyPopper() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5.8 11.3 2 22l10.7-3.8" />
      <path d="M4 3h.01" />
      <path d="M22 8h.01" />
      <path d="M15 2h.01" />
      <path d="M22 20h.01" />
      <path d="m22 2-3.5 3.5" />
      <path d="m21 15-4.5-4.5" />
      <path d="m3 21.5 2.5-2.5" />
      <path d="m20 12-3 3" />
      <path d="m12 2-2.5 2.5" />
    </svg>
  );
}

function TimelineIcon({ name }) {
  if (name === 'clock') return <IconClock size={17} />;
  if (name === 'package') return <IconPackage />;
  if (name === 'truck') return <IconTruck />;
  return <IconPartyPopper />;
}

function MetaRow({ label, value, action }) {
  return (
    <div className="od-meta-row">
      <span className="od-meta-label">{label}</span>
      <span className="od-meta-val">
        {value}
        {action}
      </span>
    </div>
  );
}

function ProofAction({ path, label, onPreview }) {
  if (!path) return <span className="od-meta-val--muted">-</span>;
  if (!isPreviewableProof(path)) {
    return <span className="od-meta-val--muted">Berkas tidak bisa dipreview</span>;
  }
  return (
    <button type="button" className="od-view-proof-btn" onClick={() => onPreview(proofPreview(path, label))}>
      <IconImage /> Lihat Bukti
    </button>
  );
}

function formatPaymentLabel(method, target) {
  const label = String(method || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return target ? `${label || '-'} - ${target}` : (label || '-');
}

// Barcode palsu deterministik — algoritma sama persis kayak yang dipakai
// backend buat render PDF e-receipt, biar pattern-nya konsisten.
function Barcode({ value, width = 200, height = 44 }) {
  const BARS = 58;
  let seed = 0;
  for (const ch of String(value || '')) {
    seed = ((seed << 5) - seed + ch.charCodeAt(0)) | 0;
  }
  const bars = Array.from({ length: BARS }, (_, i) => {
    const v = Math.abs(seed ^ (i * 2654435761)) % 100;
    return { h: 14 + (v % 30), w: v % 3 === 0 ? 3 : v % 2 === 0 ? 2 : 1 };
  });
  const totalW = bars.reduce((s, b) => s + b.w + 1, 0);
  const scale = width / totalW;
  let x = 0;
  const rects = bars.map((b, i) => {
    const el = (
      <rect key={i} x={x * scale} y={height - b.h} width={Math.max(1, b.w * scale - 0.5)} height={b.h} fill="#2d2d2d" rx="0.5" />
    );
    x += b.w + 1;
    return el;
  });
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      {rects}
    </svg>
  );
}

function ReceiptPreviewModal({ open, onClose, detail }) {
  if (!open || !detail) return null;
  const shippingFee = detail.shipping_fee || 0;
  const orderRef = `${String(detail.order_code || '').replace(/-/g, '')} 0 1 7 5 8 3`;

  return (
    <div className="od-modal-overlay" role="presentation" onClick={onClose}>
      <div className="od-modal od-rp-modal" role="dialog" aria-modal="true" aria-label="Preview E-Receipt" onClick={(e) => e.stopPropagation()}>
        <div className="od-modal-header">
          <h3>Preview E-Receipt</h3>
          <button type="button" className="od-modal-close" onClick={onClose} aria-label="Tutup preview">
            <IconX />
          </button>
        </div>
        <div className="od-rp-scroll">
          <div className="od-rp-receipt">
            <div className="od-rp-head">
              <div className="od-rp-logo-text">careofyou</div>
              <p className="od-rp-tagline">Struk Pembelian Resmi</p>
              <div className="od-rp-head-id">{detail.order_code}</div>
            </div>

            <div className="od-rp-success">
              <span className="od-rp-success-dot"><IconCheck /></span>
              Pembayaran Berhasil Dikonfirmasi
            </div>

            <div className="od-rp-body">
              <p className="od-rp-section-label">Info Transaksi</p>
              <div className="od-rp-info-grid">
                <div className="od-rp-info-box">
                  <div className="od-rp-info-label">No. Pesanan</div>
                  <div className="od-rp-info-val">{detail.order_code}</div>
                </div>
                <div className="od-rp-info-box">
                  <div className="od-rp-info-label">Tanggal</div>
                  <div className="od-rp-info-val">{formatTanggal(detail.processed_at || detail.created_at)}</div>
                </div>
                <div className="od-rp-info-box">
                  <div className="od-rp-info-label">Metode Bayar</div>
                  <div className="od-rp-info-val">{formatPaymentLabel(detail.payment_method, detail.payment_target)}</div>
                </div>
                <div className="od-rp-info-box">
                  <div className="od-rp-info-label">Penerima</div>
                  <div className="od-rp-info-val">{detail.recipient_name || '-'}</div>
                </div>
              </div>

              <p className="od-rp-section-label">Produk Dipesan</p>
              <div className="od-rp-items">
                {(detail.items || []).map((item, i) => (
                  <div key={item.id || i} className="od-rp-item">
                    <div className="od-rp-item-dot" />
                    <div className="od-rp-item-left">
                      <span className="od-rp-item-name">{item.product_name}</span>
                      <span className="od-rp-item-qty">{item.quantity} pcs x Rp {formatRibuan(item.product_price)}</span>
                    </div>
                    <span className="od-rp-item-total">Rp {formatRibuan(item.subtotal)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="od-rp-summary">
              <div className="od-rp-summary-row">
                <span>Subtotal</span>
                <span className="od-rp-summary-val">Rp {formatRibuan(detail.subtotal)}</span>
              </div>
              <div className="od-rp-summary-row">
                <span>Ongkos Kirim</span>
                {shippingFee > 0 ? (
                  <span className="od-rp-summary-val">Rp {formatRibuan(shippingFee)}</span>
                ) : (
                  <span className="od-rp-summary-free"><IconCheck /> Gratis</span>
                )}
              </div>
            </div>

            <div className="od-rp-total-row">
              <span className="od-rp-total-label">Total Pembayaran</span>
              <span className="od-rp-total-val">Rp {formatRibuan(detail.grand_total)}</span>
            </div>

            <div className="od-rp-barcode-wrap">
              <Barcode value={detail.order_code || ''} width={200} height={40} />
              <p className="od-rp-barcode-num">{orderRef}</p>
            </div>

            <div className="od-rp-footer">
              <p className="od-rp-footer-main">Terima kasih sudah belanja di careofyou</p>
              <p className="od-rp-footer-sub">Simpan struk ini sebagai bukti pembelian resmi kamu</p>
              <p className="od-rp-footer-brand">careofyou.id</p>
            </div>
          </div>
        </div>
      </div>
    </div>
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
    <div className="od-modal-overlay" role="presentation" onClick={onClose}>
      <div className="od-modal od-zoom-modal" role="dialog" aria-modal="true" aria-label={preview.label} onClick={(e) => e.stopPropagation()}>
        <div className="od-modal-header">
          <h3>{preview.label}</h3>
          <button type="button" className="od-modal-close" onClick={onClose} aria-label="Tutup preview">
            <IconX />
          </button>
        </div>
        <div className={`od-zoom-body${zoom > 1 ? ' od-zoom-body--zoomed' : ''}`}>
          <img src={preview.src} alt={preview.label} style={{ transform: `scale(${zoom})` }} />
        </div>
        <div className="od-zoom-controls">
          <button type="button" className="od-zoom-btn" onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)))} disabled={zoom <= 1} aria-label="Perkecil">
            <IconZoomOut />
          </button>
          <span className="od-zoom-level">{Math.round(zoom * 100)}%</span>
          <button type="button" className="od-zoom-btn" onClick={() => setZoom((z) => Math.min(3, +(z + 0.5).toFixed(1)))} disabled={zoom >= 3} aria-label="Perbesar">
            <IconZoomIn />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProfileOrderDetailPage() {
  const params = useParams();
  const orderCode = decodeURIComponent(params?.orderCode || '');
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);

  // Return wizard
  const [showReturnWizard, setShowReturnWizard] = useState(false);
  const [returnStep, setReturnStep] = useState(1);
  const [returnSubmitResult, setReturnSubmitResult] = useState(null);
  const [returnSelections, setReturnSelections] = useState({});
  const [returnReason, setReturnReason] = useState('');
  const [returnReasonCustom, setReturnReasonCustom] = useState('');
  const [productPhoto, setProductPhoto] = useState(null);
  const [receiptProof, setReceiptProof] = useState(null);
  const [returnResolutionType, setReturnResolutionType] = useState('');
  const [refundForm, setRefundForm] = useState(buildInitialRefundForm());
  const [exchangeForm, setExchangeForm] = useState(buildInitialExchangeForm());
  const [addresses, setAddresses] = useState([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [submittingReturn, setSubmittingReturn] = useState(false);

  // Cancel order — UI siap, nunggu field `can_cancel` / `cancel_deadline_at`
  // dan endpoint cancel dari backend. Lihat catatan di akhir percakapan.
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelTimeLeft, setCancelTimeLeft] = useState(null);

  // Rating produk — UI siap, nunggu field status-sudah-dirating & endpoint
  // submit rating dari backend.
  const [ratingMap, setRatingMap] = useState({});
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  async function loadAddresses({ silent = true } = {}) {
    const user = getStoredUser();
    if (!user || user.role !== 'customer') {
      if (!silent) setError('Login dulu sebagai customer untuk mengambil alamat.');
      return;
    }

    setAddressesLoading(true);
    try {
      const res = await fetch(`${ADDRESS_API}/list?user_id=${encodeURIComponent(user.id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengambil alamat customer.');
      setAddresses(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      if (!silent) setError(err.message || 'Gagal mengambil alamat customer.');
    } finally {
      setAddressesLoading(false);
    }
  }

  async function loadDetail(options = {}) {
    const { keepMessage = true, skipWizardAutoClose = false } = options;
    const user = getStoredUser();
    if (!user || user.role !== 'customer') {
      setError('Login dulu sebagai customer untuk melihat detail pesanan.');
      setLoading(false);
      return;
    }

    if (!keepMessage) setMessage('');

    const res = await fetch(
      `${ORDER_API}/detail?user_id=${encodeURIComponent(user.id)}&order_code=${encodeURIComponent(orderCode)}`,
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengambil detail pesanan.');

    setDetail(data);
    setReturnSelections((current) => {
      const nextState = buildInitialReturnSelections(data);
      return Object.keys(current).length > 0 ? { ...nextState, ...current } : nextState;
    });

    if (data?.return_info?.eligible) loadAddresses({ silent: true });
    if (!data?.return_info?.eligible && !skipWizardAutoClose) setShowReturnWizard(false);
  }

  function resetReturnWizard(nextDetail = detail) {
    setShowReturnWizard(false);
    setReturnStep(1);
    setReturnReason('');
    setReturnReasonCustom('');
    setProductPhoto(null);
    setReceiptProof(null);
    setReturnResolutionType('');
    setRefundForm(buildInitialRefundForm());
    setExchangeForm(buildInitialExchangeForm());
    setReturnSelections(buildInitialReturnSelections(nextDetail));
    setReturnSubmitResult(null);
  }

  function handleDownloadReceipt() {
    const user = getStoredUser();
    if (!user || user.role !== 'customer') {
      setError('Login dulu sebagai customer untuk download e-receipt.');
      return;
    }
    const url = `${ORDER_API}/ereceipt/download?user_id=${encodeURIComponent(user.id)}&order_code=${encodeURIComponent(orderCode)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function openImagePreview(preview) {
    if (!preview?.src) return;
    setImagePreview(preview);
  }

  function closeImagePreview() {
    setImagePreview(null);
  }

  function handleProductPhotoChange(event) {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setProductPhoto(null);
      return;
    }
    if (!isAllowedProofImage(file)) {
      setProductPhoto(null);
      setError('Foto produk harus berupa JPG, PNG, atau WebP.');
      return;
    }
    setError('');
    setProductPhoto(file);
  }

  function handleReceiptProofChange(event) {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setReceiptProof(null);
      return;
    }
    if (!isAllowedPdf(file)) {
      setReceiptProof(null);
      setError('E-receipt wajib berupa file PDF.');
      return;
    }
    setError('');
    setReceiptProof(file);
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
    const finalReason = returnReason === 'Lainnya' ? returnReasonCustom.trim() : returnReason;
    if (!finalReason.trim()) {
      setError('Alasan retur wajib diisi.');
      return;
    }
    if (!productPhoto) {
      setError('Foto produk wajib diupload.');
      return;
    }
    if (!isAllowedProofImage(productPhoto)) {
      setError('Foto produk harus berupa JPG, PNG, atau WebP.');
      return;
    }
    if (!receiptProof) {
      setError('E-receipt wajib diupload.');
      return;
    }
    if (!isAllowedPdf(receiptProof)) {
      setError('E-receipt wajib berupa file PDF.');
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
      formData.append('reason', finalReason);
      formData.append('resolution_type', returnResolutionType);
      formData.append(
        'items_json',
        JSON.stringify(selectedItems.map((item) => ({ order_item_id: item.order_item_id, quantity: item.quantity }))),
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

      const res = await fetch(`${RETURN_API}/create`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengirim pengajuan retur.');

      await loadDetail({ keepMessage: true, skipWizardAutoClose: true });
      setReturnSubmitResult({
        message: data.message || 'Pengajuan retur berhasil dikirim ke admin.',
        returnCode: data.return_entry?.return_code || '',
        statusLabel: data.return_entry?.status_label || data.return_entry?.status || '',
      });
    } catch (err) {
      console.error(err);
      setError(err.message || 'Gagal mengirim pengajuan retur.');
    } finally {
      setSubmittingReturn(false);
    }
  }

  // ── Cancel order — placeholder pending backend (lihat catatan di akhir chat) ──
  async function handleConfirmCancel() {
    if (!detail) return;
    const user = getStoredUser();
    if (!user || user.role !== 'customer') {
      setError('Login dulu sebagai customer untuk membatalkan pesanan.');
      return;
    }
    if (!cancelReason.trim()) {
      setError('Alasan pembatalan wajib diisi.');
      return;
    }

    setCancelSubmitting(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch(`${ORDER_API}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, order_code: orderCode, reason: cancelReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal membatalkan pesanan.');
      setMessage(data.message || 'Pesanan berhasil dibatalkan.');
      setCancelConfirmOpen(false);
      setCancelReason('');
      await loadDetail({ keepMessage: true });
    } catch (err) {
      console.error(err);
      setError(err.message || 'Gagal membatalkan pesanan. Fitur ini menunggu endpoint cancel dari backend.');
    } finally {
      setCancelSubmitting(false);
    }
  }

  // ── Rating produk — placeholder pending backend (lihat catatan di akhir chat) ──
  async function handleSubmitRatings() {
    if (!detail) return;
    const user = getStoredUser();
    if (!user || user.role !== 'customer') {
      setError('Login dulu sebagai customer untuk memberi rating.');
      return;
    }
    const entries = Object.entries(ratingMap).filter(([, v]) => v > 0);
    if (entries.length === 0) return;

    setRatingSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${ORDER_API}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          order_code: orderCode,
          ratings: entries.map(([orderItemId, rating]) => ({ order_item_id: orderItemId, rating })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Gagal mengirim rating.');
      }
      setRatingSubmitted(true);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Gagal mengirim rating. Fitur ini menunggu endpoint rating dari backend.');
    } finally {
      setRatingSubmitting(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderCode]);

  useEffect(() => {
    if (!imagePreview && !showReceiptPreview) return undefined;
    function handleKeyDown(event) {
      if (event.key !== 'Escape') return;
      closeImagePreview();
      setShowReceiptPreview(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [imagePreview, showReceiptPreview]);

  // Countdown pembatalan — hanya aktif kalau backend kirim `cancel_deadline_at`.
  useEffect(() => {
    if (!detail?.cancel_deadline_at) {
      setCancelTimeLeft(null);
      return undefined;
    }
    const deadline = new Date(detail.cancel_deadline_at).getTime();
    const tick = () => setCancelTimeLeft(Math.max(0, Math.floor((deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [detail?.cancel_deadline_at]);

  function fmtCountdown(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}j ${m}m`;
    if (m > 0) return `${m}m ${s}d`;
    return `${s}d`;
  }

  const status = statusStyle(detail?.status);
  const currentStepIndex = timelineIndex(status.group);
  const isCancelledOrRejected = status.group === 'cancelled';
  const returnInfo = detail?.return_info || {};
  const selectedReturnItems = getSelectedReturnItems(detail, returnSelections);
  const selectedExchangeAddress = addresses.find((item) => String(item.id) === String(exchangeForm.exchange_address_id));
  const resolutionError = getResolutionError(returnResolutionType, refundForm, exchangeForm);
  const canContinueStep1 = selectedReturnItems.length > 0
    && Boolean(returnReason)
    && (returnReason !== 'Lainnya' || Boolean(returnReasonCustom.trim()));
  const canContinueStep2 = Boolean(productPhoto);
  const canContinueStep3 = Boolean(receiptProof);
  const canContinueStep4 = Boolean(returnResolutionType);
  const canSubmitStep5 = !submittingReturn && !addressesLoading && !resolutionError;

  // Tombol cancel hanya nongol kalau backend secara eksplisit ngirim
  // `can_cancel: true` — sampai field itu ada, kartu ini gak pernah tampil.
  const showCancelCard = Boolean(detail?.can_cancel);
  // Kartu rating hanya nongol di status "delivered", dicocokin lewat
  // statusStyle() yang sama dipakai timeline & badge — bukan rule baru.
  const showRatingCard = status.group === 'delivered' && (detail?.items || []).length > 0 && !ratingSubmitted;

  return (
    <div className="od-wrap">
      <Link href="/customer/profile/order" className="od-back-btn">
        <IconBack /> Kembali ke Pesanan Saya
      </Link>

      {loading && <p className="od-banner od-banner--info">Memuat detail pesanan...</p>}
      {error && <p className="od-banner od-banner--error">{error}</p>}
      {message && <p className="od-banner od-banner--success">{message}</p>}

      {detail && (
        <>
          <div className="od-header">
            <div className="od-header-left">
              <h1 className="od-title">Detail Pesanan</h1>
              <p className="od-order-code">#{detail.order_code || orderCode} · Dipesan {formatTanggal(detail.created_at)}</p>
            </div>
            <span className="od-status-badge" style={{ color: status.color, background: status.bg }}>
              {status.group === 'delivered' ? <IconCheckCircle size={14} /> : status.group === 'cancelled' ? <IconXCircle size={14} /> : <IconClock size={14} />}
              {orderStatusLabel(detail.status)}
            </span>
          </div>

          {/* ── Rejected / cancelled banner ── */}
          {isCancelledOrRejected && (
            <div className="od-state-banner od-state-banner--bad">
              <span className="od-state-icon"><IconBan /></span>
              <div>
                <p className="od-state-title">{detail.decision === 'rejected' ? 'Pesanan Ditolak' : 'Pesanan Dibatalkan'}</p>
                <p className="od-state-desc">{detail.decision_reason || 'Pesanan ini tidak dilanjutkan.'}</p>
              </div>
            </div>
          )}

          {/* ── Timeline status ── */}
          {!isCancelledOrRejected && (
            <div className="od-card">
              <p className="od-section-label">Status Pesanan</p>
              {currentStepIndex >= 0 ? (
                <div className="od-steps">
                  {TIMELINE_STEPS.map((step, i) => {
                    const isLastStep = i === TIMELINE_STEPS.length - 1;
                    // Step terakhir yang udah tercapai dianggap "selesai" penuh,
                    // bukan "lagi berjalan" — gak ada step sesudahnya buat ditunggu.
                    const isDone = i < currentStepIndex || (i === currentStepIndex && isLastStep);
                    const isActive = i === currentStepIndex && !isLastStep;
                    const dotState = isDone ? 'done' : isActive ? 'active' : 'pending';
                    // Garis setelah step ini ngikutin state step itu sendiri —
                    // done = hijau, lagi di step ini = gradient (transisi ke step berikut).
                    const lineState = isDone ? 'done' : isActive ? 'active' : 'pending';
                    return (
                      <Fragment key={step.key}>
                        <div className="od-step">
                          <div className={`od-step-dot od-step-dot--${dotState}`}>
                            <TimelineIcon name={step.icon} />
                          </div>
                          <span className={`od-step-label od-step-label--${dotState}`}>{step.label}</span>
                        </div>
                        {i < TIMELINE_STEPS.length - 1 && (
                          <div className={`od-step-line od-step-line--${lineState}`} />
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              ) : (
                <p className="od-meta-note">{orderStatusLabel(detail.status)}</p>
              )}
              {(detail.processed_at || detail.decision_reason) && (
                <div className="od-timeline-foot">
                  {detail.processed_at && <span>Diproses {formatTanggal(detail.processed_at)}</span>}
                  {detail.decision_reason && <span>{detail.decision_reason}</span>}
                </div>
              )}
            </div>
          )}

          <div className="od-grid">
            {/* ══ LEFT COLUMN — Pesanan & Pembayaran ══ */}
            <div className="od-col-main">
              <div className="od-card">
                <p className="od-section-label"><IconPackage /> Produk yang Dipesan</p>
                <div className="od-items">
                  {(detail.items || []).map((item, i) => (
                    <div key={item.id || i} className="od-item">
                      <div className="od-item-img">
                        {item.image ? (
                          <img src={fileUrl(item.image)} alt={item.product_name} />
                        ) : (
                          <span>{(item.product_name || '?')[0]}</span>
                        )}
                      </div>
                      <div className="od-item-info">
                        <p className="od-item-name">{item.product_name || '-'}</p>
                        <p className="od-item-qty">Jumlah: {item.quantity || 0}</p>
                      </div>
                      <div className="od-item-right">
                        <p className="od-item-unit">Rp {formatRibuan(item.product_price)} / pcs</p>
                        <p className="od-item-subtotal">Rp {formatRibuan(item.subtotal)}</p>
                      </div>
                    </div>
                  ))}
                  {(detail.items || []).length === 0 && <p className="od-meta-note">Tidak ada item.</p>}
                </div>

                <div className="od-section-divider" />

                <div className="od-summary">
                  <div className="od-summary-row">
                    <span>Subtotal</span>
                    <span>Rp {formatRibuan(detail.subtotal)}</span>
                  </div>
                  <div className="od-summary-row">
                    <span>Ongkos Kirim</span>
                    <span>Rp {formatRibuan(detail.shipping_fee)}</span>
                  </div>
                  <div className="od-summary-divider" />
                  <div className="od-summary-row od-summary-total">
                    <span>Total</span>
                    <span>Rp {formatRibuan(detail.grand_total)}</span>
                  </div>
                </div>
              </div>

              {/* ── Cancel card — nongol cuma kalau backend kirim can_cancel: true ── */}
              {showCancelCard && (
                <div className="od-cancel-card">
                  <div className="od-cancel-info">
                    <span className="od-cancel-info-icon"><IconClock size={16} /></span>
                    <div>
                      <p className="od-cancel-info-title">Pesanan Bisa Dibatalkan</p>
                      <p className="od-cancel-info-sub">
                        {cancelTimeLeft != null ? <>Sisa waktu: <strong>{fmtCountdown(cancelTimeLeft)}</strong></> : 'Selama belum diproses admin'}
                      </p>
                    </div>
                  </div>
                  <button type="button" className="od-cancel-btn" onClick={() => setCancelConfirmOpen(true)}>
                    Batalkan Pesanan
                  </button>
                </div>
              )}

              <div className="od-card">
                <p className="od-section-label"><IconCreditCard /> Pembayaran</p>
                <div className="od-meta-list">
                  <MetaRow label="Metode" value={detail.payment_method || '-'} />
                  <MetaRow label="Tujuan Transfer" value={detail.payment_target || '-'} />
                  <MetaRow label="Bukti Transfer" value={<ProofAction path={detail.payment_proof} label="Bukti Transfer" onPreview={openImagePreview} />} />
                </div>

                <div className="od-section-divider" />

                <p className="od-section-label"><IconReceipt /> E-Receipt</p>
                <p className="od-card-subtitle">
                  {detail.ereceipt_eligible ? 'Tersedia untuk pesanan ini' : 'Tersedia setelah pesanan di-approve admin'}
                </p>
                <div className="od-receipt-actions">
                  <button type="button" className="od-btn-download" disabled={!detail.ereceipt_eligible} onClick={handleDownloadReceipt}>
                    <IconDownload /> Download
                  </button>
                  <button type="button" className="od-btn-preview" disabled={!detail.ereceipt_eligible} onClick={() => setShowReceiptPreview(true)}>
                    <IconEye /> Lihat Preview
                  </button>
                </div>
              </div>
            </div>

            {/* ══ RIGHT COLUMN — Pengiriman & Setelah Pesanan ══ */}
            <div className="od-col-side">
              <div className="od-card">
                <p className="od-section-label"><IconMapPin /> Alamat Penerima</p>
                <div className="od-meta-list">
                  <MetaRow label="Penerima" value={`${detail.recipient_name || '-'}${detail.address_label ? ` · ${detail.address_label}` : ''}`} />
                  <MetaRow label="Telepon" value={detail.recipient_phone || '-'} />
                  <MetaRow
                    label="Alamat"
                    value={[detail.address_line, detail.city, detail.province, detail.postal_code].filter(Boolean).join(', ') || '-'}
                  />
                  {detail.address_notes && <MetaRow label="Catatan" value={detail.address_notes} />}
                </div>

                <div className="od-section-divider" />

                <p className="od-section-label"><IconTruck /> Detail Pengiriman</p>
                <div className="od-meta-list">
                  <MetaRow label="Kurir" value={detail.courier_name || '-'} />
                  <MetaRow label="No. Resi" value={detail.tracking_number || '-'} />
                  <MetaRow label="Dikirim Pada" value={formatTanggal(detail.shipped_at)} />
                  <MetaRow label="Selesai Pada" value={formatTanggal(detail.completed_at)} />
                  {detail.shipping_notes && <MetaRow label="Catatan" value={detail.shipping_notes} />}
                  <MetaRow label="Bukti Terkirim" value={<ProofAction path={detail.delivery_proof} label="Bukti Terkirim" onPreview={openImagePreview} />} />
                </div>
              </div>

              {/* ── Rating produk — nongol kalau status sudah delivered ── */}
              {showRatingCard && (
                <div className="od-card">
                  <p className="od-section-label">Nilai Produk Kamu</p>
                  <p className="od-card-subtitle">Beri bintang 1–5 untuk setiap produk yang sudah kamu terima.</p>
                  {(detail.items || []).map((item) => (
                    <div key={item.id} className="od-rating-row">
                      <p className="od-rating-item-name">{item.product_name}</p>
                      <div className="od-stars">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            className="od-star-btn"
                            onClick={() => setRatingMap((prev) => ({ ...prev, [item.id]: star }))}
                            aria-label={`${star} bintang`}
                          >
                            <IconStar filled={(ratingMap[item.id] ?? 0) >= star} />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="od-btn-primary"
                    style={{ marginTop: 14 }}
                    disabled={ratingSubmitting || Object.keys(ratingMap).length === 0}
                    onClick={handleSubmitRatings}
                  >
                    {ratingSubmitting ? 'Menyimpan...' : 'Kirim Penilaian'}
                  </button>
                </div>
              )}

              {ratingSubmitted && (
                <p className="od-banner od-banner--success">Terima kasih sudah memberi penilaian!</p>
              )}

              {/* ── Return panel ── */}
              {returnInfo.eligible && !showReturnWizard && (
                <div className="od-card od-return-card">
                  <p className="od-section-label">Retur / Pengembalian</p>
                  <p className="od-card-subtitle">Retur tersedia sampai {formatTanggal(returnInfo.deadline_at)}.</p>
                  <button type="button" className="od-return-btn" onClick={handleStartReturn}>
                    <IconRotate /> Ajukan Retur
                  </button>
                </div>
              )}

              {!returnInfo.eligible && returnInfo.has_return && (
                <div className="od-card od-return-status-card">
                  <p className="od-section-label">Status Retur</p>
                  <div className="od-meta-list">
                    <MetaRow label="Kode Retur" value={returnInfo.return_code || '-'} />
                    <MetaRow label="Status" value={returnInfo.return_status_label || returnInfo.return_status || '-'} />
                  </div>
                  <Link href={`/customer/profile/return/detail/${encodeURIComponent(returnInfo.return_code || '-')}`} className="od-return-status-link">
                    Lihat detail retur <IconExternal />
                  </Link>
                </div>
              )}

              {!returnInfo.eligible && !returnInfo.has_return && returnInfo.expired && (
                <p className="od-meta-note">Masa retur 2 hari untuk pesanan ini sudah berakhir.</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════
          CANCEL MODAL
          ════════════════════════════════════════════════ */}
      {cancelConfirmOpen && (
        <div className="od-modal-overlay" onClick={() => !cancelSubmitting && setCancelConfirmOpen(false)}>
          <div className="od-modal" onClick={(e) => e.stopPropagation()}>
            <div className="od-modal-header">
              <div>
                <h3>Batalkan Pesanan</h3>
                <p className="od-modal-sub">#{detail?.order_code || orderCode}</p>
              </div>
              <button type="button" className="od-modal-close" onClick={() => setCancelConfirmOpen(false)}>
                <IconX />
              </button>
            </div>
            <div className="od-modal-body">
              <p className="od-field-label">Alasan pembatalan</p>
              <textarea
                className="od-textarea"
                rows={4}
                placeholder="Ceritakan alasanmu di sini..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
              <div className="od-warning-note">
                <IconAlert size={14} /> Tindakan ini tidak dapat dibatalkan setelah dikonfirmasi.
              </div>
            </div>
            <div className="od-modal-footer">
              <button type="button" className="od-btn-secondary" onClick={() => setCancelConfirmOpen(false)} disabled={cancelSubmitting}>
                Kembali
              </button>
              <button type="button" className="od-btn-danger" onClick={handleConfirmCancel} disabled={cancelSubmitting || !cancelReason.trim()}>
                {cancelSubmitting ? 'Memproses...' : 'Konfirmasi Batalkan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          RETURN WIZARD MODAL
          ════════════════════════════════════════════════ */}
      {showReturnWizard && (
        <div className="od-modal-overlay" onClick={() => !submittingReturn && resetReturnWizard(detail)}>
          <div className="od-modal od-return-modal" onClick={(e) => e.stopPropagation()}>
            <div className="od-modal-header">
              <div>
                <h3>Ajukan Retur</h3>
                <p className="od-modal-sub">#{detail?.order_code || orderCode}</p>
              </div>
              <button type="button" className="od-modal-close" onClick={() => resetReturnWizard(detail)}>
                <IconX />
              </button>
            </div>

            {returnSubmitResult ? (
              <div className="od-return-success">
                <div className="od-return-success-icon">
                  <IconCheckCircle size={30} />
                </div>
                <h4 className="od-return-success-title">Pengajuan Retur Terkirim!</h4>
                <p className="od-return-success-desc">{returnSubmitResult.message}</p>
                {(returnSubmitResult.returnCode || returnSubmitResult.statusLabel) && (
                  <div className="od-meta-list od-return-success-meta">
                    {returnSubmitResult.returnCode && <MetaRow label="Kode Retur" value={returnSubmitResult.returnCode} />}
                    {returnSubmitResult.statusLabel && <MetaRow label="Status" value={returnSubmitResult.statusLabel} />}
                  </div>
                )}
                <div className="od-modal-footer" style={{ border: 'none', padding: '20px 0 0' }}>
                  <button type="button" className="od-btn-secondary" onClick={() => resetReturnWizard(detail)}>
                    Tutup
                  </button>
                  {returnSubmitResult.returnCode && (
                    <Link
                      href={`/customer/profile/return/detail/${encodeURIComponent(returnSubmitResult.returnCode)}`}
                      className="od-btn-primary"
                      style={{ textAlign: 'center', textDecoration: 'none' }}
                    >
                      Lihat Detail Retur
                    </Link>
                  )}
                </div>
              </div>
            ) : (
            <>
            <div className="od-return-steps-bar">
              {RETURN_STEP_LABELS.map((label, i) => {
                const stepNum = i + 1;
                const state = returnStep === stepNum ? 'active' : returnStep > stepNum ? 'done' : 'pending';
                return (
                  <Fragment key={label}>
                    <span className={`od-return-step-num od-return-step-num--${state}`}>
                      {returnStep > stepNum ? <IconCheck /> : stepNum}
                    </span>
                    {i < RETURN_STEP_LABELS.length - 1 && (
                      <span className={`od-return-step-track${returnStep > stepNum ? ' od-return-step-track--done' : ''}`} />
                    )}
                  </Fragment>
                );
              })}
            </div>
            <p className="od-return-step-current">
              Langkah {returnStep} dari {RETURN_STEP_LABELS.length} · {RETURN_STEP_LABELS[returnStep - 1]}
            </p>

            <div className="od-modal-body">
              {/* STEP 1 — items + reason (digabung) */}
              {returnStep === 1 && (
                <>
                  <p className="od-field-label">Pilih produk dan jumlah pcs yang ingin diretur</p>
                  <div className="od-return-product-list">
                    {(detail.items || []).map((item) => (
                      <div key={item.id} className="od-return-product-row">
                        <div className="od-return-product-img">
                          {item.image ? (
                            <img src={fileUrl(item.image)} alt={item.product_name} />
                          ) : (
                            <span>{(item.product_name || '?')[0]}</span>
                          )}
                        </div>
                        <div className="od-return-product-info">
                          <p className="od-return-product-name">{item.product_name}</p>
                          <p className="od-return-product-price">Rp {formatRibuan(item.product_price)} · dibeli {item.quantity} pcs</p>
                        </div>
                        <div className="od-qty-stepper">
                          <button
                            type="button"
                            className="od-qty-btn"
                            disabled={Number(returnSelections[item.id] || 0) <= 0}
                            onClick={() => handleReturnQtyChange(item.id, String(Math.max(0, Number(returnSelections[item.id] || 0) - 1)), item.quantity)}
                          >
                            <IconMinus />
                          </button>
                          <span className="od-qty-val">{returnSelections[item.id] || 0}</span>
                          <button
                            type="button"
                            className="od-qty-btn"
                            disabled={Number(returnSelections[item.id] || 0) >= (item.quantity || 0)}
                            onClick={() => handleReturnQtyChange(item.id, String(Math.min(item.quantity || 0, Number(returnSelections[item.id] || 0) + 1)), item.quantity)}
                          >
                            <IconPlus />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {selectedReturnItems.length > 0 && (
                    <div className="od-return-reason-section">
                      <p className="od-field-label">Pilih alasan retur</p>
                      <div className="od-reason-chips">
                        {RETURN_REASON_OPTIONS.map((option) => (
                          <button
                            key={option}
                            type="button"
                            className={`od-reason-chip${returnReason === option ? ' od-reason-chip--active' : ''}`}
                            onClick={() => setReturnReason(option)}
                          >
                            {returnReason === option && <IconCheck />}
                            {option}
                          </button>
                        ))}
                      </div>
                      {returnReason === 'Lainnya' && (
                        <textarea
                          className="od-textarea"
                          style={{ marginTop: 10 }}
                          rows={3}
                          placeholder="Ceritakan alasanmu di sini..."
                          value={returnReasonCustom}
                          onChange={(e) => setReturnReasonCustom(e.target.value)}
                        />
                      )}
                    </div>
                  )}
                </>
              )}

              {/* STEP 2 — product photo */}
              {returnStep === 2 && (
                <>
                  <div className="od-warning-banner">
                    <IconAlert size={20} />
                    <div>
                      <p className="od-warning-title">Foto harus jelas</p>
                      <p className="od-warning-desc">Pastikan foto menunjukkan kondisi produk secara lengkap. Foto buram atau gelap bisa menyebabkan pengajuan ditolak.</p>
                    </div>
                  </div>
                  <p className="od-field-label" style={{ marginTop: 14 }}>Upload foto produk</p>
                  <label className={`od-dropzone${productPhoto ? ' od-dropzone--filled' : ''}`}>
                    <input type="file" accept={PROOF_IMAGE_ACCEPT} onChange={handleProductPhotoChange} hidden />
                    {productPhoto ? (
                      <div className="od-file-chip">
                        <IconImage /> {productPhoto.name}
                        <span className="od-file-ok"><IconCheck /></span>
                      </div>
                    ) : (
                      <div className="od-dropzone-empty">
                        <IconUploadCloud />
                        <p>Klik untuk pilih foto</p>
                        <p className="od-dropzone-hint">JPG, PNG, atau WebP</p>
                      </div>
                    )}
                  </label>
                </>
              )}

              {/* STEP 3 — receipt */}
              {returnStep === 3 && (
                <>
                  <p className="od-field-label">Upload e-receipt / bukti pembelian</p>
                  <div className="od-info-banner">
                    <IconReceipt />
                    <p>Mohon upload e-receipt resmi dari careofyou ya.</p>
                  </div>
                  <label className={`od-dropzone${receiptProof ? ' od-dropzone--filled' : ''}`}>
                    <input type="file" accept={RECEIPT_PDF_ACCEPT} onChange={handleReceiptProofChange} hidden />
                    {receiptProof ? (
                      <div className="od-file-chip">
                        <IconReceipt /> {receiptProof.name}
                        <span className="od-file-ok"><IconCheck /></span>
                      </div>
                    ) : (
                      <div className="od-dropzone-empty">
                        <IconUploadCloud />
                        <p>Klik untuk pilih file</p>
                        <p className="od-dropzone-hint">PDF saja — maks 5 MB</p>
                      </div>
                    )}
                  </label>
                </>
              )}

              {/* STEP 4 — resolution type */}
              {returnStep === 4 && (
                <>
                  <p className="od-field-label">Pilih jenis penyelesaian retur</p>
                  <div className="od-radio-group">
                    <label className={`od-radio-option${returnResolutionType === 'refund' ? ' od-radio-option--active' : ''}`}>
                      <input type="radio" name="resolution" value="refund" checked={returnResolutionType === 'refund'} onChange={(e) => setReturnResolutionType(e.target.value)} hidden />
                      <span className="od-radio-dot" />
                      Refund
                    </label>
                    <label className={`od-radio-option${returnResolutionType === 'exchange' ? ' od-radio-option--active' : ''}`}>
                      <input type="radio" name="resolution" value="exchange" checked={returnResolutionType === 'exchange'} onChange={(e) => setReturnResolutionType(e.target.value)} hidden />
                      <span className="od-radio-dot" />
                      Exchange (Tukar Produk)
                    </label>
                  </div>
                </>
              )}

              {/* STEP 5 — confirm */}
              {returnStep === 5 && (
                <>
                  {returnResolutionType === 'refund' && (
                    <>
                      <p className="od-field-label">Data rekening untuk refund</p>
                      <input
                        type="text"
                        className="od-input"
                        placeholder="Nama bank"
                        value={refundForm.bank_name}
                        onChange={(e) => setRefundForm((cur) => ({ ...cur, bank_name: e.target.value }))}
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        className="od-input"
                        placeholder="Nomor rekening"
                        value={refundForm.account_number}
                        onChange={(e) => setRefundForm((cur) => ({ ...cur, account_number: e.target.value }))}
                      />
                      <input
                        type="text"
                        className="od-input"
                        placeholder="Nama pemilik rekening"
                        value={refundForm.account_holder_name}
                        onChange={(e) => setRefundForm((cur) => ({ ...cur, account_holder_name: e.target.value }))}
                      />
                    </>
                  )}

                  {returnResolutionType === 'exchange' && (
                    <>
                      <p className="od-field-label">Kurir &amp; alamat exchange</p>
                      <select
                        className="od-select"
                        value={exchangeForm.exchange_courier_id}
                        onChange={(e) => setExchangeForm((cur) => ({ ...cur, exchange_courier_id: e.target.value }))}
                      >
                        <option value="">Pilih kurir</option>
                        {EXCHANGE_COURIERS.map((courier) => (
                          <option key={courier.id} value={courier.id}>{courier.name}</option>
                        ))}
                      </select>

                      {addressesLoading && <p className="od-meta-note">Memuat alamat customer...</p>}
                      {!addressesLoading && addresses.length === 0 && (
                        <p className="od-meta-note">
                          Belum ada alamat tersimpan. Tambah dulu di{' '}
                          <Link href="/customer/profile/address">halaman address</Link>.
                        </p>
                      )}
                      {!addressesLoading && addresses.length > 0 && (
                        <select
                          className="od-select"
                          value={exchangeForm.exchange_address_id}
                          onChange={(e) => setExchangeForm((cur) => ({ ...cur, exchange_address_id: e.target.value }))}
                        >
                          <option value="">Pilih alamat</option>
                          {addresses.map((address) => (
                            <option key={address.id} value={address.id}>{address.label} - {address.recipient_name}</option>
                          ))}
                        </select>
                      )}

                      {selectedExchangeAddress && (
                        <div className="od-meta-list" style={{ marginTop: 10 }}>
                          <MetaRow label="Penerima" value={selectedExchangeAddress.recipient_name || '-'} />
                          <MetaRow label="Alamat" value={selectedExchangeAddress.address_line || '-'} />
                          <MetaRow label="Kota" value={selectedExchangeAddress.city || '-'} />
                        </div>
                      )}
                    </>
                  )}

                  <div className="od-confirm-summary">
                    <p className="od-field-label">Ringkasan retur</p>
                    <ul className="od-confirm-list">
                      {selectedReturnItems.map((item) => (
                        <li key={item.order_item_id}>{item.product_name}: {item.quantity} pcs</li>
                      ))}
                    </ul>
                    <p className="od-meta-note">Tipe penyelesaian: <strong>{returnResolutionType || '-'}</strong></p>
                  </div>
                </>
              )}
            </div>

            <div className="od-modal-footer">
              <button
                type="button"
                className="od-btn-secondary"
                disabled={submittingReturn}
                onClick={() => (returnStep === 1 ? resetReturnWizard(detail) : setReturnStep((cur) => cur - 1))}
              >
                {returnStep === 1 ? 'Batal' : 'Kembali'}
              </button>

              {returnStep < 5 && (
                <button
                  type="button"
                  className="od-btn-primary"
                  disabled={
                    (returnStep === 1 && !canContinueStep1) ||
                    (returnStep === 2 && !canContinueStep2) ||
                    (returnStep === 3 && !canContinueStep3) ||
                    (returnStep === 4 && !canContinueStep4)
                  }
                  onClick={() => setReturnStep((cur) => cur + 1)}
                >
                  Lanjut
                </button>
              )}
              {returnStep === 5 && (
                <button type="button" className="od-btn-primary" disabled={!canSubmitStep5} onClick={handleSubmitReturn}>
                  {submittingReturn ? 'Mengirim...' : 'Kirim ke Admin'}
                </button>
              )}
            </div>
            </>
            )}
          </div>
        </div>
      )}

      <ImagePreviewModal preview={imagePreview} onClose={closeImagePreview} />
      <ReceiptPreviewModal open={showReceiptPreview} onClose={() => setShowReceiptPreview(false)} detail={detail} />
    </div>
  );
}
