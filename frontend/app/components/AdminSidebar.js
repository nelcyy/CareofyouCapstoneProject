'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { apiUrl } from '@/api';
import './AdminSidebar.css';

/* ── inline icons ── */
const IcGrid = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
  </svg>
);
const IcOrders = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);
const IcProducts = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);
const IcReturn = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </svg>
);
const IcLogOut = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

// Menu = route yang memang ADA di project ini.
const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Dasbor', icon: <IcGrid /> },
  { href: '/admin/produk', label: 'Produk', icon: <IcProducts /> },
  { href: '/admin/pesanan', label: 'Pesanan', icon: <IcOrders />, badge: 'orders' },
  { href: '/admin/retur', label: 'Retur', icon: <IcReturn />, badge: 'returns' },
];

// Badge "pesanan/retur baru" ngambil angka dari backend
// (GET /api/admin/notifications). Aturan "apa itu baru" dihitung di backend;
// frontend cuma nampilin angkanya. Badge otomatis hilang kalau 0.
export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [pendingReturns, setPendingReturns] = useState(0);

  useEffect(() => {
    let alive = true;
    const loadCounts = () => {
      fetch(apiUrl('/api/admin/notifications'))
        .then((r) => r.json())
        .then((d) => {
          if (!alive || !d) return;
          setPendingOrders(Number(d.pending_orders) || 0);
          setPendingReturns(Number(d.pending_returns) || 0);
        })
        .catch(() => {});
    };
    loadCounts();
    // refresh berkala biar badge ikut update kalau ada pesanan/retur baru
    const id = setInterval(loadCounts, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // ingat pilihan hide/show sidebar (desktop) antar halaman
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem('adm_sidebar_collapsed') === '1');
    } catch (_) {}
  }, []);

  function hideSidebar() {
    setCollapsed(true);
    setOpen(false);
    try { window.localStorage.setItem('adm_sidebar_collapsed', '1'); } catch (_) {}
  }

  function showSidebar() {
    setCollapsed(false);
    setOpen(true);
    try { window.localStorage.setItem('adm_sidebar_collapsed', '0'); } catch (_) {}
  }

  const isActive = (href, exact) =>
    exact ? pathname === href : pathname === href || pathname?.startsWith(href + '/');

  function handleLogout() {
    // Logout sederhana sisi frontend (hapus sesi lokal lalu ke /login).
    // Kalau logout-nya perlu panggil API, silakan disesuaikan teman backend.
    try {
      localStorage.removeItem('user');
      localStorage.removeItem('login_id');
      localStorage.removeItem('trust_token');
    } catch (_) {}
    router.push('/login');
  }

  return (
    <>
      {/* Tombol hamburger — cuma muncul di layar kecil */}
      <button
        className={`adm-sidebar-toggle${collapsed ? ' adm-sidebar-toggle--visible' : ''}`}
        onClick={showSidebar}
        aria-label="Buka menu"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {open && <div className="adm-sidebar-overlay" onClick={() => setOpen(false)} />}

      <aside className={`adm-sidebar${open ? ' adm-sidebar--open' : ''}${collapsed ? ' adm-sidebar--collapsed' : ''}`}>
        {/* Logo */}
        <div className="adm-sidebar-logo">
          <img src="/logo-careofyou.png" alt="Careofyou" className="adm-sidebar-logo-img" />
          <div>
            <span className="adm-sidebar-brand">careofyou</span>
            <span className="adm-sidebar-role">Panel Admin</span>
          </div>
          <button
            className="adm-sidebar-collapse"
            onClick={hideSidebar}
            aria-label="Sembunyikan menu"
            title="Sembunyikan menu"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>

        {/* Nav */}
        <nav className="adm-sidebar-nav">
          <p className="adm-nav-group-label">Menu</p>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`adm-nav-item${isActive(item.href, item.exact) ? ' adm-nav-item--active' : ''}`}
              onClick={() => setOpen(false)}
            >
              <span className="adm-nav-icon">{item.icon}</span>
              <span className="adm-nav-label">{item.label}</span>
              {item.badge === 'orders' && pendingOrders > 0 && (
                <span className="adm-nav-badge adm-nav-badge--amber">{pendingOrders}</span>
              )}
              {item.badge === 'returns' && pendingReturns > 0 && (
                <span className="adm-nav-badge adm-nav-badge--rose">{pendingReturns}</span>
              )}
            </Link>
          ))}
        </nav>

        {/* Bawah: keluar */}
        <div className="adm-sidebar-bottom">
          <button className="adm-nav-item adm-nav-item--logout" onClick={handleLogout}>
            <span className="adm-nav-icon"><IcLogOut /></span>
            <span className="adm-nav-label">Keluar</span>
          </button>
        </div>
      </aside>
    </>
  );
}
