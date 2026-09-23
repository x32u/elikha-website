import * as THREE from 'three';

export type ErasedRegion = [number, number, number, number];

// Find the brush footprint in a decal's UV space, using current world transforms.
export function eraseFootprint(mesh: THREE.Mesh, point: THREE.Vector3, radius: number): ErasedRegion | null {
  mesh.updateWorldMatrix(true, false);
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
  const bounds = mesh.geometry.boundingSphere?.clone().applyMatrix4(mesh.matrixWorld);
  if (bounds && bounds.center.distanceTo(point) > bounds.radius + radius) return null;
  const positions = mesh.geometry.getAttribute('position');
  const uv = mesh.geometry.getAttribute('uv');
  if (!positions || !uv) return null;
  const index = mesh.geometry.index;
  let nearest = Infinity;
  let result: ErasedRegion | null = null;
  for (let i = 0; i < (index?.count || positions.count); i += 3) {
    const ids = [0, 1, 2].map((offset) => index ? index.getX(i + offset) : i + offset);
    const [a, b, c] = ids.map((id) => new THREE.Vector3().fromBufferAttribute(positions, id).applyMatrix4(mesh.matrixWorld));
    const triangle = new THREE.Triangle(a, b, c);
    const closest = triangle.closestPointToPoint(point, new THREE.Vector3());
    const distance = closest.distanceTo(point);
    if (distance > radius || distance >= nearest) continue;
    const bary = triangle.getBarycoord(closest, new THREE.Vector3());
    if (!bary) continue;
    const [ua, ub, uc] = ids.map((id) => new THREE.Vector2(uv.getX(id), uv.getY(id)));
    const dab = ub.clone().sub(ua), dac = uc.clone().sub(ua);
    const determinant = dab.x * dac.y - dab.y * dac.x;
    if (Math.abs(determinant) < 1e-8) continue;
    const ab = b.clone().sub(a), ac = c.clone().sub(a);
    const uLength = ab.clone().multiplyScalar(dac.y).addScaledVector(ac, -dab.y).divideScalar(determinant).length();
    const vLength = ac.clone().multiplyScalar(dab.x).addScaledVector(ab, -dac.x).divideScalar(determinant).length();
    const center = ua.multiplyScalar(bary.x).addScaledVector(ub, bary.y).addScaledVector(uc, bary.z);
    nearest = distance;
    result = [center.x, center.y, radius / Math.max(uLength, 1e-6), radius / Math.max(vLength, 1e-6)];
  }
  return result;
}

export function applyErasedRegions(mesh: THREE.Mesh, regions: ErasedRegion[]) {
  if (!regions.length || typeof document === 'undefined') return;
  let canvas = mesh.userData.eraseCanvas as HTMLCanvasElement | undefined;
  const material = mesh.material as THREE.MeshStandardMaterial;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context || !material.alphaMap?.image) return;
    context.drawImage(material.alphaMap.image as HTMLCanvasElement, 0, 0, 128, 128);
    mesh.material = material.clone();
    const ownMaterial = mesh.material as THREE.MeshStandardMaterial;
    ownMaterial.alphaMap = new THREE.CanvasTexture(canvas);
    ownMaterial.needsUpdate = true;
    mesh.userData.usesSharedPaintMaterial = false;
    mesh.userData.eraseCanvas = canvas;
  }
  const context = canvas.getContext('2d')!;
  // Alpha maps use their green channel, so erase with black, not transparency.
  context.fillStyle = 'black';
  for (const [u, v, rx, ry] of regions) {
    if (![u, v, rx, ry].every(Number.isFinite) || rx <= 0 || ry <= 0) continue;
    context.beginPath();
    context.ellipse(u * 128, (1 - v) * 128, rx * 128, ry * 128, 0, 0, Math.PI * 2);
    context.fill();
  }
  (mesh.material as THREE.MeshStandardMaterial).alphaMap!.needsUpdate = true;
}
