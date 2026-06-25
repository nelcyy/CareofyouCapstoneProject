'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Footer from '../../components/Footer';
import { useCart } from '../../components/CartContext';
import './page.css';

const BACKEND = 'http://localhost:8000';
const SUMMARY_API = `${BACKEND}/api/customer/home/summary`;
const PRODUCT_API = `${BACKEND}/api/customer/product`;
const FAV_API = `${BACKEND}/api/customer/favorites`;

// ── KONTAK TOKO ────────────────────────────────────────────
// Instagram diambil dari profil asli @careofyou.id.
const INSTAGRAM_URL = 'https://instagram.com/careofyou.id';
const INSTAGRAM_HANDLE = '@careofyou.id';
// PLACEHOLDER — ganti dengan nomor WA toko asli (format internasional tanpa "+", contoh 6281234567890).
const WHATSAPP_NUMBER = '62800000000000';
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Halo careofyou, aku mau tanya produk dong')}`;
// Lokasi dari bio IG ("Manado, Tondano, Tomohon") — link search Maps, belum pin presisi.
const MAPS_QUERY = 'Manado, Tondano, Tomohon';
const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(MAPS_QUERY)}`;
const MAPS_EMBED_URL = `https://www.google.com/maps?q=${encodeURIComponent(MAPS_QUERY)}&output=embed`;

function formatRibuan(value) {
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('id-ID');
}

function imgUrl(path) {
  if (!path) return '';
  return path.startsWith('http') ? path : BACKEND + path;
}

/* ── ICONS ──────────────────────────────────────────────── */
const HeartIcon = ({ filled }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

const CartIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

const ChevronIcon = ({ dir = 'right' }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: dir === 'left' ? 'rotate(180deg)' : 'none' }}>
    <path d="M9 18l6-6-6-6" />
  </svg>
);

const InstagramIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5.5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const WhatsAppIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.38 5.07L2 22l5.07-1.32A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm5.2 14.2c-.22.62-1.28 1.18-1.76 1.25-.46.07-1.02.1-1.64-.1-.38-.12-.87-.28-1.5-.55-2.64-1.14-4.36-3.8-4.5-3.98-.13-.18-1.08-1.43-1.08-2.73s.68-1.93.92-2.2c.24-.26.52-.33.7-.33h.5c.16 0 .37-.02.58.45.22.5.74 1.8.8 1.93.07.13.11.28.02.45-.09.18-.14.29-.27.45-.13.16-.27.36-.39.48-.13.13-.26.27-.11.53.15.27.69 1.14 1.48 1.85 1.02.9 1.88 1.18 2.15 1.32.27.13.43.11.59-.07.16-.18.68-.79.86-1.07.18-.27.36-.22.6-.13.25.09 1.55.73 1.82.86.27.13.45.2.51.31.07.11.07.62-.15 1.24z" />
  </svg>
);

const MapPinIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const ChatIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <line x1="4" y1="4" x2="16" y2="16" /><line x1="16" y1="4" x2="4" y2="16" />
  </svg>
);

/* ── REVEAL-ON-SCROLL WRAPPER ───────────────────────────── */
function Reveal({ children, className = '', delay = 0 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal${visible ? ' reveal--visible' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

const TRUST_ITEMS = [
  { tag: 'Original', title: 'Produk 100% Original', sub: 'Setiap item dijamin asli dari brand resmi', big: true },
  { tag: 'Sejak 2017', title: 'Trusted Since 2017', sub: 'Dipercaya pelanggan selama bertahun-tahun' },
  { tag: 'Real-time', title: 'Stok Selalu Update', sub: 'Stok tampil langsung dari sistem toko' },
  { tag: 'Gampang', title: 'Checkout Praktis', sub: 'Favoritkan, keranjang, lalu bayar' },
];

export default function HomePage() {
  const router = useRouter();
  const { addToCart } = useCart();
  const [summary, setSummary] = useState({ total_products: 0, categories: [], newest: [] });
  const [products, setProducts] = useState([]);
  const [favMap, setFavMap] = useState({});
  const [userId, setUserId] = useState(null);
  const [quickView, setQuickView] = useState(null);
  const [fabOpen, setFabOpen] = useState(false);
  const [addedId, setAddedId] = useState(null);
  const newestTrackRef = useRef(null);

  function loadSummary() {
    fetch(`${SUMMARY_API}`).then((r) => r.json()).then(setSummary).catch(console.error);
  }

  // Produk Terbaru pakai katalog asli (endpoint yang sama dengan halaman Produk),
  // bukan data dummy — backend sudah urutkan -created_at jadi paling baru di depan.
  function loadProducts() {
    fetch(`${PRODUCT_API}/list`).then((r) => r.json()).then(setProducts).catch(console.error);
  }

  function loadFavorites(uid) {
    fetch(`${FAV_API}/list?user_id=${uid}`)
      .then((r) => r.json())
      .then((favs) => {
        const map = {};
        favs.forEach((f) => { map[f.product_id] = f.id; });
        setFavMap(map);
      })
      .catch(console.error);
  }

  useEffect(() => {
    loadSummary();
    loadProducts();
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (user) {
      setUserId(user.id);
      loadFavorites(user.id);
    }
  }, []);

  async function tambah(p) {
    const ok = await addToCart(p);
    if (ok) {
      setAddedId(p.id);
      setTimeout(() => setAddedId((cur) => (cur === p.id ? null : cur)), 900);
    }
  }

  async function toggleFav(p) {
    if (!userId) {
      alert('Login dulu sebagai customer ya.');
      return;
    }
    const favId = favMap[p.id];
    if (favId) {
      await fetch(`${FAV_API}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: favId }),
      });
    } else {
      await fetch(`${FAV_API}/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, product_id: p.id }),
      });
    }
    loadFavorites(userId);
  }

  const goToProducts = () => router.push('/customer/product');
  const goToCategory = (name) => router.push(`/customer/product?category=${encodeURIComponent(name)}`);
  const scrollToContact = () => document.getElementById('hubungi-kami')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const scrollNewest = useCallback((dir) => {
    newestTrackRef.current?.scrollBy({ left: dir * 280, behavior: 'smooth' });
  }, []);

  const renderProductCard = (product, big = false) => (
    <div key={product.id} className={`home-card${big ? ' home-card--big' : ''}`} onClick={() => setQuickView(product)}>
      <div className="home-card-img-wrap">
        {product.image ? (
          <img src={imgUrl(product.image)} alt={product.name} className="home-card-img" />
        ) : (
          <div className="home-card-img-placeholder" />
        )}
        <span className="home-card-new-tag">Baru</span>
        <button
          className={`home-fav-btn${favMap[product.id] ? ' home-fav-btn--active' : ''}`}
          onClick={(e) => { e.stopPropagation(); toggleFav(product); }}
        >
          <HeartIcon filled={!!favMap[product.id]} />
        </button>
      </div>
      <div className="home-card-info">
        <p className="home-card-cat">{product.category}</p>
        <p className="home-card-name">{product.name}</p>
        <div className="home-card-bottom">
          <span className="home-card-price">Rp {formatRibuan(product.price)}</span>
          <button
            className={`home-card-cart-btn${addedId === product.id ? ' home-card-cart-btn--added' : ''}`}
            onClick={(e) => { e.stopPropagation(); tambah(product); }}
            title="Tambah ke keranjang"
          >
            {addedId === product.id ? <CheckIcon /> : <CartIcon />}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="home-page">
      {/* ── HERO ─────────────────────────────────────────── */}
      <section className="home-hero">
        <div className="home-hero-blob home-hero-blob--1" />
        <div className="home-hero-blob home-hero-blob--2" />
        <div className="home-hero-blob home-hero-blob--3" />

        <div className="home-hero-text">
          <p className="home-hero-sub">✨ Beauty &amp; personal care terpercaya</p>
          <h1 className="home-hero-title">
            Glow up harianmu, <span className="home-hero-title-accent">mulai dari sini</span>
          </h1>
          <p className="home-hero-desc">
            careofyou menghadirkan produk skincare &amp; makeup original yang nyaman dipakai
            dalam rutinitas kecantikanmu setiap hari.
          </p>
          <div className="home-hero-actions">
            <button className="home-hero-cta" onClick={goToProducts}>
              Jelajahi Produk <ArrowIcon />
            </button>
            <button className="home-hero-cta-ghost" onClick={scrollToContact}>
              Hubungi Kami
            </button>
          </div>
          <div className="home-hero-stats">
            <div className="home-hero-stat">
              <strong>{summary.total_products}</strong>
              <span>produk tersedia</span>
            </div>
            <div className="home-hero-stat">
              <strong>{summary.categories.length}</strong>
              <span>kategori beauty</span>
            </div>
            <div className="home-hero-stat">
              <strong>2.9K+</strong>
              <span>followers IG</span>
            </div>
          </div>
        </div>

        <div className="home-hero-visual">
          <div className="home-hero-img-wrap">
            <img src="/logo-careofyou.png" alt="Careofyou" className="home-hero-img" />
          </div>
          <div className="home-hero-float home-hero-float--1">100% Original</div>
          <div className="home-hero-float home-hero-float--2">Trusted since 2017</div>
        </div>
      </section>

      {/* ── QUICK CATEGORY NAV ──────────────────────────── */}
      {summary.categories.length > 0 && (
        <Reveal className="home-quicknav-wrap">
          <button className="home-quicknav-pill home-quicknav-pill--all" onClick={goToProducts}>
            Semua Produk
          </button>
          {summary.categories.map((cat) => (
            <button key={cat.name} className="home-quicknav-pill" onClick={() => goToCategory(cat.name)}>
              {cat.name}
            </button>
          ))}
        </Reveal>
      )}

      {/* ── TRUST BENTO ──────────────────────────────────── */}
      <section className="home-section">
        <Reveal>
          <div className="home-bento-trust">
            {TRUST_ITEMS.map((item) => (
              <div key={item.title} className={`home-trust-card${item.big ? ' home-trust-card--big' : ''}`}>
                <span className="home-trust-tag">{item.tag}</span>
                <p className="home-trust-title">{item.title}</p>
                <p className="home-trust-sub">{item.sub}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ── CATEGORY BENTO ───────────────────────────────── */}
      {summary.categories.length > 0 && (
        <section className="home-section">
          <Reveal>
            <div className="home-section-header">
              <h2 className="home-section-title">Belanja berdasarkan kategori</h2>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div className="home-cat-grid">
              {summary.categories.map((cat) => (
                <div key={cat.name} className="home-cat-card" onClick={() => goToCategory(cat.name)}>
                  <div
                    className="home-cat-img-wrap"
                    style={cat.image ? { backgroundImage: `url(${imgUrl(cat.image)})` } : undefined}
                  >
                    <div className="home-cat-dim" />
                    <span className="home-cat-label">{cat.name}</span>
                  </div>
                  <div className="home-cat-footer">
                    <p className="home-cat-count-desc">{cat.count} produk tersedia</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </section>
      )}

      {/* ── PRODUK TERBARU — CAROUSEL ────────────────────── */}
      {products.length > 0 && (
        <section className="home-section">
          <Reveal>
            <div className="home-section-header">
              <div>
                <span className="home-section-eyebrow">Baru masuk</span>
                <h2 className="home-section-title">Produk Terbaru</h2>
              </div>
              <div className="home-carousel-nav">
                <button onClick={() => scrollNewest(-1)} aria-label="Sebelumnya"><ChevronIcon dir="left" /></button>
                <button onClick={() => scrollNewest(1)} aria-label="Berikutnya"><ChevronIcon dir="right" /></button>
              </div>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div className="home-scroll-track-wrap">
              <div className="home-scroll-track" ref={newestTrackRef}>
                {products.map((p) => renderProductCard(p, true))}
              </div>
            </div>
          </Reveal>
        </section>
      )}

      {/* ── PROMO BANNER ─────────────────────────────────── */}
      <Reveal>
        <section className="home-promo-wrap">
          <div className="home-promo">
            <div className="home-promo-text">
              <span className="home-promo-label">Toko Kecantikan Terpercaya</span>
              <h3 className="home-promo-title">Original picks untuk kebutuhan beauty harianmu</h3>
            </div>
            <button className="home-promo-btn" onClick={goToProducts}>
              Ke Halaman Produk <ArrowIcon />
            </button>
          </div>
        </section>
      </Reveal>

      {/* ── HUBUNGI KAMI ─────────────────────────────────── */}
      <section className="home-section" id="hubungi-kami">
        <Reveal>
          <div className="home-section-header">
            <div>
              <span className="home-section-eyebrow">Selalu terhubung</span>
              <h2 className="home-section-title">Hubungi Kami</h2>
            </div>
          </div>
        </Reveal>

        <Reveal delay={80}>
          <div className="home-contact-stack">
            <div className="home-contact-mini-row">
              <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="home-contact-mini-link">
                <span className="home-contact-mini-icon home-contact-mini-icon--ig"><InstagramIcon /></span>
                <span className="home-contact-mini-text">
                  Instagram
                  <small>{INSTAGRAM_HANDLE}</small>
                </span>
              </a>
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="home-contact-mini-link">
                <span className="home-contact-mini-icon home-contact-mini-icon--wa"><WhatsAppIcon /></span>
                <span className="home-contact-mini-text">
                  WhatsApp
                  <small>Chat langsung</small>
                </span>
              </a>
            </div>

            <div className="home-contact-map-tile">
              <div className="home-contact-map-embed">
                <iframe
                  src={MAPS_EMBED_URL}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Lokasi Toko careofyou"
                />
              </div>
              <div className="home-contact-map-footer">
                <div className="home-contact-left">
                  <span className="home-contact-icon"><MapPinIcon /></span>
                  <div>
                    <p className="home-contact-title">Lokasi Toko</p>
                    <p className="home-contact-sub">Manado, Tondano, Tomohon</p>
                  </div>
                </div>
                <a href={MAPS_URL} target="_blank" rel="noopener noreferrer" className="home-contact-cta">
                  Lihat di Maps <ArrowIcon />
                </a>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <Footer />

      {/* ── FLOATING CONTACT FAB ─────────────────────────── */}
      <div className="home-fab-wrap">
        {fabOpen && (
          <div className="home-fab-menu">
            <a href={MAPS_URL} target="_blank" rel="noopener noreferrer" className="home-fab-item home-fab-item--maps" title="Lihat Lokasi">
              <MapPinIcon />
            </a>
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="home-fab-item home-fab-item--wa" title="Chat WhatsApp">
              <WhatsAppIcon />
            </a>
            <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="home-fab-item home-fab-item--ig" title="Instagram">
              <InstagramIcon />
            </a>
          </div>
        )}
        <button className="home-fab-main" onClick={() => setFabOpen((o) => !o)}>
          {fabOpen ? <CloseIcon /> : <ChatIcon />}
        </button>
      </div>

      {/* ── QUICK VIEW MODAL ─────────────────────────────── */}
      {quickView && (
        <div className="home-qv-overlay" onClick={() => setQuickView(null)}>
          <div className="home-qv-modal" onClick={(e) => e.stopPropagation()}>
            <button className="home-qv-close" onClick={() => setQuickView(null)}>
              <CloseIcon />
            </button>
            <div className="home-qv-body">
              <div className="home-qv-img-wrap">
                {quickView.image ? (
                  <img src={imgUrl(quickView.image)} alt={quickView.name} />
                ) : (
                  <div className="home-card-img-placeholder" />
                )}
                <div className="home-qv-img-category">{quickView.category}</div>
              </div>
              <div className="home-qv-info">
                <p className="home-qv-cat">{quickView.category}</p>
                <h3 className="home-qv-name">{quickView.name}</h3>
                <p className="home-qv-stock">Stok: {quickView.stock}</p>
                <div className="home-qv-divider" />
                <span className="home-qv-price">Rp {formatRibuan(quickView.price)}</span>
                <div className="home-qv-actions">
                  <button className="home-qv-add-btn" onClick={() => { tambah(quickView); setQuickView(null); }}>
                    <CartIcon /> Tambah ke Keranjang
                  </button>
                  <button
                    className={`home-qv-fav-btn${favMap[quickView.id] ? ' home-qv-fav-btn--active' : ''}`}
                    onClick={() => toggleFav(quickView)}
                    title="Simpan ke favorit"
                  >
                    <HeartIcon filled={!!favMap[quickView.id]} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
