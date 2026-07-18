import { useEffect, useRef, useState, useCallback } from 'react';
import { Hands } from '@mediapipe/hands';
import type { Results, NormalizedLandmark } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';

export interface HandLandmarks {
  indexTip: NormalizedLandmark;   // Landmark 8
  indexPIP: NormalizedLandmark;   // Landmark 6 (index middle joint)
  indexMCP: NormalizedLandmark;   // Landmark 5 (index knuckle)
  indexDIP: NormalizedLandmark;   // Landmark 7 (index distal joint)
  thumbTip: NormalizedLandmark;   // Landmark 4
  thumbIP: NormalizedLandmark;    // Landmark 3
  thumbMCP: NormalizedLandmark;   // Landmark 2
  middleTip: NormalizedLandmark;  // Landmark 12
  middlePIP: NormalizedLandmark;  // Landmark 10
  middleMCP: NormalizedLandmark;  // Landmark 9
  middleDIP: NormalizedLandmark;  // Landmark 11
  ringTip: NormalizedLandmark;    // Landmark 16
  ringPIP: NormalizedLandmark;    // Landmark 14
  ringMCP: NormalizedLandmark;    // Landmark 13
  pinkyTip: NormalizedLandmark;   // Landmark 20
  pinkyPIP: NormalizedLandmark;   // Landmark 18
  pinkyMCP: NormalizedLandmark;   // Landmark 17
  wrist: NormalizedLandmark;      // Landmark 0
  palmCenter: NormalizedLandmark; // Landmark 9 (middle finger base)
  allLandmarks: NormalizedLandmark[];
}

export type GestureType = 'none' | 'fist' | 'pointing' | 'open' | 'pinch';

export type HandednessLabel = 'Left' | 'Right' | 'Unknown';

export interface TrackedHand {
  landmarks: HandLandmarks;
  gesture: GestureType;
  isGrabbing: boolean;
  isPointing: boolean;
  isPinching: boolean;
  handRotation: HandRotation;
  handedness: HandednessLabel;
  confidence: number;
}

export interface HandRotation {
  roll: number;   // Rotation around forward axis (tilting hand left/right)
  pitch: number;  // Rotation up/down
  yaw: number;    // Rotation left/right
}

export interface HandTrackingState {
  isTracking: boolean;
  landmarks: HandLandmarks | null;
  gesture: GestureType;
  isGrabbing: boolean;    // Fist gesture - for moving object
  isPointing: boolean;    // Index extended, others closed - for painting
  isPinching: boolean;    // Thumb + index close together
  handRotation: HandRotation;  // Hand orientation for rotating objects
  hands: TrackedHand[];   // All tracked hands (max 2)
  confidence: number;     // Tracking confidence 0-1
}

// Calculate distance between two landmarks
function calculateDistance(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z || 0) - (b.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Calculate hand span for normalization (wrist to middle fingertip)
function calculateHandSpan(landmarks: HandLandmarks): number {
  return calculateDistance(landmarks.wrist, landmarks.middleTip);
}

// Check if a finger is curled (bent) by comparing angles
function isFingerCurled(
  mcp: NormalizedLandmark,
  pip: NormalizedLandmark,
  tip: NormalizedLandmark,
  handSpan: number
): boolean {
  // Distance from MCP to tip should be small relative to hand span when curled
  const mcpToTip = calculateDistance(mcp, tip);
  
  // A curled finger has tip close to MCP relative to hand span
  const curlRatio = mcpToTip / handSpan;
  
  // Also check if tip is behind PIP (toward palm)
  const tipBehindPip = tip.y > pip.y - 0.01;
  
  return curlRatio < 0.45 || tipBehindPip;
}

// Check if a finger is extended
function isFingerExtended(
  mcp: NormalizedLandmark,
  pip: NormalizedLandmark,
  tip: NormalizedLandmark,
  handSpan: number
): boolean {
  // Distance from MCP to tip should be large relative to hand span when extended
  const mcpToTip = calculateDistance(mcp, tip);
  const extendRatio = mcpToTip / handSpan;
  
  // Tip should be ahead of PIP (away from palm)
  const tipAheadOfPip = tip.y < pip.y + 0.02 || (tip.z ?? 0) < (pip.z ?? 0) - 0.02;
  
  return extendRatio > 0.35 && tipAheadOfPip;
}

// Check thumb extension (thumb has different geometry)
function isThumbExtended(
  thumbMCP: NormalizedLandmark,
  _thumbIP: NormalizedLandmark,
  thumbTip: NormalizedLandmark,
  indexMCP: NormalizedLandmark
): boolean {
  // Thumb is extended if tip is far from index MCP
  const thumbToIndex = calculateDistance(thumbTip, indexMCP);
  const thumbLength = calculateDistance(thumbMCP, thumbTip);
  
  return thumbToIndex > thumbLength * 0.6;
}

function detectGesture(landmarks: HandLandmarks): GestureType {
  const handSpan = calculateHandSpan(landmarks);
  
  // Check each finger's state
  const indexExtended = isFingerExtended(
    landmarks.indexMCP, landmarks.indexPIP, landmarks.indexTip, handSpan
  );
  const middleExtended = isFingerExtended(
    landmarks.middleMCP, landmarks.middlePIP, landmarks.middleTip, handSpan
  );
  const ringExtended = isFingerExtended(
    landmarks.ringMCP, landmarks.ringPIP, landmarks.ringTip, handSpan
  );
  const pinkyExtended = isFingerExtended(
    landmarks.pinkyMCP, landmarks.pinkyPIP, landmarks.pinkyTip, handSpan
  );
  const thumbExtended = isThumbExtended(
    landmarks.thumbMCP, landmarks.thumbIP, landmarks.thumbTip, landmarks.indexMCP
  );
  
  // Check curled states for fist detection
  const indexCurled = isFingerCurled(
    landmarks.indexMCP, landmarks.indexPIP, landmarks.indexTip, handSpan
  );
  const middleCurled = isFingerCurled(
    landmarks.middleMCP, landmarks.middlePIP, landmarks.middleTip, handSpan
  );
  const ringCurled = isFingerCurled(
    landmarks.ringMCP, landmarks.ringPIP, landmarks.ringTip, handSpan
  );
  const pinkyCurled = isFingerCurled(
    landmarks.pinkyMCP, landmarks.pinkyPIP, landmarks.pinkyTip, handSpan
  );
  
  // Pinch detection - thumb and index tips close together
  const pinchDistance = calculateDistance(landmarks.thumbTip, landmarks.indexTip);
  const normalizedPinchDistance = pinchDistance / handSpan;
  const isPinching = normalizedPinchDistance < 0.28; // Slightly more forgiving
  
  // Calculate palm closure - how closed is the hand overall
  // Use average distance of fingertips to palm center
  const avgTipToPalm = (
    calculateDistance(landmarks.indexTip, landmarks.palmCenter) +
    calculateDistance(landmarks.middleTip, landmarks.palmCenter) +
    calculateDistance(landmarks.ringTip, landmarks.palmCenter) +
    calculateDistance(landmarks.pinkyTip, landmarks.palmCenter)
  ) / 4;
  const palmClosureRatio = avgTipToPalm / handSpan;
  const isHandClosed = palmClosureRatio < 0.45; // Hand is relatively closed
  
  // Count extended and curled fingers
  const extendedCount = [indexExtended, middleExtended, ringExtended, pinkyExtended].filter(Boolean).length;
  const curledCount = [indexCurled, middleCurled, ringCurled, pinkyCurled].filter(Boolean).length;
  
  // Pointing: index extended, others mostly curled
  if (indexExtended && !middleExtended && curledCount >= 2) {
    return 'pointing';
  }
  
  // Fist: most fingers curled OR hand is closed (more reliable detection)
  // This catches fists even when individual finger curl detection fails
  if ((curledCount >= 3 && !indexExtended && !middleExtended) || 
      (isHandClosed && extendedCount <= 1 && !indexExtended)) {
    return 'fist';
  }
  
  // Open hand: most fingers extended
  if (extendedCount >= 3) {
    return 'open';
  }
  
  // Default based on finger states - more generous fist detection
  if ((curledCount >= 2 && extendedCount <= 1) || isHandClosed) {
    return 'fist';
  }
  
  return 'none';
}

// Calculate hand rotation from landmarks with improved stability
// Coordinate system after mirroring for front-facing camera:
// +X = right (viewer's right), +Y = down (MediaPipe convention), +Z = toward camera
function calculateHandRotation(landmarks: HandLandmarks): HandRotation {
  const wrist = landmarks.wrist;
  const middleMCP = landmarks.middleMCP;
  const indexMCP = landmarks.indexMCP;
  const pinkyMCP = landmarks.pinkyMCP;

  // Mirror X coordinates for front-facing camera view
  // This makes +X point to the viewer's right
  const mirrorX = (x: number) => 1 - x;

  // Forward vector: from wrist toward middle finger base (palm direction)
  const forwardX = mirrorX(middleMCP.x) - mirrorX(wrist.x);
  const forwardY = middleMCP.y - wrist.y;
  const forwardZ = (middleMCP.z || 0) - (wrist.z || 0);

  // Normalize forward vector
  const forwardLen = Math.sqrt(forwardX * forwardX + forwardY * forwardY + forwardZ * forwardZ);
  const fwdX = forwardLen > 0.001 ? forwardX / forwardLen : 0;
  const fwdY = forwardLen > 0.001 ? forwardY / forwardLen : 0;
  const fwdZ = forwardLen > 0.001 ? forwardZ / forwardLen : 0;

  // Right vector: from pinky to index (across the palm)
  const rightX = mirrorX(indexMCP.x) - mirrorX(pinkyMCP.x);
  const rightY = indexMCP.y - pinkyMCP.y;
  const rightZ = (indexMCP.z || 0) - (pinkyMCP.z || 0);

  // Normalize right vector
  const rightLen = Math.sqrt(rightX * rightX + rightY * rightY + rightZ * rightZ);
  const rgtX = rightLen > 0.001 ? rightX / rightLen : 0;
  const rgtY = rightLen > 0.001 ? rightY / rightLen : 0;
  const rgtZ = rightLen > 0.001 ? rightZ / rightLen : 0;

  // Roll: rotation around the forward axis (wrist twist)
  // When palm faces camera and you twist clockwise, rightY becomes positive
  const rollDenom = Math.sqrt(rgtX * rgtX + rgtZ * rgtZ);
  const roll = rollDenom > 0.001 
    ? Math.atan2(rgtY, rollDenom) 
    : 0;

  // Pitch: rotation up/down (tilting palm up or down)
  // When you tilt palm up, fwdY becomes more negative
  const pitchDenom = Math.sqrt(fwdX * fwdX + fwdZ * fwdZ);
  const pitch = pitchDenom > 0.001 
    ? Math.atan2(-fwdY, pitchDenom) 
    : 0;

  // Yaw: rotation left/right (pointing palm left or right)
  // When you rotate palm to point right, fwdX becomes positive
  // fwdZ is negative when palm faces camera, positive when facing away
  const yaw = Math.abs(fwdZ) > 0.001 || Math.abs(fwdX) > 0.001
    ? Math.atan2(-fwdX, fwdZ)  // Negate X and use positive Z for correct direction
    : 0;

  return { roll, pitch, yaw };
}

export function useHandTracking(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [state, setState] = useState<HandTrackingState>({
    isTracking: false,
    landmarks: null,
    gesture: 'none',
    isGrabbing: false,
    isPointing: false,
    isPinching: false,
    handRotation: { roll: 0, pitch: 0, yaw: 0 },
    hands: [],
    confidence: 0,
  });

  const handsRef = useRef<Hands | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  
  // Store smoothed rotations for each hand to reduce jitter at source
  const smoothedRotationsRef = useRef<HandRotation[]>([
    { roll: 0, pitch: 0, yaw: 0 },
    { roll: 0, pitch: 0, yaw: 0 }
  ]);
  const ROTATION_SMOOTHING = 0.6; // Higher = more responsive, Lower = smoother
  
  // Gesture debouncing - require multiple frames to confirm gesture change
  const gestureHistoryRef = useRef<GestureType[][]>([[], []]);
  const GESTURE_HISTORY_SIZE = 4; // Number of frames to consider
  const GESTURE_THRESHOLD = 3; // Number of matching frames to confirm
  
  // Gesture confirmation delay - 1 second delay for fist gesture to be confirmed
  const GESTURE_CONFIRM_DELAY_MS = 1000; // 1 second
  const gestureStartTimeRef = useRef<number[]>([0, 0]); // Timestamp when gesture started for each hand
  const confirmedGestureRef = useRef<GestureType[]>(['none', 'none']); // Currently confirmed gesture
  
  // Debounce gesture changes to prevent flickering with 2-second confirmation delay for fist
  const debounceGesture = (index: number, rawGesture: GestureType): GestureType => {
    const history = gestureHistoryRef.current[index];
    history.push(rawGesture);
    if (history.length > GESTURE_HISTORY_SIZE) {
      history.shift();
    }
    
    // Count occurrences of each gesture
    const counts = new Map<GestureType, number>();
    for (const g of history) {
      counts.set(g, (counts.get(g) || 0) + 1);
    }
    
    // Return the most frequent gesture if it meets threshold
    let maxCount = 0;
    let dominantGesture: GestureType = rawGesture;
    for (const [gesture, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        dominantGesture = gesture;
      }
    }
    
    const debouncedGesture = maxCount >= GESTURE_THRESHOLD ? dominantGesture : history[history.length - 2] || rawGesture;
    
    // Apply 2-second confirmation delay for fist gesture
    const now = Date.now();
    const previousConfirmed = confirmedGestureRef.current[index];
    
    if (debouncedGesture === 'fist') {
      // If this is a new fist gesture, start timing
      if (previousConfirmed !== 'fist' && gestureStartTimeRef.current[index] === 0) {
        gestureStartTimeRef.current[index] = now;
      }
      
      // Check if 2 seconds have passed since fist started
      const elapsedTime = now - gestureStartTimeRef.current[index];
      if (elapsedTime >= GESTURE_CONFIRM_DELAY_MS) {
        confirmedGestureRef.current[index] = 'fist';
        return 'fist';
      } else {
        // Still waiting for confirmation, keep previous confirmed gesture or 'none'
        return previousConfirmed === 'fist' ? 'fist' : 'none';
      }
    } else {
      // Reset fist timing if gesture changed
      gestureStartTimeRef.current[index] = 0;
      confirmedGestureRef.current[index] = debouncedGesture;
      return debouncedGesture;
    }
  };

  // Smooth a single rotation value, handling angle wrapping
  const smoothAngle = (current: number, target: number, factor: number): number => {
    // Handle angle wrapping around ±π
    let diff = target - current;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return current + diff * factor;
  };

  const smoothRotation = useCallback((index: number, rawRotation: HandRotation): HandRotation => {
    const prev = smoothedRotationsRef.current[index];
    const smoothed = {
      roll: smoothAngle(prev.roll, rawRotation.roll, ROTATION_SMOOTHING),
      pitch: smoothAngle(prev.pitch, rawRotation.pitch, ROTATION_SMOOTHING),
      yaw: smoothAngle(prev.yaw, rawRotation.yaw, ROTATION_SMOOTHING),
    };
    smoothedRotationsRef.current[index] = smoothed;
    return smoothed;
  }, []);

  const onResults = useCallback((results: Results) => {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const hands: TrackedHand[] = results.multiHandLandmarks.slice(0, 2).map((lm, index) => {
        const handLandmarks: HandLandmarks = {
          indexTip: lm[8],
          indexPIP: lm[6],
          indexMCP: lm[5],
          indexDIP: lm[7],
          thumbTip: lm[4],
          thumbIP: lm[3],
          thumbMCP: lm[2],
          middleTip: lm[12],
          middlePIP: lm[10],
          middleMCP: lm[9],
          middleDIP: lm[11],
          ringTip: lm[16],
          ringPIP: lm[14],
          ringMCP: lm[13],
          pinkyTip: lm[20],
          pinkyPIP: lm[18],
          pinkyMCP: lm[17],
          wrist: lm[0],
          palmCenter: lm[9],
          allLandmarks: lm,
        };

        const rawGesture = detectGesture(handLandmarks);
        // Debounce gesture to prevent flickering
        const gesture = debounceGesture(index, rawGesture);
        const rawHandRotation = calculateHandRotation(handLandmarks);
        // Apply smoothing to reduce jitter at the source
        const handRotation = smoothRotation(index, rawHandRotation);
        const handedness =
          results.multiHandedness?.[index]?.label === 'Left' ||
          results.multiHandedness?.[index]?.label === 'Right'
            ? (results.multiHandedness[index].label as HandednessLabel)
            : 'Unknown';
        const confidence = results.multiHandedness?.[index]?.score ?? 0.5;

        return {
          landmarks: handLandmarks,
          gesture,
          // Grabbing: fist gesture only
          isGrabbing: gesture === 'fist',
          isPointing: gesture === 'pointing',
          isPinching: false, // Pinch gesture disabled
          handRotation,
          handedness,
          confidence,
        };
      });

      const primary = hands[0];

      setState({
        isTracking: true,
        landmarks: primary?.landmarks ?? null,
        gesture: primary?.gesture ?? 'none',
        isGrabbing: primary?.isGrabbing ?? false,
        isPointing: primary?.isPointing ?? false,
        isPinching: primary?.isPinching ?? false,
        handRotation: primary?.handRotation ?? { roll: 0, pitch: 0, yaw: 0 },
        hands,
        confidence: primary?.confidence ?? 0,
      });
    } else {
      setState((prev) => ({
        ...prev,
        isTracking: false,
        landmarks: null,
        gesture: 'none',
        isGrabbing: false,
        isPointing: false,
        isPinching: false,
        hands: [],
        confidence: 0,
      }));
    }
  }, [smoothRotation]);

  useEffect(() => {
    if (!videoRef.current) return;

    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,        // 0=lite, 1=full - full is more accurate
      minDetectionConfidence: 0.6,  // Lower for easier initial detection
      minTrackingConfidence: 0.5,   // Lower for more stable tracking
    });

    hands.onResults(onResults);
    handsRef.current = hands;

    const camera = new Camera(videoRef.current, {
      onFrame: async () => {
        if (videoRef.current && handsRef.current) {
          await handsRef.current.send({ image: videoRef.current });
        }
      },
      width: 1280,
      height: 720,
      facingMode: 'user',
    });

    camera.start();
    cameraRef.current = camera;

    return () => {
      camera.stop();
      hands.close();
    };
  }, [videoRef, onResults]);

  return state;
}
