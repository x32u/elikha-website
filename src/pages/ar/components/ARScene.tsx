// @ts-nocheck
/// <reference path="../../../three-jsx.d.ts" />
import { useRef, useState, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { ModelLoader, PlaceholderModel } from './ModelLoader';
import type { HandLandmarks, GestureType, HandRotation, TrackedHand } from '../hooks/useHandTracking';
import { raycastFromFingertip } from '../utils/raycasting';
import { createPaintDecal } from '../utils/decals';
import type { PaintStamp } from '../utils/decals';
import { RotationFilter, PhysicsSpring, QuaternionSpring } from '../utils/smoothing';

interface ARSceneProps {
  modelUrl?: string;
  handLandmarks: HandLandmarks | null;
  isGrabbing: boolean;   // Fist gesture - move object
  isPointing: boolean;   // Index pointing - paint
  isPinching: boolean;   // Pinch gesture - scale
  hands: TrackedHand[];
  gesture: GestureType;
  handRotation: HandRotation;
  paintMode: boolean;
  paintColor: THREE.Color;
  brushSize: number;
  isEraser: boolean;
  debugMode?: boolean;
  onUndo?: () => void;
}

// Lighting setup component
function Lighting() {
  return (
    <>
      <ambientLight intensity={0.6} />
      <hemisphereLight
        args={[0xffffff, 0x444444, 0.8]}
        position={[0, 20, 0]}
      />
      <directionalLight
        position={[5, 10, 7]}
        intensity={1}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <pointLight position={[-5, 5, 5]} intensity={0.5} />
    </>
  );
}

// MediaPipe hand connections for skeleton
const HAND_CONNECTIONS = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm
  [5, 9], [9, 13], [13, 17],
];

// Hand skeleton visualization - shows full hand with joints and bones
function HandSkeleton({
  landmarks,
  gesture: _gesture,
  isPointing,
  isGrabbing,
}: {
  landmarks: HandLandmarks | null;
  gesture: GestureType;
  isPointing: boolean;
  isGrabbing: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const jointMeshes = useRef<THREE.Mesh[]>([]);
  const boneMeshes = useRef<THREE.Mesh[]>([]);
  const smoothedPositions = useRef<THREE.Vector3[]>(
    Array(21).fill(null).map(() => new THREE.Vector3())
  );
  const velocities = useRef<THREE.Vector3[]>(
    Array(21).fill(null).map(() => new THREE.Vector3())
  );

  useFrame(({ camera, size }) => {
    if (!landmarks || !groupRef.current) return;

    const allLandmarks = landmarks.allLandmarks;
    const distance = 3;
    const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
    const height = 2 * Math.tan(fov / 2) * distance;
    const width = height * (size.width / size.height);

    // Update joint positions with velocity-based smoothing
    allLandmarks.forEach((lm, i) => {
      const ndcX = (1 - lm.x) * 2 - 1; // Mirror X for front camera
      const ndcY = -(lm.y * 2 - 1);
      
      const targetPos = new THREE.Vector3(
        ndcX * width / 2,
        ndcY * height / 2,
        -distance + (lm.z || 0) * -2 // Use z for depth
      );
      
      // Velocity-based smoothing for more natural movement
      const current = smoothedPositions.current[i];
      const velocity = velocities.current[i];
      
      // Calculate new velocity with damping
      const diff = targetPos.clone().sub(current);
      velocity.add(diff.multiplyScalar(0.3)); // Spring force
      velocity.multiplyScalar(0.7); // Damping
      
      // Apply velocity
      current.add(velocity);
      
      if (jointMeshes.current[i]) {
        jointMeshes.current[i].position.copy(current);
      }
    });

    // Update bone positions
    HAND_CONNECTIONS.forEach(([startIdx, endIdx], i) => {
      const start = smoothedPositions.current[startIdx];
      const end = smoothedPositions.current[endIdx];
      
      if (boneMeshes.current[i]) {
        const bone = boneMeshes.current[i];
        const midpoint = start.clone().add(end).multiplyScalar(0.5);
        bone.position.copy(midpoint);
        
        // Orient bone to point from start to end
        const direction = end.clone().sub(start);
        const length = direction.length();
        bone.scale.set(0.008, length, 0.008);
        bone.lookAt(end);
        bone.rotateX(Math.PI / 2);
      }
    });
  });

  if (!landmarks) return null;

  // Color based on gesture
  let jointColor = '#44ff44'; // Default green
  let boneColor = '#22aa22';
  
  if (isGrabbing) {
    jointColor = '#ff8844';
    boneColor = '#cc6622';
  } else if (isPointing) {
    jointColor = '#ff4444';
    boneColor = '#cc2222';
  }

  return (
    <group ref={groupRef} renderOrder={10}>
      {/* Joints */}
      {landmarks.allLandmarks.map((_, i) => (
        <mesh
          key={`joint-${i}`}
          ref={(mesh) => {
            if (mesh) jointMeshes.current[i] = mesh;
          }}
          renderOrder={11}
        >
          <sphereGeometry args={[i === 8 ? 0.04 : 0.025, 12, 12]} />
          <meshBasicMaterial
            color={i === 8 ? (isPointing ? '#ff0000' : jointColor) : jointColor}
            transparent
            opacity={0.9}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
      ))}
      
      {/* Bones */}
      {HAND_CONNECTIONS.map((_, i) => (
        <mesh
          key={`bone-${i}`}
          ref={(mesh) => {
            if (mesh) boneMeshes.current[i] = mesh;
          }}
          renderOrder={10}
        >
          <cylinderGeometry args={[1, 1, 1, 8]} />
          <meshBasicMaterial
            color={boneColor}
            transparent
            opacity={0.7}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

// Paint system component - paints when pointing (index finger extended)
function PaintSystem({
  modelRef,
  handLandmarks,
  isPointing,
  paintMode,
  paintColor,
  brushSize,
  isEraser,
  setPaintStamps,
}: {
  modelRef: React.RefObject<THREE.Group | null>;
  handLandmarks: HandLandmarks | null;
  isPointing: boolean;
  paintMode: boolean;
  paintColor: THREE.Color;
  brushSize: number;
  isEraser: boolean;
  setPaintStamps: React.Dispatch<React.SetStateAction<PaintStamp[]>>;
}) {
  const { camera, scene } = useThree();
  const lastPaintTime = useRef(0);
  const lastPaintPos = useRef<THREE.Vector3 | null>(null);
  const smoothedHitPos = useRef<THREE.Vector3 | null>(null);
  const PAINT_COOLDOWN = 12; // ms between paint samples
  const MAX_STAMPS = Number.POSITIVE_INFINITY;
  const SMOOTHING = 0.35; // higher = snappier, lower = smoother

  useFrame(() => {
    if (!paintMode || !handLandmarks || !modelRef.current) {
      lastPaintPos.current = null;
      smoothedHitPos.current = null;
      return;
    }
    
    // Only paint when pointing gesture (index finger extended)
    if (!isPointing) {
      lastPaintPos.current = null;
      smoothedHitPos.current = null;
      return;
    }

    const now = Date.now();
    if (now - lastPaintTime.current < PAINT_COOLDOWN) return;

    // Mirror X for front-facing camera
    const mirroredX = 1 - handLandmarks.indexTip.x;

    // Raycast from fingertip
    const hits = raycastFromFingertip(
      mirroredX,
      handLandmarks.indexTip.y,
      camera,
      [modelRef.current]
    );

    if (hits.length === 0) {
      lastPaintPos.current = null;
      smoothedHitPos.current = null;
      return;
    }

    const hit = hits[0];

    if (!(hit.object instanceof THREE.Mesh)) {
      lastPaintPos.current = null;
      return;
    }

    const targetMesh = hit.object as THREE.Mesh;
    const anchor = modelRef.current.parent as THREE.Group | null;
    targetMesh.updateMatrixWorld(true);
    anchor?.updateMatrixWorld(true);

    // Check minimum distance from last paint (world space)
    if (!smoothedHitPos.current) {
      smoothedHitPos.current = hit.point.clone();
    } else {
      smoothedHitPos.current.lerp(hit.point, SMOOTHING);
    }

    const targetPoint = smoothedHitPos.current;
    const minDistance = Math.max(brushSize * 0.25, 0.004);
    if (lastPaintPos.current && lastPaintPos.current.distanceTo(targetPoint) < minDistance) {
      return;
    }

    const newStamps: PaintStamp[] = [];
    const maxPerFrame = 10;
    const distanceWorld = lastPaintPos.current ? lastPaintPos.current.distanceTo(targetPoint) : 0;
    const steps = lastPaintPos.current
      ? Math.min(maxPerFrame, Math.max(1, Math.floor(distanceWorld / minDistance)))
      : 1;

    const normalMatrix = new THREE.Matrix3().getNormalMatrix(targetMesh.matrixWorld);
    const worldNormal = hit.face
      ? hit.face.normal.clone().applyMatrix3(normalMatrix).normalize()
      : new THREE.Vector3(0, 0, 1);

    const basePoint = lastPaintPos.current ?? targetPoint;
    const makeStamp = (point: THREE.Vector3) => {
      const decal = createPaintDecal(
        targetMesh,
        point,
        worldNormal,
        brushSize,
        paintColor,
        isEraser
      );
      if (!decal) return;

      if (anchor) {
        const inverseAnchor = anchor.matrixWorld.clone().invert();
        decal.geometry.applyMatrix4(inverseAnchor);
        decal.position.set(0, 0, 0);
        decal.rotation.set(0, 0, 0);
        decal.updateMatrix();
        decal.matrixAutoUpdate = false;
        anchor.add(decal);
      } else {
        scene.add(decal);
      }

      newStamps.push({
        id: `stamp-${Date.now()}-${Math.random()}`,
        mesh: decal,
        timestamp: now,
      });
    };

    for (let i = 1; i <= steps; i += 1) {
      const t = steps === 1 ? 1 : i / steps;
      const point = basePoint.clone().lerp(targetPoint, t);
      makeStamp(point);
    }

    if (newStamps.length > 0) {
      setPaintStamps((prev) => {
        const updated = [...prev, ...newStamps];
        // Prune old paint marks
        if (Number.isFinite(MAX_STAMPS)) {
          while (updated.length > MAX_STAMPS) {
            const toRemove = updated.shift();
            if (toRemove) {
              toRemove.mesh.parent?.remove(toRemove.mesh);
              toRemove.mesh.geometry.dispose();
              if (toRemove.mesh.material instanceof THREE.Material) {
                toRemove.mesh.material.dispose();
              }
            }
          }
        }
        return updated;
      });
    }

    lastPaintTime.current = now;
    lastPaintPos.current = targetPoint.clone();
  });

  return null;
}

// Model manipulation component - uses fist gesture to grab, move, and rotate
// Enhanced with physics-based movement for realistic feel
function ModelManipulator({
  anchorRef,
  isPinching: _isPinching,
  hands,
}: {
  anchorRef: React.RefObject<THREE.Group | null>;
  isPinching: boolean;
  hands: TrackedHand[];
}) {
  type Landmark = HandLandmarks['indexTip'];
  const wasGrabbing = useRef(false);
  const wasPinching = useRef(false);
  const wasTwoHandGrabbing = useRef(false);
  const grabOffset = useRef(new THREE.Vector3());
  
  // Physics-based smoothing for natural movement - lower stiffness to prevent bouncing
  const positionSpring = useRef(new PhysicsSpring(80, 12, 1)); // Gentle, no bounce
  const rotationSpring = useRef(new QuaternionSpring(60, 10)); // Smooth rotation
  
  const initialHandQuat = useRef(new THREE.Quaternion());
  const initialModelQuat = useRef(new THREE.Quaternion());
  const rotationFilter = useRef(new RotationFilter(5)); // Slightly larger buffer for stability
  
  // Palm orientation tracking for direct rotation mapping
  const initialPalmQuat = useRef(new THREE.Quaternion());
  
  const baseDistance = useRef(0);
  const smoothedDistance = useRef(0);
  const initialHandSize = useRef(0);
  const smoothedHandSize = useRef(0);
  const initialTwoHandDistance = useRef(1);
  const initialTwoHandRotation = useRef(new THREE.Quaternion());
  const initialTwoHandPosition = useRef(new THREE.Vector3());
  const initialTwoHandScale = useRef(new THREE.Vector3(1, 1, 1));
  const twoHandSmoothedScale = useRef(new THREE.Vector3(1, 1, 1));
  const initialPinchDistance = useRef(0);
  const initialScale = useRef(new THREE.Vector3(1, 1, 1));
  const smoothedScale = useRef(new THREE.Vector3(1, 1, 1));
  const raycaster = useRef(new THREE.Raycaster());
  const ndc = useRef(new THREE.Vector2());
  const palmNdc = useRef(new THREE.Vector2());
  const palmNdcB = useRef(new THREE.Vector2());
  const anchorNdc = useRef(new THREE.Vector3());
  const intersection = useRef(new THREE.Vector3());
  const cameraDirection = useRef(new THREE.Vector3());
  
  // Momentum for throw effect when releasing
  const releaseVelocity = useRef(new THREE.Vector3());
  const lastPosition = useRef(new THREE.Vector3());
  const momentumActive = useRef(false);
  
  // Horizontal hand movement for rotation control
  const initialGrabX = useRef(0); // Initial X position when grab started
  const lastGrabX = useRef(0); // Last X position for tracking movement
  const horizontalRotationSensitivity = 2.5; // Multiplier for horizontal movement to rotation

  const GRAB_RANGE = 5.0; // World-space distance to initiate grab - very generous
  const GRAB_SCREEN_RADIUS = 0.8; // NDC distance to model center - almost whole screen
  const MIN_HAND_SIZE = 0.02; // Very low threshold for hand detection
  const MIN_SCALE = 0.1;
  const MAX_SCALE = 5.0;
  const HANDSIZE_DEPTH_SCALE = 8.0; // Reduced depth sensitivity
  const MIN_DISTANCE = 0.5;
  const MAX_DISTANCE = 10.0;
  const ROTATION_SENSITIVITY = 1.2; // Slightly reduced for stability

  function getRayFromLandmark(lm: Landmark, camera: THREE.Camera) {
    ndc.current.set((1 - lm.x) * 2 - 1, -(lm.y * 2 - 1));
    raycaster.current.setFromCamera(ndc.current, camera);
    return raycaster.current.ray;
  }

  function landmarkDistance(a: Landmark, b: Landmark) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = (a.z ?? 0) - (b.z ?? 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // Calculate palm orientation from hand landmarks for direct rotation mapping
  function getPalmOrientation(landmarks: HandLandmarks, camera: THREE.Camera): THREE.Quaternion {
    const { wrist, indexMCP, pinkyMCP, middleMCP } = landmarks;
    
    // Convert landmarks to 3D positions relative to camera
    const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
    const distance = 2.5; // Approximate hand distance
    const height = 2 * Math.tan(fov / 2) * distance;
    const aspect = (camera as THREE.PerspectiveCamera).aspect;
    const width = height * aspect;
    
    const toWorld = (lm: Landmark) => new THREE.Vector3(
      ((1 - lm.x) * 2 - 1) * width / 2,
      (-(lm.y * 2 - 1)) * height / 2,
      -distance + (lm.z || 0) * -3
    );
    
    const wristPos = toWorld(wrist);
    const indexMcpPos = toWorld(indexMCP);
    const pinkyMcpPos = toWorld(pinkyMCP);
    const middleMcpPos = toWorld(middleMCP);
    
    // Calculate palm coordinate system
    // Right vector: from pinky to index (across palm)
    const palmRight = indexMcpPos.clone().sub(pinkyMcpPos).normalize();
    
    // Forward vector: from wrist toward middle finger
    const palmForward = middleMcpPos.clone().sub(wristPos).normalize();
    
    // Up vector: perpendicular to palm (palm normal)
    const palmUp = palmRight.clone().cross(palmForward).normalize();
    
    // Recalculate forward to ensure orthogonality
    const palmForwardFinal = palmUp.clone().cross(palmRight).normalize();
    
    // Build rotation matrix from palm coordinate system
    const rotMatrix = new THREE.Matrix4().makeBasis(palmRight, palmUp, palmForwardFinal.negate());
    
    return new THREE.Quaternion().setFromRotationMatrix(rotMatrix);
  }

  // Enhanced hand rotation using palm orientation
  function handRotationToQuat(rotation: HandRotation, landmarks?: HandLandmarks, camera?: THREE.Camera): THREE.Quaternion {
    // Use euler-based rotation with improved sensitivity
    const euler = new THREE.Euler(
      rotation.roll * ROTATION_SENSITIVITY,    // X: wrist twist
      rotation.yaw * ROTATION_SENSITIVITY,     // Y: pointing direction
      rotation.pitch * ROTATION_SENSITIVITY,   // Z: palm tilt
      'YXZ'
    );
    return new THREE.Quaternion().setFromEuler(euler);
  }

  useFrame(({ camera }, delta) => {
    if (!anchorRef.current) {
      wasGrabbing.current = false;
      wasPinching.current = false;
      wasTwoHandGrabbing.current = false;
      momentumActive.current = false;
      return;
    }

    const anchor = anchorRef.current;
    const dt = Math.min(delta, 1/30); // Cap delta time for stability
    
    // Momentum disabled to prevent unwanted movement
    // Objects now stay where you release them
    momentumActive.current = false;

    const primaryHand = hands[0];

    if (!primaryHand) {
      wasGrabbing.current = false;
      wasPinching.current = false;
      wasTwoHandGrabbing.current = false;
      return;
    }

    wasPinching.current = false;

    // Two-hand mode: detect when both hands are visible and making fist gesture
    const activeHands = hands.filter((hand) => hand.isGrabbing || hand.gesture === 'fist');
    const twoHandActive = hands.length >= 2 && activeHands.length >= 2;

    if (twoHandActive) {
      const handA = activeHands[0];
      const handB = activeHands[1];

      palmNdc.current.set(
        (1 - handA.landmarks.palmCenter.x) * 2 - 1,
        -(handA.landmarks.palmCenter.y * 2 - 1)
      );
      palmNdcB.current.set(
        (1 - handB.landmarks.palmCenter.x) * 2 - 1,
        -(handB.landmarks.palmCenter.y * 2 - 1)
      );

      if (!wasTwoHandGrabbing.current) {
        initialTwoHandRotation.current.copy(anchor.quaternion);
        initialTwoHandPosition.current.copy(anchor.position);
        initialTwoHandScale.current.copy(anchor.scale);
        twoHandSmoothedScale.current.copy(anchor.scale);
        initialTwoHandDistance.current = Math.max(
          palmNdc.current.distanceTo(palmNdcB.current),
          0.001
        );
      }

      const currentDistanceBetweenHands = Math.max(
        palmNdc.current.distanceTo(palmNdcB.current),
        0.001
      );
      const scaleFactor = currentDistanceBetweenHands / initialTwoHandDistance.current;
      const targetScale = initialTwoHandScale.current.clone().multiplyScalar(scaleFactor);
      targetScale.set(
        THREE.MathUtils.clamp(targetScale.x, MIN_SCALE, MAX_SCALE),
        THREE.MathUtils.clamp(targetScale.y, MIN_SCALE, MAX_SCALE),
        THREE.MathUtils.clamp(targetScale.z, MIN_SCALE, MAX_SCALE)
      );
      twoHandSmoothedScale.current.lerp(targetScale, 0.15); // Smoother scaling
      anchor.scale.copy(twoHandSmoothedScale.current);

      // Keep position and rotation stable during two-hand scaling
      anchor.position.copy(initialTwoHandPosition.current);
      anchor.quaternion.copy(initialTwoHandRotation.current);

      wasTwoHandGrabbing.current = true;
      wasGrabbing.current = false;
      return;
    }

    wasTwoHandGrabbing.current = false;

    if (primaryHand.isGrabbing) {
      momentumActive.current = false; // Stop momentum when grabbing
      
      const ray = getRayFromLandmark(primaryHand.landmarks.palmCenter, camera);
      camera.getWorldDirection(cameraDirection.current).normalize();
      const handSize = landmarkDistance(primaryHand.landmarks.indexMCP, primaryHand.landmarks.pinkyMCP);
      const scaleFactor = THREE.MathUtils.clamp(anchor.scale.x, 0.6, 3.0);
      const effectiveGrabRange = GRAB_RANGE * scaleFactor;
      const effectiveScreenRadius = THREE.MathUtils.clamp(
        GRAB_SCREEN_RADIUS * scaleFactor,
        0.18,
        0.65
      );
      const currentDistance = Math.abs(
        anchor.position.clone().sub(camera.position).dot(cameraDirection.current)
      );
      const baselineDistance = wasGrabbing.current ? baseDistance.current : currentDistance;
      
      if (!wasGrabbing.current) {
        initialHandSize.current = handSize;
        smoothedHandSize.current = handSize;
      } else {
        smoothedHandSize.current += (handSize - smoothedHandSize.current) * 0.4;
      }
      
      const sizeDelta = smoothedHandSize.current - initialHandSize.current;
      const targetDistance = THREE.MathUtils.clamp(
        baselineDistance - sizeDelta * HANDSIZE_DEPTH_SCALE,
        MIN_DISTANCE,
        MAX_DISTANCE
      );
      
      if (!wasGrabbing.current) {
        palmNdc.current.set(
          (1 - primaryHand.landmarks.palmCenter.x) * 2 - 1,
          -(primaryHand.landmarks.palmCenter.y * 2 - 1)
        );
        anchorNdc.current.copy(anchor.position).project(camera);
        const screenDistance = palmNdc.current.distanceTo(
          new THREE.Vector2(anchorNdc.current.x, anchorNdc.current.y)
        );
        if (screenDistance > effectiveScreenRadius || handSize < MIN_HAND_SIZE) {
          return;
        }
        const rayDistance = ray.distanceToPoint(anchor.position);
        if (rayDistance > effectiveGrabRange) {
          return;
        }
        smoothedDistance.current = targetDistance;
      } else {
        smoothedDistance.current += (targetDistance - smoothedDistance.current) * 0.3;
      }
      
      const grabPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        cameraDirection.current,
        camera.position.clone().add(cameraDirection.current.clone().multiplyScalar(smoothedDistance.current))
      );

      if (!ray.intersectPlane(grabPlane, intersection.current)) {
        wasGrabbing.current = false;
        return;
      }

      const distanceToAnchor = intersection.current.distanceTo(anchor.position);
      if (!wasGrabbing.current && distanceToAnchor > effectiveGrabRange) {
        return;
      }

      if (!wasGrabbing.current) {
        // Just started grabbing - capture initial state
        grabOffset.current.copy(anchor.position).sub(intersection.current);
        positionSpring.current.setPosition(anchor.position);
        lastPosition.current.copy(anchor.position);
        
        // Get palm orientation for rotation tracking
        initialPalmQuat.current.copy(getPalmOrientation(primaryHand.landmarks, camera));
        initialModelQuat.current.copy(anchor.quaternion);
        rotationSpring.current.setRotation(anchor.quaternion);
        
        // Also capture euler-based rotation as fallback
        initialHandQuat.current.copy(handRotationToQuat(primaryHand.handRotation));
        
        baseDistance.current = currentDistance;
        smoothedDistance.current = targetDistance;
        
        // Reset filters when starting a new grab
        rotationFilter.current.reset();
        
        // Capture initial horizontal position for rotation control
        initialGrabX.current = 1 - primaryHand.landmarks.palmCenter.x; // Mirror X for front camera
        lastGrabX.current = initialGrabX.current;
      } else {
        // Continue grabbing - apply physics-based movement
        const targetPos = intersection.current.clone().add(grabOffset.current);
        
        // Track velocity for throw effect
        releaseVelocity.current.copy(targetPos).sub(lastPosition.current);
        lastPosition.current.copy(anchor.position);
        
        // Use physics spring for smooth, natural movement
        const smoothedPos = positionSpring.current.update(targetPos, dt);
        anchor.position.copy(smoothedPos);

        // Calculate rotation based on horizontal hand movement (X-axis displacement)
        const currentX = 1 - primaryHand.landmarks.palmCenter.x; // Mirror X for front camera
        const deltaX = currentX - initialGrabX.current; // Displacement from initial grab position
        
        // Apply horizontal movement as Y-axis rotation (left-right rotation)
        // Rotation direction matches movement direction: move right = rotate right
        const horizontalRotationAngle = deltaX * horizontalRotationSensitivity * Math.PI;
        
        // Create rotation quaternion from horizontal movement
        const horizontalRotation = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0), // Y-axis for left-right rotation
          horizontalRotationAngle
        );
        
        // Apply horizontal rotation to initial model rotation
        const targetQuat = horizontalRotation.clone().multiply(initialModelQuat.current);
        
        // Use physics spring for natural rotation feel
        const smoothedQuat = rotationSpring.current.update(targetQuat, dt);
        anchor.quaternion.copy(smoothedQuat);
        
        // Update last X position for tracking
        lastGrabX.current = currentX;
      }
      wasGrabbing.current = true;
    } else {
      // Released grab - enable momentum if we were grabbing
      if (wasGrabbing.current && releaseVelocity.current.length() > 0.005) {
        momentumActive.current = true;
        // Limit max throw velocity
        if (releaseVelocity.current.length() > 0.3) {
          releaseVelocity.current.setLength(0.3);
        }
      }
      wasGrabbing.current = false;
    }
  });

  return null;
}

// Main scene content
function SceneContent({
  modelUrl,
  handLandmarks,
  isGrabbing,
  isPointing,
  isPinching,
  hands,
  gesture,
  handRotation: _handRotation,
  paintMode,
  paintColor,
  brushSize,
  isEraser,
  debugMode,
}: ARSceneProps) {
  const anchorRef = useRef<THREE.Group | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const [_paintStamps, setPaintStamps] = useState<PaintStamp[]>([]);

  const handleModelLoad = useCallback((model: THREE.Group) => {
    modelRef.current = model;
  }, []);

  return (
    <>
      <Lighting />

      {/* World-anchored model */}
      <group ref={anchorRef} position={[0, 0, -3]}>
        {modelUrl ? (
          <ModelLoader
            url={modelUrl}
            position={[0, 0, 0]}
            scale={1}
            onLoad={handleModelLoad}
          />
        ) : (
          <PlaceholderModel position={[0, 0, 0]} onLoad={handleModelLoad} />
        )}
      </group>

      {/* Hand skeleton - shows full hand tracking */}
      {hands.length > 0 ? (
        hands.map((hand, index) => (
          <HandSkeleton
            key={`hand-${hand.handedness}-${index}`}
            landmarks={hand.landmarks}
            gesture={hand.gesture}
            isPointing={hand.isPointing}
            isGrabbing={hand.isGrabbing}
          />
        ))
      ) : (
        <HandSkeleton 
          landmarks={handLandmarks} 
          gesture={gesture}
          isPointing={isPointing}
          isGrabbing={isGrabbing}
        />
      )}

      {/* Model manipulation - fist to grab and rotate */}
      <ModelManipulator
        anchorRef={anchorRef}
        isPinching={isPinching}
        hands={hands}
      />

      {/* Paint system - point to paint */}
      <PaintSystem
        modelRef={modelRef}
        handLandmarks={handLandmarks}
        isPointing={isPointing}
        paintMode={paintMode}
        paintColor={paintColor}
        brushSize={brushSize}
        isEraser={isEraser}
        setPaintStamps={setPaintStamps}
      />

      {/* Debug controls */}
      {debugMode && <OrbitControls />}
    </>
  );
}

export function ARScene(props: ARSceneProps) {
  return (
    <Canvas
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 1,
        pointerEvents: props.debugMode ? 'auto' : 'none',
      }}
      gl={{ alpha: true, antialias: true }}
      camera={{ fov: 60, near: 0.1, far: 1000, position: [0, 0, 0] }}
    >
      <SceneContent {...props} />
    </Canvas>
  );
}
