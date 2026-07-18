import { useEffect, useState } from 'react';
import * as THREE from 'three';
import paintbrushIcon from '../../../assets/ar-icons/paintbrush.svg';
import bucketIcon from '../../../assets/ar-icons/paint-bucket.svg';
import eraserIcon from '../../../assets/ar-icons/eraser.svg';

export type PaintTool = 'move' | 'grabAll' | 'paint' | 'bucket' | 'eraser' | 'remove';

interface ControlPanelProps {
  paintColor: THREE.Color;
  onPaintColorChange: (color: THREE.Color) => void;
  activeTool: PaintTool;
  onToolChange: (tool: PaintTool) => void;
  brushLevel: number;
  onBrushLevelChange: (level: number) => void;
  canUndo?: boolean;
  onUndo?: () => void;
  availableObjects?: Array<{ id: string; label: string; icon?: string }>;
  onAddObject?: (objectId: string) => void;
  modelItems?: Array<{ id: string; label: string }>;
  selectedModelId?: string | null;
  onSelectModel?: (modelId: string) => void;
  puzzlePieces?: Array<{ id: string; label: string; spawned: boolean; locked: boolean }>;
  onSpawnPuzzlePiece?: (pieceId: string) => void;
  compact?: boolean;
  vrMode?: boolean;
  vrEye?: 'left' | 'right';
}

const PRESET_COLORS = [
  // Primary colors
  '#ff0000',
  '#ffff00',
  '#0000ff',
  // Secondary colors
  '#00a651',
  '#ff8c00',
  '#7b2cff',
  // Tertiary colors
  '#ff4500',
  '#ffc300',
  '#b6e600',
  '#00b8a9',
  '#2563eb',
  '#c026d3',
  // Helpful neutrals and art tones
  '#8b5a2b',
  '#f2c29b',
  '#ffffff',
  '#000000',
];

export function ControlPanel({
  paintColor,
  onPaintColorChange,
  activeTool,
  onToolChange,
  brushLevel,
  onBrushLevelChange,
  canUndo = false,
  onUndo,
  availableObjects = [],
  onAddObject,
  modelItems = [],
  selectedModelId = null,
  onSelectModel,
  puzzlePieces = [],
  onSpawnPuzzlePiece,
  compact = false,
  vrMode = false,
  vrEye,
}: ControlPanelProps) {
  const [isLandscape, setIsLandscape] = useState(
    typeof window !== 'undefined' ? window.innerWidth > window.innerHeight : true
  );
  const currentColorHex = `#${paintColor.getHexString()}`;

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
        {onUndo && (
          <button
            type="button"
            data-gesture-target="true"
            disabled={!canUndo}
            onClick={onUndo}
            className={`tool-button ${canUndo ? '' : 'disabled'}`}
            style={{
              marginBottom: 10,
              opacity: canUndo ? 1 : 0.5,
              cursor: canUndo ? 'pointer' : 'not-allowed',
            }}
          >
            <span aria-hidden="true">↶</span>
            <span>Undo</span>
          </button>
        )}

        <div className="control-label" style={{ fontSize: 12, color: '#111', marginBottom: 10 }}>Tools</div>
        <div className="control-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button
            type="button"
            data-gesture-target="true"
            onClick={() => onToolChange('move')}
            className={`tool-button ${activeTool === 'move' ? 'active' : ''}`}
          >
            <span aria-hidden="true">✋</span>
            <span>Move</span>
          </button>
          <button
            type="button"
            data-gesture-target="true"
            onClick={() => onToolChange("grabAll")}
            className={"tool-button " + (activeTool === "grabAll" ? "active" : "")}
          >
            <span aria-hidden="true">All</span>
            <span>Grab All</span>
          </button>
          <button
            type="button"
            data-gesture-target="true"
            onClick={() => onToolChange('paint')}
            className={`tool-button ${activeTool === 'paint' ? 'active' : ''}`}
          >
            <img src={paintbrushIcon} alt="Paint tool" className="tool-icon" />
            <span>Paint</span>
          </button>
          <button
            type="button"
            data-gesture-target="true"
            onClick={() => onToolChange('bucket')}
            className={`tool-button ${activeTool === 'bucket' ? 'active' : ''}`}
          >
            <img src={bucketIcon} alt="Paint bucket tool" className="tool-icon" />
            <span>Bucket</span>
          </button>
          <button
            type="button"
            data-gesture-target="true"
            onClick={() => onToolChange('eraser')}
            className={`tool-button ${activeTool === 'eraser' ? 'active' : ''}`}
          >
            <img src={eraserIcon} alt="Eraser tool" className="tool-icon" />
            <span>Eraser</span>
          </button>
          <button
            type="button"
            data-gesture-target="true"
            onClick={() => onToolChange('remove')}
            className={`tool-button ${activeTool === 'remove' ? 'active' : ''}`}
          >
            <span aria-hidden="true">🗑️</span>
            <span>Remove</span>
          </button>
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
          {PRESET_COLORS.map((color) => (
            <button
              type="button"
              key={color}
              data-gesture-target="true"
              disabled={activeTool !== 'paint' && activeTool !== 'bucket'}
              onClick={() => onPaintColorChange(new THREE.Color(color))}
              className="color-swatch"
              style={{
                background: color,
                border:
                  currentColorHex === color.toLowerCase()
                    ? '3px solid white'
                    : '1px solid rgba(255,255,255,0.35)',
              }}
            />
          ))}
        </div>

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
      </div>
    </div>
  );
}
