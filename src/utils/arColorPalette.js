export const MAX_ACTIVITY_COLORS = 10;

export const DEFAULT_AR_COLOR_PALETTE = Object.freeze([
  { hex: '#FF0000', name: 'red' }, { hex: '#FFFF00', name: 'yellow' },
  { hex: '#0000FF', name: 'blue' }, { hex: '#00A651', name: 'green' },
  { hex: '#FF8C00', name: 'orange' }, { hex: '#7B2CFF', name: 'violet' },
  { hex: '#8B5A2B', name: 'brown' }, { hex: '#F2C29B', name: 'skin tone' },
  { hex: '#FFFFFF', name: 'white' }, { hex: '#000000', name: 'black' },
]);

export const AR_COLOR_PALETTE = DEFAULT_AR_COLOR_PALETTE;

const normalizeName = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const toDisplayName = (value) => String(value || '').replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());

export const normalizeHexColor = (value) => {
  const raw = String(value ?? '').trim().replace(/^#/, '');
  const expanded = /^[0-9a-f]{3}$/i.test(raw) ? raw.split('').map((character) => `${character}${character}`).join('') : raw;
  return /^[0-9a-f]{6}$/i.test(expanded) ? `#${expanded.toUpperCase()}` : null;
};

export const sanitizeActivityColorPalette = (colors, { fallback = false } = {}) => {
  const seen = new Set();
  const sanitized = (Array.isArray(colors) ? colors : [])
    .map((color) => {
      if (typeof color === 'string') return { hex: normalizeHexColor(color) };
      if (!color || typeof color !== 'object') return null;
      return { hex: normalizeHexColor(color.hex), name: normalizeName(color.name).slice(0, 40) || undefined };
    })
    .filter((color) => {
      if (!color?.hex || seen.has(color.hex)) return false;
      seen.add(color.hex);
      return true;
    })
    .slice(0, MAX_ACTIVITY_COLORS);
  return sanitized.length || !fallback ? sanitized : DEFAULT_AR_COLOR_PALETTE.map((color) => ({ ...color }));
};

export const resolveActivityColorPalette = (colors) => sanitizeActivityColorPalette(colors, { fallback: true });

export const matchArPaletteColor = (color, palette = DEFAULT_AR_COLOR_PALETTE) => {
  if (!color || typeof color !== 'object') return null;
  const available = resolveActivityColorPalette(palette);
  const hex = normalizeHexColor(color.hex);
  const name = normalizeName(color.name);
  const match = available.find((paletteColor) => (hex && paletteColor.hex === hex)
    || (name && normalizeName(paletteColor.name) === name));
  return match ? { name: match.name ? toDisplayName(match.name) : match.hex, hex: match.hex } : null;
};

export const filterToArPalette = (colors, limit = 3, palette = DEFAULT_AR_COLOR_PALETTE) => {
  const seen = new Set();
  return (Array.isArray(colors) ? colors : []).map((color) => matchArPaletteColor(color, palette)).filter((color) => {
    if (!color || seen.has(color.hex)) return false;
    seen.add(color.hex);
    return true;
  }).slice(0, limit);
};
