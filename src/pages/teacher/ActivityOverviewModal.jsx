import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getActivityById, getActivitySubmissions } from '../../services/teacherApi';
import {
  AR_OBJECT_LIBRARY,
  getArModelLibrary,
  parseActivityDescription,
} from '../../utils/activityArConfig';
import { formatClassLabel } from '../../utils/classLabels';
import './ClassDetails.css';
import './ActivityDetails.css';

const formatDate = (value) => {
  if (!value) return 'No due date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No due date';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const ActivityOverviewModal = ({ activityId, onClose, onReviews }) => {
  const [loading, setLoading] = useState(false);
  const [activity, setActivity] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [error, setError] = useState('');
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!activityId) return undefined;
    let active = true;
    setLoading(true);
    setActivity(null);
    setSubmissions([]);
    setError('');

    Promise.all([getActivityById(activityId), getActivitySubmissions(activityId)])
      .then(([activityResult, submissionsResult]) => {
        if (!active) return;
        if (!activityResult.success) {
          setError(activityResult.error || 'This activity could not be loaded.');
          return;
        }
        setActivity(activityResult.data);
        setSubmissions(submissionsResult.success ? submissionsResult.data || [] : []);
      })
      .catch((loadError) => {
        if (active) setError(loadError?.message || 'This activity could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [activityId]);

  useEffect(() => {
    if (!activityId) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => dialogRef.current?.querySelector('button')?.focus());

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activityId, onClose]);

  const parsedActivity = useMemo(
    () => parseActivityDescription(activity?.description),
    [activity?.description]
  );
  const selectedModels = useMemo(() => {
    const ids = parsedActivity.modelIds?.length
      ? parsedActivity.modelIds
      : [parsedActivity.modelId].filter(Boolean);
    const library = getArModelLibrary();
    return ids.map((id) => library.find((model) => model.id === id)).filter(Boolean);
  }, [parsedActivity.modelId, parsedActivity.modelIds]);
  const reviewedCount = submissions.filter((submission) =>
    ['reviewed', 'completed', 'graded'].includes(String(submission.status || '').toLowerCase())
  ).length;
  const pendingCount = submissions.length - reviewedCount;

  if (!activityId) return null;

  return createPortal(
    <div
      className="activity-view-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="activity-view-modal teacher-activity-overview"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assignment-activity-overview-title"
      >
        <header className="activity-view-modal__header">
          <div>
            <span>Activity overview</span>
            <h2 id="assignment-activity-overview-title">{activity?.title || 'Activity details'}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close activity overview">×</button>
        </header>

        <div className="activity-view-modal__body">
          {loading && <p className="activity-overview-state" role="status">Loading activity…</p>}
          {error && <p className="activity-overview-state is-error" role="alert">{error}</p>}
          {activity && (
            <>
              {activity.image_url && (
                <img className="activity-view-modal__thumbnail" src={activity.image_url} alt={`${activity.title} thumbnail`} />
              )}
              <dl className="activity-view-modal__facts">
                <div><dt>Class</dt><dd>{activity.class ? formatClassLabel(activity.class) : 'Unassigned'}</dd></div>
                <div><dt>Due date</dt><dd>{formatDate(activity.due_date)}</dd></div>
                <div><dt>Puzzle</dt><dd>{parsedActivity.puzzlePieces > 0 ? `${parsedActivity.puzzlePieces} pieces` : 'Off'}</dd></div>
              </dl>
              <section className="activity-view-modal__section">
                <h3>Description</h3>
                <p>{parsedActivity.summary || 'No description provided.'}</p>
              </section>
              <section className="activity-view-modal__section">
                <h3>Instructions</h3>
                <p>{activity.ar_instructions || parsedActivity.instructions || 'No additional instructions provided.'}</p>
              </section>
              <div className="activity-view-modal__grid">
                <section className="activity-view-modal__section">
                  <h3>Base 3D models</h3>
                  <div className="activity-view-modal__chips">
                    {selectedModels.length
                      ? selectedModels.map((model, index) => <span key={`${model.id}-${index}`}>{model.label}</span>)
                      : <p>No base models selected.</p>}
                  </div>
                </section>
                <section className="activity-view-modal__section">
                  <h3>AR object kit</h3>
                  <div className="activity-view-modal__chips">
                    {(parsedActivity.allowedObjectIds || []).map((objectId) => {
                      const objectDef = AR_OBJECT_LIBRARY.find((item) => item.id === objectId);
                      return objectDef ? <span key={objectId}>{objectDef.icon} {objectDef.label}</span> : null;
                    })}
                  </div>
                </section>
              </div>
              <section className="activity-view-modal__section">
                <h3>Activity color palette</h3>
                {parsedActivity.allowedColors?.length ? (
                  <div className="activity-view-modal__colors">
                    {parsedActivity.allowedColors.map((color) => (
                      <span key={color.hex}><i style={{ backgroundColor: color.hex }} />{color.name || color.hex}</span>
                    ))}
                  </div>
                ) : <p>Uses the default AR color palette.</p>}
              </section>
              {parsedActivity.colorRequirements?.length > 0 && (
                <section className="activity-view-modal__section">
                  <h3>Expected colors</h3>
                  <div className="activity-view-modal__targets">
                    {parsedActivity.colorRequirements.map((requirement, index) => (
                      <div key={`${requirement.targetId}-${requirement.colorHex}-${index}`}>
                        <strong>{requirement.targetLabel || requirement.targetId}</strong>
                        <span><i style={{ backgroundColor: requirement.colorHex }} />{requirement.colorName || requirement.colorHex}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <footer className="activity-view-modal__footer teacher-activity-overview__footer">
          {activity && (
            <p className="teacher-activity-overview__status" aria-label="Submission summary">
              <strong>{submissions.length}</strong> submissions <span aria-hidden="true">•</span>
              <strong>{pendingCount}</strong> pending <span aria-hidden="true">•</span>
              <strong>{reviewedCount}</strong> reviewed
            </p>
          )}
          <div className="teacher-activity-overview__actions">
            <button type="button" className="btn-cancel" onClick={onClose}>Close</button>
            <button type="button" className="btn-submit" onClick={onReviews} disabled={!activity}>Go to reviews</button>
          </div>
        </footer>
      </section>
    </div>,
    document.body
  );
};

export default ActivityOverviewModal;
