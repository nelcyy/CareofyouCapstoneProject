const rawBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export const BACKEND_URL = rawBackendUrl.replace(/\/$/, '');

export function apiUrl(path = '') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${BACKEND_URL}${normalizedPath}`;
}

export function mediaUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${BACKEND_URL}${normalizedPath}`;
}
