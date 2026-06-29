'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiUrl, mediaUrl } from '@/api';
import jsQR from 'jsqr';
import styles from './page.module.css';
import './page.css';

const API = apiUrl('/api/admin/retur');

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

// Warna pill — presentasi saja; nilai status/risk tetap dari backend.
const STATUS_COLORS = {
  waiting_admin_review: { color: '#e09a3a', bg: 'rgba(224,154,58,0.12)' },
  approved: { color: '#16a34a', bg: 'rgba(34,197,94,0.12)' },
  rejected: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  cancelled: { color: '#9ca3af', bg: 'rgba(156,163,175,0.14)' },
  shipped_back: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  received: { color: '#4a9fd4', bg: 'rgba(74,159,212,0.12)' },
  completed: { color: '#16a34a', bg: 'rgba(34,197,94,0.12)' },
};

const RISK_COLORS = {
  low: { label: 'Rendah', color: '#16a34a', bg: 'rgba(34,197,94,0.1)' },
  medium: { label: 'Sedang', color: '#e09a3a', bg: 'rgba(224,154,58,0.12)' },
  high: { label: 'Tinggi', color: '#ef6c2f', bg: 'rgba(239,108,47,0.12)' },
  critical: { label: 'Kritis', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};

function getAdminUser() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(window.localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

function gaugeColor(level) {
  return RISK_COLORS[level]?.color || '#c4706a';
}

// Gauge skor risiko melingkar (SVG) — pakai monitoringTotalScore (0-100).
function RiskGauge({ score, level }) {
  const pct = Math.max(0, Math.min(100, Number(score) || 0));
  const r = 34;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = gaugeColor(level);
  return (
    <svg width="96" height="96" viewBox="0 0 92 92" className="adm-rd-gauge">
      <circle cx="46" cy="46" r={r} fill="none" stroke="#f1e3e1" strokeWidth="9" />
      <circle
        cx="46"
        cy="46"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        transform="rotate(-90 46 46)"
      />
      <text x="46" y="44" textAnchor="middle" fontSize="23" fontWeight="800" fill="#2d2d2d">{pct}</text>
      <text x="46" y="60" textAnchor="middle" fontSize="10" fontWeight="600" fill="#b0a8a6">/ 100</text>
    </svg>
  );
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getRiskLevelLabel(level) {
  switch (level) {
    case 'critical':
    case 'high':
      return 'Tinggi';
    case 'medium':
      return 'Sedang';
    default:
      return 'Rendah';
  }
}

function describeReturnDeviceRisk(device) {
  const status = device.device_status || '';
  switch (status) {
    case 'same_order_device':
      return 'Perangkat retur sama dengan perangkat saat order.';
    case 'different_known_device':
      return 'Perangkat retur berbeda, tapi masih termasuk perangkat yang pernah dipakai.';
    case 'different_new_trusted_device':
      return 'Perangkat retur berbeda dan trusted device ini masih baru.';
    case 'different_unregistered_device':
      return 'Perangkat retur berbeda dan belum dikenali sebagai perangkat tepercaya.';
    default:
      return 'Status perangkat retur belum tersedia.';
  }
}

function summarizeReturnDeviceRisk(device) {
  const status = device.device_status || '';
  switch (status) {
    case 'same_order_device':
      return 'Perangkat retur sama dengan perangkat saat order.';
    case 'different_known_device':
      return 'Perangkat berbeda, tapi masih pernah dipakai.';
    case 'different_new_trusted_device':
      return 'Perangkat berbeda dan trusted device ini masih baru.';
    case 'different_unregistered_device':
      return 'Perangkat berbeda dan belum masuk trusted device.';
    default:
      return 'Status perangkat belum tersedia.';
  }
}

function describeReturnPasswordRisk(password) {
  const count = toNumber(password.password_count);
  if (count <= 0) return 'Tidak ada percobaan password yang gagal sebelum retur dibuat.';
  if (count === 1) return 'Ada 1 kali salah password sebelum retur dibuat.';
  if (count === 2) return 'Ada 2 kali salah password sebelum retur dibuat.';
  return 'Ada 3 kali atau lebih salah password sebelum retur dibuat.';
}

function summarizeReturnPasswordRisk(password) {
  const count = toNumber(password.password_count);
  if (count <= 0) return 'Tidak ada salah password.';
  if (count === 1) return 'Ada 1x salah password.';
  if (count === 2) return 'Ada 2x salah password.';
  return 'Ada 3x atau lebih salah password.';
}

function describeReturnOtpRisk(otp) {
  const count = toNumber(otp.otp_count);
  if (count <= 0) return 'Tidak ada percobaan OTP yang gagal sebelum retur dibuat.';
  if (count === 1) return 'Ada 1 kali gagal OTP sebelum retur dibuat.';
  if (count === 2) return 'Ada 2 kali gagal OTP sebelum retur dibuat.';
  return 'Ada 3 kali atau lebih gagal OTP sebelum retur dibuat.';
}

function summarizeReturnOtpRisk(otp) {
  const count = toNumber(otp.otp_count);
  if (count <= 0) return 'Tidak ada gagal OTP.';
  if (count === 1) return 'Ada 1x gagal OTP.';
  if (count === 2) return 'Ada 2x gagal OTP.';
  return 'Ada 3x atau lebih gagal OTP.';
}

function describeExchangeAddressRisk(exchangeAddress) {
  const status = exchangeAddress.exchange_address_status || '';
  switch (status) {
    case 'same_exchange_address':
      return 'Alamat tukar sama dengan alamat pengiriman awal.';
    case 'different_exchange_address':
      return 'Alamat tukar berbeda dari alamat pengiriman awal.';
    default:
      return 'Faktor alamat exchange tidak dipakai untuk retur ini.';
  }
}

function summarizeExchangeAddressRisk(exchangeAddress) {
  const status = exchangeAddress.exchange_address_status || '';
  switch (status) {
    case 'same_exchange_address':
      return 'Alamat tukar sama dengan alamat awal.';
    case 'different_exchange_address':
      return 'Alamat tukar berbeda dari alamat awal.';
    default:
      return 'Tidak memakai alamat exchange.';
  }
}

function describeReturnTimingRisk(returnTiming) {
  const status = returnTiming.return_timing_status || '';
  switch (status) {
    case 'fast_return_timing':
      return 'Retur diajukan sangat cepat setelah order selesai.';
    case 'same_day_return_timing':
      return 'Retur diajukan di hari yang sama setelah order selesai.';
    default:
      return 'Retur diajukan tidak terlalu cepat.';
  }
}

function summarizeReturnTimingRisk(returnTiming) {
  const status = returnTiming.return_timing_status || '';
  switch (status) {
    case 'fast_return_timing':
      return 'Retur diajukan sangat cepat.';
    case 'same_day_return_timing':
      return 'Retur diajukan di hari yang sama.';
    default:
      return 'Retur diajukan dengan jeda yang wajar.';
  }
}

function buildReturnMonitoringInsights(monitoring, resolutionType) {
  const device = monitoring.device || {};
  const password = monitoring.password || {};
  const otp = monitoring.otp || {};
  const exchangeAddress = monitoring.exchange_address || {};
  const returnTiming = monitoring.return_timing || {};
  const items = [
    {
      id: 'device',
      title: 'Device',
      statusLabel: device.device_status_label || '',
      description: describeReturnDeviceRisk(device),
      summary: summarizeReturnDeviceRisk(device),
      score: toNumber(device.device_score),
    },
    {
      id: 'password',
      title: 'Password',
      statusLabel: password.password_status_label || '',
      description: describeReturnPasswordRisk(password),
      summary: summarizeReturnPasswordRisk(password),
      score: toNumber(password.password_score),
    },
    {
      id: 'otp',
      title: 'OTP',
      statusLabel: otp.otp_status_label || '',
      description: describeReturnOtpRisk(otp),
      summary: summarizeReturnOtpRisk(otp),
      score: toNumber(otp.otp_score),
    },
  ];

  if (resolutionType === 'exchange') {
    items.push({
      id: 'exchange-address',
      title: 'Alamat Exchange',
      statusLabel: exchangeAddress.exchange_address_status_label || '',
      description: describeExchangeAddressRisk(exchangeAddress),
      summary: summarizeExchangeAddressRisk(exchangeAddress),
      score: toNumber(exchangeAddress.exchange_address_score),
    });
  }

  items.push({
    id: 'return-timing',
    title: 'Timing Retur',
    statusLabel: returnTiming.return_timing_status_label || '',
    description: describeReturnTimingRisk(returnTiming),
    summary: summarizeReturnTimingRisk(returnTiming),
    score: toNumber(returnTiming.return_timing_score),
  });

  return items;
}

function getOtpCountdown(nextOtp) {
  return Math.max(0, Number(nextOtp?.resend_after_seconds ?? nextOtp?.expires_in_seconds ?? 0) || 0);
}

function formatOtpCountdown(totalSeconds) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, '0');
  const seconds = String(safeSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function buildOtpViewState(otpState, countdownSeconds) {
  if (!otpState) return null;

  const safeCountdown = Math.max(0, Number(countdownSeconds) || 0);
  const verifyAllowed = Boolean(otpState.verify_allowed) && safeCountdown > 0;
  const resendAllowed = Boolean(otpState.resend_allowed) || safeCountdown === 0;
  let status = otpState.status || 'missing';

  if (!verifyAllowed && resendAllowed && (status === 'active' || status === 'locked')) {
    status = 'expired';
  }

  return {
    ...otpState,
    status,
    verify_allowed: verifyAllowed,
    resend_allowed: resendAllowed,
    is_expired: Boolean(otpState.is_expired) || status === 'expired',
    expires_in_seconds: safeCountdown,
    resend_after_seconds: resendAllowed ? 0 : safeCountdown,
    countdown_label: formatOtpCountdown(safeCountdown),
  };
}

function IconShield() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 4v5c0 5-3.5 8.5-7 9-3.5-.5-7-4-7-9V7l7-4z" />
      <path d="M9.5 12.5l1.75 1.75L14.5 11" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function OtpInput({ value, onChange, disabled }) {
  const inputRefs = useRef([]);
  const digits = Array.from({ length: 6 }, (_, index) => value[index] ?? '');

  useEffect(() => {
    if (!disabled) {
      inputRefs.current[0]?.focus();
    }
  }, [disabled]);

  function commit(nextDigits) {
    onChange(nextDigits.join(''));
  }

  function handleChange(index, rawValue) {
    const nextChar = rawValue.replace(/\D/g, '').slice(-1);
    const nextDigits = [...digits];
    nextDigits[index] = nextChar;
    commit(nextDigits);

    if (nextChar && index < inputRefs.current.length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index, event) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }

    if (event.key === 'ArrowRight' && index < inputRefs.current.length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(event) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    event.preventDefault();
    const nextDigits = Array.from({ length: 6 }, (_, index) => pasted[index] ?? '');
    commit(nextDigits);
    inputRefs.current[Math.min(Math.max(pasted.length - 1, 0), 5)]?.focus();
  }

  return (
    <div className={styles.otpInputRow} onPaste={handlePaste}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(node) => {
            inputRefs.current[index] = node;
          }}
          className={styles.otpInput}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          aria-label={`Digit OTP ${index + 1}`}
        />
      ))}
    </div>
  );
}

function OtpModal({
  open,
  onClose,
  kicker,
  email,
  otp,
  otpState,
  onOtpChange,
  onSubmit,
  onResend,
  loading,
  error,
}) {
  if (!open) return null;
  const otpInputDisabled = loading || !otpState?.verify_allowed;

  return (
    <div className={styles.otpModal} role="presentation">
      <div className={styles.otpModalBackdrop} onClick={onClose} />

      <div className={styles.otpDialog} role="dialog" aria-modal="true" aria-labelledby="otp-title">
        <button type="button" className={styles.otpCloseBtn} onClick={onClose} aria-label="Tutup popup OTP">
          <IconClose />
        </button>

        <div className={styles.otpHeader}>
          <div className={styles.otpIconWrap}>
            <IconShield />
          </div>
          <div className={styles.otpHeaderCopy}>
            <p className={styles.otpKicker}>{kicker}</p>
            <h3 id="otp-title" className={styles.otpTitle}>Masukkan OTP 6 digit</h3>
            <p className={styles.otpSubtitle}>
              Kode verifikasi sudah dikirim ke {email || 'email admin'}. Silakan cek inbox atau folder spam.
            </p>
          </div>
        </div>

        <form className={styles.otpForm} onSubmit={onSubmit}>
          <OtpInput value={otp} onChange={onOtpChange} disabled={otpInputDisabled} />

          {error ? <p className={`${styles.otpFeedback} ${styles.otpFeedbackError}`}>{error}</p> : null}

          <div className={styles.otpActions}>
            <button
              type="button"
              className={styles.otpSecondaryBtn}
              onClick={onResend}
              disabled={loading || !otpState?.resend_allowed}
            >
              {otpState?.resend_allowed ? 'Kirim ulang kode' : `Kirim ulang (${otpState?.countdown_label || '00:00'})`}
            </button>
            <button
              type="submit"
              className={styles.otpPrimaryBtn}
              disabled={loading || otp.length !== 6 || !otpState?.verify_allowed}
            >
              {loading ? <span className={styles.otpSpinner} /> : 'Verifikasi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReasonModal({ open, action, value, onChange, onSubmit, onCancel, error }) {
  if (!open) return null;
  const isReject = action === 'reject';

  return (
    <div className={styles.otpModal} role="presentation">
      <div className={styles.otpModalBackdrop} onClick={onCancel} />

      <div className={styles.otpDialog} role="dialog" aria-modal="true">
        <button type="button" className={styles.otpCloseBtn} onClick={onCancel} aria-label="Tutup">
          <IconClose />
        </button>

        <div className={styles.otpHeaderCopy}>
          <p className={styles.otpKicker}>{isReject ? 'Reject Retur' : 'Approve Retur'}</p>
          <h3 className={styles.otpTitle}>{isReject ? 'Alasan Reject' : 'Catatan Approve'}</h3>
          <p className={styles.otpSubtitle}>
            {isReject
              ? 'Wajib diisi. Alasan ini jadi catatan keputusan & terlihat customer.'
              : 'Opsional. Boleh dikosongkan.'}
          </p>
        </div>

        <form className={styles.otpForm} onSubmit={onSubmit}>
          <textarea
            className={styles.reasonTextarea}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={isReject ? 'Contoh: Bukti kerusakan tidak sesuai pengajuan...' : 'Catatan (opsional)'}
            rows={4}
            autoFocus
          />

          {error ? <p className={`${styles.otpFeedback} ${styles.otpFeedbackError}`}>{error}</p> : null}

          <div className={styles.otpActions}>
            <button type="button" className={styles.otpSecondaryBtn} onClick={onCancel}>
              Batal
            </button>
            <button type="submit" className={styles.otpPrimaryBtn}>
              {isReject ? 'Lanjut Reject' : 'Lanjut Approve'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Pesan validasi per-produk. result_code datang dari backend (verify_qr_token):
// not_found = token bukan hasil generate Careofyou; wrong_product = QR milik
// produk lain; dst. UI hanya menerjemahkan kode dari backend, tidak bikin aturan.
function scanFeedback(code, backendMsg) {
  switch (code) {
    case 'wrong_product':
      return { ok: false, text: 'QR ini tidak sesuai — terdaftar pada produk lain.' };
    case 'not_found':
      return { ok: false, text: 'QR ini tidak sesuai — bukan hasil generate Careofyou.' };
    case 'already_returned':
      return { ok: false, text: 'QR ini sudah pernah dikembalikan sebelumnya.' };
    case 'wrong_unit':
      return { ok: false, text: 'QR ini untuk unit lain dari produk yang sama.' };
    default:
      return { ok: false, text: backendMsg || 'QR ini tidak sesuai.' };
  }
}

function CameraScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const streamRef = useRef(null);
  const [camErr, setCamErr] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [foundCode, setFoundCode] = useState(null);
  const [manualToken, setManualToken] = useState('');

  useEffect(() => {
    let alive = true;
    let timer = null;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        timer = setTimeout(() => {
          if (alive) setScanning(true);
        }, 1500);
      })
      .catch((err) => {
        if (!alive) return;
        setCamErr('Tidak dapat mengakses kamera: ' + (err.message || err));
      });
    return () => {
      alive = false;
      clearTimeout(timer);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    if (!scanning || foundCode) return undefined;
    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const ctx = canvas.getContext('2d');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'attemptBoth' });
      if (code?.data) {
        cancelAnimationFrame(rafRef.current);
        setFoundCode(code.data);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [scanning, foundCode]);

  function stopStream() {
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }

  function confirmScan() {
    stopStream();
    onScan(foundCode);
  }

  function retryScan() {
    setFoundCode(null);
    setScanning(false);
    setTimeout(() => setScanning(true), 400);
  }

  function submitManual() {
    const val = manualToken.trim();
    if (!val) return;
    stopStream();
    onScan(val);
  }

  return (
    <div className="adm-cam-overlay" role="presentation" onClick={onClose}>
      <div className="adm-cam-modal" onClick={(e) => e.stopPropagation()}>
        <div className="adm-cam-header">
          <span className="adm-cam-title">
            <span className="adm-cam-title-ico">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><line x1="14" y1="14" x2="14" y2="14" /><path d="M14 14h3v3" /><path d="M21 14v7h-7" /><path d="M17 21v-4" />
              </svg>
            </span>
            Scan QR Produk
          </span>
          <button type="button" className="adm-cam-close" onClick={onClose} aria-label="Tutup">✕</button>
        </div>

        <div className="adm-cam-body">
          {camErr ? (
            <div className="adm-cam-error">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="adm-cam-error-msg">{camErr}</p>
              <button type="button" className="adm-cam-err-btn" onClick={onClose}>Tutup</button>
            </div>
          ) : foundCode ? (
            <div className="adm-cam-found">
              <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <p className="adm-cam-found-title">QR Terdeteksi</p>
              <code className="adm-cam-found-token">{foundCode}</code>
              <div className="adm-cam-found-btns">
                <button type="button" className="adm-cam-manual-btn" onClick={confirmScan}>Gunakan Token Ini</button>
                <button type="button" className="adm-cam-err-btn adm-cam-err-btn--ghost" onClick={retryScan}>Scan Ulang</button>
              </div>
            </div>
          ) : (
            <div className="adm-cam-viewfinder">
              <video ref={videoRef} className="adm-cam-video" muted playsInline />
              <canvas ref={canvasRef} className="adm-cam-canvas" />
              <div className="adm-cam-frame">
                <span className="adm-cam-corner adm-cam-corner--tl" />
                <span className="adm-cam-corner adm-cam-corner--tr" />
                <span className="adm-cam-corner adm-cam-corner--bl" />
                <span className="adm-cam-corner adm-cam-corner--br" />
                {scanning && <div className="adm-cam-scanline" />}
              </div>
              {!scanning && (
                <div className="adm-cam-preparing">
                  <svg className="adm-cam-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  <span>Mempersiapkan kamera…</span>
                </div>
              )}
            </div>
          )}
        </div>

        {!foundCode && !camErr && (
          <>
            <p className="adm-cam-hint">
              {scanning ? 'Arahkan kamera ke QR code produk' : 'Mempersiapkan kamera…'}
            </p>
            <div className="adm-cam-manual">
              <input
                className="adm-cam-manual-input"
                type="text"
                placeholder="Atau ketik / tempel token QR..."
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitManual(); }}
              />
              <button type="button" className="adm-cam-manual-btn" onClick={submitManual} disabled={!manualToken.trim()}>
                Konfirmasi
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminReturnDetailPage() {
  const params = useParams();
  const returnCode = decodeURIComponent(params?.returnCode || '');
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [receiptMessage, setReceiptMessage] = useState('');
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpAction, setOtpAction] = useState('approve');
  const [otpSessionId, setOtpSessionId] = useState('');
  const [otpValue, setOtpValue] = useState('');
  const [otpEmail, setOtpEmail] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpState, setOtpState] = useState(null);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const liveOtpState = buildOtpViewState(otpState, otpCountdown);
  const [qrUnits, setQrUnits] = useState([]);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState('');
  const [qrMessage, setQrMessage] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanItem, setScanItem] = useState(null);
  const [refundFile, setRefundFile] = useState(null);
  const [refundPreview, setRefundPreview] = useState(null);
  const [refundDrag, setRefundDrag] = useState(false);
  const [exchangeTracking, setExchangeTracking] = useState('');
  const [scanResultByItem, setScanResultByItem] = useState({});
  const [photoPreview, setPhotoPreview] = useState(null);
  const [reasonModalOpen, setReasonModalOpen] = useState(false);
  const [reasonAction, setReasonAction] = useState('approve');
  const [reasonValue, setReasonValue] = useState('');
  const [reasonError, setReasonError] = useState('');

  useEffect(() => {
    if (!otpModalOpen || otpCountdown <= 0) return undefined;

    const timerId = window.setInterval(() => {
      setOtpCountdown((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [otpModalOpen, otpCountdown > 0]);

  useEffect(() => {
    if (detail?.status === 'shipped_back') {
      loadQrUnits();
    }
  }, [detail?.status]);

  function syncOtpState(nextOtp) {
    if (!nextOtp) {
      setOtpState(null);
      setOtpCountdown(0);
      return;
    }
    setOtpState(nextOtp);
    setOtpCountdown(getOtpCountdown(nextOtp));
  }

  async function loadDetail() {
    const res = await fetch(`${API}/detail?return_code=${encodeURIComponent(returnCode)}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Gagal mengambil detail retur.');
    }
    setDetail(data);
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

  function closeOtpModal() {
    setOtpModalOpen(false);
    setOtpValue('');
    setOtpError('');
    syncOtpState(null);
  }

  async function refreshDetail() {
    try {
      await loadDetail();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Gagal memuat ulang detail retur.');
    }
  }

  async function loadQrUnits() {
    setQrLoading(true);
    try {
      const res = await fetch(`${API}/qr/units?return_code=${encodeURIComponent(returnCode)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengambil data unit QR.');
      }
      setQrUnits(data.items || []);
    } catch (err) {
      console.error(err);
      setQrError(err.message || 'Gagal mengambil data unit QR.');
    } finally {
      setQrLoading(false);
    }
  }

  function openScanner(item) {
    setScanItem(item);
    setQrError('');
    setQrMessage('');
    setScannerOpen(true);
  }

  async function handleScanned(token) {
    setScannerOpen(false);
    if (!scanItem) return;

    const adminUser = getAdminUser();
    if (!adminUser?.id || adminUser.role !== 'admin') {
      setQrError('User admin tidak ditemukan. Silakan login ulang sebagai admin.');
      return;
    }

    const itemId = scanItem.return_item_id;
    const itemName = scanItem.product_name;
    setQrLoading(true);
    setQrError('');
    setQrMessage('');

    const setItemFeedback = (fb) => setScanResultByItem((prev) => ({ ...prev, [itemId]: fb }));

    try {
      const verify = await postAction(`${API}/qr/verify`, {
        return_code: detail.return_code,
        order_item_id: scanItem.order_item_id,
        qr_token: token,
        scanned_by: adminUser.id,
      });

      const code = verify.data.result_code || (verify.data.is_valid ? 'valid' : 'invalid');

      // QR tidak sesuai -> TIDAK dihitung valid; tombol "Tandai Diterima" tetap mati.
      if (!verify.res.ok || !verify.data.is_valid) {
        setItemFeedback(scanFeedback(code, verify.data.message || verify.data.error));
        return;
      }

      const approve = await postAction(`${API}/qr/approve`, {
        unit_id: verify.data.unit_id,
        approved_by: adminUser.id,
      });
      if (!approve.res.ok) {
        setItemFeedback({ ok: false, text: approve.data.error || 'Gagal menandai unit kembali.' });
        return;
      }

      // Valid: unit ditandai is_returned di backend, lalu data di-refresh.
      setItemFeedback({ ok: true, text: 'QR sesuai — unit ditandai diterima.' });
      setQrMessage(`Produk "${itemName}" valid & ditandai diterima.`);
      await loadQrUnits();
      await refreshDetail();
    } catch (err) {
      console.error(err);
      setItemFeedback({ ok: false, text: 'Gagal memproses QR.' });
    } finally {
      setQrLoading(false);
    }
  }

  async function handleReceive() {
    if (actionLoading) return;

    const adminUser = getAdminUser();
    if (!adminUser?.id || adminUser.role !== 'admin') {
      setError('User admin tidak ditemukan. Silakan login ulang sebagai admin.');
      return;
    }

    setActionLoading(true);
    setError('');
    setMessage('');

    try {
      const { res, data } = await postAction(`${API}/receive`, {
        return_code: detail.return_code,
        admin_user_id: adminUser.id,
      });
      if (!res.ok) {
        if (data.return_entry) setDetail(data.return_entry);
        throw new Error(data.error || 'Gagal menandai diterima.');
      }
      setDetail(data.return_entry || null);
      setMessage(data.message || 'Produk retur ditandai diterima.');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Gagal menandai diterima.');
    } finally {
      setActionLoading(false);
    }
  }

  function pickRefundFile(file) {
    setRefundFile(file || null);
    setRefundPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file && file.type && file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    });
  }

  function handleRefundDrop(event) {
    event.preventDefault();
    setRefundDrag(false);
    const file = event.dataTransfer.files?.[0];
    if (file) pickRefundFile(file);
  }

  async function handleComplete(event) {
    event?.preventDefault();
    if (actionLoading) return;

    const adminUser = getAdminUser();
    if (!adminUser?.id || adminUser.role !== 'admin') {
      setError('User admin tidak ditemukan. Silakan login ulang sebagai admin.');
      return;
    }

    setActionLoading(true);
    setError('');
    setMessage('');

    try {
      let res;
      let data;
      if (detail.resolution_type === 'refund') {
        if (!refundFile) {
          setError('Bukti transfer refund wajib diupload.');
          setActionLoading(false);
          return;
        }
        const formData = new FormData();
        formData.append('return_code', detail.return_code);
        formData.append('admin_user_id', adminUser.id);
        formData.append('refund_proof', refundFile);
        res = await fetch(`${API}/complete`, { method: 'POST', body: formData });
        data = await res.json();
      } else {
        if (!exchangeTracking.trim()) {
          setError('Resi barang pengganti wajib diisi.');
          setActionLoading(false);
          return;
        }
        const result = await postAction(`${API}/complete`, {
          return_code: detail.return_code,
          admin_user_id: adminUser.id,
          exchange_shipment_tracking: exchangeTracking.trim(),
        });
        res = result.res;
        data = result.data;
      }

      if (!res.ok) {
        throw new Error(data.error || 'Gagal menyelesaikan retur.');
      }
      setDetail(data.return_entry || null);
      setMessage(data.message || 'Retur berhasil diselesaikan.');
      setRefundFile(null);
      setRefundPreview(null);
      setExchangeTracking('');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Gagal menyelesaikan retur.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleVerifyOtp(event) {
    event?.preventDefault();
    if (actionLoading) return;

    const adminUser = getAdminUser();
    if (!adminUser?.id || adminUser.role !== 'admin') {
      setOtpError('User admin tidak ditemukan. Silakan login ulang sebagai admin.');
      return;
    }

    setActionLoading(true);
    setOtpError('');

    try {
      const { res, data } = await postAction(`${API}/${otpAction}/confirm`, {
        action_session_id: otpSessionId,
        admin_user_id: adminUser.id,
        otp: otpValue,
      });

      if (res.ok) {
        setOtpModalOpen(false);
        syncOtpState(null);
        setDetail(data.return_entry || null);
        setMessage(data.message || `Retur berhasil di-${otpAction}.`);
        return;
      }

      if (data.otp) {
        syncOtpState(data.otp);
      }
      setOtpValue('');
      setOtpError(data.error || 'Verifikasi OTP gagal.');
    } catch (err) {
      console.error(err);
      setOtpError('Tidak bisa terhubung ke server. Coba lagi sebentar.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleResendOtp() {
    if (actionLoading) return;

    const adminUser = getAdminUser();
    if (!adminUser?.id || adminUser.role !== 'admin') {
      setOtpError('User admin tidak ditemukan. Silakan login ulang sebagai admin.');
      return;
    }

    setActionLoading(true);
    setOtpError('');

    try {
      const { res, data } = await postAction(`${API}/${otpAction}/resend`, {
        action_session_id: otpSessionId,
        admin_user_id: adminUser.id,
      });

      if (!res.ok) {
        if (data.otp) {
          syncOtpState(data.otp);
        }
        setOtpError(data.error || 'Gagal mengirim ulang OTP.');
        return;
      }

      setOtpValue('');
      syncOtpState(data.otp);
    } catch (err) {
      console.error(err);
      setOtpError('Tidak bisa terhubung ke server. Coba lagi sebentar.');
    } finally {
      setActionLoading(false);
    }
  }

  function handleAction(action) {
    if (!detail?.return_code || actionLoading) return;

    const adminUser = getAdminUser();
    if (!adminUser?.id || adminUser.role !== 'admin') {
      setError('User admin tidak ditemukan. Silakan login ulang sebagai admin.');
      return;
    }

    setReasonAction(action);
    setReasonValue(detail.decision_reason || '');
    setReasonError('');
    setError('');
    setMessage('');
    setReasonModalOpen(true);
  }

  function submitReason(event) {
    event?.preventDefault();
    const trimmed = reasonValue.trim();
    if (reasonAction === 'reject' && !trimmed) {
      setReasonError('Alasan reject wajib diisi.');
      return;
    }
    setReasonModalOpen(false);
    setReasonError('');
    runAction(reasonAction, trimmed);
  }

  async function runAction(action, decisionReason) {
    const adminUser = getAdminUser();
    if (!adminUser?.id || adminUser.role !== 'admin') {
      setError('User admin tidak ditemukan. Silakan login ulang sebagai admin.');
      return;
    }

    setActionLoading(true);
    setError('');
    setMessage('');

    try {
      const result = await postAction(`${API}/${action}`, {
        return_code: detail.return_code,
        admin_user_id: adminUser.id,
        decision_reason: decisionReason,
      });
      const data = result.data;

      if (data.otp_required) {
        setActionLoading(false);
        setOtpAction(action);
        setOtpSessionId(data.action_session_id);
        setOtpEmail(adminUser.email || '');
        setOtpValue('');
        setOtpError('');
        syncOtpState(data.otp);
        setOtpModalOpen(true);
        return;
      }

      if (!result.res.ok) {
        throw new Error(data.error || `Gagal ${action} retur.`);
      }

      setDetail(data.return_entry || null);
      setMessage(data.message || `Retur berhasil di-${action}.`);
    } catch (err) {
      console.error(err);
      setError(err.message || `Gagal ${action} retur.`);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleVerifyReceipt() {
    if (!detail?.return_code || receiptLoading) return;

    const adminUser = getAdminUser();
    if (!adminUser?.id || adminUser.role !== 'admin') {
      setError('User admin tidak ditemukan. Silakan login ulang sebagai admin.');
      return;
    }

    setReceiptLoading(true);
    setError('');
    setReceiptMessage('');

    try {
      const res = await fetch(`${API}/ereceipt/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          return_code: detail.return_code,
          admin_user_id: adminUser.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal memverifikasi e-receipt.');
      }
      setDetail(data.return_entry || null);
      setReceiptMessage(data.message || 'Verifikasi e-receipt selesai.');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Gagal memverifikasi e-receipt.');
    } finally {
      setReceiptLoading(false);
    }
  }

  useEffect(() => {
    loadDetail()
      .catch((err) => {
        console.error(err);
        setError(err.message || 'Gagal mengambil detail retur.');
      })
      .finally(() => setLoading(false));
  }, [returnCode]);

  const refundInfo = detail?.refund_info || {};
  const exchangeInfo = detail?.exchange_info || {};
  const receiptVerification = detail?.ereceipt_verification || {};
  const monitoring = detail?.monitoring || {};
  const monitoringDevice = monitoring.device || {};
  const monitoringSummary = monitoring.summary || {};
  const monitoringInsights = buildReturnMonitoringInsights(monitoring, detail?.resolution_type);
  const monitoringHighlights = monitoringInsights
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);
  const monitoringRiskLevel = monitoringSummary.risk_level || detail?.risk_level || 'low';
  const headStatus = STATUS_COLORS[detail?.status] || { color: '#c4706a', bg: 'rgba(214,134,124,0.12)' };
  const headRisk = RISK_COLORS[detail?.risk_level] || { label: detail?.risk_level || '-', color: '#9ca3af', bg: 'rgba(156,163,175,0.14)' };
  const monitoringTotalScore = toNumber(monitoringSummary.total_risk_score ?? detail?.total_risk_score);
  const maxFactorScore = Math.max(1, ...monitoringHighlights.map((h) => Number(h.score) || 0));
  const ereceiptChecked = Boolean(receiptVerification.status);
  // Verifikasi QR: hitung dari data backend (unit yang sudah is_returned = valid).
  const validCountFor = (item) => (item.units || []).filter((u) => u.is_returned).length;
  const requiredFor = (item) => item.requested_quantity || 0;
  const itemQrDone = (item) => validCountFor(item) >= requiredFor(item);
  const totalValid = (qrUnits || []).reduce((sum, item) => sum + validCountFor(item), 0);
  const totalRequired = (qrUnits || []).reduce((sum, item) => sum + requiredFor(item), 0);
  const allValid = (qrUnits || []).length > 0 && (qrUnits || []).every(itemQrDone);
  // Flow berurutan: produk pertama yang belum lengkap = produk yang sedang aktif.
  const currentQrIndex = (() => {
    const idx = (qrUnits || []).findIndex((item) => !itemQrDone(item));
    return idx === -1 ? (qrUnits || []).length - 1 : idx;
  })();
  const currentQrItem = (qrUnits || [])[currentQrIndex] || null;

  // Saat status "Menunggu Review Admin", kolom kiri minim (Pengiriman Balik &
  // Penyelesaian belum muncul) -> Item Retur dipindah ke kiri biar seimbang.
  const isAdminReview = detail?.status === 'waiting_admin_review';
  const itemReturSection = (
    <section className="adm-rd-card adm-rd-card--wide">
      <h3 className="adm-rd-card-title">Item Retur</h3>
      <div className="adm-rd-items">
        {(detail?.items || []).map((item, index) => (
          <div key={item.id || index} className="adm-rd-item">
            <span className="adm-rd-item-ico">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </span>
            <div className="adm-rd-item-info">
              <span className="adm-rd-item-name">{item.product_name || '-'}</span>
              <span className="adm-rd-item-meta">Retur {item.quantity || 0} dari {item.ordered_quantity || 0} dibeli</span>
            </div>
            <span className="adm-rd-item-qty">×{item.quantity || 0}</span>
            <span className="adm-rd-item-price">Rp {formatRibuan(item.subtotal)}</span>
          </div>
        ))}
        {(detail?.items || []).length === 0 && (
          <div className="adm-rd-item-empty">Tidak ada item retur.</div>
        )}
      </div>
      {(detail?.items || []).length > 0 && (
        <div className="adm-rd-item-total">
          <span>Total Refund</span>
          <span className="adm-rd-item-total-val">
            Rp {formatRibuan((detail?.items || []).reduce((sum, it) => sum + (Number(it.subtotal) || 0), 0))}
          </span>
        </div>
      )}
    </section>
  );

  return (
    <div className="adm-rd-page">
      <div className="adm-rd-inner">
        <Link href="/admin/retur" className="adm-rd-back">← Kembali ke daftar retur</Link>
        <div className="adm-rd-content">
          <h2 className="adm-rd-title">Detail Retur</h2>

          {loading && <p className="adm-rd-feedback">Memuat detail retur...</p>}
          {error && <p className="adm-rd-feedback adm-rd-feedback--error">{error}</p>}
          {message && <p className="adm-rd-feedback adm-rd-feedback--ok">{message}</p>}
          {receiptMessage && <p className="adm-rd-feedback adm-rd-feedback--info">{receiptMessage}</p>}

      {detail && (
        <>
        <div className="adm-rd-head">
          <div className="adm-rd-head-left">
            <span className="adm-rd-code">{detail.return_code || '-'}</span>
            <p className="adm-rd-head-sub">
              Order {detail.order_code || '-'} · Diajukan {formatTanggal(detail.created_at)}
            </p>
          </div>
          <div className="adm-rd-head-right">
            <div className="adm-rd-head-customer">
              <span className="adm-rd-avatar">{initials(detail.customer_name)}</span>
              <div className="adm-rd-head-cust-meta">
                <span className="adm-rd-cust-name">{detail.customer_name || '-'}</span>
                {detail.customer_email && <span className="adm-rd-cust-email">{detail.customer_email}</span>}
              </div>
            </div>
            <div className="adm-rd-head-badges">
              <span className="adm-rd-pill" style={{ color: headStatus.color, background: headStatus.bg }}>
                {detail.status_label || detail.status || '-'}
              </span>
              <span className="adm-rd-pill" style={{ color: headRisk.color, background: headRisk.bg }}>
                Risiko {headRisk.label}
              </span>
              {detail.resolution_type_label && (
                <span className="adm-rd-pill adm-rd-pill--type">{detail.resolution_type_label}</span>
              )}
            </div>
          </div>
        </div>

        <div className="adm-rd-grid">
          <div className="adm-rd-col adm-rd-col--left">
          <section className="adm-rd-card">
          <h3 className="adm-rd-card-title">Verifikasi E-Receipt</h3>
          {/* Status banner */}
          <div
            className={`adm-rd-rv-banner${
              receiptVerification.status === 'valid'
                ? ' adm-rd-rv-banner--valid'
                : receiptVerification.status === 'invalid'
                  ? ' adm-rd-rv-banner--invalid'
                  : ' adm-rd-rv-banner--pending'
            }`}
          >
            <span className="adm-rd-rv-ico">
              {receiptVerification.status === 'valid' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              ) : receiptVerification.status === 'invalid' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              )}
            </span>
            <div className="adm-rd-rv-text">
              <span className="adm-rd-rv-status">
                {receiptVerification.status === 'valid'
                  ? 'E-Receipt Valid'
                  : receiptVerification.status === 'invalid'
                    ? 'E-Receipt Tidak Valid'
                    : 'Belum Diverifikasi'}
              </span>
              <span className="adm-rd-rv-sub">
                {receiptVerification.status === 'valid'
                  ? 'Tanda tangan digital cocok dengan database.'
                  : receiptVerification.status === 'invalid'
                    ? (receiptVerification.failure_reason || 'Data e-receipt tidak cocok dengan database.')
                    : 'Periksa keaslian e-receipt yang dilampirkan customer.'}
              </span>
            </div>
          </div>

          {/* Detail verifikasi (kalau sudah pernah dicek) */}
          {receiptVerification.status && (
            <div className="adm-rd-metalist">
              <div className="adm-rd-metarow"><span>Receipt ID</span><span>{receiptVerification.receipt_id || '-'}</span></div>
              <div className="adm-rd-metarow"><span>PDF Order Code</span><span>{receiptVerification.pdf_order_code || '-'}</span></div>
              <div className="adm-rd-metarow"><span>Nama Pelanggan</span><span>{receiptVerification.customer_name || '-'}</span></div>
              <div className="adm-rd-metarow"><span>Email Pelanggan</span><span>{receiptVerification.customer_email || '-'}</span></div>
              <div className="adm-rd-metarow"><span>Total</span><span>{receiptVerification.total ? `Rp ${formatRibuan(receiptVerification.total)}` : '-'}</span></div>
              <div className="adm-rd-metarow"><span>Generated At</span><span>{formatTanggal(receiptVerification.generated_at)}</span></div>
              <div className="adm-rd-metarow"><span>Diverifikasi Pada</span><span>{formatTanggal(receiptVerification.verified_at)}</span></div>
              <div className="adm-rd-metarow"><span>Diverifikasi Oleh</span><span>{receiptVerification.verified_by_name || '-'}</span></div>
            </div>
          )}

          {detail.ereceipt_proof ? (
            <button type="button" onClick={handleVerifyReceipt} disabled={receiptLoading}>
              {receiptLoading
                ? 'Memverifikasi...'
                : receiptVerification.status
                  ? 'Periksa Ulang E-Receipt'
                  : 'Verifikasi E-Receipt'}
            </button>
          ) : (
            <p>Customer belum melampirkan e-receipt.</p>
          )}
          </section>

          {detail.resolution_type === 'refund' && (
            <section className="adm-rd-card">
              <h3 className="adm-rd-card-title">Info Refund</h3>
              <div className="adm-rd-bank">
                <div className="adm-rd-bank-top">
                  <span className="adm-rd-bank-ico">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /><line x1="6" y1="15" x2="10" y2="15" />
                    </svg>
                  </span>
                  <div className="adm-rd-bank-head">
                    <span className="adm-rd-bank-label">Rekening Tujuan Refund</span>
                    <span className="adm-rd-bank-name">{refundInfo.bank_name || '-'}</span>
                  </div>
                </div>
                <div className="adm-rd-bank-acc">
                  <span className="adm-rd-bank-acc-num">{refundInfo.account_number || '-'}</span>
                </div>
                <div className="adm-rd-bank-holder">a.n. {refundInfo.account_holder_name || '-'}</div>
              </div>
            </section>
          )}

          {detail.resolution_type === 'exchange' && (
            <section className="adm-rd-card">
              <h3 className="adm-rd-card-title">Info Exchange</h3>
              <div className="adm-rd-ship">
                <span className="adm-rd-ship-ico">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="3" width="15" height="13" rx="1" /><path d="M16 8h4l3 5v3h-7V8z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
                  </svg>
                </span>
                <div className="adm-rd-ship-info">
                  <span className="adm-rd-ship-label">Kurir Pengiriman Exchange</span>
                  <span className="adm-rd-ship-courier">{exchangeInfo.courier_name || '-'}</span>
                </div>
              </div>

              <div className="adm-rd-addr">
                <div className="adm-rd-addr-head">
                  <span className="adm-rd-addr-label">Alamat Tujuan</span>
                  {exchangeInfo.address_label && <span className="adm-rd-addr-badge">{exchangeInfo.address_label}</span>}
                </div>
                <span className="adm-rd-addr-name">
                  {exchangeInfo.recipient_name || '-'}{exchangeInfo.phone ? ` · ${exchangeInfo.phone}` : ''}
                </span>
                <p className="adm-rd-addr-text">
                  {[exchangeInfo.address_line, exchangeInfo.city, exchangeInfo.province, exchangeInfo.postal_code].filter(Boolean).join(', ') || '-'}
                </p>
                {exchangeInfo.notes && <p className="adm-rd-addr-note">Catatan: {exchangeInfo.notes}</p>}
              </div>
            </section>
          )}

          {['shipped_back', 'received', 'completed'].includes(detail.status) && (
            <section className="adm-rd-card">
              <h3 className="adm-rd-card-title">Pengiriman Balik dari Customer</h3>
              <div className="adm-rd-ship">
                <span className="adm-rd-ship-ico">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="3" width="15" height="13" rx="1" /><path d="M16 8h4l3 5v3h-7V8z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
                  </svg>
                </span>
                <div className="adm-rd-ship-info">
                  <span className="adm-rd-ship-label">Kurir Pengembalian</span>
                  <span className="adm-rd-ship-courier">{detail.return_shipment?.courier_name || '-'}</span>
                  <div className="adm-rd-ship-resi">
                    <span className="adm-rd-ship-resi-label">No. Resi</span>
                    <span className="adm-rd-ship-resi-num">{detail.return_shipment?.tracking_number || '-'}</span>
                  </div>
                </div>
              </div>

              <div className="adm-rd-metalist">
                <div className="adm-rd-metarow"><span>Dikirim Pada</span><span>{formatTanggal(detail.return_shipment?.shipped_back_at)}</span></div>
                <div className="adm-rd-metarow"><span>Diterima Oleh</span><span>{detail.received_by_name || '-'}</span></div>
                <div className="adm-rd-metarow"><span>Diterima Pada</span><span>{formatTanggal(detail.received_at)}</span></div>
              </div>
            </section>
          )}

          {detail.status === 'shipped_back' && (
            <section className="adm-rd-card adm-rd-card--wide">
              <h3 className="adm-rd-card-title">Verifikasi QR Unit (Scan Barang Balik)</h3>
              {qrError && <p className="adm-rd-qr-msg adm-rd-qr-msg--err">{qrError}</p>}

              {(qrUnits || []).length === 0 ? (
                <div className="adm-rd-qr-empty">
                  {qrLoading ? 'Memuat unit...' : 'Belum ada unit QR — pastikan QR sudah digenerate di pesanannya.'}
                </div>
              ) : (
                <>
                  {/* Progress keseluruhan (valid) */}
                  <div className="adm-rd-qr-progress">
                    <div className="adm-rd-qr-progress-top">
                      <span className="adm-rd-qr-progress-label">Progress Verifikasi</span>
                      <span className="adm-rd-qr-progress-count"><strong>{totalValid}</strong> / {totalRequired} unit valid</span>
                    </div>
                    <div className="adm-rd-qr-bar">
                      <span style={{ width: `${totalRequired ? Math.min(100, (totalValid / totalRequired) * 100) : 0}%` }} />
                    </div>
                  </div>

                  {/* Stepper urutan produk */}
                  <div className="adm-rd-qr-steps">
                    {(qrUnits || []).map((item, i) => {
                      const done = itemQrDone(item);
                      const isCurrent = i === currentQrIndex && !allValid;
                      return (
                        <div
                          key={item.return_item_id}
                          className={`adm-rd-qr-step${done ? ' adm-rd-qr-step--done' : ''}${isCurrent ? ' adm-rd-qr-step--current' : ''}`}
                          title={item.product_name}
                        >
                          <span className="adm-rd-qr-step-dot">
                            {done ? (
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                            ) : (i + 1)}
                          </span>
                          {i < (qrUnits || []).length - 1 && <span className="adm-rd-qr-step-line" />}
                        </div>
                      );
                    })}
                  </div>

                  {allValid ? (
                    <div className="adm-rd-qr-allok">
                      <span className="adm-rd-qr-allok-ico">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      </span>
                      <div className="adm-rd-qr-allok-text">
                        <span className="adm-rd-qr-allok-title">Semua produk sudah diverifikasi</span>
                        <span className="adm-rd-qr-allok-sub">{totalValid}/{totalRequired} unit valid. Lanjut tandai diterima.</span>
                      </div>
                    </div>
                  ) : currentQrItem && (
                    <div className="adm-rd-qr-current">
                      <span className="adm-rd-qr-current-step">Produk {currentQrIndex + 1} dari {(qrUnits || []).length}</span>
                      <span className="adm-rd-qr-current-name">{currentQrItem.product_name}</span>
                      <span className="adm-rd-qr-current-count">
                        Unit valid: <strong>{validCountFor(currentQrItem)}</strong> / {requiredFor(currentQrItem)}
                      </span>

                      {scanResultByItem[currentQrItem.return_item_id] && (
                        <div className={`adm-rd-qr-feedback${scanResultByItem[currentQrItem.return_item_id].ok ? ' adm-rd-qr-feedback--ok' : ' adm-rd-qr-feedback--err'}`}>
                          <span className="adm-rd-qr-feedback-ico">
                            {scanResultByItem[currentQrItem.return_item_id].ok ? (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                            ) : (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            )}
                          </span>
                          {scanResultByItem[currentQrItem.return_item_id].text}
                        </div>
                      )}

                      <button type="button" className="adm-rd-qr-scanbtn adm-rd-qr-scanbtn--lg" onClick={() => openScanner(currentQrItem)} disabled={qrLoading}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3" /><path d="M21 14v7h-7" /><path d="M17 21v-4" />
                        </svg>
                        {qrLoading ? 'Memproses...' : 'Scan QR Produk Ini'}
                      </button>
                      <span className="adm-rd-qr-hint">
                        Scan QR untuk <strong>{currentQrItem.product_name}</strong>. QR produk lain atau di luar Careofyou akan ditolak.
                      </span>
                    </div>
                  )}

                  {/* Aksi */}
                  <div className="adm-rd-qr-action">
                    <button type="button" className="adm-rd-qr-receivebtn" onClick={handleReceive} disabled={actionLoading || !allValid}>
                      {actionLoading ? 'Memproses...' : 'Tandai Diterima'}
                    </button>
                    {!allValid && (
                      <span className="adm-rd-qr-note">Semua produk wajib discan &amp; valid dulu ({totalValid}/{totalRequired}).</span>
                    )}
                  </div>
                </>
              )}
            </section>
          )}

          {detail.status === 'received' && (
            <section className="adm-rd-card">
              <h3 className="adm-rd-card-title">Selesaikan Retur ({detail.resolution_type_label || detail.resolution_type})</h3>
              <form onSubmit={handleComplete}>
                {detail.resolution_type === 'refund' ? (
                  <div className="adm-rd-field">
                    <span className="adm-rd-field-label">Bukti Transfer Refund</span>
                    <label
                      className={`adm-rd-drop${refundDrag ? ' adm-rd-drop--drag' : ''}${refundFile ? ' adm-rd-drop--filled' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); setRefundDrag(true); }}
                      onDragLeave={() => setRefundDrag(false)}
                      onDrop={handleRefundDrop}
                    >
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        style={{ display: 'none' }}
                        onChange={(e) => pickRefundFile(e.target.files?.[0] || null)}
                      />
                      {refundFile ? (
                        <div className="adm-rd-drop-file">
                          {refundPreview ? (
                            <img src={refundPreview} alt="preview" className="adm-rd-drop-thumb" />
                          ) : (
                            <span className="adm-rd-drop-fileico">
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                              </svg>
                            </span>
                          )}
                          <div className="adm-rd-drop-fileinfo">
                            <span className="adm-rd-drop-filename">✓ {refundFile.name}</span>
                            <span className="adm-rd-drop-filehint">Ketuk untuk ganti</span>
                          </div>
                        </div>
                      ) : (
                        <div className="adm-rd-drop-empty">
                          <span className="adm-rd-drop-ico">
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                          </span>
                          <span className="adm-rd-drop-text">Drag &amp; drop bukti transfer</span>
                          <span className="adm-rd-drop-sub">atau klik untuk pilih (gambar / PDF)</span>
                        </div>
                      )}
                    </label>
                  </div>
                ) : (
                  <div className="adm-rd-field">
                    <span className="adm-rd-field-label">Resi Barang Pengganti</span>
                    <input
                      type="text"
                      value={exchangeTracking}
                      onChange={(e) => setExchangeTracking(e.target.value)}
                      placeholder="No resi pengiriman exchange"
                    />
                  </div>
                )}
                <button type="submit" className="adm-rd-complete-btn" disabled={actionLoading}>
                  {actionLoading ? 'Memproses...' : 'Selesaikan Retur'}
                </button>
              </form>
            </section>
          )}

          {detail.status === 'completed' && (
            <section className="adm-rd-card">
              <h3 className="adm-rd-card-title">Penyelesaian</h3>
              <div className="adm-rd-rv-banner adm-rd-rv-banner--valid">
                <span className="adm-rd-rv-ico">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </span>
                <div className="adm-rd-rv-text">
                  <span className="adm-rd-rv-status">Retur Selesai</span>
                  <span className="adm-rd-rv-sub">
                    {detail.resolution_type === 'refund'
                      ? 'Refund sudah ditransfer ke customer.'
                      : 'Barang pengganti sudah dikirim ke customer.'}
                  </span>
                </div>
              </div>

              {detail.resolution_type === 'refund' && (
                <div className="adm-rd-files">
                  {detail.completion?.refund_proof ? (
                    <a className="adm-rd-filebtn" href={fileUrl(detail.completion.refund_proof)} target="_blank" rel="noreferrer">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                      </svg>
                      Bukti Transfer Refund
                    </a>
                  ) : (
                    <span className="adm-rd-files-empty">Bukti transfer belum ada.</span>
                  )}
                </div>
              )}

              <div className="adm-rd-metalist">
                {detail.resolution_type !== 'refund' && (
                  <div className="adm-rd-metarow"><span>Resi Barang Pengganti</span><span className="adm-rd-mono">{detail.completion?.exchange_shipment_tracking || '-'}</span></div>
                )}
                <div className="adm-rd-metarow"><span>Diselesaikan Oleh</span><span>{detail.completion?.completed_by_name || '-'}</span></div>
                <div className="adm-rd-metarow"><span>Diselesaikan Pada</span><span>{formatTanggal(detail.completion?.completed_at)}</span></div>
              </div>
            </section>
          )}

          {detail.status === 'waiting_admin_review' && (
            <section className="adm-rd-card">
              <h3 className="adm-rd-card-title">Keputusan Admin</h3>
              <p style={{ marginTop: 0 }}>
              <button
                type="button"
                onClick={() => handleAction('approve')}
                disabled={actionLoading || !ereceiptChecked}
              >
                {actionLoading ? 'Memproses...' : 'Approve'}
              </button>{' '}
              <button type="button" onClick={() => handleAction('reject')} disabled={actionLoading}>
                Reject
              </button>
              {!ereceiptChecked && (
                <span style={{ marginLeft: 8, color: '#a00' }}>
                  (Verifikasi e-receipt dulu sebelum bisa approve.)
                </span>
              )}
              </p>
            </section>
          )}

          {isAdminReview && itemReturSection}
          </div>

          <div className="adm-rd-col adm-rd-col--right">
          <section className="adm-rd-card">
          <h3 className="adm-rd-card-title">Info Retur</h3>
          {/* Alasan customer */}
          <div className="adm-rd-quote">
            <span className="adm-rd-quote-ico">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7.17 6A5 5 0 0 0 3 11v5a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H5.5a3.5 3.5 0 0 1 3-3.46A1 1 0 0 0 9 4.6 1 1 0 0 0 7.9 4 5 5 0 0 0 7.17 6Zm12 0A5 5 0 0 0 15 11v5a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1h-3.5a3.5 3.5 0 0 1 3-3.46A1 1 0 0 0 21 4.6 1 1 0 0 0 19.9 4a5 5 0 0 0-.73 2Z" />
              </svg>
            </span>
            <div className="adm-rd-quote-body">
              <span className="adm-rd-quote-label">Alasan Customer</span>
              <p className="adm-rd-quote-text">&ldquo;{detail.reason || '-'}&rdquo;</p>
            </div>
          </div>

          {/* Status OTP / verifikasi */}
          <div className="adm-rd-chips">
            <span className={`adm-rd-chip${detail.approve_requires_otp ? ' adm-rd-chip--warn' : ' adm-rd-chip--mute'}`}>
              Approve · {detail.approve_requires_otp ? 'butuh OTP' : 'tanpa OTP'}
            </span>
            <span className={`adm-rd-chip${detail.reject_requires_otp ? ' adm-rd-chip--warn' : ' adm-rd-chip--mute'}`}>
              Reject · {detail.reject_requires_otp ? 'butuh OTP' : 'tanpa OTP'}
            </span>
            <span className={`adm-rd-chip${detail.otp_verified_for_action ? ' adm-rd-chip--ok' : ' adm-rd-chip--mute'}`}>
              {detail.otp_verified_for_action ? '✓ OTP terverifikasi' : 'OTP belum diverifikasi'}
            </span>
          </div>

          {/* Meta pemrosesan */}
          <div className="adm-rd-metalist">
            <div className="adm-rd-metarow"><span>Diajukan Pada</span><span>{formatTanggal(detail.created_at)}</span></div>
            <div className="adm-rd-metarow"><span>Diproses Pada</span><span>{formatTanggal(detail.processed_at)}</span></div>
            <div className="adm-rd-metarow"><span>Diproses Oleh</span><span>{detail.processed_by_name || '-'}</span></div>
            <div className="adm-rd-metarow"><span>Catatan Admin</span><span>{detail.decision_reason || '-'}</span></div>
          </div>

          {/* Lampiran */}
          <div className="adm-rd-files">
            {detail.product_photo && (
              <button type="button" className="adm-rd-filebtn" onClick={() => setPhotoPreview(fileUrl(detail.product_photo))}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
                </svg>
                Foto Produk
              </button>
            )}
            {detail.ereceipt_proof && (
              <a className="adm-rd-filebtn" href={fileUrl(detail.ereceipt_proof)} target="_blank" rel="noreferrer">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                </svg>
                E-Receipt
              </a>
            )}
            {!detail.product_photo && !detail.ereceipt_proof && (
              <span className="adm-rd-files-empty">Tidak ada lampiran.</span>
            )}
          </div>
          </section>

          {detail.monitoring && (
            <section className="adm-rd-card adm-rd-side-card">
              <h3 className="adm-rd-card-title">Pemantauan Risiko</h3>

              {/* Gauge skor risiko */}
              <div className="adm-rd-gauge-wrap">
                <RiskGauge score={monitoringTotalScore} level={monitoringRiskLevel} />
                <div className="adm-rd-gauge-meta">
                  <span
                    className="adm-rd-gauge-level"
                    style={{ color: gaugeColor(monitoringRiskLevel), background: (RISK_COLORS[monitoringRiskLevel]?.bg || 'rgba(214,134,124,0.12)') }}
                  >
                    Risiko {getRiskLevelLabel(monitoringRiskLevel)}
                  </span>
                  <span className="adm-rd-gauge-cap">Skor Risiko / Fraud</span>
                  <span className="adm-rd-gauge-note">
                    {monitoringHighlights.length > 0
                      ? `${monitoringHighlights.length} faktor menambah skor`
                      : 'Tidak ada faktor menonjol'}
                  </span>
                </div>
              </div>

              {/* Device */}
              <div className="adm-rd-devicebox">
                <span className="adm-rd-device-ico">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </span>
                <div className="adm-rd-device-meta">
                  <span className="adm-rd-device-name">{monitoringDevice.device_label_snapshot || 'Device tidak diketahui'}</span>
                  <span className="adm-rd-device-status">{monitoringDevice.device_status_label || 'Status device tidak tersedia'}</span>
                </div>
              </div>

              {/* Faktor yang menambah skor — pakai bar */}
              {monitoringHighlights.length > 0 && (
                <div className="adm-rd-factors">
                  <p className="adm-rd-sub">Faktor yang Menambah Skor</p>
                  {monitoringHighlights.map((item) => (
                    <div key={item.id} className="adm-rd-factor">
                      <div className="adm-rd-factor-top">
                        <span className="adm-rd-factor-name">{item.title}</span>
                        <span className="adm-rd-factor-score">+{item.score}</span>
                      </div>
                      <div className="adm-rd-factor-bar">
                        <span style={{ width: `${Math.min(100, ((Number(item.score) || 0) / maxFactorScore) * 100)}%` }} />
                      </div>
                      {item.summary && <span className="adm-rd-factor-desc">{item.summary}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Detail pemantauan — list ringkas */}
              <div className="adm-rd-insights">
                <p className="adm-rd-sub">Detail Pemantauan</p>
                {monitoringInsights.map((item) => (
                  <div key={item.id} className="adm-rd-insight">
                    <div className="adm-rd-insight-top">
                      <span className="adm-rd-insight-name">{item.title}</span>
                      <span className={`adm-rd-insight-score${(Number(item.score) || 0) > 0 ? ' adm-rd-insight-score--on' : ''}`}>
                        {item.score}
                      </span>
                    </div>
                    {item.statusLabel && <span className="adm-rd-insight-status">{item.statusLabel}</span>}
                    {item.description && <span className="adm-rd-insight-desc">{item.description}</span>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {!isAdminReview && itemReturSection}
          </div>
        </div>
        </>
      )}
        </div>

        <OtpModal
        open={otpModalOpen}
        onClose={closeOtpModal}
        kicker={`Verifikasi ${otpAction === 'approve' ? 'Approve' : 'Reject'} Retur`}
        email={otpEmail}
        otp={otpValue}
        otpState={liveOtpState}
        onOtpChange={setOtpValue}
        onSubmit={handleVerifyOtp}
        onResend={handleResendOtp}
        loading={actionLoading}
        error={otpError}
      />

      <ReasonModal
        open={reasonModalOpen}
        action={reasonAction}
        value={reasonValue}
        onChange={setReasonValue}
        onSubmit={submitReason}
        onCancel={() => setReasonModalOpen(false)}
        error={reasonError}
      />

        {scannerOpen && (
          <CameraScanner onScan={handleScanned} onClose={() => setScannerOpen(false)} />
        )}

        {photoPreview && (
          <div className="adm-rd-photo-backdrop" role="presentation" onClick={() => setPhotoPreview(null)}>
            <div className="adm-rd-photo-modal" role="dialog" aria-modal="true" aria-label="Foto Produk" onClick={(e) => e.stopPropagation()}>
              <div className="adm-rd-photo-head">
                <strong>Foto Produk</strong>
                <button type="button" className="adm-rd-photo-close" onClick={() => setPhotoPreview(null)} aria-label="Tutup">×</button>
              </div>
              <div className="adm-rd-photo-body">
                <img src={photoPreview} alt="Foto Produk" className="adm-rd-photo-img" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
