'use client';

import AdminSidebar from '../components/AdminSidebar';

// Layout buat semua halaman admin: sidebar admin di kiri + isi halaman di kanan.
export default function AdminLayout({ children }) {
  return (
    <div>
      <AdminSidebar />
      <main>{children}</main>
    </div>
  );
}
