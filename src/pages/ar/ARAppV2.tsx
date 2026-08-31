import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { CameraFeed } from './components/CameraFeed';
import { ARSceneV2 } from './components/ARSceneV2';
import { ControlPanel, type PaintTool } from './components/ControlPanel';
import { DebugOverlay } from './components/DebugOverlay';
import { useHandTrackingV2 } from './hooks/useHandTrackingV2';
import { isOpenPalmGesture } from './utils/gestures';
import { useGestureSelect } from './hooks/useGestureSelect';
import { useArTutorial } from './hooks/useArTutorial';
import { submitActivity, saveArtwork } from '../../services/studentApi';
import './App.css';

type ARAppV2Props = {
  onExit?: () => void;
  activityId?: string;
  studentId?: string;
  viewMode?: 'edit' | 'view';
  artworkUrl?: string;
};

function ARAppV2({ onExit, activityId, studentId, viewMode = 'edit', artworkUrl }: ARAppV2Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sceneCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isViewMode = viewMode === 'view';

  // New V2 hand tracking state
  const {
    isTracking,
    landmarks,
    landmarksB,
    grabState,
    debugInfo,
    targetQuaternion,
  } = useHandTrackingV2(videoRef);

  const [paintColor, setPaintColor] = useState(new THREE.Color('#ff4444'));
  const [activeTool, setActiveTool] = useState<PaintTool>('paint');
  const [brushLevel, setBrushLevel] = useState(10);
  const [debugMode] = useState(false);
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);
  const paintMode = !isViewMode && ['paint', 'bucket', 'eraser', 'remove'].includes(activeTool);
  const brushScale = brushLevel / 10;
  const toolConfig = useMemo(() => {
    if (activeTool === 'paint') {
      return {
        color: paintColor,
        brushSize: 0.11 * brushScale,
        isEraser: false,
        isBucketFill: false,
        isRemoveTool: false,
        label: 'Paint',
      };
    }
    if (activeTool === 'bucket') {
      return {
        color: paintColor,
        brushSize: 0.11 * brushScale,
        isEraser: false,
        isBucketFill: true,
        isRemoveTool: false,
        label: 'Bucket',
      };
    }
    if (activeTool === 'eraser') {
      return {
        color: paintColor,
        brushSize: 0.14 * brushScale,
        isEraser: true,
        isBucketFill: false,
        isRemoveTool: false,
        label: 'Eraser',
      };
    }
    if (activeTool === 'remove') {
      return {
        color: paintColor,
        brushSize: 0.11 * brushScale,
        isEraser: false,
        isBucketFill: false,
        isRemoveTool: true,
        label: 'Remove',
      };
    }
    if (activeTool === 'grabAll') {
      return {
        color: paintColor,
        brushSize: 0.11 * brushScale,
        isEraser: false,
        isBucketFill: false,
        isRemoveTool: false,
        label: 'Grab All',
      };
    }
    return {
      color: paintColor,
      brushSize: 0.11 * brushScale,
      isEraser: false,
      isBucketFill: false,
      isRemoveTool: false,
      label: 'Move',
    };
  }, [activeTool, paintColor, brushScale]);

  const handleBrushLevelChange = useCallback((level: number) => {
    setBrushLevel(Math.max(1, Math.min(10, Math.round(level))));
  }, []);

  const handleCameraReady = useCallback(() => {
    console.log('Camera ready for V2 tracking');
  }, []);

  const isOpenPalm = landmarks ? isOpenPalmGesture(landmarks) : false;
  const isOpenPalmB = landmarksB ? isOpenPalmGesture(landmarksB) : false;
  const isDoublePalm = isOpenPalm && isOpenPalmB;

  const [exitCountdown, setExitCountdown] = useState<number | null>(null);
  const exitArmingRef = useRef(false);
  const armTimeoutRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const palmsOpenRef = useRef(false);
  const submitInFlightRef = useRef(false);
  const [submitState, setSubmitState] = useState<{ status: 'idle' | 'submitting' | 'success' | 'error'; message?: string }>({ status: 'idle' });

  useEffect(() => {
    palmsOpenRef.current = isDoublePalm;
  }, [isDoublePalm]);

  const captureSubmissionImage = useCallback(() => {
    const sceneCanvas = sceneCanvasRef.current;
    if (!sceneCanvas) return null;

    try {
      const width = sceneCanvas.width || 1280;
      const height = sceneCanvas.height || 720;
      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = width;
      outputCanvas.height = height;

      const ctx = outputCanvas.getContext('2d');
      if (!ctx) return null;

      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#f8ecff');
      gradient.addColorStop(0.5, '#e8f7ff');
      gradient.addColorStop(1, '#f2ffe8');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      const keyedCanvas = document.createElement('canvas');
      keyedCanvas.width = width;
      keyedCanvas.height = height;
      const keyedCtx = keyedCanvas.getContext('2d');

      if (keyedCtx) {
        keyedCtx.drawImage(sceneCanvas, 0, 0, width, height);
        const frame = keyedCtx.getImageData(0, 0, width, height);
        const { data } = frame;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const chroma = max - min;

          if (max < 18 && chroma < 14) {
            data[i + 3] = 0;
            continue;
          }

          if (max < 36 && chroma < 20) {
            const alphaScale = Math.max(0, (max - 18) / 18);
            data[i + 3] = Math.round(data[i + 3] * alphaScale);
          }
        }

        keyedCtx.putImageData(frame, 0, 0);
        ctx.drawImage(keyedCanvas, 0, 0, width, height);
      } else {
        ctx.drawImage(sceneCanvas, 0, 0, width, height);
      }

      return outputCanvas.toDataURL('image/jpeg', 0.9);
    } catch (error) {
      console.error('Failed to capture AR snapshot:', error);
      return null;
    }
  }, []);

  const handleSubmitAndExit = useCallback(async () => {
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    setSubmitState({ status: 'submitting' });

    try {
      if (isViewMode) {
        setSubmitState({ status: 'success' });
        onExit?.();
        return;
      }

      if (!activityId || !studentId) {
        throw new Error('Missing activity or student information.');
      }

      const snapshot = captureSubmissionImage();

      const result = await submitActivity(studentId, activityId, {
        artwork_url: snapshot,
        description: 'Submitted from AR',
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to submit activity.');
      }

      if (snapshot) {
        await saveArtwork(studentId, {
          title: `AR Submission ${new Date().toLocaleDateString()}`,
          description: 'AR model snapshot',
          image_url: snapshot,
          submission_id: result.data?.id || null,
        });
      }

      setSubmitState({ status: 'success' });
      onExit?.();
    } catch (error) {
      console.error('Failed to submit activity:', error);
      submitInFlightRef.current = false;
      setSubmitState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to submit activity.',
      });
    }
  }, [activityId, studentId, onExit, captureSubmissionImage, isViewMode]);

  useEffect(() => {
    if (!isDoublePalm) {
      if (armTimeoutRef.current) {
        window.clearTimeout(armTimeoutRef.current);
        armTimeoutRef.current = null;
      }
      if (countdownIntervalRef.current) {
        window.clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      exitArmingRef.current = false;
      setExitCountdown(null);
      return;
    }

    if (!exitArmingRef.current && exitCountdown === null) {
      exitArmingRef.current = true;
      armTimeoutRef.current = window.setTimeout(() => {
        if (!palmsOpenRef.current) {
          exitArmingRef.current = false;
          return;
        }
        let count = 3;
        setExitCountdown(count);
        countdownIntervalRef.current = window.setInterval(() => {
          if (!palmsOpenRef.current) {
            if (countdownIntervalRef.current) {
              window.clearInterval(countdownIntervalRef.current);
              countdownIntervalRef.current = null;
            }
            exitArmingRef.current = false;
            setExitCountdown(null);
            return;
          }
          count -= 1;
          if (count <= 0) {
            if (countdownIntervalRef.current) {
              window.clearInterval(countdownIntervalRef.current);
              countdownIntervalRef.current = null;
            }
            setExitCountdown(0);
            exitArmingRef.current = false;
            handleSubmitAndExit();
          } else {
            setExitCountdown(count);
          }
        }, 1000);
      }, 1000);
    }
  }, [isDoublePalm, exitCountdown, handleSubmitAndExit]);

  useGestureSelect({
    landmarks,
    videoRef,
    enabled: !isViewMode,
    blocked: grabState.isZooming,
    dwellMs: 500,
  });

  const { needsGesture, triggerSpeak, ttsAvailable, currentTexts } = useArTutorial({ grabState, enabled: !isViewMode });

  useEffect(() => {
    const videoElement = videoRef.current;
    return () => {
      if (videoElement?.srcObject) {
        const stream = videoElement.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Camera feed background */}
      <CameraFeed
        videoRef={videoRef}
        facingMode="user"
        onReady={handleCameraReady}
      />

      {/* Three.js AR scene V2 */}
      <ARSceneV2
        modelUrl="/models/cute_cactus.glb"
        handLandmarks={landmarks}
        grabState={grabState}
        debugInfo={debugInfo}
        targetQuaternion={targetQuaternion}
        paintMode={paintMode}
        paintColor={toolConfig.color}
        brushSize={toolConfig.brushSize}
        isEraser={toolConfig.isEraser}
        isBucketFill={toolConfig.isBucketFill}
        isRemoveTool={toolConfig.isRemoveTool}
        debugMode={debugMode}
        onCanvasReady={(canvas) => {
          sceneCanvasRef.current = canvas;
        }}
      />

      {!isViewMode && (
        <DebugOverlay
          debugInfo={debugInfo}
          grabState={grabState}
          isTracking={isTracking}
          videoRef={videoRef}
          landmarks={landmarks}
          isOpen={debugPanelOpen}
          onToggle={() => setDebugPanelOpen((prev) => !prev)}
        />
      )}

      {!isViewMode && (
        <ControlPanel
          paintColor={paintColor}
          onPaintColorChange={(color) => setPaintColor(color)}
          activeTool={activeTool}
          onToolChange={setActiveTool}
          brushLevel={brushLevel}
          onBrushLevelChange={handleBrushLevelChange}
        />
      )}

      {!isViewMode && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0, 0, 0, 0.65)',
            borderRadius: 999,
            padding: '6px 12px',
            color: 'white',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            zIndex: 1000,
            backdropFilter: 'blur(10px)',
          }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: `#${toolConfig.color.getHexString()}`,
              border: '1px solid rgba(255,255,255,0.6)',
              boxShadow: '0 0 6px rgba(0,0,0,0.35)',
            }}
          />
          <span>{toolConfig.label}</span>
        </div>
      )}

      {isViewMode && artworkUrl && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.55)',
            borderRadius: 12,
            padding: 8,
            backdropFilter: 'blur(8px)',
            maxWidth: 120,
          }}
        >
          <img
            src={artworkUrl}
            alt="Submitted artwork preview"
            style={{
              width: 104,
              height: 104,
              borderRadius: 8,
              objectFit: 'cover',
              border: '1px solid rgba(255,255,255,0.25)',
              display: 'block',
            }}
          />
        </div>
      )}

      {needsGesture && ttsAvailable && (
        <button
          onClick={triggerSpeak}
          type="button"
          style={{
            position: 'absolute',
            top: 54,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(255, 255, 255, 0.95)',
            color: '#111',
            border: 'none',
            borderRadius: 999,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 600,
            boxShadow: '0 6px 16px rgba(0,0,0,0.2)',
            cursor: 'pointer',
            zIndex: 1100,
          }}
        >
          Tap to enable voice
        </button>
      )}

      {!ttsAvailable && currentTexts.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 54,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(255, 255, 255, 0.95)',
            color: '#111',
            borderRadius: 16,
            padding: '10px 14px',
            fontSize: 12,
            fontWeight: 600,
            boxShadow: '0 6px 16px rgba(0,0,0,0.2)',
            zIndex: 1100,
            textAlign: 'center',
            maxWidth: 320,
          }}
        >
          <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>
            Voice unavailable — showing captions
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {currentTexts.map((text, index) => (
              <span key={`${text}-${index}`}>{text}</span>
            ))}
          </div>
        </div>
      )}

      {exitCountdown !== null && exitCountdown > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1200,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: 140,
              height: 140,
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: 64,
              fontWeight: 700,
              boxShadow: '0 0 20px rgba(0,0,0,0.4)',
            }}
          >
            {exitCountdown}
          </div>
        </div>
      )}

      {submitState.status === 'submitting' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1250,
            background: 'rgba(0,0,0,0.45)',
          }}
        >
          <div
            style={{
              background: 'rgba(0,0,0,0.75)',
              color: 'white',
              padding: '14px 18px',
              borderRadius: 14,
              fontSize: 14,
              fontWeight: 600,
              boxShadow: '0 10px 24px rgba(0,0,0,0.35)',
            }}
          >
            {isViewMode ? 'Exiting view...' : 'Submitting your artwork...'}
          </div>
        </div>
      )}

      {submitState.status === 'error' && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(180, 0, 0, 0.85)',
            color: 'white',
            padding: '10px 14px',
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 600,
            zIndex: 1250,
            boxShadow: '0 8px 20px rgba(0,0,0,0.3)',
          }}
        >
          {submitState.message || 'Submission failed. Try again.'}
        </div>
      )}

      {/* Instructions overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: 20,
          background: 'rgba(0, 0, 0, 0.8)',
          borderRadius: 8,
          padding: 12,
          color: 'white',
          fontSize: 12,
          maxWidth: 320,
          backdropFilter: 'blur(10px)',
          zIndex: 1000,
        }}
      >
        <strong>🎮 Grab-to-Rotate Controls:</strong>
        <ul style={{ margin: '8px 0 0 0', paddingLeft: 16, lineHeight: 1.6 }}>
          <li>✊ <strong>Make a fist</strong> to rotate</li>
          <li>👉 <strong>Move hand left/right</strong> → Yaw rotation</li>
          <li>👆 <strong>Move hand up/down</strong> → Pitch rotation</li>
          <li>🤏 <strong>Pinch</strong> to move the model</li>
          <li>✊✊ <strong>Two fists</strong> → Apart = zoom in, closer = zoom out</li>
          <li>✋ <strong>Open hand</strong> to release</li>
          {!isViewMode && <li>☝️ <strong>Point</strong> to paint on surface</li>}
          {!isViewMode && <li>🖱️ <strong>Point at tool/color buttons</strong> to switch</li>}
          {!isViewMode && <li>🪣 <strong>Bucket</strong> fills the model, or only the pointed puzzle piece in puzzle mode</li>}
          <li>
            🖐️🖐️ <strong>Two open palms</strong> → {isViewMode ? 'Exit' : 'Submit &amp; Exit'} (hold)
          </li>
        </ul>
        <div style={{ marginTop: 10, fontSize: 11, color: '#aaa', borderTop: '1px solid #444', paddingTop: 8 }}>
          <strong>Tips:</strong> Keep fist closed while moving. 
          Diagonal movement rotates both axes smoothly.
        </div>
      </div>
    </div>
  );
}

export default ARAppV2;
