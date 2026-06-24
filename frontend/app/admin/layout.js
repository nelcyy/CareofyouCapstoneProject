 'use client';

import { usePathname } from 'next/navigation';
import AdminSidebar from '../components/AdminSidebar';

// Layout buat semua halaman admin: sidebar admin di kiri + isi halaman di kanan.
export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const hideSidebar = pathname.startsWith('/admin/pesanan/detail/');

  return (
    <div>
      {!hideSidebar && <AdminSidebar />}
      <main>{children}</main>
    </div>
  );
}
