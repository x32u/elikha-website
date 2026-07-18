import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Header from '../../components/Header';
import Navbar from '../../components/Navbar';
import { getActivityById } from '../../services/teacherApi';
import { getActivityDetails } from '../../services/studentApi';
import { parseActivityDescription } from '../../utils/activityArConfig';
import { hasStarRating, normalizeStarRating, starRatingLabel } from '../../utils/starRating';
import './ActivityDetails.css';

const ActivityDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState(null);
  const [submission, setSubmission] = useState(null);

  const userInfo = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem('userInfo') || '{}');
    } catch {
      return {};
    }
  }, []);

  const isTeacher = userInfo.role === 'teacher';
  const isStudent = userInfo.role === 'student';
  const isSubmitted = Boolean(
    activity?.is_submitted ||
    submission?.id ||
    submission?.submitted_at ||
    ['submitted', 'reviewed', 'graded', 'completed'].includes(String(activity?.assignment?.status || '').toLowerCase())
  );
  const isReviewed = Boolean(activity?.is_reviewed || submission?.reviewed_at);
  const completion = isSubmitted ? 100 : 0;
  const hasScore = hasStarRating(submission?.score);
  const feedbackText = typeof submission?.feedback === 'string' ? submission.feedback.trim() : '';
  const parsedActivityConfig = useMemo(
    () => parseActivityDescription(activity?.description),
    [activity?.description]
  );
  const activitySummary = useMemo(() => {
    if (typeof activity?.description === 'string' && !activity.description.trim().startsWith('{')) {
      return activity.description;
    }
    return parsedActivityConfig.summary;
  }, [activity?.description, parsedActivityConfig.summary]);
  const arInstructions = useMemo(() => {
    if (typeof activity?.ar_instructions === 'string' && activity.ar_instructions.trim()) {
      return activity.ar_instructions.trim();
    }
    return parsedActivityConfig.instructions || '';
  }, [activity?.ar_instructions, parsedActivityConfig.instructions]);
  const allowedObjectIds = useMemo(() => {
    if (Array.isArray(activity?.allowed_object_ids) && activity.allowed_object_ids.length > 0) {
      return activity.allowed_object_ids;
    }
    return parsedActivityConfig.allowedObjectIds || [];
  }, [activity?.allowed_object_ids, parsedActivityConfig.allowedObjectIds]);
  const modelUrl = useMemo(() => {
    if (typeof activity?.model_url === 'string' && activity.model_url.trim()) {
      return activity.model_url;
    }
    return parsedActivityConfig.modelUrl || undefined;
  }, [activity?.model_url, parsedActivityConfig.modelUrl]);
  const modelFileType = useMemo(() => {
    if (typeof activity?.model_file_type === 'string' && activity.model_file_type.trim()) {
      return activity.model_file_type.trim().toLowerCase();
    }
    return parsedActivityConfig.modelFileType || undefined;
  }, [activity?.model_file_type, parsedActivityConfig.modelFileType]);
  const modelConfigs = useMemo(() => {
    if (Array.isArray(parsedActivityConfig.models) && parsedActivityConfig.models.length > 0) {
      return parsedActivityConfig.models;
    }
    if (modelUrl) {
      return [{
        id: parsedActivityConfig.modelId || 'model-0',
        label: parsedActivityConfig.modelId || '3D Model',
        modelUrl,
        modelFileType,
      }];
    }
    return [];
  }, [modelFileType, modelUrl, parsedActivityConfig.modelId, parsedActivityConfig.models]);
  const puzzlePieces = useMemo(() => {
    const count = Number(activity?.puzzle_pieces ?? parsedActivityConfig.puzzlePieces);
    return count === 3 || count === 4 ? count : 0;
  }, [activity?.puzzle_pieces, parsedActivityConfig.puzzlePieces]);

  useEffect(() => {
    loadActivity();
  }, [id]);

  const loadActivity = async () => {
    setLoading(true);
    try {
      if (isStudent && userInfo.id) {
        const result = await getActivityDetails(id, userInfo.id);
        if (result.success) {
          setActivity(result.data);
          setSubmission(result.data?.submission || null);
        }
      } else {
        const result = await getActivityById(id);
        if (result.success) {
          setActivity(result.data);
        }
      }
    } catch (error) {
      console.error('Error loading activity:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'No due date';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 'No due date';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const renderStars = (value) => {
    const rating = normalizeStarRating(value);
    return (
      <span className="activity-stars" aria-label={starRatingLabel(value)}>
        {[1, 2, 3, 4, 5].map((star) => (
          <span key={star} className={star <= rating ? 'activity-star filled' : 'activity-star'}>
            ★
          </span>
        ))}
        <span className="activity-star-count">{rating}/5</span>
      </span>
    );
  };

  if (loading) {
    return (
      <div className={`activity-details-container ${isStudent ? 'student-activity-details' : 'teacher-activity-details'}`}>
        <Header />
        <div className="activity-not-found">
          <p>Loading...</p>
        </div>
        <Navbar />
      </div>
    );
  }

  if (!activity) {
    return (
      <div className={`activity-details-container ${isStudent ? 'student-activity-details' : 'teacher-activity-details'}`}>
        <Header />
        <div className="activity-not-found">
          <p>Activity not found</p>
          <button onClick={() => navigate('/activities')}>Back to Activities</button>
        </div>
        <Navbar />
      </div>
    );
  }

  return (
    <div className={`activity-details-container ${isStudent ? 'student-activity-details' : 'teacher-activity-details'}`}>
      <Header />
      <main className="activity-details-page">
        <header className="activity-details-header">
          <button className="back-button" onClick={() => navigate('/activities')} aria-label="Go back">
            <span className="back-icon" aria-hidden="true" />
          </button>
          <div className="activity-meta">
            <h1 className="activity-name">{activity.title}</h1>
            <p className="activity-due">Due on {formatDate(activity.due_date)}</p>
          </div>
          {isStudent && !isSubmitted && (
            <button className="pill-button">Submit</button>
          )}
        </header>

        <section className="hero-section">
          <div className="hero-image" role="img" aria-label={activity.subject || 'Activity'} />
          <div className="hero-text">
            <h2>{activity.subject || activity.title}</h2>
          </div>
        </section>

        <section className="section description">
          <p>{activitySummary || 'No description provided.'}</p>
        </section>

        <section className="section">
          <h3 className="section-title">Details</h3>
          <div className="material-list">
            <div className="material-item">
              <span className="material-name">Grade: {activity.grade || 'N/A'}</span>
            </div>
            {activity.subject && (
              <div className="material-item">
                <span className="material-name">Subject: {activity.subject}</span>
              </div>
            )}
            <div className="material-item">
              <span className="material-name">
                Status: {isReviewed ? 'reviewed' : isSubmitted ? 'submitted' : (activity?.is_overdue ? 'overdue' : 'assigned')}
              </span>
            </div>
          </div>
        </section>

        <section className="section progress-section">
          <div className="progress-head">
            <span className="progress-label">Project Progress</span>
          </div>
          <div className="progress-bar" aria-label="Progress" role="progressbar" aria-valuenow={completion} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-fill" style={{ width: `${completion}%` }} />
          </div>
          <div className="progress-foot">{completion}% Complete</div>
        </section>

        <section className="section">
          {isStudent && !isSubmitted && (
            <button
              className="primary-button"
              onClick={() =>
                navigate(`/activity/${id}/start`, {
                  state: {
                    allowedObjectIds,
                    modelUrl,
                    modelFileType,
                    modelConfigs,
                    arInstructions,
                    puzzlePieces,
                  },
                })
              }
            >
              Start Project
            </button>
          )}
          {isStudent && isSubmitted && (
            <div className="already-submitted">
              <h3>{isReviewed ? 'Reviewed' : 'Already submitted'}</h3>
              {submission?.submitted_at && (
                <p>Submitted on {formatDate(submission.submitted_at)}</p>
              )}
              {submission?.reviewed_at && (
                <p>Reviewed on {formatDate(submission.reviewed_at)}</p>
              )}
              {isReviewed && (
                <div className="review-result">
                  <p className="review-score">
                    Rating: {hasScore ? renderStars(submission.score) : 'Not rated yet'}
                  </p>
                  {feedbackText && (
                    <p className="review-feedback">Feedback: {feedbackText}</p>
                  )}
                </div>
              )}
            </div>
          )}
          {isTeacher && (
            <div className="already-submitted">
              <h3>Teacher view</h3>
              <p>Submissions can be reviewed in the Reviews page.</p>
            </div>
          )}
        </section>
      </main>
      <Navbar />
    </div>
  );
};

export default ActivityDetails;
