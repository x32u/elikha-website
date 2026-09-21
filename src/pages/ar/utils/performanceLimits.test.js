import {
  BASE_MODEL_PAINT_STAMP_LIMIT,
  SCENE_OBJECT_PAINT_STAMP_LIMIT,
} from './performanceLimits';

describe('AR paint retention policy', () => {
  test('never discards completed learner paint because of a stamp limit', () => {
    [BASE_MODEL_PAINT_STAMP_LIMIT, SCENE_OBJECT_PAINT_STAMP_LIMIT].forEach((limit) => {
      expect(limit).toBe(Number.POSITIVE_INFINITY);
    });
  });
});
