'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import './page.css';

const API = 'http://localhost:8000/api/customer/cart';
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

export default function CartPage() {
  const [items, setItems] = useState([]);
  const [userId, setUserId] = useState(null);
  const router = useRouter();

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

  // ubah jumlah langsung di row (update lokal + simpan ke backend)
  function changeQty(item, value) {
    const qty = Math.max(1, parseInt(value || '1', 10));
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, quantity: qty } : it)));
    fetch(`${API}/update-qty`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, quantity: qty }),
    }).catch(console.error);
  }

  function remove(item) {
    setItems((prev) => prev.filter((it) => it.id !== item.id));
    fetch(`${API}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id }),
    }).catch(console.error);
  }

  const total = items.reduce((sum, it) => sum + it.price * it.quantity, 0);

  return (
    <div className="cart-page">
      <main className="cart-main">
        <div className="cart-container">
          <div className="cart-header">
            <h1 className="cart-title">Keranjang Belanja</h1>
            <p className="cart-subtitle">
              {userId === null
                ? 'Lihat produk yang siap kamu beli'
                : `${items.length} produk di keranjang`}
            </p>
          </div>

          <div className="cart-divider" />

          {/* GUARD: belum login */}
          {userId === null && (
            <div className="cart-state">
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#e0b0ac" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
              <p className="cart-state-text">Login dulu sebagai customer</p>
              <p className="cart-state-sub">Masuk untuk melihat keranjangmu.</p>
            </div>
          )}

          {/* EMPTY */}
          {userId !== null && items.length === 0 && (
            <div className="cart-state">
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#e0b0ac" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
              <p className="cart-state-text">Keranjang kamu kosong</p>
              <p className="cart-state-sub">Yuk pilih produk favoritmu dulu</p>
              <Link href="/customer/product" className="cart-browse-btn">Mulai Belanja</Link>
            </div>
          )}

          {/* CONTENT */}
          {userId !== null && items.length > 0 && (
            <div className="cart-layout">
              {/* LEFT — item list */}
              <div className="cart-list">
                {items.map((it) => (
                  <div key={it.id} className="cart-card">
                    <div className="cart-card-img-wrap">
                      {it.image ? (
                        <img src={imgUrl(it.image)} alt={it.name} className="cart-card-img" />
                      ) : (
                        <svg className="cart-card-img-placeholder" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <path d="M21 15l-5-5L5 21" />
                        </svg>
                      )}
                    </div>

                    <div className="cart-card-info">
                      {it.category && <p className="cart-card-cat">{it.category}</p>}
                      <p className="cart-card-name">{it.name}</p>
                      <p className="cart-card-unit">Rp {formatRibuan(it.price)} / pcs</p>

                      <div className="cart-qty">
                        <button
                          className="cart-qty-btn"
                          onClick={() => changeQty(it, it.quantity - 1)}
                          disabled={it.quantity <= 1}
                          aria-label="Kurangi"
                        >
                          −
                        </button>
                        <span className="cart-qty-val">{it.quantity}</span>
                        <button
                          className="cart-qty-btn"
                          onClick={() => changeQty(it, it.quantity + 1)}
                          aria-label="Tambah"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="cart-card-right">
                      <button
                        className="cart-remove"
                        onClick={() => remove(it)}
                        title="Hapus dari keranjang"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                      <div className="cart-card-price-wrap">
                        <p className="cart-card-price">Rp {formatRibuan(it.price * it.quantity)}</p>
                        {it.quantity > 1 && <p className="cart-card-each">{it.quantity} × Rp {formatRibuan(it.price)}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* RIGHT — summary */}
              <div className="cart-summary-col">
                <div className="cart-summary">
                  <h2 className="cart-summary-title">Ringkasan Belanja</h2>

                  <div className="cart-summary-row">
                    <span>Total produk</span>
                    <span>{items.reduce((s, it) => s + it.quantity, 0)} pcs</span>
                  </div>

                  <div className="cart-summary-divider" />

                  <div className="cart-summary-total">
                    <span>Total</span>
                    <span>Rp {formatRibuan(total)}</span>
                  </div>

                  <button
                    className="cart-checkout-btn"
                    disabled={items.length === 0}
                    onClick={() => router.push('/customer/cart/checkout')}
                  >
                    Lanjut ke Checkout
                  </button>

                  <p className="cart-summary-note">
                    Ongkir dan metode pembayaran dipilih di halaman checkout.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
