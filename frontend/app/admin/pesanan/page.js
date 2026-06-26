'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiUrl } from '@/api';
import './page.css';

const API = apiUrl('/api/admin/pesanan');

function formatRibuan(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '0';
  return Number(digits).toLocaleString('id-ID');
}

function initials(name) {
  return (
    (name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?'
  );
}

// Tab status — cocok dengan nilai status dari backend.
const TABS = [
  { key: 'all', label: 'Semua' },
  { key: 'waiting_admin_approval', label: 'Menunggu' },
  { key: 'pengemasan', label: 'Dikemas' },
  { key: 'pengiriman', label: 'Dikirim' },
  { key: 'selesai', label: 'Selesai' },
  { key: 'rejected', label: 'Ditolak' },
];

// Label + warna pill — MURNI presentasi; nilai status/risk tetap dari backend.
const STATUS_META = {
  waiting_admin_approval: { label: 'Menunggu Persetujuan', color: '#e09a3a', bg: 'rgba(224,154,58,0.12)' },
  pengemasan: { label: 'Pengemasan', color: '#4a9fd4', bg: 'rgba(74,159,212,0.12)' },
  pengiriman: { label: 'Pengiriman', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  selesai: { label: 'Selesai', color: '#16a34a', bg: 'rgba(34,197,94,0.12)' },
  rejected: { label: 'Ditolak', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};

const RISK_META = {
  low: { label: 'Rendah', color: '#16a34a', bg: 'rgba(34,197,94,0.1)' },
  medium: { label: 'Sedang', color: '#e09a3a', bg: 'rgba(224,154,58,0.12)' },
  high: { label: 'Tinggi', color: '#ef6c2f', bg: 'rgba(239,108,47,0.12)' },
  critical: { label: 'Kritis', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};

export default function PesananPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch(`${API}/list`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Gagal mengambil daftar pesanan.');
        setItems(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message || 'Gagal mengambil daftar pesanan.');
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((o) => {
      const matchTab = tab === 'all' || o.status === tab;
      const matchQ =
        !q ||
        (o.order_code || '').toLowerCase().includes(q) ||
        (o.customer_name || '').toLowerCase().includes(q);
      return matchTab && matchQ;
    });
  }, [items, tab, query]);

  function openDetail(orderCode) {
    router.push(`/admin/pesanan/detail/${encodeURIComponent(orderCode || '-')}`);
  }

  return (
    <div className="adm-pesanan-page">
      <div className="adm-pesanan-inner">
        <div className="adm-section">
          {/* HEADER */}
          <div className="adm-section-header">
            <div>
              <h2 className="adm-section-title">Manajemen Pesanan</h2>
              <p className="adm-section-sub">{items.length} total pesanan · klik baris untuk lihat detail</p>
            </div>
          </div>

          {/* TABS */}
          <div className="adm-tabs">
            {TABS.map((t) => {
              const count = t.key === 'all' ? items.length : items.filter((o) => o.status === t.key).length;
              return (
                <button
                  key={t.key}
                  className={`adm-tab${tab === t.key ? ' adm-tab--active' : ''}`}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                  <span className="adm-tab-count">{count}</span>
                </button>
              );
            })}
          </div>

          {/* SEARCH */}
          <div className="adm-search-bar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="adm-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari kode order atau nama pelanggan…"
            />
            {query && <button className="adm-search-clear" onClick={() => setQuery('')}>✕</button>}
          </div>

          {/* TABLE */}
          <div className="adm-card adm-table-card">
            {loading ? (
              <p className="adm-pesanan-feedback">Memuat daftar pesanan...</p>
            ) : error ? (
              <p className="adm-pesanan-feedback adm-pesanan-feedback--error">{error}</p>
            ) : (
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Kode Order</th>
                    <th>Pelanggan</th>
                    <th>Total</th>
                    <th>Risiko</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((o, index) => {
                    const st = STATUS_META[o.status] || { label: o.status || '-', color: '#c4706a', bg: 'rgba(214,134,124,0.12)' };
                    const risk = RISK_META[o.risk_level] || { label: o.risk_level || '-', color: '#9ca3af', bg: 'rgba(156,163,175,0.12)' };
                    return (
                      <tr
                        key={o.order_code || index}
                        className="adm-table-row--clickable"
                        onClick={() => openDetail(o.order_code)}
                      >
                        <td><span className="adm-order-id">{o.order_code || '-'}</span></td>
                        <td>
                          <div className="adm-customer-cell">
                            <span className="adm-avatar">{initials(o.customer_name)}</span>
                            <span className="adm-customer-name">{o.customer_name || '-'}</span>
                          </div>
                        </td>
                        <td><strong>Rp {formatRibuan(o.grand_total)}</strong></td>
                        <td><span className="adm-risk-pill" style={{ color: risk.color, background: risk.bg }}>{risk.label}</span></td>
                        <td><span className="adm-status-pill" style={{ color: st.color, background: st.bg }}>{st.label}</span></td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="adm-empty-row">
                        {items.length === 0 ? '(belum ada pesanan)' : 'Tidak ada pesanan yang cocok.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
