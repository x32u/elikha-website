import { supabase } from '../lib/supabase';
import {
  DEFAULT_USER_SETTINGS,
  getStoredUserSettings,
  normalizeUserSettings,
  storeUserSettings,
} from '../utils/userSettings';

const SETTINGS_TABLE = 'user_settings';

const isMissingSettingsTable = (error) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01' || code === 'PGRST205' || message.includes(`table '${SETTINGS_TABLE}'`) || message.includes('schema cache');
};

export const getUserSettings = async (userId) => {
  const localSettings = getStoredUserSettings(userId);

  if (!userId) {
    return { success: true, data: localSettings, source: 'local' };
  }

  try {
    const { data, error } = await supabase
      .from(SETTINGS_TABLE)
      .select('settings')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    if (!data?.settings) {
      const defaultSettings = normalizeUserSettings(localSettings || DEFAULT_USER_SETTINGS);
      await saveUserSettings(userId, defaultSettings);
      return { success: true, data: defaultSettings, source: 'default' };
    }

    const settings = normalizeUserSettings(data.settings);
    storeUserSettings(userId, settings);
    return { success: true, data: settings, source: 'database' };
  } catch (error) {
    const settings = normalizeUserSettings(localSettings);
    const tableMissing = isMissingSettingsTable(error);
    return {
      success: false,
      data: settings,
      source: 'local',
      needsDatabaseSetup: tableMissing,
      error: tableMissing
        ? 'Settings database table is not configured yet.'
        : error.message || 'Unable to load settings from database.',
    };
  }
};

export const saveUserSettings = async (userId, settings) => {
  const normalized = storeUserSettings(
    userId,
    normalizeUserSettings({
      ...getStoredUserSettings(userId),
      ...settings,
    })
  );

  if (!userId) {
    return { success: true, data: normalized, source: 'local' };
  }

  try {
    const { error } = await supabase.from(SETTINGS_TABLE).upsert(
      {
        user_id: userId,
        settings: normalized,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) throw error;
    return { success: true, data: normalized, source: 'database' };
  } catch (error) {
    const tableMissing = isMissingSettingsTable(error);
    return {
      success: false,
      data: normalized,
      source: 'local',
      needsDatabaseSetup: tableMissing,
      error: tableMissing
        ? 'Settings saved on this browser. Configure the user_settings table to sync across devices.'
        : error.message || 'Settings saved locally, but database sync failed.',
    };
  }
};
