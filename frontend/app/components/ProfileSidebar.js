'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import './ProfileSidebar.css';

const MENU_ITEMS = [
  { href: '/customer/profile/edit', label: 'Edit Profil' },
  { href: '/customer/profile/address', label: 'Alamat Saya' },
  { href: '/customer/profile/order', label: 'Pesanan Saya' },
  { href: '/customer/profile/return', label: 'Retur Saya' },
];

const IcLogOut = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

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
      <div className="profile-sidebar-header">
        <h3 className="profile-sidebar-title">Menu Profile</h3>
        <p className="profile-sidebar-subtitle">
          Navigasi area akun customer.
        </p>
      </div>
      <nav className="profile-sidebar-nav">
        <ul className="profile-sidebar-list">
          {MENU_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <li key={item.href} className="profile-sidebar-item">
                <Link
                  href={item.href}
                  className={`profile-sidebar-link${isActive ? ' profile-sidebar-link--active' : ''}`}
                >
                  {item.label}
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
