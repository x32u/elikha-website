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
 * Only the front-most hit is considered. This deliberately prevents a model
 * from being selected through a foreground primitive or puzzle piece.
 */
export function resolvePinchedModelId(
  hits: THREE.Intersection[],
  selectableModels: SelectableModelMap
): string | null {
  const firstHit = hits[0];
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
