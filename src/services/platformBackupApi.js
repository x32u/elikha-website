import { supabase } from '../lib/supabase';

export const PLATFORM_BACKUP_FORMAT = 'elikha-platform-backup';
export const PLATFORM_BACKUP_VERSION = 1;
export const PLATFORM_BACKUP_MAX_BYTES = 25 * 1024 * 1024;

export const validatePlatformBackup = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, error: 'The selected file is not a JSON backup.' };
  }
  if (value.format !== PLATFORM_BACKUP_FORMAT || value.version !== PLATFORM_BACKUP_VERSION) {
    return { valid: false, error: 'Choose an e-Likha platform backup (version 1).' };
  }
  if (!value.tables || typeof value.tables !== 'object' || Array.isArray(value.tables)) {
    return { valid: false, error: 'The backup does not contain application tables.' };
  }

  const invalidTable = Object.entries(value.tables).find(([, rows]) => !Array.isArray(rows));
  if (invalidTable) {
    return { valid: false, error: `The ${invalidTable[0]} table is malformed.` };
  }

  const rowCount = Object.values(value.tables).reduce((total, rows) => total + rows.length, 0);
  return {
    valid: true,
    tableCount: Object.keys(value.tables).length,
    rowCount,
  };
};

export const exportPlatformBackup = async () => {
  const { data, error } = await supabase.rpc('export_platform_backup');
  if (error) throw new Error(error.message || 'The platform backup could not be exported.');
  const validation = validatePlatformBackup(data);
  if (!validation.valid) throw new Error(validation.error);
  return data;
};

export const restorePlatformBackup = async (backup) => {
  const validation = validatePlatformBackup(backup);
  if (!validation.valid) throw new Error(validation.error);

  const { data, error } = await supabase.rpc('restore_platform_backup', { p_backup: backup });
  if (error) throw new Error(error.message || 'The platform backup could not be restored.');
  return data;
};
