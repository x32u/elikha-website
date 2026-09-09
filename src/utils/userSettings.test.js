import {
  DEFAULT_USER_SETTINGS,
  normalizeUserSettings,
  shouldPlayBackgroundMusic,
} from './userSettings';

describe('voice instruction preference', () => {
  it('keeps voice help enabled for existing accounts without the new key', () => {
    expect(normalizeUserSettings({}).voiceInstructions).toBe(true);
    expect(DEFAULT_USER_SETTINGS.voiceInstructions).toBe(true);
  });

  it('preserves an explicit opt-out', () => {
    expect(normalizeUserSettings({ voiceInstructions: false }).voiceInstructions).toBe(false);
  });
});

describe('background music playback policy', () => {
  const enabledSettings = { backgroundMusic: true };

  it.each(['admin', 'superadmin', 'Admin', 'SuperAdmin'])(
    'keeps music disabled for the %s dashboard',
    (role) => {
      expect(shouldPlayBackgroundMusic(enabledSettings, { role })).toBe(false);
    }
  );

  it.each(['student', 'teacher'])(
    'keeps the saved preference available for %s accounts',
    (role) => {
      expect(shouldPlayBackgroundMusic(enabledSettings, { role })).toBe(true);
    }
  );

  it('still suppresses music during AR and when no tracks are available', () => {
    expect(shouldPlayBackgroundMusic(enabledSettings, {
      role: 'student',
      isArSession: true,
    })).toBe(false);
    expect(shouldPlayBackgroundMusic(enabledSettings, {
      role: 'teacher',
      hasTracks: false,
    })).toBe(false);
  });
});
