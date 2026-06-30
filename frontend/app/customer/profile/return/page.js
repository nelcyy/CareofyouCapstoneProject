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

const RETURN_STATUS_META = {
  waiting_admin_review: { color: '#e09a3a', bg: 'rgba(224,154,58,0.12)' },
  approved: { color: '#4a9fd4', bg: 'rgba(74,159,212,0.12)' },
  rejected: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  cancelled: { color: '#a59b99', bg: 'rgba(165,155,153,0.12)' },
  shipped_back: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  received: { color: '#0ea5e9', bg: 'rgba(14,165,233,0.12)' },
  completed: { color: '#16a34a', bg: 'rgba(34,197,94,0.12)' },
};

function IconCalendar() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconRotate() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
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
        <div className="profile-return-list">
          {items.map((item) => {
            const statusMeta = RETURN_STATUS_META[item.status] || { color: '#c4706a', bg: 'rgba(214,134,124,0.12)' };
            const qty = item.total_requested_quantity || 0;
            return (
              <div
                key={item.return_code}
                className="profile-return-card"
                onClick={() => openDetail(item.return_code)}
              >
                <div className="profile-return-card-top">
                  <span className="profile-return-status-pill" style={{ color: statusMeta.color, background: statusMeta.bg }}>
                    {item.status_label || item.status || '-'}
                  </span>
                  <span className="profile-return-card-date">
                    <IconCalendar /> {formatTanggal(item.created_at)}
                  </span>
                </div>

                <div className="profile-return-card-body">
                  <span className="profile-return-code-icon"><IconRotate /></span>
                  <span className="profile-return-code-label">Kode Retur</span>
                  <span className="profile-return-code">{item.return_code}</span>
                  {qty > 0 && <span className="profile-return-qty">{qty} pcs</span>}
                </div>

                <p className="profile-return-order-ref">Dari pesanan <strong>{item.order_code || '-'}</strong></p>

                <div className="profile-return-card-bottom">
                  <span className="profile-return-see-detail">
                    Lihat Detail <IconChevronRight />
                  </span>
                  <span className="profile-return-card-total">Rp {formatRibuan(item.total_requested_amount)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
