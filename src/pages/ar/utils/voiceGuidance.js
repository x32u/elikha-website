export const normalizeVoiceGuideText = (value) => String(value || '').trim().replace(/\s+/g, ' ');

export const buildColorSelectionAnnouncement = (colorName = 'custom color') => {
  const normalizedName = normalizeVoiceGuideText(colorName).toLowerCase() || 'custom color';
  return `You pressed the color ${normalizedName}.`;
};

/**
 * @typedef {Object} VoiceAnnouncementOptions
 * @property {unknown} text
 * @property {boolean} voiceEnabled
 * @property {boolean} [force]
 * @property {unknown} [previousText]
 * @property {number} [previousAt]
 * @property {number} [now]
 * @property {number} [dedupeMs]
 */

/**
 * @param {VoiceAnnouncementOptions} options
 */
export const shouldSpeakVoiceAnnouncement = ({
  text,
  voiceEnabled,
  force = false,
  previousText = '',
  previousAt = 0,
  now = Date.now(),
  dedupeMs = 450,
} = {}) => {
  const message = normalizeVoiceGuideText(text);
  if (!message || (!voiceEnabled && !force)) return false;

  return !(
    normalizeVoiceGuideText(previousText) === message
    && now - Number(previousAt || 0) < Math.max(0, Number(dedupeMs) || 0)
  );
};
