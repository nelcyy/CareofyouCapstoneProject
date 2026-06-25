'use client';

import { usePathname } from 'next/navigation';
import Navbar from '../components/Navbar';
import CartSidebar from '../components/CartSidebar';
import { CartProvider } from '../components/CartContext';

// Layout buat semua halaman customer: navbar di atas + isi halaman di bawah.
// CartProvider dipasang di sini (bukan di tiap page) supaya state keranjang
// (badge navbar + sidebar) sama persis di halaman manapun.
export default function CustomerLayout({ children }) {
  const pathname = usePathname();
  const hideNavbar = pathname === '/customer/cart/checkout';

  return (
    <CartProvider>
      <div className={`customer-shell${hideNavbar ? '' : ' customer-shell--with-navbar'}`}>
        {!hideNavbar && <Navbar />}
        <main className={`customer-main${hideNavbar ? '' : ' customer-main--with-navbar'}`}>
          {children}
        </main>
      </div>
      <CartSidebar />
    </CartProvider>
  );
}
