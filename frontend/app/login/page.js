'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import '../auth.css';
import PwField from '../components/PwField';
import OtpModal from '../components/OtpModal';

const API = 'http://localhost:8000/api/login';

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

  async function login(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const trust_token = localStorage.getItem('trust_token') || '';
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, trust_token, login_id: loginId }),
    });
    const data = await res.json();
    console.log('[login]', res.status, data); // detail di F12 > Console / Network
    setLoading(false);
    if (data.login_id) setLoginId(data.login_id);
    if (res.ok && data.logged_in) {
      if (data.login_id) localStorage.setItem('login_id', data.login_id);
      localStorage.setItem('user', JSON.stringify(data.user)); // simpan user buat keranjang dll
      router.push(data.user.role === 'admin' ? '/admin' : '/customer/home');
    } else if (res.ok && data.need_otp) {
      setLoginId(data.login_id || '');
      setCanTrust(!!data.can_trust); // centang trust cuma kalau perangkat baru
      setStep(2); // perlu OTP -> tampilkan input OTP
    } else {
      setError(data.error || 'Login gagal. Silakan coba lagi.');
    }
  }

  async function verifyOtp(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch(`${API}/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp, login_id: loginId, trust_device: trustDevice }),
    });
    const data = await res.json();
    console.log('[login verify]', res.status, data);
    setLoading(false);
    if (res.ok && data.logged_in) {
      if (data.trust_token) localStorage.setItem('trust_token', data.trust_token);
      if (data.login_id) localStorage.setItem('login_id', data.login_id);
      localStorage.setItem('user', JSON.stringify(data.user)); // simpan user buat keranjang dll
      router.push(data.user.role === 'admin' ? '/admin' : '/customer/home');
    } else {
      setError(data.error || 'Verifikasi gagal. Silakan coba lagi.');
    }
  }

  function closeOtp() {
    setStep(1);
    setOtp('');
    setError('');
  }

  return (
    <div className="auth-card">
      <div className="auth-card-top">
        <h2 className="auth-title">Masuk</h2>
        <p className="auth-subtitle">Senang kamu kembali.</p>
      </div>

      <form className="auth-form" onSubmit={login}>
        <div className="field-group">
          <label className="field-label">Email</label>
          <input
            className="field-input"
            type="email"
            placeholder="kamu@contoh.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <PwField
          label="Password"
          placeholder="........"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {step === 1 && error && <p className="auth-error">{error}</p>}

        <button type="submit" className="auth-btn" disabled={loading}>
          {loading ? <span className="auth-spinner" /> : 'Masuk'}
        </button>
      </form>

      <p className="auth-switch">
        Belum punya akun? <Link href="/register">Daftar sekarang</Link>
      </p>

      <OtpModal
        open={step === 2}
        onClose={closeOtp}
        kicker="Verifikasi Login"
        email={email}
        onOtpChange={setOtp}
        onSubmit={verifyOtp}
        onResend={login}
        loading={loading}
        error={step === 2 ? error : ''}
      >
        {canTrust && (
          <label className="auth-checkbox-row">
            <input
              type="checkbox"
              checked={trustDevice}
              onChange={(e) => setTrustDevice(e.target.checked)}
            />
            Percayai perangkat ini
          </label>
        )}
      </OtpModal>
    </div>
  );
}
