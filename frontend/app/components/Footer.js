import Link from 'next/link';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <img src="/logo-careofyou.png" alt="Careofyou" className="site-footer-logo" />
          <span className="site-footer-brand-text">careofyou</span>
          <p className="site-footer-desc">
            Pilihan produk beauty original yang nyaman buat dipakai dalam rutinitas harianmu.
          </p>
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
      </div>
    </footer>
  );
}
