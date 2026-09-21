// Painting is learner work, so completed marks must never be discarded to meet
// a rendering budget. Decals use a shared brush texture and throttled state
// persistence; both limits intentionally remain unbounded.
export const SCENE_OBJECT_PAINT_STAMP_LIMIT = Number.POSITIVE_INFINITY;
export const BASE_MODEL_PAINT_STAMP_LIMIT = Number.POSITIVE_INFINITY;
