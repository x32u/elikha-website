import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import ArPreparationGuide from '../../components/ArPreparationGuide';
import { getActivityById } from '../../services/teacherApi';
import { getActivityDetails, getStudentActivityAssessment } from '../../services/studentApi';
import { parseActivityDescription } from '../../utils/activityArConfig';
import { hasStarRating, normalizeStarRating, starRatingLabel } from '../../utils/starRating';
import './ActivityDetails.css';

const EMPTY_ASSESSMENT = { rubric: null, final_review: null };
const REVIEW_LEVEL_LABELS = {
  B: 'Beginning',
  D: 'Developing',
  C: 'Consistent',
  NO: 'Not observed',
  NA: 'Not applicable',
};

const cleanDisplayText = (value) => typeof value === 'string' ? value.trim() : '';

const criterionResultDescriptor = (criterion) => {
  const rating = cleanDisplayText(criterion?.selected_rating).toUpperCase();
  if (rating === 'B') return cleanDisplayText(criterion?.beginning_descriptor_snapshot);
  if (rating === 'D') return cleanDisplayText(criterion?.developing_descriptor_snapshot);
  if (rating === 'C') return cleanDisplayText(criterion?.consistent_descriptor_snapshot);
  return '';
};

const safeHttpUrl = (value) => {
  try {
    const url = new URL(cleanDisplayText(value));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
};

const safeColorHex = (value) => {
  const color = cleanDisplayText(value);
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#d9d2e9';
};

const ActivityDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState(null);
  const [submission, setSubmission] = useState(null);
  const [assessment, setAssessment] = useState(EMPTY_ASSESSMENT);
  const [assessmentError, setAssessmentError] = useState('');
  const [assessmentLoading, setAssessmentLoading] = useState(false);

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
  const activityRubric = assessment?.rubric || null;
  const rawFinalReview = assessment?.final_review || null;
  const submissionStatus = String(submission?.status || '').trim().toLowerCase();
  const canUseLimitedReviewFallback = Boolean(
    assessmentError &&
    submission?.id &&
    submission?.student_id === userInfo.id &&
    submission?.reviewed_at &&
    submission?.reviewed_by &&
    activity?.teacher_id &&
    submission.reviewed_by === activity.teacher_id &&
    ['reviewed', 'graded', 'completed'].includes(submissionStatus)
  );
  const isLimitedReviewFallback = Boolean(
    !rawFinalReview?.reviewed_at && canUseLimitedReviewFallback
  );
  const finalReview = rawFinalReview?.reviewed_at
    ? rawFinalReview
    : isLimitedReviewFallback
      ? {
        score: submission.score ?? null,
        feedback: cleanDisplayText(submission.feedback),
        reviewed_at: cleanDisplayText(submission.reviewed_at),
        teacher_confirmed_at: '',
        criteria: [],
        approved_color_suggestion: null,
      }
      : null;
  const hasConfirmedObservation = Boolean(finalReview?.teacher_confirmed_at);
  const hasScore = hasStarRating(finalReview?.score);
  const feedbackText = cleanDisplayText(finalReview?.feedback);
  const overallCommentText = cleanDisplayText(finalReview?.overall_comment);
  const additionalOverallComment = overallCommentText && overallCommentText !== feedbackText
    ? overallCommentText
    : '';
  const nextStepsText = hasConfirmedObservation ? cleanDisplayText(finalReview?.next_steps) : '';
  const evidenceUrl = hasConfirmedObservation ? safeHttpUrl(finalReview?.evidence_url) : '';
  const finalCriteria = hasConfirmedObservation && Array.isArray(finalReview?.criteria)
    ? finalReview.criteria
    : [];
  const approvedColorSuggestion = hasConfirmedObservation
    ? finalReview?.approved_color_suggestion || null
    : null;
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

  const loadAssessment = useCallback(async () => {
    if (!isStudent || !id) return;

    setAssessmentLoading(true);
    try {
      const assessmentResult = await getStudentActivityAssessment(id);
      if (assessmentResult.success) {
        setAssessment(assessmentResult.data || EMPTY_ASSESSMENT);
        setAssessmentError('');
      } else {
        setAssessment(EMPTY_ASSESSMENT);
        setAssessmentError(
          assessmentResult.error || 'Rubric and review details are unavailable right now.'
        );
      }
    } catch (error) {
      console.error('Error loading student rubric and review:', error);
      setAssessment(EMPTY_ASSESSMENT);
      setAssessmentError(
        error?.message || 'Rubric and review details are unavailable right now.'
      );
    } finally {
      setAssessmentLoading(false);
    }
  }, [id, isStudent]);

  const loadActivity = useCallback(async () => {
    setLoading(true);
    setAssessment(EMPTY_ASSESSMENT);
    setAssessmentError('');
    try {
      if (isStudent && userInfo.id) {
        const [result] = await Promise.all([
          getActivityDetails(id, userInfo.id),
          loadAssessment(),
        ]);
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
  }, [id, isStudent, loadAssessment, userInfo.id]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

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

  const startProject = () => {
    navigate(`/activity/${id}/start`, {
      state: {
        allowedObjectIds,
        modelUrl,
        modelFileType,
        modelConfigs,
        arInstructions,
        puzzlePieces,
      },
    });
  };

  if (loading) {
    return (
      <div className={`activity-details-container ${isStudent ? 'student-activity-details' : 'teacher-activity-details'}`}>
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
            <button className="pill-button" type="button" onClick={startProject}>Start Project</button>
          )}
        </header>

        {isStudent && !isSubmitted && <ArPreparationGuide />}

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
              <span className="material-name">Grade level: {activity.grade || 'N/A'}</span>
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

        {isStudent && (
          <section className="section activity-rubric-section" aria-labelledby="activity-rubric-heading">
            <div className="activity-rubric-heading">
              <div>
                <p className="activity-rubric-eyebrow">Before you begin</p>
                <h3 className="section-title" id="activity-rubric-heading">How your work will be checked</h3>
              </div>
              {activityRubric?.assignedVersion && (
                <span className="activity-rubric-version">Rubric v{activityRubric.assignedVersion}</span>
              )}
            </div>

            {assessmentError ? (
              <div className="activity-rubric-error" role="status">
                <p className="activity-rubric-status">
                  {isReviewed
                    ? canUseLimitedReviewFallback
                      ? 'Your activity has been reviewed. Your score is shown below, but the detailed rubric results could not be loaded.'
                      : 'Your activity has been reviewed, but the score and detailed rubric results could not be loaded.'
                    : isSubmitted
                      ? 'Your activity was submitted, but the rubric details could not be loaded right now.'
                      : 'We could not load how your work will be checked. Try again before starting.'}
                </p>
                <button
                  type="button"
                  className="activity-rubric-retry"
                  onClick={loadAssessment}
                  disabled={assessmentLoading}
                  aria-label="Retry loading rubric and review details"
                >
                  {assessmentLoading ? 'Trying again…' : 'Retry rubric and review'}
                </button>
              </div>
            ) : activityRubric ? (
              <>
                <div className="activity-rubric-intro">
                  <h4>{activityRubric.title || 'Activity rubric'}</h4>
                  {activityRubric.description && <p>{activityRubric.description}</p>}
                </div>
                {Array.isArray(activityRubric.criteria) && activityRubric.criteria.length > 0 ? (
                  <div className="activity-rubric-criteria">
                    {activityRubric.criteria.map((criterion, criterionIndex) => (
                      <article className="activity-rubric-criterion" key={`${criterion.name || 'criterion'}-${criterionIndex}`}>
                        <h4>{criterionIndex + 1}. {criterion.name || 'Observable skill'}</h4>
                        <dl>
                          {(criterion.levels || []).map((level, levelIndex) => (
                            <div key={`${level.code || level.label || 'level'}-${levelIndex}`}>
                              <dt>
                                {level.code && <span>{level.code}</span>}
                                {level.label || REVIEW_LEVEL_LABELS[level.code] || 'Level'}
                              </dt>
                              <dd>{level.description || 'No description provided.'}</dd>
                            </div>
                          ))}
                        </dl>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="activity-rubric-status">Your teacher attached this rubric without criterion details.</p>
                )}
              </>
            ) : (
              <p className="activity-rubric-status">Your teacher has not attached a rubric to this activity yet.</p>
            )}
          </section>
        )}

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
              type="button"
              onClick={startProject}
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
              {!isReviewed && (
                <p className="final-review-pending" role="status">
                  Waiting for your teacher's review. Your final score and rubric results will appear here after confirmation.
                </p>
              )}
              {isReviewed && finalReview ? (
                <div className="review-result" aria-labelledby="final-review-heading">
                  <div className="final-review-heading">
                    <div>
                      <p className="final-review-eyebrow">Final teacher review</p>
                      <h4 id="final-review-heading">Your final activity review</h4>
                    </div>
                    {finalReview.observation_date && (
                      <span>{formatDate(finalReview.observation_date)}</span>
                    )}
                  </div>

                  <p className="review-score">
                    Final rating: {hasScore ? renderStars(finalReview.score) : 'Not rated yet'}
                  </p>

                  {feedbackText && (
                    <div className="final-review-callout">
                      <strong>Teacher feedback</strong>
                      <p className="review-feedback">{feedbackText}</p>
                    </div>
                  )}
                  {additionalOverallComment && (
                    <div className="final-review-callout">
                      <strong>Rubric comment</strong>
                      <p>{additionalOverallComment}</p>
                    </div>
                  )}

                  {activityRubric && !hasConfirmedObservation && (
                    <p className="final-review-pending" role="status">
                      Your final rating is ready. Detailed criterion results are not available for this review.
                    </p>
                  )}

                  {isLimitedReviewFallback && (
                    <p className="final-review-pending" role="status">
                      Your confirmed score and teacher feedback are shown here. Retry above to load criterion results and approved suggestions.
                    </p>
                  )}

                  {finalCriteria.length > 0 && (
                    <div className="final-criteria" aria-label="Criterion results">
                      <h4>Criterion results</h4>
                      {finalCriteria.map((criterion, criterionIndex) => {
                        const rating = cleanDisplayText(criterion.selected_rating).toUpperCase();
                        const descriptor = criterionResultDescriptor(criterion);
                        return (
                          <article className="final-criterion" key={`${criterion.criterion_index ?? criterionIndex}-${criterion.criterion_title_snapshot}`}>
                            <div className="final-criterion-heading">
                              <h5>{criterion.criterion_title_snapshot || `Criterion ${criterionIndex + 1}`}</h5>
                              <span className={`final-criterion-rating rating-${rating.toLowerCase()}`}>
                                {rating || '—'}{REVIEW_LEVEL_LABELS[rating] ? ` — ${REVIEW_LEVEL_LABELS[rating]}` : ''}
                              </span>
                            </div>
                            {descriptor && <p>{descriptor}</p>}
                            {criterion.teacher_note && (
                              <p className="final-criterion-note">
                                <strong>Teacher note:</strong> {criterion.teacher_note}
                              </p>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}

                  {(nextStepsText || evidenceUrl) && (
                    <div className="teacher-guidance">
                      <h4>Teacher guidance</h4>
                      {nextStepsText && (
                        <p><strong>Next steps:</strong> {nextStepsText}</p>
                      )}
                      {evidenceUrl && (
                        <a href={evidenceUrl} target="_blank" rel="noreferrer noopener">
                          View the evidence attached by your teacher
                        </a>
                      )}
                    </div>
                  )}

                  {approvedColorSuggestion && (
                    <div className="approved-color-suggestion">
                      <h4>Teacher-approved color suggestion</h4>
                      {approvedColorSuggestion.message && <p>{approvedColorSuggestion.message}</p>}
                      {Array.isArray(approvedColorSuggestion.colors) && approvedColorSuggestion.colors.length > 0 && (
                        <div className="approved-color-list" aria-label="Approved suggested colors">
                          {approvedColorSuggestion.colors.map((color, colorIndex) => (
                            <span key={`${color.name || color.hex || 'color'}-${colorIndex}`}>
                              <i style={{ backgroundColor: safeColorHex(color.hex) }} aria-hidden="true" />
                              {color.name || color.hex || 'Suggested color'}
                            </span>
                          ))}
                        </div>
                      )}
                      {approvedColorSuggestion.rationale && (
                        <small>{approvedColorSuggestion.rationale}</small>
                      )}
                    </div>
                  )}
                </div>
              ) : isReviewed ? (
                <p className="final-review-pending" role="status">
                  Your teacher has reviewed this activity. Detailed rubric results will appear after the review is confirmed.
                </p>
              ) : null}
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
