import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { CameraFeed } from './components/CameraFeed';
import { ARSceneV2, type SerializedArGroupTransform, type SerializedBaseModelTransform, type SerializedPaintDecal, type SerializedPuzzlePiece, type SerializedSceneObject } from './components/ARSceneV2';
import { ControlPanel, type PaintTool } from './components/ControlPanel';
import { DebugOverlay } from './components/DebugOverlay';
import { useHandTrackingV2 } from './hooks/useHandTrackingV2';
import { isMiddleFingerGesture, isOpenPalmGesture } from './utils/gestures';
import { useGestureSelect } from './hooks/useGestureSelect';
import { useArTutorial } from './hooks/useArTutorial';
import { submitActivity, saveArtwork, reportGestureAlert } from '../../services/studentApi';
import { encodeArSubmissionDescription } from '../../utils/arSubmission';
import { resolveArObjectDefinitions } from '../../utils/activityArConfig';
import './App.css';

type ARAppProps = {
  onExit?: () => void;
  activityId?: string;
  studentId?: string;
  modelUrl?: string;
  modelFileType?: string;
  modelConfigs?: Array<{ id?: string; label?: string; modelUrl: string; modelFileType?: string }>;
  viewMode?: 'edit' | 'view';
  artworkUrl?: string;
  arInstructions?: string;
  initialPaintState?: SerializedPaintDecal[];
  initialSceneState?: SerializedSceneObject[];
  initialPuzzleState?: SerializedPuzzlePiece[];
  initialModelState?: SerializedBaseModelTransform[];
  initialGroupState?: SerializedArGroupTransform | null;
  allowedObjectIds?: string[];
  puzzlePieces?: number;
  mobileMode?: boolean;
  vrMode?: boolean;
};

type ArHistorySnapshot = {
  paint: SerializedPaintDecal[];
  scene: SerializedSceneObject[];
  puzzle: SerializedPuzzlePiece[];
  model: SerializedBaseModelTransform[];
  group: SerializedArGroupTransform | null;
};

type HydratedArState = ArHistorySnapshot & {
  version: number;
};

const EMPTY_PAINT_STATE: SerializedPaintDecal[] = [];
const EMPTY_SCENE_STATE: SerializedSceneObject[] = [];
const EMPTY_PUZZLE_STATE: SerializedPuzzlePiece[] = [];
const EMPTY_MODEL_STATE: SerializedBaseModelTransform[] = [];
const EMPTY_GROUP_STATE: SerializedArGroupTransform | null = null;
const MAX_UNDO_STEPS = 30;

function cloneSerializedArray<T>(value: T[] = []): T[] {
  return JSON.parse(JSON.stringify(value || [])) as T[];
}

function cloneSnapshot(snapshot: ArHistorySnapshot): ArHistorySnapshot {
  return {
    paint: cloneSerializedArray(snapshot.paint),
    scene: cloneSerializedArray(snapshot.scene),
    puzzle: cloneSerializedArray(snapshot.puzzle),
    model: cloneSerializedArray(snapshot.model),
    group: snapshot.group ? JSON.parse(JSON.stringify(snapshot.group)) : null,
  };
}

function createSnapshotKey(snapshot: ArHistorySnapshot): string {
  return JSON.stringify({
    paint: snapshot.paint || [],
    scene: snapshot.scene || [],
    puzzle: snapshot.puzzle || [],
    model: snapshot.model || [],
    group: snapshot.group || null,
  });
}

function parseSnapshotKey(key: string): ArHistorySnapshot {
  try {
    return JSON.parse(key) as ArHistorySnapshot;
  } catch {
    return { paint: [], scene: [], puzzle: [], model: [], group: null };
  }
}

function arraysEqualByValue<T>(left: T[], right: T[]): boolean {
  return JSON.stringify(left || []) === JSON.stringify(right || []);
}

function ARApp({
  onExit,
  activityId,
  studentId,
  modelUrl,
  modelFileType,
  modelConfigs = [],
  viewMode = 'edit',
  artworkUrl,
  arInstructions = '',
  initialPaintState = EMPTY_PAINT_STATE,
  initialSceneState = EMPTY_SCENE_STATE,
  initialPuzzleState = EMPTY_PUZZLE_STATE,
  initialModelState = EMPTY_MODEL_STATE,
  initialGroupState = EMPTY_GROUP_STATE,
  allowedObjectIds = [],
  puzzlePieces = 0,
  mobileMode = false,
  vrMode = false,
}: ARAppProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sceneCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const vrCompositeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isViewMode = viewMode === 'view';
  const normalizedInstructions = typeof arInstructions === 'string' ? arInstructions.trim() : '';
  const [instructionsConfirmed, setInstructionsConfirmed] = useState(!normalizedInstructions || isViewMode);
  const canRunAr = isViewMode || instructionsConfirmed;
  const cameraFacingMode = mobileMode ? 'environment' : 'user';
  const mirrorCameraX = cameraFacingMode === 'user';

  // V2 hand tracking with quaternion-based rotation
  const {
    isTracking,
    landmarks,
    landmarksB,
    grabState,
    debugInfo,
    targetQuaternion,
  } = useHandTrackingV2(videoRef, mirrorCameraX);

  const [paintColor, setPaintColor] = useState(new THREE.Color('#ff4444'));
  const [activeTool, setActiveTool] = useState<PaintTool>('move');
  const [brushLevel, setBrushLevel] = useState(10);
  const initialArStateKey = useMemo(() => createSnapshotKey({
    paint: initialPaintState,
    scene: initialSceneState,
    puzzle: initialPuzzleState,
    model: initialModelState,
    group: initialGroupState,
  }), [initialGroupState, initialModelState, initialPaintState, initialPuzzleState, initialSceneState]);
  const incomingInitialState = useMemo(() => parseSnapshotKey(initialArStateKey), [initialArStateKey]);
  const [hydratedArState, setHydratedArState] = useState<HydratedArState>(() => ({
    ...cloneSnapshot(incomingInitialState),
    version: 0,
  }));
  const paintStateRef = useRef<SerializedPaintDecal[]>(cloneSerializedArray(incomingInitialState.paint));
  const sceneStateRef = useRef<SerializedSceneObject[]>(cloneSerializedArray(incomingInitialState.scene));
  const puzzleStateRef = useRef<SerializedPuzzlePiece[]>(cloneSerializedArray(incomingInitialState.puzzle));
  const modelStateRef = useRef<SerializedBaseModelTransform[]>(cloneSerializedArray(incomingInitialState.model));
  const groupStateRef = useRef<SerializedArGroupTransform | null>(incomingInitialState.group || null);
  const undoStackRef = useRef<ArHistorySnapshot[]>([]);
  const lastUndoCaptureRef = useRef<{ source: string; at: number } | null>(null);
  const applyingUndoRef = useRef(false);
  const [undoCount, setUndoCount] = useState(0);
  const [spawnRequest, setSpawnRequest] = useState<{ requestId: number; objectId: string } | null>(null);
  const [puzzleSpawnRequest, setPuzzleSpawnRequest] = useState<{ requestId: number; pieceId: string } | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [puzzleToolbarState, setPuzzleToolbarState] = useState<SerializedPuzzlePiece[]>(cloneSerializedArray(incomingInitialState.puzzle));
  const [debugMode] = useState(false);
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);
  const availableObjects = useMemo(
    () => resolveArObjectDefinitions(allowedObjectIds),
    [allowedObjectIds]
  );
  const sceneModelConfigs = useMemo(() => {
    const validModels = Array.isArray(modelConfigs)
      ? modelConfigs.filter((model) => typeof model?.modelUrl === 'string' && model.modelUrl.trim())
      : [];
    const configuredModels = validModels.map((model, index) => ({
      instanceId: validModels.length > 1 ? `model-${index}` : '',
      id: model.id || `model-${index}`,
      label: model.label || `Model ${index + 1}`,
      modelUrl: model.modelUrl,
      modelFileType: model.modelFileType,
    }));

    if (configuredModels.length > 0) return configuredModels;

    return [{
      instanceId: '',
      id: 'model-0',
      label: 'Model',
      modelUrl: modelUrl || '/models/13137_LatinMask1_v1.obj',
      modelFileType,
    }];
  }, [modelConfigs, modelFileType, modelUrl]);
  const normalizedPuzzlePieces = puzzlePieces === 3 || puzzlePieces === 4 ? puzzlePieces : 0;
  const modelToolbarControls = useMemo(() => {
    if (normalizedPuzzlePieces || sceneModelConfigs.length <= 1) return [];

    return sceneModelConfigs.map((model, index) => ({
      id: model.instanceId || model.id || `model-${index}`,
      label: model.label || `Model ${index + 1}`,
    }));
  }, [normalizedPuzzlePieces, sceneModelConfigs]);
  useEffect(() => {
    if (!selectedModelId) return;
    if (!modelToolbarControls.some((model) => model.id === selectedModelId)) {
      setSelectedModelId(null);
    }
  }, [modelToolbarControls, selectedModelId]);
  const puzzlePieceControls = useMemo(() => {
    if (!normalizedPuzzlePieces) return [];

    return sceneModelConfigs.flatMap((model, modelIndex) => (
      Array.from({ length: normalizedPuzzlePieces }, (_, index) => {
        const prefix = sceneModelConfigs.length > 1 ? `${model.instanceId || `model-${modelIndex}`}:` : '';
        const id = `${prefix}piece-${index}`;
        const state = puzzleToolbarState.find((piece) => piece.id === id);
        const locked = state?.locked === true;
        const spawned = locked || state?.spawned === true;

        return {
          id,
          label: sceneModelConfigs.length > 1 ? `${model.label} ${index + 1}` : String(index + 1),
          spawned,
          locked,
        };
      })
    ));
  }, [normalizedPuzzlePieces, puzzleToolbarState, sceneModelConfigs]);
  const paintMode = !isViewMode && ['paint', 'bucket', 'eraser', 'remove'].includes(activeTool);
  const isGrabAllMode = isViewMode || activeTool === 'grabAll';
  const compactUi = mobileMode || vrMode;
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

  const getCurrentSnapshot = useCallback((): ArHistorySnapshot => ({
    paint: cloneSerializedArray(paintStateRef.current),
    scene: cloneSerializedArray(sceneStateRef.current),
    puzzle: cloneSerializedArray(puzzleStateRef.current),
    model: cloneSerializedArray(modelStateRef.current),
    group: groupStateRef.current ? JSON.parse(JSON.stringify(groupStateRef.current)) : null,
  }), []);

  const pushUndoSnapshot = useCallback((source: string, coalesceMs = 0) => {
    if (isViewMode || applyingUndoRef.current) return;

    const now = performance.now();
    const lastCapture = lastUndoCaptureRef.current;
    if (
      coalesceMs > 0 &&
      lastCapture?.source === source &&
      now - lastCapture.at < coalesceMs
    ) {
      lastUndoCaptureRef.current = { source, at: now };
      return;
    }

    const snapshot = getCurrentSnapshot();
    const snapshotKey = createSnapshotKey(snapshot);
    const previousSnapshot = undoStackRef.current[undoStackRef.current.length - 1];
    if (previousSnapshot && createSnapshotKey(previousSnapshot) === snapshotKey) {
      lastUndoCaptureRef.current = { source, at: now };
      return;
    }

    undoStackRef.current = [...undoStackRef.current, snapshot].slice(-MAX_UNDO_STEPS);
    lastUndoCaptureRef.current = { source, at: now };
    setUndoCount(undoStackRef.current.length);
  }, [getCurrentSnapshot, isViewMode]);

  const handleUndo = useCallback(() => {
    if (isViewMode || undoStackRef.current.length === 0) return;

    const previousState = undoStackRef.current[undoStackRef.current.length - 1];
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    setUndoCount(undoStackRef.current.length);
    lastUndoCaptureRef.current = null;
    applyingUndoRef.current = true;

    const restoredState = cloneSnapshot(previousState);
    paintStateRef.current = cloneSerializedArray(restoredState.paint);
    sceneStateRef.current = cloneSerializedArray(restoredState.scene);
    puzzleStateRef.current = cloneSerializedArray(restoredState.puzzle);
    modelStateRef.current = cloneSerializedArray(restoredState.model);
    groupStateRef.current = restoredState.group ? JSON.parse(JSON.stringify(restoredState.group)) : null;
    setPuzzleToolbarState(cloneSerializedArray(restoredState.puzzle));
    setHydratedArState((current) => ({
      ...restoredState,
      version: current.version + 1,
    }));

    window.setTimeout(() => {
      applyingUndoRef.current = false;
    }, 300);
  }, [isViewMode]);

  useEffect(() => {
    setInstructionsConfirmed(!normalizedInstructions || isViewMode);
  }, [isViewMode, normalizedInstructions]);

  useEffect(() => {
    applyingUndoRef.current = true;
    const nextInitialState = cloneSnapshot(incomingInitialState);
    paintStateRef.current = cloneSerializedArray(nextInitialState.paint);
    sceneStateRef.current = cloneSerializedArray(nextInitialState.scene);
    puzzleStateRef.current = cloneSerializedArray(nextInitialState.puzzle);
    modelStateRef.current = cloneSerializedArray(nextInitialState.model);
    groupStateRef.current = nextInitialState.group ? JSON.parse(JSON.stringify(nextInitialState.group)) : null;
    setPuzzleToolbarState(cloneSerializedArray(nextInitialState.puzzle));
    setHydratedArState((current) => ({
      ...nextInitialState,
      version: current.version + 1,
    }));
    undoStackRef.current = [];
    lastUndoCaptureRef.current = null;
    setUndoCount(0);

    const timeoutId = window.setTimeout(() => {
      applyingUndoRef.current = false;
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [incomingInitialState]);

  const handlePaintStateChange = useCallback((nextPaintState: SerializedPaintDecal[]) => {
    if (!arraysEqualByValue(paintStateRef.current, nextPaintState)) {
      const coalesceMs = activeTool === 'paint' || activeTool === 'eraser' ? 800 : 0;
      pushUndoSnapshot(`paint:${activeTool}`, coalesceMs);
    }
    paintStateRef.current = nextPaintState;
  }, [activeTool, pushUndoSnapshot]);

  const handleSceneStateChange = useCallback((nextSceneState: SerializedSceneObject[]) => {
    if (!arraysEqualByValue(sceneStateRef.current, nextSceneState)) {
      pushUndoSnapshot(activeTool === 'remove' ? 'scene:remove' : 'scene:change', activeTool === 'remove' ? 0 : 800);
    }
    sceneStateRef.current = nextSceneState;
  }, [activeTool, pushUndoSnapshot]);

  const handlePuzzleStateChange = useCallback((nextPuzzleState: SerializedPuzzlePiece[]) => {
    if (!arraysEqualByValue(puzzleStateRef.current, nextPuzzleState)) {
      pushUndoSnapshot(activeTool === 'remove' ? 'puzzle:remove' : 'puzzle:change', activeTool === 'remove' ? 0 : 800);
    }
    puzzleStateRef.current = nextPuzzleState;
    setPuzzleToolbarState(nextPuzzleState);
  }, [activeTool, pushUndoSnapshot]);

  const handleModelStateChange = useCallback((nextModelState: SerializedBaseModelTransform[]) => {
    if (!arraysEqualByValue(modelStateRef.current, nextModelState)) {
      pushUndoSnapshot('model:change', 800);
    }
    modelStateRef.current = nextModelState;
  }, [pushUndoSnapshot]);

  const handleGroupStateChange = useCallback((nextGroupState: SerializedArGroupTransform) => {
    if (JSON.stringify(groupStateRef.current || null) !== JSON.stringify(nextGroupState || null)) {
      pushUndoSnapshot('group:change', 800);
    }
    groupStateRef.current = nextGroupState;
  }, [pushUndoSnapshot]);

  const handleToolChange = useCallback((tool: PaintTool) => {
    setActiveTool(tool);
    if (tool !== 'move') {
      setSelectedModelId(null);
    }
  }, []);

  const handleAddObject = useCallback((objectId: string) => {
    pushUndoSnapshot('scene:spawn');
    setActiveTool('move');
    setSpawnRequest({
      objectId,
      requestId: Date.now() + Math.random(),
    });
  }, [pushUndoSnapshot]);

  const handleSpawnPuzzlePiece = useCallback((pieceId: string) => {
    pushUndoSnapshot('puzzle:spawn');
    setActiveTool('move');
    setPuzzleSpawnRequest({
      pieceId,
      requestId: Date.now() + Math.random(),
    });
  }, [pushUndoSnapshot]);

  const handleGrabModel = useCallback((modelId: string) => {
    setActiveTool('move');
    setSelectedModelId(modelId);
  }, []);

  const handleCameraReady = useCallback(() => {
    console.log('Camera ready');
  }, []);

  const isOpenPalm = landmarks ? isOpenPalmGesture(landmarks) : false;
  const isOpenPalmB = landmarksB ? isOpenPalmGesture(landmarksB) : false;
  const isDoublePalm = isOpenPalm && isOpenPalmB;
  const middleFingerDetected =
    Boolean(landmarks && isMiddleFingerGesture(landmarks)) ||
    Boolean(landmarksB && isMiddleFingerGesture(landmarksB));

  const [exitCountdown, setExitCountdown] = useState<number | null>(null);
  const [gestureAlertText, setGestureAlertText] = useState<string | null>(null);
  const exitArmingRef = useRef(false);
  const middleFingerHeldRef = useRef(false);
  const middleFingerDebounceTimeoutRef = useRef<number | null>(null);
  const gestureToastTimeoutRef = useRef<number | null>(null);
  const armTimeoutRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const palmsOpenRef = useRef(false);
  const submitInFlightRef = useRef(false);
  const [submitState, setSubmitState] = useState<{ status: 'idle' | 'submitting' | 'success' | 'error'; message?: string }>({ status: 'idle' });

  useEffect(() => {
    if (!vrMode) return;

    let frameId = 0;
    const drawVideoCover = (
      ctx: CanvasRenderingContext2D,
      video: HTMLVideoElement,
      x: number,
      y: number,
      width: number,
      height: number,
      mirrorX: boolean
    ) => {
      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;
      if (!sourceWidth || !sourceHeight) return;

      const sourceRatio = sourceWidth / sourceHeight;
      const targetRatio = width / height;
      let sx = 0;
      let sy = 0;
      let sw = sourceWidth;
      let sh = sourceHeight;

      if (sourceRatio > targetRatio) {
        sw = sourceHeight * targetRatio;
        sx = (sourceWidth - sw) / 2;
      } else {
        sh = sourceWidth / targetRatio;
        sy = (sourceHeight - sh) / 2;
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, width, height);
      ctx.clip();
      if (mirrorX) {
        ctx.translate(x + width, y);
        ctx.scale(-1, 1);
      } else {
        ctx.translate(x, y);
      }
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
      ctx.restore();
    };

    const renderComposite = () => {
      const canvas = vrCompositeCanvasRef.current;
      const video = videoRef.current;
      const sceneCanvas = sceneCanvasRef.current;

      if (canvas) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = window.innerWidth;
        const height = window.innerHeight;
        const pixelWidth = Math.max(1, Math.floor(width * dpr));
        const pixelHeight = Math.max(1, Math.floor(height * dpr));

        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
          canvas.width = pixelWidth;
          canvas.height = pixelHeight;
          canvas.style.width = `${width}px`;
          canvas.style.height = `${height}px`;
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, width, height);

          const eyeWidth = width / 2;
          for (let eye = 0; eye < 2; eye += 1) {
            const eyeX = eye * eyeWidth;
            if (video) {
              drawVideoCover(ctx, video, eyeX, 0, eyeWidth, height, mirrorCameraX);
            } else {
              ctx.fillStyle = '#050505';
              ctx.fillRect(eyeX, 0, eyeWidth, height);
            }

            if (sceneCanvas) {
              ctx.drawImage(sceneCanvas, eyeX, 0, eyeWidth, height);
            }
          }
        }
      }

      frameId = window.requestAnimationFrame(renderComposite);
    };

    renderComposite();
    return () => window.cancelAnimationFrame(frameId);
  }, [mirrorCameraX, vrMode]);

  useEffect(() => {
    palmsOpenRef.current = isDoublePalm;
  }, [isDoublePalm]);

  useEffect(() => {
    if (!canRunAr) return;

    if (isViewMode) return;

    if (!middleFingerDetected) {
      middleFingerHeldRef.current = false;
      if (middleFingerDebounceTimeoutRef.current) {
        window.clearTimeout(middleFingerDebounceTimeoutRef.current);
        middleFingerDebounceTimeoutRef.current = null;
      }
      return;
    }

    if (middleFingerHeldRef.current) return;
    if (middleFingerDebounceTimeoutRef.current) return; // Already waiting

    middleFingerDebounceTimeoutRef.current = window.setTimeout(() => {
      middleFingerHeldRef.current = true;
      middleFingerDebounceTimeoutRef.current = null;

      setGestureAlertText('Please avoid offensive gestures.');
      if (gestureToastTimeoutRef.current) {
        window.clearTimeout(gestureToastTimeoutRef.current);
      }
      gestureToastTimeoutRef.current = window.setTimeout(() => {
        setGestureAlertText(null);
        gestureToastTimeoutRef.current = null;
      }, 3200);

      if (!studentId || !activityId) {
        setGestureAlertText('Please avoid offensive gestures. Could not record this alert.');
        return;
      }

      void (async () => {
        const result = await reportGestureAlert({
          studentId,
          activityId,
          gestureType: 'middle_finger',
          metadata: {
            source: 'ar_session',
            tool: activeTool,
          },
        });

        if (result.success) {
          setGestureAlertText('Please avoid offensive gestures. Alert recorded.');
        } else {
          setGestureAlertText('Please avoid offensive gestures. Failed to record alert.');
          console.error('Gesture alert save failed:', result.error);
        }
      })();
    }, 1000); // Require 1 second hold
  }, [canRunAr, isViewMode, middleFingerDetected, studentId, activityId, activeTool]);

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
      const description = encodeArSubmissionDescription(
        paintStateRef.current,
        'Submitted from AR',
        sceneStateRef.current,
        puzzleStateRef.current,
        modelStateRef.current,
        groupStateRef.current
      );

      const result = await submitActivity(studentId, activityId, {
        artwork_url: snapshot,
        description,
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
    if (!canRunAr) return;

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
  }, [canRunAr, isDoublePalm, exitCountdown, handleSubmitAndExit]);

  useGestureSelect({
    landmarks,
    videoRef,
    enabled: canRunAr && !isViewMode,
    blocked: grabState.isZooming,
    dwellMs: 500,
    dualScreenMode: vrMode,
    mirrorX: mirrorCameraX,
  });

  const tutorialEnabled = canRunAr && !isViewMode && !mobileMode && !vrMode;
  const { needsGesture, triggerSpeak, ttsAvailable, currentTexts } = useArTutorial({ grabState, enabled: tutorialEnabled });

  useEffect(() => {
    const videoElement = videoRef.current;
    return () => {
      if (gestureToastTimeoutRef.current) {
        window.clearTimeout(gestureToastTimeoutRef.current);
        gestureToastTimeoutRef.current = null;
      }
      if (videoElement?.srcObject) {
        const stream = videoElement.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div
      className={`ar-app-root ${compactUi ? 'mobile-ar' : ''} ${vrMode ? 'vr-ar' : ''}`}
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {vrMode && <div className="vr-lens-guide" aria-hidden="true" />}
      {vrMode && <canvas ref={vrCompositeCanvasRef} className="vr-composite-canvas" />}

      {/* Camera feed background */}
      <CameraFeed
        videoRef={videoRef}
        facingMode={cameraFacingMode}
        onReady={handleCameraReady}
      />

      {/* Three.js AR scene V2 */}
      <ARSceneV2
        modelUrl={modelUrl || '/models/13137_LatinMask1_v1.obj'}
        modelFileType={modelFileType || undefined}
        modelConfigs={sceneModelConfigs}
        handLandmarks={canRunAr ? landmarks : null}
        grabState={grabState}
        debugInfo={debugInfo}
        targetQuaternion={targetQuaternion}
        paintMode={canRunAr && paintMode}
        paintColor={toolConfig.color}
        brushSize={toolConfig.brushSize}
        isEraser={toolConfig.isEraser}
        isBucketFill={toolConfig.isBucketFill}
        isRemoveTool={toolConfig.isRemoveTool}
        stateVersion={hydratedArState.version}
        debugMode={debugMode}
        mirrorX={mirrorCameraX}
        initialPaintState={hydratedArState.paint}
        onPaintStateChange={handlePaintStateChange}
        initialSceneState={hydratedArState.scene}
        onSceneStateChange={handleSceneStateChange}
        initialPuzzleState={hydratedArState.puzzle}
        onPuzzleStateChange={handlePuzzleStateChange}
        puzzlePieces={puzzlePieces}
        initialModelState={hydratedArState.model}
        onModelStateChange={handleModelStateChange}
        initialGroupState={hydratedArState.group}
        onGroupStateChange={handleGroupStateChange}
        groupBaseModels={isGrabAllMode}
        spawnObjectRequest={spawnRequest}
        puzzlePieceSpawnRequest={puzzleSpawnRequest}
        selectedModelId={selectedModelId}
        onCanvasReady={(canvas) => {
          sceneCanvasRef.current = canvas;
        }}
      />

      {!canRunAr && normalizedInstructions && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 3000,
            display: 'grid',
            placeItems: 'center',
            padding: 24,
            background: 'linear-gradient(135deg, rgba(248,236,255,0.96) 0%, rgba(232,247,255,0.96) 50%, rgba(242,255,232,0.96) 100%)',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ar-instructions-title"
            style={{
              width: 'min(560px, 92vw)',
              maxHeight: '82vh',
              overflow: 'auto',
              background: 'rgba(255,255,255,0.96)',
              border: '1px solid rgba(24, 0, 173, 0.14)',
              borderRadius: 24,
              boxShadow: '0 24px 70px rgba(24, 0, 173, 0.18)',
              padding: 28,
              color: '#15121f',
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            <p style={{ margin: '0 0 8px', color: '#1800ad', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 12 }}>
              Teacher Instructions
            </p>
            <h1 id="ar-instructions-title" style={{ margin: '0 0 16px', fontSize: 30, lineHeight: 1.1 }}>
              Before You Start AR
            </h1>
            <div
              style={{
                whiteSpace: 'pre-wrap',
                fontSize: 18,
                lineHeight: 1.5,
                color: '#2e2a36',
                marginBottom: 24,
              }}
            >
              {normalizedInstructions}
            </div>
            <button
              type="button"
              onClick={() => setInstructionsConfirmed(true)}
              style={{
                width: '100%',
                border: 0,
                borderRadius: 999,
                padding: '14px 20px',
                background: '#1800ad',
                color: '#fff',
                fontSize: 18,
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 14px 30px rgba(24, 0, 173, 0.24)',
              }}
            >
              Confirm and Start AR
            </button>
          </div>
        </div>
      )}

      {canRunAr && !isViewMode && !compactUi && (
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

      {canRunAr && !isViewMode && (
        vrMode ? (
          <>
            <ControlPanel
              paintColor={paintColor}
              onPaintColorChange={setPaintColor}
              activeTool={activeTool}
              onToolChange={handleToolChange}
              brushLevel={brushLevel}
              onBrushLevelChange={handleBrushLevelChange}
              canUndo={undoCount > 0}
              onUndo={handleUndo}
              availableObjects={availableObjects}
              onAddObject={handleAddObject}
              modelItems={modelToolbarControls}
              selectedModelId={selectedModelId}
              onSelectModel={handleGrabModel}
              puzzlePieces={puzzlePieceControls}
              onSpawnPuzzlePiece={handleSpawnPuzzlePiece}
              compact
              vrMode
              vrEye="left"
            />
            <ControlPanel
              paintColor={paintColor}
              onPaintColorChange={setPaintColor}
              activeTool={activeTool}
              onToolChange={handleToolChange}
              brushLevel={brushLevel}
              onBrushLevelChange={handleBrushLevelChange}
              canUndo={undoCount > 0}
              onUndo={handleUndo}
              availableObjects={availableObjects}
              onAddObject={handleAddObject}
              modelItems={modelToolbarControls}
              selectedModelId={selectedModelId}
              onSelectModel={handleGrabModel}
              puzzlePieces={puzzlePieceControls}
              onSpawnPuzzlePiece={handleSpawnPuzzlePiece}
              compact
              vrMode
              vrEye="right"
            />
          </>
        ) : (
          <ControlPanel
            paintColor={paintColor}
            onPaintColorChange={setPaintColor}
            activeTool={activeTool}
            onToolChange={handleToolChange}
            brushLevel={brushLevel}
            onBrushLevelChange={handleBrushLevelChange}
            canUndo={undoCount > 0}
            onUndo={handleUndo}
            availableObjects={availableObjects}
            onAddObject={handleAddObject}
            modelItems={modelToolbarControls}
            selectedModelId={selectedModelId}
            onSelectModel={handleGrabModel}
            puzzlePieces={puzzlePieceControls}
            onSpawnPuzzlePiece={handleSpawnPuzzlePiece}
            compact={compactUi}
            vrMode={vrMode}
          />
        )
      )}

      {canRunAr && !isViewMode && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0, 0, 0, 0.65)',
            borderRadius: 999,
            padding: compactUi ? '4px 9px' : '6px 12px',
            color: 'white',
            fontSize: compactUi ? 10 : 12,
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

      {canRunAr && isViewMode && artworkUrl && (
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

      {tutorialEnabled && needsGesture && ttsAvailable && (
        <button
          onClick={triggerSpeak}
          type="button"
          style={{
            position: 'absolute',
            top: compactUi ? 44 : 54,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(255, 255, 255, 0.95)',
            color: '#111',
            border: 'none',
            borderRadius: 999,
            padding: compactUi ? '5px 9px' : '6px 12px',
            fontSize: compactUi ? 10 : 12,
            fontWeight: 600,
            boxShadow: '0 6px 16px rgba(0,0,0,0.2)',
            cursor: 'pointer',
            zIndex: 1100,
          }}
        >
          Tap to enable voice
        </button>
      )}

      {tutorialEnabled && !ttsAvailable && currentTexts.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: compactUi ? 44 : 54,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(255, 255, 255, 0.95)',
            color: '#111',
            borderRadius: 16,
            padding: compactUi ? '7px 10px' : '10px 14px',
            fontSize: compactUi ? 10 : 12,
            fontWeight: 600,
            boxShadow: '0 6px 16px rgba(0,0,0,0.2)',
            zIndex: 1100,
            textAlign: 'center',
            maxWidth: compactUi ? 240 : 320,
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

      {canRunAr && exitCountdown !== null && exitCountdown > 0 && (
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

      {canRunAr && submitState.status === 'submitting' && (
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

      {canRunAr && submitState.status === 'error' && (
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

      {canRunAr && gestureAlertText && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'rgba(180, 0, 0, 0.85)',
            color: '#fff',
            padding: '10px 12px',
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 700,
            zIndex: 1240,
            maxWidth: 320,
            boxShadow: '0 10px 24px rgba(0,0,0,0.28)',
          }}
        >
          {gestureAlertText}
        </div>
      )}

      {canRunAr && !compactUi && (
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
            <li>👉 <strong>Move left/right</strong> → Yaw rotation</li>
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
      )}
    </div>
  );
}

export default ARApp;
