'use client';

import { useRouter } from 'next/navigation';
import { mediaUrl } from '@/api';
import { useCart } from './CartContext';
import './CartSidebar.css';

function formatRupiah(value) {
  return 'Rp ' + Number(value || 0).toLocaleString('id-ID');
}

function imgUrl(path) {
  return mediaUrl(path);
}

const BagIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);

export default function CartSidebar() {
  const router = useRouter();
  const { items, cartOpen, setCartOpen, updateQty, removeItem, cartTotal } = useCart();

  return (
    <>
      {cartOpen && <div className="cart-overlay" onClick={() => setCartOpen(false)} />}

      <div className={`cart-sidebar${cartOpen ? ' cart-sidebar-open' : ''}`}>
        <div className="cart-sidebar-header">
          <h2 className="cart-sidebar-title">Keranjang Belanja</h2>
          <button className="cart-sidebar-close" onClick={() => setCartOpen(false)} aria-label="Tutup">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="4" y1="4" x2="20" y2="20" /><line x1="20" y1="4" x2="4" y2="20" />
            </svg>
          </button>
        </div>

        {items.length === 0 ? (
          <div className="cart-sidebar-empty">
            <span className="cart-sidebar-empty-icon"><BagIcon /></span>
            <p>Keranjang kamu kosong</p>
            <button className="cart-sidebar-shop-btn" onClick={() => { setCartOpen(false); router.push('/customer/product'); }}>
              Mulai Belanja
            </button>
          </div>
        ) : (
          <>
            <div className="cart-sidebar-items">
              {items.map((item) => (
                <div key={item.id} className="cart-sidebar-item">
                  {item.image ? (
                    <img src={imgUrl(item.image)} alt={item.name} className="cart-sidebar-item-img" />
                  ) : (
                    <div className="cart-sidebar-item-img cart-sidebar-item-img--placeholder" />
                  )}
                  <div className="cart-sidebar-item-info">
                    <p className="cart-sidebar-item-name">{item.name}</p>
                    <p className="cart-sidebar-item-price">{formatRupiah(item.price)}</p>
                    <div className="cart-sidebar-qty">
                      <button className="cart-sidebar-qty-btn" onClick={() => updateQty(item, item.quantity - 1)} disabled={item.quantity <= 1}>−</button>
                      <span className="cart-sidebar-qty-val">{item.quantity}</span>
                      <button className="cart-sidebar-qty-btn" onClick={() => updateQty(item, item.quantity + 1)}>+</button>
                    </div>
                  </div>
                  <button className="cart-sidebar-item-remove" onClick={() => removeItem(item)} aria-label="Hapus item" title="Hapus item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" /><path d="M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            <div className="cart-sidebar-footer">
              <div className="cart-sidebar-total-row">
                <span>Total Belanja</span>
                <span className="cart-sidebar-total-val">{formatRupiah(cartTotal)}</span>
              </div>
              <button
                className="cart-sidebar-checkout-btn"
                onClick={() => { setCartOpen(false); router.push('/customer/cart/checkout'); }}
              >
                Lanjut ke Checkout
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
