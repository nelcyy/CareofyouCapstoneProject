'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiUrl } from '@/api';

const API = apiUrl('/api/admin/retur');

function formatTanggal(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('id-ID');
}

export default function ReturPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API}/list`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Gagal mengambil daftar retur.');
        }
        setItems(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message || 'Gagal mengambil daftar retur.');
      })
      .finally(() => setLoading(false));
  }, []);

  function openDetail(returnCode) {
    router.push(`/admin/retur/detail/${encodeURIComponent(returnCode || '-')}`);
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>Retur</h2>

      {loading && <p>Memuat daftar retur...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {!loading && (
        <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Kode Retur</th>
              <th>Kode Order</th>
              <th>Tanggal</th>
              <th>Qty</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr
                key={item.return_code || index}
                onClick={() => openDetail(item.return_code)}
                style={{ cursor: 'pointer' }}
              >
                <td>{item.customer_name || '-'}</td>
                <td>{item.return_code || '-'}</td>
                <td>{item.order_code || '-'}</td>
                <td>{formatTanggal(item.created_at)}</td>
                <td>{item.total_requested_quantity || 0} pcs</td>
                <td>{item.status_label || item.status || '-'}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6}>(belum ada pengajuan retur)</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
