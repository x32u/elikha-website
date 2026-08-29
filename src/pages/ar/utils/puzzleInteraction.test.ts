import { describe, expect, test } from '@jest/globals';
import { getPuzzleInteractionPoint } from './puzzleInteraction';

describe('puzzle interaction pointer', () => {
  test('uses the pinch midpoint when pinching', () => {
    const point = getPuzzleInteractionPoint({
      isPinching: true,
      handLandmarks: {
        indexTip: { x: 0.2, y: 0.4 },
        thumbTip: { x: 0.4, y: 0.6 },
      },
    });
    expect(point?.x).toBeCloseTo(0.3);
    expect(point?.y).toBe(0.5);
  });

  test('does not let a closed fist claim an individual puzzle piece', () => {
    expect(getPuzzleInteractionPoint({
      isPinching: false,
      handLandmarks: null,
    })).toBeNull();
  });

  test('does not claim a pointer without an active gesture', () => {
    expect(getPuzzleInteractionPoint({
      isPinching: false,
    })).toBeNull();
  });
});
