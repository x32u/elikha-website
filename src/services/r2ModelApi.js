import { supabase } from '../lib/supabase';
import { uploadWithProgress } from './uploadWithProgress';
import {
  getArModelLibrary,
  replaceR2ArModelLibrary,
} from '../utils/activityArConfig';

const API_BASE = String(process.env.REACT_APP_R2_MODEL_API_URL || '').trim().replace(/\/+$/, '');

export const isR2ModelStorageConfigured = Boolean(API_BASE);

const parseResponse = async (response) => {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.success === false) {
    const error = new Error(
      payload?.error || `The 3D model storage returned ${response.status}.`
    );
    error.code = payload?.code || 'R2_MODEL_REQUEST_FAILED';
    error.status = response.status;
    throw error;
  }

  return payload?.data;
};

const requireApiBase = () => {
  if (!API_BASE) {
    throw new Error('Cloudflare R2 model storage is not configured for this build.');
  }
};

const getAccessToken = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) throw new Error('Your session has expired. Sign in again.');
  return token;
};

const encodeHeader = (value) => encodeURIComponent(String(value || '').trim());

const authenticatedHeaders = async (headers = {}) => ({
  ...headers,
  Authorization: `Bearer ${await getAccessToken()}`,
});

export const modelFileHeaders = async (url) => {
  if (!API_BASE) return {};
  const target = new URL(url, window.location.origin);
  const base = new URL(API_BASE);
  if (target.origin !== base.origin || !target.pathname.startsWith(`${base.pathname.replace(/\/$/, '')}/models/files/`)) return {};
  return authenticatedHeaders();
};

const modelUploadHeaders = async ({ label, description, file }) => authenticatedHeaders({
  'Content-Type': file.type || 'application/octet-stream',
  'X-Model-Name': encodeHeader(label),
  'X-Model-Description': encodeHeader(description),
  'X-Model-File-Name': encodeHeader(file.name),
});

export const refreshR2ModelLibrary = async ({ signal, expectedUserId } = {}) => {
  const checkCancelled = () => {
    if (signal?.aborted) throw new DOMException('Model loading cancelled.', 'AbortError');
  };
  checkCancelled();
  if (!API_BASE) return getArModelLibrary();
  const { data, error } = await supabase.auth.getSession();
  checkCancelled();
  if (error) throw error;
  const session = data?.session;
  if (expectedUserId && session?.user?.id !== expectedUserId) {
    throw new Error('The Sandbox session changed. Return to the app and open it again.');
  }
  if (!session) { replaceR2ArModelLibrary([], null); return []; }
  const response = await fetch(`${API_BASE}/models`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: 'no-store',
    signal,
  });
  const models = await parseResponse(response);
  if (!Array.isArray(models)) throw new Error('The model library returned an invalid response. Please retry.');
  // An in-flight refresh from a previous account must never repopulate the cache.
  const { data: current } = await supabase.auth.getSession();
  checkCancelled();
  if (expectedUserId && current?.session?.user?.id !== expectedUserId) {
    throw new Error('The Sandbox session changed. Return to the app and open it again.');
  }
  if (current?.session?.user?.id !== session.user.id) return getArModelLibrary();
  replaceR2ArModelLibrary(models, session.user.id);
  return getArModelLibrary();
};

export const uploadR2Model = async ({ label, description = '', file, onProgress }) => {
  requireApiBase();
  if (!(file instanceof File)) throw new Error('Select a 3D model file to upload.');

  const response = await uploadWithProgress(`${API_BASE}/models`, {
    method: 'POST',
    onProgress,
    headers: await modelUploadHeaders({ label, description, file }),
    body: file,
  });
  const model = await parseResponse(response);
  await refreshR2ModelLibrary();
  return model;
};

export const updateR2Model = async (id, { label, description = '', file = null, onProgress }) => {
  requireApiBase();
  const safeId = encodeURIComponent(String(id || ''));

  const response = file instanceof File
    ? await uploadWithProgress(`${API_BASE}/models/${safeId}/file`, {
        method: 'PUT',
        onProgress,
        headers: await modelUploadHeaders({ label, description, file }),
        body: file,
      })
    : await fetch(`${API_BASE}/models/${safeId}`, {
        method: 'PATCH',
        headers: await authenticatedHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ label, description }),
      });

  const model = await parseResponse(response);
  await refreshR2ModelLibrary();
  return model;
};

export const deleteR2Model = async (id) => {
  requireApiBase();
  const response = await fetch(`${API_BASE}/models/${encodeURIComponent(String(id || ''))}`, {
    method: 'DELETE',
    headers: await authenticatedHeaders(),
  });
  await parseResponse(response);
  await refreshR2ModelLibrary();
  return true;
};

export const importR2ModelFromUrl = async ({
  sourceUrl,
  label,
  description = '',
  fileName,
  source = 'Poly Pizza',
  license = 'CC0',
  attribution = '',
}) => {
  requireApiBase();
  const response = await fetch(`${API_BASE}/models/import`, {
    method: 'POST',
    headers: await authenticatedHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ sourceUrl, label, description, fileName, source, license, attribution }),
  });
  const model = await parseResponse(response);
  await refreshR2ModelLibrary();
  return model;
};

// Searches the free-model catalogue through the Worker. The provider API key
// lives as a Worker secret and never reaches the browser, and the route is
// authenticated so an allowed origin alone cannot spend the request quota.
export const searchFreeModelCatalog = async (query, { page = 1 } = {}) => {
  requireApiBase();
  const search = String(query || '').trim();
  if (!search) return { total: 0, page: 1, results: [] };

  const url = new URL(`${API_BASE}/models/search`);
  url.searchParams.set('q', search);
  url.searchParams.set('page', String(Math.max(1, Number(page) || 1)));

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: await authenticatedHeaders(),
    cache: 'no-store',
  });
  const data = await parseResponse(response);
  return {
    total: Number(data?.total) || 0,
    page: Number(data?.page) || 1,
    results: Array.isArray(data?.results) ? data.results : [],
  };
};

export const fetchR2StorageUsage = async () => {
  requireApiBase();
  const response = await fetch(`${API_BASE}/storage`, {
    method: 'GET',
    headers: await authenticatedHeaders(),
    cache: 'no-store',
  });
  return parseResponse(response);
};
