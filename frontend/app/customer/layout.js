'use client';

import { usePathname } from 'next/navigation';
import Navbar from '../components/Navbar';

// Layout buat semua halaman customer: navbar di atas + isi halaman di bawah.
export default function CustomerLayout({ children }) {
  const pathname = usePathname();
  const hideNavbar = pathname === '/customer/cart/checkout';

  return (
    <div className={`customer-shell${hideNavbar ? '' : ' customer-shell--with-navbar'}`}>
      {!hideNavbar && <Navbar />}
      <main className={`customer-main${hideNavbar ? '' : ' customer-main--with-navbar'}`}>
        {children}
      </main>
    </div>
  );
}
