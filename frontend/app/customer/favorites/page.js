'use client';

import { useState, useEffect } from 'react';
import { useCart } from '../../components/CartContext';
import './page.css';

const API = 'http://localhost:8000/api/customer/favorites';
const BACKEND = 'http://localhost:8000';

function formatRibuan(value) {
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('id-ID');
}

function imgUrl(path) {
  if (!path) return '';
  return path.startsWith('http') ? path : BACKEND + path;
}

export default function FavoritesPage() {
  const { addToCart } = useCart();
  const [items, setItems] = useState([]);
  const [userId, setUserId] = useState(null);
  // id produk yang lagi nampilin animasi konfirmasi (sesaat, lalu hilang)
  const [confirming, setConfirming] = useState([]);

  function load(uid) {
    fetch(`${API}/list?user_id=${uid}`).then((r) => r.json()).then(setItems).catch(console.error);
  }

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (user) {
      setUserId(user.id);
      load(user.id);
    }
  }, []);

  function remove(item) {
    setItems((prev) => prev.filter((it) => it.id !== item.id));
    setConfirming((prev) => prev.filter((id) => id !== item.id));
    fetch(`${API}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id }),
    }).catch(console.error);
  }

  // munculin animasi konfirmasi sesaat (button-nya sendiri gak berubah)
  function pingConfirm(id) {
    setConfirming((prev) => prev.filter((x) => x !== id));
    // reset dulu biar animasi bisa main ulang kalau diklik cepat berturut-turut
    requestAnimationFrame(() => {
      setConfirming((prev) => [...prev, id]);
      setTimeout(() => {
        setConfirming((prev) => prev.filter((x) => x !== id));
      }, 1400);
    });
  }

  async function tambah(item) {
    pingConfirm(item.id);
    await addToCart({ id: item.product_id });
  }

  function tambahSemua() {
    items.forEach((item) => tambah(item));
  }

  return (
    <div className="wl-page">
      <main className="wl-main">
        <div className="wl-container">
          {/* HEADER */}
          <div className="wl-header">
            <div>
              <h1 className="wl-title">Favorit Kamu</h1>
              <p className="wl-subtitle">{items.length} produk tersimpan</p>
            </div>
            {userId !== null && items.length > 0 && (
              <button className="wl-add-all-btn" onClick={tambahSemua}>
                Tambah semua ke keranjang
              </button>
            )}
          </div>

          {/* DIVIDER */}
          <div className="wl-divider" />

          {/* GUARD: belum login */}
          {userId === null && (
            <div className="wl-guard">
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#e0b0ac" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              <p className="wl-guard-text">Login dulu sebagai customer</p>
              <p className="wl-guard-sub">Masuk untuk melihat produk favoritmu.</p>
            </div>
          )}

          {/* EMPTY STATE */}
          {userId !== null && items.length === 0 && (
            <div className="wl-empty">
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#e0b0ac" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              <p className="wl-empty-text">Wishlist kamu kosong</p>
              <p className="wl-empty-sub">Simpan produk favoritmu di sini</p>
            </div>
          )}

          {/* ITEM LIST */}
          {userId !== null && items.length > 0 && (
            <div className="wl-list">
              {items.map((it) => (
                <div key={it.id} className="wl-card">
                  <div className="wl-card-img-wrap">
                    {it.image ? (
                      <img src={imgUrl(it.image)} alt={it.name} className="wl-card-img" />
                    ) : (
                      <svg className="wl-card-img-placeholder" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                    )}
                  </div>

                  <div className="wl-card-info">
                    {it.brand && <p className="wl-card-brand">{it.brand}</p>}
                    <p className="wl-card-name">{it.name}</p>
                    <p className="wl-card-price">Rp {formatRibuan(it.price)}</p>
                    {it.category && <p className="wl-card-size">{it.category}</p>}
                    {it.size && <p className="wl-card-size">Ukuran: {it.size}</p>}

                    <div className="wl-add-wrap">
                      <button className="wl-add-btn" onClick={() => tambah(it)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="9" cy="21" r="1" />
                          <circle cx="20" cy="21" r="1" />
                          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                        </svg>
                        Tambah ke Keranjang
                      </button>

                      {confirming.includes(it.id) && (
                        <span className="wl-add-confirm" aria-live="polite">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Masuk keranjang
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    className="wl-remove-btn"
                    onClick={() => remove(it)}
                    title="Hapus dari favorit"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
