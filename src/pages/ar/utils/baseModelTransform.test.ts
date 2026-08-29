import * as THREE from 'three';
import { describe, expect, test } from '@jest/globals';
import {
  BASE_MODEL_LOCKED_SELECTION_COLOR,
  BASE_MODEL_SELECTION_COLOR,
  applyBaseModelTransform,
  canTransformBaseModel,
  getBaseModelSelectionColor,
  isBaseModelEditingLocked,
  normalizeSerializedBaseModelState,
  serializeBaseModelTransform,
  toggleBaseModelEditingLocked,
} from './baseModelTransform';

describe('base model editing lock persistence', () => {
  test('normalizes legacy state as unlocked and retains an explicit lock', () => {
    const normalized = normalizeSerializedBaseModelState([
      {
        id: 'legacy-model',
        position: [1, 2, 3],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      {
        id: 'locked-model',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [2, 2, 2],
        editingLocked: true,
      },
    ]);

    expect(normalized).toEqual([
      expect.objectContaining({ id: 'legacy-model', editingLocked: false }),
      expect.objectContaining({ id: 'locked-model', editingLocked: true }),
    ]);
  });

  test('applies, toggles, and serializes lock state with the transform', () => {
    const model = new THREE.Group();
    applyBaseModelTransform(model, {
      id: 'model-a',
      position: [1, 2, 3],
      rotation: [0.1, 0.2, 0.3],
      scale: [1.5, 1.5, 1.5],
      editingLocked: true,
    });

    expect(isBaseModelEditingLocked(model)).toBe(true);
    expect(canTransformBaseModel(model)).toBe(false);
    expect(serializeBaseModelTransform('model-a', model)).toEqual({
      id: 'model-a',
      position: [1, 2, 3],
      rotation: [0.1, 0.2, 0.3],
      scale: [1.5, 1.5, 1.5],
      editingLocked: true,
    });

    expect(toggleBaseModelEditingLocked(model)).toBe(false);
    expect(canTransformBaseModel(model)).toBe(true);
    expect(serializeBaseModelTransform('model-a', model).editingLocked).toBe(false);
  });

  test('uses distinct selection colors for locked and unlocked models', () => {
    expect(getBaseModelSelectionColor(false)).toBe(BASE_MODEL_SELECTION_COLOR);
    expect(getBaseModelSelectionColor(true)).toBe(BASE_MODEL_LOCKED_SELECTION_COLOR);
  });
});
