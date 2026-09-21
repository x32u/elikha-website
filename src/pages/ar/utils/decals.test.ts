import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, jest, test } from '@jest/globals';
import { createPaintDecal } from './decals';

jest.mock('three/examples/jsm/geometries/DecalGeometry.js', () => {
  const Three = require('three');
  return {
    DecalGeometry: class DecalGeometry extends Three.BufferGeometry {
      constructor(mesh) {
        super();
        this.setAttribute('position', mesh.geometry.attributes.position.clone());
      }
    },
  };
});

const createSkinnedBox = () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const vertexCount = geometry.attributes.position.count;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(vertexCount * 4), 4));
  const weights = new Float32Array(vertexCount * 4);
  for (let index = 0; index < vertexCount; index += 1) weights[index * 4] = 1;
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));

  const bone = new THREE.Bone();
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  mesh.add(bone);
  mesh.bind(new THREE.Skeleton([bone]));
  mesh.updateMatrixWorld(true);
  return mesh;
};

describe('AR paint decals', () => {
  let originalGetContext: PropertyDescriptor | undefined;

  beforeAll(() => {
    originalGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext');
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: jest.fn(() => ({
        createRadialGradient: () => ({ addColorStop: () => {} }),
        clearRect: () => {},
        fillRect: () => {},
        fillStyle: '',
      })),
    });
  });

  afterAll(() => {
    if (originalGetContext) Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', originalGetContext);
  });

  test('projects paint onto skinned models such as the Lion', () => {
    const mesh = createSkinnedBox();
    const decal = createPaintDecal(
      mesh,
      new THREE.Vector3(0, 0, 0.5),
      new THREE.Vector3(0, 0, 1),
      0.3,
      new THREE.Color('#e8576c')
    );

    expect(decal).not.toBeNull();
    expect(decal?.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  test('reuses paint materials instead of allocating one per mark', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    mesh.updateMatrixWorld(true);
    const first = createPaintDecal(mesh, new THREE.Vector3(0, 0, 0.5), new THREE.Vector3(0, 0, 1), 0.2, new THREE.Color('#123456'));
    const second = createPaintDecal(mesh, new THREE.Vector3(0.1, 0, 0.5), new THREE.Vector3(0, 0, 1), 0.2, new THREE.Color('#123456'));
    expect(first?.material).toBe(second?.material);
  });
});
