import {
  buildColorSelectionAnnouncement,
  shouldSpeakVoiceAnnouncement,
} from './voiceGuidance';

describe('AR voice guidance', () => {
  it('uses the requested spoken color confirmation', () => {
    expect(buildColorSelectionAnnouncement('red')).toBe('You pressed the color red.');
    expect(buildColorSelectionAnnouncement('  Blue Green  ')).toBe('You pressed the color blue green.');
  });

  it('is optional while allowing explicit read-aloud actions', () => {
    expect(shouldSpeakVoiceAnnouncement({ text: 'Paint selected.', voiceEnabled: false })).toBe(false);
    expect(shouldSpeakVoiceAnnouncement({ text: 'Read this step.', voiceEnabled: false, force: true })).toBe(true);
  });

  it('suppresses rapid duplicate gesture announcements', () => {
    expect(shouldSpeakVoiceAnnouncement({
      text: 'You pressed the color red.',
      voiceEnabled: true,
      previousText: 'You pressed the color red.',
      previousAt: 1000,
      now: 1300,
      dedupeMs: 800,
    })).toBe(false);
    expect(shouldSpeakVoiceAnnouncement({
      text: 'You pressed the color red.',
      voiceEnabled: true,
      previousText: 'You pressed the color red.',
      previousAt: 1000,
      now: 1900,
      dedupeMs: 800,
    })).toBe(true);
  });
});
