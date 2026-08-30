/**
 * Colors available in the AR activity picker.
 *
 * This is the single source of truth for the web app. The Groq grading Edge
 * Function keeps its own copy at
 * `supabase/functions/grade-ar-submission/colorPalette.ts` because Deno cannot
 * import from `src/`; `arColorPalette.test.js` fails if the two ever drift.
 *
 * A learner can only paint with these colors, so any AI color suggestion that
 * falls outside the list is unusable advice and must never reach a child.
 */
export const AR_COLOR_PALETTE = Object.freeze([
  // Primary colors
  { hex: '#FF0000', name: 'red' },
  { hex: '#FFFF00', name: 'yellow' },
  { hex: '#0000FF', name: 'blue' },
  // Secondary colors
  { hex: '#00A651', name: 'green' },
  { hex: '#FF8C00', name: 'orange' },
  { hex: '#7B2CFF', name: 'violet' },
  // Tertiary colors
  { hex: '#FF4500', name: 'red orange' },
  { hex: '#FFC300', name: 'yellow orange' },
  { hex: '#B6E600', name: 'yellow green' },
  { hex: '#00B8A9', name: 'blue green' },
  { hex: '#2563EB', name: 'blue violet' },
  { hex: '#C026D3', name: 'red violet' },
  // Helpful neutrals and art tones
  { hex: '#8B5A2B', name: 'brown' },
  { hex: '#F2C29B', name: 'skin tone' },
  { hex: '#FFFFFF', name: 'white' },
  { hex: '#000000', name: 'black' },
]);

const normalizeName = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const toDisplayName = (value) => value.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());

/**
 * Matches one suggested color against the AR palette by hex or by name.
 * Returns null when the color is not something the learner can actually use.
 */
export const matchArPaletteColor = (color) => {
  if (!color || typeof color !== 'object') return null;
  const hex = String(color.hex ?? '').trim().toUpperCase();
  const name = normalizeName(color.name);
  const match = AR_COLOR_PALETTE.find(
    (paletteColor) => (hex && paletteColor.hex === hex) || (name && paletteColor.name === name),
  );
  return match ? { name: toDisplayName(match.name), hex: match.hex } : null;
};

/**
 * Keeps only palette colors, canonicalizes their labels, and drops duplicates.
 * Mirrors `normalizeArColorSuggestions` in the grading Edge Function so a
 * learner sees the same filtered list no matter which layer served it.
 */
export const filterToArPalette = (colors, limit = 3) => {
  const seen = new Set();
  return (Array.isArray(colors) ? colors : [])
    .map(matchArPaletteColor)
    .filter((color) => {
      if (!color || seen.has(color.hex)) return false;
      seen.add(color.hex);
      return true;
    })
    .slice(0, limit);
};
