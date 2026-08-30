import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import './Reviews.css';
import { getAllSubmissions, gradeSubmission } from '../../services/teacherApi';
import { parseArSubmissionDescription } from '../../utils/arSubmission';
import { parseActivityDescription } from '../../utils/activityArConfig';
import { hasStarRating, normalizeStarRating, starRatingLabel } from '../../utils/starRating';
import { getActivityRubric } from '../../services/rubricApi';
import { getAiSubmissionGrade, requestAiSubmissionGrade } from '../../services/aiGradingApi';
import { buildTeacherRubricEvidence } from '../../utils/teacherReviewEvidence';
import { SF9_RATINGS, sf9RatingLabel, toSf9RatingCode } from '../../utils/sf9Competencies';
import { sf9DraftStarRationale } from '../../utils/sf9StarRating';

const rubricLevelLabel = (level) => level.code ? `${level.code} — ${level.label || sf9RatingLabel(level.code) || ''}` : `${level.score} pts`;
// An AI criterion carries its SF9 rating in levelCode. A missing or NO code
// means the draft could not judge that criterion, which is not the same as
// Beginning, so it must never fall back to a level.
const developmentalLevel = (criterion) =>
  sf9RatingLabel(criterion?.levelCode) || 'Needs teacher review';
const starRatingDescription = (value) => ({ 5: 'Consistent', 4: 'Developing, approaching Consistent', 3: 'Developing', 2: 'Beginning, with emerging progress', 1: 'Beginning' }[normalizeStarRating(value)] || 'Not rated');

const Reviews = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActivity, setFilterActivity] = useState('all');
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [submissions, setSubmissions] = useState([]);
  const [grading, setGrading] = useState(false);
  const [activityRubric, setActivityRubric] = useState(null);
  const [rubricLoading, setRubricLoading] = useState(false);
  const [aiEvaluation, setAiEvaluation] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [criterionRatings, setCriterionRatings] = useState([]);
  const [criterionNotes, setCriterionNotes] = useState([]);
  const [observationDate, setObservationDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [nextSteps, setNextSteps] = useState('');
  const [teacherConfirmed, setTeacherConfirmed] = useState(false);
  const reviewRequestIdRef = useRef(0);

  useEffect(() => {
    loadSubmissions();
  }, []);

  useEffect(() => {
    if (selectedSubmission) {
      setScore(normalizeStarRating(selectedSubmission.score) || '');
      setFeedback(selectedSubmission.feedback || '');
    }
  }, [selectedSubmission]);

  const loadSubmissions = async () => {
    setLoading(true);
    try {
      const userInfo = JSON.parse(sessionStorage.getItem('userInfo') || '{}');
      const result = await getAllSubmissions(userInfo.id);
      
      if (result.success) {
        // Transform submissions data
        const transformedSubmissions = result.data.map(sub => {
          const dueDate = sub.activity?.due_date || sub.due_date || null;
          const activityTitle = sub.activity?.title || sub.activity_title || 'Untitled';
          const parsedArSubmission = parseArSubmissionDescription(sub.description);
          const parsedActivity = parseActivityDescription(sub.activity?.description);
          const studentName = sub.student?.name ||
            [sub.student_first_name, sub.student_last_name].filter(Boolean).join(' ') ||
            'Student';

          const normalizedSubmissionStatus = String(sub.status || '').toLowerCase();
          const isReviewed =
            Boolean(sub.reviewed_at) || ['reviewed', 'graded', 'completed'].includes(normalizedSubmissionStatus);
          const isSubmitted =
            Boolean(sub.submitted_at) || ['submitted', 'late', 'reviewed', 'graded', 'completed'].includes(normalizedSubmissionStatus);
          const isLate = sub.is_late || (sub.submitted_at && dueDate && new Date(sub.submitted_at) > new Date(dueDate));
          const displayStatus = isReviewed ? 'reviewed' : isLate ? 'late' : (isSubmitted ? 'submitted' : 'submitted');
          
          return {
            id: sub.id,
            activityId: sub.activity?.id || sub.activity_id,
            studentName,
            studentId: sub.student_id,
            activityTitle,
            submittedDate: sub.submitted_at,
            dueDate,
            status: displayStatus,
            artwork: sub.artwork_url || '🎨',
            description: parsedArSubmission?.summary || sub.description || 'No description provided',
            paintState: parsedArSubmission?.paintState || [],
            sceneState: parsedArSubmission?.sceneState || [],
            puzzleState: parsedArSubmission?.puzzleState || [],
            modelState: parsedArSubmission?.modelState || [],
            groupState: parsedArSubmission?.groupState || null,
            allowedObjectIds: parsedActivity.allowedObjectIds || [],
            modelUrl: parsedActivity.modelUrl || undefined,
            modelFileType: parsedActivity.modelFileType || undefined,
            modelConfigs: parsedActivity.models || [],
            puzzlePieces: parsedActivity.puzzlePieces || 0,
            score: sub.score,
            feedback: sub.feedback
          };
        });
        setSubmissions(transformedSubmissions);
      } else {
        console.error('Failed to load submissions:', result.error);
      }
    } catch (error) {
      console.error('Error loading submissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      'reviewed': { label: 'Reviewed', class: 'status-completed' },
      'late': { label: 'Late Submitted', class: 'status-late' },
      'submitted': { label: 'Submitted', class: 'status-pending' }
    };
    return badges[status] || badges.submitted;
  };

  const formatDateTime = (value) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString();
  };

  const isImageArtwork = (value) =>
    typeof value === 'string' &&
    (value.startsWith('data:image/') || value.startsWith('http://') || value.startsWith('https://'));

  const renderStars = (value, compact = false) => {
    const rating = normalizeStarRating(value);
    return (
      <span className={`stars-display ${compact ? 'compact' : ''}`} aria-label={starRatingLabel(value)}>
        {[1, 2, 3, 4, 5].map((star) => (
          <span key={star} className={star <= rating ? 'star filled' : 'star'}>
            ★
          </span>
        ))}
        <span className="star-count">{rating ? `${rating}/5` : 'N/A'}</span>
      </span>
    );
  };

  // Get unique activities for filter
  const uniqueActivities = ['all', ...new Set(submissions.map(s => s.activityTitle))];

  const filteredSubmissions = submissions.filter(sub => {
    const matchesStatus = filterStatus === 'all' || sub.status === filterStatus;
    const matchesSearch = sub.studentName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesActivity = filterActivity === 'all' || sub.activityTitle === filterActivity;
    
    return matchesStatus && matchesSearch && matchesActivity;
  });

  const handleReview = async (submission) => {
    const requestId = reviewRequestIdRef.current + 1;
    reviewRequestIdRef.current = requestId;
    setSelectedSubmission(submission);
    setScore(normalizeStarRating(submission.score) || '');
    setFeedback(submission.feedback || '');
    setActivityRubric(null);
    setAiEvaluation(null);
    setAiLoading(false);
    setAiError('');
    setRubricLoading(true);

    const [rubricResult, evaluationResult] = await Promise.all([
      getActivityRubric(submission.activityId),
      getAiSubmissionGrade(submission.id),
    ]);

    if (reviewRequestIdRef.current !== requestId) return;

    const rubric = rubricResult.success ? rubricResult.data : null;
    setActivityRubric(rubric);
    setCriterionRatings((rubric?.criteria || []).map(() => ''));
    setCriterionNotes((rubric?.criteria || []).map(() => ''));
    setObservationDate(new Date().toISOString().slice(0, 10));
    setEvidenceUrl(submission.artwork && submission.artwork.startsWith('http') ? submission.artwork : '');
    setNextSteps('');
    setTeacherConfirmed(false);
    setRubricLoading(false);

    if (evaluationResult.success && evaluationResult.data) {
      setAiEvaluation(evaluationResult.data);
      if (evaluationResult.data.status === 'failed') {
        setAiError(evaluationResult.data.error || 'The previous AI check failed.');
      }
      return;
    }

    if (!evaluationResult.success && !evaluationResult.error?.includes('submission_ai_evaluations')) {
      setAiError(evaluationResult.error);
    }

    // Automatically check older submissions that predate the submit-time trigger.
    if (rubric && isImageArtwork(submission.artwork)) {
      setAiLoading(true);
      const checkResult = await requestAiSubmissionGrade(submission.id);
      if (reviewRequestIdRef.current !== requestId) return;
      setAiLoading(false);
      if (checkResult.success) {
        setAiEvaluation(checkResult.data || { status: checkResult.status });
        setAiError('');
      } else {
        setAiError(checkResult.error);
      }
    }
  };

  const handleAiCheck = async (force = false) => {
    if (!selectedSubmission || !activityRubric) return;
    const requestId = reviewRequestIdRef.current;
    const submissionId = selectedSubmission.id;

    setAiLoading(true);
    setAiError('');
    const result = await requestAiSubmissionGrade(submissionId, { force });
    if (reviewRequestIdRef.current !== requestId) return;
    setAiLoading(false);

    if (result.success) {
      setAiEvaluation(result.data || { status: result.status });
      return;
    }

    setAiError(result.error);
    setAiEvaluation((current) => current ? { ...current, status: 'failed' } : { status: 'failed' });
  };

  const useAiSuggestion = () => {
    if (!aiEvaluation || aiEvaluation.status !== 'completed') return;
    const suggestedRating = normalizeStarRating(aiEvaluation.suggested_score);
    if (suggestedRating) setScore(suggestedRating);
    if (aiEvaluation.feedback) setFeedback(aiEvaluation.feedback);
    const suggested = (aiEvaluation.criterion_scores || []).map((item) => toSf9RatingCode(item.levelCode));
    if (suggested.length === (activityRubric?.criteria || []).length && suggested.every(Boolean)) setCriterionRatings(suggested);
  };

  const handleSubmitReview = async () => {
    const rating = normalizeStarRating(score);

    if (!selectedSubmission || !rating) {
      alert('Please choose an overall rating');
      return;
    }
    if (activityRubric && (!criterionRatings.every((value) => Boolean(toSf9RatingCode(value))) || !teacherConfirmed)) {
      alert('Select a rating for every criterion and confirm that you reviewed the AI draft before submitting.');
      return;
    }

    setGrading(true);
    try {
      const userInfo = JSON.parse(sessionStorage.getItem('userInfo') || '{}');
      const rubricEvidence = buildTeacherRubricEvidence({
        rubric: activityRubric,
        submission: selectedSubmission,
        observerId: userInfo.id,
        criterionRatings,
        criterionNotes,
        observationDate,
        feedback,
        evidenceUrl,
        nextSteps,
        teacherConfirmed,
        aiEvaluation,
      });
      const result = await gradeSubmission(selectedSubmission.id, userInfo.id, {
        score: rating,
        feedback: feedback || '',
        status: 'reviewed'
      }, rubricEvidence);

      if (result.success) {
        reviewRequestIdRef.current += 1;
        setSubmissions(prev => prev.map(sub => 
          sub.id === selectedSubmission.id 
            ? { ...sub, score: rating, feedback, status: 'reviewed' }
            : sub
        ));
        setSelectedSubmission(null);
        setScore('');
        setFeedback('');
        await loadSubmissions();
      } else {
        alert('Failed to submit grade: ' + result.error);
      }
    } catch (error) {
      console.error('Error grading submission:', error);
      alert(error?.message || 'Failed to submit grade');
    } finally {
      setGrading(false);
    }
  };

  const handleCloseReview = () => {
    reviewRequestIdRef.current += 1;
    setSelectedSubmission(null);
    setActivityRubric(null);
    setRubricLoading(false);
    setAiEvaluation(null);
    setAiLoading(false);
    setAiError('');
    setCriterionRatings([]); setCriterionNotes([]); setEvidenceUrl(''); setNextSteps(''); setTeacherConfirmed(false);
    setScore('');
    setFeedback('');
  };

  return (
    <div className="page-container">
      <Navbar />
      <main className="page-content">
        <div className="reviews-header">
          <h1 className="page-title">Student Reviews</h1>
          <p className="reviews-subtitle">Review and grade student submissions</p>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6B5A4D' }}>
            Loading submissions...
          </div>
        ) : (
          <>
            {/* Search and Filter Section */}
            <div className="reviews-filter-panel">
          <label className="reviews-search-field">
            <span>Search submissions</span>
            <svg className="reviews-search-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4.2 4.2" />
            </svg>
            <input
              type="text"
              placeholder="Student name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="reviews-search-input"
            />
            {searchTerm && (
              <button
                type="button"
                className="reviews-clear-search"
                onClick={() => setSearchTerm('')}
                aria-label="Clear search"
              >
                <svg className="reviews-clear-svg" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m7 7 10 10M17 7 7 17" />
                </svg>
              </button>
            )}
          </label>

          <label className="reviews-activity-filter">
            <span>Activity</span>
            <select
              value={filterActivity}
              onChange={(e) => setFilterActivity(e.target.value)}
              className="reviews-activity-select"
            >
              {uniqueActivities.map(activity => (
                <option key={activity} value={activity}>
                  {activity === 'all' ? 'All Activities' : activity}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Filter Tabs */}
        <div className="review-filters">
          <button 
            className={`filter-tab ${filterStatus === 'all' ? 'active' : ''}`}
            onClick={() => setFilterStatus('all')}
          >
            All ({submissions.length})
          </button>
          <button 
            className={`filter-tab ${filterStatus === 'submitted' ? 'active' : ''}`}
            onClick={() => setFilterStatus('submitted')}
          >
            Submitted ({submissions.filter(s => s.status === 'submitted').length})
          </button>
          <button 
            className={`filter-tab ${filterStatus === 'late' ? 'active' : ''}`}
            onClick={() => setFilterStatus('late')}
          >
            Late ({submissions.filter(s => s.status === 'late').length})
          </button>
          <button 
            className={`filter-tab ${filterStatus === 'reviewed' ? 'active' : ''}`}
            onClick={() => setFilterStatus('reviewed')}
          >
            Reviewed ({submissions.filter(s => s.status === 'reviewed').length})
          </button>
        </div>

        {/* Submissions List */}
        <section className="submissions-list">
          {filteredSubmissions.length === 0 ? (
            <div className="no-submissions">
              <p>No submissions found for this filter</p>
            </div>
          ) : (
            filteredSubmissions.map((submission) => (
              <article key={submission.id} className="submission-card">
                <div className="submission-artwork">
                  {submission.artwork ? (
                    isImageArtwork(submission.artwork) ? (
                      <img
                        src={submission.artwork}
                        alt={`${submission.activityTitle} submission`}
                        className="artwork-preview-img"
                      />
                    ) : (
                      <div className="artwork-preview">{submission.artwork}</div>
                    )
                  ) : (
                    <div className="artwork-placeholder">No Submission</div>
                  )}
                </div>
                
                <div className="submission-details">
                  <div className="submission-header">
                    <div>
                      <h3 className="submission-student">{submission.studentName}</h3>
                    </div>
                    <span className={`status-badge ${getStatusBadge(submission.status).class}`}>
                      {getStatusBadge(submission.status).label}
                    </span>
                  </div>
                  
                  <h4 className="submission-activity">{submission.activityTitle}</h4>
                  
                  {submission.description && (
                    <p className="submission-description">{submission.description}</p>
                  )}
                  
                  <div className="submission-meta">
                    <div className="meta-item">
                      <span className="meta-label">Due Date:</span>
                      <span className="meta-value">{formatDateTime(submission.dueDate)}</span>
                    </div>
                    {submission.submittedDate && (
                      <div className="meta-item">
                        <span className="meta-label">Submitted:</span>
                        <span className="meta-value">{formatDateTime(submission.submittedDate)}</span>
                      </div>
                    )}
                    {hasStarRating(submission.score) && (
                      <div className="meta-item">
                        <span className="meta-label">Rating:</span>
                        <span className="meta-value score-display">{renderStars(submission.score, true)}</span>
                      </div>
                    )}
                  </div>
                  
                  {['submitted', 'late', 'reviewed'].includes(submission.status) && (
                    <div className="submission-actions">
                      <button
                        className="view-ar-btn"
                        onClick={() =>
                          navigate(`/activity/${submission.activityId}/start`, {
                            state: {
                              mode: 'view',
                              artworkUrl: submission.artwork,
                              paintState: submission.paintState || [],
                              sceneState: submission.sceneState || [],
                              puzzleState: submission.puzzleState || [],
                              modelState: submission.modelState || [],
                              groupState: submission.groupState || null,
                              allowedObjectIds: submission.allowedObjectIds || [],
                              modelUrl: submission.modelUrl || undefined,
                              modelFileType: submission.modelFileType || undefined,
                              modelConfigs: submission.modelConfigs || [],
                              puzzlePieces: submission.puzzlePieces || 0,
                            },
                          })
                        }
                        disabled={!submission.activityId}
                      >
                        View in AR
                      </button>
                      <button 
                        className="review-btn"
                        onClick={() => handleReview(submission)}
                      >
                        {hasStarRating(submission.score) ? 'Edit Rating' : 'Rate Student'}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            ))
          )}
        </section>

        {/* Review Modal */}
        {selectedSubmission && (
          <div className="review-modal-overlay" onClick={handleCloseReview}>
            <div className="review-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Review Submission</h2>
                <button className="close-btn" onClick={handleCloseReview}>✕</button>
              </div>
              
              <div className="modal-body">
                <div className="modal-student-info">
                  <h3>{selectedSubmission.studentName}</h3>
                  <p className="modal-activity">{selectedSubmission.activityTitle}</p>
                </div>
                
                <div className="modal-artwork-display">
                  {selectedSubmission.artwork && (
                    isImageArtwork(selectedSubmission.artwork) ? (
                      <img
                        src={selectedSubmission.artwork}
                        alt={`${selectedSubmission.activityTitle} submission`}
                        className="modal-artwork-image"
                      />
                    ) : (
                      <div className="modal-artwork">{selectedSubmission.artwork}</div>
                    )
                  )}
                  {selectedSubmission.description && (
                    <p className="modal-description">{selectedSubmission.description}</p>
                  )}
                </div>

                {rubricLoading && (
                  <section className="rubric-guidance">
                    <span>Loading rubric</span>
                    <p>Checking which teacher-created rubric belongs to this activity...</p>
                  </section>
                )}

                {!rubricLoading && !activityRubric && (
                  <section className="rubric-guidance rubric-guidance--missing">
                    <span>Rubric required</span>
                    <h3>No rubric is attached</h3>
                    <p>Attach a rubric to this activity before asking AI to suggest a score.</p>
                  </section>
                )}

                {activityRubric && (
                  <section className="rubric-guidance" aria-label="AI grading rubric">
                    <span>Teacher observation guide</span>
                    <h3>{activityRubric.title}</h3>
                    <p>The AR snapshot and saved activity state are compared with these levels. The teacher confirms any final feedback.</p>
                    <ul>{(activityRubric.criteria || []).map((criterion, index) => (
                      <li key={index}>
                        <strong>{criterion.name}</strong>
                        <ul>{(criterion.levels || [{ score: criterion.points, description: criterion.guideline }]).map((level, levelIndex) => <li key={levelIndex}>{rubricLevelLabel(level)}: {level.description}</li>)}</ul>
                      </li>
                    ))}</ul>
                  </section>
                )}

                {activityRubric && (
                  <section className="ai-evaluation" aria-label="AI rubric evaluation">
                    <div className="ai-evaluation__header">
                      <div>
                        <span className="ai-evaluation__eyebrow">AI rubric check</span>
                        <h3>Draft observation</h3>
                      </div>
                      {aiEvaluation?.status === 'completed' && !aiLoading && (
                        <span className="ai-status ai-status--completed">Ready</span>
                      )}
                      {aiLoading && <span className="ai-status ai-status--processing">Checking...</span>}
                    </div>

                    {aiLoading && (
                      <div className="ai-loading" role="status">
                        <span className="ai-loading__spinner" aria-hidden="true" />
                        AI is comparing the submitted snapshot with every rubric level. This may take a moment.
                      </div>
                    )}

                    {aiError && !aiLoading && (
                      <div className="ai-error" role="alert">
                        <strong>AI check unavailable</strong>
                        <p>{aiError}</p>
                      </div>
                    )}

                    {!aiLoading && aiEvaluation?.status === 'processing' && (
                      <div className="ai-loading" role="status">
                        The submission is already being checked. Reopen this review shortly to see the result.
                      </div>
                    )}

                    {!aiLoading && aiEvaluation?.status === 'completed' && (
                      <div className="ai-result">
                        <div className="ai-result__score">
                          <div><span>Suggested star rating (draft)</span>{hasStarRating(aiEvaluation.suggested_score)
                            ? <>{renderStars(aiEvaluation.suggested_score)}<small>{starRatingDescription(aiEvaluation.suggested_score)}</small></>
                            : <small className="ai-no-draft">Not enough visible evidence for a draft rating. Rate each criterion yourself.</small>}
                            <small className="ai-draft-rationale">{sf9DraftStarRationale((aiEvaluation.criterion_scores || []).map((item) => item.levelCode))}</small></div>
                          <strong>Teacher confirmation required</strong>
                        </div>

                        {aiEvaluation.summary && <p className="ai-result__summary">{aiEvaluation.summary}</p>}

                        {aiEvaluation.color_suggestion?.message && (
                          <div className="ai-color-suggestion">
                            <strong>Student color suggestion</strong>
                            <p>{aiEvaluation.color_suggestion.message}</p>
                            {Array.isArray(aiEvaluation.color_suggestion.colors) && aiEvaluation.color_suggestion.colors.length > 0 && (
                              <div>{aiEvaluation.color_suggestion.colors.map((color, index) => (
                                <span key={`${color?.name || 'color'}-${color?.hex || index}`}>
                                  <i style={{ backgroundColor: color?.hex }} aria-hidden="true" />
                                  {color?.name || color?.hex}
                                </span>
                              ))}</div>
                            )}
                            {aiEvaluation.color_suggestion.rationale && <small>{aiEvaluation.color_suggestion.rationale}</small>}
                          </div>
                        )}

                        <div className="ai-criteria">
                          {(aiEvaluation.criterion_scores || []).map((criterion, index) => (
                            <article className="ai-criterion" key={`${criterion.criterionName || 'criterion'}-${index}`}>
                              <div className="ai-criterion__heading">
                                <strong>{criterion.criterionName}</strong>
                                <span>{developmentalLevel(criterion)}</span>
                              </div>
                              <p>{criterion.evidence || criterion.levelDescription}</p>
                              <small>Confidence: {criterion.confidence || 'low'}</small>
                            </article>
                          ))}
                        </div>

                        {aiEvaluation.teacher_note && (
                          <p className="ai-teacher-note">
                            <strong>Teacher note:</strong> {aiEvaluation.teacher_note}
                          </p>
                        )}

                        <div className="ai-result__actions">
                          <button type="button" className="ai-use-btn" onClick={useAiSuggestion}>
                            Use rubric equivalent
                          </button>
                          <button type="button" className="ai-recheck-btn" onClick={() => handleAiCheck(true)}>
                            Recheck with AI
                          </button>
                        </div>
                        <p className="ai-disclaimer">This snapshot is one observation only. Do not use it alone to decide whether a learner is Consistent.</p>
                      </div>
                    )}

                    {!aiLoading && aiEvaluation?.status !== 'completed' && aiEvaluation?.status !== 'processing' && (
                      <button
                        type="button"
                        className="ai-run-btn"
                        onClick={() => handleAiCheck(Boolean(aiEvaluation))}
                        disabled={!isImageArtwork(selectedSubmission.artwork)}
                      >
                        {aiEvaluation ? 'Try AI check again' : 'Check with AI'}
                      </button>
                    )}
                  </section>
                )}

                {activityRubric && (
                  <section className="teacher-observation" aria-label="Teacher rubric observation">
                    <span>Teacher assessment</span>
                    <h3>Confirm each observed criterion</h3>
                    <p>AI suggestions are optional drafts. Choose CO (Consistent), DV (Developing), or BG (Beginning) for every criterion, or NO if you could not observe it and NA if it does not apply.</p>
                    {(activityRubric.criteria || []).map((criterion, index) => (
                      <article className="teacher-observation__criterion" key={`${criterion.name}-${index}`}>
                        <strong>{criterion.name}</strong>
                        <div className="criterion-rating-options" role="radiogroup" aria-label={`${criterion.name} rating`}>
                          {[...SF9_RATINGS.map((rating) => rating.code), 'NO', 'NA'].map((value) => <button type="button" key={value} title={sf9RatingLabel(value)} aria-label={sf9RatingLabel(value) || value} className={toSf9RatingCode(criterionRatings[index]) === value ? 'active' : ''} onClick={() => setCriterionRatings((items) => items.map((item, itemIndex) => itemIndex === index ? value : item))}>{value}</button>)}
                        </div>
                        <textarea value={criterionNotes[index] || ''} onChange={(event) => setCriterionNotes((items) => items.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder="Optional teacher note or visible evidence for this criterion" rows="2" />
                      </article>
                    ))}
                    <div className="observation-details">
                      <label>Observation date<input type="date" value={observationDate} onChange={(event) => setObservationDate(event.target.value)} /></label>
                      <label>Evidence link / snapshot reference<input type="url" value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="https://..." /></label>
                    </div>
                    <label>Next-step support<textarea value={nextSteps} onChange={(event) => setNextSteps(event.target.value)} placeholder="What support or follow-up will help this learner next?" rows="3" /></label>
                    <label className="teacher-confirmation"><input type="checkbox" checked={teacherConfirmed} onChange={(event) => setTeacherConfirmed(event.target.checked)} /> I reviewed every criterion and made the final teacher decision.</label>
                  </section>
                )}

                <div className="modal-form">
                  <div className="form-group">
                    <label>Overall teacher rating</label>
                    <div className="star-rating" role="radiogroup" aria-label="Student rating">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          className={`star-button ${normalizeStarRating(score) >= star ? 'active' : ''}`}
                          onClick={() => setScore(star)}
                          role="radio"
                          aria-checked={normalizeStarRating(score) === star}
                          aria-label={`${star} star${star === 1 ? '' : 's'}`}
                        >
                          ★
                        </button>
                      ))}
                      <span className="rating-hint">
                        {score ? starRatingLabel(score) : 'Choose an overall rating'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="feedback">Feedback (Optional)</label>
                    <textarea
                      id="feedback"
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="Write your feedback here..."
                      rows="5"
                    />
                  </div>
                </div>
              </div>
              
              <div className="modal-footer">
                <button
                  className="btn-cancel"
                  onClick={() =>
                    navigate(`/activity/${selectedSubmission.activityId}/start`, {
                      state: {
                        mode: 'view',
                        artworkUrl: selectedSubmission.artwork,
                        paintState: selectedSubmission.paintState || [],
                        sceneState: selectedSubmission.sceneState || [],
                        puzzleState: selectedSubmission.puzzleState || [],
                        modelState: selectedSubmission.modelState || [],
                        groupState: selectedSubmission.groupState || null,
                        allowedObjectIds: selectedSubmission.allowedObjectIds || [],
                        modelUrl: selectedSubmission.modelUrl || undefined,
                        modelFileType: selectedSubmission.modelFileType || undefined,
                        modelConfigs: selectedSubmission.modelConfigs || [],
                        puzzlePieces: selectedSubmission.puzzlePieces || 0,
                      },
                    })
                  }
                  disabled={!selectedSubmission.activityId || grading}
                >
                  View in AR
                </button>
                <button className="btn-cancel" onClick={handleCloseReview} disabled={grading}>
                  Cancel
                </button>
                <button 
                  className="btn-submit" 
                  onClick={handleSubmitReview}
                  disabled={!score || grading}
                >
                  {grading ? 'Submitting...' : 'Submit Review'}
                </button>
              </div>
            </div>
          </div>
        )}
          </>
        )}
      </main>
      <Navbar />
    </div>
  );
};

export default Reviews;
