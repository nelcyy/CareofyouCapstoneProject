 'use client';

import { usePathname } from 'next/navigation';
import AdminNavbar from '../components/AdminNavbar';

// Layout buat semua halaman admin: navbar admin di atas + isi halaman di bawah.
export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const hideNavbar = pathname.startsWith('/admin/pesanan/detail/');

  return (
    <div>
      {!hideNavbar && <AdminNavbar />}
      <main>{children}</main>
    </div>
  );
}
