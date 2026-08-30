import { AR_COLOR_PALETTE, filterToArPalette, matchArPaletteColor } from './arColorPalette';
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

  test('matches by name when the hex is wrong', () => {
    expect(matchArPaletteColor({ name: 'blue violet', hex: '#111111' }))
      .toEqual({ name: 'Blue Violet', hex: '#2563EB' });
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
      { name: 'Electric Blue', hex: '#2563eb' },
      { name: 'red', hex: '#FF0000' },
      { name: 'neon pink', hex: '#FF1493' },
    ])).toEqual([
      { name: 'Blue Violet', hex: '#2563EB' },
      { name: 'Red', hex: '#FF0000' },
    ]);
  });

  test('removes duplicates that resolve to the same palette color', () => {
    expect(filterToArPalette([
      { name: 'blue violet', hex: '#111111' },
      { name: 'BLUE VIOLET', hex: '#2563EB' },
    ])).toEqual([{ name: 'Blue Violet', hex: '#2563EB' }]);
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
