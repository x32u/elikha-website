import * as THREE from 'three';

// Object-local ellipsoids: independent of UV seams and valid after moving/scaling.
export type BucketErase = [number, number, number, number, number, number];
type FillState = {
  original: THREE.Material | THREE.Material[];
  materials: THREE.Material[];
  color: { value: THREE.Color };
  mask: { value: THREE.Data3DTexture };
  bounds: THREE.Box3;
  regions: BucketErase[];
};
const fills = new WeakMap<THREE.Mesh, FillState>();
const MASK_SIZE = 64;

function maskTexture() {
  // Fixed GPU memory and constant-time sampling, regardless of session length.
  const texture = new THREE.Data3DTexture(new Uint8Array(MASK_SIZE ** 3), MASK_SIZE, MASK_SIZE, MASK_SIZE);
  texture.format = THREE.RedFormat;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

function updateMask(state: FillState, regions: BucketErase[]) {
  const data = state.mask.value.image.data as Uint8Array;
  const incremental = state.regions.length <= regions.length && state.regions.every((r, i) => r === regions[i]);
  if (!incremental) data.fill(0);
  const size = state.bounds.getSize(new THREE.Vector3());
  for (const [x, y, z, rx, ry, rz] of regions.slice(incremental ? state.regions.length : 0)) {
    if (![x, y, z, rx, ry, rz].every(Number.isFinite) || Math.min(rx, ry, rz) <= 0) continue;
    const center = [x, y, z], radius = [rx, ry, rz];
    const min = state.bounds.min.toArray(), extent = size.toArray();
    const lo = center.map((c, i) => Math.max(0, Math.floor((c - radius[i] - min[i]) / extent[i] * MASK_SIZE)));
    const hi = center.map((c, i) => Math.min(MASK_SIZE - 1, Math.ceil((c + radius[i] - min[i]) / extent[i] * MASK_SIZE)));
    for (let iz = lo[2]; iz <= hi[2]; iz++) for (let iy = lo[1]; iy <= hi[1]; iy++) for (let ix = lo[0]; ix <= hi[0]; ix++) {
      const distance = [ix, iy, iz].reduce((sum, cell, axis) => sum + ((min[axis] + (cell + 0.5) / MASK_SIZE * extent[axis] - center[axis]) / radius[axis]) ** 2, 0);
      if (distance <= 1) data[ix + MASK_SIZE * (iy + MASK_SIZE * iz)] = 255;
    }
  }
  state.regions = regions;
  state.mask.value.needsUpdate = true;
}

export function setBucketPaint(mesh: THREE.Mesh, color: THREE.Color, regions: BucketErase[] = []) {
  let state = fills.get(mesh);
  if (!state) {
    const original = mesh.material;
    const materials = (Array.isArray(original) ? original : [original]).map((material) => material.clone());
    mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox!.clone();
    if (mesh instanceof THREE.SkinnedMesh || mesh.morphTargetInfluences?.some((weight) => weight !== 0)) {
      bounds.makeEmpty();
      const vertex = new THREE.Vector3();
      for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
        mesh.getVertexPosition(i, vertex);
        bounds.expandByPoint(vertex);
      }
    }
    // Nonzero thickness for planar meshes; a little padding retains edge sampling.
    bounds.expandByScalar(Math.max(bounds.getSize(new THREE.Vector3()).length() * 0.001, 0.00001));
    state = { original, materials, color: { value: color.clone() }, mask: { value: maskTexture() }, bounds, regions: [] };
    const uniforms = state;
    materials.forEach((material, index) => {
      const source = Array.isArray(original) ? original[index] : original;
      material.onBeforeCompile = (shader, renderer) => {
        source.onBeforeCompile(shader, renderer);
        shader.uniforms.bucketColor = uniforms.color;
        shader.uniforms.bucketEraseMask = uniforms.mask;
        shader.uniforms.bucketBoundsMin = { value: uniforms.bounds.min };
        shader.uniforms.bucketBoundsSize = { value: uniforms.bounds.getSize(new THREE.Vector3()) };
        shader.vertexShader = 'varying vec3 bucketPosition;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', 'bucketPosition = transformed;\n#include <project_vertex>');
        shader.fragmentShader = `varying vec3 bucketPosition;
uniform vec3 bucketColor;
uniform highp sampler3D bucketEraseMask;
uniform vec3 bucketBoundsMin;
uniform vec3 bucketBoundsSize;
` + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
float bucketErased = texture(bucketEraseMask, (bucketPosition - bucketBoundsMin) / bucketBoundsSize).r;
diffuseColor.rgb = mix(bucketColor, diffuseColor.rgb, smoothstep(0.25, 0.75, bucketErased));
`);
      };
      material.customProgramCacheKey = () => `${source.customProgramCacheKey()}:bucket-local-erase-v1`;
    });
    mesh.material = Array.isArray(original) ? materials : materials[0];
    fills.set(mesh, state);
  }
  state.color.value.copy(color);
  updateMask(state, regions);
}

export function bucketEraseAt(mesh: THREE.Mesh, point: THREE.Vector3, radius: number): BucketErase {
  mesh.updateWorldMatrix(true, false);
  const local = mesh.worldToLocal(point.clone());
  const scale = mesh.getWorldScale(new THREE.Vector3());
  return [local.x, local.y, local.z, radius / Math.max(Math.abs(scale.x), 1e-6),
    radius / Math.max(Math.abs(scale.y), 1e-6), radius / Math.max(Math.abs(scale.z), 1e-6)];
}

export function clearBucketPaint(mesh: THREE.Mesh) {
  const state = fills.get(mesh);
  if (!state) return;
  mesh.material = state.original;
  state.materials.forEach((material) => material.dispose());
  state.mask.value.dispose();
  fills.delete(mesh);
}
