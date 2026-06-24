'use client';

import { usePathname } from 'next/navigation';
import '../auth.css';

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
  const mode = AUTH_MODE_BY_PATH[pathname];

  if (!mode) return children;

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

      <div className={`auth-side ${isLogin ? 'auth-side-left' : 'auth-side-right'}`}>
        {children}
      </div>
    </div>
  );
}
