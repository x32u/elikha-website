import * as THREE from 'three';

export interface SerializedBaseModelTransform {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  editingLocked?: boolean;
}

export const BASE_MODEL_EDITING_LOCK_KEY = 'elikhaModelEditingLocked';
export const BASE_MODEL_SELECTION_COLOR = 0x36d7ff;
export const BASE_MODEL_LOCKED_SELECTION_COLOR = 0xffa62b;

function isFiniteVector3Tuple(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
  );
}

export function normalizeSerializedBaseModelState(
  inputState?: SerializedBaseModelTransform[]
): SerializedBaseModelTransform[] {
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
        editingLocked: entry.editingLocked === true,
      } as SerializedBaseModelTransform;
    })
    .filter(Boolean) as SerializedBaseModelTransform[];
}

export function isBaseModelEditingLocked(model: THREE.Object3D | null | undefined): boolean {
  return model?.userData?.[BASE_MODEL_EDITING_LOCK_KEY] === true;
}

export function canTransformBaseModel(model: THREE.Object3D | null | undefined): boolean {
  return Boolean(model && !isBaseModelEditingLocked(model));
}

export function setBaseModelEditingLocked(model: THREE.Object3D, locked: boolean): void {
  model.userData[BASE_MODEL_EDITING_LOCK_KEY] = locked === true;
}

export function toggleBaseModelEditingLocked(model: THREE.Object3D): boolean {
  const nextLocked = !isBaseModelEditingLocked(model);
  setBaseModelEditingLocked(model, nextLocked);
  return nextLocked;
}

export function getBaseModelSelectionColor(locked: boolean): number {
  return locked ? BASE_MODEL_LOCKED_SELECTION_COLOR : BASE_MODEL_SELECTION_COLOR;
}

export function serializeBaseModelTransform(
  id: string,
  model: THREE.Object3D
): SerializedBaseModelTransform {
  return {
    id,
    position: [model.position.x, model.position.y, model.position.z],
    rotation: [model.rotation.x, model.rotation.y, model.rotation.z],
    scale: [model.scale.x, model.scale.y, model.scale.z],
    editingLocked: isBaseModelEditingLocked(model),
  };
}

export function applyBaseModelTransform(
  model: THREE.Object3D,
  transform?: SerializedBaseModelTransform | null
): void {
  if (!transform) return;

  model.position.set(...transform.position);
  model.rotation.set(...transform.rotation);
  model.scale.set(...transform.scale);
  setBaseModelEditingLocked(model, transform.editingLocked === true);
  model.updateMatrixWorld(true);
}
