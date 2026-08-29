export const PRACTICE_LEVELS = Object.freeze([
  Object.freeze({
    id: 'easy',
    label: 'Easy',
    icon: '🎨',
    summary: 'Color only',
    description: 'Practice painting, bucket fill, and erasing on a complete model.',
    puzzlePieces: 0,
    allowedTools: Object.freeze(['paint', 'bucket', 'eraser']),
    tools: Object.freeze(['Paint and brush', 'Bucket fill', 'Eraser', 'Undo and redo', 'Voice assistance']),
  }),
  Object.freeze({
    id: 'medium',
    label: 'Medium',
    icon: '🧩',
    summary: 'Puzzle only',
    description: 'Practice moving and snapping three puzzle pieces. Pinch to move; make a fist to rotate the puzzle.',
    puzzlePieces: 3,
    allowedTools: Object.freeze(['move']),
    tools: Object.freeze(['Pinch to move puzzle pieces', 'Fist to rotate the trace and finished puzzle', '3-piece snap practice', 'Undo and redo', 'Voice assistance']),
  }),
  Object.freeze({
    id: 'advanced',
    label: 'Advanced',
    icon: '✨',
    summary: 'Color and puzzle',
    description: 'Color a four-piece puzzle, move and snap every part, then rotate the finished puzzle with a fist.',
    puzzlePieces: 4,
    allowedTools: Object.freeze(['move', 'paint', 'bucket', 'eraser']),
    tools: Object.freeze(['Paint and bucket fill', 'Eraser', '4-piece puzzle', 'Pinch to move and snap', 'Fist to rotate the trace and finished puzzle', 'Undo and redo', 'Voice assistance']),
  }),
]);

export const DEFAULT_PRACTICE_LEVEL_ID = 'easy';

export const getPracticeLevel = (levelId) => (
  PRACTICE_LEVELS.find((level) => level.id === levelId) || PRACTICE_LEVELS[0]
);
