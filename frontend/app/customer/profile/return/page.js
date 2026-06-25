import './page.css';

export default function ProfileReturnPage() {
  return (
    <div className="profile-return-page">
      <div className="profile-return-header">
        <h2 className="profile-return-title">Retur Saya</h2>
        <p className="profile-return-subtitle">
          Daftar barang yang kamu retur beserta status prosesnya akan tampil di sini.
        </p>
      </div>

      <div className="profile-return-empty">
        <span className="profile-return-empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#e0b0ac" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
        </span>
        <p className="profile-return-empty-title">Belum ada retur</p>
        <p className="profile-return-empty-subtitle">
          Halaman ini sudah disiapkan. Saat ada pengajuan retur, datanya akan muncul di sini.
        </p>
      </div>
    </div>
  );
}
