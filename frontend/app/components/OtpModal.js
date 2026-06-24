'use client';

import OtpInput from './OtpInput';
import { IconShield, IconClose } from './AuthIcons';

export default function OtpModal({
  open,
  onClose,
  kicker,
  email,
  onOtpChange,
  onSubmit,
  onResend,
  loading,
  error,
  children,
}) {
  if (!open) return null;

  return (
    <div className="otp-modal" role="presentation">
      <div className="otp-modal-backdrop" onClick={onClose} />

      <div className="otp-dialog" role="dialog" aria-modal="true" aria-labelledby="otp-title">
        <button type="button" className="otp-close-btn" onClick={onClose} aria-label="Tutup popup OTP">
          <IconClose />
        </button>

        <div className="otp-header">
          <div className="otp-icon-wrap">
            <IconShield />
          </div>
          <div className="otp-header-copy">
            <p className="otp-kicker">{kicker}</p>
            <h3 id="otp-title" className="otp-title">Masukkan OTP 6 digit</h3>
            <p className="otp-subtitle">
              Kode verifikasi sudah dikirim ke {email || 'email kamu'}. Silakan cek inbox atau folder spam.
            </p>
          </div>
        </div>

        <form className="otp-form" onSubmit={onSubmit}>
          <OtpInput onChange={onOtpChange} />

          {children}

          {error && <p className="otp-feedback otp-feedback-error">{error}</p>}

          <div className="otp-actions">
            <button type="button" className="otp-secondary-btn" onClick={onResend} disabled={loading}>
              Kirim ulang kode
            </button>
            <button type="submit" className="otp-primary-btn" disabled={loading}>
              {loading ? <span className="auth-spinner" /> : 'Verifikasi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
