 'use client';

import { usePathname } from 'next/navigation';
import Navbar from '../components/Navbar';

// Layout buat semua halaman customer: navbar di atas + isi halaman di bawah.
export default function CustomerLayout({ children }) {
  const pathname = usePathname();
  const hideNavbar = pathname === '/customer/cart/checkout';

  return (
    <div>
      {!hideNavbar && <Navbar />}
      <main>{children}</main>
    </div>
  );
}
