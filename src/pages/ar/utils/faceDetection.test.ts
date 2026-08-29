import { describe, expect, test } from '@jest/globals';
import { countConfidentFaces, MIN_FACE_CONFIDENCE } from './faceDetection';

describe('face detection confidence filtering', () => {
  test('counts only confident detections', () => {
    expect(countConfidentFaces([
      { categories: [{ score: MIN_FACE_CONFIDENCE }] },
      { categories: [{ score: 0.77 }] },
      { categories: [] },
    ])).toBe(1);
  });

  test('returns zero for missing or malformed scores', () => {
    expect(countConfidentFaces([
      {},
      { categories: [{ score: Number.NaN }] },
      { categories: [{ score: undefined }] },
    ])).toBe(0);
  });

  test('does not mutate detector output', () => {
    const detections = [{ categories: [{ score: 0.9 }] }];
    expect(countConfidentFaces(detections)).toBe(1);
    expect(detections).toEqual([{ categories: [{ score: 0.9 }] }]);
  });
});
