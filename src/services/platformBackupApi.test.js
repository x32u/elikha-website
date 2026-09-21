import { validatePlatformBackup } from './platformBackupApi';

describe('platform backup validation', () => {
  test('accepts a versioned e-Likha application backup', () => {
    expect(validatePlatformBackup({
      format: 'elikha-platform-backup',
      version: 1,
      tables: { users: [{ id: '1' }], classes: [] },
    })).toEqual({ valid: true, tableCount: 2, rowCount: 1 });
  });

  test('rejects unknown files and malformed table data', () => {
    expect(validatePlatformBackup({ tables: {} }).valid).toBe(false);
    expect(validatePlatformBackup({
      format: 'elikha-platform-backup',
      version: 1,
      tables: { users: {} },
    }).valid).toBe(false);
  });
});
