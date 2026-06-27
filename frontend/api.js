const rawBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export const BACKEND_URL = rawBackendUrl.replace(/\/$/, '');

export function apiUrl(path = '') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${BACKEND_URL}${normalizedPath}`;
}

export function mediaUrl(path) {
  const value = String(path || '').trim();
  if (!value) return '';
  if (/^(https?:|data:|blob:)/i.test(value)) return value;

  const normalizedPath = value.startsWith('/') ? value : `/${value}`;
  const mediaPath = normalizedPath.startsWith('/media/')
    ? normalizedPath
    : `/media${normalizedPath}`;

  return `${BACKEND_URL}${mediaPath}`;
}
