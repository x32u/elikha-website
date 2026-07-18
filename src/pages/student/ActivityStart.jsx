import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import ARApp from '../ar/ARApp';
import { DEFAULT_ALLOWED_OBJECT_IDS } from '../../utils/activityArConfig';
import './ActivityStartWarning.css';

// ActivityStart launches the full AR experience
const ActivityStart = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const [safetyAccepted, setSafetyAccepted] = useState(false);
  const viewMode = location.state?.viewMode === true || location.state?.mode === 'view';
  const artworkUrl = location.state?.artworkUrl;
  const arInstructions = typeof location.state?.arInstructions === 'string'
    ? location.state.arInstructions
    : '';
  const initialPaintState = Array.isArray(location.state?.paintState) ? location.state.paintState : [];
  const initialSceneState = Array.isArray(location.state?.sceneState) ? location.state.sceneState : [];
  const initialPuzzleState = Array.isArray(location.state?.puzzleState) ? location.state.puzzleState : [];
  const initialModelState = Array.isArray(location.state?.modelState) ? location.state.modelState : [];
  const initialGroupState = location.state?.groupState && typeof location.state.groupState === 'object'
    ? location.state.groupState
    : null;
  const requestedPuzzlePieces = Number(location.state?.puzzlePieces || 0);
  const puzzlePieces = requestedPuzzlePieces === 3 || requestedPuzzlePieces === 4 ? requestedPuzzlePieces : 0;
  const allowedObjectIds = Array.isArray(location.state?.allowedObjectIds) && location.state.allowedObjectIds.length > 0
    ? location.state.allowedObjectIds
    : [...DEFAULT_ALLOWED_OBJECT_IDS];
  const modelUrl = typeof location.state?.modelUrl === 'string' && location.state.modelUrl.trim()
    ? location.state.modelUrl
    : undefined;
  const modelFileType = typeof location.state?.modelFileType === 'string' && location.state.modelFileType.trim()
    ? location.state.modelFileType.trim().toLowerCase()
    : undefined;
  const modelConfigs = Array.isArray(location.state?.modelConfigs)
    ? location.state.modelConfigs
        .filter((model) => typeof model?.modelUrl === 'string' && model.modelUrl.trim())
        .map((model, index) => ({
          id: model.id || `model-${index}`,
          label: model.label || `Model ${index + 1}`,
          modelUrl: model.modelUrl,
          modelFileType: typeof model.modelFileType === 'string' ? model.modelFileType.trim().toLowerCase() : undefined,
        }))
    : [];
  const userInfo = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem('userInfo') || '{}');
    } catch {
      return {};
    }
  }, []);

  if (!safetyAccepted) {
    return (
      <main className="ar-safety-page" aria-labelledby="ar-safety-title">
        <section className="ar-safety-card">
          <div className="ar-safety-icon" aria-hidden="true">!</div>
          <p className="ar-safety-eyebrow">AR Safety Notice</p>
          <h1 id="ar-safety-title" className="ar-safety-title">
            Photosensitivity Warning
          </h1>
          <p className="ar-safety-copy">
            This AR activity uses a live camera, moving 3D objects, gesture tracking, and bright colors.
            Stop immediately if you feel dizzy, uncomfortable, nauseous, or notice eye strain.
          </p>
          <ul className="ar-safety-list">
            <li>Use AR in a clear, well-lit space.</li>
            <li>Take breaks if the screen feels too bright or fast.</li>
            <li>If you have a history of seizures or photosensitivity, ask an adult before continuing.</li>
          </ul>
          <div className="ar-safety-actions">
            <button
              type="button"
              className="ar-safety-button ar-safety-button--ghost"
              onClick={() => navigate(-1)}
            >
              Go Back
            </button>
            <button
              type="button"
              className="ar-safety-button ar-safety-button--primary"
              onClick={() => setSafetyAccepted(true)}
            >
              I Understand, Enter AR
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <ARApp
      key={location.key}
      activityId={id}
      studentId={userInfo.id}
      viewMode={viewMode ? 'view' : 'edit'}
      artworkUrl={artworkUrl}
      arInstructions={arInstructions}
      initialPaintState={initialPaintState}
      initialSceneState={initialSceneState}
      initialPuzzleState={initialPuzzleState}
      initialModelState={initialModelState}
      initialGroupState={initialGroupState}
      allowedObjectIds={allowedObjectIds}
      modelUrl={modelUrl}
      modelFileType={modelFileType}
      modelConfigs={modelConfigs}
      puzzlePieces={puzzlePieces}
      onExit={() => navigate(-1)}
    />
  );
};

export default ActivityStart;
