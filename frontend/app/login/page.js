'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import styles from './page.module.css';

const LOGIN_API = 'http://localhost:8000/api/login';

function getVisibleOtpError(message) {
  if (!message) return '';
  const hiddenMessages = [
    'OTP masih aktif. Tunggu countdown selesai untuk kirim ulang OTP.',
  ];
  return hiddenMessages.includes(message) ? '' : message;
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

function IconEye() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconEyeOff() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
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

function PasswordField({ label, value, onChange, placeholder, autoComplete }) {
  const [show, setShow] = useState(false);

  return (
    <div className={styles.fieldGroup}>
      <label className={styles.fieldLabel}>{label}</label>
      <div className={styles.fieldPwWrap}>
        <input
          className={styles.fieldInput}
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          required
        />
        <button
          type="button"
          className={styles.pwToggle}
          onClick={() => setShow((current) => !current)}
          aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'}
        >
          {show ? <IconEyeOff /> : <IconEye />}
        </button>
      </div>
    </div>
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
  children,
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
              Kode verifikasi sudah dikirim ke {email || 'email kamu'}. Silakan cek inbox atau folder spam.
            </p>
          </div>
        </div>

        <form className={styles.otpForm} onSubmit={onSubmit}>
          <OtpInput value={otp} onChange={onOtpChange} disabled={otpInputDisabled} />

          {children}

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
              {loading ? <span className={styles.authSpinner} /> : 'Verifikasi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AuthFrame({ children }) {
  return (
    <div className={styles.authPage}>
      <div className={`${styles.blob} ${styles.blob1}`} />
      <div className={`${styles.blob} ${styles.blob2}`} />

      <main className={styles.authMain}>
        <div className={styles.authCard}>
          <div className={styles.authCardTop}>
            <h2 className={styles.authTitle}>Masuk</h2>
            <p className={styles.authSubtitle}>Senang kamu kembali.</p>
          </div>

          {children}

          <div className={styles.authSwitch}>
            <p>
              Belum punya akun? <Link href="/register">Daftar sekarang</Link>
            </p>
          </div>
        </div>
      </main>

      <aside className={styles.authAside}>
        <div className={`${styles.panelCircle} ${styles.panelCircleA}`} />
        <div className={`${styles.panelCircle} ${styles.panelCircleB}`} />
        <div className={styles.panelContent}>
          <div className={styles.panelLogoWrap}>
            <img src="/logo-careofyou.png" alt="careofyou" className={styles.panelLogo} />
          </div>
          <p className={styles.panelBrand}>careofyou</p>
          <h1 className={styles.panelHeading}>Selamat datang kembali.</h1>
          <p className={styles.panelSub}>{'Masuk dan lanjutkan\nperjalanan skincare-mu.'}</p>
        </div>
      </aside>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loginId, setLoginId] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);
  const [canTrust, setCanTrust] = useState(false);
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpState, setOtpState] = useState(null);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const liveOtpState = buildOtpViewState(otpState, otpCountdown);

  useEffect(() => {
    if (step !== 2 || otpCountdown <= 0) return;

    const timerId = window.setInterval(() => {
      setOtpCountdown((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [step, otpCountdown > 0]);

  function syncOtpState(nextOtp) {
    if (!nextOtp) {
      setOtpState(null);
      setOtpCountdown(0);
      return;
    }

    setOtpState(nextOtp);
    setOtpCountdown(getOtpCountdown(nextOtp));
  }

  async function handleLogin(event) {
    event?.preventDefault();
    setLoading(true);
    setError('');

    try {
      const trustToken = localStorage.getItem('trust_token') || '';
      const response = await fetch(LOGIN_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          trust_token: trustToken,
          login_id: loginId,
        }),
      });

      const data = await response.json();

      if (data.login_id) {
        setLoginId(data.login_id);
      }

      if (typeof data.can_trust === 'boolean') {
        setCanTrust(Boolean(data.can_trust));
      }

      if (response.ok && data.logged_in) {
        if (data.login_id) localStorage.setItem('login_id', data.login_id);
        localStorage.setItem('user', JSON.stringify(data.user));
        router.push(data.user.role === 'admin' ? '/admin' : '/customer/home');
        return;
      }

      if (data.need_otp) {
        setLoginId(data.login_id || '');
        syncOtpState(data.otp);
        setOtp('');
        setStep(2);
        setError(response.ok ? '' : getVisibleOtpError(data.error));
        return;
      }

      setError(data.error || 'Login gagal. Silakan coba lagi.');
    } catch {
      setError('Tidak bisa terhubung ke server. Coba lagi sebentar.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(event) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${LOGIN_API}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          otp,
          login_id: loginId,
          trust_device: trustDevice,
        }),
      });

      const data = await response.json();

      if (data.login_id) {
        setLoginId(data.login_id);
      }

      if (response.ok && data.logged_in) {
        if (data.trust_token) localStorage.setItem('trust_token', data.trust_token);
        if (data.login_id) localStorage.setItem('login_id', data.login_id);
        localStorage.setItem('user', JSON.stringify(data.user));
        router.push(data.user.role === 'admin' ? '/admin' : '/customer/home');
        return;
      }

      if (data.otp) {
        syncOtpState(data.otp);
      }

      setError(getVisibleOtpError(data.error) || 'Verifikasi gagal. Silakan coba lagi.');
    } catch {
      setError('Tidak bisa terhubung ke server. Coba lagi sebentar.');
    } finally {
      setLoading(false);
    }
  }

  function closeOtpModal() {
    setStep(1);
    setOtp('');
    setError('');
    setTrustDevice(false);
    syncOtpState(null);
  }

  return (
    <>
      <AuthFrame>
        <form className={styles.authForm} onSubmit={handleLogin}>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Email</label>
            <input
              className={styles.fieldInput}
              type="email"
              placeholder="kamu@contoh.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <PasswordField
            label="Password"
            placeholder="Masukkan password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />

          {step === 1 && error ? <p className={styles.authError}>{error}</p> : null}

          <button type="submit" className={styles.authBtn} disabled={loading}>
            {loading ? <span className={styles.authSpinner} /> : 'Masuk'}
          </button>
        </form>
      </AuthFrame>

      <OtpModal
        open={step === 2}
        onClose={closeOtpModal}
        kicker="Verifikasi Login"
        email={email}
        otp={otp}
        otpState={liveOtpState}
        onOtpChange={setOtp}
        onSubmit={handleVerifyOtp}
        onResend={handleLogin}
        loading={loading}
        error={error}
      >
        {canTrust ? (
          <label className={styles.authCheckboxRow}>
            <input
              type="checkbox"
              checked={trustDevice}
              onChange={(event) => setTrustDevice(event.target.checked)}
            />
            Percayai perangkat ini
          </label>
        ) : null}
      </OtpModal>
    </>
  );
}
