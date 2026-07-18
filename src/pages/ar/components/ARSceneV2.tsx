// @ts-nocheck
/// <reference path="../../../three-jsx.d.ts" />
import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { ModelLoader } from './ModelLoader';
import type { HandLandmarks, GrabState, DebugInfo, PalmPosition } from '../hooks/useHandTrackingV2';
import { CONFIG } from '../hooks/useHandTrackingV2';
import { raycastFromFingertip } from '../utils/raycasting';
import { createPaintDecal } from '../utils/decals';
import { recolorModel } from '../utils/decals';
import type { PaintStamp } from '../utils/decals';
import { isPointingGesture } from '../utils/gestures';
import { getArObjectDefinition } from '../../../utils/activityArConfig';

export interface SerializedPaintDecal {
  id: string;
  meshPath: number[];
  point: [number, number, number];
  normal: [number, number, number];
  size: number;
  color: string;
  timestamp: number;
  layer?: number;
  mode?: 'decal' | 'fill';
}

export interface SerializedSceneObjectPaintDecal {
  id: string;
  point: [number, number, number];
  normal: [number, number, number];
  size: number;
  color: string;
  timestamp: number;
  layer?: number;
}

export interface SerializedSceneObject {
  id: string;
  objectId: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  color?: string;
  gluedTo?: string | null;
  groupId?: string | null;
  paint?: SerializedSceneObjectPaintDecal[];
}

export interface SerializedPuzzlePiece {
  id: string;
  position: [number, number, number];
  locked: boolean;
  spawned?: boolean;
}

export interface SerializedBaseModelTransform {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface SerializedArGroupTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface ObjectSpawnRequest {
  requestId: number;
  objectId: string;
}

export interface PuzzlePieceSpawnRequest {
  requestId: number;
  pieceId: string;
}

export interface BaseArModelConfig {
  instanceId?: string;
  id?: string;
  label?: string;
  modelUrl: string;
  modelFileType?: string;
}

interface ARSceneV2Props {
  modelUrl?: string;
  modelFileType?: string;
  modelConfigs?: BaseArModelConfig[];
  handLandmarks: HandLandmarks | null;
  grabState: GrabState;
  debugInfo: DebugInfo;
  targetQuaternion: THREE.Quaternion;
  paintMode: boolean;
  paintColor: THREE.Color;
  brushSize: number;
  isEraser: boolean;
  isBucketFill?: boolean;
  isRemoveTool?: boolean;
  mirrorX?: boolean;
  stateVersion?: number;
  debugMode?: boolean;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
  initialPaintState?: SerializedPaintDecal[];
  onPaintStateChange?: (paintState: SerializedPaintDecal[]) => void;
  initialSceneState?: SerializedSceneObject[];
  onSceneStateChange?: (sceneState: SerializedSceneObject[]) => void;
  spawnObjectRequest?: ObjectSpawnRequest | null;
  puzzlePieceSpawnRequest?: PuzzlePieceSpawnRequest | null;
  selectedModelId?: string | null;
  groupBaseModels?: boolean;
  puzzlePieces?: number;
  initialModelState?: SerializedBaseModelTransform[];
  onModelStateChange?: (modelState: SerializedBaseModelTransform[]) => void;
  initialGroupState?: SerializedArGroupTransform | null;
  onGroupStateChange?: (groupState: SerializedArGroupTransform) => void;
  initialPuzzleState?: SerializedPuzzlePiece[];
  onPuzzleStateChange?: (puzzleState: SerializedPuzzlePiece[]) => void;
}

const PRIMITIVE_GEOMETRIES: Record<string, THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(0.6, 24, 24),
  cone: new THREE.ConeGeometry(0.55, 1.1, 20),
  cylinder: new THREE.CylinderGeometry(0.45, 0.45, 1, 20),
};
const SCENE_OBJECT_PAINT_STAMP_LIMIT = Number.POSITIVE_INFINITY;
const BASE_MODEL_PAINT_STAMP_LIMIT = Number.POSITIVE_INFINITY;
const DEFAULT_GROUP_TRANSFORM: SerializedArGroupTransform = {
  position: [0, 0, -3],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};
const PUZZLE_LAYOUT_VERSION = 'vertical-clipped-cuts-v3';
const PUZZLE_PIECE_OUTLINE_COLORS = [0xffd166, 0x6ee7ff, 0xb8ff7a, 0xff8fc7];

type PuzzleClipVertex = {
  position: THREE.Vector3;
  normal?: THREE.Vector3;
  uv?: THREE.Vector2;
};

function normalizeBaseModelConfigs(
  modelConfigs: BaseArModelConfig[] | undefined,
  fallbackUrl?: string,
  fallbackFileType?: string
): Required<BaseArModelConfig>[] {
  const configured = Array.isArray(modelConfigs)
    ? modelConfigs.filter((model) => typeof model?.modelUrl === 'string' && model.modelUrl.trim())
    : [];
  const source = configured.length > 0
    ? configured
    : [{
        id: 'model-0',
        label: 'Model',
        modelUrl: fallbackUrl || '/models/13137_LatinMask1_v1.obj',
        modelFileType: fallbackFileType || '',
      }];

  return source.map((model, index) => ({
    instanceId: source.length > 1 ? (model.instanceId || `model-${index}`) : '',
    id: model.id || `model-${index}`,
    label: model.label || `Model ${index + 1}`,
    modelUrl: model.modelUrl,
    modelFileType: model.modelFileType || '',
  }));
}

function getMultiModelPosition(index: number, count: number): [number, number, number] {
  const spacing = count > 2 ? 1.05 : 1.2;
  return [(index - (count - 1) / 2) * spacing, 0, 0];
}

function isFiniteVector3Tuple(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
  );
}

function normalizeSerializedModelState(inputState?: SerializedBaseModelTransform[]): SerializedBaseModelTransform[] {
  if (!Array.isArray(inputState)) return [];

  return inputState
    .map((entry) => {
      const id = String(entry?.id || '').trim();
      if (!id) return null;

      return {
        id,
        position: isFiniteVector3Tuple(entry.position) ? [...entry.position] : [0, 0, 0],
        rotation: isFiniteVector3Tuple(entry.rotation) ? [...entry.rotation] : [0, 0, 0],
        scale: isFiniteVector3Tuple(entry.scale) ? [...entry.scale] : [1, 1, 1],
      } as SerializedBaseModelTransform;
    })
    .filter(Boolean) as SerializedBaseModelTransform[];
}

function serializeBaseModelTransform(id: string, model: THREE.Object3D): SerializedBaseModelTransform {
  return {
    id,
    position: [model.position.x, model.position.y, model.position.z],
    rotation: [model.rotation.x, model.rotation.y, model.rotation.z],
    scale: [model.scale.x, model.scale.y, model.scale.z],
  };
}

function applyBaseModelTransform(model: THREE.Object3D, transform?: SerializedBaseModelTransform | null) {
  if (!transform) return;

  model.position.set(...transform.position);
  model.rotation.set(...transform.rotation);
  model.scale.set(...transform.scale);
  model.updateMatrixWorld(true);
}

function normalizeSerializedGroupTransform(inputState?: SerializedArGroupTransform | null): SerializedArGroupTransform | null {
  if (!inputState || typeof inputState !== 'object') return null;

  return {
    position: isFiniteVector3Tuple(inputState.position) ? [...inputState.position] : [0, 0, -3],
    rotation: isFiniteVector3Tuple(inputState.rotation) ? [...inputState.rotation] : [0, 0, 0],
    scale: isFiniteVector3Tuple(inputState.scale) ? [...inputState.scale] : [1, 1, 1],
  };
}

function serializeGroupTransform(group: THREE.Object3D): SerializedArGroupTransform {
  return {
    position: [group.position.x, group.position.y, group.position.z],
    rotation: [group.rotation.x, group.rotation.y, group.rotation.z],
    scale: [group.scale.x, group.scale.y, group.scale.z],
  };
}

function applyGroupTransform(group: THREE.Object3D, transform?: SerializedArGroupTransform | null) {
  if (!transform) return;

  group.position.set(...transform.position);
  group.rotation.set(...transform.rotation);
  group.scale.set(...transform.scale);
  group.updateMatrixWorld(true);
}

function SceneModelLoader({
  model,
  position,
  scale,
  initialTransform,
  onModelLoad,
}: {
  model: Required<BaseArModelConfig>;
  position: [number, number, number];
  scale: number;
  initialTransform?: SerializedBaseModelTransform | null;
  onModelLoad: (instanceId: string, model: THREE.Group) => void;
}) {
  const [loadedModel, setLoadedModel] = useState<THREE.Group | null>(null);
  const instanceId = model.instanceId || model.id;

  const handleLoad = useCallback((nextModel: THREE.Group) => {
    setLoadedModel(nextModel);
  }, []);

  useEffect(() => {
    if (!loadedModel) return;
    applyBaseModelTransform(loadedModel, initialTransform);
    onModelLoad(instanceId, loadedModel);
  }, [initialTransform, instanceId, loadedModel, onModelLoad]);

  return (
    <ModelLoader
      url={model.modelUrl}
      fileType={model.modelFileType || undefined}
      position={position}
      scale={scale}
      onLoad={handleLoad}
    />
  );
}

function ScopedPuzzlePieceSystem({
  model,
  modelRef,
  modelReadyTick,
  puzzlePieces,
  initialPuzzleState,
  onScopedPuzzleStateChange,
  ...rest
}: {
  model: Required<BaseArModelConfig>;
  modelRef: React.RefObject<THREE.Group | null>;
  modelReadyTick: number;
  puzzlePieces: number;
  initialPuzzleState?: SerializedPuzzlePiece[];
  onScopedPuzzleStateChange?: (instanceId: string, puzzleState: SerializedPuzzlePiece[]) => void;
  [key: string]: unknown;
}) {
  const prefix = model.instanceId ? `${model.instanceId}:` : '';
  const handlePuzzleStateChange = useCallback((puzzleState: SerializedPuzzlePiece[]) => {
    onScopedPuzzleStateChange?.(model.instanceId || model.id, puzzleState);
  }, [model.id, model.instanceId, onScopedPuzzleStateChange]);

  return (
    <PuzzlePieceSystem
      {...rest}
      modelRef={modelRef}
      modelReadyTick={modelReadyTick}
      puzzlePieces={puzzlePieces}
      puzzleSeed={`${model.modelUrl}:${model.modelFileType || 'obj'}:${puzzlePieces}:${model.instanceId || model.id}`}
      pieceIdPrefix={prefix}
      initialPuzzleState={initialPuzzleState}
      onPuzzleStateChange={handlePuzzleStateChange}
    />
  );
}

function getObjectPath(root: THREE.Object3D, target: THREE.Object3D): number[] | null {
  const path: number[] = [];
  let current: THREE.Object3D | null = target;

  while (current && current !== root) {
    const parent: THREE.Object3D | null = current.parent;
    if (!parent) return null;

    const index = parent.children.indexOf(current);
    if (index < 0) return null;

    path.unshift(index);
    current = parent;
  }

  return current === root ? path : null;
}

function getObjectByPath(root: THREE.Object3D, path: number[]): THREE.Object3D | null {
  let current: THREE.Object3D = root;
  for (const index of path) {
    if (!Number.isInteger(index) || index < 0 || index >= current.children.length) {
      return null;
    }
    current = current.children[index];
  }
  return current;
}

function normalizeSerializedPaintState(
  inputState?: SerializedPaintDecal[]
): SerializedPaintDecal[] {
  if (!Array.isArray(inputState)) return [];

  return inputState
    .filter((item) => item && Array.isArray(item.meshPath))
    .map((item, index) => ({
      id: typeof item.id === 'string' && item.id ? item.id : `stamp-${index}`,
      meshPath: item.meshPath.filter((v) => Number.isInteger(v) && v >= 0),
      point: [
        Number(item.point?.[0]) || 0,
        Number(item.point?.[1]) || 0,
        Number(item.point?.[2]) || 0,
      ],
      normal: [
        Number(item.normal?.[0]) || 0,
        Number(item.normal?.[1]) || 0,
        Number(item.normal?.[2]) || 1,
      ],
      size: Math.max(0.005, Number(item.size) || 0.1),
      color: typeof item.color === 'string' && item.color ? item.color : '#ff4444',
      timestamp: Number(item.timestamp) || Date.now(),
      layer: Math.max(1, Number(item.layer) || index + 1),
      mode: item.mode === 'fill' ? 'fill' : 'decal',
    }));
}

function normalizeSerializedSceneObjectPaintState(
  inputState?: SerializedSceneObjectPaintDecal[]
): SerializedSceneObjectPaintDecal[] {
  if (!Array.isArray(inputState)) return [];

  return inputState
    .filter((item) => item)
    .map((item, index) => ({
      id: typeof item.id === 'string' && item.id ? item.id : `scene-stamp-${index}`,
      point: [
        Number(item.point?.[0]) || 0,
        Number(item.point?.[1]) || 0,
        Number(item.point?.[2]) || 0,
      ] as [number, number, number],
      normal: [
        Number(item.normal?.[0]) || 0,
        Number(item.normal?.[1]) || 0,
        Number(item.normal?.[2]) || 1,
      ] as [number, number, number],
      size: Math.max(0.005, Number(item.size) || 0.1),
      color: typeof item.color === 'string' && item.color ? item.color : '#ff4444',
      timestamp: Number(item.timestamp) || Date.now(),
      layer: Math.max(1, Number(item.layer) || index + 1),
    }));
}

function normalizeSerializedSceneState(inputState?: SerializedSceneObject[]): SerializedSceneObject[] {
  if (!Array.isArray(inputState)) return [];

  return inputState
    .map((item, index) => {
      const objectId = typeof item?.objectId === 'string' ? item.objectId : '';
      if (!getArObjectDefinition(objectId)) return null;

      const id = typeof item.id === 'string' && item.id ? item.id : `scene-object-${index}`;
      const safeScale = THREE.MathUtils.clamp(Number(item.scale) || 0.32, 0.1, 3);
      const safeRotation: [number, number, number] = [
        Number(item.rotation?.[0]) || 0,
        Number(item.rotation?.[1]) || 0,
        Number(item.rotation?.[2]) || 0,
      ];
      const safePosition: [number, number, number] = [
        Number(item.position?.[0]) || 0,
        Number(item.position?.[1]) || 0,
        Number(item.position?.[2]) || 0,
      ];

      return {
        id,
        objectId,
        position: safePosition,
        rotation: safeRotation,
        scale: safeScale,
        color: typeof item.color === 'string' ? item.color : undefined,
        gluedTo: typeof item.gluedTo === 'string' ? item.gluedTo : null,
        groupId: typeof item.groupId === 'string' ? item.groupId : null,
        paint: normalizeSerializedSceneObjectPaintState(item.paint),
      } as SerializedSceneObject;
    })
    .filter(Boolean) as SerializedSceneObject[];
}

function normalizePuzzlePieceCount(value: unknown): number {
  const count = Number(value);
  return count === 3 || count === 4 ? count : 0;
}

function normalizeSerializedPuzzleState(inputState?: SerializedPuzzlePiece[]): SerializedPuzzlePiece[] {
  if (!Array.isArray(inputState)) return [];

  return inputState
    .map((item, index) => {
      const hasSavedPosition = Array.isArray(item?.position);
      const explicitSpawned = item?.spawned;
      const safePosition: [number, number, number] = [
        Number(item?.position?.[0]) || 0,
        Number(item?.position?.[1]) || 0,
        Number(item?.position?.[2]) || 0,
      ];

      return {
        id: typeof item?.id === 'string' && item.id ? item.id : `piece-${index}`,
        position: safePosition,
        locked: item?.locked === true,
        spawned: explicitSpawned === true || item?.locked === true || (explicitSpawned === undefined && hasSavedPosition),
      };
    })
    .filter((item) => /^piece-\d+$/.test(item.id));
}

function clonePuzzleMaterial(material: THREE.Material | THREE.Material[]): THREE.Material {
  const source = Array.isArray(material) ? material[0] : material;
  const cloned = source?.clone ? source.clone() : new THREE.MeshStandardMaterial({ color: '#cc9966' });
  cloned.side = THREE.DoubleSide;
  return cloned;
}

function disposeObjectTree(object: THREE.Object3D) {
  object.traverse((child) => {
    const renderable = child as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    renderable.geometry?.dispose?.();
    if (Array.isArray(renderable.material)) {
      renderable.material.forEach((material) => material.dispose());
    } else {
      renderable.material?.dispose?.();
    }
  });
}

function getModelLocalBounds(modelRoot: THREE.Group): THREE.Box3 {
  const bounds = new THREE.Box3();
  const meshBox = new THREE.Box3();
  const corners = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ];

  modelRoot.updateWorldMatrix(true, true);
  modelRoot.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;
    child.geometry.computeBoundingBox();
    const bbox = child.geometry.boundingBox;
    if (!bbox) return;

    corners[0].set(bbox.min.x, bbox.min.y, bbox.min.z);
    corners[1].set(bbox.min.x, bbox.min.y, bbox.max.z);
    corners[2].set(bbox.min.x, bbox.max.y, bbox.min.z);
    corners[3].set(bbox.min.x, bbox.max.y, bbox.max.z);
    corners[4].set(bbox.max.x, bbox.min.y, bbox.min.z);
    corners[5].set(bbox.max.x, bbox.min.y, bbox.max.z);
    corners[6].set(bbox.max.x, bbox.max.y, bbox.min.z);
    corners[7].set(bbox.max.x, bbox.max.y, bbox.max.z);

    meshBox.makeEmpty();
    corners.forEach((corner) => {
      const localPoint = corner.clone().applyMatrix4(child.matrixWorld);
      modelRoot.worldToLocal(localPoint);
      meshBox.expandByPoint(localPoint);
    });
    bounds.union(meshBox);
  });

  if (bounds.isEmpty()) {
    bounds.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(1, 1, 1));
  }

  return bounds;
}

function createPuzzleCutRanges(bounds: THREE.Box3, count: number): Array<{ minX: number; maxX: number }> {
  const size = bounds.getSize(new THREE.Vector3());
  const width = Math.max(size.x, 0.0001);

  return Array.from({ length: count }, (_, index) => {
    const minX = bounds.min.x + (width * index) / count;
    const maxX = bounds.min.x + (width * (index + 1)) / count;
    return { minX, maxX };
  });
}

function cloneClipVertex(vertex: PuzzleClipVertex): PuzzleClipVertex {
  return {
    position: vertex.position.clone(),
    normal: vertex.normal?.clone(),
    uv: vertex.uv?.clone(),
  };
}

function interpolateClipVertex(a: PuzzleClipVertex, b: PuzzleClipVertex, boundaryX: number): PuzzleClipVertex {
  const deltaX = b.position.x - a.position.x;
  const t = Math.abs(deltaX) < 1e-8
    ? 0
    : THREE.MathUtils.clamp((boundaryX - a.position.x) / deltaX, 0, 1);

  const position = a.position.clone().lerp(b.position, t);
  position.x = boundaryX;

  const normal = a.normal && b.normal
    ? a.normal.clone().lerp(b.normal, t).normalize()
    : undefined;
  const uv = a.uv && b.uv
    ? a.uv.clone().lerp(b.uv, t)
    : undefined;

  return { position, normal, uv };
}

function clipPolygonByX(
  polygon: PuzzleClipVertex[],
  boundaryX: number,
  keepGreaterThanBoundary: boolean
): PuzzleClipVertex[] {
  if (polygon.length === 0) return [];

  const output: PuzzleClipVertex[] = [];
  const isInside = (vertex: PuzzleClipVertex) =>
    keepGreaterThanBoundary
      ? vertex.position.x >= boundaryX - 1e-7
      : vertex.position.x <= boundaryX + 1e-7;

  let previous = polygon[polygon.length - 1];
  let previousInside = isInside(previous);

  polygon.forEach((current) => {
    const currentInside = isInside(current);

    if (currentInside) {
      if (!previousInside) {
        output.push(interpolateClipVertex(previous, current, boundaryX));
      }
      output.push(cloneClipVertex(current));
    } else if (previousInside) {
      output.push(interpolateClipVertex(previous, current, boundaryX));
    }

    previous = current;
    previousInside = currentInside;
  });

  return output;
}

function clipTriangleToXRange(
  triangle: PuzzleClipVertex[],
  minX: number,
  maxX: number
): PuzzleClipVertex[] {
  const clippedMin = clipPolygonByX(triangle, minX, true);
  return clipPolygonByX(clippedMin, maxX, false);
}

function removePuzzleTargetGuides(modelRoot: THREE.Object3D) {
  const guides = modelRoot.children.filter((child) => child.userData?.isPuzzleTargetGuide);
  guides.forEach((guide) => {
    modelRoot.remove(guide);
    disposeObjectTree(guide);
  });
}

function setPuzzleTargetGuidesVisible(modelRoot: THREE.Object3D | null, visible: boolean) {
  modelRoot?.children.forEach((child) => {
    if (child.userData?.isPuzzleTargetGuide) {
      child.visible = visible;
    }
  });
}

function createPuzzleTargetGuides(
  modelRoot: THREE.Object3D,
  pieceGroups: THREE.Object3D[],
  splitKey: string
) {
  removePuzzleTargetGuides(modelRoot);

  const guideRoot = new THREE.Group();
  guideRoot.name = 'Puzzle target trace';
  guideRoot.userData.isPuzzleTargetGuide = true;
  guideRoot.userData.puzzleSplitKey = splitKey;
  guideRoot.renderOrder = 90;

  pieceGroups.forEach((pieceGroup, pieceIndex) => {
    const material = new THREE.LineBasicMaterial({
      color: pieceIndex % 2 === 0 ? 0xffffff : 0xdceeff,
      transparent: true,
      opacity: 0.44,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });

    pieceGroup.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.geometry) return;
      const edgeGeometry = new THREE.EdgesGeometry(child.geometry, 20);
      const trace = new THREE.LineSegments(edgeGeometry, material.clone());
      trace.name = `${pieceGroup.name || 'Puzzle Piece'} target trace`;
      trace.position.copy(child.position);
      trace.quaternion.copy(child.quaternion);
      trace.scale.copy(child.scale);
      trace.renderOrder = 91;
      trace.userData.isPuzzleTargetGuideLine = true;
      trace.raycast = () => null;
      guideRoot.add(trace);
    });

    material.dispose();
  });

  if (guideRoot.children.length > 0) {
    modelRoot.add(guideRoot);
  }
}

function getObjectBoundsInOwnSpace(object: THREE.Object3D): THREE.Box3 {
  const bounds = new THREE.Box3();
  const meshBox = new THREE.Box3();
  const corners = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ];

  object.updateWorldMatrix(true, true);
  const inverseRoot = object.matrixWorld.clone().invert();

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;
    child.geometry.computeBoundingBox();
    const bbox = child.geometry.boundingBox;
    if (!bbox) return;

    corners[0].set(bbox.min.x, bbox.min.y, bbox.min.z);
    corners[1].set(bbox.min.x, bbox.min.y, bbox.max.z);
    corners[2].set(bbox.min.x, bbox.max.y, bbox.min.z);
    corners[3].set(bbox.min.x, bbox.max.y, bbox.max.z);
    corners[4].set(bbox.max.x, bbox.min.y, bbox.min.z);
    corners[5].set(bbox.max.x, bbox.min.y, bbox.max.z);
    corners[6].set(bbox.max.x, bbox.max.y, bbox.min.z);
    corners[7].set(bbox.max.x, bbox.max.y, bbox.max.z);

    meshBox.makeEmpty();
    corners.forEach((corner) => {
      meshBox.expandByPoint(corner.clone().applyMatrix4(child.matrixWorld).applyMatrix4(inverseRoot));
    });
    bounds.union(meshBox);
  });

  if (bounds.isEmpty()) {
    bounds.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(0.25, 0.25, 0.25));
  }

  return bounds;
}

function createPuzzleSideStackPosition(
  targetBounds: THREE.Box3,
  pieceGroup: THREE.Object3D,
  index: number,
  count: number
): THREE.Vector3 {
  const targetSize = targetBounds.getSize(new THREE.Vector3());
  const targetCenter = targetBounds.getCenter(new THREE.Vector3());
  const pieceBounds = getObjectBoundsInOwnSpace(pieceGroup);
  const pieceCenter = pieceBounds.getCenter(new THREE.Vector3());
  const maxDim = Math.max(targetSize.x, targetSize.y, targetSize.z, 1);
  const pieceSize = pieceBounds.getSize(new THREE.Vector3());
  const safeCount = Math.max(1, count);
  const slot = index - (safeCount - 1) / 2;
  const spacing = THREE.MathUtils.clamp(
    Math.max(targetSize.y, pieceSize.y, maxDim * 0.8) / safeCount,
    maxDim * 0.22,
    maxDim * 0.42
  );
  const gap = THREE.MathUtils.clamp(maxDim * 0.18, 0.16, 0.42);

  // Spawn generated pieces in a vertical dock beside the trace so they are visible
  // but not already sitting in their solution outline.
  const position = new THREE.Vector3(
    targetBounds.max.x + gap - pieceBounds.min.x,
    targetCenter.y + slot * spacing - pieceCenter.y,
    (index % 2 === 0 ? -1 : 1) * maxDim * 0.025
  );

  const minAfterMoveX = pieceBounds.min.x + position.x;
  if (minAfterMoveX < targetBounds.max.x + gap * 0.75) {
    position.x += targetBounds.max.x + gap * 0.75 - minAfterMoveX;
  }

  const verticalBounds = targetBounds.clone().expandByScalar(maxDim * 0.35);
  const minAfterMoveY = pieceBounds.min.y + position.y;
  const maxAfterMoveY = pieceBounds.max.y + position.y;
  if (minAfterMoveY < verticalBounds.min.y) {
    position.y += verticalBounds.min.y - minAfterMoveY;
  }
  if (maxAfterMoveY > verticalBounds.max.y) {
    position.y -= maxAfterMoveY - verticalBounds.max.y;
  }

  position.z = THREE.MathUtils.clamp(position.z, -maxDim * 0.1, maxDim * 0.1);
  return position;
}

function getPuzzleTargetBoundsFromPieces(pieceGroups: THREE.Object3D[]): THREE.Box3 {
  const bounds = new THREE.Box3();
  pieceGroups.forEach((pieceGroup) => {
    bounds.union(getObjectBoundsInOwnSpace(pieceGroup));
  });

  if (bounds.isEmpty()) {
    bounds.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(1, 1, 1));
  }

  return bounds;
}

function ensurePuzzlePieceOutline(pieceGroup: THREE.Object3D, pieceIndex: number) {
  const existingOutlines = pieceGroup.children.filter((child) => child.userData?.isPuzzlePieceOutlineRoot);
  existingOutlines.forEach((outline) => {
    pieceGroup.remove(outline);
    disposeObjectTree(outline);
  });

  const meshes: THREE.Mesh[] = [];
  pieceGroup.traverse((child) => {
    if (child instanceof THREE.Mesh && !child.userData?.isPaintDecal) {
      meshes.push(child);
    }
  });

  if (meshes.length === 0) return;

  const outlineRoot = new THREE.Group();
  outlineRoot.name = `${pieceGroup.name || 'Puzzle Piece'} visible outline`;
  outlineRoot.userData.isPuzzlePieceOutlineRoot = true;
  outlineRoot.raycast = () => null;

  const outlineColor = PUZZLE_PIECE_OUTLINE_COLORS[pieceIndex % PUZZLE_PIECE_OUTLINE_COLORS.length];
  meshes.forEach((mesh) => {
    const edgeGeometry = new THREE.EdgesGeometry(mesh.geometry, 18);
    const outline = new THREE.LineSegments(
      edgeGeometry,
      new THREE.LineBasicMaterial({
        color: outlineColor,
        transparent: true,
        opacity: 0.88,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      })
    );
    outline.name = `${mesh.name || 'mesh'} visible puzzle outline`;
    outline.position.copy(mesh.position);
    outline.quaternion.copy(mesh.quaternion);
    outline.scale.copy(mesh.scale);
    outline.renderOrder = 140 + pieceIndex;
    outline.userData.isPuzzlePieceOutlineLine = true;
    outline.raycast = () => null;
    outlineRoot.add(outline);
  });

  pieceGroup.add(outlineRoot);
}

function ensurePuzzlePieceOutlines(pieceGroups: THREE.Object3D[]) {
  pieceGroups.forEach((pieceGroup, index) => ensurePuzzlePieceOutline(pieceGroup, index));
}

function findPuzzleAncestor(object: THREE.Object3D | null): THREE.Object3D | null {
  let current = object;
  while (current && !current.userData.puzzlePieceId) {
    current = current.parent;
  }
  return current;
}

function findPuzzlePieceRoot(
  object: THREE.Object3D | null,
  modelRoot: THREE.Object3D
): THREE.Object3D | null {
  let current = object;
  let pieceRoot: THREE.Object3D | null = null;

  while (current && current !== modelRoot) {
    if (current.userData?.isPuzzlePiece && current.userData?.puzzlePieceId) {
      pieceRoot = current;
    }
    current = current.parent;
  }

  return pieceRoot;
}

function isDescendantOf(object: THREE.Object3D | null, ancestor: THREE.Object3D): boolean {
  let current = object;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function sameObjectPath(a: number[] = [], b: number[] = []): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function splitModelIntoPuzzlePieces(
  modelRoot: THREE.Group,
  count: number,
  seedText: string,
  initialState: SerializedPuzzlePiece[] = [],
  preserveUnlockedInitialState = false
) {
  const normalizedCount = normalizePuzzlePieceCount(count);
  if (!normalizedCount) return [];

  const splitKey = `${PUZZLE_LAYOUT_VERSION}:${normalizedCount}:${seedText}`;
  const stateById = new Map(normalizeSerializedPuzzleState(initialState).map((entry) => [entry.id, entry]));
  const existingPieces = modelRoot.children.filter((child) => child.userData.isPuzzlePiece);

  if (modelRoot.userData.puzzleSplitKey === splitKey && existingPieces.length === normalizedCount) {
    ensurePuzzlePieceOutlines(existingPieces);
    if (!modelRoot.children.some((child) => child.userData?.isPuzzleTargetGuide)) {
      createPuzzleTargetGuides(modelRoot, existingPieces, splitKey);
    }
    const targetBounds = getPuzzleTargetBoundsFromPieces(existingPieces);
    return existingPieces.map((group, index) => {
      const id = group.userData.puzzlePieceId || `piece-${index}`;
      const saved = stateById.get(id);
      const savedSpawned = saved?.locked === true || saved?.spawned === true;
      const keepCurrentSpawned = !saved && group.userData.puzzleSpawned === true;

      if (saved && savedSpawned) {
        group.position.set(...saved.position);
        group.userData.puzzleLocked = saved.locked;
      } else if (group.userData.puzzleLocked !== true && !keepCurrentSpawned) {
        group.position.copy(createPuzzleSideStackPosition(targetBounds, group, index, normalizedCount));
        group.userData.puzzleLocked = false;
      }

      const locked = group.userData.puzzleLocked === true;
      const spawned = locked || savedSpawned || keepCurrentSpawned;
      group.userData.puzzleSpawned = spawned;
      group.visible = spawned;

      return {
        id,
        group,
        targetPosition: new THREE.Vector3(0, 0, 0),
        locked,
        spawned,
      };
    });
  }

  const originalChildren = [...modelRoot.children];
  const originalMeshes: THREE.Mesh[] = [];
  modelRoot.traverse((child) => {
    if (child instanceof THREE.Mesh && !child.userData.isPuzzlePiece) {
      originalMeshes.push(child);
    }
  });

  if (originalMeshes.length === 0) return [];

  const bounds = getModelLocalBounds(modelRoot);
  const cutRanges = createPuzzleCutRanges(bounds, normalizedCount);
  const cutEpsilon = Math.max(bounds.getSize(new THREE.Vector3()).x, 0.0001) * 1e-5;
  const rootNormalMatrix = new THREE.Matrix3().getNormalMatrix(modelRoot.matrixWorld).invert();
  const pieceGroups = Array.from({ length: normalizedCount }, (_, index) => {
    const id = `piece-${index}`;
    const group = new THREE.Group();
    const saved = stateById.get(id);
    const savedSpawned = saved?.locked === true || saved?.spawned === true;
    group.name = `Puzzle Piece ${index + 1}`;
    group.userData.isPuzzlePiece = true;
    group.userData.puzzlePieceId = id;
    group.userData.puzzleTarget = [0, 0, 0];
    group.userData.puzzleLocked = saved?.locked === true;
    group.userData.puzzleSpawned = savedSpawned;
    if (saved && savedSpawned) {
      group.position.set(...saved.position);
    }
    return group;
  });

  originalMeshes.forEach((mesh) => {
    const sourceGeometry = mesh.geometry;
    if (!sourceGeometry?.attributes?.position) return;

    mesh.updateWorldMatrix(true, false);
    const geometry = sourceGeometry.index ? sourceGeometry.toNonIndexed() : sourceGeometry.clone();
    const positionAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const normalAttr = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
    const uvAttr = geometry.getAttribute('uv') as THREE.BufferAttribute | undefined;
    const meshNormalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const pieceData = Array.from({ length: normalizedCount }, () => ({
      positions: [] as number[],
      normals: [] as number[],
      uvs: [] as number[],
    }));
    const vertices = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const normals = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const uvs = [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()];

    for (let i = 0; i < positionAttr.count; i += 3) {
      for (let corner = 0; corner < 3; corner += 1) {
        const attrIndex = i + corner;
        vertices[corner].fromBufferAttribute(positionAttr, attrIndex);
        const rootLocalVertex = vertices[corner].clone().applyMatrix4(mesh.matrixWorld);
        modelRoot.worldToLocal(rootLocalVertex);
        vertices[corner].copy(rootLocalVertex);

        if (normalAttr) {
          normals[corner].fromBufferAttribute(normalAttr, attrIndex);
          normals[corner].applyMatrix3(meshNormalMatrix).applyMatrix3(rootNormalMatrix).normalize();
        }
        if (uvAttr) {
          uvs[corner].set(uvAttr.getX(attrIndex), uvAttr.getY(attrIndex));
        }
      }

      const triangle: PuzzleClipVertex[] = vertices.map((position, corner) => ({
        position: position.clone(),
        normal: normalAttr ? normals[corner].clone() : undefined,
        uv: uvAttr ? uvs[corner].clone() : undefined,
      }));

      cutRanges.forEach((range, pieceIndex) => {
        const clipped = clipTriangleToXRange(
          triangle,
          pieceIndex === 0 ? range.minX - cutEpsilon : range.minX,
          pieceIndex === cutRanges.length - 1 ? range.maxX + cutEpsilon : range.maxX
        );
        if (clipped.length < 3) return;

        const data = pieceData[pieceIndex];
        for (let polyIndex = 1; polyIndex < clipped.length - 1; polyIndex += 1) {
          [clipped[0], clipped[polyIndex], clipped[polyIndex + 1]].forEach((vertex) => {
            data.positions.push(vertex.position.x, vertex.position.y, vertex.position.z);
            if (vertex.normal) {
              data.normals.push(vertex.normal.x, vertex.normal.y, vertex.normal.z);
            }
            if (vertex.uv) {
              data.uvs.push(vertex.uv.x, vertex.uv.y);
            }
          });
        }
      });
    }

    geometry.dispose();

    pieceData.forEach((data, pieceIndex) => {
      if (data.positions.length === 0) return;
      const pieceGeometry = new THREE.BufferGeometry();
      pieceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
      if (data.normals.length > 0) {
        pieceGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
      } else {
        pieceGeometry.computeVertexNormals();
      }
      if (data.uvs.length > 0) {
        pieceGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
      }
      pieceGeometry.computeBoundingBox();
      pieceGeometry.computeBoundingSphere();

      const pieceMesh = new THREE.Mesh(pieceGeometry, clonePuzzleMaterial(mesh.material));
      pieceMesh.name = `${mesh.name || 'mesh'} puzzle ${pieceIndex + 1}`;
      pieceMesh.castShadow = false;
      pieceMesh.receiveShadow = false;
      pieceMesh.userData.isPuzzlePiece = true;
      pieceMesh.userData.puzzlePieceId = `piece-${pieceIndex}`;
      pieceGroups[pieceIndex].add(pieceMesh);
    });
  });

  originalChildren.forEach((child) => {
    modelRoot.remove(child);
    disposeObjectTree(child);
  });

  pieceGroups.forEach((group) => {
    if (group.children.length > 0) {
      modelRoot.add(group);
    }
  });

  const availablePieces = pieceGroups.filter((group) => group.parent === modelRoot);
  ensurePuzzlePieceOutlines(availablePieces);
  const targetBounds = getPuzzleTargetBoundsFromPieces(availablePieces);
  availablePieces.forEach((group, index) => {
    const saved = stateById.get(group.userData.puzzlePieceId || `piece-${index}`);
    const savedSpawned = saved?.locked === true || saved?.spawned === true;
    if (saved && savedSpawned) {
      group.visible = true;
      return;
    }
    group.position.copy(createPuzzleSideStackPosition(targetBounds, group, index, availablePieces.length));
    group.userData.puzzleLocked = false;
    group.userData.puzzleSpawned = false;
    group.visible = false;
  });

  modelRoot.userData.puzzleSplitKey = splitKey;
  modelRoot.userData.puzzlePiecesCount = normalizedCount;
  modelRoot.updateWorldMatrix(true, true);

  createPuzzleTargetGuides(
    modelRoot,
    availablePieces,
    splitKey
  );

  return availablePieces
    .map((group, index) => ({
      id: group.userData.puzzlePieceId || `piece-${index}`,
      group,
      targetPosition: new THREE.Vector3(0, 0, 0),
      locked: group.userData.puzzleLocked === true,
      spawned: group.userData.puzzleSpawned === true || group.userData.puzzleLocked === true,
    }));
}

function getSceneObjectBaseMesh(object: THREE.Object3D): THREE.Mesh | null {
  let target: THREE.Mesh | null = null;
  object.traverse((child) => {
    if (target) return;
    if (child instanceof THREE.Mesh && child.userData.isSceneObjectPaintDecal !== true) {
      target = child;
    }
  });
  return target;
}

function attachSceneObjectDecal(
  sceneObject: THREE.Object3D,
  targetMesh: THREE.Mesh,
  decal: THREE.Mesh,
  layer: number,
  stampId?: string
) {
  decal.userData.isSceneObjectPaintDecal = true;
  decal.userData.sceneObjectId = sceneObject.userData.sceneObjectId;
  decal.userData.sceneObjectPaintDecalId = stampId;
  applyDecalLayer(decal, layer);

  const decalParent = targetMesh.parent || sceneObject;
  decalParent.updateWorldMatrix(true, false);
  const inverseParent = decalParent.matrixWorld.clone().invert();
  decal.geometry.applyMatrix4(inverseParent);
  decal.position.set(0, 0, 0);
  decal.rotation.set(0, 0, 0);
  decal.updateMatrix();
  decal.matrixAutoUpdate = false;
  decalParent.add(decal);
}

function disposePaintDecalMesh(object: THREE.Object3D) {
  const renderable = object as THREE.Object3D & {
    geometry?: THREE.BufferGeometry;
    material?: THREE.Material | THREE.Material[];
  };
  object.parent?.remove(object);
  renderable.geometry?.dispose?.();
  if (Array.isArray(renderable.material)) {
    renderable.material.forEach((material) => material.dispose());
  } else {
    renderable.material?.dispose?.();
  }
}

function clearSceneObjectPaintDecals(sceneObject: THREE.Object3D) {
  const decals: THREE.Object3D[] = [];
  sceneObject.traverse((child) => {
    if (child.userData?.isSceneObjectPaintDecal) {
      decals.push(child);
    }
  });
  decals.forEach(disposePaintDecalMesh);
}

function buildSceneObjectMesh(serialized: SerializedSceneObject): THREE.Object3D | null {
  const definition = getArObjectDefinition(serialized.objectId);
  if (!definition || definition.kind !== 'primitive') return null;

  const geometry = PRIMITIVE_GEOMETRIES[definition.primitive] || PRIMITIVE_GEOMETRIES.box;
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(serialized.color || definition.color || '#ffffff'),
    roughness: 0.62,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.sharedGeometry = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  const group = new THREE.Group();
  group.userData.sceneObjectId = serialized.id;
  group.userData.objectId = serialized.objectId;
  group.add(mesh);
  group.position.set(...serialized.position);
  group.rotation.set(...serialized.rotation);
  group.scale.setScalar(serialized.scale || definition.defaultScale || 0.32);
  group.updateWorldMatrix(true, true);

  normalizeSerializedSceneObjectPaintState(serialized.paint).forEach((stamp, index) => {
    const worldPoint = mesh.localToWorld(new THREE.Vector3(...stamp.point));
    const worldNormal = new THREE.Vector3(...stamp.normal)
      .normalize()
      .applyMatrix3(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld))
      .normalize();
    const decal = createPaintDecal(
      mesh,
      worldPoint,
      worldNormal,
      stamp.size,
      new THREE.Color(stamp.color),
      false
    );
    if (!decal) return;
    attachSceneObjectDecal(group, mesh, decal, stamp.layer || index + 1, stamp.id);
  });

  return group;
}

function findSceneObjectAncestor(object: THREE.Object3D | null): THREE.Object3D | null {
  let current = object;
  while (current && !current.userData.sceneObjectId) {
    current = current.parent;
  }
  return current;
}

function applySceneObjectColor(object: THREE.Object3D, color: THREE.Color): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      const colorMaterial = material as THREE.Material & { color?: THREE.Color };
      if (colorMaterial.color instanceof THREE.Color) {
        colorMaterial.color.copy(color);
        colorMaterial.needsUpdate = true;
      }
    });
  });
}

function pickSceneObjectNearPointer(
  objects: Map<string, THREE.Object3D>,
  pointerX: number,
  pointerY: number,
  camera: THREE.Camera,
  viewport: { width: number; height: number },
  thresholdPx: number
): string | null {
  if (objects.size === 0) return null;
  if (viewport.width <= 0 || viewport.height <= 0) return null;

  const pointerPxX = pointerX * viewport.width;
  const pointerPxY = pointerY * viewport.height;
  const projected = new THREE.Vector3();
  const bounds = new THREE.Box3();
  const center = new THREE.Vector3();
  const corners = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ];

  let nearestId: string | null = null;
  let nearestDistance = Infinity;

  objects.forEach((object, objectId) => {
    object.updateWorldMatrix(true, true);
    bounds.setFromObject(object);

    let distancePx = Infinity;

    if (!bounds.isEmpty()) {
      corners[0].set(bounds.min.x, bounds.min.y, bounds.min.z);
      corners[1].set(bounds.min.x, bounds.min.y, bounds.max.z);
      corners[2].set(bounds.min.x, bounds.max.y, bounds.min.z);
      corners[3].set(bounds.min.x, bounds.max.y, bounds.max.z);
      corners[4].set(bounds.max.x, bounds.min.y, bounds.min.z);
      corners[5].set(bounds.max.x, bounds.min.y, bounds.max.z);
      corners[6].set(bounds.max.x, bounds.max.y, bounds.min.z);
      corners[7].set(bounds.max.x, bounds.max.y, bounds.max.z);

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let visibleCorners = 0;

      corners.forEach((corner) => {
        projected.copy(corner).project(camera);
        if (projected.z < -1 || projected.z > 1) return;
        visibleCorners += 1;
        const screenX = (projected.x * 0.5 + 0.5) * viewport.width;
        const screenY = (-projected.y * 0.5 + 0.5) * viewport.height;
        minX = Math.min(minX, screenX);
        maxX = Math.max(maxX, screenX);
        minY = Math.min(minY, screenY);
        maxY = Math.max(maxY, screenY);
      });

      if (visibleCorners > 0) {
        const clampedX = THREE.MathUtils.clamp(pointerPxX, minX, maxX);
        const clampedY = THREE.MathUtils.clamp(pointerPxY, minY, maxY);
        distancePx = Math.hypot(clampedX - pointerPxX, clampedY - pointerPxY);
      }
    }

    if (!Number.isFinite(distancePx)) {
      object.getWorldPosition(center);
      projected.copy(center).project(camera);
      if (projected.z < -1 || projected.z > 1) return;
      const screenX = (projected.x * 0.5 + 0.5) * viewport.width;
      const screenY = (-projected.y * 0.5 + 0.5) * viewport.height;
      distancePx = Math.hypot(screenX - pointerPxX, screenY - pointerPxY);
    }

    if (distancePx < nearestDistance) {
      nearestDistance = distancePx;
      nearestId = objectId;
    }
  });

  return nearestDistance <= thresholdPx ? nearestId : null;
}

function applyDecalLayer(decal: THREE.Mesh, layer: number) {
  const safeLayer = Math.max(1, Math.floor(layer));
  decal.renderOrder = 200 + safeLayer;

  const applyMaterial = (material: THREE.Material) => {
    if (!(material instanceof THREE.MeshStandardMaterial)) return;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -4 - safeLayer * 0.02;
    material.polygonOffsetUnits = -1 - safeLayer * 0.01;
    material.needsUpdate = true;
  };

  if (Array.isArray(decal.material)) {
    decal.material.forEach((material) => applyMaterial(material));
  } else {
    applyMaterial(decal.material);
  }
}

// Lighting setup component
function Lighting() {
  return (
    <>
      <ambientLight intensity={0.62} />
      <hemisphereLight args={[0xffffff, 0x444444, 0.78]} position={[0, 20, 0]} />
      <directionalLight position={[5, 10, 7]} intensity={0.95} />
      <pointLight position={[-5, 5, 5]} intensity={0.45} />
    </>
  );
}

// MediaPipe hand connections for skeleton
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // Index
  [0, 9], [9, 10], [10, 11], [11, 12],  // Middle
  [0, 13], [13, 14], [14, 15], [15, 16], // Ring
  [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
  [5, 9], [9, 13], [13, 17],            // Palm
];

// Hand skeleton visualization
function HandSkeleton({
  landmarks,
  isGrabbing,
  mirrorX = true,
}: {
  landmarks: HandLandmarks | null;
  isGrabbing: boolean;
  mirrorX?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const jointMeshes = useRef<THREE.Mesh[]>([]);
  const boneMeshes = useRef<THREE.Mesh[]>([]);
  const smoothedPositions = useRef<THREE.Vector3[]>(
    Array(21).fill(null).map(() => new THREE.Vector3())
  );
  const velocities = useRef<THREE.Vector3[]>(
    Array(21).fill(null).map(() => new THREE.Vector3())
  );

  useFrame(({ camera, size }) => {
    if (!landmarks || !groupRef.current) return;

    const allLandmarks = landmarks.allLandmarks;
    const distance = 3;
    const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
    const height = 2 * Math.tan(fov / 2) * distance;
    const width = height * (size.width / size.height);

    allLandmarks.forEach((lm, i) => {
      // Mirror X only for front-facing camera to match CSS-mirrored video
      // Back camera video is not mirrored, so use raw lm.x directly
      const ndcX = (mirrorX ? 1 - lm.x : lm.x) * 2 - 1;
      const ndcY = -(lm.y * 2 - 1);
      
      const targetPos = new THREE.Vector3(
        ndcX * width / 2,
        ndcY * height / 2,
        -distance + (lm.z || 0) * -2
      );
      
      const current = smoothedPositions.current[i];
      const velocity = velocities.current[i];
      
      const diff = targetPos.clone().sub(current);
      velocity.add(diff.multiplyScalar(0.3));
      velocity.multiplyScalar(0.7);
      current.add(velocity);
      
      if (jointMeshes.current[i]) {
        jointMeshes.current[i].position.copy(current);
      }
    });

    HAND_CONNECTIONS.forEach(([startIdx, endIdx], i) => {
      const start = smoothedPositions.current[startIdx];
      const end = smoothedPositions.current[endIdx];
      
      if (boneMeshes.current[i]) {
        const bone = boneMeshes.current[i];
        const midpoint = start.clone().add(end).multiplyScalar(0.5);
        bone.position.copy(midpoint);
        
        const direction = end.clone().sub(start);
        const length = direction.length();
        bone.scale.set(0.008, length, 0.008);
        bone.lookAt(end);
        bone.rotateX(Math.PI / 2);
      }
    });
  });

  if (!landmarks) return null;

  const jointColor = isGrabbing ? '#ff8844' : '#44ff44';
  const boneColor = isGrabbing ? '#cc6622' : '#22aa22';

  return (
    <group ref={groupRef} renderOrder={10}>
      {landmarks.allLandmarks.map((_, i) => (
        <mesh
          key={`joint-${i}`}
          ref={(mesh) => { if (mesh) jointMeshes.current[i] = mesh; }}
          renderOrder={11}
        >
          <sphereGeometry args={[0.025, 12, 12]} />
          <meshBasicMaterial
            color={jointColor}
            transparent
            opacity={0.9}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
      ))}
      
      {HAND_CONNECTIONS.map((_, i) => (
        <mesh
          key={`bone-${i}`}
          ref={(mesh) => { if (mesh) boneMeshes.current[i] = mesh; }}
          renderOrder={10}
        >
          <cylinderGeometry args={[1, 1, 1, 8]} />
          <meshBasicMaterial
            color={boneColor}
            transparent
            opacity={0.7}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

// Palm center indicator
function PalmCenterIndicator({ palmCenter }: { palmCenter: PalmPosition | null }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ camera, size }) => {
    if (!palmCenter || !meshRef.current) return;

    const distance = 3;
    const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
    const height = 2 * Math.tan(fov / 2) * distance;
    const width = height * (size.width / size.height);

    const ndcX = palmCenter.x * 2 - 1;
    const ndcY = -(palmCenter.y * 2 - 1);

    meshRef.current.position.set(
      ndcX * width / 2,
      ndcY * height / 2,
      -distance + palmCenter.z * -2
    );
  });

  if (!palmCenter) return null;

  return (
    <mesh ref={meshRef} renderOrder={12}>
      <sphereGeometry args={[0.05, 16, 16]} />
      <meshBasicMaterial
        color="#ffff00"
        transparent
        opacity={0.8}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

// Model rotation controller using quaternion-based rotation
function ModelRotationController({
  anchorRef,
  targetQuaternion,
  isGrabbing,
  onTransformChange,
}: {
  anchorRef: React.RefObject<THREE.Group | null>;
  targetQuaternion: THREE.Quaternion;
  isGrabbing: boolean;
  onTransformChange?: () => void;
}) {
  const currentQuatRef = useRef<THREE.Quaternion>(new THREE.Quaternion());
  const wasGrabbingRef = useRef(false);
  const initializedRef = useRef(false);

  useFrame(() => {
    if (!anchorRef.current) return;

    const anchor = anchorRef.current;

    // Initialize currentQuat from anchor on first frame
    if (!initializedRef.current) {
      currentQuatRef.current.copy(anchor.quaternion);
      initializedRef.current = true;
    }

    if (isGrabbing) {
      // Slerp toward target quaternion for smooth rotation
      currentQuatRef.current.slerp(targetQuaternion, CONFIG.slerpFactor);
      anchor.quaternion.copy(currentQuatRef.current);
      wasGrabbingRef.current = true;
      onTransformChange?.();
    } else if (wasGrabbingRef.current) {
      // Just released - keep current rotation
      currentQuatRef.current.copy(anchor.quaternion);
      wasGrabbingRef.current = false;
      onTransformChange?.();
    }
    // When not grabbing and wasn't just released, keep current rotation
  });

  return null;
}

// Move model while pinching (screen-space palm tracking)
function PinchMoveController({
  anchorRef,
  palmCenter,
  isPinching,
  disabled = false,
  onTransformChange,
}: {
  anchorRef: React.RefObject<THREE.Group | null>;
  palmCenter: PalmPosition | null;
  isPinching: boolean;
  disabled?: boolean;
  onTransformChange?: () => void;
}) {
  const { camera, size } = useThree();
  const smoothedPos = useRef<THREE.Vector3>(new THREE.Vector3());
  const initializedRef = useRef(false);
  const startPalmRef = useRef<PalmPosition | null>(null);
  const startAnchorRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const pinchActiveRef = useRef(false);

  useFrame(() => {
    if (disabled) {
      pinchActiveRef.current = false;
      return;
    }

    if (!anchorRef.current || !palmCenter || !isPinching) {
      pinchActiveRef.current = false;
      return;
    }

    const anchor = anchorRef.current;
    if (!pinchActiveRef.current) {
      startPalmRef.current = { ...palmCenter };
      startAnchorRef.current.copy(anchor.position);
      smoothedPos.current.copy(anchor.position);
      pinchActiveRef.current = true;
    }

    const startPalm = startPalmRef.current;
    if (!startPalm) return;

    const distance = Math.max(0.1, Math.abs(startAnchorRef.current.z) || 3);
    const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
    const height = 2 * Math.tan(fov / 2) * distance;
    const width = height * (size.width / size.height);

    const deltaX = (palmCenter.x - startPalm.x) * width;
    const deltaY = -(palmCenter.y - startPalm.y) * height;

    const targetPos = new THREE.Vector3(
      startAnchorRef.current.x + deltaX,
      startAnchorRef.current.y + deltaY,
      startAnchorRef.current.z
    );

    if (!initializedRef.current) {
      smoothedPos.current.copy(anchor.position);
      initializedRef.current = true;
    }

    smoothedPos.current.lerp(targetPos, 0.25);
    anchor.position.copy(smoothedPos.current);
    onTransformChange?.();
  });

  return null;
}

function MultiModelMoveController({
  modelIds,
  modelRefsByIdRef,
  selectedModelId,
  handLandmarks,
  isPinching,
  palmCenter,
  isGrabbing,
  isZooming,
  zoomDelta,
  disabled = false,
  onModelMoveActiveChange,
  onModelTransformChange,
}: {
  modelIds: string[];
  modelRefsByIdRef: React.MutableRefObject<Map<string, React.RefObject<THREE.Group | null>>>;
  selectedModelId?: string | null;
  handLandmarks: HandLandmarks | null;
  isPinching: boolean;
  palmCenter: PalmPosition | null;
  isGrabbing: boolean;
  isZooming: boolean;
  zoomDelta: number;
  disabled?: boolean;
  onModelMoveActiveChange?: (active: boolean) => void;
  onModelTransformChange?: () => void;
}) {
  const { camera, size } = useThree();
  const activeModelIdRef = useRef<string | null>(null);
  const pinchMoveActiveRef = useRef(false);
  const pinchStartPalmRef = useRef<PalmPosition | null>(null);
  const pinchStartWorldRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const lastMoveActiveRef = useRef(false);
  const zoomActiveRef = useRef(false);
  const zoomStartScaleRef = useRef<THREE.Vector3>(new THREE.Vector3(1, 1, 1));
  const rotationActiveRef = useRef(false);
  const rotationStartPalmRef = useRef<PalmPosition | null>(null);
  const rotationStartQuatRef = useRef<THREE.Quaternion>(new THREE.Quaternion());
  const lastTransformEmitRef = useRef(0);

  const setMoveActive = useCallback((active: boolean) => {
    if (lastMoveActiveRef.current === active) return;
    lastMoveActiveRef.current = active;
    onModelMoveActiveChange?.(active);
  }, [onModelMoveActiveChange]);

  const resetMove = useCallback(() => {
    if (pinchMoveActiveRef.current && onModelTransformChange) {
      lastTransformEmitRef.current = performance.now();
      onModelTransformChange();
    }
    pinchMoveActiveRef.current = false;
    activeModelIdRef.current = null;
    pinchStartPalmRef.current = null;
    setMoveActive(false);
  }, [onModelTransformChange, setMoveActive]);

  const getSelectableModels = useCallback(() => {
    const selectable = new Map<string, THREE.Object3D>();
    modelIds.forEach((modelId) => {
      const model = modelRefsByIdRef.current.get(modelId)?.current;
      if (model) {
        selectable.set(modelId, model);
      }
    });
    return selectable;
  }, [modelIds, modelRefsByIdRef]);

  const emitTransformChange = useCallback((force = false) => {
    if (!onModelTransformChange) return;
    const now = performance.now();
    if (!force && now - lastTransformEmitRef.current < 80) return;
    lastTransformEmitRef.current = now;
    onModelTransformChange();
  }, [onModelTransformChange]);

  useEffect(() => {
    resetMove();
    zoomActiveRef.current = false;
  }, [resetMove, selectedModelId]);

  useEffect(() => () => setMoveActive(false), [setMoveActive]);

  useFrame(() => {
    if (disabled || !selectedModelId) {
      resetMove();
      zoomActiveRef.current = false;
      rotationActiveRef.current = false;
      rotationStartPalmRef.current = null;
      return;
    }

    const selectableModels = getSelectableModels();
    const selectedModel = selectableModels.get(selectedModelId);
    if (!selectedModel) {
      resetMove();
      zoomActiveRef.current = false;
      rotationActiveRef.current = false;
      rotationStartPalmRef.current = null;
      return;
    }

    if (isGrabbing && palmCenter && !isZooming) {
      if (!rotationActiveRef.current) {
        rotationStartPalmRef.current = { ...palmCenter };
        rotationStartQuatRef.current.copy(selectedModel.quaternion);
        rotationActiveRef.current = true;
      }

      const startPalm = rotationStartPalmRef.current;
      if (startPalm) {
        const rawDx = palmCenter.x - startPalm.x;
        const rawDy = palmCenter.y - startPalm.y;
        const dx = Math.abs(rawDx) < CONFIG.deadzone ? 0 : rawDx;
        const dy = Math.abs(rawDy) < CONFIG.deadzone ? 0 : rawDy;
        const yawAngle = -dx * CONFIG.yawSensitivity;
        const pitchAngle = THREE.MathUtils.clamp(
          -dy * CONFIG.pitchSensitivity,
          -CONFIG.pitchClamp,
          CONFIG.pitchClamp
        );
        const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawAngle);
        const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitchAngle);
        const targetQuat = qYaw.multiply(qPitch).multiply(rotationStartQuatRef.current);
        selectedModel.quaternion.slerp(targetQuat, CONFIG.slerpFactor);
        emitTransformChange();
      }
    } else {
      if (rotationActiveRef.current) {
        emitTransformChange(true);
      }
      rotationActiveRef.current = false;
      rotationStartPalmRef.current = null;
    }

    if (isZooming) {
      if (!zoomActiveRef.current) {
        zoomStartScaleRef.current.copy(selectedModel.scale);
        zoomActiveRef.current = true;
      }
      const scaleMultiplier = THREE.MathUtils.clamp(1 + zoomDelta * 0.28, 0.35, 2.2);
      const targetScale = zoomStartScaleRef.current.clone().multiplyScalar(scaleMultiplier);
      selectedModel.scale.lerp(targetScale, 0.25);
      emitTransformChange();
    } else {
      if (zoomActiveRef.current) {
        emitTransformChange(true);
      }
      zoomActiveRef.current = false;
    }

    if (!isPinching || !palmCenter || !handLandmarks) {
      resetMove();
      return;
    }

    if (!pinchMoveActiveRef.current) {
      activeModelIdRef.current = selectedModelId;
      pinchMoveActiveRef.current = true;
      pinchStartPalmRef.current = { ...palmCenter };
      selectedModel.getWorldPosition(pinchStartWorldRef.current);
      setMoveActive(true);
      return;
    }

    const selectedId = activeModelIdRef.current;
    const activeSelectedModel = selectedId === selectedModelId ? selectedModel : null;
    const startPalm = pinchStartPalmRef.current;

    if (!activeSelectedModel || !startPalm) {
      resetMove();
      return;
    }

    const distance = Math.max(0.2, camera.position.distanceTo(pinchStartWorldRef.current));
    const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
    const worldHeight = 2 * Math.tan(fov / 2) * distance;
    const worldWidth = worldHeight * (size.width / size.height);
    const deltaX = (palmCenter.x - startPalm.x) * worldWidth;
    const deltaY = -(palmCenter.y - startPalm.y) * worldHeight;
    const targetWorld = pinchStartWorldRef.current.clone().add(new THREE.Vector3(deltaX, deltaY, 0));
    const parent = activeSelectedModel.parent;

    if (!parent) return;

    activeSelectedModel.position.lerp(parent.worldToLocal(targetWorld), 0.35);
    emitTransformChange();
  });

  return null;
}

// Zoom model along Z while two-fist zoom is active
function ZoomController({
  anchorRef,
  isZooming,
  zoomDelta,
  disabled = false,
  onTransformChange,
}: {
  anchorRef: React.RefObject<THREE.Group | null>;
  isZooming: boolean;
  zoomDelta: number;
  disabled?: boolean;
  onTransformChange?: () => void;
}) {
  const smoothedZ = useRef<number>(0);
  const startZRef = useRef<number>(0);
  const zoomActiveRef = useRef(false);

  useFrame(() => {
    if (!anchorRef.current) return;
    const anchor = anchorRef.current;

    // Block zoom while dragging a piece or scene object — prevents the anchor
    // from jumping mid-drag and teleporting the piece to the wrong position.
    if (disabled || !isZooming) {
      zoomActiveRef.current = false;
      return;
    }

    if (!zoomActiveRef.current) {
      startZRef.current = anchor.position.z;
      smoothedZ.current = anchor.position.z;
      zoomActiveRef.current = true;
    }

    const targetZ = startZRef.current + zoomDelta;
    const clampedZ = THREE.MathUtils.clamp(targetZ, -8, -0.6);
    smoothedZ.current = THREE.MathUtils.lerp(smoothedZ.current, clampedZ, 0.25);
    anchor.position.z = smoothedZ.current;
    onTransformChange?.();
  });

  return null;
}

function SceneObjectSystem({
  objectRootRef,
  initialSceneState,
  onSceneStateChange,
  spawnObjectRequest,
  handLandmarks,
  isPinching,
  isRemoveTool = false,
  canPaintObjects = false,
  paintColor,
  brushSize,
  isEraser = false,
  isBucketFill = false,
  stateVersion = 0,
  palmCenter,
  onObjectMoveActiveChange,
  mirrorX = true,
  movementDisabled = false,
}: {
  objectRootRef: React.RefObject<THREE.Group | null>;
  initialSceneState?: SerializedSceneObject[];
  onSceneStateChange?: (sceneState: SerializedSceneObject[]) => void;
  spawnObjectRequest?: ObjectSpawnRequest | null;
  handLandmarks: HandLandmarks | null;
  isPinching: boolean;
  isRemoveTool?: boolean;
  canPaintObjects?: boolean;
  paintColor: THREE.Color;
  brushSize: number;
  isEraser?: boolean;
  isBucketFill?: boolean;
  stateVersion?: number;
  palmCenter: PalmPosition | null;
  onObjectMoveActiveChange?: (active: boolean) => void;
  mirrorX?: boolean;
  movementDisabled?: boolean;
}) {
  const { camera, size } = useThree();
  const objectsRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const serializedSceneRef = useRef<SerializedSceneObject[]>([]);
  const hydrationKeyRef = useRef<string>('');
  const lastSpawnRequestRef = useRef<number>(0);
  const activeObjectIdRef = useRef<string | null>(null);
  const pinchMoveActiveRef = useRef(false);
  const pinchStartPalmRef = useRef<PalmPosition | null>(null);
  const pinchStartObjectPosRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const lastMoveActiveRef = useRef(false);
  const removeArmedRef = useRef(false);
  const colorArmedRef = useRef(false);
  const scenePaintStampsRef = useRef<Map<string, PaintStamp[]>>(new Map());
  const lastObjectPaintTimeRef = useRef(0);
  const lastObjectPaintPosRef = useRef<THREE.Vector3 | null>(null);
  const OBJECT_PAINT_COOLDOWN_MS = 20;

  const setMoveActive = useCallback((active: boolean) => {
    if (lastMoveActiveRef.current === active) return;
    lastMoveActiveRef.current = active;
    onObjectMoveActiveChange?.(active);
  }, [onObjectMoveActiveChange]);

  const emitSceneState = useCallback(() => {
    if (!onSceneStateChange) return;
    onSceneStateChange(
      serializedSceneRef.current.map((entry) => ({
        ...entry,
        position: [...entry.position] as [number, number, number],
        rotation: [...entry.rotation] as [number, number, number],
        paint: normalizeSerializedSceneObjectPaintState(entry.paint),
      }))
    );
  }, [onSceneStateChange]);

  const disposeSceneObject = useCallback((object: THREE.Object3D) => {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose());
      } else if (child.material) {
        child.material.dispose();
      }
      if (child.geometry && !child.userData.sharedGeometry) {
        child.geometry.dispose();
      }
    });
    object.parent?.remove(object);
  }, []);

  const clearSceneObjects = useCallback(() => {
    objectsRef.current.forEach((object) => disposeSceneObject(object));
    objectsRef.current.clear();
    scenePaintStampsRef.current.clear();
    serializedSceneRef.current = [];
  }, [disposeSceneObject]);

  const removeSceneObject = useCallback((objectId: string) => {
    const object = objectsRef.current.get(objectId);
    if (!object) return false;

    disposeSceneObject(object);
    objectsRef.current.delete(objectId);
    scenePaintStampsRef.current.delete(objectId);
    serializedSceneRef.current = serializedSceneRef.current.filter((entry) => entry.id !== objectId);
    if (activeObjectIdRef.current === objectId) {
      activeObjectIdRef.current = null;
      pinchMoveActiveRef.current = false;
      setMoveActive(false);
    }
    emitSceneState();
    return true;
  }, [disposeSceneObject, emitSceneState, setMoveActive]);

  const recolorSceneObject = useCallback((objectId: string, color: THREE.Color) => {
    const object = objectsRef.current.get(objectId);
    if (!object) return false;

    const nextColor = `#${color.getHexString()}`;
    const existing = serializedSceneRef.current.find((entry) => entry.id === objectId);
    if (
      existing?.color?.toLowerCase() === nextColor.toLowerCase() &&
      normalizeSerializedSceneObjectPaintState(existing.paint).length === 0
    ) {
      return false;
    }

    applySceneObjectColor(object, color);
    clearSceneObjectPaintDecals(object);
    scenePaintStampsRef.current.set(objectId, []);
    serializedSceneRef.current = serializedSceneRef.current.map((entry) => (
      entry.id === objectId ? { ...entry, color: nextColor, paint: [] } : entry
    ));
    emitSceneState();
    return true;
  }, [emitSceneState]);

  const getSceneObjectPaintHit = useCallback((pointerX: number, pointerY: number) => {
    const hits = raycastFromFingertip(pointerX, pointerY, camera, Array.from(objectsRef.current.values()));
    const hit = hits.find((candidate) => (
      candidate.object instanceof THREE.Mesh &&
      candidate.object.userData?.isSceneObjectPaintDecal !== true
    ));
    if (!hit || !(hit.object instanceof THREE.Mesh)) return null;

    const sceneObject = findSceneObjectAncestor(hit.object);
    const objectId = sceneObject?.userData?.sceneObjectId;
    if (!sceneObject || !objectId || !objectsRef.current.has(objectId)) return null;

    const targetMesh = getSceneObjectBaseMesh(sceneObject);
    if (!targetMesh) return null;

    return {
      hit,
      objectId,
      sceneObject,
      targetMesh,
    };
  }, [camera]);

  const paintSceneObject = useCallback((hitInfo: {
    hit: THREE.Intersection;
    objectId: string;
    sceneObject: THREE.Object3D;
    targetMesh: THREE.Mesh;
  }) => {
    const nowMs = performance.now();
    if (nowMs - lastObjectPaintTimeRef.current < OBJECT_PAINT_COOLDOWN_MS) return false;

    const targetPoint = hitInfo.hit.point.clone();
    const minDistance = Math.max(brushSize * 0.32, 0.01);
    if (lastObjectPaintPosRef.current && lastObjectPaintPosRef.current.distanceTo(targetPoint) < minDistance) {
      return false;
    }

    hitInfo.targetMesh.updateWorldMatrix(true, false);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(hitInfo.targetMesh.matrixWorld);
    const worldNormal = hitInfo.hit.face
      ? hitInfo.hit.face.normal.clone().applyMatrix3(normalMatrix).normalize()
      : new THREE.Vector3(0, 0, 1);

    const decal = createPaintDecal(
      hitInfo.targetMesh,
      targetPoint,
      worldNormal,
      brushSize,
      paintColor,
      false
    );
    if (!decal) return false;

    const existingStamps = scenePaintStampsRef.current.get(hitInfo.objectId) || [];
    const nextLayer = existingStamps.length + 1;
    const stampId = `scene-stamp-${Date.now()}-${Math.random()}`;
    attachSceneObjectDecal(hitInfo.sceneObject, hitInfo.targetMesh, decal, nextLayer, stampId);

    const localPoint = hitInfo.targetMesh.worldToLocal(targetPoint.clone());
    const inverseNormalMatrix = new THREE.Matrix3().getNormalMatrix(hitInfo.targetMesh.matrixWorld);
    inverseNormalMatrix.invert();
    const localNormal = worldNormal.clone().applyMatrix3(inverseNormalMatrix).normalize();

    const nextStamp: SerializedSceneObjectPaintDecal = {
      id: stampId,
      point: [localPoint.x, localPoint.y, localPoint.z],
      normal: [localNormal.x, localNormal.y, localNormal.z],
      size: brushSize,
      color: `#${paintColor.getHexString()}`,
      timestamp: Date.now(),
      layer: nextLayer,
    };

    const nextStamps = [
      ...existingStamps,
      { id: stampId, mesh: decal, timestamp: nextStamp.timestamp },
    ];
    while (Number.isFinite(SCENE_OBJECT_PAINT_STAMP_LIMIT) && nextStamps.length > SCENE_OBJECT_PAINT_STAMP_LIMIT) {
      const removedStamp = nextStamps.shift();
      if (removedStamp) {
        disposePaintDecalMesh(removedStamp.mesh);
      }
    }
    scenePaintStampsRef.current.set(hitInfo.objectId, nextStamps);

    serializedSceneRef.current = serializedSceneRef.current.map((entry) => {
      if (entry.id !== hitInfo.objectId) return entry;
      const currentPaint = normalizeSerializedSceneObjectPaintState(entry.paint);
      const nextPaint = [...currentPaint, nextStamp];
      return {
        ...entry,
        paint: Number.isFinite(SCENE_OBJECT_PAINT_STAMP_LIMIT) ? nextPaint.slice(-SCENE_OBJECT_PAINT_STAMP_LIMIT) : nextPaint,
      };
    });

    lastObjectPaintTimeRef.current = nowMs;
    lastObjectPaintPosRef.current = targetPoint;
    emitSceneState();
    return true;
  }, [brushSize, emitSceneState, paintColor]);

  const eraseSceneObjectPaint = useCallback((hitInfo: {
    hit: THREE.Intersection;
    objectId: string;
  }) => {
    const nowMs = performance.now();
    if (nowMs - lastObjectPaintTimeRef.current < OBJECT_PAINT_COOLDOWN_MS) return false;

    const existingStamps = scenePaintStampsRef.current.get(hitInfo.objectId) || [];
    if (existingStamps.length === 0) return false;

    const eraseRadius = Math.max(brushSize * 1.25, 0.025);
    const removedIds = new Set<string>();
    const remainingStamps: PaintStamp[] = [];
    const targetPoint = hitInfo.hit.point.clone();

    existingStamps.forEach((stamp) => {
      const geometry = stamp.mesh.geometry as THREE.BufferGeometry;
      if (!geometry.boundingSphere) {
        geometry.computeBoundingSphere();
      }
      stamp.mesh.updateWorldMatrix(true, false);
      const center = geometry.boundingSphere?.center ?? new THREE.Vector3();
      const worldCenter = center.clone().applyMatrix4(stamp.mesh.matrixWorld);

      if (worldCenter.distanceTo(targetPoint) <= eraseRadius) {
        removedIds.add(stamp.id);
        disposePaintDecalMesh(stamp.mesh);
      } else {
        remainingStamps.push(stamp);
      }
    });

    if (removedIds.size === 0) return false;

    scenePaintStampsRef.current.set(hitInfo.objectId, remainingStamps);
    serializedSceneRef.current = serializedSceneRef.current.map((entry) => (
      entry.id === hitInfo.objectId
        ? {
            ...entry,
            paint: normalizeSerializedSceneObjectPaintState(entry.paint)
              .filter((stamp) => !removedIds.has(stamp.id)),
          }
        : entry
    ));

    lastObjectPaintTimeRef.current = nowMs;
    lastObjectPaintPosRef.current = targetPoint;
    emitSceneState();
    return true;
  }, [brushSize, emitSceneState]);

  useEffect(() => {
    return () => {
      setMoveActive(false);
      clearSceneObjects();
    };
  }, [clearSceneObjects, setMoveActive]);

  useEffect(() => {
    const objectRoot = objectRootRef.current;
    if (!objectRoot) return;

    const normalizedState = normalizeSerializedSceneState(initialSceneState);
    const hydrationKey = `${stateVersion}:${JSON.stringify(normalizedState)}`;
    if (hydrationKeyRef.current === hydrationKey) return;
    hydrationKeyRef.current = hydrationKey;

    clearSceneObjects();
    normalizedState.forEach((sceneObject) => {
      const mesh = buildSceneObjectMesh(sceneObject);
      if (!mesh) return;
      objectRoot.add(mesh);
      objectsRef.current.set(sceneObject.id, mesh);
      const restoredStamps: PaintStamp[] = [];
      mesh.traverse((child) => {
        if (child instanceof THREE.Mesh && child.userData?.isSceneObjectPaintDecal) {
          restoredStamps.push({
            id: child.userData.sceneObjectPaintDecalId || `scene-stamp-${restoredStamps.length}`,
            mesh: child,
            timestamp: sceneObject.paint?.[restoredStamps.length]?.timestamp || Date.now(),
          });
        }
      });
      scenePaintStampsRef.current.set(sceneObject.id, restoredStamps);
    });
    serializedSceneRef.current = normalizedState;
    emitSceneState();
  }, [objectRootRef, clearSceneObjects, emitSceneState, initialSceneState, stateVersion]);

  useEffect(() => {
    if (!spawnObjectRequest) return;
    if (spawnObjectRequest.requestId === lastSpawnRequestRef.current) return;
    lastSpawnRequestRef.current = spawnObjectRequest.requestId;

    const objectRoot = objectRootRef.current;
    const definition = getArObjectDefinition(spawnObjectRequest.objectId);
    if (!objectRoot || !definition || definition.kind !== 'primitive') return;

    const objectId = `scene-object-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const objectCount = serializedSceneRef.current.length;
    const angle = (objectCount % 8) * (Math.PI / 4);
    const basePosition = new THREE.Vector3(
      Math.cos(angle) * 0.72,
      THREE.MathUtils.clamp(((objectCount % 3) - 1) * 0.12, -0.18, 0.18),
      Math.sin(angle) * 0.18
    );

    const serializedObject: SerializedSceneObject = {
      id: objectId,
      objectId: definition.id,
      position: [basePosition.x, basePosition.y, basePosition.z],
      rotation: [0, 0, 0],
      scale: definition.defaultScale || 0.32,
      color: definition.color,
      gluedTo: null,
      groupId: null,
      paint: [],
    };

    const mesh = buildSceneObjectMesh(serializedObject);
    if (!mesh) return;

    objectRoot.add(mesh);
    objectsRef.current.set(objectId, mesh);
    scenePaintStampsRef.current.set(objectId, []);
    serializedSceneRef.current = [...serializedSceneRef.current, serializedObject];
    emitSceneState();
  }, [objectRootRef, emitSceneState, spawnObjectRequest]);

  useFrame(() => {
    if (isRemoveTool) {
      pinchMoveActiveRef.current = false;
      activeObjectIdRef.current = null;
      pinchStartPalmRef.current = null;
      setMoveActive(false);

      if (!handLandmarks || isPinching || objectsRef.current.size === 0 || !isPointingGesture(handLandmarks)) {
        removeArmedRef.current = false;
        return;
      }

      if (removeArmedRef.current) return;

      const mirroredX = mirrorX ? 1 - handLandmarks.indexTip.x : handLandmarks.indexTip.x;
      const pointerThresholdPx = Math.max(44, Math.min(size.width, size.height) * 0.14);
      const hits = raycastFromFingertip(
        mirroredX,
        handLandmarks.indexTip.y,
        camera,
        Array.from(objectsRef.current.values())
      );

      let selectedId: string | null = null;
      if (hits.length > 0) {
        const current = findSceneObjectAncestor(hits[0].object);
        const raycastId = current?.userData?.sceneObjectId;
        if (raycastId && objectsRef.current.has(raycastId)) {
          selectedId = raycastId;
        }
      }

      if (!selectedId) {
        selectedId = pickSceneObjectNearPointer(
          objectsRef.current,
          mirroredX,
          handLandmarks.indexTip.y,
          camera,
          size,
          pointerThresholdPx
        );
      }

      if (selectedId) {
        removeSceneObject(selectedId);
        removeArmedRef.current = true;
      }
      return;
    }

    removeArmedRef.current = false;

    if (canPaintObjects && !isPinching) {
      pinchMoveActiveRef.current = false;
      activeObjectIdRef.current = null;
      pinchStartPalmRef.current = null;
      setMoveActive(false);

      if (!handLandmarks || objectsRef.current.size === 0 || !isPointingGesture(handLandmarks)) {
        colorArmedRef.current = false;
        lastObjectPaintPosRef.current = null;
      } else {
        const mirroredX = mirrorX ? 1 - handLandmarks.indexTip.x : handLandmarks.indexTip.x;
        const hitInfo = getSceneObjectPaintHit(mirroredX, handLandmarks.indexTip.y);

        if (!hitInfo) {
          colorArmedRef.current = false;
          lastObjectPaintPosRef.current = null;
        } else if (isBucketFill) {
          if (!colorArmedRef.current) {
            recolorSceneObject(hitInfo.objectId, paintColor);
            colorArmedRef.current = true;
          }
          lastObjectPaintPosRef.current = null;
        } else if (isEraser) {
          colorArmedRef.current = false;
          eraseSceneObjectPaint(hitInfo);
        } else {
          colorArmedRef.current = false;
          paintSceneObject(hitInfo);
        }
      }
    } else {
      colorArmedRef.current = false;
      lastObjectPaintPosRef.current = null;
    }

    if (movementDisabled || !isPinching || !palmCenter || !handLandmarks) {
      pinchMoveActiveRef.current = false;
      activeObjectIdRef.current = null;
      pinchStartPalmRef.current = null;
      setMoveActive(false);
      return;
    }

    if (objectsRef.current.size === 0) {
      pinchMoveActiveRef.current = false;
      activeObjectIdRef.current = null;
      setMoveActive(false);
      return;
    }

    if (!pinchMoveActiveRef.current) {
      const mirroredX = mirrorX ? 1 - handLandmarks.indexTip.x : handLandmarks.indexTip.x;
      const pointerThresholdPx = Math.max(44, Math.min(size.width, size.height) * 0.14);
      const hits = raycastFromFingertip(
        mirroredX,
        handLandmarks.indexTip.y,
        camera,
        Array.from(objectsRef.current.values())
      );

      let selectedId: string | null = null;
      if (hits.length > 0) {
        const current = findSceneObjectAncestor(hits[0].object);
        const raycastId = current?.userData?.sceneObjectId;
        if (raycastId && objectsRef.current.has(raycastId)) {
          selectedId = raycastId;
        }
      }

      if (!selectedId) {
        selectedId = pickSceneObjectNearPointer(
          objectsRef.current,
          mirroredX,
          handLandmarks.indexTip.y,
          camera,
          size,
          pointerThresholdPx
        );
      }

      if (!selectedId || !objectsRef.current.has(selectedId)) return;

      activeObjectIdRef.current = selectedId;
      pinchMoveActiveRef.current = true;
      pinchStartPalmRef.current = { ...palmCenter };
      pinchStartObjectPosRef.current.copy(objectsRef.current.get(selectedId)!.position);
      setMoveActive(true);
      return;
    }

    const selectedId = activeObjectIdRef.current;
    const selectedObject = selectedId ? objectsRef.current.get(selectedId) : null;
    const startPalm = pinchStartPalmRef.current;
    if (!selectedId || !selectedObject || !startPalm) {
      pinchMoveActiveRef.current = false;
      activeObjectIdRef.current = null;
      setMoveActive(false);
      return;
    }

    const worldPos = new THREE.Vector3();
    selectedObject.getWorldPosition(worldPos);
    const distance = Math.max(0.2, camera.position.distanceTo(worldPos));
    const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
    const worldHeight = 2 * Math.tan(fov / 2) * distance;
    const worldWidth = worldHeight * (size.width / size.height);

    const deltaX = (palmCenter.x - startPalm.x) * worldWidth;
    const deltaY = -(palmCenter.y - startPalm.y) * worldHeight;
    const targetPos = new THREE.Vector3(
      pinchStartObjectPosRef.current.x + deltaX,
      pinchStartObjectPosRef.current.y + deltaY,
      pinchStartObjectPosRef.current.z
    );

    selectedObject.position.lerp(targetPos, 0.35);

    const movedPos = selectedObject.position.clone();
    let nearest: SerializedSceneObject | null = null;
    let nearestDistance = Infinity;

    serializedSceneRef.current.forEach((entry) => {
      if (entry.id === selectedId) return;
      const entryPos = new THREE.Vector3(...entry.position);
      const distanceToEntry = entryPos.distanceTo(movedPos);
      if (distanceToEntry < nearestDistance) {
        nearestDistance = distanceToEntry;
        nearest = entry;
      }
    });

    if (nearest && nearestDistance < 0.28) {
      const nearestPos = new THREE.Vector3(...nearest.position);
      const direction = movedPos.clone().sub(nearestPos);
      if (direction.lengthSq() < 0.0001) {
        direction.set(1, 0, 0);
      }
      direction.normalize().multiplyScalar(0.32);
      const snappedPos = nearestPos.clone().add(direction);
      selectedObject.position.copy(snappedPos);

      const groupId = nearest.groupId || `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      serializedSceneRef.current = serializedSceneRef.current.map((entry) => {
        if (entry.id === nearest!.id) {
          return { ...entry, groupId };
        }
        if (entry.id === selectedId) {
          return {
            ...entry,
            position: [snappedPos.x, snappedPos.y, snappedPos.z],
            gluedTo: nearest!.id,
            groupId,
          };
        }
        return entry;
      });
    } else {
      serializedSceneRef.current = serializedSceneRef.current.map((entry) => {
        if (entry.id !== selectedId) return entry;
        return {
          ...entry,
          position: [movedPos.x, movedPos.y, movedPos.z],
          gluedTo: null,
          groupId: null,
        };
      });
    }

    emitSceneState();
  });

  return null;
}

function PuzzlePieceSystem({
  modelRef,
  modelReadyTick,
  puzzlePieces = 0,
  puzzleSeed = 'default',
  pieceIdPrefix = '',
  initialPuzzleState,
  onPuzzleStateChange,
  puzzlePieceSpawnRequest,
  handLandmarks,
  isPinching,
  isRemoveTool = false,
  stateVersion = 0,
  palmCenter,
  editingEnabled = true,
  disabled = false,
  onPuzzleMoveActiveChange,
  onPuzzleReady,
  mirrorX = true,
}: {
  modelRef: React.RefObject<THREE.Group | null>;
  modelReadyTick: number;
  puzzlePieces?: number;
  puzzleSeed?: string;
  pieceIdPrefix?: string;
  initialPuzzleState?: SerializedPuzzlePiece[];
  onPuzzleStateChange?: (puzzleState: SerializedPuzzlePiece[]) => void;
  puzzlePieceSpawnRequest?: PuzzlePieceSpawnRequest | null;
  handLandmarks: HandLandmarks | null;
  isPinching: boolean;
  isRemoveTool?: boolean;
  stateVersion?: number;
  palmCenter: PalmPosition | null;
  editingEnabled?: boolean;
  disabled?: boolean;
  onPuzzleMoveActiveChange?: (active: boolean) => void;
  onPuzzleReady?: () => void;
  mirrorX?: boolean;
}) {
  const { camera, size } = useThree();
  const piecesRef = useRef<Map<string, { id: string; group: THREE.Object3D; targetPosition: THREE.Vector3; locked: boolean; spawned: boolean }>>(new Map());
  const hydrationKeyRef = useRef('');
  const lastPuzzleSpawnRequestRef = useRef<number>(0);
  const activePieceIdRef = useRef<string | null>(null);
  const pinchMoveActiveRef = useRef(false);
  const removeArmedRef = useRef(false);
  const pinchStartPalmRef = useRef<PalmPosition | null>(null);
  const pinchStartWorldRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const lastMoveActiveRef = useRef(false);
  const lastTraceVisibleRef = useRef<boolean | null>(null);
  const snapThresholdRef = useRef(0.12);
  const toGlobalPieceId = useCallback((localId: string) => `${pieceIdPrefix}${localId}`, [pieceIdPrefix]);
  const toLocalPieceId = useCallback((globalId: string) => (
    pieceIdPrefix && globalId.startsWith(pieceIdPrefix)
      ? globalId.slice(pieceIdPrefix.length)
      : globalId
  ), [pieceIdPrefix]);

  const setMoveActive = useCallback((active: boolean) => {
    if (lastMoveActiveRef.current === active) return;
    lastMoveActiveRef.current = active;
    onPuzzleMoveActiveChange?.(active);
  }, [onPuzzleMoveActiveChange]);

  const isPuzzleComplete = useCallback(() => {
    const pieces = Array.from(piecesRef.current.values());
    return pieces.length > 0 && pieces.every((piece) =>
      piece.locked || piece.group.userData.puzzleLocked === true
    );
  }, []);

  const syncPuzzleTraceVisibility = useCallback(() => {
    const shouldShowTrace = Boolean(
      editingEnabled &&
      !disabled &&
      normalizePuzzlePieceCount(puzzlePieces) &&
      !isPuzzleComplete()
    );
    if (lastTraceVisibleRef.current === shouldShowTrace) return;
    lastTraceVisibleRef.current = shouldShowTrace;
    setPuzzleTargetGuidesVisible(modelRef.current, shouldShowTrace);
  }, [disabled, editingEnabled, isPuzzleComplete, modelRef, puzzlePieces]);


  const emitPuzzleState = useCallback(() => {
    if (!onPuzzleStateChange) return;
    onPuzzleStateChange(
      Array.from(piecesRef.current.values()).map((piece) => ({
        id: piece.id,
        position: [
          piece.group.position.x,
          piece.group.position.y,
          piece.group.position.z,
        ] as [number, number, number],
        locked: piece.locked || piece.group.userData.puzzleLocked === true,
        spawned:
          piece.spawned ||
          piece.locked ||
          piece.group.userData.puzzleSpawned === true ||
          piece.group.userData.puzzleLocked === true,
      }))
    );
  }, [onPuzzleStateChange]);

  const resetPuzzlePiece = useCallback((pieceId: string) => {
    const piece = piecesRef.current.get(pieceId);
    const modelRoot = modelRef.current;
    if (!piece || !modelRoot) return false;

    const allPieces = Array.from(piecesRef.current.values());
    const pieceIndex = Math.max(0, allPieces.findIndex((entry) => entry.id === pieceId));
    const targetBounds = getPuzzleTargetBoundsFromPieces(allPieces.map((entry) => entry.group));

    const paintDecals: THREE.Object3D[] = [];
    piece.group.traverse((child) => {
      if (child.userData?.isPaintDecal) {
        paintDecals.push(child);
      }
    });
    paintDecals.forEach(disposePaintDecalMesh);

    piece.locked = false;
    piece.spawned = false;
    piece.group.userData.puzzleLocked = false;
    piece.group.userData.puzzleSpawned = false;
    piece.group.visible = false;
    piece.group.position.copy(createPuzzleSideStackPosition(targetBounds, piece.group, pieceIndex, allPieces.length));

    if (activePieceIdRef.current === pieceId) {
      activePieceIdRef.current = null;
      pinchMoveActiveRef.current = false;
      setMoveActive(false);
    }

    emitPuzzleState();
    lastTraceVisibleRef.current = null;
    syncPuzzleTraceVisibility();
    return true;
  }, [emitPuzzleState, modelRef, setMoveActive, syncPuzzleTraceVisibility]);

  useEffect(() => {
    return () => setMoveActive(false);
  }, [setMoveActive]);

  useEffect(() => {
    const modelRoot = modelRef.current;
    const normalizedCount = normalizePuzzlePieceCount(puzzlePieces);
    const scopedInitialState = (initialPuzzleState || [])
      .filter((piece) => !pieceIdPrefix || String(piece?.id || '').startsWith(pieceIdPrefix))
      .map((piece) => ({
        ...piece,
        id: toLocalPieceId(String(piece?.id || '')),
      }));
    const normalizedInitialState = normalizeSerializedPuzzleState(scopedInitialState);
    const hydrationKey = `${stateVersion}:${modelReadyTick}:${normalizedCount}:${puzzleSeed}:${JSON.stringify(normalizedInitialState)}`;

    if (hydrationKeyRef.current === hydrationKey) return;
    hydrationKeyRef.current = hydrationKey;
    piecesRef.current.clear();
    lastTraceVisibleRef.current = null;
    activePieceIdRef.current = null;
    pinchMoveActiveRef.current = false;
    setMoveActive(false);

    if (!modelRoot || !normalizedCount) {
      onPuzzleStateChange?.([]);
      onPuzzleReady?.();
      return;
    }

    const pieces = splitModelIntoPuzzlePieces(
      modelRoot,
      normalizedCount,
      puzzleSeed,
      normalizedInitialState,
      !editingEnabled
    );
    piecesRef.current = new Map(pieces.map((piece) => {
      const globalId = toGlobalPieceId(piece.id);
      piece.group.userData.puzzlePieceGlobalId = globalId;
      return [globalId, { ...piece, id: globalId }];
    }));

    const bounds = getModelLocalBounds(modelRoot);
    const size = bounds.getSize(new THREE.Vector3());
    // Grade-school users should not need pixel-perfect placement. A stronger
    // magnet still requires the piece to be near its trace, but snaps sooner.
    snapThresholdRef.current = Math.max(0.18, Math.max(size.x, size.y, size.z, 1) * 0.16);

    emitPuzzleState();
    syncPuzzleTraceVisibility();
    onPuzzleReady?.();
  }, [
    emitPuzzleState,
    initialPuzzleState,
    modelReadyTick,
    modelRef,
    onPuzzleReady,
    onPuzzleStateChange,
    puzzlePieces,
    puzzleSeed,
    editingEnabled,
    setMoveActive,
    syncPuzzleTraceVisibility,
    stateVersion,
    pieceIdPrefix,
    toGlobalPieceId,
    toLocalPieceId,
  ]);

  useEffect(() => {
    if (!puzzlePieceSpawnRequest) return;
    if (puzzlePieceSpawnRequest.requestId === lastPuzzleSpawnRequestRef.current) return;

    const piece = piecesRef.current.get(puzzlePieceSpawnRequest.pieceId);
    if (!piece) return;

    lastPuzzleSpawnRequestRef.current = puzzlePieceSpawnRequest.requestId;
    if (piece.spawned || piece.locked || piece.group.userData.puzzleLocked === true) {
      return;
    }

    piece.spawned = true;
    piece.group.userData.puzzleSpawned = true;
    piece.group.visible = true;
    emitPuzzleState();
  }, [emitPuzzleState, modelReadyTick, puzzlePieceSpawnRequest]);

  useEffect(() => {
    syncPuzzleTraceVisibility();
  }, [modelReadyTick, syncPuzzleTraceVisibility]);

  useFrame(() => {
    syncPuzzleTraceVisibility();

    if (isRemoveTool) {
      pinchMoveActiveRef.current = false;
      activePieceIdRef.current = null;
      pinchStartPalmRef.current = null;
      setMoveActive(false);

      if (!editingEnabled || disabled || !handLandmarks || isPinching || piecesRef.current.size === 0 || !isPointingGesture(handLandmarks)) {
        removeArmedRef.current = false;
        return;
      }

      if (removeArmedRef.current) return;

      const mirroredX = mirrorX ? 1 - handLandmarks.indexTip.x : handLandmarks.indexTip.x;
      const spawnedGroups = Array.from(piecesRef.current.values())
        .filter((piece) =>
          (piece.spawned || piece.group.userData.puzzleSpawned === true || piece.locked || piece.group.userData.puzzleLocked === true) &&
          piece.group.visible
        )
        .map((piece) => piece.group);

      if (spawnedGroups.length === 0) return;

      const hits = raycastFromFingertip(mirroredX, handLandmarks.indexTip.y, camera, spawnedGroups);
      let selectedId: string | null = null;

      if (hits.length > 0) {
        const pieceRoot = findPuzzleAncestor(hits[0].object);
        const hitId = pieceRoot?.userData?.puzzlePieceGlobalId || toGlobalPieceId(pieceRoot?.userData?.puzzlePieceId || '');
        if (hitId && piecesRef.current.has(hitId)) {
          selectedId = hitId;
        }
      }

      if (!selectedId) {
        const selectable = new Map(
          Array.from(piecesRef.current.entries())
            .filter(([, piece]) =>
              (piece.spawned || piece.group.userData.puzzleSpawned === true || piece.locked || piece.group.userData.puzzleLocked === true) &&
              piece.group.visible
            )
            .map(([id, piece]) => [id, piece.group])
        );
        selectedId = pickSceneObjectNearPointer(
          selectable,
          mirroredX,
          handLandmarks.indexTip.y,
          camera,
          size,
          Math.max(52, Math.min(size.width, size.height) * 0.16)
        );
      }

      if (selectedId) {
        resetPuzzlePiece(selectedId);
        removeArmedRef.current = true;
      }
      return;
    }

    removeArmedRef.current = false;

    if (!editingEnabled || disabled || !isPinching || !palmCenter || !handLandmarks) {
      pinchMoveActiveRef.current = false;
      activePieceIdRef.current = null;
      pinchStartPalmRef.current = null;
      setMoveActive(false);
      return;
    }

    if (piecesRef.current.size === 0) {
      pinchMoveActiveRef.current = false;
      activePieceIdRef.current = null;
      setMoveActive(false);
      return;
    }

    if (!pinchMoveActiveRef.current) {
      const pinchX = (handLandmarks.indexTip.x + handLandmarks.thumbTip.x) * 0.5;
      const pinchY = (handLandmarks.indexTip.y + handLandmarks.thumbTip.y) * 0.5;
      const mirroredX = mirrorX ? 1 - pinchX : pinchX;
      const unlockedGroups = Array.from(piecesRef.current.values())
        .filter((piece) =>
          (piece.spawned || piece.group.userData.puzzleSpawned === true) &&
          piece.group.visible &&
          !piece.locked &&
          piece.group.userData.puzzleLocked !== true
        )
        .map((piece) => piece.group);

      if (unlockedGroups.length === 0) return;

      const hits = raycastFromFingertip(mirroredX, pinchY, camera, unlockedGroups);
      let selectedId: string | null = null;

      if (hits.length > 0) {
        const pieceRoot = findPuzzleAncestor(hits[0].object);
        const hitId = pieceRoot?.userData?.puzzlePieceGlobalId || toGlobalPieceId(pieceRoot?.userData?.puzzlePieceId || '');
        if (hitId && piecesRef.current.has(hitId)) {
          selectedId = hitId;
        }
      }

      if (!selectedId) {
        const selectable = new Map(
          Array.from(piecesRef.current.entries())
            .filter(([, piece]) =>
              (piece.spawned || piece.group.userData.puzzleSpawned === true) &&
              piece.group.visible &&
              !piece.locked &&
              piece.group.userData.puzzleLocked !== true
            )
            .map(([id, piece]) => [id, piece.group])
        );
        selectedId = pickSceneObjectNearPointer(
          selectable,
          mirroredX,
          pinchY,
          camera,
          size,
          Math.max(90, Math.min(size.width, size.height) * 0.22)
        );
      }

      if (!selectedId) return;
      const selected = piecesRef.current.get(selectedId);
      if (!selected) return;

      activePieceIdRef.current = selectedId;
      pinchMoveActiveRef.current = true;
      pinchStartPalmRef.current = { ...palmCenter };
      selected.group.getWorldPosition(pinchStartWorldRef.current);
      setMoveActive(true);
      return;
    }

    const selectedId = activePieceIdRef.current;
    const selected = selectedId ? piecesRef.current.get(selectedId) : null;
    const startPalm = pinchStartPalmRef.current;

    if (!selected || !startPalm) {
      pinchMoveActiveRef.current = false;
      activePieceIdRef.current = null;
      setMoveActive(false);
      return;
    }

    const distance = Math.max(0.2, camera.position.distanceTo(pinchStartWorldRef.current));
    const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
    const worldHeight = 2 * Math.tan(fov / 2) * distance;
    const worldWidth = worldHeight * (size.width / size.height);
    const deltaX = (palmCenter.x - startPalm.x) * worldWidth;
    const deltaY = -(palmCenter.y - startPalm.y) * worldHeight;
    const targetWorld = pinchStartWorldRef.current.clone().add(new THREE.Vector3(deltaX, deltaY, 0));
    const parent = selected.group.parent;

    if (!parent) return;

    const targetLocal = parent.worldToLocal(targetWorld);
    selected.group.position.lerp(targetLocal, 0.35);

    if (selected.group.position.distanceTo(selected.targetPosition) <= snapThresholdRef.current) {
      selected.group.position.copy(selected.targetPosition);
      selected.locked = true;
      selected.spawned = true;
      selected.group.userData.puzzleLocked = true;
      selected.group.userData.puzzleSpawned = true;
      selected.group.visible = true;
      pinchMoveActiveRef.current = false;
      activePieceIdRef.current = null;
      setMoveActive(false);
      syncPuzzleTraceVisibility();
    }

    emitPuzzleState();
  });

  return null;
}

// Paint system component
function PaintSystem({
  anchorRef,
  modelRef,
  modelReadyTick,
  initialPaintState,
  onPaintStateChange,
  handLandmarks,
  isGrabbing,
  isPinching,
  paintMode,
  paintColor,
  brushSize,
  isEraser,
  isBucketFill = false,
  isRemoveTool = false,
  paintOcclusionRefs = [],
  stateVersion = 0,
  mirrorX = true,
}: {
  anchorRef: React.RefObject<THREE.Group | null>;
  modelRef: React.RefObject<THREE.Group | null>;
  modelReadyTick: number;
  initialPaintState?: SerializedPaintDecal[];
  onPaintStateChange?: (paintState: SerializedPaintDecal[]) => void;
  handLandmarks: HandLandmarks | null;
  isGrabbing: boolean;
  isPinching: boolean;
  paintMode: boolean;
  paintColor: THREE.Color;
  brushSize: number;
  isEraser: boolean;
  isBucketFill?: boolean;
  isRemoveTool?: boolean;
  paintOcclusionRefs?: Array<React.RefObject<THREE.Object3D | null>>;
  stateVersion?: number;
  mirrorX?: boolean;
}) {
  const { camera, scene } = useThree();
  const lastPaintTime = useRef(0);
  const lastPaintPos = useRef<THREE.Vector3 | null>(null);
  const smoothedHitPos = useRef<THREE.Vector3 | null>(null);
  const smoothedNormal = useRef<THREE.Vector3 | null>(null);
  const bucketArmedRef = useRef(false);
  const paintStampsRef = useRef<PaintStamp[]>([]);
  const serializedPaintRef = useRef<SerializedPaintDecal[]>([]);
  const hydrationKeyRef = useRef<string>('');
  const baseMaterialRootRef = useRef<THREE.Object3D | null>(null);
  const baseMaterialReadyTickRef = useRef<number | null>(null);
  const baseMaterialColorsRef = useRef<Array<{
    material: THREE.Material & { color?: THREE.Color };
    color: THREE.Color;
  }>>([]);
  const emitTimeoutRef = useRef<number | null>(null);
  const lastEmitTimeRef = useRef(0);
  const PAINT_COOLDOWN_BASE = 12;
  const PAINT_STATE_EMIT_INTERVAL = 140;
  const POSITION_SMOOTHING = 0.72;
  const NORMAL_SMOOTHING = 0.5;

  const disposeStamp = useCallback((stamp: PaintStamp) => {
    stamp.mesh.parent?.remove(stamp.mesh);
    stamp.mesh.geometry.dispose();
    if (stamp.mesh.material instanceof THREE.Material) {
      stamp.mesh.material.dispose();
    } else if (Array.isArray(stamp.mesh.material)) {
      stamp.mesh.material.forEach((mat) => mat.dispose());
    }
  }, []);

  const flushPaintState = useCallback(() => {
    if (!onPaintStateChange) return;

    if (emitTimeoutRef.current !== null) {
      window.clearTimeout(emitTimeoutRef.current);
      emitTimeoutRef.current = null;
    }

    lastEmitTimeRef.current = performance.now();
    onPaintStateChange(
      serializedPaintRef.current.map((stamp) => ({
        ...stamp,
        meshPath: [...stamp.meshPath],
        point: [...stamp.point] as [number, number, number],
        normal: [...stamp.normal] as [number, number, number],
      }))
    );
  }, [onPaintStateChange]);

  const emitPaintState = useCallback(
    (immediate = false) => {
      if (!onPaintStateChange) return;

      if (immediate) {
        flushPaintState();
        return;
      }

      const now = performance.now();
      const elapsed = now - lastEmitTimeRef.current;
      if (elapsed >= PAINT_STATE_EMIT_INTERVAL) {
        flushPaintState();
        return;
      }

      if (emitTimeoutRef.current === null) {
        emitTimeoutRef.current = window.setTimeout(() => {
          emitTimeoutRef.current = null;
          flushPaintState();
        }, PAINT_STATE_EMIT_INTERVAL - elapsed);
      }
    },
    [flushPaintState, onPaintStateChange]
  );

  const captureBaseMaterialColors = useCallback((root: THREE.Object3D) => {
    const seenMaterials = new Set<THREE.Material>();
    const snapshots: Array<{
      material: THREE.Material & { color?: THREE.Color };
      color: THREE.Color;
    }> = [];

    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (!material || seenMaterials.has(material)) return;
        seenMaterials.add(material);
        const color = (material as THREE.Material & { color?: THREE.Color }).color;
        if (color instanceof THREE.Color) {
          snapshots.push({
            material: material as THREE.Material & { color?: THREE.Color },
            color: color.clone(),
          });
        }
      });
    });

    baseMaterialRootRef.current = root;
    baseMaterialReadyTickRef.current = modelReadyTick;
    baseMaterialColorsRef.current = snapshots;
  }, [modelReadyTick]);

  const restoreBaseMaterialColors = useCallback(() => {
    baseMaterialColorsRef.current.forEach(({ material, color }) => {
      if (material.color instanceof THREE.Color) {
        material.color.copy(color);
        material.needsUpdate = true;
      }
    });
  }, []);

  const clearPaintState = useCallback((restoreMaterials = false) => {
    paintStampsRef.current.forEach(disposeStamp);
    paintStampsRef.current = [];
    serializedPaintRef.current = [];
    if (restoreMaterials) {
      restoreBaseMaterialColors();
    }
    bucketArmedRef.current = false;
    lastPaintPos.current = null;
    smoothedHitPos.current = null;
    smoothedNormal.current = null;
    emitPaintState(true);
  }, [disposeStamp, emitPaintState, restoreBaseMaterialColors]);

  useEffect(() => {
    return () => {
      if (emitTimeoutRef.current !== null) {
        window.clearTimeout(emitTimeoutRef.current);
        emitTimeoutRef.current = null;
      }
      paintStampsRef.current.forEach(disposeStamp);
      paintStampsRef.current = [];
      serializedPaintRef.current = [];
    };
  }, [disposeStamp]);

  useEffect(() => {
    bucketArmedRef.current = false;
  }, [isBucketFill]);

  useEffect(() => {
    if (!modelRef.current) return;

    const modelRoot = modelRef.current;
    if (
      baseMaterialRootRef.current !== modelRoot ||
      baseMaterialReadyTickRef.current !== modelReadyTick
    ) {
      captureBaseMaterialColors(modelRoot);
    }

    const normalizedInitialState = normalizeSerializedPaintState(initialPaintState);
    const hydrationKey = `${stateVersion}:${modelReadyTick}:${JSON.stringify(normalizedInitialState)}`;
    if (hydrationKeyRef.current === hydrationKey) return;
    hydrationKeyRef.current = hydrationKey;

    clearPaintState(true);
    if (normalizedInitialState.length === 0) return;

    const anchor = anchorRef.current;
    const restoredStamps: PaintStamp[] = [];
    const restoredSerialized: SerializedPaintDecal[] = [];
    const initialPaintQueue = Number.isFinite(BASE_MODEL_PAINT_STAMP_LIMIT)
      ? normalizedInitialState.slice(-BASE_MODEL_PAINT_STAMP_LIMIT)
      : normalizedInitialState;

    initialPaintQueue.forEach((savedStamp, index) => {
      if (savedStamp.mode === 'fill') {
        const fillTarget = savedStamp.meshPath.length > 0
          ? getObjectByPath(modelRoot, savedStamp.meshPath)
          : modelRoot;
        recolorModel(fillTarget || modelRoot, new THREE.Color(savedStamp.color));
        restoredSerialized.push({
          ...savedStamp,
          id: savedStamp.id || `fill-${index}`,
          mode: 'fill',
        });
        return;
      }

      const targetObject = getObjectByPath(modelRoot, savedStamp.meshPath);
      if (!(targetObject instanceof THREE.Mesh)) return;

      const decalParent = targetObject.parent || anchor;
      targetObject.updateMatrixWorld(true);
      decalParent?.updateMatrixWorld(true);

      const localPoint = new THREE.Vector3(...savedStamp.point);
      const worldPoint = targetObject.localToWorld(localPoint);

      const localNormal = new THREE.Vector3(...savedStamp.normal).normalize();
      const worldNormal = localNormal
        .clone()
        .applyMatrix3(new THREE.Matrix3().getNormalMatrix(targetObject.matrixWorld))
        .normalize();

      const decal = createPaintDecal(
        targetObject,
        worldPoint,
        worldNormal,
        savedStamp.size,
        new THREE.Color(savedStamp.color),
        false
      );

      if (!decal) return;
      decal.userData.isPaintDecal = true;
      const layer = savedStamp.layer || restoredStamps.length + 1;
      applyDecalLayer(decal, layer);

      if (decalParent) {
        const inverseParent = decalParent.matrixWorld.clone().invert();
        decal.geometry.applyMatrix4(inverseParent);
        decal.position.set(0, 0, 0);
        decal.rotation.set(0, 0, 0);
        decal.updateMatrix();
        decal.matrixAutoUpdate = false;
        decalParent.add(decal);
      } else {
        scene.add(decal);
      }

      const stampId = savedStamp.id || `restored-stamp-${index}`;
      restoredStamps.push({
        id: stampId,
        mesh: decal,
        timestamp: savedStamp.timestamp,
      });
      restoredSerialized.push({
        ...savedStamp,
        id: stampId,
        layer,
        mode: 'decal',
      });
    });

    paintStampsRef.current = restoredStamps;
    serializedPaintRef.current = restoredSerialized;
    emitPaintState(true);
  }, [
    anchorRef,
    captureBaseMaterialColors,
    clearPaintState,
    emitPaintState,
    initialPaintState,
    modelReadyTick,
    modelRef,
    scene,
    stateVersion,
  ]);

  useFrame((_, delta) => {
    // Only paint when NOT grabbing (pointing with index finger)
    if (!paintMode || isRemoveTool || !handLandmarks || !modelRef.current || isGrabbing || isPinching) {
      bucketArmedRef.current = false;
      lastPaintPos.current = null;
      smoothedHitPos.current = null;
      smoothedNormal.current = null;
      return;
    }

    const nowMs = performance.now();
    const adaptiveCooldown = THREE.MathUtils.clamp(delta * 900, PAINT_COOLDOWN_BASE, 26);
    if (nowMs - lastPaintTime.current < adaptiveCooldown) return;
    const timestamp = Date.now();

    // Check if pointing gesture (index extended, others curled)
    const indexTip = handLandmarks.indexTip;
    const isPointing = isPointingGesture(handLandmarks);

    if (!isPointing) {
      bucketArmedRef.current = false;
      lastPaintPos.current = null;
      smoothedHitPos.current = null;
      smoothedNormal.current = null;
      return;
    }

    const mirroredX = mirrorX ? 1 - indexTip.x : indexTip.x;
    const modelHits = raycastFromFingertip(mirroredX, indexTip.y, camera, [modelRef.current]);
    const hit = modelHits.find(
      (candidate) =>
        candidate.object instanceof THREE.Mesh &&
        candidate.object?.userData?.isPaintDecal !== true &&
        candidate.object?.userData?.isPuzzleTargetGuideLine !== true
    );

    const occlusionHits = paintOcclusionRefs
      .flatMap((ref) => (ref.current ? raycastFromFingertip(mirroredX, indexTip.y, camera, [ref.current]) : []))
      .filter((candidate) =>
        candidate.object instanceof THREE.Mesh &&
        candidate.object?.userData?.isPaintDecal !== true &&
        Boolean(findSceneObjectAncestor(candidate.object))
      );

    if (occlusionHits[0] && (!hit || occlusionHits[0].distance <= hit.distance + 0.01)) {
      bucketArmedRef.current = false;
      lastPaintPos.current = null;
      smoothedHitPos.current = null;
      smoothedNormal.current = null;
      return;
    }

    if (!hit) {
      bucketArmedRef.current = false;
      lastPaintPos.current = null;
      smoothedHitPos.current = null;
      smoothedNormal.current = null;
      return;
    }

    if (!(hit.object instanceof THREE.Mesh)) {
      bucketArmedRef.current = false;
      lastPaintPos.current = null;
      smoothedNormal.current = null;
      return;
    }

    const targetMesh = hit.object as THREE.Mesh;
    targetMesh.updateWorldMatrix(true, false);

    if (isBucketFill) {
      if (!bucketArmedRef.current) {
        const modelRoot = modelRef.current;
        const puzzlePieceRoot = findPuzzlePieceRoot(targetMesh, modelRoot);
        const fillRoot = puzzlePieceRoot || modelRoot;
        const fillPath = puzzlePieceRoot ? getObjectPath(modelRoot, fillRoot) || [] : [];
        const removedStampIds = new Set<string>();

        if (puzzlePieceRoot) {
          paintStampsRef.current = paintStampsRef.current.filter((stamp) => {
            if (isDescendantOf(stamp.mesh, fillRoot)) {
              removedStampIds.add(stamp.id);
              disposeStamp(stamp);
              return false;
            }
            return true;
          });
        } else {
          paintStampsRef.current.forEach((stamp) => {
            removedStampIds.add(stamp.id);
            disposeStamp(stamp);
          });
          paintStampsRef.current = [];
        }

        recolorModel(fillRoot, paintColor);
        bucketArmedRef.current = true;

        const fillStamp: SerializedPaintDecal = {
          id: `fill-${Date.now()}-${Math.random()}`,
          meshPath: fillPath,
          point: [0, 0, 0],
          normal: [0, 0, 1],
          size: brushSize,
          color: `#${paintColor.getHexString()}`,
          timestamp,
          layer: (serializedPaintRef.current[serializedPaintRef.current.length - 1]?.layer || 0) + 1,
          mode: 'fill',
        };

        serializedPaintRef.current = puzzlePieceRoot
          ? [
              ...serializedPaintRef.current.filter((stamp) => {
                if (removedStampIds.has(stamp.id)) return false;
                if (stamp.mode === 'fill' && sameObjectPath(stamp.meshPath, fillPath)) return false;
                return true;
              }),
              fillStamp,
            ]
          : [fillStamp];
        emitPaintState(true);
      }

      lastPaintTime.current = nowMs;
      lastPaintPos.current = null;
      smoothedHitPos.current = null;
      smoothedNormal.current = null;
      return;
    }

    if (!smoothedHitPos.current) {
      smoothedHitPos.current = hit.point.clone();
    } else {
      smoothedHitPos.current.lerp(hit.point, POSITION_SMOOTHING);
    }

    const targetPoint = smoothedHitPos.current;
    const minDistance = Math.max(brushSize * 0.28, 0.006);
    
    if (lastPaintPos.current && lastPaintPos.current.distanceTo(targetPoint) < minDistance) {
      return;
    }

    const normalMatrix = new THREE.Matrix3().getNormalMatrix(targetMesh.matrixWorld);
    const rawWorldNormal = hit.face
      ? hit.face.normal.clone().applyMatrix3(normalMatrix).normalize()
      : new THREE.Vector3(0, 0, 1);
    if (!smoothedNormal.current) {
      smoothedNormal.current = rawWorldNormal.clone();
    } else {
      smoothedNormal.current.lerp(rawWorldNormal, NORMAL_SMOOTHING).normalize();
    }
    const worldNormal = smoothedNormal.current.clone();

    if (isEraser) {
      const eraseRadius = Math.max(brushSize * 1.2, 0.02);
      const remainingStamps: PaintStamp[] = [];
      const removedStampIds = new Set<string>();

      paintStampsRef.current.forEach((stamp) => {
        const geom = stamp.mesh.geometry as THREE.BufferGeometry;
        if (!geom.boundingSphere) {
          geom.computeBoundingSphere();
        }
        stamp.mesh.updateMatrixWorld(true);
        const center = geom.boundingSphere?.center ?? new THREE.Vector3();
        const worldCenter = center.clone().applyMatrix4(stamp.mesh.matrixWorld);

        if (worldCenter.distanceTo(targetPoint) <= eraseRadius) {
          removedStampIds.add(stamp.id);
          disposeStamp(stamp);
        } else {
          remainingStamps.push(stamp);
        }
      });

      if (remainingStamps.length !== paintStampsRef.current.length) {
        paintStampsRef.current = remainingStamps;
        serializedPaintRef.current = serializedPaintRef.current.filter(
          (stamp) => !removedStampIds.has(stamp.id)
        );
        emitPaintState(false);
      }

      lastPaintTime.current = nowMs;
      if (!lastPaintPos.current) lastPaintPos.current = new THREE.Vector3();
      lastPaintPos.current.copy(targetPoint);
      return;
    }

    const modelRoot = modelRef.current;
    const anchor = anchorRef.current;
    anchor?.updateWorldMatrix(true, false);

    const meshPath = modelRoot ? getObjectPath(modelRoot, targetMesh) : null;
    const inverseNormalMatrix = new THREE.Matrix3().getNormalMatrix(targetMesh.matrixWorld);
    inverseNormalMatrix.invert();
    const localNormal = worldNormal.clone().applyMatrix3(inverseNormalMatrix).normalize();
    const decalParent = targetMesh.parent || anchor;
    decalParent?.updateMatrixWorld(true);
    const inverseDecalParentMatrix = decalParent ? decalParent.matrixWorld.clone().invert() : null;
    const strokePoint = new THREE.Vector3();

    const addPaintStampAtPoint = (worldPoint: THREE.Vector3) => {
      const decal = createPaintDecal(targetMesh, worldPoint, worldNormal, brushSize, paintColor, false);
      if (!decal) return;

      decal.userData.isPaintDecal = true;
      const nextLayer = paintStampsRef.current.length + 1;
      applyDecalLayer(decal, nextLayer);

      if (decalParent && inverseDecalParentMatrix) {
        decal.geometry.applyMatrix4(inverseDecalParentMatrix);
        decal.position.set(0, 0, 0);
        decal.rotation.set(0, 0, 0);
        decal.updateMatrix();
        decal.matrixAutoUpdate = false;
        decalParent.add(decal);
      } else {
        scene.add(decal);
      }

      const localPoint = targetMesh.worldToLocal(worldPoint.clone());
      const stampId = `stamp-${Date.now()}-${Math.random()}`;

      paintStampsRef.current.push({
        id: stampId,
        mesh: decal,
        timestamp,
      });

      serializedPaintRef.current.push({
        id: stampId,
        meshPath: meshPath || [],
        point: [localPoint.x, localPoint.y, localPoint.z],
        normal: [localNormal.x, localNormal.y, localNormal.z],
        size: brushSize,
        color: `#${paintColor.getHexString()}`,
        timestamp,
        layer: nextLayer,
        mode: 'decal',
      });
    };

    if (lastPaintPos.current) {
      const start = lastPaintPos.current;
      const distance = start.distanceTo(targetPoint);
      const spacing = Math.max(brushSize * 0.35, 0.01);
      const segments = Math.min(5, Math.max(1, Math.ceil(distance / spacing)));

      for (let i = 1; i <= segments; i += 1) {
        const t = i / segments;
        strokePoint.lerpVectors(start, targetPoint, t);
        addPaintStampAtPoint(strokePoint);
      }
    } else {
      addPaintStampAtPoint(targetPoint);
    }

    while (Number.isFinite(BASE_MODEL_PAINT_STAMP_LIMIT) && paintStampsRef.current.length > BASE_MODEL_PAINT_STAMP_LIMIT) {
      const removedStamp = paintStampsRef.current.shift();
      if (removedStamp) {
        serializedPaintRef.current = serializedPaintRef.current.filter(
          (stamp) => stamp.id !== removedStamp.id
        );
        disposeStamp(removedStamp);
      }
    }

    emitPaintState(false);

    lastPaintTime.current = nowMs;
    if (!lastPaintPos.current) lastPaintPos.current = new THREE.Vector3();
    lastPaintPos.current.copy(targetPoint);
  });

  return null;
}

// Main scene content
function SceneContent({
  modelUrl,
  modelFileType,
  modelConfigs,
  handLandmarks,
  grabState,
  debugInfo,
  targetQuaternion,
  paintMode,
  paintColor,
  brushSize,
  isEraser,
  isBucketFill = false,
  isRemoveTool = false,
  mirrorX = true,
  stateVersion = 0,
  debugMode,
  onCanvasReady,
  initialPaintState,
  onPaintStateChange,
  initialSceneState,
  onSceneStateChange,
  spawnObjectRequest,
  puzzlePieceSpawnRequest,
  selectedModelId,
  groupBaseModels = false,
  puzzlePieces = 0,
  initialModelState,
  onModelStateChange,
  initialGroupState,
  onGroupStateChange,
  initialPuzzleState,
  onPuzzleStateChange,
}: ARSceneV2Props) {
  const anchorRef = useRef<THREE.Group | null>(null);
  const objectRootRef = useRef<THREE.Group | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const modelRefsByIdRef = useRef<Map<string, React.RefObject<THREE.Group | null>>>(new Map());
  const puzzleStateByModelRef = useRef<Map<string, SerializedPuzzlePiece[]>>(new Map());
  const [modelReadyTick, setModelReadyTick] = useState(0);
  const [isMovingSceneObject, setIsMovingSceneObject] = useState(false);
  const [isMovingPuzzlePiece, setIsMovingPuzzlePiece] = useState(false);
  const [isMovingBaseModel, setIsMovingBaseModel] = useState(false);
  const [puzzleReadyTick, setPuzzleReadyTick] = useState(0);
  const normalizedPuzzlePieces = normalizePuzzlePieceCount(puzzlePieces);
  const baseModels = useMemo(
    () => normalizeBaseModelConfigs(modelConfigs, modelUrl, modelFileType),
    [modelConfigs, modelFileType, modelUrl]
  );
  const isMultiModel = baseModels.length > 1;
  const groupMultiModelControls = groupBaseModels && isMultiModel && normalizedPuzzlePieces === 0;
  const normalizedInitialGroupState = useMemo(
    () => normalizeSerializedGroupTransform(initialGroupState),
    [initialGroupState]
  );
  const baseModelIds = useMemo(() => (
    baseModels.map((model) => model.instanceId || model.id)
  ), [baseModels]);
  const normalizedInitialModelState = useMemo(
    () => normalizeSerializedModelState(initialModelState),
    [initialModelState]
  );
  const initialModelStateById = useMemo(() => {
    const stateById = new Map<string, SerializedBaseModelTransform>();
    normalizedInitialModelState.forEach((entry) => {
      stateById.set(entry.id, entry);
    });
    return stateById;
  }, [normalizedInitialModelState]);
  const puzzleSeed = `${baseModels[0]?.modelUrl || modelUrl || '/models/13137_LatinMask1_v1.obj'}:${baseModels[0]?.modelFileType || modelFileType || 'obj'}:${normalizedPuzzlePieces}`;

  const getModelRefObject = useCallback((instanceId: string) => {
    if (!modelRefsByIdRef.current.has(instanceId)) {
      modelRefsByIdRef.current.set(instanceId, { current: null });
    }
    return modelRefsByIdRef.current.get(instanceId)!;
  }, []);

  const handleModelLoad = useCallback((model: THREE.Group) => {
    console.log('Model loaded successfully:', model);
    modelRef.current = model;
    setPuzzleReadyTick(0);
    setModelReadyTick((prev) => prev + 1);
  }, []);

  const handleMultiModelLoad = useCallback((instanceId: string, model: THREE.Group) => {
    console.log('Model loaded successfully:', instanceId, model);
    const refObject = getModelRefObject(instanceId);
    refObject.current = model;
    setPuzzleReadyTick(0);
    setModelReadyTick((prev) => prev + 1);
  }, [getModelRefObject]);

  const emitBaseModelState = useCallback(() => {
    if (!onModelStateChange) return;

    const nextState = baseModels
      .map((model) => {
        const instanceId = model.instanceId || model.id;
        const modelObject = modelRefsByIdRef.current.get(instanceId)?.current;
        return modelObject ? serializeBaseModelTransform(instanceId, modelObject) : null;
      })
      .filter(Boolean) as SerializedBaseModelTransform[];

    if (nextState.length > 0) {
      onModelStateChange(nextState);
    }
  }, [baseModels, onModelStateChange]);

  const emitGroupState = useCallback(() => {
    if (!onGroupStateChange || !anchorRef.current) return;
    onGroupStateChange(serializeGroupTransform(anchorRef.current));
  }, [onGroupStateChange]);

  useEffect(() => {
    if (anchorRef.current) {
      applyGroupTransform(anchorRef.current, normalizedInitialGroupState || DEFAULT_GROUP_TRANSFORM);
    }
  }, [normalizedInitialGroupState, stateVersion]);

  useEffect(() => {
    if (!isMultiModel) return;
    baseModels.forEach((model) => {
      const instanceId = model.instanceId || model.id;
      const transform = initialModelStateById.get(instanceId);
      const modelObject = modelRefsByIdRef.current.get(instanceId)?.current;
      if (modelObject && transform) {
        applyBaseModelTransform(modelObject, transform);
      }
    });
  }, [baseModels, initialModelStateById, isMultiModel, stateVersion]);

  const handleScopedPuzzleStateChange = useCallback((instanceId: string, puzzleState: SerializedPuzzlePiece[]) => {
    puzzleStateByModelRef.current.set(instanceId, puzzleState);
    if (!onPuzzleStateChange) return;
    onPuzzleStateChange(
      baseModels.flatMap((model) =>
        puzzleStateByModelRef.current.get(model.instanceId || model.id) || []
      )
    );
  }, [baseModels, onPuzzleStateChange]);

  const { gl } = useThree();

  useEffect(() => {
    if (onCanvasReady) {
      onCanvasReady(gl.domElement);
    }
  }, [gl, onCanvasReady]);

  return (
    <>
      <Lighting />

      {/* World-anchored AR content */}
      <group ref={anchorRef} position={[0, 0, -3]}>
        {isMultiModel ? (
          <group ref={modelGroupRef}>
            {baseModels.map((model, index) => (
              <SceneModelLoader
                key={model.instanceId || model.id}
                model={model}
                position={getMultiModelPosition(index, baseModels.length)}
                scale={1.25}
                initialTransform={initialModelStateById.get(model.instanceId || model.id)}
                onModelLoad={handleMultiModelLoad}
              />
            ))}
          </group>
        ) : (
          <ModelLoader
            url={baseModels[0]?.modelUrl || modelUrl || '/models/13137_LatinMask1_v1.obj'}
            fileType={baseModels[0]?.modelFileType || modelFileType || undefined}
            position={[0, 0, 0]}
            scale={1.5}
            onLoad={handleModelLoad}
          />
        )}
        <group ref={objectRootRef} position={[0, 0, 0]} />
      </group>

      {/* Hand skeleton visualization */}
      {debugMode && (
        <HandSkeleton
          landmarks={handLandmarks}
          isGrabbing={grabState.isGrabbing}
          mirrorX={mirrorX}
        />
      )}

      {/* Model rotation controller */}
      <ModelRotationController
        anchorRef={anchorRef}
        targetQuaternion={targetQuaternion}
        isGrabbing={grabState.isGrabbing && !(isMultiModel && normalizedPuzzlePieces === 0 && !groupMultiModelControls)}
        onTransformChange={emitGroupState}
      />

      <PinchMoveController
        anchorRef={anchorRef}
        palmCenter={grabState.currentPosition}
        isPinching={grabState.isPinching}
        disabled={isMovingSceneObject || isMovingPuzzlePiece || isMovingBaseModel || (normalizedPuzzlePieces > 0 && !paintMode && !groupBaseModels) || (isMultiModel && normalizedPuzzlePieces === 0 && !groupMultiModelControls)}
        onTransformChange={emitGroupState}
      />

      <ZoomController
        anchorRef={anchorRef}
        isZooming={grabState.isZooming}
        zoomDelta={grabState.zoomDelta}
        disabled={isMovingPuzzlePiece || isMovingSceneObject || isMovingBaseModel || (isMultiModel && normalizedPuzzlePieces === 0 && !groupMultiModelControls)}
        onTransformChange={emitGroupState}
      />

      {isMultiModel && normalizedPuzzlePieces === 0 && !groupMultiModelControls && (
        <MultiModelMoveController
          modelIds={baseModelIds}
          modelRefsByIdRef={modelRefsByIdRef}
          selectedModelId={selectedModelId}
          handLandmarks={handLandmarks}
          isPinching={grabState.isPinching}
          palmCenter={grabState.currentPosition}
          isGrabbing={grabState.isGrabbing}
          isZooming={grabState.isZooming}
          zoomDelta={grabState.zoomDelta}
          disabled={paintMode || isMovingSceneObject || isMovingPuzzlePiece}
          onModelMoveActiveChange={setIsMovingBaseModel}
          onModelTransformChange={emitBaseModelState}
        />
      )}

      <SceneObjectSystem
        objectRootRef={objectRootRef}
        initialSceneState={initialSceneState}
        onSceneStateChange={onSceneStateChange}
        spawnObjectRequest={spawnObjectRequest}
        handLandmarks={handLandmarks}
        isPinching={grabState.isPinching}
        isRemoveTool={isRemoveTool}
        canPaintObjects={paintMode && !isRemoveTool}
        paintColor={paintColor}
        brushSize={brushSize}
        isEraser={isEraser}
        isBucketFill={isBucketFill}
        stateVersion={stateVersion}
        palmCenter={grabState.currentPosition}
        onObjectMoveActiveChange={setIsMovingSceneObject}
        mirrorX={mirrorX}
        movementDisabled={groupBaseModels}
      />

      {isMultiModel ? (
        baseModels.map((model) => (
          <ScopedPuzzlePieceSystem
            key={`puzzle-${model.instanceId || model.id}`}
            model={model}
            modelRef={getModelRefObject(model.instanceId || model.id)}
            modelReadyTick={modelReadyTick}
            puzzlePieces={normalizedPuzzlePieces}
            initialPuzzleState={initialPuzzleState}
            onScopedPuzzleStateChange={handleScopedPuzzleStateChange}
            puzzlePieceSpawnRequest={puzzlePieceSpawnRequest}
            handLandmarks={handLandmarks}
            isPinching={grabState.isPinching}
            isRemoveTool={isRemoveTool}
            stateVersion={stateVersion}
            palmCenter={grabState.currentPosition}
            editingEnabled={!paintMode && !groupBaseModels}
            disabled={isMovingSceneObject || groupBaseModels}
            onPuzzleMoveActiveChange={setIsMovingPuzzlePiece}
            onPuzzleReady={() => setPuzzleReadyTick((prev) => prev + 1)}
            mirrorX={mirrorX}
          />
        ))
      ) : (
        <PuzzlePieceSystem
          modelRef={modelRef}
          modelReadyTick={modelReadyTick}
          puzzlePieces={normalizedPuzzlePieces}
          puzzleSeed={puzzleSeed}
          initialPuzzleState={initialPuzzleState}
          onPuzzleStateChange={onPuzzleStateChange}
          puzzlePieceSpawnRequest={puzzlePieceSpawnRequest}
          handLandmarks={handLandmarks}
          isPinching={grabState.isPinching}
          isRemoveTool={isRemoveTool}
          stateVersion={stateVersion}
          palmCenter={grabState.currentPosition}
          editingEnabled={!paintMode && !groupBaseModels}
          disabled={isMovingSceneObject || groupBaseModels}
          onPuzzleMoveActiveChange={setIsMovingPuzzlePiece}
          onPuzzleReady={() => setPuzzleReadyTick((prev) => prev + 1)}
          mirrorX={mirrorX}
        />
      )}

      {/* Paint system */}
      <PaintSystem
        anchorRef={anchorRef}
        modelRef={isMultiModel ? modelGroupRef : modelRef}
        modelReadyTick={normalizedPuzzlePieces > 0 ? puzzleReadyTick : modelReadyTick}
        initialPaintState={initialPaintState}
        onPaintStateChange={onPaintStateChange}
        handLandmarks={handLandmarks}
        isGrabbing={grabState.isGrabbing}
        isPinching={grabState.isPinching}
        paintMode={paintMode}
        paintColor={paintColor}
        brushSize={brushSize}
        isEraser={isEraser}
        isBucketFill={isBucketFill}
        isRemoveTool={isRemoveTool}
        paintOcclusionRefs={[objectRootRef]}
        stateVersion={stateVersion}
        mirrorX={mirrorX}
      />

      {/* Debug controls */}
      {debugMode && <OrbitControls />}
    </>
  );
}

export function ARSceneV2(props: ARSceneV2Props) {
  return (
    <Canvas
      dpr={[1, 1.25]}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 1,
        pointerEvents: props.debugMode ? 'auto' : 'none',
      }}
      gl={{
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      }}
      camera={{ fov: 60, near: 0.1, far: 1000, position: [0, 0, 0] }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
      }}
    >
      <SceneContent {...props} />
    </Canvas>
  );
}
