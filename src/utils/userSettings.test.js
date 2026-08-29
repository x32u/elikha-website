import { DEFAULT_USER_SETTINGS, normalizeUserSettings } from './userSettings';

describe('voice instruction preference', () => {
  it('keeps voice help enabled for existing accounts without the new key', () => {
    expect(normalizeUserSettings({}).voiceInstructions).toBe(true);
    expect(DEFAULT_USER_SETTINGS.voiceInstructions).toBe(true);
  });

  it('preserves an explicit opt-out', () => {
    expect(normalizeUserSettings({ voiceInstructions: false }).voiceInstructions).toBe(false);
  });
});
