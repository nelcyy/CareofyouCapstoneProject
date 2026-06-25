'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiUrl } from '@/api';

const API = apiUrl('/api/customer/cart');

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [userId, setUserId] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);

  const loadCart = useCallback((uid) => {
    fetch(`${API}/list?user_id=${uid}`).then((r) => r.json()).then(setItems).catch(console.error);
  }, []);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (user) {
      setUserId(user.id);
      loadCart(user.id);
    }
  }, [loadCart]);

  async function addToCart(product) {
    if (!userId) {
      alert('Login dulu sebagai customer ya.');
      return false;
    }
    await fetch(`${API}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, product_id: product.id }),
    });
    loadCart(userId);
    return true;
  }

  function updateQty(item, quantity) {
    const qty = Math.max(1, quantity);
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, quantity: qty } : it)));
    fetch(`${API}/update-qty`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, quantity: qty }),
    }).catch(console.error);
  }

  function removeItem(item) {
    setItems((prev) => prev.filter((it) => it.id !== item.id));
    fetch(`${API}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id }),
    }).catch(console.error);
  }

  const cartCount = items.reduce((sum, it) => sum + it.quantity, 0);
  const cartTotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, userId, cartOpen, setCartOpen, loadCart, addToCart, updateQty, removeItem, cartCount, cartTotal }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart harus dipakai di dalam <CartProvider>');
  return ctx;
}
