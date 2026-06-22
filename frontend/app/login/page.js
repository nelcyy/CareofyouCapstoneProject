'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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

  async function login() {
    const trust_token = localStorage.getItem('trust_token') || '';
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, trust_token, login_id: loginId }),
    });
    const data = await res.json();
    console.log('[login]', res.status, data); // detail di F12 > Console / Network
    if (data.login_id) setLoginId(data.login_id);
    if (res.ok && data.logged_in) {
      if (data.login_id) localStorage.setItem('login_id', data.login_id);
      localStorage.setItem('user', JSON.stringify(data.user)); // simpan user buat keranjang dll
      router.push(data.user.role === 'admin' ? '/admin' : '/customer/home');
    } else if (res.ok && data.need_otp) {
      setLoginId(data.login_id || '');
      setCanTrust(!!data.can_trust); // centang trust cuma kalau perangkat baru
      setStep(2); // perlu OTP -> tampilkan input OTP
    }
  }

  async function verifyOtp() {
    const res = await fetch(`${API}/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp, login_id: loginId, trust_device: trustDevice }),
    });
    const data = await res.json();
    console.log('[login verify]', res.status, data);
    if (res.ok && data.logged_in) {
      if (data.trust_token) localStorage.setItem('trust_token', data.trust_token);
      if (data.login_id) localStorage.setItem('login_id', data.login_id);
      localStorage.setItem('user', JSON.stringify(data.user)); // simpan user buat keranjang dll
      router.push(data.user.role === 'admin' ? '/admin' : '/customer/home');
    }
  }

  return (
    <div>
      <h2>Login CareOfYou</h2>

      {step === 1 && (
        <div>
          <p>
            Email:
            <br />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </p>
          <p>
            Password:
            <br />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </p>
          <button onClick={login}>Masuk</button>
          <p>
            Belum punya akun? <Link href="/register">Daftar</Link>
          </p>
        </div>
      )}

      {step === 2 && (
        <div>
          <p>
            Kode OTP:
            <br />
            <input value={otp} onChange={(e) => setOtp(e.target.value)} />
          </p>
          {canTrust && (
            <p>
              <label>
                <input
                  type="checkbox"
                  checked={trustDevice}
                  onChange={(e) => setTrustDevice(e.target.checked)}
                />{' '}
                Percayai perangkat ini
              </label>
            </p>
          )}
          <button onClick={verifyOtp}>Verifikasi</button>
        </div>
      )}
    </div>
  );
}
