import { useEffect, useState } from 'react';
import * as THREE from 'three';
import paintbrushIcon from '../../../assets/ar-icons/paintbrush.svg';
import bucketIcon from '../../../assets/ar-icons/paint-bucket.svg';
import eraserIcon from '../../../assets/ar-icons/eraser.svg';
import { AR_PRESET_COLORS } from '../utils/colorPalette';

export type PaintTool = 'move' | 'grabAll' | 'paint' | 'bucket' | 'eraser' | 'remove';

interface ControlPanelProps {
  paintColor: THREE.Color;
  onPaintColorChange: (color: THREE.Color, colorName?: string) => void;
  activeTool: PaintTool;
  onToolChange: (tool: PaintTool) => void;
  brushLevel: number;
  onBrushLevelChange: (level: number) => void;
  canUndo?: boolean;
  onUndo?: () => void;
  canRedo?: boolean;
  onRedo?: () => void;
  selectedSceneObject?: { label: string; locked: boolean } | null;
  onDuplicateSceneObject?: () => void;
  onToggleSceneObjectLock?: () => void;
  availableObjects?: Array<{ id: string; label: string; icon?: string }>;
  onAddObject?: (objectId: string) => void;
  modelItems?: Array<{ id: string; label: string }>;
  selectedModelId?: string | null;
  onSelectModel?: (modelId: string) => void;
  selectedModel?: { label: string; locked: boolean } | null;
  onToggleModelLock?: () => void;
  puzzlePieces?: Array<{ id: string; label: string; spawned: boolean; locked: boolean }>;
  onSpawnPuzzlePiece?: (pieceId: string) => void;
  voiceGuideEnabled?: boolean;
  canRepeatVoiceGuide?: boolean;
  onToggleVoiceGuide?: () => void;
  onRepeatVoiceGuide?: () => void;
  allowedTools?: PaintTool[];
  compact?: boolean;
  vrMode?: boolean;
  vrEye?: 'left' | 'right';
}

const ALL_TOOLS: PaintTool[] = ['move', 'grabAll', 'paint', 'bucket', 'eraser', 'remove'];

export function ControlPanel({
  paintColor,
  onPaintColorChange,
  activeTool,
  onToolChange,
  brushLevel,
  onBrushLevelChange,
  canUndo = false,
  onUndo,
  canRedo = false,
  onRedo,
  selectedSceneObject = null,
  onDuplicateSceneObject,
  onToggleSceneObjectLock,
  availableObjects = [],
  onAddObject,
  modelItems = [],
  selectedModelId = null,
  onSelectModel,
  selectedModel = null,
  onToggleModelLock,
  puzzlePieces = [],
  onSpawnPuzzlePiece,
  voiceGuideEnabled = true,
  canRepeatVoiceGuide = false,
  onToggleVoiceGuide,
  onRepeatVoiceGuide,
  allowedTools = ALL_TOOLS,
  compact = false,
  vrMode = false,
  vrEye,
}: ControlPanelProps) {
  const [isLandscape, setIsLandscape] = useState(
    typeof window !== 'undefined' ? window.innerWidth > window.innerHeight : true
  );
  const currentColorHex = `#${paintColor.getHexString()}`;
  const enabledTools = new Set(allowedTools);
  const showColors = enabledTools.has('paint') || enabledTools.has('bucket');
  const showBrushSize = enabledTools.has('paint') || enabledTools.has('eraser');

  useEffect(() => {
    const onResize = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div
      className={`control-panel ${isLandscape ? 'landscape' : 'portrait'} ${compact ? 'compact' : ''} ${vrMode ? 'vr' : ''} ${vrEye ? `eye-${vrEye}` : ''}`}
      style={{
        position: 'absolute',
        top: vrMode ? 'auto' : compact ? 8 : 20,
        right: vrMode ? 'auto' : compact ? 8 : 20,
        bottom: vrMode ? 6 : compact ? 8 : 'auto',
        left: vrMode
          ? vrEye === 'right'
            ? '75vw'
            : vrEye === 'left'
              ? '25vw'
              : '50%'
          : 'auto',
        transform: vrMode ? 'translateX(-50%)' : 'none',
        background: 'transparent',
        borderRadius: 16,
        padding: compact ? 6 : 12,
        color: 'white',
        fontFamily: 'system-ui, sans-serif',
        fontSize: compact ? 11 : 14,
        zIndex: 1000,
        backdropFilter: 'none',
        maxWidth: vrMode ? 'calc(50vw - 12px)' : compact ? 220 : 320,
        width: vrMode ? 'min(44vw, 360px)' : compact ? 'min(220px, 50vw)' : 'auto',
        maxHeight: vrMode ? '48vh' : compact ? '66vh' : 'none',
        overflow: compact ? 'auto' : 'visible',
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 4 : 10,
        alignItems: 'flex-start',
      }}
      >
        {(onToggleVoiceGuide || onRepeatVoiceGuide) && (
          <div className="control-row voice-guide-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {onToggleVoiceGuide && (
              <button
                type="button"
                data-gesture-target="true"
                onClick={onToggleVoiceGuide}
                className={`tool-button ${voiceGuideEnabled ? 'active' : ''}`}
                aria-pressed={voiceGuideEnabled}
                aria-label={`Turn voice instructions ${voiceGuideEnabled ? 'off' : 'on'}`}
                title={`Voice instructions are ${voiceGuideEnabled ? 'on' : 'off'}`}
              >
                <span aria-hidden="true">{voiceGuideEnabled ? '🔊' : '🔇'}</span>
                <span>Voice {voiceGuideEnabled ? 'On' : 'Off'}</span>
              </button>
            )}
            {onRepeatVoiceGuide && (
              <button
                type="button"
                data-gesture-target="true"
                disabled={!voiceGuideEnabled || !canRepeatVoiceGuide}
                onClick={onRepeatVoiceGuide}
                className="tool-button"
                aria-label="Repeat the last voice instruction"
                style={{
                  opacity: voiceGuideEnabled && canRepeatVoiceGuide ? 1 : 0.5,
                  cursor: voiceGuideEnabled && canRepeatVoiceGuide ? 'pointer' : 'not-allowed',
                }}
              >
                <span aria-hidden="true">↻</span>
                <span>Repeat</span>
              </button>
            )}
          </div>
        )}

        <div
        className="control-card"
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          boxShadow: 'none',
          backdropFilter: 'none',
        }}
      >
        {(onUndo || onRedo) && (
          <div className="control-row history-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {onUndo && (
              <button
                type="button"
                data-gesture-target="true"
                disabled={!canUndo}
                onClick={onUndo}
                className={`tool-button ${canUndo ? '' : 'disabled'}`}
                style={{ opacity: canUndo ? 1 : 0.5, cursor: canUndo ? 'pointer' : 'not-allowed' }}
              >
                <span aria-hidden="true">↶</span>
                <span>Undo</span>
              </button>
            )}
            {onRedo && (
              <button
                type="button"
                data-gesture-target="true"
                disabled={!canRedo}
                onClick={onRedo}
                className={`tool-button ${canRedo ? '' : 'disabled'}`}
                style={{ opacity: canRedo ? 1 : 0.5, cursor: canRedo ? 'pointer' : 'not-allowed' }}
              >
                <span aria-hidden="true">↷</span>
                <span>Redo</span>
              </button>
            )}
          </div>
        )}

        <div className="control-label" style={{ fontSize: 12, color: '#111', marginBottom: 10 }}>Tools</div>
        <div className="control-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {enabledTools.has('move') && <button
            type="button"
            data-gesture-target="true"
            onClick={() => onToolChange('move')}
            className={`tool-button ${activeTool === 'move' ? 'active' : ''}`}
          >
            <span aria-hidden="true">✋</span>
            <span>Move</span>
          </button>}
          {enabledTools.has('grabAll') && <button
            type="button"
            data-gesture-target="true"
            onClick={() => onToolChange("grabAll")}
            className={"tool-button " + (activeTool === "grabAll" ? "active" : "")}
          >
            <span aria-hidden="true">All</span>
            <span>Grab All</span>
          </button>}
          {enabledTools.has('paint') && <button
            type="button"
            data-gesture-target="true"
            onClick={() => onToolChange('paint')}
            className={`tool-button ${activeTool === 'paint' ? 'active' : ''}`}
          >
            <img src={paintbrushIcon} alt="Paint tool" className="tool-icon" />
            <span>Paint</span>
          </button>}
          {enabledTools.has('bucket') && <button
            type="button"
            data-gesture-target="true"
            onClick={() => onToolChange('bucket')}
            className={`tool-button ${activeTool === 'bucket' ? 'active' : ''}`}
          >
            <img src={bucketIcon} alt="Paint bucket tool" className="tool-icon" />
            <span>Bucket</span>
          </button>}
          {enabledTools.has('eraser') && <button
            type="button"
            data-gesture-target="true"
            onClick={() => onToolChange('eraser')}
            className={`tool-button ${activeTool === 'eraser' ? 'active' : ''}`}
          >
            <img src={eraserIcon} alt="Eraser tool" className="tool-icon" />
            <span>Eraser</span>
          </button>}
          {enabledTools.has('remove') && <button
            type="button"
            data-gesture-target="true"
            onClick={() => onToolChange('remove')}
            className={`tool-button ${activeTool === 'remove' ? 'active' : ''}`}
          >
            <span aria-hidden="true">🗑️</span>
            <span>Remove</span>
          </button>}
        </div>

        {availableObjects.length > 0 && onAddObject && (
          <>
            <div className="control-label" style={{ fontSize: 12, color: '#111', marginBottom: 10 }}>Objects</div>
            <div className="control-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {availableObjects.map((objectItem) => (
                <button
                  key={objectItem.id}
                  type="button"
                  data-gesture-target="true"
                  onClick={() => onAddObject(objectItem.id)}
                  className="tool-button"
                >
                  <span>{objectItem.icon || '◻️'}</span>
                  <span>{objectItem.label}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {(onDuplicateSceneObject || onToggleSceneObjectLock) && (
          <>
            <div className="control-label" style={{ fontSize: 12, color: '#111', marginBottom: 6 }}>
              Selected Shape
            </div>
            <div className={`selected-shape-status ${selectedSceneObject ? 'has-selection' : ''}`} role="status">
              {selectedSceneObject
                ? `${selectedSceneObject.label} • ${selectedSceneObject.locked ? 'Locked' : 'Unlocked'}`
                : 'Pinch a shape to select it'}
            </div>
            <div className="control-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {onDuplicateSceneObject && (
                <button
                  type="button"
                  data-gesture-target="true"
                  disabled={!selectedSceneObject}
                  onClick={onDuplicateSceneObject}
                  className="tool-button"
                  style={{ opacity: selectedSceneObject ? 1 : 0.5 }}
                >
                  <span aria-hidden="true">⧉</span>
                  <span>Duplicate</span>
                </button>
              )}
              {onToggleSceneObjectLock && (
                <button
                  type="button"
                  data-gesture-target="true"
                  disabled={!selectedSceneObject}
                  onClick={onToggleSceneObjectLock}
                  className={`tool-button ${selectedSceneObject?.locked ? 'active' : ''}`}
                  style={{ opacity: selectedSceneObject ? 1 : 0.5 }}
                >
                  <span aria-hidden="true">{selectedSceneObject?.locked ? '🔓' : '🔒'}</span>
                  <span>{selectedSceneObject?.locked ? 'Unlock' : 'Lock'}</span>
                </button>
              )}
            </div>
          </>
        )}

        {modelItems.length > 0 && onSelectModel && (
          <>
            <div className="control-label" style={{ fontSize: 12, color: '#111', marginBottom: 10 }}>Models</div>
            <div className="control-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {modelItems.map((modelItem) => (
                <button
                  key={modelItem.id}
                  type="button"
                  data-gesture-target="true"
                  onClick={() => onSelectModel(modelItem.id)}
                  className={`tool-button ${selectedModelId === modelItem.id ? 'active' : ''}`}
                  aria-pressed={selectedModelId === modelItem.id}
                  aria-label={`Grab ${modelItem.label}`}
                >
                  <span>Grab</span>
                  <span>{modelItem.label}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {onToggleModelLock && (
          <>
            <div className="control-label" style={{ fontSize: 12, color: '#111', marginBottom: 6 }}>
              Selected 3D Model
            </div>
            <div className={`selected-shape-status ${selectedModel ? 'has-selection' : ''}`} role="status">
              {selectedModel
                ? `${selectedModel.label} • ${selectedModel.locked ? 'Locked' : 'Unlocked'}`
                : 'Select or pinch a 3D model'}
            </div>
            <div className="control-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <button
                type="button"
                data-gesture-target="true"
                disabled={!selectedModel}
                onClick={onToggleModelLock}
                className={`tool-button ${selectedModel?.locked ? 'active' : ''}`}
                style={{ opacity: selectedModel ? 1 : 0.5 }}
                aria-label={selectedModel?.locked ? 'Unlock selected 3D model' : 'Lock selected 3D model'}
              >
                <span aria-hidden="true">{selectedModel?.locked ? '🔓' : '🔒'}</span>
                <span>{selectedModel?.locked ? 'Unlock' : 'Lock'}</span>
              </button>
            </div>
          </>
        )}

        {puzzlePieces.length > 0 && onSpawnPuzzlePiece && (
          <>
            <div className="control-label" style={{ fontSize: 12, color: '#111', marginBottom: 10 }}>Puzzle Parts</div>
            <div className="control-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {puzzlePieces.map((piece) => {
                const disabled = piece.spawned || piece.locked;
                return (
                  <button
                    key={piece.id}
                    type="button"
                    data-gesture-target="true"
                    disabled={disabled}
                    aria-label={`${piece.label}${disabled ? ' already placed' : ''}`}
                    onClick={() => onSpawnPuzzlePiece(piece.id)}
                    className={`tool-button ${disabled ? 'active' : ''}`}
                    style={{
                      opacity: disabled ? 0.6 : 1,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <span>Part</span>
                    <span>{piece.label}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {showColors && (
          <>
            <div className="control-label" style={{ fontSize: 12, color: '#111', marginBottom: 10 }}>
              Color {activeTool === 'paint' || activeTool === 'bucket' ? '' : '(Paint/Bucket only)'}
            </div>
            <div
              className="control-row color-row"
              style={{
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
                opacity: activeTool === 'paint' || activeTool === 'bucket' ? 1 : 0.55,
              }}
            >
              {AR_PRESET_COLORS.map(({ hex, name }) => (
                <button
                  type="button"
                  key={hex}
                  data-gesture-target="true"
                  disabled={activeTool !== 'paint' && activeTool !== 'bucket'}
                  onClick={() => onPaintColorChange(new THREE.Color(hex), name)}
                  className="color-swatch"
                  aria-label={`Select ${name}`}
                  title={name}
                  style={{
                    background: hex,
                    border:
                      currentColorHex === hex.toLowerCase()
                        ? '3px solid white'
                        : '1px solid rgba(255,255,255,0.35)',
                  }}
                />
              ))}
            </div>
          </>
        )}

        {showBrushSize && (
          <>
            <div className="control-label" style={{ fontSize: 12, color: '#111', margin: '12px 0 8px 0' }}>
              Brush Size {activeTool === 'paint' || activeTool === 'eraser' ? '' : '(Paint/Eraser only)'}
            </div>
            <div
              className="brush-control"
              style={{
                display: 'grid',
                gap: 8,
                width: '100%',
                opacity: activeTool === 'paint' || activeTool === 'eraser' ? 1 : 0.55,
              }}
            >
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={brushLevel}
                data-gesture-target="true"
                disabled={activeTool !== 'paint' && activeTool !== 'eraser'}
                className="gesture-slider"
                aria-label="Brush size slider"
                onChange={(event) => onBrushLevelChange(Number(event.target.value))}
              />
              <span className="brush-size-value">Size {brushLevel}/10</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
