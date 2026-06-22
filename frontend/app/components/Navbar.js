import Link from 'next/link';

const linkStyle = { marginRight: 16 };

export default function Navbar() {
  return (
    <nav style={{ padding: 12, borderBottom: '1px solid #ccc', marginBottom: 16 }}>
      <Link href="/customer/home" style={linkStyle}>Home</Link>
      <Link href="/customer/product" style={linkStyle}>Product</Link>
      <Link href="/customer/favorites" style={linkStyle}>Favorites</Link>
      <Link href="/customer/cart" style={linkStyle}>Keranjang</Link>
      <Link href="/customer/profile" style={linkStyle}>Profile</Link>
    </nav>
  );
}
