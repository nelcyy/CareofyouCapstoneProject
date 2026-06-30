'use client';

import { useEffect, useState } from 'react';
import { apiUrl } from '@/api';
import './page.css';

const API = apiUrl('/api/customer/profile/address');

function IconPin() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function getStoredUser() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(window.localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

function emptyForm() {
  return {
    label: 'Rumah',
    recipient_name: '',
    phone: '',
    address_line: '',
    city: '',
    province: '',
    postal_code: '',
    notes: '',
    is_default: false,
  };
}

export default function ProfileAddressPage() {
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addresses, setAddresses] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());

  async function loadAddresses(uid) {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch(`${API}/list?user_id=${encodeURIComponent(uid)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengambil alamat.');
      }
      setAddresses(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Gagal mengambil alamat.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const user = getStoredUser();
    if (!user || user.role !== 'customer') {
      setLoading(false);
      return;
    }

    setUserId(user.id);
    loadAddresses(user.id);
  }, []);

  function openCreateModal() {
    const user = getStoredUser();
    setEditingId(null);
    setForm({
      label: 'Rumah',
      recipient_name: user?.name || '',
      phone: user?.phone || '',
      address_line: '',
      city: '',
      province: '',
      postal_code: '',
      notes: '',
      is_default: addresses.length === 0,
    });
    setError('');
    setIsModalOpen(true);
  }

  function openEditModal(item) {
    setEditingId(item.id);
    setForm({
      label: item.label || 'Rumah',
      recipient_name: item.recipient_name || '',
      phone: item.phone || '',
      address_line: item.address_line || '',
      city: item.city || '',
      province: item.province || '',
      postal_code: item.postal_code || '',
      notes: item.notes || '',
      is_default: item.is_default || false,
    });
    setError('');
    setIsModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setIsModalOpen(false);
  }

  function handleChange(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!userId || saving) return;

    setSaving(true);
    setError('');
    setMessage('');

    const isEditing = Boolean(editingId);
    const endpoint = isEditing ? 'update' : 'create';
    const payload = {
      user_id: userId,
      label: form.label,
      recipient_name: form.recipient_name,
      phone: form.phone,
      address_line: form.address_line,
      city: form.city,
      province: form.province,
      postal_code: form.postal_code,
      notes: form.notes,
    };
    if (!isEditing) {
      payload.is_default = form.is_default;
    }
    if (isEditing) {
      payload.address_id = editingId;
    }

    try {
      const res = await fetch(`${API}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menyimpan alamat.');
      }

      setMessage(data.message || (isEditing ? 'Alamat berhasil diupdate.' : 'Alamat berhasil ditambahkan.'));
      setIsModalOpen(false);
      await loadAddresses(userId);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Gagal menyimpan alamat.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(addressId) {
    if (!userId || saving) return;
    if (!window.confirm('Hapus alamat ini?')) return;

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch(`${API}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          address_id: addressId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menghapus alamat.');
      }

      setMessage(data.message || 'Alamat berhasil dihapus.');
      await loadAddresses(userId);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Gagal menghapus alamat.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSetDefault(addressId) {
    if (!userId || saving) return;

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch(`${API}/set-default`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          address_id: addressId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengubah alamat utama.');
      }

      setMessage(data.message || 'Alamat utama berhasil diubah.');
      await loadAddresses(userId);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Gagal mengubah alamat utama.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="profile-address-page">
      <div className="profile-address-header">
        <div>
          <h2 className="profile-address-title">Alamat Saya</h2>
          <p className="profile-address-subtitle">
            Simpan alamat pengiriman customer, lalu pilih satu alamat utama.
          </p>
        </div>
        {!loading && userId && (
          <button
            type="button"
            className="profile-address-button profile-address-button--primary"
            onClick={openCreateModal}
          >
            Tambah Alamat
          </button>
        )}
      </div>

      {loading && <p className="profile-address-feedback">Memuat alamat...</p>}
      {!loading && !userId && (
        <p className="profile-address-feedback">Login dulu sebagai customer untuk melihat alamat.</p>
      )}
      {error && <p className="profile-address-feedback profile-address-feedback--error">{error}</p>}
      {message && <p className="profile-address-feedback profile-address-feedback--success">{message}</p>}

      {!loading && userId && addresses.length === 0 && (
        <div className="profile-address-empty">
          <p className="profile-address-empty-title">Belum ada alamat tersimpan.</p>
          <p className="profile-address-empty-subtitle">
            Tambahkan alamat pertama supaya nanti bisa dipakai waktu checkout.
          </p>
        </div>
      )}

      {!loading && userId && addresses.length > 0 && (
        <div className="profile-address-list">
          {addresses.map((item) => (
            <div key={item.id} className="profile-address-card">
              <div className="profile-address-card-top">
                <div className="profile-address-card-heading">
                  <span className="profile-address-card-icon"><IconPin /></span>
                  <span className="profile-address-card-label">{item.label || 'Rumah'}</span>
                  {item.is_default && (
                    <span className="profile-address-card-badge">Utama</span>
                  )}
                </div>
                <div className="profile-address-card-actions">
                  {!item.is_default && (
                    <button
                      type="button"
                      className="profile-address-button profile-address-button--ghost"
                      onClick={() => handleSetDefault(item.id)}
                      disabled={saving}
                    >
                      Jadikan Utama
                    </button>
                  )}
                  <button
                    type="button"
                    className="profile-address-button profile-address-button--ghost"
                    onClick={() => openEditModal(item)}
                    disabled={saving}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="profile-address-button profile-address-button--danger"
                    onClick={() => handleDelete(item.id)}
                    disabled={saving}
                  >
                    Hapus
                  </button>
                </div>
              </div>

              <div className="profile-address-card-body">
                <p className="profile-address-card-name">{item.recipient_name || '-'}</p>
                <p className="profile-address-card-text">{item.phone || '-'}</p>
                <p className="profile-address-card-text">{item.address_line || '-'}</p>
                <p className="profile-address-card-text">
                  {[item.city, item.province, item.postal_code].filter(Boolean).join(', ') || '-'}
                </p>
                {item.notes && (
                  <p className="profile-address-card-notes">Catatan: {item.notes}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="profile-address-modal-backdrop" onClick={closeModal}>
          <div className="profile-address-modal" onClick={(event) => event.stopPropagation()}>
            <div className="profile-address-modal-header">
              <div>
                <h3 className="profile-address-modal-title">
                  {editingId ? 'Edit Alamat' : 'Tambah Alamat'}
                </h3>
                <p className="profile-address-modal-subtitle">
                  Lengkapi data alamat pengiriman customer.
                </p>
              </div>
              <button
                type="button"
                className="profile-address-modal-close"
                onClick={closeModal}
                disabled={saving}
                aria-label="Tutup popup alamat"
              >
                x
              </button>
            </div>

            <form onSubmit={handleSubmit} className="profile-address-form">
              <label className="profile-address-field">
                <span>Label</span>
                <input
                  type="text"
                  name="label"
                  value={form.label}
                  onChange={handleChange}
                  placeholder="Contoh: Rumah"
                />
              </label>

              <label className="profile-address-field">
                <span>Nama Penerima</span>
                <input
                  type="text"
                  name="recipient_name"
                  value={form.recipient_name}
                  onChange={handleChange}
                  placeholder="Masukkan nama penerima"
                />
              </label>

              <label className="profile-address-field">
                <span>Nomor Telepon</span>
                <input
                  type="text"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="Masukkan nomor telepon"
                />
              </label>

              <label className="profile-address-field">
                <span>Alamat Lengkap</span>
                <textarea
                  name="address_line"
                  value={form.address_line}
                  onChange={handleChange}
                  placeholder="Masukkan alamat lengkap"
                  rows="4"
                />
              </label>

              <div className="profile-address-grid">
                <label className="profile-address-field">
                  <span>Kota</span>
                  <input
                    type="text"
                    name="city"
                    value={form.city}
                    onChange={handleChange}
                    placeholder="Masukkan kota"
                  />
                </label>

                <label className="profile-address-field">
                  <span>Provinsi</span>
                  <input
                    type="text"
                    name="province"
                    value={form.province}
                    onChange={handleChange}
                    placeholder="Masukkan provinsi"
                  />
                </label>
              </div>

              <label className="profile-address-field">
                <span>Kode Pos</span>
                <input
                  type="text"
                  name="postal_code"
                  value={form.postal_code}
                  onChange={handleChange}
                  placeholder="Masukkan kode pos"
                />
              </label>

              <label className="profile-address-field">
                <span>Catatan</span>
                <input
                  type="text"
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  placeholder="Patokan, nomor rumah, dll"
                />
              </label>

              {!editingId && (
                <label className="profile-address-checkbox">
                  <input
                    type="checkbox"
                    name="is_default"
                    checked={form.is_default}
                    onChange={handleChange}
                  />
                  <span>Jadikan alamat utama</span>
                </label>
              )}

              <div className="profile-address-modal-actions">
                <button
                  type="button"
                  className="profile-address-button profile-address-button--ghost"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="profile-address-button profile-address-button--primary"
                  disabled={saving}
                >
                  {saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Simpan Alamat'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
