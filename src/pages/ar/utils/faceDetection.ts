export const MIN_FACE_CONFIDENCE = 0.78;

type FaceDetection = {
  categories?: Array<{ score?: number }>;
};

/**
 * Ignore very low-confidence secondary detections. MediaPipe can briefly
 * produce a faint second box while the learner moves, which should not pause
 * an otherwise usable AR session.
 */
export function countConfidentFaces(detections: FaceDetection[] = []): number {
  return detections.filter((detection) => (
    Number(detection?.categories?.[0]?.score || 0) >= MIN_FACE_CONFIDENCE
  )).length;
}
