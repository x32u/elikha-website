import { supabase } from '../lib/supabase';

const API_BASE = String(process.env.REACT_APP_R2_MODEL_API_URL || '').trim().replace(/\/+$/, '');
const objectUrlCache = new Map();

export const isR2MediaStorageConfigured = Boolean(API_BASE);

const getAccessToken = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) throw new Error('Your session has expired. Sign in again.');
  return token;
};

const requireApiBase = () => {
  if (!API_BASE) throw new Error('Cloudflare R2 image storage is not configured for this build.');
};

const mediaEndpoint = (kind, ownerId) => {
  requireApiBase();
  return `${API_BASE}/media/${kind}/${encodeURIComponent(String(ownerId || '').trim())}`;
};

const parseJsonResponse = async (response) => {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || payload?.success === false) {
    const error = new Error(payload?.error || `Cloudflare image storage returned ${response.status}.`);
    error.code = payload?.code || 'R2_MEDIA_REQUEST_FAILED';
    error.status = response.status;
    throw error;
  }
  return payload?.data;
};

const authHeaders = async (headers = {}) => ({
  ...headers,
  Authorization: `Bearer ${await getAccessToken()}`,
});

export const resolveR2MediaUrl = async (kind, ownerId, legacyPath = '') => {
  const id = String(ownerId || '').trim();
  if (!id || !API_BASE) return '';
  const cacheKey = `${kind}/${id}/${String(legacyPath || '')}`;
  if (objectUrlCache.has(cacheKey)) return objectUrlCache.get(cacheKey);

  const headers = await authHeaders();
  if (legacyPath) headers['X-Legacy-Path'] = String(legacyPath);
  const response = await fetch(mediaEndpoint(kind, id), { headers, cache: 'no-store' });
  if (!response.ok) {
    if (response.status === 404) return '';
    await parseJsonResponse(response);
  }
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) return '';
  const url = URL.createObjectURL(blob);
  objectUrlCache.set(cacheKey, url);
  return url;
};

export const uploadR2Media = async (kind, ownerId, blob) => {
  const id = String(ownerId || '').trim();
  if (!id) throw new Error('An image owner is required.');
  const response = await fetch(mediaEndpoint(kind, id), {
    method: 'PUT',
    headers: await authHeaders({ 'Content-Type': blob.type || 'application/octet-stream' }),
    body: blob,
  });
  const result = await parseJsonResponse(response);
  for (const [key, url] of objectUrlCache.entries()) {
    if (key.startsWith(`${kind}/${id}/`)) {
      URL.revokeObjectURL(url);
      objectUrlCache.delete(key);
    }
  }
  return result;
};

export const deleteR2Media = async (kind, ownerId) => {
  const id = String(ownerId || '').trim();
  if (!id || !API_BASE) return true;
  const response = await fetch(mediaEndpoint(kind, id), {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  await parseJsonResponse(response);
  for (const [key, url] of objectUrlCache.entries()) {
    if (key.startsWith(`${kind}/${id}/`)) {
      URL.revokeObjectURL(url);
      objectUrlCache.delete(key);
    }
  }
  return true;
};
