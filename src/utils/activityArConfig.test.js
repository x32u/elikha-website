import {
  AR_OBJECT_LIBRARY,
  encodeActivityDescription,
  getArModelLibrary,
  getArRenderableModelLibrary,
  replaceR2ArModelLibrary,
  parseActivityDescription,
} from './activityArConfig';

describe('AR model format handling', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('keeps Blender source files in storage but excludes them from AR choices', () => {
    replaceR2ArModelLibrary([
      {
        id: 'custom-blender-source',
        label: 'Blender Source',
        modelUrl: 'https://models.example/custom-blender-source.blend',
        fileName: 'craft.blend',
        fileType: 'blend',
      },
      {
        id: 'custom-ready-model',
        label: 'Ready Model',
        modelUrl: 'https://models.example/custom-ready-model.glb',
        fileName: 'craft.glb',
        fileType: 'glb',
      },
    ]);

    expect(getArModelLibrary().some((model) => model.fileType === 'blend')).toBe(true);
    expect(getArRenderableModelLibrary().some((model) => model.fileType === 'blend')).toBe(false);
    expect(getArRenderableModelLibrary().some((model) => model.fileType === 'glb')).toBe(true);
  });

  test('keeps 2D object choices alphabetized', () => {
    const labels = AR_OBJECT_LIBRARY.map((item) => item.label);
    expect(labels).toEqual(['Cone', 'Cube', 'Cylinder', 'Rectangle', 'Sphere']);
  });

  test('uses alphabetical fallback when upload dates are unavailable', () => {
    replaceR2ArModelLibrary([
      {
        id: 'zebra',
        label: 'Zebra',
        modelUrl: 'https://models.example/zebra.glb',
        fileType: 'glb',
      },
      {
        id: 'apple',
        label: 'Apple',
        modelUrl: 'https://models.example/apple.glb',
        fileType: 'glb',
      },
    ]);

    const labels = getArRenderableModelLibrary().map((model) => model.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, undefined, {
      numeric: true,
      sensitivity: 'base',
    })));
    expect(labels.indexOf('Apple')).toBeLessThan(labels.indexOf('Zebra'));
  });

  test('puts the newest upload first even when its name sorts last', () => {
    replaceR2ArModelLibrary([
      { id: 'old-apple', label: 'Apple', modelUrl: '/apple.glb', uploadedAt: '2026-09-01T00:00:00Z' },
      { id: 'new-zebra', label: 'Zebra', modelUrl: '/zebra.glb', uploadedAt: '2026-09-29T00:00:00Z' },
    ]);
    expect(getArModelLibrary().slice(0, 2).map(model => model.id)).toEqual(['new-zebra', 'old-apple']);
  });

  test('keeps teacher-confirmed expected colors in the activity payload', () => {
    const parsed = parseActivityDescription(encodeActivityDescription('Color practice', {
      colorRequirements: [{ targetType: 'object', targetId: 'cube', targetLabel: 'Cube', colorHex: '#FF0000' }],
    }));
    expect(parsed.colorRequirements).toEqual([
      expect.objectContaining({ targetId: 'cube', colorHex: '#FF0000', colorName: 'red' }),
    ]);
  });

  test('round-trips a custom ordered activity palette and rejects off-palette targets', () => {
    const parsed = parseActivityDescription(encodeActivityDescription('Custom colors', {
      allowedColors: [{ hex: '#12ab34', name: 'Leaf' }, { hex: '#445566' }],
      colorRequirements: [
        { targetType: 'object', targetId: 'cube', colorHex: '#12AB34' },
        { targetType: 'object', targetId: 'sphere', colorHex: '#FF0000' },
      ],
    }));
    expect(parsed.allowedColors).toEqual([{ hex: '#12AB34', name: 'leaf' }, { hex: '#445566', name: undefined }]);
    expect(parsed.colorRequirements).toHaveLength(1);
    expect(parsed.colorRequirements[0].colorHex).toBe('#12AB34');
  });
});
