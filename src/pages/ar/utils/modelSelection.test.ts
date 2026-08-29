import * as THREE from 'three';
import { describe, expect, test } from '@jest/globals';
import { canDirectlyManipulateModel, resolvePinchedModelId } from './modelSelection';

const hit = (object: THREE.Object3D, distance: number): THREE.Intersection => ({
  distance,
  point: new THREE.Vector3(),
  object,
});

describe('resolvePinchedModelId', () => {
  test('selects the model that owns the nearest hit mesh', () => {
    const model = new THREE.Group();
    const nested = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    model.add(nested);
    nested.add(mesh);

    expect(resolvePinchedModelId([hit(mesh, 1)], new Map([['model-a', model]])))
      .toBe('model-a');
  });

  test('does not select a model through a foreground scene object', () => {
    const sceneObject = new THREE.Group();
    sceneObject.userData.sceneObjectId = 'shape-1';
    const foreground = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    sceneObject.add(foreground);

    const model = new THREE.Group();
    const modelMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    model.add(modelMesh);

    expect(resolvePinchedModelId(
      [hit(foreground, 0.5), hit(modelMesh, 1)],
      new Map([['model-a', model]])
    )).toBeNull();
  });

  test('does not treat a puzzle piece as the whole model', () => {
    const model = new THREE.Group();
    const puzzlePiece = new THREE.Group();
    puzzlePiece.userData.puzzlePieceId = 'piece-0';
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    model.add(puzzlePiece);
    puzzlePiece.add(mesh);

    expect(resolvePinchedModelId([hit(mesh, 1)], new Map([['model-a', model]])))
      .toBeNull();
  });

  test('returns null for an unrelated front-most object', () => {
    const model = new THREE.Group();
    const modelMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    model.add(modelMesh);
    const unrelated = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());

    expect(resolvePinchedModelId(
      [hit(unrelated, 0.25), hit(modelMesh, 1)],
      new Map([['model-a', model]])
    )).toBeNull();
  });
});

describe('canDirectlyManipulateModel', () => {
  test('keeps pinch positioning available while a paint tool is active', () => {
    expect(canDirectlyManipulateModel({
      hasHandLandmarks: true,
      isRemoveTool: false,
      isMovingSceneObject: false,
      isMovingPuzzlePiece: false,
    })).toBe(true);
  });

  test('stops model movement without tracking or during another destructive interaction', () => {
    expect(canDirectlyManipulateModel({
      hasHandLandmarks: false,
      isRemoveTool: false,
      isMovingSceneObject: false,
      isMovingPuzzlePiece: false,
    })).toBe(false);
    expect(canDirectlyManipulateModel({
      hasHandLandmarks: true,
      isRemoveTool: true,
      isMovingSceneObject: false,
      isMovingPuzzlePiece: false,
    })).toBe(false);
  });
});
