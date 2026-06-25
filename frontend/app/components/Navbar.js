'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './Navbar.css';

// Navbar global buat semua halaman customer (dipakai dari app/customer/layout.js).
//
// CATATAN DATA BACKEND (belum di-wire, nunggu di-pass dari backend):
//   - cartCount  : jumlah item di keranjang buat angka badge. Dibiarkan prop
//                  opsional dengan default 0 -> badge otomatis disembunyikan.
//                  Gak ada angka palsu / aturan di sini.
// Search dipindah ke halaman Produk (lihat app/customer/product/page.js).
// Sisanya (link aktif berdasarkan route) murni frontend, gak butuh backend.
export default function Navbar({ cartCount = 0 }) {
  const pathname = usePathname();

  const isActive = (href) => pathname === href || pathname?.startsWith(href + '/');

  return (
    <header className="navbar">
      <div className="navbar-inner">
        {/* Logo */}
        <Link href="/customer/home" className="navbar-logo">
          <img src="/logo-careofyou.png" alt="Careofyou" className="navbar-logo-img" />
          <span className="navbar-logo-text">careofyou</span>
        </Link>

        {/* Center links */}
        <nav className="navbar-links">
          <Link
            href="/customer/home"
            className={isActive('/customer/home') ? 'navbar-link--active' : ''}
          >
            Beranda
          </Link>
          <Link
            href="/customer/product"
            className={isActive('/customer/product') ? 'navbar-link--active' : ''}
          >
            Produk
          </Link>
        </nav>

        {/* Right icons */}
        <div className="navbar-icons">
          <Link
            href="/customer/favorites"
            className={`navbar-icon-btn${isActive('/customer/favorites') ? ' navbar-icon-active' : ''}`}
            title="Favorit Saya"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill={isActive('/customer/favorites') ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </Link>

          <Link
            href="/customer/cart"
            className={`navbar-icon-btn navbar-cart-btn${isActive('/customer/cart') ? ' navbar-icon-active' : ''}`}
            title="Keranjang"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            {/* badge muncul cuma kalau cartCount dikirim > 0 dari backend */}
            {cartCount > 0 && <span className="navbar-cart-badge">{cartCount}</span>}
          </Link>

          <Link
            href="/customer/profile"
            className={`navbar-icon-btn${isActive('/customer/profile') ? ' navbar-icon-active' : ''}`}
            title="Profil"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </Link>
        </div>
      </div>
    </header>
  );
}
