'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import './page.css';

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

// Pewarnaan badge status — MURNI presentasi, nilai status tetap apa adanya
// dari backend. Cocokin pakai substring biar fleksibel; kalau tak dikenal,
// fallback ke warna netral (brand). Nilai status pasti datang dari backend.
function statusStyle(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('batal') || s.includes('cancel') || s.includes('tolak') || s.includes('reject'))
    return { color: '#ef4444', bg: 'rgba(239,68,68,0.1)' };
  if (s.includes('selesai') || s.includes('terkirim') || s.includes('deliver') || s.includes('complete'))
    return { color: '#16a34a', bg: 'rgba(34,197,94,0.12)' };
  if (s.includes('kirim') || s.includes('ship'))
    return { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' };
  if (s.includes('kemas') || s.includes('packing') || s.includes('proses') || s.includes('process'))
    return { color: '#4a9fd4', bg: 'rgba(74,159,212,0.12)' };
  if (s.includes('tunggu') || s.includes('pending') || s.includes('bayar') || s.includes('konfirmasi'))
    return { color: '#e09a3a', bg: 'rgba(224,154,58,0.12)' };
  return { color: '#c4706a', bg: 'rgba(214,134,124,0.12)' };
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

  function openDetail(orderCode) {
    router.push(`/customer/profile/order/detail/${encodeURIComponent(orderCode || '-')}`);
  }

  return (
    <div className="profile-order-page">
      <div className="profile-order-header">
        <div>
          <h2 className="profile-order-title">Pesanan Saya</h2>
          <p className="profile-order-subtitle">
            {userId ? `${items.length} pesanan` : 'Riwayat pesanan customer'}
          </p>
        </div>
      </div>

      {loading && <p className="profile-order-feedback">Memuat daftar pesanan...</p>}
      {!loading && !userId && (
        <p className="profile-order-feedback">Login dulu sebagai customer untuk melihat pesanan.</p>
      )}
      {error && <p className="profile-order-feedback profile-order-feedback--error">{error}</p>}

      {!loading && userId && items.length === 0 && (
        <div className="profile-order-empty">
          <span className="profile-order-empty-icon">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#e0b0ac" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
          </span>
          <p className="profile-order-empty-title">Belum ada pesanan</p>
          <p className="profile-order-empty-subtitle">Pesanan kamu akan muncul di sini setelah checkout.</p>
        </div>
      )}

      {!loading && userId && items.length > 0 && (
        <div className="profile-order-list">
          {items.map((item, index) => {
            const style = statusStyle(item.status);
            const code = item.order_code || '-';
            return (
              <div
                key={item.order_code || index}
                className="profile-order-card"
                onClick={() => openDetail(code)}
              >
                <div className="profile-order-card-top">
                  <span className="profile-order-status" style={{ color: style.color, background: style.bg }}>
                    {item.status || '-'}
                  </span>
                  <span className="profile-order-date">{formatTanggal(item.created_at)}</span>
                </div>

                <div className="profile-order-card-body">
                  <span className="profile-order-code-label">Kode Order</span>
                  <span className="profile-order-code">{code}</span>
                </div>

                <div className="profile-order-card-bottom">
                  <span className="profile-order-see-detail">Lihat Detail ›</span>
                  <span className="profile-order-total">Rp {formatRibuan(item.grand_total)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
