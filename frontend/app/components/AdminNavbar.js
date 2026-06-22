import Link from 'next/link';

const linkStyle = { marginRight: 16 };

export default function AdminNavbar() {
  return (
    <nav style={{ padding: 12, borderBottom: '1px solid #ccc', marginBottom: 16 }}>
      <Link href="/admin" style={linkStyle}>Dashboard</Link>
      <Link href="/admin/pesanan" style={linkStyle}>Pesanan</Link>
      <Link href="/admin/retur" style={linkStyle}>Retur</Link>
      <Link href="/admin/produk" style={linkStyle}>Produk</Link>
    </nav>
  );
}
