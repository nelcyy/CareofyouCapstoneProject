'use client';

import { useState, useEffect } from 'react';

const API = 'http://localhost:8000/api/admin/produk';

// styling minimal cuma biar popup-nya "ngambang" di tengah (bukan desain)
const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const modal = {
  background: '#fff', color: '#000', padding: 20,
  border: '1px solid #333', minWidth: 320, maxHeight: '90vh', overflowY: 'auto',
};

// kasih separator ribuan, mis. 50000 -> "50.000" (tanpa "Rp")
function formatRibuan(value) {
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('id-ID');
}

// foto disimpan sebagai PATH (mis. /media/products/x.jpg); pas nampilin tambahin host backend
const BACKEND = 'http://localhost:8000';
function imgUrl(path) {
  if (!path) return '';
  return path.startsWith('http') ? path : BACKEND + path;
}

export default function ProdukPage() {
  const [showPopup, setShowPopup] = useState(false);
  const [mode, setMode] = useState('add'); // 'add' | 'edit'
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);

  // field form (dipakai add & edit)
  const [editId, setEditId] = useState(null);
  const [editCategoryName, setEditCategoryName] = useState(''); // readonly pas edit
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [category, setCategory] = useState(''); // category id (buat select pas add)
  const [isActive, setIsActive] = useState(true);
  const [image, setImage] = useState(''); // URL foto

  function loadCategories() {
    fetch(`${API}/categories`).then((r) => r.json()).then(setCategories).catch(console.error);
  }
  function loadProducts() {
    fetch(`${API}/list`).then((r) => r.json()).then(setProducts).catch(console.error);
  }

  useEffect(() => {
    loadCategories();
    loadProducts();
  }, []);

  function openAdd() {
    setMode('add');
    setName('');
    setDescription('');
    setPrice('');
    setStock('');
    setCategory('');
    setIsActive(true);
    setImage('');
    setShowPopup(true);
  }

  function openEdit(p) {
    setMode('edit');
    setEditId(p.id);
    setEditCategoryName(p.category);
    setName(p.name);
    setDescription(p.description);
    setPrice(String(p.price));
    setStock(String(p.stock));
    setIsActive(p.is_active);
    setImage(p.image || '');
    setShowPopup(true);
  }

  // upload file -> backend simpen -> dapet URL
  async function uploadImage(e) {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    const res = await fetch(`${API}/upload-image`, { method: 'POST', body: fd });
    const data = await res.json();
    console.log('[upload image]', res.status, data);
    if (res.ok) setImage(data.url);
  }

  async function submit() {
    const url = mode === 'add' ? `${API}/create` : `${API}/update`;
    const body =
      mode === 'add'
        ? { name, description, price, stock, category_id: category, is_active: isActive, image }
        : { id: editId, name, description, price, stock, is_active: isActive, image };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    console.log(`[${mode} produk]`, res.status, data);
    if (res.ok) {
      setShowPopup(false);
      loadProducts();
    }
  }

  async function remove() {
    if (!confirm('Yakin hapus produk ini?')) return;
    const res = await fetch(`${API}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editId }),
    });
    const data = await res.json();
    console.log('[hapus produk]', res.status, data);
    if (res.ok) {
      setShowPopup(false);
      loadProducts();
    }
  }

  return (
    <div>
      <h2>Produk</h2>
      <button onClick={openAdd}>+ Tambah Produk</button>

      <table border="1" cellPadding="6" style={{ marginTop: 16, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>ID</th>
            <th>Foto</th>
            <th>Nama</th>
            <th>Kategori</th>
            <th>Harga</th>
            <th>Stok</th>
            <th>Aktif</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} onClick={() => openEdit(p)} style={{ cursor: 'pointer' }}>
              <td>{p.id}</td>
              <td>{p.image ? <img src={imgUrl(p.image)} alt="" width={40} /> : '-'}</td>
              <td>{p.name}</td>
              <td>{p.category}</td>
              <td>Rp {formatRibuan(p.price)}</td>
              <td>{p.stock}</td>
              <td>{p.is_active ? 'Ya' : 'Tidak'}</td>
            </tr>
          ))}
          {products.length === 0 && (
            <tr>
              <td colSpan={7}>(belum ada produk)</td>
            </tr>
          )}
        </tbody>
      </table>
      <p style={{ fontSize: 12, color: '#666' }}>* klik baris buat edit</p>

      {showPopup && (
        <div style={overlay}>
          <div style={modal}>
            <h3>{mode === 'add' ? 'Tambah Produk' : 'Edit Produk'}</h3>

            {mode === 'edit' && (
              <p>
                Kategori:
                <br />
                <input value={editCategoryName} readOnly />
              </p>
            )}

            <p>
              Nama:
              <br />
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </p>
            <p>
              Deskripsi:
              <br />
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </p>
            <p>
              Harga (Rp):
              <br />
              <input value={formatRibuan(price)} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} />
            </p>
            <p>
              Stok:
              <br />
              <input type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
            </p>

            {mode === 'add' && (
              <p>
                Kategori:
                <br />
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">-- pilih kategori --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </p>
            )}

            <p>
              Foto:
              <br />
              <input type="file" accept="image/*" onChange={uploadImage} />
              {image && <img src={imgUrl(image)} alt="preview" width={80} style={{ display: 'block', marginTop: 4 }} />}
            </p>

            <p>
              <label>
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Aktif
              </label>
            </p>
            <button onClick={submit}>Simpan</button>{' '}
            <button onClick={() => setShowPopup(false)}>Batal</button>
            {mode === 'edit' && (
              <>
                {' '}
                <button onClick={remove}>Hapus</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
