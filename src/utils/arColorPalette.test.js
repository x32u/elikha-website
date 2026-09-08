import { AR_COLOR_PALETTE, filterToArPalette, matchArPaletteColor, sanitizeActivityColorPalette } from './arColorPalette';
import { AR_PRESET_COLORS } from '../pages/ar/utils/colorPalette';

const paletteKey = (colors) => colors
  .map(({ name, hex }) => `${String(name).toLowerCase()}|${String(hex).toUpperCase()}`)
  .sort()
  .join(',');

describe('AR palette is the single source of truth', () => {
  test('matches the colors the AR picker actually offers', () => {
    expect(paletteKey(AR_COLOR_PALETTE)).toBe(paletteKey(AR_PRESET_COLORS));
  });

  test('has no duplicate hex values', () => {
    const hexes = AR_COLOR_PALETTE.map((color) => color.hex);
    expect(new Set(hexes).size).toBe(hexes.length);
  });
});

describe('matchArPaletteColor', () => {
  test('matches by hex regardless of case', () => {
    expect(matchArPaletteColor({ name: 'whatever', hex: '#ff0000' }))
      .toEqual({ name: 'Red', hex: '#FF0000' });
  });

  test('matches custom palettes by name when the hex is wrong', () => {
    expect(matchArPaletteColor({ name: 'ocean', hex: '#111111' }, [{ name: 'ocean', hex: '#1255AA' }]))
      .toEqual({ name: 'Ocean', hex: '#1255AA' });
  });

  test('rejects colors that are not in the AR picker', () => {
    expect(matchArPaletteColor({ name: 'magenta', hex: '#FF00FF' })).toBeNull();
    expect(matchArPaletteColor({ name: 'aqua', hex: '#00FFFF' })).toBeNull();
    expect(matchArPaletteColor(null)).toBeNull();
  });
});

describe('filterToArPalette', () => {
  test('drops off-palette colors and canonicalizes the rest', () => {
    expect(filterToArPalette([
      { name: 'blue', hex: '#0000ff' },
      { name: 'red', hex: '#FF0000' },
      { name: 'neon pink', hex: '#FF1493' },
    ])).toEqual([
      { name: 'Blue', hex: '#0000FF' },
      { name: 'Red', hex: '#FF0000' },
    ]);
  });

  test('removes duplicates that resolve to the same palette color', () => {
    expect(filterToArPalette([
      { name: 'violet', hex: '#111111' },
      { name: 'VIOLET', hex: '#7B2CFF' },
    ])).toEqual([{ name: 'Violet', hex: '#7B2CFF' }]);
  });

  test('returns an empty list when nothing is usable in AR', () => {
    expect(filterToArPalette([
      { name: 'magenta', hex: '#FF00FF' },
      { name: 'chartreuse', hex: '#7FFF00' },
    ])).toEqual([]);
    expect(filterToArPalette(null)).toEqual([]);
  });

  test('caps the list at three suggestions', () => {
    expect(filterToArPalette([
      { name: 'red', hex: '#FF0000' },
      { name: 'blue', hex: '#0000FF' },
      { name: 'green', hex: '#00A651' },
      { name: 'yellow', hex: '#FFFF00' },
    ])).toHaveLength(3);
  });
});

describe('sanitizeActivityColorPalette', () => {
  test('normalizes hex, removes duplicates, and limits activities to ten colors', () => {
    const colors = Array.from({ length: 12 }, (_, index) => ({ hex: `#0000${index.toString(16).padStart(2, '0')}` }));
    colors.unshift({ hex: '#abc', name: '  Custom   Shade ' }, { hex: '#AABBCC' });
    const result = sanitizeActivityColorPalette(colors);
    expect(result).toHaveLength(10);
    expect(result[0]).toEqual({ hex: '#AABBCC', name: 'custom shade' });
  });
});
