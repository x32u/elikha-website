export const USER_SETTINGS_EVENT = 'elikha-user-settings-changed';

export const DEFAULT_USER_SETTINGS = Object.freeze({
  backgroundMusic: true,
  soundEffects: true,
  notifications: true,
  dataSaver: false,
  quality: 'auto',
});

const VALID_QUALITIES = new Set(['auto', 'high', 'medium', 'low']);

export const getUserSettingsKey = (userId = 'anonymous') => `elikha_user_settings_${userId || 'anonymous'}`;

export const normalizeUserSettings = (settings = {}) => ({
  backgroundMusic:
    typeof settings.backgroundMusic === 'boolean'
      ? settings.backgroundMusic
      : DEFAULT_USER_SETTINGS.backgroundMusic,
  soundEffects:
    typeof settings.soundEffects === 'boolean'
      ? settings.soundEffects
      : DEFAULT_USER_SETTINGS.soundEffects,
  notifications:
    typeof settings.notifications === 'boolean'
      ? settings.notifications
      : DEFAULT_USER_SETTINGS.notifications,
  dataSaver:
    typeof settings.dataSaver === 'boolean'
      ? settings.dataSaver
      : DEFAULT_USER_SETTINGS.dataSaver,
  quality: VALID_QUALITIES.has(settings.quality) ? settings.quality : DEFAULT_USER_SETTINGS.quality,
});

export const getSessionUserInfo = () => {
  try {
    return JSON.parse(window.sessionStorage.getItem('userInfo') || '{}');
  } catch {
    return {};
  }
};

export const getStoredUserSettings = (userId) => {
  if (typeof window === 'undefined') return { ...DEFAULT_USER_SETTINGS };

  try {
    const stored = window.localStorage.getItem(getUserSettingsKey(userId));
    if (!stored) return { ...DEFAULT_USER_SETTINGS };
    return normalizeUserSettings(JSON.parse(stored));
  } catch {
    return { ...DEFAULT_USER_SETTINGS };
  }
};

export const storeUserSettings = (userId, settings) => {
  const normalized = normalizeUserSettings(settings);
  if (typeof window === 'undefined') return normalized;

  try {
    window.localStorage.setItem(getUserSettingsKey(userId), JSON.stringify(normalized));
  } catch {
    // Local storage can fail in private mode; the in-memory event still updates the current page.
  }

  window.dispatchEvent(
    new CustomEvent(USER_SETTINGS_EVENT, {
      detail: { userId, settings: normalized },
    })
  );

  return normalized;
};

export const getCurrentUserSettings = () => {
  const userInfo = getSessionUserInfo();
  return getStoredUserSettings(userInfo.id);
};

export const shouldLoadRichMedia = (settings = getCurrentUserSettings()) => {
  const normalized = normalizeUserSettings(settings);
  return !normalized.dataSaver && normalized.quality !== 'low';
};

export const subscribeToUserSettings = (callback) => {
  if (typeof window === 'undefined') return () => {};

  const handler = (event) => {
    callback(event.detail?.settings || getCurrentUserSettings());
  };

  window.addEventListener(USER_SETTINGS_EVENT, handler);
  window.addEventListener('storage', handler);

  return () => {
    window.removeEventListener(USER_SETTINGS_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
};
