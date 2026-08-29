export const AR_COLOR_PALETTE = Object.freeze([
  { name: 'red', hex: '#FF0000' },
  { name: 'yellow', hex: '#FFFF00' },
  { name: 'blue', hex: '#0000FF' },
  { name: 'green', hex: '#00A651' },
  { name: 'orange', hex: '#FF8C00' },
  { name: 'violet', hex: '#7B2CFF' },
  { name: 'red orange', hex: '#FF4500' },
  { name: 'yellow orange', hex: '#FFC300' },
  { name: 'yellow green', hex: '#B6E600' },
  { name: 'blue green', hex: '#00B8A9' },
  { name: 'blue violet', hex: '#2563EB' },
  { name: 'red violet', hex: '#C026D3' },
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
export const normalizeArColorSuggestions = (value: unknown): ColorSuggestionItem[] => {
  const rawItems = Array.isArray(value) ? value : [];
  const seen = new Set<string>();

  return rawItems
    .map((rawItem) => {
      if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) return null;
      const item = rawItem as Record<string, unknown>;
      const rawHex = String(item.hex ?? '').trim().toUpperCase();
      const rawName = normalizeName(item.name);
      const match = AR_COLOR_PALETTE.find((color) => (
        (rawHex && color.hex === rawHex) || (rawName && color.name === rawName)
      ));
      if (!match || seen.has(match.hex)) return null;
      seen.add(match.hex);
      return { name: toDisplayName(match.name), hex: match.hex };
    })
    .filter((item): item is ColorSuggestionItem => Boolean(item))
    .slice(0, 3);
};
