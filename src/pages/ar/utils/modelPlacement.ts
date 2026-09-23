import * as THREE from 'three';

/** Place a whole model inside the current camera's central safe area. */
export function placeModelInView(model: THREE.Object3D, camera: THREE.Camera) {
  camera.updateMatrixWorld(true);
  model.updateWorldMatrix(true, true);
  const perspective = camera as THREE.PerspectiveCamera;
  const distance = 3;
  const halfHeight = perspective.isPerspectiveCamera
    ? distance * Math.tan(THREE.MathUtils.degToRad(perspective.fov / 2)) / perspective.zoom : 1;
  const halfWidth = halfHeight * (perspective.aspect || 1);
  const radius = Math.min(halfWidth, halfHeight) * 0.16;
  const sphere = new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere());
  if (Number.isFinite(sphere.radius) && sphere.radius > 0) model.scale.multiplyScalar(radius / sphere.radius);

  const occupied = (model.parent?.children || []).filter((item) => item !== model).map((item) =>
    new THREE.Box3().setFromObject(item).getBoundingSphere(new THREE.Sphere()));
  const slots = [[0.32, 0.3], [-0.32, 0.3], [0.32, -0.22], [-0.32, -0.22], [0, 0.3], [0, -0.22]];
  const candidates = slots.map(([x, y]) => new THREE.Vector3(x * halfWidth, y * halfHeight, -distance).applyMatrix4(camera.matrixWorld));
  const overlap = (point: THREE.Vector3) => occupied.reduce((sum, other) =>
    sum + Math.max(0, radius + other.radius - point.distanceTo(other.center)), 0);
  // Prefer upper-right, then the least occupied safe slot. A full workspace
  // never pushes a new object beyond the viewport.
  const destination = candidates.reduce((best, next) => overlap(next) < overlap(best) ? next : best).clone();
  model.updateWorldMatrix(true, true);
  const center = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
  const origin = model.getWorldPosition(new THREE.Vector3());
  destination.sub(center.sub(origin));
  model.position.copy(model.parent ? model.parent.worldToLocal(destination) : destination);
  model.updateMatrixWorld(true);
}
