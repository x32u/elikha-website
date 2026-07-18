import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import './Reviews.css';
import { getAllSubmissions, gradeSubmission } from '../../services/teacherApi';
import { parseArSubmissionDescription } from '../../utils/arSubmission';
import { parseActivityDescription } from '../../utils/activityArConfig';
import { hasStarRating, normalizeStarRating, starRatingLabel } from '../../utils/starRating';

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
    const matchesSearch = 
      sub.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.studentId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesActivity = filterActivity === 'all' || sub.activityTitle === filterActivity;
    
    return matchesStatus && matchesSearch && matchesActivity;
  });

  const handleReview = (submission) => {
    setSelectedSubmission(submission);
    setScore(normalizeStarRating(submission.score) || '');
    setFeedback(submission.feedback || '');
  };

  const handleSubmitReview = async () => {
    const rating = normalizeStarRating(score);

    if (!selectedSubmission || !rating) {
      alert('Please choose a star rating');
      return;
    }

    setGrading(true);
    try {
      const userInfo = JSON.parse(sessionStorage.getItem('userInfo') || '{}');
      const result = await gradeSubmission(selectedSubmission.id, userInfo.id, {
        score: rating,
        feedback: feedback || '',
        status: 'reviewed'
      });

      if (result.success) {
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
      alert('Failed to submit grade');
    } finally {
      setGrading(false);
    }
  };

  const handleCloseReview = () => {
    setSelectedSubmission(null);
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
            <div className="search-filter-section">
          <div className="search-container">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search by student name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            {searchTerm && (
              <button
                className="clear-search-btn"
                onClick={() => setSearchTerm('')}
              >
                ✕
              </button>
            )}
          </div>

          <div className="filter-activity">
            <label>Activity:</label>
            <select
              value={filterActivity}
              onChange={(e) => setFilterActivity(e.target.value)}
              className="activity-select"
            >
              {uniqueActivities.map(activity => (
                <option key={activity} value={activity}>
                  {activity === 'all' ? 'All Activities' : activity}
                </option>
              ))}
            </select>
          </div>
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
                      <p className="submission-id">{submission.studentId}</p>
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
                
                <div className="modal-form">
                  <div className="form-group">
                    <label>Rating</label>
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
                        {score ? starRatingLabel(score) : 'Choose 1-5 stars'}
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
