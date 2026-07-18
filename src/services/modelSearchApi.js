const POLYHAVEN_API_BASE = 'https://api.polyhaven.com';
const RESOLUTION_PREFERENCE = ['1k', '2k', '4k', '8k', '16k'];
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;

let cachedCatalog = null;
let cachedAt = 0;

const normalizeText = (value = '') => String(value || '').trim().toLowerCase();

const buildCatalogEntry = (id, item = {}) => ({
  id,
  name: item.name || id,
  description: item.description || '',
  categories: Array.isArray(item.categories) ? item.categories : [],
  tags: Array.isArray(item.tags) ? item.tags : [],
  thumbnailUrl: item.thumbnail_url || '',
  polycount: Number(item.polycount || 0),
  downloadCount: Number(item.download_count || 0),
  source: 'Poly Haven',
  license: 'CC0',
});

const scoreMatch = (entry, query) => {
  const q = normalizeText(query);
  if (!q) return entry.downloadCount;

  const name = normalizeText(entry.name);
  const id = normalizeText(entry.id);
  const description = normalizeText(entry.description);
  const tags = entry.tags.map(normalizeText).join(' ');
  const categories = entry.categories.map(normalizeText).join(' ');

  let score = 0;
  if (name === q) score += 120;
  if (id === q) score += 110;
  if (name.startsWith(q)) score += 80;
  if (id.startsWith(q)) score += 60;
  if (name.includes(q)) score += 40;
  if (id.includes(q)) score += 30;
  if (tags.includes(q)) score += 20;
  if (categories.includes(q)) score += 12;
  if (description.includes(q)) score += 8;

  return score;
};

const fetchCatalog = async () => {
  const now = Date.now();
  if (cachedCatalog && now - cachedAt < SEARCH_CACHE_TTL_MS) {
    return cachedCatalog;
  }

  const response = await fetch(`${POLYHAVEN_API_BASE}/assets?t=models`);
  if (!response.ok) {
    throw new Error(`Model provider returned ${response.status}`);
  }

  const payload = await response.json();
  const catalog = Object.entries(payload || {}).map(([id, item]) => buildCatalogEntry(id, item));

  cachedCatalog = catalog;
  cachedAt = now;
  return catalog;
};

const extractUrlsByExtension = (node, extension, result = []) => {
  if (!node) return result;

  if (typeof node === 'string') {
    const clean = node.split('?')[0].toLowerCase();
    if (clean.endsWith(`.${extension}`)) {
      result.push(node);
    }
    return result;
  }

  if (Array.isArray(node)) {
    node.forEach((item) => extractUrlsByExtension(item, extension, result));
    return result;
  }

  if (typeof node === 'object') {
    Object.values(node).forEach((value) => extractUrlsByExtension(value, extension, result));
  }

  return result;
};

const pickBestUrl = (urls = []) => {
  if (!urls.length) return null;

  for (const resolution of RESOLUTION_PREFERENCE) {
    const match = urls.find((url) => String(url).toLowerCase().includes(`/${resolution}/`));
    if (match) return match;
  }

  return urls[0];
};

const inferNameFromUrl = (url = '', fallback = 'model.gltf') => {
  const clean = String(url || '').split('?')[0].trim();
  if (!clean) return fallback;
  const parts = clean.split('/').filter(Boolean);
  return parts[parts.length - 1] || fallback;
};

export const searchFreeModelCatalog = async (query, { limit = 12 } = {}) => {
  const normalizedQuery = normalizeText(query);
  const catalog = await fetchCatalog();

  const ranked = catalog
    .map((entry) => ({ ...entry, _score: scoreMatch(entry, normalizedQuery) }))
    .filter((entry) => (normalizedQuery ? entry._score > 0 : true))
    .sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score;
      return b.downloadCount - a.downloadCount;
    })
    .slice(0, limit)
    .map(({ _score, ...entry }) => entry);

  return ranked;
};

export const resolveFreeModelImport = async (assetId) => {
  const id = String(assetId || '').trim();
  if (!id) throw new Error('Invalid model identifier.');

  const response = await fetch(`${POLYHAVEN_API_BASE}/files/${encodeURIComponent(id)}`);
  if (!response.ok) {
    throw new Error(`Unable to fetch model files (${response.status}).`);
  }

  const files = await response.json();
  const gltfUrl = pickBestUrl(extractUrlsByExtension(files, 'gltf'));
  const glbUrl = pickBestUrl(extractUrlsByExtension(files, 'glb'));
  const objUrl = pickBestUrl(extractUrlsByExtension(files, 'obj'));
  const modelUrl = gltfUrl || glbUrl || objUrl;

  if (!modelUrl) {
    throw new Error('No compatible model file found for this asset.');
  }

  let fileType = 'obj';
  if (modelUrl.endsWith('.gltf')) fileType = 'gltf';
  if (modelUrl.endsWith('.glb')) fileType = 'glb';

  return {
    assetId: id,
    modelUrl,
    fileType,
    fileName: inferNameFromUrl(modelUrl, `${id}.${fileType}`),
    source: 'Poly Haven',
    license: 'CC0',
  };
};

