'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const API = 'http://localhost:8000/api/admin/pesanan';

function formatRibuan(value) {
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('id-ID');
}

export default function PesananPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);

  useEffect(() => {
    fetch(`${API}/list`)
      .then((r) => r.json())
      .then(setItems)
      .catch(console.error);
  }, []);

  return (
    <div>
      <h2>Pesanan</h2>
      <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>Customer</th>
            <th>Kode Order</th>
            <th>Total</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, index) => (
            <tr
              key={it.order_code || index}
              onClick={() => router.push(`/admin/pesanan/detail/${encodeURIComponent(it.order_code || '-')}`)}
              style={{ cursor: 'pointer' }}
            >
              <td>{it.customer_name}</td>
              <td>{it.order_code || '-'}</td>
              <td>Rp {formatRibuan(it.grand_total)}</td>
              <td>{it.status}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={4}>(belum ada pesanan)</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
