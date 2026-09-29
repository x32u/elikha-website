import { useEffect, useRef } from 'react';
import { mapToScreen, mapToDualScreenPoints } from '../hooks/useGestureSelect';
import type { HandLandmarks } from '../hooks/useHandTrackingV2';

export function PaintCursor({ landmarks, videoRef, color, enabled, mirrorX, dualScreenMode = false }: {
  landmarks: HandLandmarks | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  color: string;
  enabled: boolean;
  mirrorX: boolean;
  dualScreenMode?: boolean;
}) {
  const latest = useRef(landmarks);
  latest.current = landmarks;
  const dots = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const tip = latest.current?.indexTip;
      const points = enabled && tip ? (dualScreenMode
        ? mapToDualScreenPoints(tip, videoRef.current, mirrorX)
        : [mapToScreen(tip, videoRef.current, mirrorX)]) : [];
      dots.current.forEach((dot, index) => {
        if (!dot) return;
        const point = points[index];
        dot.style.display = point ? 'block' : 'none';
        if (point) dot.style.transform = `translate(${point.x - 11}px, ${point.y - 11}px)`;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enabled, mirrorX, dualScreenMode, videoRef]);
  return <>{[0, 1].map(index => <div key={index} ref={node => { dots.current[index] = node; }} aria-hidden="true" style={{
    display: 'none', position: 'fixed', top: 0, left: 0, width: 22, height: 22,
    boxSizing: 'border-box', borderRadius: '50%', backgroundColor: color, border: '2px solid white',
    boxShadow: '0 0 0 1px #2A2A45', pointerEvents: 'none', zIndex: 30,
  }} />)}</>;
}
