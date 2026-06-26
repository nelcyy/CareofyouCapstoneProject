'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiUrl } from '@/api';
import './page.css';

const API = apiUrl('/api/admin/retur');

function formatRibuan(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '0';
  return Number(digits).toLocaleString('id-ID');
}

function formatTanggal(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
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

// Warna pill status — MURNI presentasi; nilai & label status tetap dari backend.
const STATUS_COLORS = {
  waiting_admin_review: { color: '#e09a3a', bg: 'rgba(224,154,58,0.12)' },
  approved: { color: '#16a34a', bg: 'rgba(34,197,94,0.12)' },
  rejected: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  cancelled: { color: '#9ca3af', bg: 'rgba(156,163,175,0.14)' },
  shipped_back: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  received: { color: '#4a9fd4', bg: 'rgba(74,159,212,0.12)' },
  completed: { color: '#16a34a', bg: 'rgba(34,197,94,0.12)' },
};

const RISK_META = {
  low: { label: 'Rendah', color: '#16a34a', bg: 'rgba(34,197,94,0.1)' },
  medium: { label: 'Sedang', color: '#e09a3a', bg: 'rgba(224,154,58,0.12)' },
  high: { label: 'Tinggi', color: '#ef6c2f', bg: 'rgba(239,108,47,0.12)' },
  critical: { label: 'Kritis', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};

export default function ReturPage() {
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
        if (!res.ok) throw new Error(data.error || 'Gagal mengambil daftar retur.');
        setItems(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message || 'Gagal mengambil daftar retur.');
      })
      .finally(() => setLoading(false));
  }, []);

  // Tab dibangun dari status yang benar-benar ada di data, label-nya pakai
  // status_label dari backend (bukan dikarang di frontend).
  const tabs = useMemo(() => {
    const seen = new Map();
    items.forEach((it) => {
      if (it.status && !seen.has(it.status)) {
        seen.set(it.status, it.status_label || it.status);
      }
    });
    return [{ key: 'all', label: 'Semua' }, ...Array.from(seen, ([key, label]) => ({ key, label }))];
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((r) => {
      const matchTab = tab === 'all' || r.status === tab;
      const matchQ =
        !q ||
        (r.return_code || '').toLowerCase().includes(q) ||
        (r.order_code || '').toLowerCase().includes(q) ||
        (r.customer_name || '').toLowerCase().includes(q);
      return matchTab && matchQ;
    });
  }, [items, tab, query]);

  function openDetail(returnCode) {
    router.push(`/admin/retur/detail/${encodeURIComponent(returnCode || '-')}`);
  }

  return (
    <div className="adm-retur-page">
      <div className="adm-retur-inner">
        <div className="adm-section">
          {/* HEADER */}
          <div className="adm-section-header">
            <div>
              <h2 className="adm-section-title">Manajemen Retur</h2>
              <p className="adm-section-sub">{items.length} total pengajuan · klik baris untuk lihat detail</p>
            </div>
          </div>

          {/* TABS */}
          <div className="adm-tabs">
            {tabs.map((t) => {
              const count = t.key === 'all' ? items.length : items.filter((r) => r.status === t.key).length;
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
              placeholder="Cari kode retur, kode order, atau nama pelanggan…"
            />
            {query && <button className="adm-search-clear" onClick={() => setQuery('')}>✕</button>}
          </div>

          {/* TABLE */}
          <div className="adm-card adm-table-card">
            {loading ? (
              <p className="adm-retur-feedback">Memuat daftar retur...</p>
            ) : error ? (
              <p className="adm-retur-feedback adm-retur-feedback--error">{error}</p>
            ) : (
              <div className="adm-table-scroll">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Kode Retur</th>
                      <th>Pelanggan</th>
                      <th>Kode Order</th>
                      <th>Jenis</th>
                      <th>Nominal</th>
                      <th>Risiko</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r, index) => {
                      const sc = STATUS_COLORS[r.status] || { color: '#c4706a', bg: 'rgba(214,134,124,0.12)' };
                      const risk = RISK_META[r.risk_level] || { label: r.risk_level || '-', color: '#9ca3af', bg: 'rgba(156,163,175,0.12)' };
                      return (
                        <tr
                          key={r.return_code || index}
                          className="adm-table-row--clickable"
                          onClick={() => openDetail(r.return_code)}
                        >
                          <td>
                            <span className="adm-order-id">{r.return_code || '-'}</span>
                            <span className="adm-cell-sub">{formatTanggal(r.created_at)}</span>
                          </td>
                          <td>
                            <div className="adm-customer-cell">
                              <span className="adm-avatar">{initials(r.customer_name)}</span>
                              <div className="adm-customer-meta">
                                <span className="adm-customer-name">{r.customer_name || '-'}</span>
                                {r.customer_email && <span className="adm-customer-email">{r.customer_email}</span>}
                              </div>
                            </div>
                          </td>
                          <td><span className="adm-order-code">{r.order_code || '-'}</span></td>
                          <td>
                            {r.resolution_type_label
                              ? <span className="adm-type-badge">{r.resolution_type_label}</span>
                              : '-'}
                          </td>
                          <td>
                            <strong>Rp {formatRibuan(r.total_requested_amount)}</strong>
                            <span className="adm-cell-sub">{r.total_requested_quantity || 0} pcs</span>
                          </td>
                          <td><span className="adm-risk-pill" style={{ color: risk.color, background: risk.bg }}>{risk.label}</span></td>
                          <td><span className="adm-status-pill" style={{ color: sc.color, background: sc.bg }}>{r.status_label || r.status || '-'}</span></td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={7} className="adm-empty-row">
                          {items.length === 0 ? '(belum ada pengajuan retur)' : 'Tidak ada retur yang cocok.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
