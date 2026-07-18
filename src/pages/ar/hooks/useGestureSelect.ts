import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { HandLandmarks } from './useHandTrackingV2';
import { isPointingGesture } from '../utils/gestures';

interface GestureSelectOptions {
  landmarks: HandLandmarks | null;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  mirrorX?: boolean;
  enabled?: boolean;
  blocked?: boolean;
  dwellMs?: number;
  pointingGraceMs?: number;
  targetGraceMs?: number;
  dualScreenMode?: boolean;
}

function applyHover(target: HTMLElement | null, previous: HTMLElement | null) {
  if (previous && previous !== target) {
    previous.classList.remove('gesture-hover');
    previous.removeAttribute('data-gesture-hover');
  }
  if (target) {
    target.classList.add('gesture-hover');
    target.setAttribute('data-gesture-hover', 'true');
  }
}

function triggerSelect(target: HTMLElement, x: number, y: number) {
  if (target.hasAttribute('disabled')) return;

  if (target instanceof HTMLInputElement && target.type === 'range') {
    const rect = target.getBoundingClientRect();
    const ratio = rect.width > 0 ? (x - rect.left) / rect.width : 0.5;
    const min = parseFloat(target.min || '0');
    const max = parseFloat(target.max || '1');
    const value = min + THREE.MathUtils.clamp(ratio, 0, 1) * (max - min);
    target.value = value.toString();
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y }));
  target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y }));
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
}

function mapToViewport(
  lm: { x: number; y: number },
  video: HTMLVideoElement | null,
  mirrorX: boolean,
  viewport: { x: number; y: number; width: number; height: number }
): { x: number; y: number } {
  const vw = viewport.width;
  const vh = viewport.height;

  const videoW = video?.videoWidth || vw;
  const videoH = video?.videoHeight || vh;
  const videoAspect = videoW / videoH;
  const viewAspect = vw / vh;

  let displayW = vw;
  let displayH = vh;
  let offsetX = 0;
  let offsetY = 0;

  if (videoAspect > viewAspect) {
    displayH = vh;
    displayW = vh * videoAspect;
    offsetX = (vw - displayW) / 2;
  } else {
    displayW = vw;
    displayH = vw / videoAspect;
    offsetY = (vh - displayH) / 2;
  }

  const nx = mirrorX ? 1 - lm.x : lm.x;
  const x = viewport.x + offsetX + nx * displayW;
  const y = viewport.y + offsetY + lm.y * displayH;
  return { x, y };
}

function mapToScreen(
  lm: { x: number; y: number },
  video: HTMLVideoElement | null,
  mirrorX: boolean
): { x: number; y: number } {
  return mapToViewport(lm, video, mirrorX, {
    x: 0,
    y: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  });
}

function mapToDualScreenPoints(
  lm: { x: number; y: number },
  video: HTMLVideoElement | null,
  mirrorX: boolean
): Array<{ x: number; y: number }> {
  const halfWidth = window.innerWidth / 2;
  const height = window.innerHeight;

  return [
    mapToViewport(lm, video, mirrorX, { x: 0, y: 0, width: halfWidth, height }),
    mapToViewport(lm, video, mirrorX, { x: halfWidth, y: 0, width: halfWidth, height }),
  ];
}

function distance2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function isIndexExtendedLoose(landmarks: HandLandmarks): boolean {
  const { wrist, indexMcp, middleMcp, pinkyMcp, indexTip } = landmarks;
  const palm = {
    x: (wrist.x + indexMcp.x + middleMcp.x + pinkyMcp.x) / 4,
    y: (wrist.y + indexMcp.y + middleMcp.y + pinkyMcp.y) / 4,
  };
  const tipDist = distance2D(indexTip, palm);
  const mcpDist = distance2D(indexMcp, palm);
  const verticalExtended = indexTip.y < indexMcp.y - 0.02;
  return tipDist > mcpDist * 1.05 || verticalExtended;
}

export function useGestureSelect({
  landmarks,
  videoRef,
  mirrorX = true,
  enabled = true,
  blocked = false,
  dwellMs = 1200,
  pointingGraceMs = 350,
  targetGraceMs = 260,
  dualScreenMode = false,
}: GestureSelectOptions) {
  const rafRef = useRef<number | null>(null);
  const lastTargetRef = useRef<HTMLElement | null>(null);
  const dwellStartRef = useRef<number>(0);
  const triggeredTargetRef = useRef<HTMLElement | null>(null);
  const lastTargetTimeRef = useRef<number>(0);
  const lastPointingTimeRef = useRef<number>(0);
  const landmarksRef = useRef<HandLandmarks | null>(null);

  useEffect(() => {
    landmarksRef.current = landmarks;
  }, [landmarks]);

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      const now = performance.now();
      const lm = landmarksRef.current;
      const pointingActive = lm ? (isPointingGesture(lm) || isIndexExtendedLoose(lm)) : false;
      if (pointingActive) {
        lastPointingTimeRef.current = now;
      }

      if (!lm || blocked) {
        applyHover(null, lastTargetRef.current);
        lastTargetRef.current = null;
        triggeredTargetRef.current = null;
        dwellStartRef.current = 0;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const points = dualScreenMode
        ? mapToDualScreenPoints(lm.indexTip, videoRef?.current ?? null, mirrorX)
        : [mapToScreen(lm.indexTip, videoRef?.current ?? null, mirrorX)];

      let target: HTMLElement | null = null;
      let activePoint = points[0];
      for (const point of points) {
        const elements = document.elementsFromPoint(point.x, point.y);
        for (const el of elements) {
          if (!(el instanceof HTMLElement)) continue;
          const found = el.closest('[data-gesture-target="true"]') as HTMLElement | null;
          if (found) {
            target = found;
            activePoint = point;
            break;
          }
        }
        if (target) break;
      }

      const resolvedTarget = target ?? null;
      if (resolvedTarget) {
        lastTargetTimeRef.current = now;
      } else if (lastTargetRef.current && now - lastTargetTimeRef.current < targetGraceMs) {
        const rect = lastTargetRef.current.getBoundingClientRect();
        const margin = 18;
        const isStillNear = points.some(({ x, y }) => (
          x >= rect.left - margin &&
          x <= rect.right + margin &&
          y >= rect.top - margin &&
          y <= rect.bottom + margin
        ));
        if (isStillNear) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
      }
      if (resolvedTarget !== lastTargetRef.current) {
        applyHover(resolvedTarget, lastTargetRef.current);
        lastTargetRef.current = resolvedTarget;
        dwellStartRef.current = resolvedTarget ? now : 0;
        triggeredTargetRef.current = null;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (resolvedTarget && triggeredTargetRef.current !== resolvedTarget) {
        if (now - dwellStartRef.current >= dwellMs) {
          triggerSelect(resolvedTarget, activePoint.x, activePoint.y);
          triggeredTargetRef.current = resolvedTarget;
          dwellStartRef.current = now;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      applyHover(null, lastTargetRef.current);
      lastTargetRef.current = null;
      triggeredTargetRef.current = null;
      dwellStartRef.current = 0;
    };
  }, [enabled, blocked, dwellMs, mirrorX, pointingGraceMs, targetGraceMs, videoRef, dualScreenMode]);
}
