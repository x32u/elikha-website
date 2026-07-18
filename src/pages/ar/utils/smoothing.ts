import * as THREE from 'three';

/**
 * Physics-based spring for smooth, natural movement
 * Uses critically damped spring to prevent oscillation/bouncing
 */
export class PhysicsSpring {
  private position: THREE.Vector3 = new THREE.Vector3();
  private velocity: THREE.Vector3 = new THREE.Vector3();
  private stiffness: number;
  private damping: number;
  private mass: number;
  private initialized: boolean = false;
  
  constructor(stiffness: number = 80, damping: number = 20, mass: number = 1) {
    this.stiffness = stiffness;
    // Calculate critical damping: c = 2 * sqrt(k * m)
    // Use higher damping to ensure no oscillation
    const criticalDamping = 2 * Math.sqrt(stiffness * mass);
    this.damping = Math.max(damping, criticalDamping * 1.2); // Over-damped to prevent bounce
    this.mass = mass;
  }
  
  update(target: THREE.Vector3, dt: number = 1/60): THREE.Vector3 {
    if (!this.initialized) {
      this.position.copy(target);
      this.initialized = true;
      return this.position.clone();
    }
    
    // Clamp dt to prevent instability
    const clampedDt = Math.min(dt, 1/30);
    
    // Spring force: F = -k * (x - target)
    const displacement = this.position.clone().sub(target);
    const springForce = displacement.multiplyScalar(-this.stiffness);
    
    // Damping force: F = -c * velocity
    const dampingForce = this.velocity.clone().multiplyScalar(-this.damping);
    
    // Total force and acceleration
    const totalForce = springForce.add(dampingForce);
    const acceleration = totalForce.divideScalar(this.mass);
    
    // Update velocity and position with clamped dt
    this.velocity.add(acceleration.multiplyScalar(clampedDt));
    
    // Limit max velocity to prevent overshooting
    const maxVelocity = 10;
    if (this.velocity.length() > maxVelocity) {
      this.velocity.setLength(maxVelocity);
    }
    
    this.position.add(this.velocity.clone().multiplyScalar(clampedDt));
    
    return this.position.clone();
  }
  
  setPosition(pos: THREE.Vector3) {
    this.position.copy(pos);
    this.velocity.set(0, 0, 0);
    this.initialized = true;
  }
  
  reset() {
    this.initialized = false;
    this.position.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
  }
  
  get current(): THREE.Vector3 {
    return this.position.clone();
  }
  
  get currentVelocity(): THREE.Vector3 {
    return this.velocity.clone();
  }
}

/**
 * Physics-based quaternion spring for natural rotation
 * Uses over-damped spring to prevent oscillation
 */
export class QuaternionSpring {
  private rotation: THREE.Quaternion = new THREE.Quaternion();
  private angularVelocity: THREE.Vector3 = new THREE.Vector3();
  private stiffness: number;
  private damping: number;
  private initialized: boolean = false;
  
  constructor(stiffness: number = 60, damping: number = 25) {
    this.stiffness = stiffness;
    // Ensure over-damped to prevent oscillation
    const criticalDamping = 2 * Math.sqrt(stiffness);
    this.damping = Math.max(damping, criticalDamping * 1.5);
  }
  
  update(target: THREE.Quaternion, dt: number = 1/60): THREE.Quaternion {
    if (!this.initialized) {
      this.rotation.copy(target);
      this.initialized = true;
      return this.rotation.clone();
    }
    
    // Clamp dt
    const clampedDt = Math.min(dt, 1/30);
    
    // Calculate rotation difference as axis-angle
    const diff = this.rotation.clone().invert().multiply(target);
    const axis = new THREE.Vector3();
    let angle = 2 * Math.acos(Math.min(1, Math.abs(diff.w)));
    
    if (angle > 0.0001) {
      const sinHalfAngle = Math.sqrt(1 - diff.w * diff.w);
      if (sinHalfAngle > 0.0001) {
        axis.set(diff.x / sinHalfAngle, diff.y / sinHalfAngle, diff.z / sinHalfAngle);
      }
    }
    
    // Wrap angle to shortest path
    if (angle > Math.PI) {
      angle = 2 * Math.PI - angle;
      axis.negate();
    }
    
    // Spring torque
    const torque = axis.multiplyScalar(angle * this.stiffness);
    
    // Damping torque
    const dampingTorque = this.angularVelocity.clone().multiplyScalar(-this.damping);
    
    // Update angular velocity and rotation
    this.angularVelocity.add(torque.add(dampingTorque).multiplyScalar(clampedDt));
    
    // Limit angular velocity to prevent instability
    const maxAngularVelocity = 8;
    if (this.angularVelocity.length() > maxAngularVelocity) {
      this.angularVelocity.setLength(maxAngularVelocity);
    }
    
    // Apply angular velocity to rotation
    const angularSpeed = this.angularVelocity.length();
    if (angularSpeed > 0.0001) {
      const rotationDelta = new THREE.Quaternion().setFromAxisAngle(
        this.angularVelocity.clone().normalize(),
        angularSpeed * dt
      );
      this.rotation.multiply(rotationDelta);
      this.rotation.normalize();
    }
    
    return this.rotation.clone();
  }
  
  setRotation(rot: THREE.Quaternion) {
    this.rotation.copy(rot);
    this.angularVelocity.set(0, 0, 0);
    this.initialized = true;
  }
  
  reset() {
    this.initialized = false;
    this.rotation.identity();
    this.angularVelocity.set(0, 0, 0);
  }
  
  get current(): THREE.Quaternion {
    return this.rotation.clone();
  }
}

/**
 * Exponential moving average for smooth position transitions
 */
export function smoothVector3(
  current: THREE.Vector3,
  target: THREE.Vector3,
  factor: number = 0.15
): THREE.Vector3 {
  return current.clone().lerp(target, factor);
}

/**
 * Check if movement exceeds deadzone threshold to prevent jitter
 */
export function exceedsDeadzone(
  current: THREE.Vector3,
  target: THREE.Vector3,
  threshold: number = 0.01
): boolean {
  return current.distanceTo(target) > threshold;
}

/**
 * Smooth a scalar value with exponential moving average
 */
export function smoothScalar(
  current: number,
  target: number,
  factor: number = 0.15
): number {
  return current + (target - current) * factor;
}

/**
 * Check if rotation exceeds deadzone threshold to prevent jitter
 * Uses quaternion angle difference
 */
export function rotationExceedsDeadzone(
  current: THREE.Quaternion,
  target: THREE.Quaternion,
  threshold: number = 0.02
): boolean {
  // Calculate the angle between the two quaternions
  const dot = Math.abs(current.dot(target));
  const angle = 2 * Math.acos(Math.min(dot, 1));
  return angle > threshold;
}

/**
 * Smooth quaternion interpolation with configurable factor
 */
export function smoothQuaternion(
  current: THREE.Quaternion,
  target: THREE.Quaternion,
  factor: number = 0.15
): THREE.Quaternion {
  return current.clone().slerp(target, factor);
}

/**
 * Low-pass filter for hand rotation to reduce noise
 */
export class RotationFilter {
  private buffer: THREE.Quaternion[] = [];
  private bufferSize: number;
  
  constructor(bufferSize: number = 5) {
    this.bufferSize = bufferSize;
  }
  
  push(rotation: THREE.Quaternion): THREE.Quaternion {
    this.buffer.push(rotation.clone());
    if (this.buffer.length > this.bufferSize) {
      this.buffer.shift();
    }
    
    // Average quaternions using spherical linear interpolation
    if (this.buffer.length === 0) return rotation;
    
    let result = this.buffer[0].clone();
    for (let i = 1; i < this.buffer.length; i++) {
      // Weighted average - newer samples have more weight
      const t = (i + 1) / (this.buffer.length * (this.buffer.length + 1) / 2);
      result.slerp(this.buffer[i], t);
    }
    return result;
  }
  
  reset() {
    this.buffer = [];
  }
}

/**
 * Velocity-based smoothing for more natural rotation tracking
 */
export class VelocitySmoothedRotation {
  private currentQuat: THREE.Quaternion = new THREE.Quaternion();
  private velocity: THREE.Quaternion = new THREE.Quaternion();
  private lastTarget: THREE.Quaternion = new THREE.Quaternion();
  private initialized: boolean = false;
  private responsiveness: number;
  
  constructor(responsiveness: number = 0.25) {
    this.responsiveness = responsiveness;
  }
  
  update(target: THREE.Quaternion): THREE.Quaternion {
    if (!this.initialized) {
      this.currentQuat.copy(target);
      this.lastTarget.copy(target);
      this.initialized = true;
      return this.currentQuat.clone();
    }
    
    // Apply damped spring-like behavior
    this.currentQuat.slerp(target, this.responsiveness);
    this.lastTarget.copy(target);
    
    return this.currentQuat.clone();
  }
  
  reset() {
    this.initialized = false;
    this.currentQuat.identity();
    this.velocity.identity();
    this.lastTarget.identity();
  }
  
  get current(): THREE.Quaternion {
    return this.currentQuat.clone();
  }
}

/**
 * Gesture state machine with hysteresis to prevent flickering
 */
export class GestureStateMachine<T extends string> {
  private currentState: T;
  private pendingState: T | null = null;
  private frameCount: number = 0;
  private requiredFrames: number;
  private exitFrames: number;
  
  constructor(initialState: T, requiredFrames: number = 3, exitFrames: number = 5) {
    this.currentState = initialState;
    this.requiredFrames = requiredFrames;
    this.exitFrames = exitFrames;
  }
  
  update(detectedState: T): T {
    if (detectedState === this.currentState) {
      // Same state - reset pending
      this.pendingState = null;
      this.frameCount = 0;
      return this.currentState;
    }
    
    if (detectedState === this.pendingState) {
      // Continue counting frames for state change
      this.frameCount++;
      
      // Use different thresholds for entering vs exiting states
      const threshold = this.pendingState === 'none' as T 
        ? this.exitFrames 
        : this.requiredFrames;
      
      if (this.frameCount >= threshold) {
        this.currentState = detectedState;
        this.pendingState = null;
        this.frameCount = 0;
      }
    } else {
      // New pending state
      this.pendingState = detectedState;
      this.frameCount = 1;
    }
    
    return this.currentState;
  }
  
  get state(): T {
    return this.currentState;
  }
  
  reset(state: T) {
    this.currentState = state;
    this.pendingState = null;
    this.frameCount = 0;
  }
}

/**
 * One Euro Filter - adaptive smoothing that's responsive to fast movements
 * but smooth during slow movements
 */
export class OneEuroFilter {
  private xPrev: number;
  private dxPrev: number;
  private tPrev: number;
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private initialized: boolean = false;
  
  constructor(minCutoff: number = 1.0, beta: number = 0.007, dCutoff: number = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xPrev = 0;
    this.dxPrev = 0;
    this.tPrev = 0;
  }
  
  private alpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }
  
  filter(x: number, t: number): number {
    if (!this.initialized) {
      this.xPrev = x;
      this.dxPrev = 0;
      this.tPrev = t;
      this.initialized = true;
      return x;
    }
    
    const dt = t - this.tPrev;
    if (dt <= 0) return this.xPrev;
    
    // Estimate derivative
    const dx = (x - this.xPrev) / dt;
    const edx = this.alpha(this.dCutoff, dt) * dx + (1 - this.alpha(this.dCutoff, dt)) * this.dxPrev;
    
    // Adaptive cutoff based on derivative
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    
    // Filter
    const result = this.alpha(cutoff, dt) * x + (1 - this.alpha(cutoff, dt)) * this.xPrev;
    
    this.xPrev = result;
    this.dxPrev = edx;
    this.tPrev = t;
    
    return result;
  }
  
  reset() {
    this.initialized = false;
  }
}

/**
 * 3D position filter using One Euro Filter for each axis
 */
export class PositionFilter {
  private filterX: OneEuroFilter;
  private filterY: OneEuroFilter;
  private filterZ: OneEuroFilter;
  
  constructor(minCutoff: number = 1.0, beta: number = 0.007) {
    this.filterX = new OneEuroFilter(minCutoff, beta);
    this.filterY = new OneEuroFilter(minCutoff, beta);
    this.filterZ = new OneEuroFilter(minCutoff, beta);
  }
  
  filter(position: THREE.Vector3, t: number): THREE.Vector3 {
    return new THREE.Vector3(
      this.filterX.filter(position.x, t),
      this.filterY.filter(position.y, t),
      this.filterZ.filter(position.z, t)
    );
  }
  
  reset() {
    this.filterX.reset();
    this.filterY.reset();
    this.filterZ.reset();
  }
}
