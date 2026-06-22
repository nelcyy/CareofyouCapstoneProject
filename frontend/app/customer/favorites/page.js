'use client';

import { useState, useEffect } from 'react';

const API = 'http://localhost:8000/api/customer/favorites';
const CART_API = 'http://localhost:8000/api/customer/cart';
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
  const [items, setItems] = useState([]);
  const [userId, setUserId] = useState(null);

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
    fetch(`${API}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id }),
    }).catch(console.error);
  }

  async function tambah(item) {
    const res = await fetch(`${CART_API}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, product_id: item.product_id }),
    });
    const data = await res.json();
    console.log('[tambah keranjang]', res.status, data);
  }

  if (userId === null) {
    return (
      <div>
        <h2>Favorites</h2>
        <p>Login dulu sebagai customer buat lihat favorit.</p>
      </div>
    );
  }

  return (
    <div>
      <h2>Favorites</h2>
      <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>Foto</th>
            <th>Nama</th>
            <th>Kategori</th>
            <th>Harga</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td>{it.image ? <img src={imgUrl(it.image)} alt="" width={40} /> : '-'}</td>
              <td>{it.name}</td>
              <td>{it.category}</td>
              <td>Rp {formatRibuan(it.price)}</td>
              <td>
                <button onClick={() => tambah(it)}>Tambah</button>{' '}
                <button onClick={() => remove(it)}>Unfavorites</button>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={5}>(belum ada favorit)</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
