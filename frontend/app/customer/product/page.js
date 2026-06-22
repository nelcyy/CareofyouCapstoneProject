'use client';

import { useState, useEffect } from 'react';

const API = 'http://localhost:8000/api/customer/product';
const CART_API = 'http://localhost:8000/api/customer/cart';
const FAV_API = 'http://localhost:8000/api/customer/favorites';
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

export default function ProductPage() {
  const [products, setProducts] = useState([]);
  const [favMap, setFavMap] = useState({}); // { product_id: favorite_id }

  function loadProducts() {
    fetch(`${API}/list`).then((r) => r.json()).then(setProducts).catch(console.error);
  }

  function loadFavorites() {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (!user) return;
    fetch(`${FAV_API}/list?user_id=${user.id}`)
      .then((r) => r.json())
      .then((favs) => {
        const map = {};
        favs.forEach((f) => {
          map[f.product_id] = f.id;
        });
        setFavMap(map);
      })
      .catch(console.error);
  }

  useEffect(() => {
    loadProducts();
    loadFavorites();
  }, []);

  async function tambah(p) {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (!user) {
      alert('Login dulu sebagai customer ya.');
      return;
    }
    const res = await fetch(`${CART_API}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id, product_id: p.id }),
    });
    const data = await res.json();
    console.log('[tambah keranjang]', res.status, data);
  }

  async function toggleFav(p) {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (!user) {
      alert('Login dulu sebagai customer ya.');
      return;
    }
    const favId = favMap[p.id];
    if (favId) {
      // udah favorit -> hapus (unfavorite)
      await fetch(`${FAV_API}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: favId }),
      });
    } else {
      // belum favorit -> tambah
      await fetch(`${FAV_API}/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, product_id: p.id }),
      });
    }
    loadFavorites(); // refresh status tombol
  }

  return (
    <div>
      <h2>Produk</h2>
      <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>Foto</th>
            <th>Nama</th>
            <th>Kategori</th>
            <th>Harga</th>
            <th>Stok</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td>{p.image ? <img src={imgUrl(p.image)} alt="" width={40} /> : '-'}</td>
              <td>{p.name}</td>
              <td>{p.category}</td>
              <td>Rp {formatRibuan(p.price)}</td>
              <td>{p.stock}</td>
              <td>
                <button onClick={() => tambah(p)}>Tambah</button>{' '}
                <button onClick={() => toggleFav(p)}>{favMap[p.id] ? 'Unfavorites' : 'Favorites'}</button>
              </td>
            </tr>
          ))}
          {products.length === 0 && (
            <tr>
              <td colSpan={6}>(belum ada produk)</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
