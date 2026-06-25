import Link from 'next/link';
import './Footer.css';

// Instagram diambil dari profil asli @careofyou.id (sama seperti di home/page.js).
const INSTAGRAM_URL = 'https://instagram.com/careofyou.id';

const InstagramIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5.5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-glow" />
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <div className="site-footer-brand-row">
            <img src="/logo-careofyou.png" alt="Careofyou" className="site-footer-logo" />
            <span className="site-footer-brand-text">careofyou</span>
          </div>
          <p className="site-footer-desc">
            Beauty &amp; personal care terpercaya — pilihan produk original yang nyaman
            dipakai dalam rutinitas harianmu.
          </p>
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="site-footer-social">
            <InstagramIcon />
            <span>@careofyou.id</span>
          </a>
        </div>

        <div className="site-footer-links">
          <p className="site-footer-heading">Jelajahi</p>
          <Link href="/customer/home">Beranda</Link>
          <Link href="/customer/product">Produk</Link>
          <Link href="/customer/favorites">Favorit</Link>
          <Link href="/customer/cart">Keranjang</Link>
        </div>

        <div className="site-footer-links">
          <p className="site-footer-heading">Akun</p>
          <Link href="/customer/profile">Profil Saya</Link>
          <Link href="/customer/profile/order">Pesanan Saya</Link>
        </div>
      </div>

      <div className="site-footer-bottom">
        <span>&copy; {new Date().getFullYear()} careofyou. Semua hak dilindungi.</span>
        <span className="site-footer-bottom-tag">Beauty &amp; personal care</span>
      </div>
    </footer>
  );
}
