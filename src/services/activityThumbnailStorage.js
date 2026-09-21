import { supabase } from '../lib/supabase';

const API_BASE = String(process.env.REACT_APP_R2_MODEL_API_URL || '').trim().replace(/\/+$/, '');
const DATA_URL_PATTERN = /^data:([^;,]+)(;base64)?,(.*)$/;

export const isR2ActivityThumbnailStorageConfigured = Boolean(API_BASE);

const dataUrlToBlob = (dataUrl) => {
  const match = String(dataUrl || '').match(DATA_URL_PATTERN);
  if (!match) throw new Error('Invalid thumbnail image data.');

  const mimeType = match[1] || 'image/jpeg';
  const payload = match[3] || '';
  const binary = match[2] ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
};

const requireApiBase = () => {
  if (!API_BASE) {
    throw new Error('Cloudflare R2 thumbnail storage is not configured for this build.');
  }
};

const getAccessToken = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) throw new Error('Your session has expired. Sign in again.');
  return token;
};

const parseJsonResponse = async (response) => {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || payload?.success === false) {
    const error = new Error(payload?.error || `Cloudflare R2 thumbnail storage returned ${response.status}.`);
    error.code = payload?.code || 'R2_THUMBNAIL_REQUEST_FAILED';
    error.status = response.status;
    throw error;
  }
  return payload?.data;
};

const getR2ThumbnailId = (value) => {
  if (!API_BASE || !value) return '';
  try {
    const base = new URL(`${API_BASE}/`);
    const candidate = new URL(String(value), base);
    const prefix = `${base.pathname.replace(/\/$/, '')}/activity-thumbnails/`;
    if (candidate.origin !== base.origin || !candidate.pathname.startsWith(prefix)) return '';
    const id = decodeURIComponent(candidate.pathname.slice(prefix.length));
    return /^[0-9a-f-]{36}$/i.test(id) ? id : '';
  } catch {
    return '';
  }
};

export const isInlineThumbnailData = (url) => String(url || '').startsWith('data:image/');

export async function uploadActivityThumbnail({ imageUrl, teacherId }) {
  if (!imageUrl) return null;
  if (!isInlineThumbnailData(imageUrl)) return imageUrl;
  if (!teacherId) throw new Error('Missing teacher account for thumbnail upload.');
  requireApiBase();

  const blob = dataUrlToBlob(imageUrl);
  const response = await fetch(`${API_BASE}/activity-thumbnails`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      'Content-Type': blob.type || 'application/octet-stream',
    },
    body: blob,
  });
  const result = await parseJsonResponse(response);
  if (!result?.url) throw new Error('Cloudflare R2 did not return a thumbnail URL.');
  return result.url;
}

export async function deleteActivityThumbnail(imageUrl) {
  const id = getR2ThumbnailId(imageUrl);
  if (!id) return false;

  const response = await fetch(`${API_BASE}/activity-thumbnails/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${await getAccessToken()}` },
  });
  await parseJsonResponse(response);
  return true;
}
