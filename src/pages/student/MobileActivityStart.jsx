import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ARApp from '../ar/ARApp';
import ArPreparationGuide from '../../components/ArPreparationGuide';
import { supabase } from '../../lib/supabase';
import { getActivityDetails } from '../../services/studentApi';
import { buildActivityStartConfig } from '../../utils/activityStartConfig';
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

const MobileActivityStart = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const studentId = searchParams.get('studentId') || '';
  const returnUrl = searchParams.get('returnUrl') || '';
  const vrMode = searchParams.get('vr') === '1';
  const requestedViewMode =
    searchParams.get('mode') === 'view' || searchParams.get('view') === '1';
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
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (!alive) return;

      const authenticatedUser = authData?.user;
      if (authError || !authenticatedUser?.id) {
        setStatus({
          state: 'error',
          message:
            'This AR window does not have a secure signed-in session. Return to the mobile app and sign in again.',
        });
        return;
      }

      if (String(authenticatedUser.id) !== String(studentId)) {
        setStatus({
          state: 'error',
          message:
            'The signed-in student does not match this AR activity link. Return to the mobile app and reopen the activity.',
        });
        return;
      }

      const result = await getActivityDetails(id, authenticatedUser.id);
      if (!alive) return;

      if (!result.success) {
        setStatus({
          state: 'error',
          message: result.error || 'Unable to load this AR activity.',
        });
        return;
      }

      if (!result.data?.assignment?.id && !result.data?.is_submitted) {
        setStatus({
          state: 'error',
          message: 'This activity is not assigned to the signed-in student.',
        });
        return;
      }

      setActivity(result.data);
      setStatus({ state: 'ready', message: '' });
    };

    loadActivity().catch((error) => {
      if (!alive) return;
      console.error('Error loading secure mobile AR activity:', error);
      setStatus({
        state: 'error',
        message:
          'Unable to verify this mobile AR session. Return to the mobile app and try again.',
      });
    });

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

    return buildActivityStartConfig({
      activity,
      routeState: requestedViewMode ? { mode: 'view' } : null,
    });
  }, [activity, requestedViewMode]);

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
          <ArPreparationGuide compact />
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
      key={`${id}:${studentId}:${arConfig?.viewMode ? 'view' : 'edit'}:${vrMode ? 'vr' : 'mobile'}`}
      activityId={id}
      studentId={studentId}
      viewMode={arConfig?.viewMode ? 'view' : 'edit'}
      mobileMode
      vrMode={vrMode}
      artworkUrl={arConfig?.artworkUrl || ''}
      arInstructions={arConfig?.arInstructions || ''}
      initialPaintState={arConfig?.initialPaintState || []}
      initialSceneState={arConfig?.initialSceneState || []}
      initialPuzzleState={arConfig?.initialPuzzleState || []}
      initialModelState={arConfig?.initialModelState || []}
      initialGroupState={arConfig?.initialGroupState || null}
      allowedObjectIds={arConfig?.allowedObjectIds || []}
      modelUrl={arConfig?.modelUrl}
      modelFileType={arConfig?.modelFileType}
      modelConfigs={arConfig?.modelConfigs || []}
      puzzlePieces={arConfig?.puzzlePieces || 0}
      onExit={(reason) => finishMobileSession(reason === 'submitted' ? 'submitted' : 'exit')}
    />
  );
};

export default MobileActivityStart;
