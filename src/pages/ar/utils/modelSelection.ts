import * as THREE from 'three';

export type SelectableModelMap = Map<string, THREE.Object3D>;

type DirectModelInteractionState = {
  hasHandLandmarks: boolean;
  isRemoveTool: boolean;
  isMovingSceneObject: boolean;
  isMovingPuzzlePiece: boolean;
};

export function canDirectlyManipulateModel({
  hasHandLandmarks,
  isRemoveTool,
  isMovingSceneObject,
  isMovingPuzzlePiece,
}: DirectModelInteractionState): boolean {
  return Boolean(
    hasHandLandmarks &&
    !isRemoveTool &&
    !isMovingSceneObject &&
    !isMovingPuzzlePiece
  );
}

const isNonModelInteractionRoot = (object: THREE.Object3D): boolean => Boolean(
  object.userData?.sceneObjectId ||
  object.userData?.puzzlePieceId ||
  object.userData?.puzzlePieceGlobalId ||
  object.userData?.isPuzzlePiece
);

/**
 * Resolve a directly pinched model from nearest-first raycast hits.
 *
 * Only the front-most hit is considered. With no hit, Move mode may use its
 * explicit selection. This never selects through a foreground object.
 */
export function resolvePinchedModelId(
  hits: THREE.Intersection[],
  selectableModels: SelectableModelMap,
  selectedModelId: string | null = null
): string | null {
  const firstHit = hits[0];
  // Move mode can grab the explicitly selected toolbar model from empty space.
  // A real foreground hit still wins, so we never grab through another object.
  if (!firstHit && selectedModelId && selectableModels.has(selectedModelId)) return selectedModelId;
  if (!firstHit?.object || selectableModels.size === 0) return null;

  const modelIdByRoot = new Map<THREE.Object3D, string>();
  selectableModels.forEach((model, modelId) => {
    modelIdByRoot.set(model, modelId);
  });

  let current: THREE.Object3D | null = firstHit.object;
  while (current) {
    if (isNonModelInteractionRoot(current)) return null;

    const modelId = modelIdByRoot.get(current);
    if (modelId) return modelId;

    current = current.parent;
  }

  return null;
}
