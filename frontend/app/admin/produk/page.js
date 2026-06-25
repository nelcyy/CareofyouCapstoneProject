'use client';

import { useState, useEffect } from 'react';
import { apiUrl, mediaUrl } from '@/api';
import './page.css';

const API = apiUrl('/api/admin/produk');

// kasih separator ribuan, mis. 50000 -> "50.000" (tanpa "Rp")
function formatRibuan(value) {
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('id-ID');
}

// foto disimpan sebagai PATH (mis. /media/products/x.jpg); pas nampilin tambahin host backend
function imgUrl(path) {
  return mediaUrl(path);
}

export default function ProdukPage() {
  const [showPopup, setShowPopup] = useState(false);
  const [mode, setMode] = useState('add'); // 'add' | 'edit'
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);

  // filter (UI-only, client-side)
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState('all');

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

  // daftar kategori unik dari produk (buat pills filter)
  const cats = ['all', ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))];
  const filtered = products.filter((p) => {
    const matchCat = catFilter === 'all' || p.category === catFilter;
    const q = query.trim().toLowerCase();
    const matchQ = !q || p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  return (
    <div className="adm-produk-page">
      <div className="adm-produk-inner">
        <div className="adm-section">
          {/* HEADER */}
          <div className="adm-section-header">
            <div>
              <h2 className="adm-section-title">Manajemen Produk</h2>
              <p className="adm-section-sub">{products.length} produk terdaftar</p>
            </div>
            <button className="adm-primary-btn" onClick={openAdd}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16.5 9.4 7.5 4.21" />
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <line x1="12" y1="22" x2="12" y2="12" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              </svg>
              Tambah Produk
            </button>
          </div>

          {/* FILTERS */}
          <div className="adm-filter-row">
            <div className="adm-search-bar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                className="adm-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari produk…"
              />
              {query && <button className="adm-search-clear" onClick={() => setQuery('')}>✕</button>}
            </div>
            <div className="adm-cat-pills">
              {cats.map((c) => (
                <button
                  key={c}
                  className={`adm-cat-pill${catFilter === c ? ' adm-cat-pill--active' : ''}`}
                  onClick={() => setCatFilter(c)}
                >
                  {c === 'all' ? 'Semua' : c}
                </button>
              ))}
            </div>
          </div>

          {/* TABLE */}
          <div className="adm-card adm-table-card">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Produk</th>
                  <th>Kategori</th>
                  <th>Harga / Pcs</th>
                  <th>Stok</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="adm-table-row--clickable" onClick={() => openEdit(p)}>
                    <td>
                      <div className="adm-product-cell">
                        {p.image ? (
                          <img src={imgUrl(p.image)} alt={p.name} className="adm-product-thumb" />
                        ) : (
                          <span className="adm-product-thumb adm-product-thumb--empty">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <path d="M21 15l-5-5L5 21" />
                            </svg>
                          </span>
                        )}
                        <span className="adm-product-name">{p.name}</span>
                      </div>
                    </td>
                    <td><span className="adm-cat-badge">{p.category}</span></td>
                    <td><strong>Rp {formatRibuan(p.price)}</strong></td>
                    <td>{p.stock} pcs</td>
                    <td>
                      <span className={`adm-status-badge ${p.is_active ? 'adm-status-badge--on' : 'adm-status-badge--off'}`}>
                        {p.is_active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td>
                      <div className="adm-action-btns">
                        <button
                          className="adm-act-btn adm-act-btn--edit"
                          title="Edit"
                          onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
                          </svg>
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="adm-table-empty">
                      {products.length === 0 ? '(belum ada produk)' : 'Tidak ada produk yang cocok.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL ADD / EDIT */}
      {showPopup && (
        <div className="adm-modal-overlay" onClick={() => setShowPopup(false)}>
          <div className="adm-ep-modal" onClick={(e) => e.stopPropagation()}>
            {/* LEFT — image panel */}
            <div className="adm-ep-img-panel">
              <div
                className="adm-ep-img-panel-bg"
                style={image ? { backgroundImage: `url(${imgUrl(image)})` } : {}}
              />
              <div className="adm-ep-img-panel-overlay" />
              <div className="adm-ep-img-top">
                <span className="adm-ep-badge">{mode === 'add' ? 'Produk Baru' : 'Edit Produk'}</span>
                <button type="button" className="adm-ep-close" onClick={() => setShowPopup(false)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="adm-ep-img-center">
                <label className="adm-ep-drop">
                  <input type="file" accept="image/*" onChange={uploadImage} style={{ display: 'none' }} />
                  <span className="adm-ep-drop-inner">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    {image ? 'Ganti Foto' : 'Upload Foto'}
                  </span>
                </label>
              </div>
              <div className="adm-ep-img-bottom">
                <p className="adm-ep-prod-name">{name || 'Nama produk'}</p>
                <p className="adm-ep-prod-cat">
                  {mode === 'edit'
                    ? editCategoryName
                    : (categories.find((c) => String(c.id) === String(category))?.name || 'Kategori')}
                </p>
              </div>
            </div>

            {/* RIGHT — form panel */}
            <form
              className="adm-ep-form"
              onSubmit={(e) => { e.preventDefault(); submit(); }}
            >
              <div className="adm-ep-form-header">
                <h3 className="adm-ep-form-title">{mode === 'add' ? 'Tambah Produk' : 'Detail Produk'}</h3>
                <p className="adm-ep-form-sub">
                  {mode === 'add' ? 'Isi informasi produk baru di bawah ini' : 'Ubah informasi produk di bawah ini'}
                </p>
              </div>

              <div className="adm-ep-fields">
                <div className="adm-ep-field">
                  <label className="adm-ep-label">Nama Produk <span>*</span></label>
                  <div className="adm-ep-input-wrap">
                    <svg className="adm-ep-input-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
                      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                    </svg>
                    <input
                      className="adm-ep-input"
                      placeholder="Masukkan nama produk"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="adm-ep-field">
                  <label className="adm-ep-label">Kategori <span>*</span></label>
                  <div className="adm-ep-input-wrap">
                    <svg className="adm-ep-input-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    {mode === 'add' ? (
                      <select
                        className="adm-ep-input adm-ep-select"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                      >
                        <option value="">— Pilih kategori —</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    ) : (
                      <input className="adm-ep-input" value={editCategoryName} readOnly />
                    )}
                  </div>
                </div>

                <div className="adm-ep-row">
                  <div className="adm-ep-field">
                    <label className="adm-ep-label">Harga (Rp) <span>*</span></label>
                    <div className="adm-ep-input-wrap">
                      <svg className="adm-ep-input-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="1" x2="12" y2="23" />
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                      </svg>
                      <input
                        className="adm-ep-input"
                        placeholder="0"
                        value={formatRibuan(price)}
                        onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))}
                      />
                    </div>
                  </div>
                  <div className="adm-ep-field">
                    <label className="adm-ep-label">Stok (pcs)</label>
                    <div className="adm-ep-input-wrap">
                      <svg className="adm-ep-input-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      </svg>
                      <input
                        type="number"
                        min="0"
                        className="adm-ep-input"
                        placeholder="0"
                        value={stock}
                        onChange={(e) => setStock(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="adm-ep-field">
                  <label className="adm-ep-label">Deskripsi</label>
                  <textarea
                    className="adm-ep-input adm-ep-textarea"
                    placeholder="Deskripsi produk (opsional)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <label className="adm-ep-check">
                  <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                  Produk aktif (tampil di toko)
                </label>
              </div>

              <div className="adm-ep-actions">
                <button type="button" className="adm-ep-cancel" onClick={() => setShowPopup(false)}>Batal</button>
                {mode === 'edit' && (
                  <button type="button" className="adm-ep-delete" onClick={remove}>Hapus</button>
                )}
                <button type="submit" className="adm-ep-save">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {mode === 'add' ? 'Simpan Produk' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
