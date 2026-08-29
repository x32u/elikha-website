import {
  BASE_MODEL_PAINT_STAMP_LIMIT,
  SCENE_OBJECT_PAINT_STAMP_LIMIT,
} from './performanceLimits';

describe('AR mobile performance limits', () => {
  test('paint decal limits are finite positive integers', () => {
    [BASE_MODEL_PAINT_STAMP_LIMIT, SCENE_OBJECT_PAINT_STAMP_LIMIT].forEach((limit) => {
      expect(Number.isFinite(limit)).toBe(true);
      expect(Number.isInteger(limit)).toBe(true);
      expect(limit).toBeGreaterThan(0);
    });
  });

  test('base-model painting has a larger budget than added scene objects', () => {
    expect(BASE_MODEL_PAINT_STAMP_LIMIT).toBeGreaterThan(
      SCENE_OBJECT_PAINT_STAMP_LIMIT
    );
  });
});

