import * as THREE from 'three';
import type { HandLandmarks } from '../hooks/useHandTrackingV2';

const EXTENDED_ANGLE = 2.6; // ~149°
const NON_EXTENDED_ANGLE = 2.45; // ~140°

function distance2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function palmCenter2D(landmarks: HandLandmarks): { x: number; y: number } {
  const { wrist, indexMcp, middleMcp, pinkyMcp } = landmarks;
  return {
    x: (wrist.x + indexMcp.x + middleMcp.x + pinkyMcp.x) / 4,
    y: (wrist.y + indexMcp.y + middleMcp.y + pinkyMcp.y) / 4,
  };
}

function angleAtJoint(
  a: { x: number; y: number; z?: number },
  b: { x: number; y: number; z?: number },
  c: { x: number; y: number; z?: number }
): number | null {
  const v1 = new THREE.Vector3(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
  const v2 = new THREE.Vector3(c.x - b.x, c.y - b.y, (c.z ?? 0) - (b.z ?? 0));
  const len1 = v1.length();
  const len2 = v2.length();
  if (len1 < 1e-6 || len2 < 1e-6) return null;
  const cos = THREE.MathUtils.clamp(v1.dot(v2) / (len1 * len2), -1, 1);
  return Math.acos(cos);
}

function isExtended(angle: number | null, fallback: boolean): boolean {
  if (angle == null) return fallback;
  return angle > EXTENDED_ANGLE;
}

function isNotExtended(angle: number | null, fallback: boolean): boolean {
  if (angle == null) return fallback;
  return angle < NON_EXTENDED_ANGLE;
}

export function isPointingGesture(landmarks: HandLandmarks): boolean {
  const palm = palmCenter2D(landmarks);
  const indexAngle = angleAtJoint(landmarks.indexMcp, landmarks.indexPip, landmarks.indexTip);
  const middleAngle = angleAtJoint(landmarks.middleMcp, landmarks.middlePip, landmarks.middleTip);
  const ringAngle = angleAtJoint(landmarks.ringMcp, landmarks.ringPip, landmarks.ringTip);
  const pinkyAngle = angleAtJoint(landmarks.pinkyMcp, landmarks.pinkyPip, landmarks.pinkyTip);

  const indexExtendedFallback =
    distance2D(landmarks.indexTip, palm) > distance2D(landmarks.indexMcp, palm) * 1.15;
  const middleCurledFallback =
    distance2D(landmarks.middleTip, palm) < distance2D(landmarks.middleMcp, palm) * 1.05;
  const ringCurledFallback =
    distance2D(landmarks.ringTip, palm) < distance2D(landmarks.ringMcp, palm) * 1.05;
  const pinkyCurledFallback =
    distance2D(landmarks.pinkyTip, palm) < distance2D(landmarks.pinkyMcp, palm) * 1.05;

  const indexExtended = isExtended(indexAngle, indexExtendedFallback);
  const curledCount = [
    isNotExtended(middleAngle, middleCurledFallback),
    isNotExtended(ringAngle, ringCurledFallback),
    isNotExtended(pinkyAngle, pinkyCurledFallback),
  ].filter(Boolean).length;

  return indexExtended && curledCount >= 2;
}

export function isThumbsUpGesture(landmarks: HandLandmarks): boolean {
  const palm = palmCenter2D(landmarks);

  const thumbTip = landmarks.thumbTip;
  const thumbIp = landmarks.thumbIp;
  const thumbMcp = landmarks.thumbMcp;

  const thumbUp =
    thumbTip.y < thumbIp.y - 0.01 ||
    thumbTip.y < thumbMcp.y - 0.015 ||
    thumbTip.y < palm.y - 0.02;

  const thumbExtended =
    distance2D(thumbTip, palm) > distance2D(thumbMcp, palm) * 1.03;

  const indexCurled =
    distance2D(landmarks.indexTip, palm) < distance2D(landmarks.indexMcp, palm) * 1.12;
  const middleCurled =
    distance2D(landmarks.middleTip, palm) < distance2D(landmarks.middleMcp, palm) * 1.12;
  const ringCurled =
    distance2D(landmarks.ringTip, palm) < distance2D(landmarks.ringMcp, palm) * 1.12;
  const pinkyCurled =
    distance2D(landmarks.pinkyTip, palm) < distance2D(landmarks.pinkyMcp, palm) * 1.12;

  const curledCount = [indexCurled, middleCurled, ringCurled, pinkyCurled].filter(Boolean).length;
  const indexNotExtended =
    distance2D(landmarks.indexTip, palm) < distance2D(landmarks.indexMcp, palm) * 1.2;

  return thumbUp && thumbExtended && indexNotExtended && curledCount >= 3;
}

function isFingerExtended(
  mcp: { x: number; y: number; z?: number },
  pip: { x: number; y: number; z?: number },
  tip: { x: number; y: number; z?: number },
  palm: { x: number; y: number }
): boolean {
  const angle = angleAtJoint(mcp, pip, tip);
  const fallback = distance2D(tip, palm) > distance2D(mcp, palm) * 1.1;
  return isExtended(angle, fallback);
}

function isThumbExtended(
  mcp: { x: number; y: number; z?: number },
  ip: { x: number; y: number; z?: number },
  tip: { x: number; y: number; z?: number },
  palm: { x: number; y: number }
): boolean {
  const angle = angleAtJoint(mcp, ip, tip);
  const fallback = distance2D(tip, palm) > distance2D(mcp, palm) * 1.05;
  return isExtended(angle, fallback);
}

export function isOpenPalmGesture(landmarks: HandLandmarks): boolean {
  const palm = palmCenter2D(landmarks);

  const indexExtended = isFingerExtended(landmarks.indexMcp, landmarks.indexPip, landmarks.indexTip, palm);
  const middleExtended = isFingerExtended(landmarks.middleMcp, landmarks.middlePip, landmarks.middleTip, palm);
  const ringExtended = isFingerExtended(landmarks.ringMcp, landmarks.ringPip, landmarks.ringTip, palm);
  const pinkyExtended = isFingerExtended(landmarks.pinkyMcp, landmarks.pinkyPip, landmarks.pinkyTip, palm);
  const thumbExtended = isThumbExtended(landmarks.thumbMcp, landmarks.thumbIp, landmarks.thumbTip, palm);

  const v1 = new THREE.Vector3(
    landmarks.indexMcp.x - landmarks.wrist.x,
    landmarks.indexMcp.y - landmarks.wrist.y,
    (landmarks.indexMcp.z ?? 0) - (landmarks.wrist.z ?? 0)
  );
  const v2 = new THREE.Vector3(
    landmarks.pinkyMcp.x - landmarks.wrist.x,
    landmarks.pinkyMcp.y - landmarks.wrist.y,
    (landmarks.pinkyMcp.z ?? 0) - (landmarks.wrist.z ?? 0)
  );
  const normal = new THREE.Vector3().crossVectors(v1, v2);
  const palmFacingCamera = Math.abs(normal.z) > Math.abs(normal.x) && Math.abs(normal.z) > Math.abs(normal.y);

  return thumbExtended && indexExtended && middleExtended && ringExtended && pinkyExtended && palmFacingCamera;
}

export function isMiddleFingerGesture(landmarks: HandLandmarks): boolean {
  const palm = palmCenter2D(landmarks);

  const indexExtended = isFingerExtended(landmarks.indexMcp, landmarks.indexPip, landmarks.indexTip, palm);
  const middleExtended = isFingerExtended(landmarks.middleMcp, landmarks.middlePip, landmarks.middleTip, palm);
  const ringExtended = isFingerExtended(landmarks.ringMcp, landmarks.ringPip, landmarks.ringTip, palm);
  const pinkyExtended = isFingerExtended(landmarks.pinkyMcp, landmarks.pinkyPip, landmarks.pinkyTip, palm);
  const thumbExtended = isThumbExtended(landmarks.thumbMcp, landmarks.thumbIp, landmarks.thumbTip, palm);

  const indexCurled = !indexExtended;
  const ringCurled = !ringExtended;
  const pinkyCurled = !pinkyExtended;
  const thumbRetracted = !thumbExtended;

  const middleClearlyDominant =
    landmarks.middleTip.y + 0.015 < landmarks.indexTip.y &&
    landmarks.middleTip.y + 0.015 < landmarks.ringTip.y;

  const curledCount = [indexCurled, ringCurled, pinkyCurled, thumbRetracted].filter(Boolean).length;

  return middleExtended && middleClearlyDominant && curledCount >= 3;
}
