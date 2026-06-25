'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiUrl, mediaUrl } from '@/api';

const API = apiUrl('/api/customer/profile/return');

function formatRibuan(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '0';
  return Number(digits).toLocaleString('id-ID');
}

function formatTanggal(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('id-ID');
}

function fileUrl(path) {
  return mediaUrl(path);
}

function waLink(number, text) {
  const digits = String(number || '').replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function getStoredUser() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(window.localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

function DataTable({ children }) {
  return (
    <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse', width: '100%', marginTop: 8 }}>
      {children}
    </table>
  );
}

export default function ProfileReturnDetailPage() {
  const params = useParams();
  const returnCode = decodeURIComponent(params?.returnCode || '');
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shipCourier, setShipCourier] = useState('');
  const [shipTracking, setShipTracking] = useState('');
  const [shipLoading, setShipLoading] = useState(false);
  const [shipMessage, setShipMessage] = useState('');
  const refundInfo = detail?.refund_info || {};
  const exchangeInfo = detail?.exchange_info || {};
  const destination = detail?.return_destination || {};
  const returnShipment = detail?.return_shipment || {};
  const completion = detail?.completion || {};

  async function loadDetail() {
    const user = getStoredUser();
    if (!user || user.role !== 'customer') {
      setError('Login dulu sebagai customer untuk melihat detail retur.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(
        `${API}/detail?user_id=${encodeURIComponent(user.id)}&return_code=${encodeURIComponent(returnCode)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengambil detail retur.');
      }
      setDetail(data);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Gagal mengambil detail retur.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDetail();
  }, [returnCode]);

  async function handleShipBack(event) {
    event?.preventDefault();
    if (shipLoading) return;

    const user = getStoredUser();
    if (!user || user.role !== 'customer') {
      setError('Login dulu sebagai customer.');
      return;
    }
    if (!shipTracking.trim()) {
      setError('Nomor resi wajib diisi.');
      return;
    }

    setShipLoading(true);
    setError('');
    setShipMessage('');

    try {
      const res = await fetch(`${API}/ship-back`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          return_code: detail.return_code,
          return_courier_name: shipCourier.trim(),
          return_tracking_number: shipTracking.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengirim status pengiriman balik.');
      }
      setDetail(data.return_entry || null);
      setShipMessage(data.message || 'Status retur diperbarui.');
      setShipCourier('');
      setShipTracking('');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Gagal mengirim status pengiriman balik.');
    } finally {
      setShipLoading(false);
    }
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      <h2>Detail Retur</h2>

      {loading && <p style={{ marginTop: 12 }}>Memuat detail retur...</p>}
      {error && <p style={{ color: 'red', marginTop: 12 }}>{error}</p>}
      {shipMessage && <p style={{ color: 'green', marginTop: 12 }}>{shipMessage}</p>}

      {detail && (
        <>
          <h3 style={{ marginTop: 20 }}>Info Retur</h3>
          <DataTable>
            <tbody>
              <tr>
                <td>Kode Retur</td>
                <td>{detail.return_code || '-'}</td>
              </tr>
              <tr>
                <td>Kode Order</td>
                <td>{detail.order_code || '-'}</td>
              </tr>
              <tr>
                <td>Status</td>
                <td>{detail.status_label || detail.status || '-'}</td>
              </tr>
              <tr>
                <td>Tipe Penyelesaian</td>
                <td>{detail.resolution_type_label || detail.resolution_type || '-'}</td>
              </tr>
              <tr>
                <td>Tanggal Ajukan</td>
                <td>{formatTanggal(detail.created_at)}</td>
              </tr>
              <tr>
                <td>Diproses Pada</td>
                <td>{formatTanggal(detail.processed_at)}</td>
              </tr>
              <tr>
                <td>Diproses Oleh</td>
                <td>{detail.processed_by_name || '-'}</td>
              </tr>
              <tr>
                <td>Alasan Retur</td>
                <td>{detail.reason || '-'}</td>
              </tr>
              <tr>
                <td>Catatan Admin</td>
                <td>{detail.decision_reason || '-'}</td>
              </tr>
            </tbody>
          </DataTable>

          {detail.status === 'approved' && (
            <>
              <h3 style={{ marginTop: 24 }}>Kirim Produk Kembali</h3>
              <p style={{ marginTop: 8 }}>
                Retur kamu <b>disetujui</b> ✅. Kirim produk ke alamat di bawah ini, lalu isi nomor resinya.
              </p>
              <DataTable>
                <tbody>
                  <tr><td>Penerima</td><td>{destination.recipient_name || '-'}</td></tr>
                  <tr><td>Alamat</td><td>{destination.address_line || '-'}</td></tr>
                  <tr><td>Kota</td><td>{destination.city || '-'}</td></tr>
                  <tr><td>Provinsi</td><td>{destination.province || '-'}</td></tr>
                  <tr><td>Kode Pos</td><td>{destination.postal_code || '-'}</td></tr>
                  <tr><td>Telepon / WA</td><td>{destination.phone || '-'}</td></tr>
                  <tr><td>Catatan</td><td>{destination.notes || '-'}</td></tr>
                </tbody>
              </DataTable>
              {destination.whatsapp_number && (
                <p style={{ marginTop: 8 }}>
                  <a
                    href={waLink(destination.whatsapp_number, `Halo, saya mau retur dengan kode ${detail.return_code}`)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Chat WhatsApp Toko
                  </a>
                </p>
              )}
              <form onSubmit={handleShipBack} style={{ marginTop: 12 }}>
                <p>
                  <label>
                    Kurir (opsional):{' '}
                    <input
                      type="text"
                      value={shipCourier}
                      onChange={(e) => setShipCourier(e.target.value)}
                      placeholder="mis. JNE / J&T"
                    />
                  </label>
                </p>
                <p>
                  <label>
                    Nomor Resi:{' '}
                    <input
                      type="text"
                      value={shipTracking}
                      onChange={(e) => setShipTracking(e.target.value)}
                      placeholder="No resi pengiriman balik"
                    />
                  </label>
                </p>
                <button type="submit" disabled={shipLoading || !shipTracking.trim()}>
                  {shipLoading ? 'Mengirim...' : 'Saya Sudah Kirim Produk'}
                </button>
              </form>
            </>
          )}

          {['shipped_back', 'received', 'completed'].includes(detail.status) && (
            <>
              <h3 style={{ marginTop: 24 }}>Pengiriman Balik</h3>
              <DataTable>
                <tbody>
                  <tr><td>Kurir</td><td>{returnShipment.courier_name || '-'}</td></tr>
                  <tr><td>Nomor Resi</td><td>{returnShipment.tracking_number || '-'}</td></tr>
                  <tr><td>Dikirim Pada</td><td>{formatTanggal(returnShipment.shipped_back_at)}</td></tr>
                  <tr><td>Diterima Toko</td><td>{formatTanggal(detail.received_at)}</td></tr>
                </tbody>
              </DataTable>
            </>
          )}

          {detail.status === 'completed' && (
            <>
              <h3 style={{ marginTop: 24 }}>Penyelesaian</h3>
              <DataTable>
                <tbody>
                  {detail.resolution_type === 'refund' ? (
                    <tr>
                      <td>Bukti Transfer Refund</td>
                      <td>
                        {completion.refund_proof ? (
                          <a href={fileUrl(completion.refund_proof)} target="_blank" rel="noreferrer">Lihat Bukti</a>
                        ) : '-'}
                      </td>
                    </tr>
                  ) : (
                    <tr>
                      <td>Resi Barang Pengganti</td>
                      <td>{completion.exchange_shipment_tracking || '-'}</td>
                    </tr>
                  )}
                  <tr><td>Diselesaikan Pada</td><td>{formatTanggal(completion.completed_at)}</td></tr>
                </tbody>
              </DataTable>
            </>
          )}

          {detail.resolution_type === 'refund' && (
            <>
              <h3 style={{ marginTop: 24 }}>Info Refund</h3>
              <DataTable>
                <tbody>
                  <tr>
                    <td>Nama Bank</td>
                    <td>{refundInfo.bank_name || '-'}</td>
                  </tr>
                  <tr>
                    <td>Nomor Rekening</td>
                    <td>{refundInfo.account_number || '-'}</td>
                  </tr>
                  <tr>
                    <td>Nama Pemilik Rekening</td>
                    <td>{refundInfo.account_holder_name || '-'}</td>
                  </tr>
                </tbody>
              </DataTable>
            </>
          )}

          {detail.resolution_type === 'exchange' && (
            <>
              <h3 style={{ marginTop: 24 }}>Info Exchange</h3>
              <DataTable>
                <tbody>
                  <tr>
                    <td>Kurir</td>
                    <td>{exchangeInfo.courier_name || '-'}</td>
                  </tr>
                  <tr>
                    <td>Label</td>
                    <td>{exchangeInfo.address_label || '-'}</td>
                  </tr>
                  <tr>
                    <td>Penerima</td>
                    <td>{exchangeInfo.recipient_name || '-'}</td>
                  </tr>
                  <tr>
                    <td>Telepon</td>
                    <td>{exchangeInfo.phone || '-'}</td>
                  </tr>
                  <tr>
                    <td>Alamat</td>
                    <td>{exchangeInfo.address_line || '-'}</td>
                  </tr>
                  <tr>
                    <td>Kota</td>
                    <td>{exchangeInfo.city || '-'}</td>
                  </tr>
                  <tr>
                    <td>Provinsi</td>
                    <td>{exchangeInfo.province || '-'}</td>
                  </tr>
                  <tr>
                    <td>Kode Pos</td>
                    <td>{exchangeInfo.postal_code || '-'}</td>
                  </tr>
                  <tr>
                    <td>Catatan</td>
                    <td>{exchangeInfo.notes || '-'}</td>
                  </tr>
                </tbody>
              </DataTable>
            </>
          )}

          <h3 style={{ marginTop: 24 }}>Item Retur</h3>
          <DataTable>
            <thead>
              <tr>
                <th>Produk</th>
                <th>Qty Dibeli</th>
                <th>Qty Retur</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {(detail.items || []).map((item, index) => (
                <tr key={item.id || index}>
                  <td>{item.product_name || '-'}</td>
                  <td>{item.ordered_quantity || 0}</td>
                  <td>{item.quantity || 0}</td>
                  <td>Rp {formatRibuan(item.subtotal)}</td>
                </tr>
              ))}
              {(detail.items || []).length === 0 && (
                <tr>
                  <td colSpan={4}>(tidak ada item retur)</td>
                </tr>
              )}
            </tbody>
          </DataTable>

          <h3 style={{ marginTop: 24 }}>Bukti</h3>
          <DataTable>
            <tbody>
              <tr>
                <td>Foto Produk</td>
                <td>
                  {detail.product_photo ? (
                    <a href={fileUrl(detail.product_photo)} target="_blank" rel="noreferrer">
                      Lihat Foto
                    </a>
                  ) : '-'}
                </td>
              </tr>
              <tr>
                <td>E-Receipt</td>
                <td>
                  {detail.ereceipt_proof ? (
                    <a href={fileUrl(detail.ereceipt_proof)} target="_blank" rel="noreferrer">
                      Lihat File
                    </a>
                  ) : '-'}
                </td>
              </tr>
            </tbody>
          </DataTable>

          <p style={{ marginTop: 24 }}>
            <Link href={`/customer/profile/order/detail/${encodeURIComponent(detail.order_code || '-')}`}>
              Lihat detail pesanan
            </Link>
          </p>
        </>
      )}

      <Link href="/customer/profile/return">Kembali ke daftar retur</Link>
    </div>
  );
}
