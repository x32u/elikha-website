import * as THREE from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';

export interface PaintStamp {
  id: string;
  mesh: THREE.Mesh;
  timestamp: number;
}

let circleAlphaMap: THREE.Texture | null = null;
const paintMaterials = new Map<string, THREE.MeshStandardMaterial>();
const deformedProjectionGeometry = new WeakMap<THREE.Mesh, THREE.BufferGeometry>();

function getCircleAlphaMap(): THREE.Texture | null {
  if (circleAlphaMap) return circleAlphaMap;
  if (typeof document === 'undefined') return null;

  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.75, 'rgba(255,255,255,1)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  circleAlphaMap = texture;
  return texture;
}

function getPaintMaterial(color: THREE.Color, isEraser: boolean): THREE.MeshStandardMaterial {
  const materialColor = isEraser ? new THREE.Color(0x000000) : color;
  const key = `${materialColor.getHexString()}:${isEraser ? 'eraser' : 'paint'}`;
  const existing = paintMaterials.get(key);
  if (existing) return existing;

  const alphaMap = getCircleAlphaMap();
  const material = new THREE.MeshStandardMaterial({
    color: materialColor,
    transparent: true,
    opacity: isEraser ? 0.45 : 0.85,
    roughness: 0.55,
    metalness: 0.05,
    ...(alphaMap ? { alphaMap } : {}),
    alphaTest: 0.35,
    depthWrite: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -1,
    side: THREE.DoubleSide,
  });
  paintMaterials.set(key, material);
  return material;
}

/**
 * Create a paint decal at the specified position on a mesh
 */
export function createPaintDecal(
  targetMesh: THREE.Mesh,
  position: THREE.Vector3,
  normal: THREE.Vector3,
  size: number,
  color: THREE.Color,
  isEraser: boolean = false
): THREE.Mesh | null {
  try {
    const orientation = new THREE.Euler();
    const up = new THREE.Vector3(0, 0, 1);
    const quat = new THREE.Quaternion().setFromUnitVectors(
      up,
      normal.clone().normalize()
    );
    orientation.setFromQuaternion(quat);

    let projectionMesh = targetMesh;
    const hasDeformedVertices = targetMesh instanceof THREE.SkinnedMesh
      || Boolean(targetMesh.morphTargetInfluences?.some((weight) => Math.abs(weight) > 1e-6));
    if (hasDeformedVertices && targetMesh.geometry?.attributes?.position) {
      let projectionGeometry = deformedProjectionGeometry.get(targetMesh);
      if (!projectionGeometry) {
        projectionGeometry = targetMesh.geometry.clone();
        const positions = projectionGeometry.attributes.position as THREE.BufferAttribute;
        const vertex = new THREE.Vector3();
        for (let index = 0; index < positions.count; index += 1) {
          targetMesh.getVertexPosition(index, vertex);
          positions.setXYZ(index, vertex.x, vertex.y, vertex.z);
        }
        positions.needsUpdate = true;
        deformedProjectionGeometry.set(targetMesh, projectionGeometry);
      }
      projectionMesh = new THREE.Mesh(projectionGeometry, targetMesh.material);
      projectionMesh.matrixWorld.copy(targetMesh.matrixWorld);
    }

    const decalGeometry = new DecalGeometry(
      projectionMesh,
      position,
      orientation,
      new THREE.Vector3(size, size, size)
    );

    const decalMaterial = getPaintMaterial(color, isEraser);
    const decalMesh = new THREE.Mesh(decalGeometry, decalMaterial);
    decalMesh.userData.usesSharedPaintMaterial = true;
    return decalMesh;
  } catch (error) {
    console.warn('Failed to create decal:', error);
    return null;
  }
}

/**
 * Apply full model recolor (fallback mode)
 */
export function recolorModel(model: THREE.Object3D, color: THREE.Color): void {
  model.traverse((child) => {
    if (child.userData.isPaintDecal || child.userData.isSceneObjectPaintDecal) return;
    if (child instanceof THREE.Mesh) {
      if (Array.isArray(child.material)) {
        child.material.forEach((mat) => {
          if ('color' in mat) {
            (mat as any).color.copy(color);
          }
        });
      } else if ('color' in child.material) {
        (child.material as any).color.copy(color);
      }
    }
  });
}
