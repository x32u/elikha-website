import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { CameraFeed } from './components/CameraFeed';
import {
  ARSceneV2,
  type ModelActionRequest,
  type ModelSelection,
  type SceneObjectActionRequest,
  type SceneObjectSelection,
  type SerializedArGroupTransform,
  type SerializedBaseModelTransform,
  type SerializedPaintDecal,
  type SerializedPuzzlePiece,
  type SerializedSceneObject,
} from './components/ARSceneV2';
import { ControlPanel, type PaintTool } from './components/ControlPanel';
import { DebugOverlay } from './components/DebugOverlay';
import { useHandTrackingV2 } from './hooks/useHandTrackingV2';
import { isMiddleFingerGesture, isOpenPalmGesture } from './utils/gestures';
import { useGestureSelect } from './hooks/useGestureSelect';
import { useArTutorial } from './hooks/useArTutorial';
import { useSingleFaceDetection } from './hooks/useSingleFaceDetection';
import { submitActivity, reportGestureAlert } from '../../services/studentApi';
import { requestStudentColorSuggestion } from '../../services/aiGradingApi';
import { saveUserSettings } from '../../services/userSettingsApi';
import { encodeArSubmissionDescription } from '../../utils/arSubmission';
import { resolveArObjectDefinitions } from '../../utils/activityArConfig';
import { useUserSettings } from '../../hooks/useUserSettings';
import { buildColorSelectionAnnouncement } from './utils/voiceGuidance';
import { canUseArInteractions } from './utils/runtimeReadiness';
import './App.css';

export type ARExitReason = 'exit' | 'submitted';

type ARAppProps = {
  onExit?: (reason?: ARExitReason) => void;
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
  sandboxMode?: boolean;
  sandboxDifficulty?: 'easy' | 'medium' | 'advanced';
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

type ColorSuggestion = {
  message: string;
  rationale?: string;
  colors: Array<{ name: string; hex: string }>;
};

type SubmitState = {
  status: 'idle' | 'submitting' | 'checking-color' | 'suggestion' | 'success' | 'error';
  message?: string;
  colorSuggestion?: ColorSuggestion | null;
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

function normalizeColorSuggestion(value: unknown): ColorSuggestion | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const message = typeof candidate.message === 'string' ? candidate.message.trim() : '';
  const rationale = typeof candidate.rationale === 'string' ? candidate.rationale.trim() : '';
  const colors = (Array.isArray(candidate.colors) ? candidate.colors : [])
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const color = item as Record<string, unknown>;
      const name = typeof color.name === 'string' ? color.name.trim() : '';
      const rawHex = typeof color.hex === 'string' ? color.hex.trim().toUpperCase() : '';
      return name && /^#[0-9A-F]{6}$/.test(rawHex) ? { name, hex: rawHex } : null;
    })
    .filter((item): item is { name: string; hex: string } => Boolean(item))
    .slice(0, 3);

  return message ? { message, rationale, colors } : null;
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
  sandboxMode = false,
  sandboxDifficulty,
}: ARAppProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sceneCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const vrCompositeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isViewMode = viewMode === 'view';
  const { settings: userSettings, userId } = useUserSettings();
  const normalizedInstructions = typeof arInstructions === 'string' ? arInstructions.trim() : '';
  const [instructionsConfirmed, setInstructionsConfirmed] = useState(!normalizedInstructions || isViewMode);
  const [cameraPermissionGranted, setCameraPermissionGranted] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraStoppedNotice, setCameraStoppedNotice] = useState(false);
  const [modelLoadError, setModelLoadError] = useState('');
  const canRunAr = (isViewMode || instructionsConfirmed) && cameraPermissionGranted;
  const cameraFacingMode = mobileMode ? 'environment' : 'user';
  const mirrorCameraX = cameraFacingMode === 'user';
  const faceDetection = useSingleFaceDetection(videoRef, canRunAr);

  // V2 hand tracking with quaternion-based rotation
  const {
    status: handTrackingStatus,
    error: handTrackingError,
    isTracking,
    landmarks,
    landmarksB,
    grabState,
    debugInfo,
    targetQuaternion,
  } = useHandTrackingV2(videoRef, mirrorCameraX);
  const arInteractionAllowed = canUseArInteractions({
    canRunAr,
    faceStatus: faceDetection.status,
    multipleFacesDetected: faceDetection.multipleFacesDetected,
    handStatus: handTrackingStatus,
    viewMode: isViewMode,
    modelLoadError,
  });

  const [paintColor, setPaintColor] = useState(new THREE.Color('#ff4444'));
  const structuredPractice = sandboxMode && Boolean(sandboxDifficulty);
  const practiceDifficultyLabel = sandboxDifficulty
    ? `${sandboxDifficulty.charAt(0).toUpperCase()}${sandboxDifficulty.slice(1)}`
    : '';
  const practiceAllowedTools = useMemo<PaintTool[]>(() => {
    if (!structuredPractice) return ['move', 'grabAll', 'paint', 'bucket', 'eraser', 'remove'];
    if (sandboxDifficulty === 'medium') return ['move'];
    if (sandboxDifficulty === 'advanced') return ['move', 'paint', 'bucket', 'eraser'];
    return ['paint', 'bucket', 'eraser'];
  }, [sandboxDifficulty, structuredPractice]);
  const practiceAllowedToolSet = useMemo(() => new Set(practiceAllowedTools), [practiceAllowedTools]);
  const practiceAllowsPainting = !structuredPractice || practiceAllowedTools.some((tool) =>
    tool === 'paint' || tool === 'bucket' || tool === 'eraser'
  );
  const practiceAllowsPuzzle = !structuredPractice || sandboxDifficulty !== 'easy';
  const [activeTool, setActiveTool] = useState<PaintTool>(
    structuredPractice && sandboxDifficulty !== 'medium' ? 'paint' : 'move'
  );
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
  const redoStackRef = useRef<ArHistorySnapshot[]>([]);
  const lastUndoCaptureRef = useRef<{ source: string; at: number } | null>(null);
  const applyingUndoRef = useRef(false);
  const historyRestoreTimeoutRef = useRef<number | null>(null);
  const [historyRestoring, setHistoryRestoring] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const [spawnRequest, setSpawnRequest] = useState<{ requestId: number; objectId: string } | null>(null);
  const [sceneObjectActionRequest, setSceneObjectActionRequest] = useState<SceneObjectActionRequest | null>(null);
  const [selectedSceneObject, setSelectedSceneObject] = useState<(SceneObjectSelection & { label: string }) | null>(null);
  const [sceneFeedback, setSceneFeedback] = useState('');
  const [capturingSubmission, setCapturingSubmission] = useState(false);
  const sceneFeedbackTimeoutRef = useRef<number | null>(null);
  const [puzzleSpawnRequest, setPuzzleSpawnRequest] = useState<{ requestId: number; pieceId: string } | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<(ModelSelection & { label: string }) | null>(null);
  const [modelActionRequest, setModelActionRequest] = useState<ModelActionRequest | null>(null);
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
      modelUrl: modelUrl || '/models/cute_cactus.glb',
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
    const selectableModelIds = sceneModelConfigs.map(
      (model, index) => model.instanceId || model.id || `model-${index}`
    );
    if (normalizedPuzzlePieces || !selectableModelIds.includes(selectedModelId)) {
      setSelectedModelId(null);
      setSelectedModel(null);
    }
  }, [normalizedPuzzlePieces, sceneModelConfigs, selectedModelId]);
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
  const voiceGuideEnabled = userSettings.voiceInstructions !== false;
  const tutorialEnabled = arInteractionAllowed && !isViewMode && !vrMode;
  const {
    needsGesture,
    triggerSpeak,
    repeatCurrent,
    ttsAvailable,
    currentTexts,
    announce,
  } = useArTutorial({
    grabState,
    enabled: tutorialEnabled,
    voiceEnabled: voiceGuideEnabled,
  });
  const handleToggleVoiceGuide = useCallback(() => {
    const nextEnabled = !voiceGuideEnabled;
    void saveUserSettings(userId, {
      ...userSettings,
      voiceInstructions: nextEnabled,
    });
  }, [userId, userSettings, voiceGuideEnabled]);
  const faceWarningAnnouncedRef = useRef(false);
  useEffect(() => {
    if (faceDetection.multipleFacesDetected && !faceWarningAnnouncedRef.current) {
      faceWarningAnnouncedRef.current = true;
      announce('More than one face detected. AR tools are paused until only one person remains in view.');
      return;
    }

    if (!faceDetection.multipleFacesDetected && faceWarningAnnouncedRef.current) {
      faceWarningAnnouncedRef.current = false;
      announce('One face remains. AR tools are ready again.');
    }
  }, [announce, faceDetection.multipleFacesDetected]);
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

  const handlePaintColorChange = useCallback((color: THREE.Color, colorName = 'custom color') => {
    setPaintColor(color);
    announce(buildColorSelectionAnnouncement(colorName), { dedupeMs: 800 });
  }, [announce]);

  const handleBrushLevelChange = useCallback((level: number) => {
    const nextLevel = Math.max(1, Math.min(10, Math.round(level)));
    setBrushLevel(nextLevel);
    announce(`Brush size set to ${nextLevel}.`, { debounceMs: 250, dedupeMs: 250 });
  }, [announce]);

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
    if (redoStackRef.current.length > 0) {
      redoStackRef.current = [];
      setRedoCount(0);
    }
    lastUndoCaptureRef.current = { source, at: now };
    setUndoCount(undoStackRef.current.length);
  }, [getCurrentSnapshot, isViewMode]);

  const beginHistoryRestore = useCallback(() => {
    applyingUndoRef.current = true;
    setHistoryRestoring(true);
    if (historyRestoreTimeoutRef.current) {
      window.clearTimeout(historyRestoreTimeoutRef.current);
    }
    historyRestoreTimeoutRef.current = window.setTimeout(() => {
      applyingUndoRef.current = false;
      setHistoryRestoring(false);
      historyRestoreTimeoutRef.current = null;
    }, 300);
  }, []);

  const restoreHistorySnapshot = useCallback((snapshot: ArHistorySnapshot) => {
    beginHistoryRestore();
    const restoredState = cloneSnapshot(snapshot);
    paintStateRef.current = cloneSerializedArray(restoredState.paint);
    sceneStateRef.current = cloneSerializedArray(restoredState.scene);
    puzzleStateRef.current = cloneSerializedArray(restoredState.puzzle);
    modelStateRef.current = cloneSerializedArray(restoredState.model);
    groupStateRef.current = restoredState.group ? JSON.parse(JSON.stringify(restoredState.group)) : null;
    setPuzzleToolbarState(cloneSerializedArray(restoredState.puzzle));
    setSelectedSceneObject(null);
    setSelectedModelId(null);
    setSelectedModel(null);
    setSpawnRequest(null);
    setSceneObjectActionRequest(null);
    setModelActionRequest(null);
    setPuzzleSpawnRequest(null);
    setHydratedArState((current) => ({
      ...restoredState,
      version: current.version + 1,
    }));
  }, [beginHistoryRestore]);

  const handleUndo = useCallback(() => {
    if (isViewMode || applyingUndoRef.current || undoStackRef.current.length === 0) return;

    const previousState = undoStackRef.current[undoStackRef.current.length - 1];
    redoStackRef.current = [...redoStackRef.current, getCurrentSnapshot()].slice(-MAX_UNDO_STEPS);
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    setUndoCount(undoStackRef.current.length);
    setRedoCount(redoStackRef.current.length);
    lastUndoCaptureRef.current = null;
    restoreHistorySnapshot(previousState);
    announce('Last action undone.');
  }, [announce, getCurrentSnapshot, isViewMode, restoreHistorySnapshot]);

  const handleRedo = useCallback(() => {
    if (isViewMode || applyingUndoRef.current || redoStackRef.current.length === 0) return;

    const nextState = redoStackRef.current[redoStackRef.current.length - 1];
    undoStackRef.current = [...undoStackRef.current, getCurrentSnapshot()].slice(-MAX_UNDO_STEPS);
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    setUndoCount(undoStackRef.current.length);
    setRedoCount(redoStackRef.current.length);
    lastUndoCaptureRef.current = null;
    restoreHistorySnapshot(nextState);
    announce('Last action restored.');
  }, [announce, getCurrentSnapshot, isViewMode, restoreHistorySnapshot]);

  useEffect(() => {
    setInstructionsConfirmed(!normalizedInstructions || isViewMode);
  }, [isViewMode, normalizedInstructions]);

  useEffect(() => {
    beginHistoryRestore();
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
    redoStackRef.current = [];
    lastUndoCaptureRef.current = null;
    setUndoCount(0);
    setRedoCount(0);
    setSelectedSceneObject(null);
    setSelectedModelId(null);
    setSelectedModel(null);
    setModelActionRequest(null);

  }, [beginHistoryRestore, incomingInitialState]);

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
    setSelectedModel((current) => {
      if (!current) return null;
      const nextSelectedState = nextModelState.find((model) => model.id === current.id);
      if (!nextSelectedState) return current;
      const locked = nextSelectedState.editingLocked === true;
      return current.locked === locked ? current : { ...current, locked };
    });
  }, [pushUndoSnapshot]);

  const handleGroupStateChange = useCallback((nextGroupState: SerializedArGroupTransform) => {
    if (JSON.stringify(groupStateRef.current || null) !== JSON.stringify(nextGroupState || null)) {
      pushUndoSnapshot('group:change', 800);
    }
    groupStateRef.current = nextGroupState;
  }, [pushUndoSnapshot]);

  useEffect(() => {
    if (isViewMode) return undefined;

    const onHistoryShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      );
      if (isTyping || (!event.ctrlKey && !event.metaKey)) return;

      const key = event.key.toLowerCase();
      if (key === 'z' && event.shiftKey) {
        event.preventDefault();
        handleRedo();
      } else if (key === 'z') {
        event.preventDefault();
        handleUndo();
      } else if (key === 'y') {
        event.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', onHistoryShortcut);
    return () => window.removeEventListener('keydown', onHistoryShortcut);
  }, [handleRedo, handleUndo, isViewMode]);

  const handleSceneObjectSelectionChange = useCallback((selection: SceneObjectSelection | null) => {
    if (!selection) {
      setSelectedSceneObject(null);
      return;
    }
    const label = availableObjects.find((item) => item.id === selection.objectId)?.label || 'Shape';
    setSelectedModelId(null);
    setSelectedModel(null);
    setSelectedSceneObject({ ...selection, label });
  }, [availableObjects]);

  const handleSceneObjectFeedback = useCallback((message: string) => {
    const nextMessage = String(message || '').trim();
    if (!nextMessage) return;
    setSceneFeedback(nextMessage);
    announce(nextMessage, { debounceMs: 150, dedupeMs: 800 });
    if (sceneFeedbackTimeoutRef.current) {
      window.clearTimeout(sceneFeedbackTimeoutRef.current);
    }
    sceneFeedbackTimeoutRef.current = window.setTimeout(() => {
      setSceneFeedback('');
      sceneFeedbackTimeoutRef.current = null;
    }, 2400);
  }, [announce]);

  const handleDuplicateSceneObject = useCallback(() => {
    if (structuredPractice || !selectedSceneObject || applyingUndoRef.current) return;
    pushUndoSnapshot('scene:duplicate');
    setSceneObjectActionRequest({
      requestId: Date.now() + Math.random(),
      objectId: selectedSceneObject.id,
      action: 'duplicate',
    });
  }, [pushUndoSnapshot, selectedSceneObject, structuredPractice]);

  const handleToggleSceneObjectLock = useCallback(() => {
    if (structuredPractice || !selectedSceneObject || applyingUndoRef.current) return;
    pushUndoSnapshot('scene:lock');
    setSceneObjectActionRequest({
      requestId: Date.now() + Math.random(),
      objectId: selectedSceneObject.id,
      action: 'toggleLock',
    });
  }, [pushUndoSnapshot, selectedSceneObject, structuredPractice]);

  const handleToggleModelLock = useCallback(() => {
    if (isViewMode || !selectedModel || applyingUndoRef.current) return;
    pushUndoSnapshot('model:lock');
    setModelActionRequest({
      requestId: Date.now() + Math.random(),
      modelId: selectedModel.id,
      action: 'toggleLock',
    });
  }, [isViewMode, pushUndoSnapshot, selectedModel]);

  const handleToolChange = useCallback((tool: PaintTool) => {
    if (!practiceAllowedToolSet.has(tool)) return;
    setActiveTool(tool);
    if (tool !== 'move') {
      setSelectedModelId(null);
      setSelectedModel(null);
    }
    const toolNames: Record<PaintTool, string> = {
      move: 'Move',
      grabAll: 'Grab all',
      paint: 'Paint',
      bucket: 'Paint bucket',
      eraser: 'Eraser',
      remove: 'Remove',
    };
    announce(`${toolNames[tool]} tool selected.`);
  }, [announce, practiceAllowedToolSet]);

  const handleAddObject = useCallback((objectId: string) => {
    if (structuredPractice || applyingUndoRef.current) return;
    pushUndoSnapshot('scene:spawn');
    setActiveTool('move');
    setSpawnRequest({
      objectId,
      requestId: Date.now() + Math.random(),
    });
    const objectLabel = availableObjects.find((item) => item.id === objectId)?.label || 'object';
    announce(`${objectLabel} added. Move tool selected.`);
  }, [announce, availableObjects, pushUndoSnapshot, structuredPractice]);

  const handleSpawnPuzzlePiece = useCallback((pieceId: string) => {
    if (!practiceAllowsPuzzle || applyingUndoRef.current) return;
    pushUndoSnapshot('puzzle:spawn');
    setActiveTool('move');
    setPuzzleSpawnRequest({
      pieceId,
      requestId: Date.now() + Math.random(),
    });
    const pieceLabel = puzzlePieceControls.find((item) => item.id === pieceId)?.label || 'puzzle piece';
    announce(`Puzzle part ${pieceLabel} added. Move it into place.`);
  }, [announce, practiceAllowsPuzzle, pushUndoSnapshot, puzzlePieceControls]);

  const handleGrabModel = useCallback((modelId: string) => {
    setActiveTool('move');
    setSelectedSceneObject(null);
    setSelectedModelId(modelId);
    const modelLabel = modelToolbarControls.find((item) => item.id === modelId)?.label || 'model';
    const locked = modelStateRef.current.find((model) => model.id === modelId)?.editingLocked === true;
    setSelectedModel({ id: modelId, locked, label: modelLabel });
    announce(locked
      ? `${modelLabel} selected. It is locked. Use Unlock before moving it.`
      : `${modelLabel} selected. Move tool ready.`);
  }, [announce, modelToolbarControls]);

  const handleModelSelectionChange = useCallback((selection: ModelSelection | null) => {
    if (!selection) {
      setSelectedModelId(null);
      setSelectedModel(null);
      return;
    }
    setSelectedSceneObject(null);
    setSelectedModelId(selection.id);
    const modelLabel = sceneModelConfigs.find((model, index) => (
      (model.instanceId || model.id || `model-${index}`) === selection.id
    ))?.label || 'model';
    if (selectedModel?.id !== selection.id) {
      announce(selection.locked
        ? `${modelLabel} selected. It is locked. Use Unlock before moving it.`
        : `${modelLabel} selected. Keep pinching to move it.`);
    }
    setSelectedModel({ ...selection, label: modelLabel });
  }, [announce, sceneModelConfigs, selectedModel?.id]);

  const cameraReadyAnnouncedRef = useRef(false);
  const handleCameraReady = useCallback(() => {
    console.log('Camera ready');
    if (!cameraReadyAnnouncedRef.current) {
      cameraReadyAnnouncedRef.current = true;
      announce('Camera ready.');
    }
  }, [announce]);

  const requestCameraAccess = useCallback(() => {
    setCameraError('');
    setCameraPermissionGranted(true);
    announce('Camera permission requested.');
  }, [announce]);

  const handleCameraError = useCallback((message: string) => {
    setCameraPermissionGranted(false);
    setCameraError(message);
    announce(message);
  }, [announce]);

  const stopCameraTracks = useCallback(() => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
  }, []);

  const stopCameraAndExit = useCallback(() => {
    stopCameraTracks();
    setCameraStoppedNotice(true);
    announce('Camera access stopped. You have exited the AR activity.');
    window.setTimeout(() => onExit?.('exit'), 3000);
  }, [announce, onExit, stopCameraTracks]);

  const finishSubmittedActivity = useCallback(() => {
    announce('Activity complete. Returning to your activities.');
    onExit?.('submitted');
  }, [announce, onExit]);

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
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });

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
    if (!arInteractionAllowed) {
      middleFingerHeldRef.current = false;
      if (middleFingerDebounceTimeoutRef.current) {
        window.clearTimeout(middleFingerDebounceTimeoutRef.current);
        middleFingerDebounceTimeoutRef.current = null;
      }
      return;
    }

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
      announce('Please avoid offensive gestures.');
      if (gestureToastTimeoutRef.current) {
        window.clearTimeout(gestureToastTimeoutRef.current);
      }
      gestureToastTimeoutRef.current = window.setTimeout(() => {
        setGestureAlertText(null);
        gestureToastTimeoutRef.current = null;
      }, 3200);

      if (!studentId || !activityId) {
        if (sandboxMode) return;
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
  }, [activeTool, activityId, announce, arInteractionAllowed, isViewMode, middleFingerDetected, sandboxMode, studentId]);

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

      // The WebGL canvas is already rendered with a transparent clear color.
      // Preserve its alpha directly so intentionally black paint stays black
      // in both the saved artwork and the image supplied to AI grading.
      ctx.drawImage(sceneCanvas, 0, 0, width, height);

      return outputCanvas.toDataURL('image/jpeg', 0.9);
    } catch (error) {
      console.error('Failed to capture AR snapshot:', error);
      return null;
    }
  }, []);

  const handleSubmitAndExit = useCallback(async () => {
    if (applyingUndoRef.current) {
      announce('Please wait while the last change is restored.');
      return;
    }
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    setSubmitState({ status: 'submitting' });
    announce(
      sandboxMode
        ? 'Exiting sandbox. Your practice work will not be submitted.'
        : isViewMode
          ? 'Exiting activity view.'
          : 'Submitting your activity.'
    );

    try {
      if (sandboxMode) {
        setSubmitState({ status: 'success' });
        stopCameraAndExit();
        return;
      }

      if (isViewMode) {
        setSubmitState({ status: 'success' });
        stopCameraAndExit();
        return;
      }

      if (!arInteractionAllowed) {
        throw new Error('AR safety and tracking checks are not ready. Nothing was submitted; return and reopen the activity.');
      }

      if (!activityId || !studentId) {
        throw new Error('Missing activity or student information.');
      }

      if (modelLoadError) {
        throw new Error('The assigned 3D model did not load, so this activity cannot be submitted. Reopen the activity and try again.');
      }

      setCapturingSubmission(true);
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
      });
      const snapshot = captureSubmissionImage();
      setCapturingSubmission(false);
      if (!snapshot) {
        throw new Error('The AR artwork image could not be captured. Nothing was submitted; please try again.');
      }
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

      stopCameraTracks();
      setSubmitState({
        status: 'checking-color',
        message: 'Your activity was submitted. AI is checking your color choices…',
      });
      announce('Activity submitted. AI is preparing a color suggestion.');

      const aiResult = await requestStudentColorSuggestion(result.data?.id);
      const colorSuggestion = normalizeColorSuggestion(aiResult.colorSuggestion);
      const fallbackMessage = aiResult.error?.toLowerCase().includes('rubric')
        ? 'Your work was submitted. Your teacher needs to attach a rubric before a color suggestion can be prepared.'
        : 'Your work was submitted. AI color advice is unavailable right now, but your teacher can still review your artwork.';

      setSubmitState({
        status: 'suggestion',
        colorSuggestion,
        message: colorSuggestion ? undefined : fallbackMessage,
      });
      announce(colorSuggestion?.message || fallbackMessage);
    } catch (error) {
      setCapturingSubmission(false);
      console.error('Failed to submit activity:', error);
      submitInFlightRef.current = false;
      setSubmitState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to submit activity.',
      });
      announce('Submission failed. Please try again.');
    }
  }, [activityId, announce, arInteractionAllowed, captureSubmissionImage, isViewMode, modelLoadError, sandboxMode, stopCameraAndExit, stopCameraTracks, studentId]);

  useEffect(() => {
    if (!arInteractionAllowed) {
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
      announce(isViewMode
        ? 'Both palms detected. Hold still to exit.'
        : sandboxMode
          ? 'Both palms detected. Hold still to exit the sandbox.'
          : 'Both palms detected. Hold still to submit in three seconds.');
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
  }, [announce, arInteractionAllowed, exitCountdown, handleSubmitAndExit, isDoublePalm, isViewMode, sandboxMode]);

  useGestureSelect({
    landmarks,
    videoRef,
    enabled: arInteractionAllowed && !isViewMode,
    blocked: grabState.isZooming,
    dwellMs: 500,
    dualScreenMode: vrMode,
    mirrorX: mirrorCameraX,
  });

  useEffect(() => {
    const videoElement = videoRef.current;
    return () => {
      if (sceneFeedbackTimeoutRef.current) {
        window.clearTimeout(sceneFeedbackTimeoutRef.current);
        sceneFeedbackTimeoutRef.current = null;
      }
      if (historyRestoreTimeoutRef.current) {
        window.clearTimeout(historyRestoreTimeoutRef.current);
        historyRestoreTimeoutRef.current = null;
      }
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
        onError={handleCameraError}
        enabled={cameraPermissionGranted}
      />

      {/* Three.js AR scene V2 */}
      <ARSceneV2
        modelUrl={modelUrl || '/models/cute_cactus.glb'}
        modelFileType={modelFileType || undefined}
        modelConfigs={sceneModelConfigs}
        handLandmarks={arInteractionAllowed && !historyRestoring ? landmarks : null}
        grabState={grabState}
        debugInfo={debugInfo}
        targetQuaternion={targetQuaternion}
        paintMode={arInteractionAllowed && !historyRestoring && paintMode}
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
        puzzlePieces={practiceAllowsPuzzle ? puzzlePieces : 0}
        initialModelState={hydratedArState.model}
        onModelStateChange={handleModelStateChange}
        initialGroupState={hydratedArState.group}
        onGroupStateChange={handleGroupStateChange}
        groupBaseModels={!historyRestoring && isGrabAllMode}
        spawnObjectRequest={spawnRequest}
        sceneObjectActionRequest={sceneObjectActionRequest}
        onSceneObjectSelectionChange={handleSceneObjectSelectionChange}
        onSceneObjectFeedback={handleSceneObjectFeedback}
        hideSceneObjectSelection={capturingSubmission}
        puzzlePieceSpawnRequest={puzzleSpawnRequest}
        selectedModelId={selectedModelId}
        modelActionRequest={modelActionRequest}
        onModelSelectionChange={handleModelSelectionChange}
        onModelFeedback={handleSceneObjectFeedback}
        renderQuality={userSettings.quality}
        dataSaver={userSettings.dataSaver}
        onModelLoadError={setModelLoadError}
        onCanvasReady={(canvas) => {
          sceneCanvasRef.current = canvas;
        }}
      />

      {!instructionsConfirmed && normalizedInstructions && (
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
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <button
                type="button"
                onClick={() => announce(normalizedInstructions, { force: true, dedupeMs: 1000 })}
                style={{
                  flex: '1 1 220px',
                  border: '2px solid #1800ad',
                  borderRadius: 999,
                  padding: '12px 18px',
                  background: '#fff',
                  color: '#1800ad',
                  fontSize: 16,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                <span aria-hidden="true">🔊</span> Read instructions aloud
              </button>
              <button
                type="button"
                onClick={handleToggleVoiceGuide}
                aria-pressed={voiceGuideEnabled}
                style={{
                  flex: '1 1 180px',
                  border: '1px solid rgba(24, 0, 173, 0.28)',
                  borderRadius: 999,
                  padding: '12px 18px',
                  background: voiceGuideEnabled ? '#ebe8ff' : '#f4f3f7',
                  color: '#25202f',
                  fontSize: 15,
                  fontWeight: 750,
                  cursor: 'pointer',
                }}
              >
                {voiceGuideEnabled ? 'Voice guides: On' : 'Voice guides: Off'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setInstructionsConfirmed(true);
                announce('Instructions confirmed. Camera permission is required before starting augmented reality.');
              }}
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

      {instructionsConfirmed && !cameraPermissionGranted && (
        <div className="camera-permission-overlay" role="presentation">
          <section className="camera-permission-card" role="dialog" aria-modal="true" aria-labelledby="camera-permission-title">
            <div className="camera-permission-icon" aria-hidden="true">◉</div>
            <p className="camera-permission-eyebrow">Privacy and security</p>
            <h1 id="camera-permission-title">Camera permission required</h1>
            <p>
              This activity needs your camera for live AR and hand-gesture controls. Camera access is used only while this activity is open and stops when you exit.
            </p>
            {cameraError && <p className="camera-permission-error" role="alert">{cameraError}</p>}
            <div className="camera-permission-actions">
              <button type="button" className="camera-permission-back" onClick={stopCameraAndExit}>Go back</button>
              <button type="button" className="camera-permission-allow" onClick={requestCameraAccess}>Allow camera and start</button>
            </div>
          </section>
        </div>
      )}

      {cameraStoppedNotice && (
        <div className="camera-stopped-notice" role="status">
          <span aria-hidden="true">✓</span> Camera access stopped. Leaving AR activity…
        </div>
      )}

      {canRunAr && faceDetection.status === 'loading' && (
        <div className="single-face-overlay" role="presentation">
          <section className="single-face-card" role="status" aria-live="polite">
            <div className="single-face-icon" aria-hidden="true">1</div>
            <p className="single-face-eyebrow">Safety check</p>
            <h1>Starting single-face detection</h1>
            <p>Please wait while the on-device face safety check gets ready.</p>
          </section>
        </div>
      )}

      {canRunAr && faceDetection.status === 'error' && (
        <div className="single-face-overlay" role="presentation">
          <section
            className="single-face-card"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="face-detection-error-title"
          >
            <div className="single-face-icon" aria-hidden="true">!</div>
            <p className="single-face-eyebrow">AR session paused</p>
            <h1 id="face-detection-error-title">Face safety check unavailable</h1>
            <p>{faceDetection.error} AR tools and submission are disabled for this session.</p>
            <small>Return and reopen the activity to try the on-device safety check again.</small>
            <div className="camera-permission-actions">
              <button type="button" className="camera-permission-back" onClick={stopCameraAndExit}>
                Go back safely
              </button>
            </div>
          </section>
        </div>
      )}

      {canRunAr && faceDetection.status === 'ready' && faceDetection.multipleFacesDetected && (
        <div className="single-face-overlay" role="presentation">
          <section
            className="single-face-card"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="single-face-title"
          >
            <div className="single-face-icon" aria-hidden="true">1</div>
            <p className="single-face-eyebrow">AR session paused</p>
            <h1 id="single-face-title">Only one face can be in view</h1>
            <p>
              We detected {faceDetection.faceCount} faces. Ask the other person to move out of the
              camera frame. Your AR tools will resume automatically when only one face remains.
            </p>
            <small>Face checking runs only on this device. E-Likha does not identify or save faces.</small>
          </section>
        </div>
      )}

      {canRunAr && faceDetection.status === 'ready' && !faceDetection.multipleFacesDetected && !isViewMode && handTrackingStatus === 'loading' && (
        <div className="single-face-overlay" role="presentation">
          <section className="single-face-card" role="status" aria-live="polite">
            <div className="single-face-icon" aria-hidden="true">✋</div>
            <p className="single-face-eyebrow">Gesture controls</p>
            <h1>Starting hand tracking</h1>
            <p>Please wait while the on-device palm and finger controls get ready.</p>
          </section>
        </div>
      )}

      {canRunAr && faceDetection.status === 'ready' && !faceDetection.multipleFacesDetected && !isViewMode && handTrackingStatus === 'error' && (
        <div className="single-face-overlay" role="presentation">
          <section
            className="single-face-card"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="hand-tracking-error-title"
          >
            <div className="single-face-icon" aria-hidden="true">!</div>
            <p className="single-face-eyebrow">AR session paused</p>
            <h1 id="hand-tracking-error-title">Hand tracking unavailable</h1>
            <p>{handTrackingError || 'Hand tracking could not start on this device.'}</p>
            <small>Gesture tools and submission are disabled. Return and reopen the activity to try again.</small>
            <div className="camera-permission-actions">
              <button type="button" className="camera-permission-back" onClick={stopCameraAndExit}>
                Go back safely
              </button>
            </div>
          </section>
        </div>
      )}

      {canRunAr && faceDetection.status === 'ready' && !faceDetection.multipleFacesDetected && (isViewMode || handTrackingStatus === 'ready') && modelLoadError && (
        <div className="single-face-overlay" role="presentation">
          <section
            className="single-face-card"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="model-load-error-title"
          >
            <div className="single-face-icon" aria-hidden="true">!</div>
            <p className="single-face-eyebrow">AR session paused</p>
            <h1 id="model-load-error-title">3D model unavailable</h1>
            <p>{modelLoadError}</p>
            <small>No replacement object was used. Editing and submission are disabled so the correct assigned model is preserved.</small>
            <div className="camera-permission-actions">
              <button type="button" className="camera-permission-back" onClick={stopCameraAndExit}>
                Go back safely
              </button>
            </div>
          </section>
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
          onToggle={() => setDebugPanelOpen((prev) => {
            const next = !prev;
            announce(`Debug panel ${next ? 'opened' : 'closed'}.`);
            return next;
          })}
        />
      )}

      {canRunAr && !isViewMode && (
        vrMode ? (
          <>
            <ControlPanel
              paintColor={paintColor}
              onPaintColorChange={handlePaintColorChange}
              activeTool={activeTool}
              onToolChange={handleToolChange}
              brushLevel={brushLevel}
              onBrushLevelChange={handleBrushLevelChange}
              canUndo={!historyRestoring && undoCount > 0}
              onUndo={handleUndo}
              canRedo={!historyRestoring && redoCount > 0}
              onRedo={handleRedo}
              selectedSceneObject={structuredPractice ? null : selectedSceneObject}
              onDuplicateSceneObject={structuredPractice ? undefined : handleDuplicateSceneObject}
              onToggleSceneObjectLock={structuredPractice ? undefined : handleToggleSceneObjectLock}
              availableObjects={structuredPractice ? [] : availableObjects}
              onAddObject={structuredPractice ? undefined : handleAddObject}
              modelItems={structuredPractice ? [] : modelToolbarControls}
              selectedModelId={selectedModelId}
              onSelectModel={structuredPractice ? undefined : handleGrabModel}
              selectedModel={selectedModel}
              onToggleModelLock={normalizedPuzzlePieces ? undefined : handleToggleModelLock}
              puzzlePieces={practiceAllowsPuzzle ? puzzlePieceControls : []}
              onSpawnPuzzlePiece={practiceAllowsPuzzle ? handleSpawnPuzzlePiece : undefined}
              voiceGuideEnabled={voiceGuideEnabled}
              canRepeatVoiceGuide={currentTexts.length > 0}
              onToggleVoiceGuide={handleToggleVoiceGuide}
              onRepeatVoiceGuide={repeatCurrent}
              allowedTools={practiceAllowedTools}
              compact
              vrMode
              vrEye="left"
            />
            <ControlPanel
              paintColor={paintColor}
              onPaintColorChange={handlePaintColorChange}
              activeTool={activeTool}
              onToolChange={handleToolChange}
              brushLevel={brushLevel}
              onBrushLevelChange={handleBrushLevelChange}
              canUndo={!historyRestoring && undoCount > 0}
              onUndo={handleUndo}
              canRedo={!historyRestoring && redoCount > 0}
              onRedo={handleRedo}
              selectedSceneObject={structuredPractice ? null : selectedSceneObject}
              onDuplicateSceneObject={structuredPractice ? undefined : handleDuplicateSceneObject}
              onToggleSceneObjectLock={structuredPractice ? undefined : handleToggleSceneObjectLock}
              availableObjects={structuredPractice ? [] : availableObjects}
              onAddObject={structuredPractice ? undefined : handleAddObject}
              modelItems={structuredPractice ? [] : modelToolbarControls}
              selectedModelId={selectedModelId}
              onSelectModel={structuredPractice ? undefined : handleGrabModel}
              selectedModel={selectedModel}
              onToggleModelLock={normalizedPuzzlePieces ? undefined : handleToggleModelLock}
              puzzlePieces={practiceAllowsPuzzle ? puzzlePieceControls : []}
              onSpawnPuzzlePiece={practiceAllowsPuzzle ? handleSpawnPuzzlePiece : undefined}
              voiceGuideEnabled={voiceGuideEnabled}
              canRepeatVoiceGuide={currentTexts.length > 0}
              onToggleVoiceGuide={handleToggleVoiceGuide}
              onRepeatVoiceGuide={repeatCurrent}
              allowedTools={practiceAllowedTools}
              compact
              vrMode
              vrEye="right"
            />
          </>
        ) : (
          <ControlPanel
            paintColor={paintColor}
            onPaintColorChange={handlePaintColorChange}
            activeTool={activeTool}
            onToolChange={handleToolChange}
            brushLevel={brushLevel}
            onBrushLevelChange={handleBrushLevelChange}
            canUndo={!historyRestoring && undoCount > 0}
            onUndo={handleUndo}
            canRedo={!historyRestoring && redoCount > 0}
            onRedo={handleRedo}
            selectedSceneObject={structuredPractice ? null : selectedSceneObject}
            onDuplicateSceneObject={structuredPractice ? undefined : handleDuplicateSceneObject}
            onToggleSceneObjectLock={structuredPractice ? undefined : handleToggleSceneObjectLock}
            availableObjects={structuredPractice ? [] : availableObjects}
            onAddObject={structuredPractice ? undefined : handleAddObject}
            modelItems={structuredPractice ? [] : modelToolbarControls}
            selectedModelId={selectedModelId}
            onSelectModel={structuredPractice ? undefined : handleGrabModel}
            selectedModel={selectedModel}
            onToggleModelLock={normalizedPuzzlePieces ? undefined : handleToggleModelLock}
            puzzlePieces={practiceAllowsPuzzle ? puzzlePieceControls : []}
            onSpawnPuzzlePiece={practiceAllowsPuzzle ? handleSpawnPuzzlePiece : undefined}
            voiceGuideEnabled={voiceGuideEnabled}
            canRepeatVoiceGuide={currentTexts.length > 0}
            onToggleVoiceGuide={handleToggleVoiceGuide}
            onRepeatVoiceGuide={repeatCurrent}
            allowedTools={practiceAllowedTools}
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
          {selectedSceneObject && (
            <span>
              • {selectedSceneObject.label} {selectedSceneObject.locked ? '🔒' : 'selected'}
            </span>
          )}
          {(userSettings.dataSaver || userSettings.quality === 'low') && (
            <span>• Lite rendering</span>
          )}
          {historyRestoring && <span>• Restoring…</span>}
          {sandboxMode && (
            <span aria-label="Sandbox mode">
              • Sandbox{practiceDifficultyLabel ? ` — ${practiceDifficultyLabel}` : ''}
            </span>
          )}
        </div>
      )}

      {canRunAr && !isViewMode && sceneFeedback && (
        <div className="ar-scene-feedback" role="status" aria-live="polite">
          {sceneFeedback}
        </div>
      )}

      {canRunAr && sandboxMode && (
        <button
          type="button"
          onClick={handleSubmitAndExit}
          style={{
            position: 'absolute',
            left: compactUi ? 12 : 20,
            bottom: compactUi ? 12 : 20,
            zIndex: 1150,
            minHeight: 42,
            padding: '0 16px',
            border: '1px solid rgba(255,255,255,0.5)',
            borderRadius: 999,
            background: 'rgba(18, 24, 38, 0.82)',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 800,
            backdropFilter: 'blur(10px)',
            boxShadow: '0 10px 24px rgba(0,0,0,0.28)',
          }}
        >
          Exit Sandbox
        </button>
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

      {!vrMode && voiceGuideEnabled && currentTexts.length > 0 && (!needsGesture || !ttsAvailable) && (
        <div
          role="status"
          aria-live="polite"
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
            {ttsAvailable ? 'Voice guide' : 'Voice unavailable — showing captions'}
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

      {canRunAr && (submitState.status === 'submitting' || submitState.status === 'checking-color') && (
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
            {submitState.status === 'checking-color'
              ? submitState.message
              : sandboxMode
              ? 'Exiting sandbox...'
              : isViewMode
                ? 'Exiting view...'
                : 'Submitting your artwork...'}
          </div>
        </div>
      )}

      {submitState.status === 'suggestion' && (
        <div className="color-suggestion-overlay" role="presentation">
          <section
            className="color-suggestion-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="color-suggestion-title"
          >
            <div className="color-suggestion-icon" aria-hidden="true">🎨</div>
            <p className="color-suggestion-eyebrow">Activity submitted</p>
            <h1 id="color-suggestion-title">
              {submitState.colorSuggestion ? 'A color idea for next time' : 'Your artwork is submitted'}
            </h1>
            <p className="color-suggestion-message">
              {submitState.colorSuggestion?.message || submitState.message}
            </p>

            {submitState.colorSuggestion && submitState.colorSuggestion.colors.length > 0 && (
              <div className="color-suggestion-swatches" aria-label="Suggested colors">
                {submitState.colorSuggestion.colors.map((color) => (
                  <div className="color-suggestion-swatch" key={`${color.name}-${color.hex}`}>
                    <span style={{ backgroundColor: color.hex }} aria-hidden="true" />
                    <strong>{color.name}</strong>
                    <small>{color.hex}</small>
                  </div>
                ))}
              </div>
            )}

            {submitState.colorSuggestion?.rationale && (
              <p className="color-suggestion-rationale">{submitState.colorSuggestion.rationale}</p>
            )}

            <p className="color-suggestion-creativity">
              Your teacher makes the final assessment, and creative color choices are always welcome.
            </p>
            <button type="button" onClick={finishSubmittedActivity}>Done</button>
          </section>
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
            bottom: sandboxMode ? 78 : 20,
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
          <strong>
            {structuredPractice ? `${practiceDifficultyLabel} Practice Controls:` : '🎮 Grab-to-Rotate Controls:'}
          </strong>
          <ul style={{ margin: '8px 0 0 0', paddingLeft: 16, lineHeight: 1.6 }}>
            {practiceAllowsPuzzle && !isGrabAllMode && (!structuredPractice || practiceAllowedToolSet.has('move')) && (
              <>
                <li>🤏 <strong>Pinch</strong> and move to reposition a puzzle piece</li>
                <li>✊ <strong>Make a fist</strong> and move your hand to rotate the whole puzzle, trace, and finished model</li>
                <li>✋ <strong>Open hand</strong> to release the gesture</li>
              </>
            )}
            {practiceAllowsPuzzle && isGrabAllMode && (
              <>
                <li>✊ <strong>Make a fist and move your hand</strong> to rotate the whole puzzle, trace, and finished model together</li>
                <li>🤏 <strong>Pinch and move</strong> to reposition the whole puzzle</li>
                <li>✋ <strong>Open hand</strong> to release it</li>
              </>
            )}
            {!structuredPractice && !normalizedPuzzlePieces && (
              <>
                <li>✊ <strong>Make a fist</strong> to rotate</li>
                <li>👉 <strong>Move left/right</strong> → Yaw rotation</li>
                <li>👆 <strong>Move hand up/down</strong> → Pitch rotation</li>
                <li>✊✊ <strong>Two fists</strong> → Apart = zoom in, closer = zoom out</li>
              </>
            )}
            {!isViewMode && practiceAllowsPainting && <li>☝️ <strong>Point</strong> to paint on the surface</li>}
            {!isViewMode && practiceAllowsPainting && <li>🖱️ <strong>Point at tool/color buttons</strong> to switch</li>}
            {!isViewMode && practiceAllowedToolSet.has('bucket') && (
              <li>🪣 <strong>Bucket</strong> fills the model or a pointed puzzle piece</li>
            )}
            <li>
              🖐️🖐️ <strong>Two open palms</strong> → {sandboxMode || isViewMode ? 'Exit' : 'Submit &amp; Exit'} (hold)
            </li>
          </ul>
          {sandboxMode && (
            <div style={{ marginTop: 10, color: '#c8f5d4', fontWeight: 700 }}>
              {practiceDifficultyLabel ? `${practiceDifficultyLabel} practice` : 'Sandbox practice'} is not submitted or saved.
            </div>
          )}
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
