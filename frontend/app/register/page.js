'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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

  async function sendOtp() {
    if (password !== password2) {
      alert('Password & konfirmasi beda!');
      return;
    }
    const res = await fetch(`${API}/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, email, password }),
    });
    const data = await res.json();
    console.log('[kirim OTP]', res.status, data); // detail lihat di F12 > Console / Network
    if (res.ok) setStep(2);
  }

  async function verifyOtp() {
    const res = await fetch(`${API}/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, email, password, otp, trust_device: trustDevice }),
    });
    const data = await res.json();
    console.log('[verifikasi]', res.status, data); // detail lihat di F12 > Console / Network
    if (res.ok) {
      if (data.trust_token) localStorage.setItem('trust_token', data.trust_token);
      alert('Registrasi berhasil! Silakan login.');
      router.push('/login'); // otomatis pindah ke halaman login
    }
  }

  return (
    <div>
      <h2>Daftar Akun CareOfYou</h2>

      {step === 1 && (
        <div>
          <p>
            Nama:
            <br />
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </p>
          <p>
            Email:
            <br />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </p>
          <p>
            Nomor HP:
            <br />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </p>
          <p>
            Password:
            <br />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </p>
          <p>
            Konfirmasi Password:
            <br />
            <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
          </p>
          <button onClick={sendOtp}>Daftar</button>
          <p>
            Sudah punya akun? <Link href="/login">Login</Link>
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
          <button onClick={verifyOtp}>Verifikasi</button>
        </div>
      )}
    </div>
  );
}
