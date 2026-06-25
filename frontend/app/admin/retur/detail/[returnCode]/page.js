'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiUrl, mediaUrl } from '@/api';
import jsQR from 'jsqr';
import styles from './page.module.css';

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
    <div className={styles.camOverlay} role="presentation" onClick={onClose}>
      <div className={styles.camModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.camHeader}>
          <span className={styles.camTitle}>Scan QR Produk</span>
          <button type="button" className={styles.camClose} onClick={onClose} aria-label="Tutup">
            ✕
          </button>
        </div>

        <div className={styles.camBody}>
          {camErr ? (
            <div className={styles.camError}>
              <p>{camErr}</p>
              <button type="button" onClick={onClose}>Tutup</button>
            </div>
          ) : foundCode ? (
            <div className={styles.camFound}>
              <p><b>QR Terdeteksi</b></p>
              <code className={styles.camToken}>{foundCode}</code>
              <div className={styles.camFoundBtns}>
                <button type="button" onClick={confirmScan}>Gunakan Token Ini</button>
                <button type="button" onClick={retryScan}>Scan Ulang</button>
              </div>
            </div>
          ) : (
            <div className={styles.camViewfinder}>
              <video ref={videoRef} className={styles.camVideo} muted playsInline />
              <canvas ref={canvasRef} className={styles.camCanvas} />
              {!scanning && <div className={styles.camPreparing}>Mempersiapkan kamera…</div>}
            </div>
          )}
        </div>

        {!foundCode && !camErr && (
          <>
            <p className={styles.camHint}>
              {scanning ? 'Arahkan kamera ke QR code produk' : 'Mempersiapkan kamera…'}
            </p>
            <div className={styles.camManual}>
              <input
                className={styles.camManualInput}
                type="text"
                placeholder="Atau ketik / tempel token QR..."
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitManual(); }}
              />
              <button type="button" onClick={submitManual} disabled={!manualToken.trim()}>
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
  const [exchangeTracking, setExchangeTracking] = useState('');
  const [scannedByItem, setScannedByItem] = useState({});
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
    setQrLoading(true);
    setQrError('');
    setQrMessage('');

    try {
      const verify = await postAction(`${API}/qr/verify`, {
        return_code: detail.return_code,
        order_item_id: scanItem.order_item_id,
        qr_token: token,
        scanned_by: adminUser.id,
      });

      // Token dihitung sebagai "sudah discan" — valid maupun invalid (rule: semua harus discan).
      setScannedByItem((prev) => {
        const next = { ...prev };
        const set = new Set(next[itemId] || []);
        set.add(token);
        next[itemId] = set;
        return next;
      });

      if (!verify.res.ok || !verify.data.is_valid) {
        setQrError((verify.data.message || verify.data.error || 'QR tidak valid') + ' — tetap dihitung sudah discan.');
        return;
      }

      const approve = await postAction(`${API}/qr/approve`, {
        unit_id: verify.data.unit_id,
        approved_by: adminUser.id,
      });
      if (!approve.res.ok) {
        setQrError(approve.data.error || 'Gagal menandai unit kembali.');
        return;
      }

      setQrMessage('Unit valid & ditandai kembali.');
      await loadQrUnits();
      await refreshDetail();
    } catch (err) {
      console.error(err);
      setQrError('Gagal memproses QR.');
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
  const ereceiptChecked = Boolean(receiptVerification.status);
  const scannedCountFor = (item) => (scannedByItem[item.return_item_id]?.size || 0);
  const totalScanned = (qrUnits || []).reduce((sum, item) => sum + scannedCountFor(item), 0);
  const totalRequired = (qrUnits || []).reduce((sum, item) => sum + (item.requested_quantity || 0), 0);
  const allScanned = (qrUnits || []).length > 0
    && (qrUnits || []).every((item) => scannedCountFor(item) >= (item.requested_quantity || 0));

  return (
    <div style={{ padding: 16 }}>
      <h2>Detail Retur</h2>

      {loading && <p>Memuat detail retur...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {message && <p style={{ color: 'green' }}>{message}</p>}
      {receiptMessage && <p style={{ color: '#355f7d' }}>{receiptMessage}</p>}

      {detail && (
        <>
          <h3 style={{ marginTop: 20 }}>Info Retur</h3>
          <DataTable>
            <tbody>
              <tr>
                <td>Kode Retur</td>
                <td>{detail.return_code || '-'}</td>
              </tr>
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
                <td>{detail.status_label || detail.status || '-'}</td>
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
                <td>OTP Diverifikasi</td>
                <td>{detail.otp_verified_for_action ? 'Ya' : 'Tidak'}</td>
              </tr>
              <tr>
                <td>Tipe Penyelesaian</td>
                <td>{detail.resolution_type_label || detail.resolution_type || '-'}</td>
              </tr>
              <tr>
                <td>Diajukan Pada</td>
                <td>{formatTanggal(detail.created_at)}</td>
              </tr>
              <tr>
                <td>Diproses Pada</td>
                <td>{formatTanggal(detail.processed_at)}</td>
              </tr>
              <tr>
                <td>Diproses Oleh</td>
                <td>{detail.processed_by_name || '-'}</td>
              </tr>
              <tr>
                <td>Alasan Customer</td>
                <td>{detail.reason || '-'}</td>
              </tr>
              <tr>
                <td>Catatan Admin</td>
                <td>{detail.decision_reason || '-'}</td>
              </tr>
              <tr>
                <td>Foto Produk</td>
                <td>
                  {detail.product_photo ? (
                    <a href={fileUrl(detail.product_photo)} target="_blank" rel="noreferrer">
                      Lihat Foto
                    </a>
                  ) : '-'}
                </td>
              </tr>
              <tr>
                <td>E-Receipt Upload</td>
                <td>
                  {detail.ereceipt_proof ? (
                    <a href={fileUrl(detail.ereceipt_proof)} target="_blank" rel="noreferrer">
                      Lihat File
                    </a>
                  ) : '-'}
                </td>
              </tr>
            </tbody>
          </DataTable>

          <h3 style={{ marginTop: 24 }}>Verifikasi E-Receipt</h3>
          <DataTable>
            <tbody>
              <tr>
                <td>Status Verifikasi</td>
                <td>
                  {receiptVerification.status === 'valid'
                    ? 'Valid'
                    : receiptVerification.status === 'invalid'
                      ? 'Invalid'
                      : 'Belum dicek'}
                </td>
              </tr>
              <tr>
                <td>Diverifikasi Pada</td>
                <td>{formatTanggal(receiptVerification.verified_at)}</td>
              </tr>
              <tr>
                <td>Diverifikasi Oleh</td>
                <td>{receiptVerification.verified_by_name || '-'}</td>
              </tr>
              <tr>
                <td>Receipt ID</td>
                <td>{receiptVerification.receipt_id || '-'}</td>
              </tr>
              <tr>
                <td>PDF Order Code</td>
                <td>{receiptVerification.pdf_order_code || '-'}</td>
              </tr>
              <tr>
                <td>Nama Pelanggan</td>
                <td>{receiptVerification.customer_name || '-'}</td>
              </tr>
              <tr>
                <td>Email Pelanggan</td>
                <td>{receiptVerification.customer_email || '-'}</td>
              </tr>
              <tr>
                <td>Total</td>
                <td>
                  {receiptVerification.total
                    ? `Rp ${formatRibuan(receiptVerification.total)}`
                    : '-'}
                </td>
              </tr>
              <tr>
                <td>Generated At</td>
                <td>{formatTanggal(receiptVerification.generated_at)}</td>
              </tr>
              <tr>
                <td>Alasan / Hasil</td>
                <td>{receiptVerification.failure_reason || '-'}</td>
              </tr>
            </tbody>
          </DataTable>
          {detail.ereceipt_proof ? (
            <p style={{ marginTop: 12 }}>
              <button type="button" onClick={handleVerifyReceipt} disabled={receiptLoading}>
                {receiptLoading
                  ? 'Memverifikasi...'
                  : receiptVerification.status
                    ? 'Periksa Ulang E-Receipt'
                    : 'Verifikasi E-Receipt'}
              </button>
            </p>
          ) : (
            <p style={{ marginTop: 12 }}>Customer belum melampirkan e-receipt.</p>
          )}

          {detail.resolution_type === 'refund' && (
            <>
              <h3 style={{ marginTop: 24 }}>Info Refund</h3>
              <DataTable>
                <tbody>
                  <tr>
                    <td>Nama Bank</td>
                    <td>{refundInfo.bank_name || '-'}</td>
                  </tr>
                  <tr>
                    <td>Nomor Rekening</td>
                    <td>{refundInfo.account_number || '-'}</td>
                  </tr>
                  <tr>
                    <td>Nama Pemilik Rekening</td>
                    <td>{refundInfo.account_holder_name || '-'}</td>
                  </tr>
                </tbody>
              </DataTable>
            </>
          )}

          {detail.resolution_type === 'exchange' && (
            <>
              <h3 style={{ marginTop: 24 }}>Info Exchange</h3>
              <DataTable>
                <tbody>
                  <tr>
                    <td>Kurir</td>
                    <td>{exchangeInfo.courier_name || '-'}</td>
                  </tr>
                  <tr>
                    <td>Label</td>
                    <td>{exchangeInfo.address_label || '-'}</td>
                  </tr>
                  <tr>
                    <td>Penerima</td>
                    <td>{exchangeInfo.recipient_name || '-'}</td>
                  </tr>
                  <tr>
                    <td>Telepon</td>
                    <td>{exchangeInfo.phone || '-'}</td>
                  </tr>
                  <tr>
                    <td>Alamat</td>
                    <td>{exchangeInfo.address_line || '-'}</td>
                  </tr>
                  <tr>
                    <td>Kota</td>
                    <td>{exchangeInfo.city || '-'}</td>
                  </tr>
                  <tr>
                    <td>Provinsi</td>
                    <td>{exchangeInfo.province || '-'}</td>
                  </tr>
                  <tr>
                    <td>Kode Pos</td>
                    <td>{exchangeInfo.postal_code || '-'}</td>
                  </tr>
                  <tr>
                    <td>Catatan</td>
                    <td>{exchangeInfo.notes || '-'}</td>
                  </tr>
                </tbody>
              </DataTable>
            </>
          )}

          <h3 style={{ marginTop: 24 }}>Item Retur</h3>
          <DataTable>
            <thead>
              <tr>
                <th>Produk</th>
                <th>Qty Dibeli</th>
                <th>Qty Retur</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {(detail.items || []).map((item, index) => (
                <tr key={item.id || index}>
                  <td>{item.product_name || '-'}</td>
                  <td>{item.ordered_quantity || 0}</td>
                  <td>{item.quantity || 0}</td>
                  <td>Rp {formatRibuan(item.subtotal)}</td>
                </tr>
              ))}
              {(detail.items || []).length === 0 && (
                <tr>
                  <td colSpan={4}>(tidak ada item retur)</td>
                </tr>
              )}
            </tbody>
          </DataTable>

          <h3 style={{ marginTop: 24 }}>Monitoring</h3>
          <p><b>Device</b></p>
          <DataTable>
            <tbody>
              <tr>
                <td>Device Retur</td>
                <td>{detail.monitoring?.device?.device_label_snapshot || '-'}</td>
              </tr>
              <tr>
                <td>Status Device</td>
                <td>{detail.monitoring?.device?.trusted_device_status_label || '-'}</td>
              </tr>
              <tr>
                <td>Device Saat Order</td>
                <td>{detail.monitoring?.device?.order_device_label_snapshot || '-'}</td>
              </tr>
              <tr>
                <td>Sama dengan Device Order</td>
                <td>{detail.monitoring?.device?.same_device_as_order ? 'Ya' : 'Tidak'}</td>
              </tr>
              <tr>
                <td>Score Device</td>
                <td>{detail.monitoring?.device?.device_risk_score ?? 0}</td>
              </tr>
              <tr>
                <td>Score Device Mismatch</td>
                <td>{detail.monitoring?.device?.device_mismatch_score ?? 0}</td>
              </tr>
            </tbody>
          </DataTable>

          <p style={{ marginTop: 12 }}><b>Password & OTP</b></p>
          <DataTable>
            <tbody>
              <tr>
                <td>Salah Password</td>
                <td>
                  {detail.monitoring?.password?.failed_password_count ?? 0} kali, score{' '}
                  {detail.monitoring?.password?.failed_password_score ?? 0}
                </td>
              </tr>
              <tr>
                <td>Gagal OTP</td>
                <td>
                  {detail.monitoring?.otp?.failed_otp_count ?? 0} kali, score{' '}
                  {detail.monitoring?.otp?.failed_otp_score ?? 0}
                </td>
              </tr>
            </tbody>
          </DataTable>

          <p style={{ marginTop: 12 }}><b>Address Exchange</b></p>
          <DataTable>
            <tbody>
              <tr>
                <td>Relevan untuk Exchange</td>
                <td>{detail.resolution_type === 'exchange' ? 'Ya' : 'Tidak'}</td>
              </tr>
              <tr>
                <td>Sama dengan Alamat Order</td>
                <td>
                  {detail.resolution_type === 'exchange'
                    ? (detail.monitoring?.address?.exchange_address_same_as_order ? 'Ya' : 'Tidak')
                    : '-'}
                </td>
              </tr>
              <tr>
                <td>Umur Alamat Exchange</td>
                <td>
                  {detail.resolution_type === 'exchange'
                    ? `${detail.monitoring?.address?.exchange_address_age_minutes ?? 0} menit`
                    : '-'}
                </td>
              </tr>
              <tr>
                <td>Score Alamat Baru</td>
                <td>
                  {detail.resolution_type === 'exchange'
                    ? (detail.monitoring?.address?.exchange_new_address_score ?? 0)
                    : '-'}
                </td>
              </tr>
              <tr>
                <td>Score Address Mismatch</td>
                <td>
                  {detail.resolution_type === 'exchange'
                    ? (detail.monitoring?.address?.exchange_address_mismatch_score ?? 0)
                    : '-'}
                </td>
              </tr>
              <tr>
                <td>Address Risk Score</td>
                <td>
                  {detail.resolution_type === 'exchange'
                    ? (detail.monitoring?.address?.exchange_address_risk_score ?? 0)
                    : '-'}
                </td>
              </tr>
            </tbody>
          </DataTable>

          <p style={{ marginTop: 12 }}><b>Behavior</b></p>
          <DataTable>
            <tbody>
              <tr>
                <td>Umur Akun</td>
                <td>{detail.monitoring?.behavior?.account_age_days ?? 0} hari</td>
              </tr>
              <tr>
                <td>Retur 30 Hari</td>
                <td>
                  {detail.monitoring?.behavior?.recent_returns_30d_count ?? 0}, score{' '}
                  {detail.monitoring?.behavior?.frequent_return_score ?? 0}
                </td>
              </tr>
              <tr>
                <td>Retur 90 Hari</td>
                <td>{detail.monitoring?.behavior?.recent_returns_90d_count ?? 0}</td>
              </tr>
              <tr>
                <td>Jarak ke Selesai Order</td>
                <td>
                  {detail.monitoring?.behavior?.return_after_completion_minutes ?? 0} menit, score{' '}
                  {detail.monitoring?.behavior?.rapid_return_score ?? 0}
                </td>
              </tr>
              <tr>
                <td>Score Akun Baru Retur</td>
                <td>{detail.monitoring?.behavior?.new_account_return_score ?? 0}</td>
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
                <td>Return Abuse Score</td>
                <td>{detail.monitoring?.summary?.return_abuse_score ?? 0}</td>
              </tr>
              <tr>
                <td>Address Risk Score</td>
                <td>{detail.monitoring?.summary?.address_risk_score ?? 0}</td>
              </tr>
              <tr>
                <td>Total Risk Score</td>
                <td>
                  {detail.monitoring?.summary?.total_risk_score ?? 0}{' '}
                  ({detail.monitoring?.summary?.risk_level || 'low'})
                </td>
              </tr>
            </tbody>
          </DataTable>

          {['shipped_back', 'received', 'completed'].includes(detail.status) && (
            <>
              <h3 style={{ marginTop: 24 }}>Pengiriman Balik dari Customer</h3>
              <DataTable>
                <tbody>
                  <tr><td>Kurir</td><td>{detail.return_shipment?.courier_name || '-'}</td></tr>
                  <tr><td>Nomor Resi</td><td>{detail.return_shipment?.tracking_number || '-'}</td></tr>
                  <tr><td>Dikirim Pada</td><td>{formatTanggal(detail.return_shipment?.shipped_back_at)}</td></tr>
                  <tr><td>Diterima Oleh</td><td>{detail.received_by_name || '-'}</td></tr>
                  <tr><td>Diterima Pada</td><td>{formatTanggal(detail.received_at)}</td></tr>
                </tbody>
              </DataTable>
            </>
          )}

          {detail.status === 'shipped_back' && (
            <>
              <h3 style={{ marginTop: 24 }}>Verifikasi QR Unit (Scan Barang Balik)</h3>
              {qrError && <p style={{ color: 'red' }}>{qrError}</p>}
              {qrMessage && <p style={{ color: 'green' }}>{qrMessage}</p>}
              <p style={{ marginTop: 8 }}>
                Discan: <b>{totalScanned}/{totalRequired}</b> unit · Valid: <b>{detail.return_units?.returned ?? 0}</b>
                {' '}(invalid tetap dihitung sudah discan)
              </p>
              <DataTable>
                <thead>
                  <tr>
                    <th>Produk</th>
                    <th>Qty Retur</th>
                    <th>Discan</th>
                    <th>Valid</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {(qrUnits || []).map((item) => {
                    const scanned = scannedCountFor(item);
                    const validCount = (item.units || []).filter((u) => u.is_returned).length;
                    const itemDone = scanned >= (item.requested_quantity || 0);
                    return (
                      <tr key={item.return_item_id}>
                        <td>{item.product_name}</td>
                        <td>{item.requested_quantity}</td>
                        <td style={{ color: itemDone ? 'green' : '#a00' }}>
                          {scanned}/{item.requested_quantity}
                        </td>
                        <td>{validCount}</td>
                        <td>
                          <button type="button" onClick={() => openScanner(item)} disabled={qrLoading}>
                            {qrLoading ? '...' : 'Scan QR'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {(qrUnits || []).length === 0 && (
                    <tr>
                      <td colSpan={5}>
                        {qrLoading ? 'Memuat unit...' : '(belum ada unit QR — pastikan QR sudah digenerate di pesanannya)'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </DataTable>
              <p style={{ marginTop: 12 }}>
                <button
                  type="button"
                  onClick={handleReceive}
                  disabled={actionLoading || !allScanned}
                >
                  {actionLoading ? 'Memproses...' : 'Tandai Diterima'}
                </button>
                {!allScanned && (
                  <span style={{ marginLeft: 8, color: '#a00' }}>
                    (Semua unit wajib discan dulu: {totalScanned}/{totalRequired})
                  </span>
                )}
              </p>
            </>
          )}

          {detail.status === 'received' && (
            <>
              <h3 style={{ marginTop: 24 }}>Selesaikan Retur ({detail.resolution_type_label || detail.resolution_type})</h3>
              <form onSubmit={handleComplete} style={{ marginTop: 8 }}>
                {detail.resolution_type === 'refund' ? (
                  <p>
                    <label>Bukti Transfer Refund: </label>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => setRefundFile(e.target.files?.[0] || null)}
                    />
                  </p>
                ) : (
                  <p>
                    <label>Resi Barang Pengganti: </label>
                    <input
                      type="text"
                      value={exchangeTracking}
                      onChange={(e) => setExchangeTracking(e.target.value)}
                      placeholder="No resi pengiriman exchange"
                    />
                  </p>
                )}
                <button type="submit" disabled={actionLoading}>
                  {actionLoading ? 'Memproses...' : 'Selesaikan Retur'}
                </button>
              </form>
            </>
          )}

          {detail.status === 'completed' && (
            <>
              <h3 style={{ marginTop: 24 }}>Penyelesaian</h3>
              <DataTable>
                <tbody>
                  {detail.resolution_type === 'refund' ? (
                    <tr>
                      <td>Bukti Transfer Refund</td>
                      <td>
                        {detail.completion?.refund_proof ? (
                          <a href={fileUrl(detail.completion.refund_proof)} target="_blank" rel="noreferrer">
                            Lihat Bukti
                          </a>
                        ) : '-'}
                      </td>
                    </tr>
                  ) : (
                    <tr>
                      <td>Resi Barang Pengganti</td>
                      <td>{detail.completion?.exchange_shipment_tracking || '-'}</td>
                    </tr>
                  )}
                  <tr><td>Diselesaikan Oleh</td><td>{detail.completion?.completed_by_name || '-'}</td></tr>
                  <tr><td>Diselesaikan Pada</td><td>{formatTanggal(detail.completion?.completed_at)}</td></tr>
                </tbody>
              </DataTable>
            </>
          )}

          {detail.status === 'waiting_admin_review' && (
            <p style={{ marginTop: 16 }}>
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
          )}
        </>
      )}

      <Link href="/admin/retur">Kembali ke daftar retur</Link>

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
    </div>
  );
}
