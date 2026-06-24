'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import '../auth.css';
import PwField from '../components/PwField';
import OtpModal from '../components/OtpModal';

const API = 'http://localhost:8000/api/register';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [otp, setOtp] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function sendOtp(event) {
    event.preventDefault();
    if (password !== password2) {
      setError('Password & konfirmasi beda!');
      return;
    }
    setLoading(true);
    setError('');
    const res = await fetch(`${API}/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, email, password }),
    });
    const data = await res.json();
    console.log('[kirim OTP]', res.status, data); // detail lihat di F12 > Console / Network
    setLoading(false);
    if (res.ok) {
      setStep(2);
    } else {
      setError(data.error || 'Gagal mengirim OTP. Silakan coba lagi.');
    }
  }

  async function verifyOtp(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch(`${API}/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, email, password, otp, trust_device: trustDevice }),
    });
    const data = await res.json();
    console.log('[verifikasi]', res.status, data); // detail lihat di F12 > Console / Network
    setLoading(false);
    if (res.ok) {
      if (data.trust_token) localStorage.setItem('trust_token', data.trust_token);
      router.push('/login'); // otomatis pindah ke halaman login
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
        <h2 className="auth-title">Buat Akun</h2>
        <p className="auth-subtitle">Ayo mulai bersinar.</p>
      </div>

      <form className="auth-form" onSubmit={sendOtp}>
        <div className="field-group">
          <label className="field-label">Nama Lengkap</label>
          <input
            className="field-input"
            type="text"
            placeholder="Nama kamu"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

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

        <div className="field-group">
          <label className="field-label">Nomor HP</label>
          <input
            className="field-input"
            type="text"
            placeholder="08xxxxxxxxxx"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <PwField
          label="Password"
          placeholder="Min. 6 karakter"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <PwField
          label="Konfirmasi Password"
          placeholder="Ulangi password kamu"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
        />

        {step === 1 && error && <p className="auth-error">{error}</p>}

        <button type="submit" className="auth-btn" disabled={loading}>
          {loading ? <span className="auth-spinner" /> : 'Daftar'}
        </button>
      </form>

      <p className="auth-switch">
        Sudah punya akun? <Link href="/login">Login</Link>
      </p>

      <OtpModal
        open={step === 2}
        onClose={closeOtp}
        kicker="Verifikasi Registrasi"
        email={email}
        onOtpChange={setOtp}
        onSubmit={verifyOtp}
        onResend={sendOtp}
        loading={loading}
        error={step === 2 ? error : ''}
      >
        <label className="auth-checkbox-row">
          <input
            type="checkbox"
            checked={trustDevice}
            onChange={(e) => setTrustDevice(e.target.checked)}
          />
          Percayai perangkat ini
        </label>
      </OtpModal>
    </div>
  );
}
