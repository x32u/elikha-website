// Each paint mark is its own Three.js decal mesh. Finite limits prevent a long
// drawing session from exhausting mobile GPU memory while retaining enough
// marks for detailed student work.
export const SCENE_OBJECT_PAINT_STAMP_LIMIT = 80;
export const BASE_MODEL_PAINT_STAMP_LIMIT = 300;
