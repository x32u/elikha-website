import * as THREE from 'three';

/**
 * Convert normalized 2D screen coordinates to 3D ray
 * @param x Normalized x coordinate (0-1)
 * @param y Normalized y coordinate (0-1)
 * @param camera Three.js camera
 */
export function screenToRay(
  x: number,
  y: number,
  camera: THREE.Camera
): THREE.Raycaster {
  // Convert to NDC (Normalized Device Coordinates: -1 to 1)
  const ndc = new THREE.Vector2(x * 2 - 1, -(y * 2 - 1));

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);

  return raycaster;
}

/**
 * Raycast from fingertip position to find intersections with objects
 */
export function raycastFromFingertip(
  fingertipX: number,
  fingertipY: number,
  camera: THREE.Camera,
  objects: THREE.Object3D[]
): THREE.Intersection[] {
  const raycaster = screenToRay(fingertipX, fingertipY, camera);
  return raycaster.intersectObjects(objects, true);
}

/**
 * Check if fingertip is "touching" the surface based on depth proximity
 */
export function isTouchingSurface(
  fingertipDepth: number,
  hitDistance: number,
  tolerance: number = 0.1
): boolean {
  return Math.abs(fingertipDepth - hitDistance) < tolerance;
}
