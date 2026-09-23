import * as THREE from 'three';

export function belongsToBucketTarget(object: THREE.Object3D, target: THREE.Object3D | null) {
  if (!target) return false;
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current === target) return true;
    current = current.parent;
  }
  return false;
}

export function resolveBucketTarget(hit: THREE.Object3D, modelRoots: THREE.Object3D[]) {
  let current: THREE.Object3D | null = hit;
  while (current) {
    if (current.userData.sceneObjectId || modelRoots.includes(current)) return current;
    current = current.parent;
  }
  return null;
}
