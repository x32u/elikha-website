import * as THREE from 'three';
import { test, expect } from '@jest/globals';
import { placeModelInView } from './modelPlacement';

test.each([0.45, 0.75, 1, 1.8, 2.4])('fits repeated copies inside aspect ratio %s without moving existing art', (aspect) => {
  const camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 100);
  camera.position.set(4, 2, 6);
  camera.rotation.set(0.2, 0.5, 0);
  camera.zoom = 2;
  camera.updateProjectionMatrix();
  const anchor = new THREE.Group();
  anchor.position.set(2, -1, -3);
  anchor.rotation.set(0.1, 0.4, 0.2);
  anchor.scale.setScalar(2);
  let first: THREE.Mesh | undefined;
  let firstPosition: THREE.Vector3 | undefined;
  for (let i = 0; i < 20; i += 1) {
    const model = new THREE.Mesh(new THREE.BoxGeometry(100, 12, 40), new THREE.MeshBasicMaterial());
    anchor.add(model);
    placeModelInView(model, camera);
    const box = new THREE.Box3().setFromObject(model);
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const projected = new THREE.Vector3(x, y, z).project(camera);
      expect(Math.abs(projected.x)).toBeLessThan(0.9);
      expect(Math.abs(projected.y)).toBeLessThan(0.9);
      expect(Math.abs(projected.z)).toBeLessThan(1);
    }
    if (!first) { first = model; firstPosition = model.position.clone(); }
    expect(first.position.equals(firstPosition!)).toBe(true);
  }
});
