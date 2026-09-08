export const AR_COLOR_PALETTE = Object.freeze([
  { name: 'red', hex: '#FF0000' },
  { name: 'yellow', hex: '#FFFF00' },
  { name: 'blue', hex: '#0000FF' },
  { name: 'green', hex: '#00A651' },
  { name: 'orange', hex: '#FF8C00' },
  { name: 'violet', hex: '#7B2CFF' },
  { name: 'brown', hex: '#8B5A2B' },
  { name: 'skin tone', hex: '#F2C29B' },
  { name: 'white', hex: '#FFFFFF' },
  { name: 'black', hex: '#000000' },
]);

type ColorSuggestionItem = { name: string; hex: string };

const normalizeName = (value: unknown) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ');

const toDisplayName = (value: string) => value.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());

/**
 * Converts model output into the exact colors available in the AR palette.
 * Unknown names/hex values are discarded rather than shown to a learner.
 */
export const resolveActivityColorPalette = (value: unknown): ColorSuggestionItem[] => {
  const seen = new Set<string>();
  const normalized = (Array.isArray(value) ? value : []).map((rawItem) => {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) return null;
    const item = rawItem as Record<string, unknown>;
    const hex = String(item.hex ?? '').trim().toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(hex) || seen.has(hex)) return null;
    seen.add(hex);
    return { hex, name: normalizeName(item.name) || hex };
  }).filter((item): item is ColorSuggestionItem => Boolean(item)).slice(0, 10);
  return normalized.length ? normalized : AR_COLOR_PALETTE.map((item) => ({ ...item }));
};

export const normalizeArColorSuggestions = (value: unknown, palette: unknown = AR_COLOR_PALETTE): ColorSuggestionItem[] => {
  const rawItems = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const available = resolveActivityColorPalette(palette);

  return rawItems
    .map((rawItem) => {
      if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) return null;
      const item = rawItem as Record<string, unknown>;
      const rawHex = String(item.hex ?? '').trim().toUpperCase();
      const rawName = normalizeName(item.name);
      const match = available.find((color) => (
        (rawHex && color.hex === rawHex) || (rawName && color.name === rawName)
      ));
      if (!match || seen.has(match.hex)) return null;
      seen.add(match.hex);
      return { name: match.name.startsWith('#') ? match.name : toDisplayName(match.name), hex: match.hex };
    })
    .filter((item): item is ColorSuggestionItem => Boolean(item))
    .slice(0, 3);
};
