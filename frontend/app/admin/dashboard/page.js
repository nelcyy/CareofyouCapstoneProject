'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import './page.css';

const API = 'http://localhost:8000/api/admin/dashboard';
const BACKEND = 'http://localhost:8000';

function formatRibuan(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '0';
  return Number(digits).toLocaleString('id-ID');
}

function imgUrl(path) {
  if (!path) return '';
  return path.startsWith('http') ? path : BACKEND + path;
}

// warna pill status — MURNI presentasi; nilai status tetap dari backend
const STATUS_COLORS = {
  waiting_admin_approval: { color: '#e09a3a', bg: 'rgba(224,154,58,0.12)' },
  rejected: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  pengemasan: { color: '#4a9fd4', bg: 'rgba(74,159,212,0.12)' },
  pengiriman: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  selesai: { color: '#16a34a', bg: 'rgba(34,197,94,0.12)' },
};

/* ── icons ── */
const IcRevenue = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);
const IcOrders = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);
const IcProducts = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);
const IcCustomers = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

/* ── simple revenue area chart (data dari backend) ── */
function RevenueChart({ series }) {
  const data = Array.isArray(series) ? series : [];
  const hasData = data.some((d) => d.value > 0);
  const W = 560, H = 200;
  const PAD = { top: 24, right: 16, bottom: 32, left: 56 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const maxVal = hasData ? Math.max(...data.map((d) => d.value)) : 1;

  const pts = data.map((d, i) => ({
    x: PAD.left + (data.length > 1 ? (i / (data.length - 1)) * cW : cW / 2),
    y: PAD.top + cH - (d.value / maxVal) * cH,
    val: d.value,
    label: d.label,
  }));

  const linePath = pts.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    const prev = pts[i - 1];
    const cx = ((prev.x + p.x) / 2).toFixed(1);
    return acc + ` C ${cx},${prev.y.toFixed(1)} ${cx},${p.y.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }, '');
  const areaPath = pts.length
    ? linePath + ` L ${pts[pts.length - 1].x.toFixed(1)},${(PAD.top + cH).toFixed(1)} L ${pts[0].x.toFixed(1)},${(PAD.top + cH).toFixed(1)} Z`
    : '';

  const gridVals = [0.25, 0.5, 0.75, 1].map((pct) => ({ y: PAD.top + cH - pct * cH, val: maxVal * pct }));
  const fmtTick = (v) => (v >= 1_000_000 ? (v / 1_000_000).toFixed(1) + 'jt' : (v / 1_000).toFixed(0) + 'rb');

  return (
    <div className="adm-card adm-chart-card">
      <div className="adm-card-header">
        <div>
          <h3 className="adm-card-title">Pendapatan</h3>
          <span className="adm-card-tag">6 Bulan Terakhir</span>
        </div>
      </div>
      <div className="adm-chart-svg-wrap">
        {!hasData && <div className="adm-chart-empty">Belum ada data pendapatan</div>}
        <svg viewBox={`0 0 ${W} ${H}`} className="adm-chart-svg">
          <defs>
            <linearGradient id="rcGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c97269" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#c97269" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#e07a73" /><stop offset="100%" stopColor="#c97269" />
            </linearGradient>
          </defs>
          {gridVals.map((g, i) => (
            <g key={i}>
              <line x1={PAD.left} y1={g.y.toFixed(1)} x2={W - PAD.right} y2={g.y.toFixed(1)} stroke="#f3e8e7" strokeWidth="1" strokeDasharray="5,5" />
              <text x={PAD.left - 8} y={g.y + 4} textAnchor="end" fontSize="9" fill="#bbb">{fmtTick(g.val)}</text>
            </g>
          ))}
          <line x1={PAD.left} y1={PAD.top + cH} x2={W - PAD.right} y2={PAD.top + cH} stroke="#f0e0df" strokeWidth="1" />
          {hasData && (
            <>
              <path d={areaPath} fill="url(#rcGrad)" />
              <path d={linePath} fill="none" stroke="url(#lineGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </>
          )}
          {pts.map((p, i) => (
            <g key={i}>
              {p.val > 0 && <circle cx={p.x} cy={p.y} r={4} fill="white" stroke="#c97269" strokeWidth="2" />}
              <text x={p.x} y={H - 8} textAnchor="middle" fontSize="9.5" fill="#aaa" fontWeight="600">{p.label}</text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API}/stats`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Gagal mengambil data dashboard.');
        setData(json);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message || 'Gagal mengambil data dashboard.');
      })
      .finally(() => setLoading(false));
  }, []);

  const todayLabel = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

  const stats = data
    ? [
        { label: 'Total Pendapatan', value: `Rp ${formatRibuan(data.revenue_total)}`, sub: 'dari pesanan selesai', icon: <IcRevenue />, color: 'rose' },
        { label: 'Total Pesanan', value: data.orders_total, sub: `${data.orders_today} hari ini`, icon: <IcOrders />, color: 'violet' },
        { label: 'Total Produk', value: data.products_total, sub: `${data.products_active} aktif`, icon: <IcProducts />, color: 'blue' },
        { label: 'Total Pelanggan', value: data.customers_total, sub: `${data.customers_new_month} baru bulan ini`, icon: <IcCustomers />, color: 'green' },
      ]
    : [];

  return (
    <div className="adm-dash-page">
      <div className="adm-dash-inner">
        <div className="adm-section-header">
          <div>
            <h2 className="adm-section-title">Dasbor</h2>
            <p className="adm-section-sub">Selamat datang kembali, Admin! Ini ringkasan toko.</p>
          </div>
          <div className="adm-date-badge">{todayLabel}</div>
        </div>

        {loading && <p className="adm-dash-feedback">Memuat data dashboard...</p>}
        {error && <p className="adm-dash-feedback adm-dash-feedback--error">{error}</p>}

        {!loading && data && (
          <>
            {/* Stat cards */}
            <div className="adm-stat-grid">
              {stats.map((s, i) => (
                <div key={i} className="adm-stat-card">
                  <div className="adm-stat-top">
                    <div className={`adm-stat-icon adm-stat-icon--${s.color}`}>{s.icon}</div>
                  </div>
                  <div className="adm-stat-val">{s.value}</div>
                  <div className="adm-stat-label">{s.label}</div>
                  <div className="adm-stat-sub">{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Chart + perlu perhatian */}
            <div className="adm-dash-grid">
              <RevenueChart series={data.revenue_series} />

              <div className="adm-card adm-pending-card">
                <div className="adm-card-header">
                  <h3 className="adm-card-title">Perlu Perhatian</h3>
                </div>
                <div className="adm-pending-list">
                  <div className="adm-alert-item">
                    <span className="adm-alert-dot" />
                    <div>
                      <p className="adm-alert-title">{data.pending_approval} Pesanan Menunggu Persetujuan</p>
                      <p className="adm-alert-sub">Konfirmasi pembayaran menunggu</p>
                    </div>
                    <button className="adm-alert-btn" onClick={() => router.push('/admin/pesanan')}>Lihat</button>
                  </div>

                  <div className="adm-alert-item">
                    <span className={`adm-alert-dot${data.low_stock_count > 0 ? '' : ' adm-alert-dot--green'}`} />
                    <div>
                      <p className="adm-alert-title">
                        {data.low_stock_count > 0
                          ? `${data.low_stock_count} Produk Stok Menipis`
                          : 'Stok Produk Normal'}
                      </p>
                      <p className="adm-alert-sub">
                        {data.low_stock_count > 0
                          ? `Stok ≤ ${data.low_stock_threshold} pcs`
                          : `Semua ${data.products_active} produk aktif tersedia`}
                      </p>
                    </div>
                    {data.low_stock_count > 0 && (
                      <button className="adm-alert-btn" onClick={() => router.push('/admin/produk')}>Lihat</button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Recent orders + top products */}
            <div className="adm-dash-grid">
              <div className="adm-card adm-recent-card">
                <div className="adm-card-header">
                  <h3 className="adm-card-title">Pesanan Terbaru</h3>
                  <button className="adm-link-btn" onClick={() => router.push('/admin/pesanan')}>Lihat semua →</button>
                </div>
                {data.recent_orders.length === 0 ? (
                  <p className="adm-dash-empty">Belum ada pesanan.</p>
                ) : (
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>Kode Order</th>
                        <th>Pelanggan</th>
                        <th>Total</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent_orders.map((o) => {
                        const sc = STATUS_COLORS[o.status] || { color: '#c4706a', bg: 'rgba(214,134,124,0.12)' };
                        return (
                          <tr key={o.order_code}>
                            <td><span className="adm-order-id">{o.order_code}</span></td>
                            <td>{o.customer}</td>
                            <td><strong>Rp {formatRibuan(o.grand_total)}</strong></td>
                            <td><span className="adm-status-pill" style={{ color: sc.color, background: sc.bg }}>{o.status_label}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="adm-card adm-top-products-card">
                <div className="adm-card-header">
                  <h3 className="adm-card-title">Produk Terlaris</h3>
                  <button className="adm-link-btn" onClick={() => router.push('/admin/produk')}>Lihat semua →</button>
                </div>
                {data.top_products.length === 0 ? (
                  <p className="adm-dash-empty">Belum ada penjualan.</p>
                ) : (
                  <div className="adm-top-products">
                    {data.top_products.map((p, i) => (
                      <div key={p.id ?? i} className="adm-top-product-item">
                        <span className="adm-rank">#{i + 1}</span>
                        {p.image ? (
                          <img src={imgUrl(p.image)} alt={p.name} className="adm-top-product-img" />
                        ) : (
                          <span className="adm-top-product-img adm-top-product-img--empty" />
                        )}
                        <div className="adm-top-product-info">
                          <p className="adm-top-product-name">{p.name}</p>
                          <p className="adm-top-product-cat">{p.category || '-'}</p>
                        </div>
                        <div className="adm-top-product-right">
                          <span className="adm-top-product-sold">{p.sold}</span>
                          <span className="adm-top-product-soldlabel">terjual</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
