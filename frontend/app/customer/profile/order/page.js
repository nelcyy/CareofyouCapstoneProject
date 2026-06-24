'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const API = 'http://localhost:8000/api/customer/profile/order';

function formatRibuan(value) {
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '0';
  return Number(digits).toLocaleString('id-ID');
}

function formatTanggal(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('id-ID');
}

function getStoredUser() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(window.localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

export default function ProfileOrderPage() {
  const router = useRouter();
  const [userId, setUserId] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const user = getStoredUser();
    if (!user || user.role !== 'customer') {
      setLoading(false);
      return;
    }

    setUserId(user.id);
    fetch(`${API}/list?user_id=${encodeURIComponent(user.id)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Gagal mengambil daftar pesanan.');
        }
        setItems(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message || 'Gagal mengambil daftar pesanan.');
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h2>Pesanan Saya</h2>

      {loading && <p style={{ marginTop: 12 }}>Memuat daftar pesanan...</p>}
      {!loading && !userId && (
        <p style={{ marginTop: 12 }}>Login dulu sebagai customer untuk melihat pesanan.</p>
      )}
      {error && <p style={{ color: 'red', marginTop: 12 }}>{error}</p>}

      {!loading && userId && (
        <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse', marginTop: 16, width: '100%' }}>
          <thead>
            <tr>
              <th>Kode Order</th>
              <th>Total</th>
              <th>Status</th>
              <th>Tanggal Order</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr
                key={item.order_code || index}
                onClick={() => router.push(`/customer/profile/order/detail/${encodeURIComponent(item.order_code || '-')}`)}
                style={{ cursor: 'pointer' }}
              >
                <td>{item.order_code || '-'}</td>
                <td>Rp {formatRibuan(item.grand_total)}</td>
                <td>{item.status || '-'}</td>
                <td>{formatTanggal(item.created_at)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4}>(belum ada pesanan)</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
