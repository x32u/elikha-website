import React from 'react';
import type { DebugInfo, GrabState } from '../hooks/useHandTrackingV2';
import { CONFIG } from '../hooks/useHandTrackingV2';

interface DebugOverlayProps {
  debugInfo: DebugInfo;
  grabState: GrabState;
  isTracking: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  landmarks: { allLandmarks: Array<{ x: number; y: number; z?: number }> } | null;
  isOpen: boolean;
  onToggle: () => void;
}

export function DebugOverlay({
  debugInfo,
  grabState,
  isTracking,
  videoRef,
  landmarks,
  isOpen,
  onToggle,
}: DebugOverlayProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  // Draw only palm center and grab indicator on canvas (not full skeleton - that's in 3D)
  React.useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match canvas size to video
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!landmarks) return;

    // Only draw palm center indicator (yellow circle) - skeleton is shown in 3D
    // Note: Canvas is CSS mirrored, and palmCenter.x is already mirrored (1-x), 
    // so we use it directly to get correct position on mirrored canvas
    if (debugInfo.palmCenter) {
      ctx.beginPath();
      const palmX = debugInfo.palmCenter.x * canvas.width;
      const palmY = debugInfo.palmCenter.y * canvas.height;
      ctx.arc(palmX, palmY, 12, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 0, 0.6)';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Label
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('PALM', palmX - 15, palmY - 16);
    }

    // Draw grab start position (magenta)
    if (grabState.grabStartPosition) {
      ctx.beginPath();
      const startX = grabState.grabStartPosition.x * canvas.width;
      const startY = grabState.grabStartPosition.y * canvas.height;
      ctx.arc(startX, startY, 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 0, 255, 0.6)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // Draw line from start to current
      if (debugInfo.palmCenter) {
        ctx.beginPath();
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.moveTo(startX, startY);
        const currentX = debugInfo.palmCenter.x * canvas.width;
        const currentY = debugInfo.palmCenter.y * canvas.height;
        ctx.lineTo(currentX, currentY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }, [landmarks, debugInfo, grabState, videoRef]);

  const radToDeg = (rad: number) => (rad * 180 / Math.PI).toFixed(1);

  return (
    <>
      {/* Canvas overlay for landmarks - coordinates are already mirrored */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 2,
          pointerEvents: 'none',
          // NO CSS mirror - palmCenter.x is already mirrored (1-x) in the hook
        }}
      />

      {/* Debug toggle dot */}
      <button
        onClick={onToggle}
        aria-label="Toggle debug panel"
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          width: 14,
          height: 14,
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.6)',
          background: isOpen ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.25)',
          boxShadow: '0 0 8px rgba(0,0,0,0.35)',
          cursor: 'pointer',
          zIndex: 120,
        }}
      />

      {/* Debug info panel */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 20,
            right: 20,
            background: 'rgba(0, 0, 0, 0.8)',
            borderRadius: 8,
            padding: 16,
            color: 'white',
            fontSize: 12,
            fontFamily: 'monospace',
            zIndex: 100,
            minWidth: 280,
          }}
        >
          <h3 style={{ margin: '0 0 12px 0', fontSize: 14, borderBottom: '1px solid #555', paddingBottom: 8 }}>
            🖐️ Hand Tracking Debug
          </h3>

          {/* Status */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>Tracking:</span>
              <span style={{ color: isTracking ? '#4ade80' : '#f87171' }}>
                {isTracking ? '● ACTIVE' : '○ LOST'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>FPS:</span>
              <span>{debugInfo.fps}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>Fingers Curled:</span>
              <span>{debugInfo.fingersCurled} / 5</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>Fist Raw:</span>
              <span style={{ color: debugInfo.isFistRaw ? '#fbbf24' : '#6b7280' }}>
                {debugInfo.isFistRaw ? 'YES' : 'NO'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>Grab Active:</span>
              <span style={{ color: debugInfo.grabActive ? '#4ade80' : '#6b7280', fontWeight: 'bold' }}>
                {debugInfo.grabActive ? '✊ GRABBING' : '✋ OPEN'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>Pinch Active:</span>
              <span style={{ color: debugInfo.pinchActive ? '#60a5fa' : '#6b7280', fontWeight: 'bold' }}>
                {debugInfo.pinchActive ? '🤏 PINCH' : '○ NONE'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>Zoom Active:</span>
              <span style={{ color: debugInfo.zoomActive ? '#f59e0b' : '#6b7280', fontWeight: 'bold' }}>
                {debugInfo.zoomActive ? '✊✊ ZOOM' : '○ NONE'}
              </span>
            </div>
          </div>

          {/* Palm Position */}
          <div style={{ marginBottom: 12, borderTop: '1px solid #555', paddingTop: 8 }}>
            <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Palm Center:</div>
            {debugInfo.palmCenter ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>X:</span>
                  <span>{debugInfo.palmCenter.x.toFixed(3)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Y:</span>
                  <span>{debugInfo.palmCenter.y.toFixed(3)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Z (depth):</span>
                  <span>{debugInfo.palmCenter.z.toFixed(3)}</span>
                </div>
              </>
            ) : (
              <div style={{ color: '#6b7280' }}>No data</div>
            )}
          </div>

          {/* Delta / Rotation */}
          <div style={{ marginBottom: 12, borderTop: '1px solid #555', paddingTop: 8 }}>
            <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Rotation Deltas:</div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>dx (horizontal):</span>
              <span style={{ color: Math.abs(debugInfo.dx) > 0.01 ? '#60a5fa' : '#6b7280' }}>
                {debugInfo.dx.toFixed(3)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>dy (vertical):</span>
              <span style={{ color: Math.abs(debugInfo.dy) > 0.01 ? '#60a5fa' : '#6b7280' }}>
                {debugInfo.dy.toFixed(3)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>dz (depth):</span>
              <span style={{ color: Math.abs(debugInfo.dz) > 0.01 ? '#60a5fa' : '#6b7280' }}>
                {debugInfo.dz.toFixed(3)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <span>Pinch Dist:</span>
              <span style={{ color: debugInfo.isPinchRaw ? '#60a5fa' : '#6b7280' }}>
                {debugInfo.pinchDistance.toFixed(3)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <span>Zoom Dist:</span>
              <span style={{ color: debugInfo.zoomActive ? '#f59e0b' : '#6b7280' }}>
                {debugInfo.zoomDistance.toFixed(3)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <span>Yaw Angle:</span>
              <span style={{ color: '#a78bfa' }}>{radToDeg(debugInfo.yawAngle)}°</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Pitch Angle:</span>
              <span style={{ color: '#a78bfa' }}>{radToDeg(debugInfo.pitchAngle)}°</span>
            </div>
          </div>

          {/* Config */}
          <div style={{ borderTop: '1px solid #555', paddingTop: 8, opacity: 0.7 }}>
            <div style={{ fontWeight: 'bold', marginBottom: 4, fontSize: 11 }}>Config:</div>
            <div style={{ fontSize: 10 }}>
              <div>yawSens: {CONFIG.yawSensitivity} | pitchSens: {CONFIG.pitchSensitivity}</div>
              <div>deadzone: {CONFIG.deadzone} | smooth: {CONFIG.smoothingAlpha}</div>
              <div>grabMs: {CONFIG.grabDebounceMs} | releaseMs: {CONFIG.releaseDebounceMs}</div>
              <div>slerp: {CONFIG.slerpFactor} | pitchClamp: ±{radToDeg(CONFIG.pitchClamp)}°</div>
            </div>
          </div>
        </div>
      )}

      {/* Visual indicator for grab state */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          background: grabState.isGrabbing ? 'rgba(255, 136, 68, 0.9)' : 'rgba(68, 255, 68, 0.7)',
          borderRadius: 20,
          padding: '8px 20px',
          color: 'white',
          fontSize: 14,
          fontWeight: 'bold',
          zIndex: 100,
          transition: 'background 0.2s',
        }}
      >
        {grabState.isGrabbing ? '✊ Rotate Mode' : '✋ Free'}
      </div>
    </>
  );
}
