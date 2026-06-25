'use client';

import { useEffect, useState } from 'react';
import './page.css';

const API = 'http://localhost:8000/api/customer/profile';

function formatTanggal(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('id-ID');
}

function getStoredUser() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(window.localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

export default function ProfileEditPage() {
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    email: '',
    name: '',
    phone: '',
    created_at: '',
  });
  const [draft, setDraft] = useState({
    name: '',
    phone: '',
  });

  async function loadProfile(uid) {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch(`${API}/detail?user_id=${encodeURIComponent(uid)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengambil data profil.');
      }

      setForm({
        email: data.email || '',
        name: data.name || '',
        phone: data.phone || '',
        created_at: data.created_at || '',
      });
    } catch (err) {
      console.error(err);
      setError(err.message || 'Gagal mengambil data profil.');
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
    loadProfile(user.id);
  }, []);

  function openModal() {
    setDraft({
      name: form.name || '',
      phone: form.phone || '',
    });
    setError('');
    setIsModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setIsModalOpen(false);
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setDraft((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!userId || saving) return;

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch(`${API}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          name: draft.name,
          phone: draft.phone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengupdate profil.');
      }

      const profile = data.profile || {};
      setForm((current) => ({
        ...current,
        name: profile.name || '',
        phone: profile.phone || '',
      }));

      const storedUser = getStoredUser();
      if (storedUser) {
        window.localStorage.setItem(
          'user',
          JSON.stringify({
            ...storedUser,
            name: profile.name || storedUser.name || '',
            phone: profile.phone || '',
          }),
        );
      }

      setMessage(data.message || 'Profil berhasil diupdate.');
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Gagal mengupdate profil.');
    } finally {
      setSaving(false);
    }
  }

  const initials =
    (form.name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?';

  return (
    <div className="profile-edit-page">
      <div className="profile-edit-header">
        <div>
          <h2 className="profile-edit-title">Edit Profil</h2>
          <p className="profile-edit-subtitle">
            Lihat data akun lalu ubah nama dan nomor telepon lewat popup edit.
          </p>
        </div>
        {!loading && userId && (
          <button
            type="button"
            className="profile-edit-button profile-edit-button--primary"
            onClick={openModal}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
            </svg>
            Edit Profil
          </button>
        )}
      </div>

      {loading && <p className="profile-edit-feedback">Memuat data profil...</p>}
      {!loading && !userId && (
        <p className="profile-edit-feedback">Login dulu sebagai customer untuk melihat profil.</p>
      )}
      {error && <p className="profile-edit-feedback profile-edit-feedback--error">{error}</p>}
      {message && <p className="profile-edit-feedback profile-edit-feedback--success">{message}</p>}

      {!loading && userId && (
        <>
          <div className="profile-edit-identity">
            <div className="profile-edit-avatar">{initials}</div>
            <div className="profile-edit-identity-info">
              <p className="profile-edit-identity-name">{form.name || 'Tanpa Nama'}</p>
              <p className="profile-edit-identity-email">{form.email || '-'}</p>
            </div>
          </div>

          <div className="profile-edit-card">
            <div className="profile-edit-row">
              <span className="profile-edit-label">Email</span>
              <span className="profile-edit-value">{form.email || '-'}</span>
            </div>
            <div className="profile-edit-row">
              <span className="profile-edit-label">Bergabung</span>
              <span className="profile-edit-value">{formatTanggal(form.created_at)}</span>
            </div>
            <div className="profile-edit-row">
              <span className="profile-edit-label">Nama</span>
              <span className="profile-edit-value">{form.name || '-'}</span>
            </div>
            <div className="profile-edit-row">
              <span className="profile-edit-label">Telepon</span>
              <span className="profile-edit-value">{form.phone || '-'}</span>
            </div>
          </div>
        </>
      )}

      {isModalOpen && (
        <div className="profile-edit-modal-backdrop" onClick={closeModal}>
          <div className="profile-edit-modal" onClick={(event) => event.stopPropagation()}>
            <div className="profile-edit-modal-header">
              <div>
                <h3 className="profile-edit-modal-title">Ubah Profil</h3>
                <p className="profile-edit-modal-subtitle">
                  Ganti nama dan nomor telepon customer di sini.
                </p>
              </div>
              <button
                type="button"
                className="profile-edit-modal-close"
                onClick={closeModal}
                disabled={saving}
                aria-label="Tutup popup edit profil"
              >
                x
              </button>
            </div>

            <form onSubmit={handleSubmit} className="profile-edit-form">
              <label className="profile-edit-field">
                <span>Nama</span>
                <input
                  type="text"
                  name="name"
                  value={draft.name}
                  onChange={handleChange}
                  placeholder="Masukkan nama"
                />
              </label>

              <label className="profile-edit-field">
                <span>Telepon</span>
                <input
                  type="text"
                  name="phone"
                  value={draft.phone}
                  onChange={handleChange}
                  placeholder="Masukkan nomor telepon"
                />
              </label>

              <div className="profile-edit-modal-actions">
                <button
                  type="button"
                  className="profile-edit-button profile-edit-button--ghost"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="profile-edit-button profile-edit-button--primary"
                  disabled={saving}
                >
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
