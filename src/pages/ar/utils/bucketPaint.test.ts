import * as THREE from 'three';
import { test, expect } from '@jest/globals';
import { bucketEraseAt, clearBucketPaint, setBucketPaint, type BucketErase } from './bucketPaint';

function uniforms(mesh: THREE.Mesh) {
  const shader = { uniforms: {}, vertexShader: '#include <project_vertex>', fragmentShader: '#include <color_fragment>' };
  (mesh.material as THREE.Material).onBeforeCompile(shader as any, {} as any);
  return shader.uniforms as any;
}

test('bucket preserves brush layers and restores original material after reset', () => {
  const original = new THREE.MeshStandardMaterial({ color: '#cccccc' });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), original);
  const paint = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial({ color: 'yellow' }));
  mesh.add(paint);
  setBucketPaint(mesh, new THREE.Color('red'));
  expect(paint.material.color.getHexString()).toBe('ffff00');
  expect(mesh.children).toEqual([paint]);
  expect(original.color.getHexString()).toBe('cccccc');
  clearBucketPaint(mesh);
  expect(mesh.material).toBe(original);
});

test('local erasing removes bucket color only near the brush, survives replay and refilling', () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  mesh.position.set(2, 3, 4);
  mesh.rotation.y = 0.7;
  mesh.scale.set(2, 2, 2);
  mesh.updateMatrixWorld(true);
  const point = mesh.localToWorld(new THREE.Vector3(0, 0, 0.5));
  const region = bucketEraseAt(mesh, point, 0.25);
  expect(region[2]).toBeCloseTo(0.5);
  expect(region[3]).toBeCloseTo(0.125);
  setBucketPaint(mesh, new THREE.Color('red'), [region]);
  const data = uniforms(mesh).bucketEraseMask.value.image.data;
  expect(data[32 + 64 * (32 + 64 * 63)]).toBe(255);
  expect(data[2 + 64 * (2 + 64 * 63)]).toBe(0);
  const before = Array.from(data);
  clearBucketPaint(mesh);
  setBucketPaint(mesh, new THREE.Color('red'), JSON.parse(JSON.stringify([region])));
  expect(Array.from(uniforms(mesh).bucketEraseMask.value.image.data)).toEqual(before);
  setBucketPaint(mesh, new THREE.Color('blue'));
  expect(uniforms(mesh).bucketEraseMask.value.image.data.some((v: number) => v !== 0)).toBe(false);
  clearBucketPaint(mesh);
});

test('long erasing retains earlier marks with fixed GPU memory and independent mesh materials', () => {
  const original = new THREE.MeshStandardMaterial();
  const a = new THREE.Mesh(new THREE.BoxGeometry(), original);
  const b = new THREE.Mesh(new THREE.BoxGeometry(), original);
  const regions: BucketErase[] = Array.from({ length: 1000 }, (_, i) => [i % 2 ? 0.25 : -0.25, 0, 0.5, 0.06, 0.06, 0.06]);
  setBucketPaint(a, new THREE.Color('red'), regions);
  setBucketPaint(b, new THREE.Color('blue'));
  const first = uniforms(a).bucketEraseMask.value;
  expect(first.image.data.length).toBe(64 ** 3);
  expect(first.image.data[16 + 64 * (32 + 64 * 63)]).toBe(255);
  expect(first.image.data[48 + 64 * (32 + 64 * 63)]).toBe(255);
  expect(uniforms(b).bucketEraseMask.value.image.data.some((v: number) => v !== 0)).toBe(false);
  setBucketPaint(a, new THREE.Color('red'), [...regions, [0, 0, 0.5, 0.1, 0.1, 0.1]]);
  expect(uniforms(a).bucketEraseMask.value).toBe(first);
  clearBucketPaint(a);
  clearBucketPaint(b);
});
