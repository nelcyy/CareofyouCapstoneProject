'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import '../auth.css';
import PwField from './PwField';
import OtpModal from './OtpModal';

const LOGIN_API = 'http://localhost:8000/api/login';
const REGISTER_API = 'http://localhost:8000/api/register';

const PANEL_COPY = {
  login: {
    heading: 'Selamat datang kembali.',
    sub: 'Masuk dan lanjutkan\nperjalanan skincare-mu.',
  },
  register: {
    heading: 'Bergabung dengan careofyou.',
    sub: 'Buat akun dan mulai\nbersinar hari ini.',
  },
};

const AUTH_MODE_BY_PATH = { '/login': 'login', '/register': 'register' };

export default function AuthShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const routeMode = AUTH_MODE_BY_PATH[pathname];

  const [mode, setMode] = useState(routeMode || 'login');

  useEffect(() => {
    if (routeMode) setMode(routeMode);
  }, [routeMode]);

  // login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginOtp, setLoginOtp] = useState('');
  const [loginId, setLoginId] = useState('');
  const [loginTrustDevice, setLoginTrustDevice] = useState(false);
  const [canTrust, setCanTrust] = useState(false);
  const [loginStep, setLoginStep] = useState(1);
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // register state
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPassword2, setRegPassword2] = useState('');
  const [regOtp, setRegOtp] = useState('');
  const [regTrustDevice, setRegTrustDevice] = useState(false);
  const [regStep, setRegStep] = useState(1);
  const [regError, setRegError] = useState('');
  const [regLoading, setRegLoading] = useState(false);

  if (!routeMode) return children;

  function switchMode(next) {
    if (next === mode) return;
    setMode(next);
    router.push(next === 'login' ? '/login' : '/register');
  }

  async function login(event) {
    event.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    const trust_token = localStorage.getItem('trust_token') || '';
    const res = await fetch(LOGIN_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: loginEmail, password: loginPassword, trust_token, login_id: loginId }),
    });
    const data = await res.json();
    console.log('[login]', res.status, data); // detail di F12 > Console / Network
    setLoginLoading(false);
    if (data.login_id) setLoginId(data.login_id);
    if (res.ok && data.logged_in) {
      if (data.login_id) localStorage.setItem('login_id', data.login_id);
      localStorage.setItem('user', JSON.stringify(data.user)); // simpan user buat keranjang dll
      router.push(data.user.role === 'admin' ? '/admin' : '/customer/home');
    } else if (res.ok && data.need_otp) {
      setLoginId(data.login_id || '');
      setCanTrust(!!data.can_trust); // centang trust cuma kalau perangkat baru
      setLoginStep(2); // perlu OTP -> tampilkan input OTP
    } else {
      setLoginError(data.error || 'Login gagal. Silakan coba lagi.');
    }
  }

  async function verifyLoginOtp(event) {
    event.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    const res = await fetch(`${LOGIN_API}/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: loginEmail, otp: loginOtp, login_id: loginId, trust_device: loginTrustDevice }),
    });
    const data = await res.json();
    console.log('[login verify]', res.status, data);
    setLoginLoading(false);
    if (res.ok && data.logged_in) {
      if (data.trust_token) localStorage.setItem('trust_token', data.trust_token);
      if (data.login_id) localStorage.setItem('login_id', data.login_id);
      localStorage.setItem('user', JSON.stringify(data.user)); // simpan user buat keranjang dll
      router.push(data.user.role === 'admin' ? '/admin' : '/customer/home');
    } else {
      setLoginError(data.error || 'Verifikasi gagal. Silakan coba lagi.');
    }
  }

  function closeLoginOtp() {
    setLoginStep(1);
    setLoginOtp('');
    setLoginError('');
  }

  async function sendOtp(event) {
    event.preventDefault();
    if (regPassword !== regPassword2) {
      setRegError('Password & konfirmasi beda!');
      return;
    }
    setRegLoading(true);
    setRegError('');
    const res = await fetch(`${REGISTER_API}/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: regName, phone: regPhone, email: regEmail, password: regPassword }),
    });
    const data = await res.json();
    console.log('[kirim OTP]', res.status, data); // detail lihat di F12 > Console / Network
    setRegLoading(false);
    if (res.ok) {
      setRegStep(2);
    } else {
      setRegError(data.error || 'Gagal mengirim OTP. Silakan coba lagi.');
    }
  }

  async function verifyRegisterOtp(event) {
    event.preventDefault();
    setRegLoading(true);
    setRegError('');
    const res = await fetch(`${REGISTER_API}/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: regName,
        phone: regPhone,
        email: regEmail,
        password: regPassword,
        otp: regOtp,
        trust_device: regTrustDevice,
      }),
    });
    const data = await res.json();
    console.log('[verifikasi]', res.status, data); // detail lihat di F12 > Console / Network
    setRegLoading(false);
    if (res.ok) {
      if (data.trust_token) localStorage.setItem('trust_token', data.trust_token);
      setRegStep(1);
      switchMode('login'); // otomatis pindah ke halaman login
    } else {
      setRegError(data.error || 'Verifikasi gagal. Silakan coba lagi.');
    }
  }

  function closeRegisterOtp() {
    setRegStep(1);
    setRegOtp('');
    setRegError('');
  }

  const isLogin = mode === 'login';
  const copy = PANEL_COPY[mode];

  return (
    <div className="auth-page">
      <div className="blob blob-1" />
      <div className="blob blob-2" />

      <div className={`auth-panel ${isLogin ? 'panel-right' : 'panel-left'}`}>
        <div className="panel-circle panel-circle-a" />
        <div className="panel-circle panel-circle-b" />
        <div className="panel-content">
          <div className="panel-logo-wrap">
            <img src="/logo-careofyou.png" alt="careofyou" className="panel-logo" />
          </div>
          <p className="panel-brand">careofyou</p>
          <h2 className="panel-heading">{copy.heading}</h2>
          <p className="panel-sub">{copy.sub}</p>
        </div>
      </div>

      <div className={`auth-side auth-side-left${isLogin ? ' side-visible' : ' side-hidden side-hidden-left'}`}>
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
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
              />
            </div>

            <PwField
              label="Password"
              placeholder="........"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
            />

            {loginStep === 1 && loginError && <p className="auth-error">{loginError}</p>}

            <button type="submit" className="auth-btn" disabled={loginLoading}>
              {loginLoading ? <span className="auth-spinner" /> : 'Masuk'}
            </button>
          </form>

          <p className="auth-switch">
            Belum punya akun?{' '}
            <a href="/register" onClick={(e) => { e.preventDefault(); switchMode('register'); }}>
              Daftar sekarang
            </a>
          </p>
        </div>
      </div>

      <div className={`auth-side auth-side-right${!isLogin ? ' side-visible' : ' side-hidden side-hidden-right'}`}>
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
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
              />
            </div>

            <div className="field-group">
              <label className="field-label">Email</label>
              <input
                className="field-input"
                type="email"
                placeholder="kamu@contoh.com"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
              />
            </div>

            <div className="field-group">
              <label className="field-label">Nomor HP</label>
              <input
                className="field-input"
                type="text"
                placeholder="08xxxxxxxxxx"
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
              />
            </div>

            <PwField
              label="Password"
              placeholder="Min. 6 karakter"
              value={regPassword}
              onChange={(e) => setRegPassword(e.target.value)}
            />

            <PwField
              label="Konfirmasi Password"
              placeholder="Ulangi password kamu"
              value={regPassword2}
              onChange={(e) => setRegPassword2(e.target.value)}
            />

            {regStep === 1 && regError && <p className="auth-error">{regError}</p>}

            <button type="submit" className="auth-btn" disabled={regLoading}>
              {regLoading ? <span className="auth-spinner" /> : 'Daftar'}
            </button>
          </form>

          <p className="auth-switch">
            Sudah punya akun?{' '}
            <a href="/login" onClick={(e) => { e.preventDefault(); switchMode('login'); }}>
              Login
            </a>
          </p>
        </div>
      </div>

      <OtpModal
        open={loginStep === 2}
        onClose={closeLoginOtp}
        kicker="Verifikasi Login"
        email={loginEmail}
        onOtpChange={setLoginOtp}
        onSubmit={verifyLoginOtp}
        onResend={login}
        loading={loginLoading}
        error={loginError}
      >
        {canTrust && (
          <label className="auth-checkbox-row">
            <input
              type="checkbox"
              checked={loginTrustDevice}
              onChange={(e) => setLoginTrustDevice(e.target.checked)}
            />
            Percayai perangkat ini
          </label>
        )}
      </OtpModal>

      <OtpModal
        open={regStep === 2}
        onClose={closeRegisterOtp}
        kicker="Verifikasi Registrasi"
        email={regEmail}
        onOtpChange={setRegOtp}
        onSubmit={verifyRegisterOtp}
        onResend={sendOtp}
        loading={regLoading}
        error={regError}
      >
        <label className="auth-checkbox-row">
          <input
            type="checkbox"
            checked={regTrustDevice}
            onChange={(e) => setRegTrustDevice(e.target.checked)}
          />
          Percayai perangkat ini
        </label>
      </OtpModal>
    </div>
  );
}
