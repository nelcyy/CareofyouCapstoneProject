'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiUrl } from '@/api';
import './page.css';

const API = apiUrl('/api/customer/profile/return');

function formatRibuan(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
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

export default function ProfileReturnPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userFound, setUserFound] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    if (!user || user.role !== 'customer') {
      setLoading(false);
      return;
    }

    setUserFound(true);
    fetch(`${API}/list?user_id=${encodeURIComponent(user.id)}`)
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
    router.push(`/customer/profile/return/detail/${encodeURIComponent(returnCode || '-')}`);
  }

  return (
    <div className="profile-return-page">
      <div className="profile-return-header">
        <h2 className="profile-return-title">Retur Saya</h2>
        <p className="profile-return-subtitle">
          Riwayat pengajuan retur kamu akan tampil di sini setelah dikirim dari detail pesanan.
        </p>
      </div>

      {loading && <p className="profile-return-feedback">Memuat daftar retur...</p>}
      {!loading && !userFound && (
        <p className="profile-return-feedback">Login dulu sebagai customer untuk melihat daftar retur.</p>
      )}
      {error && <p className="profile-return-feedback profile-return-feedback--error">{error}</p>}

      {!loading && userFound && items.length === 0 && (
        <div className="profile-return-empty">
          <span className="profile-return-empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#e0b0ac" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
          </span>
          <p className="profile-return-empty-title">Belum ada retur</p>
          <p className="profile-return-empty-subtitle">
            Saat kamu berhasil mengajukan retur dari detail pesanan, datanya akan muncul di sini.
          </p>
        </div>
      )}

      {!loading && userFound && items.length > 0 && (
        <div className="profile-return-table-wrap">
          <table className="profile-return-table">
            <thead>
              <tr>
                <th>Kode Retur</th>
                <th>Kode Order</th>
                <th>Tanggal</th>
                <th>Qty</th>
                <th>Nominal</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.return_code}
                  className="profile-return-row"
                  onClick={() => openDetail(item.return_code)}
                >
                  <td>
                    <strong>{item.return_code}</strong>
                  </td>
                  <td>{item.order_code || '-'}</td>
                  <td>{formatTanggal(item.created_at)}</td>
                  <td>{item.total_requested_quantity || 0} pcs</td>
                  <td>Rp {formatRibuan(item.total_requested_amount)}</td>
                  <td>{item.status_label || item.status || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
