'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

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

  if (userId === null) {
    return (
      <div>
        <h2>Keranjang</h2>
        <p>Login dulu sebagai customer buat lihat keranjang.</p>
      </div>
    );
  }

  return (
    <div>
      <h2>Keranjang</h2>
      <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>Foto</th>
            <th>Nama</th>
            <th>Kategori</th>
            <th>Harga</th>
            <th>Pcs</th>
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
                <input
                  type="number"
                  min="1"
                  value={it.quantity}
                  style={{ width: 50 }}
                  onChange={(e) => changeQty(it, e.target.value)}
                />
              </td>
              <td>
                <button onClick={() => remove(it)}>Hapus</button>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={6}>(keranjang kosong)</td>
            </tr>
          )}
        </tbody>
      </table>

      <p>
        <b>Total: Rp {formatRibuan(total)}</b>
      </p>
      <button disabled={items.length === 0} onClick={() => router.push('/customer/cart/checkout')}>
        Checkout
      </button>
    </div>
  );
}
