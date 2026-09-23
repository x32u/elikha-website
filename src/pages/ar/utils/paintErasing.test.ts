import * as THREE from 'three';
import { describe, expect, test, jest } from '@jest/globals';
import { eraseFootprint } from './paintErasing';
import { recolorModel } from './decals';

jest.mock('three/examples/jsm/geometries/DecalGeometry.js', () => ({ DecalGeometry: class {} }));

describe('paint editing isolation', () => {
  test('eraser footprint is brush sized after rotation and scaling', () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    mesh.position.set(2, 1, -3);
    mesh.rotation.y = 0.6;
    mesh.scale.setScalar(2);
    mesh.updateMatrixWorld(true);
    const point = mesh.localToWorld(new THREE.Vector3(0, 0, 0));
    const footprint = eraseFootprint(mesh, point, 0.1)!;
    expect(footprint[0]).toBeCloseTo(0.5);
    expect(footprint[1]).toBeCloseTo(0.5);
    expect(footprint[2]).toBeCloseTo(0.025);
    expect(footprint[3]).toBeCloseTo(0.025);
    expect(eraseFootprint(mesh, point.clone().addScalar(10), 0.1)).toBeNull();
  });

  test('bucket colors the base but preserves brush decal colors', () => {
    const root = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const brush = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial({ color: 'yellow' }));
    brush.userData.isPaintDecal = true;
    root.add(base, brush);
    recolorModel(root, new THREE.Color('red'));
    expect(base.material.color.getHexString()).toBe('ff0000');
    expect(brush.material.color.getHexString()).toBe('ffff00');
    expect(root.children).toHaveLength(2);
  });
});
