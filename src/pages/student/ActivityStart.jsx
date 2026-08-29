import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import ARApp from '../ar/ARApp';
import ActivityLock from '../../components/ActivityLock';
import ArPreparationGuide from '../../components/ArPreparationGuide';
import { supabase } from '../../lib/supabase';
import { getActivityDetails } from '../../services/studentApi';
import { buildActivityStartConfig } from '../../utils/activityStartConfig';
import './ActivityStartWarning.css';

// ActivityStart launches the full AR experience.
const ActivityStart = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const [safetyAccepted, setSafetyAccepted] = useState(false);
  const [activity, setActivity] = useState(null);
  const [studentId, setStudentId] = useState('');
  const [status, setStatus] = useState({ state: 'loading', message: '' });

  const userInfo = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem('userInfo') || '{}');
    } catch {
      return {};
    }
  }, []);

  useEffect(() => {
    let alive = true;

    const loadActivity = async () => {
      setSafetyAccepted(false);
      setActivity(null);
      setStatus({ state: 'loading', message: '' });

      if (!id) {
        setStatus({ state: 'error', message: 'Missing activity information.' });
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (!alive) return;

      const authenticatedUser = authData?.user;
      const sessionRole = String(userInfo.role || '').trim().toLowerCase();
      if (authError || !authenticatedUser?.id) {
        setStatus({
          state: 'error',
          message: 'Your secure sign-in session could not be verified. Please sign in again.',
        });
        return;
      }

      if (
        sessionRole !== 'student' ||
        (userInfo.id && String(userInfo.id) !== String(authenticatedUser.id))
      ) {
        setStatus({
          state: 'error',
          message: 'This AR activity must be opened from the signed-in student account.',
        });
        return;
      }

      const result = await getActivityDetails(id, authenticatedUser.id);
      if (!alive) return;

      if (!result.success || !result.data) {
        setStatus({
          state: 'error',
          message: result.error || 'Unable to load this AR activity.',
        });
        return;
      }

      if (!result.data.assignment?.id && !result.data.is_submitted) {
        setStatus({
          state: 'error',
          message: 'This activity is not assigned to your student account.',
        });
        return;
      }

      setStudentId(authenticatedUser.id);
      setActivity(result.data);
      setStatus({ state: 'ready', message: '' });
    };

    loadActivity().catch((error) => {
      if (!alive) return;
      console.error('Error loading secure AR activity:', error);
      setStatus({
        state: 'error',
        message: 'Unable to verify and load this AR activity. Please try again.',
      });
    });

    return () => {
      alive = false;
    };
  }, [id, userInfo.id, userInfo.role]);

  const arConfig = useMemo(
    () => buildActivityStartConfig({ activity, routeState: location.state }),
    [activity, location.state]
  );

  const leaveActivity = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(`/activity/${id}`, { replace: true });
  }, [id, navigate]);

  if (status.state === 'loading') {
    return (
      <main className="ar-safety-page" aria-live="polite">
        <section className="ar-safety-card">
          <p className="ar-safety-eyebrow">AR Activity</p>
          <h1 className="ar-safety-title">Loading AR...</h1>
          <p className="ar-safety-copy">Checking your activity and secure student session.</p>
        </section>
      </main>
    );
  }

  if (status.state === 'error') {
    return (
      <main className="ar-safety-page" aria-labelledby="ar-load-error-title">
        <section className="ar-safety-card">
          <div className="ar-safety-icon" aria-hidden="true">!</div>
          <p className="ar-safety-eyebrow">AR Activity</p>
          <h1 id="ar-load-error-title" className="ar-safety-title">Unable to Start AR</h1>
          <p className="ar-safety-copy">{status.message}</p>
          <div className="ar-safety-actions">
            <button
              type="button"
              className="ar-safety-button ar-safety-button--primary"
              onClick={() => navigate('/activities', { replace: true })}
            >
              Return to Activities
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (!safetyAccepted) {
    return (
      <main className="ar-safety-page" aria-labelledby="ar-safety-title">
        <section className="ar-safety-card">
          <div className="ar-safety-icon" aria-hidden="true">!</div>
          <p className="ar-safety-eyebrow">
            {arConfig.viewMode ? 'Submitted Activity Viewer' : 'AR Safety Notice'}
          </p>
          <h1 id="ar-safety-title" className="ar-safety-title">
            Photosensitivity Warning
          </h1>
          <p className="ar-safety-copy">
            This AR activity uses a live camera, moving 3D objects, gesture tracking, and bright colors.
            Stop immediately if you feel dizzy, uncomfortable, nauseous, or notice eye strain.
          </p>
          {arConfig.readOnlyReason === 'submitted' && (
            <p className="ar-safety-copy">
              This work was already submitted and will open read-only.
            </p>
          )}
          {arConfig.readOnlyReason === 'reviewed' && (
            <p className="ar-safety-copy">
              This work was already reviewed and will open read-only.
            </p>
          )}
          <ul className="ar-safety-list">
            <li>Use AR in a clear, well-lit space.</li>
            <li>Take breaks if the screen feels too bright or fast.</li>
            <li>If you have a history of seizures or photosensitivity, ask an adult before continuing.</li>
          </ul>
          <ArPreparationGuide compact />
          <div className="ar-safety-actions">
            <button
              type="button"
              className="ar-safety-button ar-safety-button--ghost"
              onClick={leaveActivity}
            >
              Go Back
            </button>
            <button
              type="button"
              className="ar-safety-button ar-safety-button--primary"
              onClick={() => {
                setSafetyAccepted(true);
                document.documentElement.requestFullscreen?.().catch(() => {});
              }}
            >
              I Understand, Enter AR
            </button>
          </div>
        </section>
      </main>
    );
  }

  const arExperience = (
    <ARApp
      key={`${id}:${activity?.submission?.id || 'new'}:${arConfig.viewMode ? 'view' : 'edit'}`}
      activityId={id}
      studentId={studentId}
      viewMode={arConfig.viewMode ? 'view' : 'edit'}
      artworkUrl={arConfig.artworkUrl}
      arInstructions={arConfig.arInstructions}
      initialPaintState={arConfig.initialPaintState}
      initialSceneState={arConfig.initialSceneState}
      initialPuzzleState={arConfig.initialPuzzleState}
      initialModelState={arConfig.initialModelState}
      initialGroupState={arConfig.initialGroupState}
      allowedObjectIds={arConfig.allowedObjectIds}
      modelUrl={arConfig.modelUrl}
      modelFileType={arConfig.modelFileType}
      modelConfigs={arConfig.modelConfigs}
      puzzlePieces={arConfig.puzzlePieces}
      onExit={leaveActivity}
    />
  );

  if (arConfig.viewMode) return arExperience;

  return (
    <ActivityLock activityId={id} studentId={studentId}>
      {arExperience}
    </ActivityLock>
  );
};

export default ActivityStart;
