import Link from 'next/link';
import './page.css';

const FEATURES = [
  {
    title: 'Produk Original',
    desc: 'Skincare & perawatan diri pilihan yang terjamin keasliannya.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    title: 'Pengiriman Aman',
    desc: 'Dikemas rapi dan dikirim dengan kurir tepercaya ke seluruh kota.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13" rx="1" />
        <path d="M16 8h4l3 5v3h-7V8z" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
  },
  {
    title: 'Pembayaran Mudah',
    desc: 'Proses checkout simpel dengan konfirmasi pembayaran yang cepat.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
  },
];

export default function Home() {
  const year = new Date().getFullYear();

  return (
    <main className="lp">
      <div className="lp-blob lp-blob--1" aria-hidden="true" />
      <div className="lp-blob lp-blob--2" aria-hidden="true" />

      <section className="lp-hero">
        <img src="/logo-careofyou.png" alt="Careofyou" className="lp-logo" />
        <span className="lp-eyebrow">Beauty &amp; Personal Care</span>
        <h1 className="lp-title">
          Rawat dirimu bersama <span>careofyou</span>
        </h1>
        <p className="lp-lead">
          Temukan koleksi skincare dan produk perawatan diri pilihan. Belanja
          mudah, aman, dan menyenangkan — semua dalam satu tempat.
        </p>

        <div className="lp-cta">
          <Link href="/customer/home" className="lp-btn lp-btn--primary">
            Mulai Belanja
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
          <Link href="/login" className="lp-btn lp-btn--ghost">
            Masuk
          </Link>
        </div>

        <p className="lp-note">
          Belum punya akun? <Link href="/register" className="lp-link">Daftar sekarang</Link>
        </p>
      </section>

      <section className="lp-features">
        {FEATURES.map((f) => (
          <article key={f.title} className="lp-feature">
            <span className="lp-feature-ico">{f.icon}</span>
            <h3 className="lp-feature-title">{f.title}</h3>
            <p className="lp-feature-desc">{f.desc}</p>
          </article>
        ))}
      </section>

      <footer className="lp-footer">© {year} careofyou · Beauty &amp; Personal Care</footer>
    </main>
  );
}
