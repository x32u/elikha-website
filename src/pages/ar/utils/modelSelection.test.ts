import * as THREE from 'three';
import { describe, expect, test } from '@jest/globals';
import { canDirectlyManipulateModel, resolvePinchedModelId } from './modelSelection';

const hit = (object: THREE.Object3D, distance: number): THREE.Intersection => ({
  distance,
  point: new THREE.Vector3(),
  object,
});

describe('resolvePinchedModelId', () => {
  test('moves a newly selected toolbar copy on the first pinch without rotation', () => {
    const id = 'bottle::copy::new';
    const models = new Map([[id, new THREE.Group()]]);
    expect(resolvePinchedModelId([], models, id)).toBe(id);
    expect(resolvePinchedModelId([], models)).toBeNull();
    expect(resolvePinchedModelId([], models, 'not-loaded')).toBeNull();
  });

  test('selected-model fallback does not grab through a foreground object', () => {
    const foreground = new THREE.Mesh();
    foreground.userData.sceneObjectId = 'shape';
    expect(resolvePinchedModelId([hit(foreground, 1)], new Map([['bottle', new THREE.Group()]]), 'bottle')).toBeNull();
  });

  test('a direct hit selects another model instead of the toolbar selection', () => {
    const other = new THREE.Mesh();
    expect(resolvePinchedModelId([hit(other, 1)], new Map<string, THREE.Object3D>([['bottle', new THREE.Group()], ['other', other]]), 'bottle')).toBe('other');
  });
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
