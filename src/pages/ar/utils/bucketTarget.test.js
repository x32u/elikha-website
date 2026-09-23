import * as THREE from 'three';
import { belongsToBucketTarget, resolveBucketTarget } from './bucketTarget';

test('pointing at a cup targets all cup meshes, not the stick or another cup copy', () => {
  const cup = new THREE.Group();
  const stick = new THREE.Group();
  const copy = new THREE.Group();
  const nested = new THREE.Group();
  const rim = new THREE.Mesh();
  const body = new THREE.Mesh();
  cup.add(nested, body);
  nested.add(rim);
  const stickMesh = new THREE.Mesh();
  stick.add(stickMesh);
  const target = resolveBucketTarget(rim, [cup, stick, copy]);
  expect(target).toBe(cup);
  expect(belongsToBucketTarget(body, target)).toBe(true);
  expect(belongsToBucketTarget(rim, target)).toBe(true);
  expect(belongsToBucketTarget(stickMesh, target)).toBe(false);
  expect(belongsToBucketTarget(copy, target)).toBe(false);
});

test('primitive shapes resolve to their own root and unknown objects never fill the scene', () => {
  const shape = new THREE.Group();
  shape.userData.sceneObjectId = 'cube-1';
  const mesh = new THREE.Mesh();
  shape.add(mesh);
  expect(resolveBucketTarget(mesh, [])).toBe(shape);
  expect(resolveBucketTarget(new THREE.Mesh(), [])).toBeNull();
  expect(belongsToBucketTarget(mesh, null)).toBe(false);
});
