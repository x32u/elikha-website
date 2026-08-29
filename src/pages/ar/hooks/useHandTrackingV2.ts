import { useEffect, useRef, useState, useCallback } from 'react';
import {
  HandLandmarker,
  FilesetResolver,
  type HandLandmarkerResult,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import * as THREE from 'three';
import { isPointingGesture } from '../utils/gestures';

const TASKS_VISION_VERSION = '0.10.32';
const TASKS_VISION_WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const HAND_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// ==================== CONFIGURATION ====================
export const CONFIG = {
  // Sensitivity
  yawSensitivity: 6.0,      // Horizontal movement to yaw rotation (faster)
  pitchSensitivity: 4.0,    // Vertical movement to pitch rotation (boosted to match yaw feel)
  
  // Filtering
  deadzone: 0.015,          // Minimum movement to register
  smoothingAlpha: 0.3,      // EMA smoothing (0=smooth, 1=responsive)
  
  // Gesture timing
  grabDebounceMs: 150,      // Time to confirm fist (120-200ms)
  releaseDebounceMs: 150,   // Time to confirm release

  // Pinch gesture (move)
  pinchThreshold: 0.05,     // Baseline thumb-tip to index-tip distance
  pinchThresholdMin: 0.036,
  pinchThresholdMax: 0.085,
  pinchThresholdFromHandSpan: 0.38,
  pinchReleaseMultiplier: 1.35,
  pinchDebounceMs: 120,
  pinchReleaseDebounceMs: 120,

  // Zoom gesture (two fists)
  zoomDebounceMs: 150,
  zoomReleaseDebounceMs: 150,
  zoomSensitivity: 6.0,     // Fist distance delta -> world z delta
  zoomClamp: 2.5,           // Max z delta from zoom gesture
  
  // Rotation
  slerpFactor: 0.25,        // Quaternion interpolation speed
  pitchClamp: 1.2,          // Max pitch in radians (~69°)

  // Depth proxy (hand size based)
  handWidthBaseline: 0.15,  // Typical index->pinky width at neutral distance
  handDepthScale: 2.0,      // Scale factor for depth proxy
  
  // Tracking
  handLostTimeoutMs: 250,   // Freeze rotation if hand lost briefly
  // A thumb can be partly hidden behind the other fingers in a natural fist.
  // Requiring three curled fingers (including the index) keeps the gesture
  // reliable for smaller hands and mobile cameras without confusing an open
  // palm, which has no curled fingers.
  minFingersCurled: 3,
};

// ==================== TYPES ====================
export interface HandLandmarks {
  wrist: NormalizedLandmark;
  thumbCmc: NormalizedLandmark;
  thumbMcp: NormalizedLandmark;
  thumbIp: NormalizedLandmark;
  thumbTip: NormalizedLandmark;
  indexMcp: NormalizedLandmark;
  indexPip: NormalizedLandmark;
  indexDip: NormalizedLandmark;
  indexTip: NormalizedLandmark;
  middleMcp: NormalizedLandmark;
  middlePip: NormalizedLandmark;
  middleDip: NormalizedLandmark;
  middleTip: NormalizedLandmark;
  ringMcp: NormalizedLandmark;
  ringPip: NormalizedLandmark;
  ringDip: NormalizedLandmark;
  ringTip: NormalizedLandmark;
  pinkyMcp: NormalizedLandmark;
  pinkyPip: NormalizedLandmark;
  pinkyDip: NormalizedLandmark;
  pinkyTip: NormalizedLandmark;
  allLandmarks: NormalizedLandmark[];
  worldLandmarks: NormalizedLandmark[] | null;
}

export interface PalmPosition {
  x: number;  // Normalized camera space (mirrored)
  y: number;  // Normalized camera space
  z: number;  // Estimated depth (from world landmarks or hand size proxy)
}

export interface GrabState {
  isGrabbing: boolean;
  isPinching: boolean;
  isZooming: boolean;
  grabStartPosition: PalmPosition | null;
  pinchStartPosition: PalmPosition | null;
  grabStartQuat: THREE.Quaternion | null;
  currentPosition: PalmPosition | null;
  dx: number;  // Delta from grab start
  dy: number;
  dz: number;
  zoomDelta: number;
  yawAngle: number;
  pitchAngle: number;
}

export interface DebugInfo {
  palmCenter: PalmPosition | null;
  fingersCurled: number;
  isFistRaw: boolean;
  isPinchRaw: boolean;
  grabActive: boolean;
  pinchActive: boolean;
  dx: number;
  dy: number;
  dz: number;
  pinchDistance: number;
  zoomActive: boolean;
  zoomDistance: number;
  yawAngle: number;
  pitchAngle: number;
  handLost: boolean;
  fps: number;
}

export interface HandTrackingStateV2 {
  status: 'loading' | 'ready' | 'error';
  error: string;
  isTracking: boolean;
  landmarks: HandLandmarks | null;
  landmarksB: HandLandmarks | null;
  grabState: GrabState;
  debugInfo: DebugInfo;
  targetQuaternion: THREE.Quaternion;
}

// ==================== UTILITIES ====================

function distance3D(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function distance2D(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function distance2DPos(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Calculate palm center as average of wrist, index_mcp, middle_mcp, pinky_mcp
function calculatePalmCenter(
  landmarks: HandLandmarks,
  _worldLandmarks: NormalizedLandmark[] | null,
  mirrorX: boolean
): PalmPosition {
  const { wrist, indexMcp, middleMcp, pinkyMcp } = landmarks;
  
  // Average position for stability
  const x = (wrist.x + indexMcp.x + middleMcp.x + pinkyMcp.x) / 4;
  const y = (wrist.y + indexMcp.y + middleMcp.y + pinkyMcp.y) / 4;
  
  // Approximate z using hand size (distance between index_mcp and pinky_mcp)
  // Larger hand size = closer to camera = smaller z (more negative)
  const handWidth = distance2D(indexMcp, pinkyMcp);
  const z = -(handWidth - CONFIG.handWidthBaseline) * CONFIG.handDepthScale;
  
  // Mirror X only for front-facing camera (user moves right = positive x in world)
  // Back camera raw coordinates already match the visual direction
  return {
    x: mirrorX ? 1 - x : x,
    y,
    z,
  };
}

// Check if a finger is curled by comparing tip-to-mcp vs pip-to-mcp distances
function isFingerCurled(
  mcp: NormalizedLandmark,
  pip: NormalizedLandmark,
  tip: NormalizedLandmark,
  palmCenter: PalmPosition,
  mirrorX = true
): boolean {
  const tipToMcp = distance3D(tip, mcp);
  const pipToMcp = distance3D(pip, mcp);
  
  // Finger is curled if tip is closer to mcp than pip is
  // Or if tip is very close to palm center
  // palmCenter is exposed in display space. Convert it back to raw landmark
  // space before comparing it with MediaPipe's raw tip coordinates; otherwise
  // a back-camera session can classify a normal hand as a fist (or miss one).
  const palmX = mirrorX ? 1 - palmCenter.x : palmCenter.x;
  const tipToPalm = Math.sqrt(
    Math.pow(tip.x - palmX, 2) +
    Math.pow(tip.y - palmCenter.y, 2)
  );
  
  return tipToMcp < pipToMcp * 1.3 || tipToPalm < 0.08;
}

// Check if thumb is curled (different geometry)
function isThumbCurled(
  thumbTip: NormalizedLandmark,
  thumbIp: NormalizedLandmark,
  indexMcp: NormalizedLandmark
): boolean {
  // Thumb is curled if tip is close to index mcp
  const tipToIndex = distance3D(thumbTip, indexMcp);
  const ipToIndex = distance3D(thumbIp, indexMcp);
  return tipToIndex < ipToIndex * 1.2;
}

// Detect fist gesture using finger curl analysis
function detectFist(landmarks: HandLandmarks, mirrorX = true): { isFist: boolean; fingersCurled: number } {
  const palmCenter = calculatePalmCenter(landmarks, null, mirrorX);
  
  const indexCurled = isFingerCurled(landmarks.indexMcp, landmarks.indexPip, landmarks.indexTip, palmCenter, mirrorX);
  const curled = [
    indexCurled,
    isFingerCurled(landmarks.middleMcp, landmarks.middlePip, landmarks.middleTip, palmCenter, mirrorX),
    isFingerCurled(landmarks.ringMcp, landmarks.ringPip, landmarks.ringTip, palmCenter, mirrorX),
    isFingerCurled(landmarks.pinkyMcp, landmarks.pinkyPip, landmarks.pinkyTip, palmCenter, mirrorX),
    isThumbCurled(landmarks.thumbTip, landmarks.thumbIp, landmarks.indexMcp),
  ];
  
  const fingersCurled = curled.filter(Boolean).length;
  return {
    isFist: indexCurled && fingersCurled >= CONFIG.minFingersCurled,
    fingersCurled,
  };
}

// Apply deadzone to a value
function applyDeadzone(value: number, deadzone: number): number {
  if (Math.abs(value) < deadzone) return 0;
  const sign = value > 0 ? 1 : -1;
  return sign * (Math.abs(value) - deadzone);
}

// ==================== MAIN HOOK ====================

export function useHandTrackingV2(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  mirrorX = true
): HandTrackingStateV2 {
  const [state, setState] = useState<HandTrackingStateV2>({
    status: 'loading',
    error: '',
    isTracking: false,
    landmarks: null,
    landmarksB: null,
    grabState: {
      isGrabbing: false,
      isPinching: false,
      isZooming: false,
      grabStartPosition: null,
      pinchStartPosition: null,
      grabStartQuat: null,
      currentPosition: null,
      dx: 0,
      dy: 0,
      dz: 0,
      zoomDelta: 0,
      yawAngle: 0,
      pitchAngle: 0,
    },
    debugInfo: {
      palmCenter: null,
      fingersCurled: 0,
      isFistRaw: false,
      isPinchRaw: false,
      grabActive: false,
      pinchActive: false,
      dx: 0,
      dy: 0,
      dz: 0,
      pinchDistance: 0,
      zoomActive: false,
      zoomDistance: 0,
      yawAngle: 0,
      pitchAngle: 0,
      handLost: false,
      fps: 0,
    },
    targetQuaternion: new THREE.Quaternion(),
  });

  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const animationFrameRef = useRef<number>(0);
  
  // Smoothed palm positions
  const smoothedPalmRef = useRef<PalmPosition>({ x: 0.5, y: 0.5, z: 0 });
  const smoothedPalmRefB = useRef<PalmPosition>({ x: 0.5, y: 0.5, z: 0 });
  
  // Grab state refs for debouncing
  const fistStartTimeRef = useRef<number>(0);
  const releaseStartTimeRef = useRef<number>(0);
  const isGrabbingRef = useRef<boolean>(false);
  const grabStartPositionRef = useRef<PalmPosition | null>(null);
  const grabStartQuatRef = useRef<THREE.Quaternion>(new THREE.Quaternion());
  const currentQuatRef = useRef<THREE.Quaternion>(new THREE.Quaternion());
  const pinchStartTimeRef = useRef<number>(0);
  const pinchReleaseStartTimeRef = useRef<number>(0);
  const isPinchingRef = useRef<boolean>(false);
  const pinchStartPositionRef = useRef<PalmPosition | null>(null);
  const zoomStartTimeRef = useRef<number>(0);
  const zoomReleaseStartTimeRef = useRef<number>(0);
  const isZoomingRef = useRef<boolean>(false);
  const zoomStartDistanceRef = useRef<number>(0);
  const lastZoomDeltaRef = useRef<number>(0);
  
  // Hand lost tracking
  const lastHandSeenRef = useRef<number>(0);
  const lastTargetQuatRef = useRef<THREE.Quaternion>(new THREE.Quaternion());
  
  // FPS tracking
  const frameCountRef = useRef<number>(0);
  const lastFpsUpdateRef = useRef<number>(0);
  const fpsRef = useRef<number>(0);

  // Process results from HandLandmarker
  const processResults = useCallback((result: HandLandmarkerResult, timestamp: number) => {
    const now = Date.now();
    
    // FPS calculation
    frameCountRef.current++;
    if (now - lastFpsUpdateRef.current > 1000) {
      fpsRef.current = frameCountRef.current;
      frameCountRef.current = 0;
      lastFpsUpdateRef.current = now;
    }

    if (!result.landmarks || result.landmarks.length === 0) {
      // Hand lost
      const timeSinceSeen = now - lastHandSeenRef.current;
      
      if (timeSinceSeen > CONFIG.handLostTimeoutMs) {
        // End grab if hand lost too long
        isGrabbingRef.current = false;
        grabStartPositionRef.current = null;
        fistStartTimeRef.current = 0;
        releaseStartTimeRef.current = 0;
        isPinchingRef.current = false;
        pinchStartTimeRef.current = 0;
        pinchReleaseStartTimeRef.current = 0;
        pinchStartPositionRef.current = null;
        isZoomingRef.current = false;
        zoomStartTimeRef.current = 0;
        zoomReleaseStartTimeRef.current = 0;
        zoomStartDistanceRef.current = 0;
        lastZoomDeltaRef.current = 0;
      }
      
      setState(prev => ({
        ...prev,
        isTracking: false,
        landmarks: null,
        landmarksB: null,
        grabState: {
          ...prev.grabState,
          isGrabbing: isGrabbingRef.current,
          isPinching: isPinchingRef.current,
          isZooming: isZoomingRef.current,
          currentPosition: null,
        },
        debugInfo: {
          ...prev.debugInfo,
          handLost: true,
          fps: fpsRef.current,
          zoomActive: isZoomingRef.current,
        },
        // Keep last target quaternion when hand is briefly lost
        targetQuaternion: lastTargetQuatRef.current.clone(),
      }));
      return;
    }

    lastHandSeenRef.current = now;
    
    const lm = result.landmarks[0];
    const lmB = result.landmarks[1] ?? null;
    const worldLm = result.worldLandmarks?.[0] ?? null;
    const worldLmB = result.worldLandmarks?.[1] ?? null;
    
    const landmarks: HandLandmarks = {
      wrist: lm[0],
      thumbCmc: lm[1],
      thumbMcp: lm[2],
      thumbIp: lm[3],
      thumbTip: lm[4],
      indexMcp: lm[5],
      indexPip: lm[6],
      indexDip: lm[7],
      indexTip: lm[8],
      middleMcp: lm[9],
      middlePip: lm[10],
      middleDip: lm[11],
      middleTip: lm[12],
      ringMcp: lm[13],
      ringPip: lm[14],
      ringDip: lm[15],
      ringTip: lm[16],
      pinkyMcp: lm[17],
      pinkyPip: lm[18],
      pinkyDip: lm[19],
      pinkyTip: lm[20],
      allLandmarks: lm,
      worldLandmarks: worldLm,
    };
    
    const landmarksB: HandLandmarks | null = lmB ? {
      wrist: lmB[0],
      thumbCmc: lmB[1],
      thumbMcp: lmB[2],
      thumbIp: lmB[3],
      thumbTip: lmB[4],
      indexMcp: lmB[5],
      indexPip: lmB[6],
      indexDip: lmB[7],
      indexTip: lmB[8],
      middleMcp: lmB[9],
      middlePip: lmB[10],
      middleDip: lmB[11],
      middleTip: lmB[12],
      ringMcp: lmB[13],
      ringPip: lmB[14],
      ringDip: lmB[15],
      ringTip: lmB[16],
      pinkyMcp: lmB[17],
      pinkyPip: lmB[18],
      pinkyDip: lmB[19],
      pinkyTip: lmB[20],
      allLandmarks: lmB,
      worldLandmarks: worldLmB ?? null,
    } : null;

    // Calculate palm center
    const rawPalmCenter = calculatePalmCenter(landmarks, worldLm, mirrorX);
    
    // Apply EMA smoothing
    smoothedPalmRef.current = {
      x: smoothedPalmRef.current.x + CONFIG.smoothingAlpha * (rawPalmCenter.x - smoothedPalmRef.current.x),
      y: smoothedPalmRef.current.y + CONFIG.smoothingAlpha * (rawPalmCenter.y - smoothedPalmRef.current.y),
      z: smoothedPalmRef.current.z + CONFIG.smoothingAlpha * (rawPalmCenter.z - smoothedPalmRef.current.z),
    };
    const palmCenter = smoothedPalmRef.current;

    let palmCenterB: PalmPosition | null = null;
    if (landmarksB) {
      const rawPalmCenterB = calculatePalmCenter(landmarksB, worldLmB ?? null, mirrorX);
      smoothedPalmRefB.current = {
        x: smoothedPalmRefB.current.x + CONFIG.smoothingAlpha * (rawPalmCenterB.x - smoothedPalmRefB.current.x),
        y: smoothedPalmRefB.current.y + CONFIG.smoothingAlpha * (rawPalmCenterB.y - smoothedPalmRefB.current.y),
        z: smoothedPalmRefB.current.z + CONFIG.smoothingAlpha * (rawPalmCenterB.z - smoothedPalmRefB.current.z),
      };
      palmCenterB = smoothedPalmRefB.current;
    }

    // Detect fist
    const fistInfo = detectFist(landmarks, mirrorX);
    const isPointing = isPointingGesture(landmarks);
    const isFist = fistInfo.isFist && !isPointing;
    const fingersCurled = fistInfo.fingersCurled;
    const isFistB = landmarksB ? detectFist(landmarksB, mirrorX).isFist : false;

    // Zoom detection (two fists)
    const zoomRaw = isFist && isFistB && !!palmCenterB;
    const zoomDistance = palmCenterB ? distance2DPos(palmCenter, palmCenterB) : 0;

    if (zoomRaw) {
      zoomReleaseStartTimeRef.current = 0;
      if (!isZoomingRef.current) {
        if (zoomStartTimeRef.current === 0) {
          zoomStartTimeRef.current = now;
        } else if (now - zoomStartTimeRef.current >= CONFIG.zoomDebounceMs) {
          isZoomingRef.current = true;
          zoomStartDistanceRef.current = zoomDistance;
        }
      }
    } else {
      zoomStartTimeRef.current = 0;
      if (isZoomingRef.current) {
        if (zoomReleaseStartTimeRef.current === 0) {
          zoomReleaseStartTimeRef.current = now;
        } else if (now - zoomReleaseStartTimeRef.current >= CONFIG.zoomReleaseDebounceMs) {
          isZoomingRef.current = false;
          zoomStartDistanceRef.current = 0;
          lastZoomDeltaRef.current = 0;
        }
      }
    }

    if (isZoomingRef.current) {
      isGrabbingRef.current = false;
      grabStartPositionRef.current = null;
      fistStartTimeRef.current = 0;
      releaseStartTimeRef.current = 0;
      isPinchingRef.current = false;
      pinchStartTimeRef.current = 0;
      pinchReleaseStartTimeRef.current = 0;
      pinchStartPositionRef.current = null;
    }
    
    // Debounced grab state machine
    if (isFist) {
      releaseStartTimeRef.current = 0;
      if (!isGrabbingRef.current) {
        if (fistStartTimeRef.current === 0) {
          fistStartTimeRef.current = now;
        } else if (now - fistStartTimeRef.current >= CONFIG.grabDebounceMs) {
          // Start grab
          isGrabbingRef.current = true;
          grabStartPositionRef.current = { ...palmCenter };
          grabStartQuatRef.current.copy(currentQuatRef.current);
          // Ensure pinch state resets when rotation begins
          isPinchingRef.current = false;
          pinchStartTimeRef.current = 0;
          pinchReleaseStartTimeRef.current = 0;
          pinchStartPositionRef.current = null;
        }
      }
    } else {
      fistStartTimeRef.current = 0;
      if (isGrabbingRef.current) {
        if (releaseStartTimeRef.current === 0) {
          releaseStartTimeRef.current = now;
        } else if (now - releaseStartTimeRef.current >= CONFIG.releaseDebounceMs) {
          // End grab
          isGrabbingRef.current = false;
          grabStartPositionRef.current = null;
        }
      }
    }

    // Pinch detection (move) - adaptive threshold using hand span (more reliable at different camera distances)
    const pinchDistance = distance2D(landmarks.thumbTip, landmarks.indexTip);
    const handSpan = Math.max(distance2D(landmarks.indexMcp, landmarks.pinkyMcp), 0.001);
    const adaptivePinchThreshold = THREE.MathUtils.clamp(
      Math.max(CONFIG.pinchThreshold, handSpan * CONFIG.pinchThresholdFromHandSpan),
      CONFIG.pinchThresholdMin,
      CONFIG.pinchThresholdMax
    );
    const pinchReleaseThreshold = adaptivePinchThreshold * CONFIG.pinchReleaseMultiplier;
    const isPinchRaw = pinchDistance < adaptivePinchThreshold;
    const isPinchRelease = pinchDistance > pinchReleaseThreshold;

    if (isZoomingRef.current || isGrabbingRef.current || isFist) {
      isPinchingRef.current = false;
      pinchStartTimeRef.current = 0;
      pinchReleaseStartTimeRef.current = 0;
      pinchStartPositionRef.current = null;
    } else if (isPinchRaw) {
      pinchReleaseStartTimeRef.current = 0;
      if (!isPinchingRef.current) {
        if (pinchStartTimeRef.current === 0) {
          pinchStartTimeRef.current = now;
        } else if (now - pinchStartTimeRef.current >= CONFIG.pinchDebounceMs) {
          isPinchingRef.current = true;
          pinchStartPositionRef.current = { ...palmCenter };
        }
      }
    } else if (isPinchRelease) {
      pinchStartTimeRef.current = 0;
      if (isPinchingRef.current) {
        if (pinchReleaseStartTimeRef.current === 0) {
          pinchReleaseStartTimeRef.current = now;
        } else if (now - pinchReleaseStartTimeRef.current >= CONFIG.pinchReleaseDebounceMs) {
          isPinchingRef.current = false;
          pinchStartPositionRef.current = null;
        }
      }
    }

    // Calculate rotation if grabbing
    let dx = 0;
    let dy = 0;
    let dz = 0;
    let yawAngle = 0;
    let pitchAngle = 0;
    let targetQuat = currentQuatRef.current.clone();
    let zoomDelta = 0;

    if (isGrabbingRef.current && grabStartPositionRef.current && !isZoomingRef.current) {
      // Calculate deltas from grab start
      const rawDx = palmCenter.x - grabStartPositionRef.current.x;
      const rawDy = palmCenter.y - grabStartPositionRef.current.y;
      const rawDz = palmCenter.z - grabStartPositionRef.current.z;
      
      // Apply deadzone
      dx = applyDeadzone(rawDx, CONFIG.deadzone);
      dy = applyDeadzone(rawDy, CONFIG.deadzone);
      dz = applyDeadzone(rawDz, CONFIG.deadzone);
      
      // Convert to angles
      yawAngle = -dx * CONFIG.yawSensitivity;
      pitchAngle = THREE.MathUtils.clamp(
        -dy * CONFIG.pitchSensitivity,
        -CONFIG.pitchClamp,
        CONFIG.pitchClamp
      );
      
      // Create rotation quaternions using camera-space axes
      const cameraUp = new THREE.Vector3(0, 1, 0);     // Yaw axis
      const cameraRight = new THREE.Vector3(1, 0, 0);  // Pitch axis
      
      const qYaw = new THREE.Quaternion().setFromAxisAngle(cameraUp, yawAngle);
      const qPitch = new THREE.Quaternion().setFromAxisAngle(cameraRight, pitchAngle);
      
      // Compose: yaw * pitch * grabStartQuat
      targetQuat = qYaw.multiply(qPitch).multiply(grabStartQuatRef.current);
      
      // Slerp toward target for smooth feel
      currentQuatRef.current.slerp(targetQuat, CONFIG.slerpFactor);
      targetQuat = currentQuatRef.current.clone();
    }
    
    if (isZoomingRef.current) {
      if (zoomDistance > 0 && zoomStartDistanceRef.current > 0) {
        // Natural pinch-zoom direction: hands apart zooms in, hands closer zooms out.
        zoomDelta = (zoomDistance - zoomStartDistanceRef.current) * CONFIG.zoomSensitivity;
        zoomDelta = THREE.MathUtils.clamp(zoomDelta, -CONFIG.zoomClamp, CONFIG.zoomClamp);
        lastZoomDeltaRef.current = zoomDelta;
      } else {
        // If the second hand flickers for a frame, keep the last zoom instead of snapping back.
        zoomDelta = lastZoomDeltaRef.current;
      }
    }

    lastTargetQuatRef.current.copy(targetQuat);

    setState({
      status: 'ready',
      error: '',
      isTracking: true,
      landmarks,
      landmarksB,
      grabState: {
        isGrabbing: isGrabbingRef.current,
        isPinching: isPinchingRef.current,
        isZooming: isZoomingRef.current,
        grabStartPosition: grabStartPositionRef.current,
        pinchStartPosition: pinchStartPositionRef.current,
        grabStartQuat: grabStartQuatRef.current.clone(),
        currentPosition: palmCenter,
        dx,
        dy,
        dz,
        zoomDelta,
        yawAngle,
        pitchAngle,
      },
      debugInfo: {
        palmCenter,
        fingersCurled,
        isFistRaw: isFist,
        isPinchRaw,
        grabActive: isGrabbingRef.current,
        pinchActive: isPinchingRef.current,
        dx,
        dy,
        dz,
        pinchDistance,
        zoomActive: isZoomingRef.current,
        zoomDistance,
        yawAngle,
        pitchAngle,
        handLost: false,
        fps: fpsRef.current,
      },
      targetQuaternion: targetQuat,
    });
  }, [mirrorX]);

  // Initialize HandLandmarker
  useEffect(() => {
    let cancelled = false;

    async function initHandLandmarker() {
      try {
        const vision = await FilesetResolver.forVisionTasks(TASKS_VISION_WASM_URL);

        let handLandmarker: HandLandmarker | null = null;
        let lastError: unknown = null;

        for (const delegate of ['GPU', 'CPU'] as const) {
          try {
            handLandmarker = await HandLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: HAND_LANDMARKER_MODEL_URL,
                delegate,
              },
              runningMode: 'VIDEO',
              numHands: 2,
              minHandDetectionConfidence: 0.45,
              minHandPresenceConfidence: 0.45,
              minTrackingConfidence: 0.45,
            });
            console.log(`HandLandmarker initialized with ${delegate} delegate`);
            break;
          } catch (error) {
            lastError = error;
            console.warn(`HandLandmarker ${delegate} delegate failed`, error);
          }
        }

        if (!handLandmarker) {
          throw lastError || new Error('HandLandmarker could not initialize.');
        }

        if (!cancelled) {
          handLandmarkerRef.current = handLandmarker;
          setState((previous) => ({
            ...previous,
            status: 'ready',
            error: '',
          }));
        } else {
          handLandmarker.close();
        }
      } catch (error) {
        console.error('Failed to initialize HandLandmarker:', error);
        setState(prev => ({
          ...prev,
          status: 'error',
          error: 'Hand tracking could not start on this device.',
          isTracking: false,
          landmarks: null,
          landmarksB: null,
          debugInfo: {
            ...prev.debugInfo,
            handLost: true,
          },
        }));
      }
    }

    initHandLandmarker();

    return () => {
      cancelled = true;
      if (handLandmarkerRef.current) {
        handLandmarkerRef.current.close();
      }
    };
  }, []);

  // Run detection loop
  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    let lastVideoTime = -1;
    let active = true;
    let detectionFailed = false;

    function detectFrame() {
      if (!active || detectionFailed) return;
      if (!handLandmarkerRef.current || !video || video.readyState < 2) {
        animationFrameRef.current = requestAnimationFrame(detectFrame);
        return;
      }

      const timestamp = performance.now();
      
      // Only process new frames
      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        
        try {
          const result = handLandmarkerRef.current.detectForVideo(video, timestamp);
          processResults(result, timestamp);
        } catch (error) {
          console.error('Hand detection error:', error);
          detectionFailed = true;
          setState((previous) => ({
            ...previous,
            status: 'error',
            error: 'Hand tracking stopped unexpectedly. Reopen the activity to try again.',
            isTracking: false,
            landmarks: null,
            landmarksB: null,
          }));
          return;
        }
      }

      animationFrameRef.current = requestAnimationFrame(detectFrame);
    }

    // Wait for video to be ready
    const startDetection = () => {
      if (video.readyState >= 2) {
        detectFrame();
      } else {
        video.addEventListener('loadeddata', detectFrame, { once: true });
      }
    };

    startDetection();

    return () => {
      active = false;
      video.removeEventListener('loadeddata', detectFrame);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [videoRef, processResults]);

  return state;
}
