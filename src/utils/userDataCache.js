const CACHE_PREFIX = 'elikha_user_cache_v1:';
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const memoryCache = new Map();

const getCacheKey = (userId, resource) => (
  `${CACHE_PREFIX}${encodeURIComponent(String(userId || ''))}:${encodeURIComponent(String(resource || ''))}`
);

export const readUserDataCache = (userId, resource, { maxAgeMs = DEFAULT_MAX_AGE_MS } = {}) => {
  if (!userId || !resource) return null;
  const key = getCacheKey(userId, resource);

  try {
    const raw = memoryCache.get(key) || window.localStorage.getItem(key);
    if (!raw) return null;
    const entry = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!entry || entry.userId !== userId || !Number.isFinite(entry.cachedAt)) return null;
    if (Date.now() - entry.cachedAt > maxAgeMs) {
      memoryCache.delete(key);
      window.localStorage.removeItem(key);
      return null;
    }
    memoryCache.set(key, entry);
    return { data: entry.data, cachedAt: entry.cachedAt };
  } catch {
    return null;
  }
};

export const writeUserDataCache = (userId, resource, data) => {
  if (!userId || !resource) return;
  const key = getCacheKey(userId, resource);
  const entry = { userId, resource, cachedAt: Date.now(), data };
  memoryCache.set(key, entry);
  try {
    window.localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Memory caching still avoids repeat loading when storage is unavailable.
  }
};

export const invalidateUserDataCache = (userId, resource) => {
  if (!userId) return;
  const prefix = resource ? getCacheKey(userId, resource) : `${CACHE_PREFIX}${encodeURIComponent(String(userId))}:`;
  [...memoryCache.keys()].forEach((key) => {
    if (key.startsWith(prefix)) memoryCache.delete(key);
  });
  try {
    [...Array(window.localStorage.length).keys()]
      .map((index) => window.localStorage.key(index))
      .filter((key) => key?.startsWith(prefix))
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Storage may be unavailable in private browsing mode.
  }
};

export const clearAllUserDataCaches = () => {
  memoryCache.clear();
  try {
    [...Array(window.localStorage.length).keys()]
      .map((index) => window.localStorage.key(index))
      .filter((key) => key?.startsWith(CACHE_PREFIX))
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Storage may be unavailable in private browsing mode.
  }
};
