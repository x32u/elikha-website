import {
  AR_OBJECT_LIBRARY,
  getArModelLibrary,
  getArRenderableModelLibrary,
  replaceR2ArModelLibrary,
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
    expect(labels).toEqual(['Cone', 'Cube', 'Cylinder', 'Sphere']);
  });

  test('keeps newly added 3D models alphabetized', () => {
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
});
