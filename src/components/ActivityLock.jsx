import { useCallback, useEffect, useRef, useState } from 'react';
import { reportActivityLockAlert } from '../services/studentApi';
import './ActivityLock.css';

// Browser code cannot block the operating system, but it can keep the activity
// full screen and create an auditable record whenever the student leaves it.
const ActivityLock = ({ activityId, studentId, children }) => {
  const [locked, setLocked] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [notice, setNotice] = useState('Activity locked');
  const lastAlertRef = useRef({});

  const alertTeacher = useCallback(async (eventType, metadata = {}) => {
    if (!activityId || !studentId) return false;

    // Avoid duplicate browser events flooding the teacher's alert list.
    const now = Date.now();
    if (now - (lastAlertRef.current[eventType] || 0) < 3000) return true;
    lastAlertRef.current[eventType] = now;
    const result = await reportActivityLockAlert({ studentId, activityId, eventType, metadata });
    return result.success === true;
  }, [activityId, studentId]);

  const enterFullscreen = useCallback(async () => {
    if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
    try {
      await document.documentElement.requestFullscreen();
      setIsFullscreen(Boolean(document.fullscreenElement));
    } catch {
      setNotice('Fullscreen was blocked. Keep this activity open.');
    }
  }, []);

  useEffect(() => {
    if (locked) enterFullscreen();

    const onVisibilityChange = () => {
      if (document.hidden && locked) {
        // Alt+Tab/backgrounding breaks the activity session. Keep the visual
        // state unlocked when the student returns rather than silently relocking.
        setLocked(false);
        setIsBrowserFullscreen(false);
        setNotice('Activity left — sending teacher alert…');
        void alertTeacher('left_activity', { visibilityState: document.visibilityState })
          .then((reported) => {
            setNotice(
              reported
                ? 'Activity left — teacher alerted'
                : 'Activity left — teacher alert could not be sent'
            );
          });
      }
    };
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      if (!document.fullscreenElement && locked && !isBrowserFullscreen) {
        setNotice('Fullscreen exited — sending teacher alert…');
        void alertTeacher('fullscreen_exited').then((reported) => {
          setNotice(
            reported
              ? 'Fullscreen exited — teacher alerted'
              : 'Fullscreen exited — teacher alert could not be sent'
          );
        });
      }
    };
    const onKeyDown = (event) => {
      // Browsers reserve F11, so preventDefault is not guaranteed. Record the
      // state change even if Chrome also applies its own browser-fullscreen mode.
      if (event.key === 'F11' && locked) {
        event.preventDefault();
        setLocked(false);
        setIsBrowserFullscreen(false);
        setNotice('Browser fullscreen attempt — sending teacher alert…');
        void alertTeacher('fullscreen_exited', { trigger: 'f11' }).then((reported) => {
          setNotice(
            reported
              ? 'Browser fullscreen attempt — teacher alerted'
              : 'Browser fullscreen attempt — teacher alert could not be sent'
          );
        });
      } else if (event.key === 'F11' && !locked) {
        event.preventDefault();
        setLocked(true);
        setIsBrowserFullscreen(true);
        setNotice('Activity locked');
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('keydown', onKeyDown, true);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [alertTeacher, enterFullscreen, isBrowserFullscreen, locked]);

  const toggleLock = async () => {
    const activityIsLocked = locked && (isFullscreen || isBrowserFullscreen);
    if (activityIsLocked) {
      setLocked(false);
      setNotice('Unlocked — sending teacher alert…');
      const reported = await alertTeacher('student_unlocked');
      setNotice(reported ? 'Unlocked — teacher alerted' : 'Unlocked — teacher alert could not be sent');
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      return;
    }

    setLocked(true);
    setNotice('Activity locked');
    await enterFullscreen();
  };

  const activityIsLocked = locked && (isFullscreen || isBrowserFullscreen);

  return (
    <div className="activity-lock-shell">
      {children}
      <div className={`activity-lock-status ${locked ? 'is-locked' : 'is-unlocked'}`} role="status">
        {notice}
      </div>
      <button
        type="button"
        className={`activity-lock-toggle ${activityIsLocked ? 'is-locked' : 'is-unlocked'}`}
        onClick={toggleLock}
        aria-pressed={activityIsLocked}
        aria-label={activityIsLocked ? 'Unlock activity and alert teacher' : 'Lock activity'}
        title={activityIsLocked ? 'Unlock (teacher will be alerted)' : 'Lock activity'}
      >
        <svg className="activity-lock-icon" viewBox="0 0 24 24" aria-hidden="true">
          {activityIsLocked ? (
            <>
              <path d="M7 10V7a5 5 0 0 1 10 0v3" />
              <rect x="4" y="10" width="16" height="11" rx="2" />
              <path d="M12 14v3" />
            </>
          ) : (
            <>
              <path d="M7 10V7a5 5 0 0 1 8.6-3.4" />
              <rect x="4" y="10" width="16" height="11" rx="2" />
              <path d="M12 14v3" />
            </>
          )}
        </svg>
        <span>{activityIsLocked ? 'Locked' : 'Unlocked'}</span>
      </button>
    </div>
  );
};

export default ActivityLock;
