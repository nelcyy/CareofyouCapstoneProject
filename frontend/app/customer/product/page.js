'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Footer from '../../components/Footer';
import './page.css';

const API = 'http://localhost:8000/api/customer/product';
const CART_API = 'http://localhost:8000/api/customer/cart';
const FAV_API = 'http://localhost:8000/api/customer/favorites';
const BACKEND = 'http://localhost:8000';

const ALL_CATEGORY = 'Semua';

function formatRibuan(value) {
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('id-ID');
}

function imgUrl(path) {
  if (!path) return '';
  return path.startsWith('http') ? path : BACKEND + path;
}

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

export default function ProductPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [products, setProducts] = useState([]);
  const [favMap, setFavMap] = useState({}); // { product_id: favorite_id }
  const [userId, setUserId] = useState(null);
  const [quickView, setQuickView] = useState(null);

  function loadProducts() {
    fetch(`${API}/list`).then((r) => r.json()).then(setProducts).catch(console.error);
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
    loadProducts();
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (user) {
      setUserId(user.id);
      loadFavorites(user.id);
    }
  }, []);

  async function tambah(p) {
    if (!userId) {
      alert('Login dulu sebagai customer ya.');
      return;
    }
    const res = await fetch(`${CART_API}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, product_id: p.id }),
    });
    const data = await res.json();
    console.log('[tambah keranjang]', res.status, data);
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

  const categoryNames = useMemo(
    () => [...new Set(products.map((p) => p.category).filter(Boolean))],
    [products]
  );
  const categoryTabs = [ALL_CATEGORY, ...categoryNames];
  const categoryParam = searchParams.get('category');
  const activeCategory = categoryNames.includes(categoryParam) ? categoryParam : ALL_CATEGORY;

  const filteredProducts = activeCategory === ALL_CATEGORY
    ? products
    : products.filter((p) => p.category === activeCategory);

  function handleCategorySelect(category) {
    if (category === ALL_CATEGORY) {
      router.push('/customer/product');
    } else {
      router.push(`/customer/product?category=${encodeURIComponent(category)}`);
    }
  }

  const renderProductCard = (product) => (
    <div key={product.id} className="prod-card" onClick={() => setQuickView(product)}>
      <div className="prod-img-wrap">
        {product.image ? (
          <img src={imgUrl(product.image)} alt={product.name} className="prod-img" />
        ) : (
          <div className="prod-img-placeholder" />
        )}
        {product.stock <= 0 && <span className="prod-badge prod-badge--out">Stok Habis</span>}
        <button
          className={`prod-fav-btn${favMap[product.id] ? ' prod-fav-btn--active' : ''}`}
          onClick={(e) => { e.stopPropagation(); toggleFav(product); }}
        >
          <HeartIcon filled={!!favMap[product.id]} />
        </button>
      </div>
      <div className="prod-info">
        <p className="prod-cat-tag">{product.category}</p>
        <p className="prod-name">{product.name}</p>
        <div className="prod-bottom">
          <div>
            <p className="prod-stock">Stok: {product.stock}</p>
            <p className="prod-price">Rp {formatRibuan(product.price)}</p>
          </div>
          <button
            className="prod-cart-btn"
            onClick={(e) => { e.stopPropagation(); tambah(product); }}
            title="Tambah ke keranjang"
            disabled={product.stock <= 0}
          >
            <CartIcon />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="catalog-page">
      <section className="catalog-hero">
        <div className="catalog-hero-copy">
          <span className="catalog-kicker">Katalog Careofyou</span>
          <h1 className="catalog-title">
            {activeCategory !== ALL_CATEGORY ? activeCategory : 'Jelajahi Produk Kami'}
          </h1>
          <p className="catalog-desc">
            Semua produk beauty original careofyou ada di sini. Pilih kategori atau lihat semua produk sekaligus.
          </p>
          <div className="catalog-stats">
            <div className="catalog-stat">
              <strong>{filteredProducts.length}</strong>
              <span>produk {activeCategory !== ALL_CATEGORY ? 'di kategori ini' : 'tersedia'}</span>
            </div>
            <div className="catalog-stat">
              <strong>{categoryNames.length}</strong>
              <span>kategori</span>
            </div>
          </div>
        </div>
        <div className="catalog-hero-card">
          <p className="catalog-hero-card-label">Kategori Populer</p>
          <div className="catalog-chip-list">
            {categoryNames.map((category) => (
              <span key={category} className="catalog-chip" onClick={() => handleCategorySelect(category)}>
                {category}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="catalog-section">
        <div className="catalog-section-header">
          <div>
            <h2 className="catalog-section-title">
              {activeCategory !== ALL_CATEGORY ? `Kategori: ${activeCategory}` : 'Semua Produk'}
            </h2>
            <p className="catalog-subline">{filteredProducts.length} produk ditemukan</p>
          </div>
          {activeCategory !== ALL_CATEGORY && (
            <button className="catalog-clear-btn" onClick={() => handleCategorySelect(ALL_CATEGORY)}>
              Tampilkan semua produk
            </button>
          )}
        </div>

        <div className="catalog-tabs">
          {categoryTabs.map((category) => (
            <button
              key={category}
              className={`catalog-tab${activeCategory === category ? ' catalog-tab--active' : ''}`}
              onClick={() => handleCategorySelect(category)}
            >
              {category}
            </button>
          ))}
        </div>

        {filteredProducts.length === 0 ? (
          <div className="catalog-empty">
            <p className="catalog-empty-title">Belum ada produk</p>
            <p className="catalog-empty-sub">Coba pilih kategori lain.</p>
          </div>
        ) : (
          <div className="catalog-grid">
            {filteredProducts.map(renderProductCard)}
          </div>
        )}
      </section>

      <Footer />

      {quickView && (
        <div className="catalog-qv-overlay" onClick={() => setQuickView(null)}>
          <div className="catalog-qv-modal" onClick={(e) => e.stopPropagation()}>
            <button className="catalog-qv-close" onClick={() => setQuickView(null)}>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="1" y1="1" x2="13" y2="13" /><line x1="13" y1="1" x2="1" y2="13" />
              </svg>
            </button>
            <div className="catalog-qv-body">
              <div className="catalog-qv-img-wrap">
                {quickView.image ? (
                  <img src={imgUrl(quickView.image)} alt={quickView.name} />
                ) : (
                  <div className="prod-img-placeholder" />
                )}
                <div className="catalog-qv-img-category">{quickView.category}</div>
              </div>
              <div className="catalog-qv-info">
                <p className="catalog-qv-cat">{quickView.category}</p>
                <h3 className="catalog-qv-name">{quickView.name}</h3>
                <p className="catalog-qv-stock">Stok: {quickView.stock}</p>
                <div className="catalog-qv-divider" />
                <span className="catalog-qv-price">Rp {formatRibuan(quickView.price)}</span>
                <div className="catalog-qv-actions">
                  <button
                    className="catalog-qv-add-btn"
                    onClick={() => { tambah(quickView); setQuickView(null); }}
                    disabled={quickView.stock <= 0}
                  >
                    <CartIcon /> Tambah ke Keranjang
                  </button>
                  <button
                    className={`catalog-qv-fav-btn${favMap[quickView.id] ? ' catalog-qv-fav-btn--active' : ''}`}
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
