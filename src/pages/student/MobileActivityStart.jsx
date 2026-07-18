import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ARApp from '../ar/ARApp';
import { getActivityDetails } from '../../services/studentApi';
import { DEFAULT_ALLOWED_OBJECT_IDS } from '../../utils/activityArConfig';
import './ActivityStartWarning.css';

const postToMobileShell = (payload) => {
  const message = JSON.stringify(payload);

  if (window.ElikhaMobile?.postMessage) {
    window.ElikhaMobile.postMessage(message);
    return true;
  }

  if (window.webkit?.messageHandlers?.ElikhaMobile?.postMessage) {
    window.webkit.messageHandlers.ElikhaMobile.postMessage(message);
    return true;
  }

  return false;
};

const normalizeModelConfigs = (models) => {
  if (!Array.isArray(models)) return [];

  return models
    .filter((model) => typeof model?.modelUrl === 'string' && model.modelUrl.trim())
    .map((model, index) => ({
      id: model.id || `model-${index}`,
      label: model.label || `Model ${index + 1}`,
      modelUrl: model.modelUrl,
      modelFileType:
        typeof model.modelFileType === 'string'
          ? model.modelFileType.trim().toLowerCase()
          : undefined,
    }));
};

const MobileActivityStart = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const studentId = searchParams.get('studentId') || '';
  const returnUrl = searchParams.get('returnUrl') || '';
  const vrMode = searchParams.get('vr') === '1';
  const viewMode = searchParams.get('mode') === 'view' || searchParams.get('view') === '1';
  const [activity, setActivity] = useState(null);
  const [status, setStatus] = useState({ state: 'loading', message: '' });
  const [safetyAccepted, setSafetyAccepted] = useState(false);

  useEffect(() => {
    let alive = true;

    const loadActivity = async () => {
      if (!id || !studentId) {
        setStatus({
          state: 'error',
          message: 'Missing activity or student information.',
        });
        return;
      }

      setStatus({ state: 'loading', message: '' });
      const result = await getActivityDetails(id, studentId);
      if (!alive) return;

      if (!result.success) {
        setStatus({
          state: 'error',
          message: result.error || 'Unable to load this AR activity.',
        });
        return;
      }

      setActivity(result.data);
      setStatus({ state: 'ready', message: '' });
    };

    loadActivity();

    return () => {
      alive = false;
    };
  }, [id, studentId]);

  const finishMobileSession = useCallback(
    (type = 'submitted') => {
      if (postToMobileShell({ type, activityId: id })) return;

      if (returnUrl) {
        window.location.assign(returnUrl);
        return;
      }

      if (window.history.length > 1) {
        navigate(-1);
        return;
      }

      setStatus({
        state: 'done',
        message: type === 'submitted' ? 'Submitted. You can return to the app.' : 'AR session closed.',
      });
    },
    [id, navigate, returnUrl]
  );

  const arConfig = useMemo(() => {
    if (!activity) return null;

    const requestedPuzzlePieces = Number(activity.puzzle_pieces || 0);
    const puzzlePieces =
      requestedPuzzlePieces === 3 || requestedPuzzlePieces === 4 ? requestedPuzzlePieces : 0;
    const allowedObjectIds =
      Array.isArray(activity.allowed_object_ids) && activity.allowed_object_ids.length > 0
        ? activity.allowed_object_ids
        : [...DEFAULT_ALLOWED_OBJECT_IDS];

    return {
      allowedObjectIds,
      arInstructions: typeof activity.ar_instructions === 'string' ? activity.ar_instructions : '',
      artworkUrl: typeof activity.image_url === 'string' ? activity.image_url : '',
      initialPaintState: Array.isArray(activity.paint_state) ? activity.paint_state : [],
      initialSceneState: Array.isArray(activity.scene_state) ? activity.scene_state : [],
      initialPuzzleState: Array.isArray(activity.puzzle_state) ? activity.puzzle_state : [],
      initialModelState: Array.isArray(activity.model_state) ? activity.model_state : [],
      initialGroupState:
        activity.group_state && typeof activity.group_state === 'object'
          ? activity.group_state
          : null,
      modelUrl:
        typeof activity.model_url === 'string' && activity.model_url.trim()
          ? activity.model_url
          : undefined,
      modelFileType:
        typeof activity.model_file_type === 'string' && activity.model_file_type.trim()
          ? activity.model_file_type.trim().toLowerCase()
          : undefined,
      modelConfigs: normalizeModelConfigs(activity.model_configs),
      puzzlePieces,
    };
  }, [activity]);

  if (status.state === 'loading') {
    return (
      <main className="ar-safety-page">
        <section className="ar-safety-card">
          <p className="ar-safety-eyebrow">AR Activity</p>
          <h1 className="ar-safety-title">Loading AR...</h1>
        </section>
      </main>
    );
  }

  if (status.state === 'error' || status.state === 'done') {
    return (
      <main className="ar-safety-page">
        <section className="ar-safety-card">
          <div className="ar-safety-icon" aria-hidden="true">
            {status.state === 'done' ? '✓' : '!'}
          </div>
          <h1 className="ar-safety-title">
            {status.state === 'done' ? 'AR Finished' : 'Unable to Start AR'}
          </h1>
          <p className="ar-safety-copy">{status.message}</p>
          <div className="ar-safety-actions">
            <button
              type="button"
              className="ar-safety-button ar-safety-button--primary"
              onClick={() => finishMobileSession(status.state === 'done' ? 'submitted' : 'exit')}
            >
              Return
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (!safetyAccepted) {
    return (
      <main className="ar-safety-page" aria-labelledby="mobile-ar-safety-title">
        <section className="ar-safety-card">
          <div className="ar-safety-icon" aria-hidden="true">
            !
          </div>
          <p className="ar-safety-eyebrow">AR Safety Notice</p>
          <h1 id="mobile-ar-safety-title" className="ar-safety-title">
            Photosensitivity Warning
          </h1>
          <p className="ar-safety-copy">
            This AR activity uses a live camera, moving 3D objects, gesture tracking, and bright
            colors. Stop if you feel dizzy, uncomfortable, nauseous, or notice eye strain.
          </p>
          <ul className="ar-safety-list">
            <li>Use AR in a clear, well-lit space.</li>
            <li>Take breaks if the screen feels too bright or fast.</li>
            <li>If you have seizures or photosensitivity, ask an adult before continuing.</li>
          </ul>
          <div className="ar-safety-actions">
            <button
              type="button"
              className="ar-safety-button ar-safety-button--ghost"
              onClick={() => finishMobileSession('exit')}
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
      key={`${id}:${studentId}:${viewMode ? 'view' : 'edit'}:${vrMode ? 'vr' : 'mobile'}`}
      activityId={id}
      studentId={studentId}
      viewMode={viewMode ? 'view' : 'edit'}
      mobileMode
      vrMode={vrMode}
      artworkUrl={arConfig?.artworkUrl || ''}
      arInstructions={arConfig?.arInstructions || ''}
      initialPaintState={arConfig?.initialPaintState || []}
      initialSceneState={arConfig?.initialSceneState || []}
      initialPuzzleState={arConfig?.initialPuzzleState || []}
      initialModelState={arConfig?.initialModelState || []}
      initialGroupState={arConfig?.initialGroupState || null}
      allowedObjectIds={arConfig?.allowedObjectIds || [...DEFAULT_ALLOWED_OBJECT_IDS]}
      modelUrl={arConfig?.modelUrl}
      modelFileType={arConfig?.modelFileType}
      modelConfigs={arConfig?.modelConfigs || []}
      puzzlePieces={arConfig?.puzzlePieces || 0}
      onExit={() => finishMobileSession(viewMode ? 'exit' : 'submitted')}
    />
  );
};

export default MobileActivityStart;
