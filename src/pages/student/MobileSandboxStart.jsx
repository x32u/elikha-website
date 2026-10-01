import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { refreshR2ModelLibrary } from '../../services/r2ModelApi';
import { getPracticeLevel, PRACTICE_LEVELS } from '../../utils/practiceLevels';
import ARApp from '../ar/ARApp';
import './MobileSandboxStart.css';

const EMPTY_OBJECTS = Object.freeze([]);
const LOAD_TIMEOUT_MS = 20000;
const canonicalId = (value) => String(value || '').trim().toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export default function MobileSandboxStart() {
  const navigate = useNavigate();
  const { status, userInfo, refreshAuth } = useAuth();
  const userId = userInfo?.id;
  const role = userInfo?.role;
  const request = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      modelId: params.get('model') || '',
      studentId: params.get('studentId') || '',
      difficulty: params.get('difficulty') || 'easy',
    };
  }, []);
  const [attempt, setAttempt] = useState(0);
  const [launch, setLaunch] = useState(null);
  const [error, setError] = useState('');

  const exit = useCallback(() => {
    const message = JSON.stringify({ type: 'exit', source: 'sandbox' });
    const bridge = window.ElikhaMobile || window.webkit?.messageHandlers?.ElikhaMobile;
    if (bridge?.postMessage) bridge.postMessage(message);
    else navigate('/sandbox', { replace: true });
  }, [navigate]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setError('');
    setLaunch(null);
    const fail = (message) => { if (active) setError(message); };
    const timer = window.setTimeout(() => {
      controller.abort();
      fail('Sandbox loading took too long. Check your connection and retry.');
    }, LOAD_TIMEOUT_MS);

    if (status === 'loading') {
      // AuthContext verifies the transferred native session before any catalog request.
    } else if (status !== 'authenticated') {
      fail('Your app session could not be verified. Return to the app and sign in again.');
      window.clearTimeout(timer);
    } else if (role !== 'student' || (request.studentId && request.studentId !== userId)) {
      fail('This Sandbox link belongs to a different student. Return to the app and open it again.');
      window.clearTimeout(timer);
    } else if (!canonicalId(request.modelId) || !PRACTICE_LEVELS.some((level) => level.id === request.difficulty)) {
      fail('The Sandbox link is incomplete. Return to the app and select a model and difficulty.');
      window.clearTimeout(timer);
    } else {
      refreshR2ModelLibrary({ signal: controller.signal, expectedUserId: userId })
        .then((models) => {
          if (!active || controller.signal.aborted) return;
          const model = models.find((entry) => entry.id === canonicalId(request.modelId));
          if (!model) throw new Error('The selected model is no longer available to this student. Return to the app to refresh the model list.');
          if (!['obj', '3ds', 'glb', 'gltf'].includes(model.fileType)) {
            throw new Error('This model is not ready for AR. Select an AR-ready model in the app.');
          }
          // Snapshot the selected model. Background refreshes must not recreate the AR scene.
          setLaunch({ model, userId });
        })
        .catch((failure) => {
          if (!active || controller.signal.aborted) return;
          fail(failure instanceof TypeError
            ? 'Unable to load the model library. Check your connection and retry.'
            : failure.message || 'Unable to load the model library. Please retry.');
        })
        .finally(() => window.clearTimeout(timer));
    }
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [status, userId, role, request, attempt]);

  const modelConfigs = useMemo(() => launch ? [{
    id: launch.model.id, label: launch.model.label,
    modelUrl: launch.model.modelUrl, modelFileType: launch.model.fileType,
  }] : [], [launch]);
  const level = getPracticeLevel(request.difficulty);

  if (launch && status === 'authenticated' && role === 'student' && launch.userId === userId) {
    return <ARApp key={`${launch.userId}:${launch.model.id}:${level.id}`}
      sandboxMode sandboxDifficulty={level.id} mobileMode
      modelUrl={launch.model.modelUrl} modelFileType={launch.model.fileType}
      modelConfigs={modelConfigs} allowedObjectIds={EMPTY_OBJECTS}
      puzzlePieces={level.puzzlePieces} onExit={exit} />;
  }

  return (
    <main className="mobile-sandbox-launch">
      <section className="mobile-sandbox-launch__content" aria-labelledby="sandbox-launch-title">
        <span className="mobile-sandbox-launch__brand">E-Likha · Sandbox</span>
        <h1 id="sandbox-launch-title">{error ? 'Unable to open Sandbox' : 'Opening Sandbox'}</h1>
        <p role={error ? 'alert' : 'status'} aria-live="polite">
          {error || (status === 'loading' ? 'Loading your session…' : 'Loading your selected 3D model…')}
        </p>
        <div className="mobile-sandbox-launch__actions">
          {error && <button type="button" className="mobile-sandbox-launch__retry" onClick={() => {
            setAttempt((value) => value + 1);
            if (status !== 'authenticated') void refreshAuth({ showLoading: true });
          }}>Retry</button>}
          <button type="button" onClick={exit}>Return to app</button>
        </div>
      </section>
    </main>
  );
}
