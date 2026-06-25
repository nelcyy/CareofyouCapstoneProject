'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import './ProfileSidebar.css';

const IcUser = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
  </svg>
);
const IcMapPin = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0z" /><circle cx="12" cy="10" r="3" />
  </svg>
);
const IcBag = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);
const IcReturn = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </svg>
);
const IcLogOut = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const MENU_ITEMS = [
  { href: '/customer/profile/edit', label: 'Edit Profil', icon: <IcUser /> },
  { href: '/customer/profile/address', label: 'Alamat Saya', icon: <IcMapPin /> },
  { href: '/customer/profile/order', label: 'Pesanan Saya', icon: <IcBag /> },
  { href: '/customer/profile/return', label: 'Retur Saya', icon: <IcReturn /> },
];

export default function ProfileSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    try {
      localStorage.removeItem('user');
      localStorage.removeItem('login_id');
      localStorage.removeItem('trust_token');
    } catch (_) {}
    router.push('/login');
  }

  return (
    <aside className="profile-sidebar">
      <nav className="profile-sidebar-nav">
        <p className="profile-sidebar-group">Menu</p>
        <ul className="profile-sidebar-list">
          {MENU_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <li key={item.href} className="profile-sidebar-item">
                <Link
                  href={item.href}
                  className={`profile-sidebar-link${isActive ? ' profile-sidebar-link--active' : ''}`}
                >
                  <span className="profile-sidebar-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="profile-sidebar-bottom">
        <button
          type="button"
          className="profile-sidebar-button profile-sidebar-button--logout"
          onClick={handleLogout}
        >
          <span className="profile-sidebar-icon"><IcLogOut /></span>
          <span>Keluar</span>
        </button>
      </div>
    </aside>
  );
}
