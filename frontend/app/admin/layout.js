'use client';

import AdminSidebar from '../components/AdminSidebar';
import './layout.css';

// Layout buat semua halaman admin: sidebar admin di kiri + isi halaman di kanan.
export default function AdminLayout({ children }) {
  return (
    <div className="adm-shell">
      <AdminSidebar />
      <main>{children}</main>
    </div>
  );
}
