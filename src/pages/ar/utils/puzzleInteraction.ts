export type PuzzlePointerLandmarks = {
  indexTip: { x: number; y: number };
  thumbTip: { x: number; y: number };
};

export type PuzzleInteractionPoint = { x: number; y: number };

/**
 * Puzzle pieces are moved with a pinch. A closed fist is intentionally not a
 * piece-selection gesture because it rotates the whole puzzle assembly.
 */
export function getPuzzleInteractionPoint({
  isPinching,
  handLandmarks,
}: {
  isPinching: boolean;
  handLandmarks?: PuzzlePointerLandmarks | null;
}): PuzzleInteractionPoint | null {
  if (isPinching && handLandmarks) {
    return {
      x: (handLandmarks.indexTip.x + handLandmarks.thumbTip.x) * 0.5,
      y: (handLandmarks.indexTip.y + handLandmarks.thumbTip.y) * 0.5,
    };
  }

  return null;
}
