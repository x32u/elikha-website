import { resolveFreeModelImport } from './modelSearchApi';

describe('Poly Haven model import resolution', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('prefers a self-contained GLB that the R2 Worker accepts', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        blend: {
          gltf: 'https://dl.polyhaven.org/audit/1k/audit.gltf',
          glb: 'https://dl.polyhaven.org/audit/2k/audit.glb',
          obj: 'https://dl.polyhaven.org/audit/1k/audit.obj',
        },
      }),
    });

    await expect(resolveFreeModelImport('audit-model')).resolves.toMatchObject({
      modelUrl: 'https://dl.polyhaven.org/audit/2k/audit.glb',
      fileName: 'audit.glb',
      fileType: 'glb',
    });
  });

  test('does not offer a standalone GLTF manifest that the R2 Worker rejects', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        blend: {
          gltf: 'https://dl.polyhaven.org/audit/1k/audit.gltf',
        },
      }),
    });

    await expect(resolveFreeModelImport('gltf-only-model')).rejects.toThrow(
      'No compatible model file found for this asset.'
    );
  });
});
