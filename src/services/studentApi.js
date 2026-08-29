import { supabase } from '../lib/supabase';
import { starRatingLabel } from '../utils/starRating';
import { parseArSubmissionDescription } from '../utils/arSubmission';
import { parseActivityDescription } from '../utils/activityArConfig';

const REVIEWED_SUBMISSION_STATUSES = new Set(['reviewed', 'graded', 'completed']);
const SUBMITTED_SUBMISSION_STATUSES = new Set(['submitted', 'reviewed', 'graded', 'completed', 'late']);
const PENDING_ASSIGNMENT_STATUSES = new Set(['assigned', 'pending', 'in_progress']);

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

const isReviewedSubmission = ({ submissionStatus = '', reviewedAt = null } = {}) =>
  Boolean(reviewedAt) || REVIEWED_SUBMISSION_STATUSES.has(normalizeStatus(submissionStatus));

const isSubmittedSubmission = ({ submissionStatus = '', submittedAt = null } = {}) =>
  Boolean(submittedAt) || SUBMITTED_SUBMISSION_STATUSES.has(normalizeStatus(submissionStatus));

const isDueDateOverdue = (dueDate) => {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);

  return due < today;
};

const resolveStudentActivityState = ({
  assignmentStatus = '',
  submissionStatus = '',
  submittedAt = null,
  reviewedAt = null,
  dueDate = null,
} = {}) => {
  const normalizedAssignment = normalizeStatus(assignmentStatus);
  const reviewed = isReviewedSubmission({ submissionStatus, reviewedAt });
  const submitted = isSubmittedSubmission({ submissionStatus, submittedAt }) || reviewed;

  if (reviewed) {
    return { status: 'reviewed', isSubmitted: true, isReviewed: true, isOverdue: false };
  }

  if (submitted) {
    return { status: 'submitted', isSubmitted: true, isReviewed: false, isOverdue: false };
  }

  const overdue = isDueDateOverdue(dueDate);

  if (overdue) {
    return { status: 'overdue', isSubmitted: false, isReviewed: false, isOverdue: true };
  }

  if (PENDING_ASSIGNMENT_STATUSES.has(normalizedAssignment)) {
    return { status: 'assigned', isSubmitted: false, isReviewed: false, isOverdue: false };
  }

  return { status: 'assigned', isSubmitted: false, isReviewed: false, isOverdue: false };
};

const cleanText = (value) => typeof value === 'string' ? value.trim() : '';

const normalizeRubricLevels = (levels) => Array.isArray(levels)
  ? levels.map((level) => ({
    code: cleanText(level?.code).toUpperCase(),
    label: cleanText(level?.label),
    description: cleanText(level?.description),
  })).filter((level) => level.code || level.label || level.description)
  : [];

const normalizeStudentRubric = (rubric) => {
  if (!rubric || typeof rubric !== 'object') return null;

  return {
    id: rubric.id || null,
    title: cleanText(rubric.title),
    description: cleanText(rubric.description),
    criteria: Array.isArray(rubric.criteria)
      ? rubric.criteria.map((criterion) => ({
        name: cleanText(criterion?.name),
        levels: normalizeRubricLevels(criterion?.levels),
      })).filter((criterion) => criterion.name || criterion.levels.length > 0)
      : [],
    metadata: rubric.metadata && typeof rubric.metadata === 'object' ? rubric.metadata : {},
    assignedVersion: rubric.assignedVersion ?? null,
  };
};

const normalizeApprovedColorSuggestion = (suggestion) => {
  if (!suggestion || typeof suggestion !== 'object') return null;

  const normalized = {
    message: cleanText(suggestion.message),
    rationale: cleanText(suggestion.rationale),
    colors: Array.isArray(suggestion.colors)
      ? suggestion.colors.map((color) => ({
        name: cleanText(color?.name),
        hex: cleanText(color?.hex),
      })).filter((color) => color.name || color.hex)
      : [],
  };

  return normalized.message || normalized.rationale || normalized.colors.length > 0
    ? normalized
    : null;
};

const normalizeFinalRubricCriteria = (criteria) => Array.isArray(criteria)
  ? criteria.map((criterion) => ({
    criterion_index: Number.isInteger(Number(criterion?.criterion_index))
      ? Number(criterion.criterion_index)
      : null,
    criterion_title_snapshot: cleanText(criterion?.criterion_title_snapshot),
    beginning_descriptor_snapshot: cleanText(criterion?.beginning_descriptor_snapshot),
    developing_descriptor_snapshot: cleanText(criterion?.developing_descriptor_snapshot),
    consistent_descriptor_snapshot: cleanText(criterion?.consistent_descriptor_snapshot),
    selected_rating: cleanText(criterion?.selected_rating).toUpperCase(),
    teacher_note: cleanText(criterion?.teacher_note),
  })).filter((criterion) => criterion.criterion_title_snapshot || criterion.selected_rating)
  : [];

const normalizeFinalStudentReview = (review) => {
  if (!review || typeof review !== 'object') return null;

  const reviewedAt = cleanText(review.reviewed_at);
  const confirmedAt = cleanText(review.teacher_confirmed_at);
  if (!reviewedAt) return null;
  const hasConfirmedObservation = Boolean(confirmedAt);

  // Only allow teacher-finalized fields through to the learner. In particular,
  // raw AI scores, summaries, and criterion drafts are intentionally omitted.
  // Legacy reviews can still show their final score/feedback; rubric evidence
  // and approved suggestions require a teacher-confirmed observation.
  return {
    score: review.score ?? null,
    feedback: cleanText(review.feedback),
    reviewed_at: reviewedAt,
    observation_date: hasConfirmedObservation ? cleanText(review.observation_date) : '',
    overall_comment: hasConfirmedObservation ? cleanText(review.overall_comment) : '',
    evidence_url: hasConfirmedObservation ? cleanText(review.evidence_url) : '',
    next_steps: hasConfirmedObservation ? cleanText(review.next_steps) : '',
    teacher_confirmed_at: confirmedAt,
    criteria: hasConfirmedObservation ? normalizeFinalRubricCriteria(review.criteria) : [],
    approved_color_suggestion: hasConfirmedObservation
      ? normalizeApprovedColorSuggestion(review.approved_color_suggestion)
      : null,
  };
};

const normalizeStudentActivityAssessment = (assessment) => ({
  rubric: normalizeStudentRubric(assessment?.rubric),
  final_review: normalizeFinalStudentReview(assessment?.final_review),
});

// ==================== STUDENT PROFILE ====================

export const getStudentProfile = async (studentId) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', studentId)
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error fetching student profile:', error);
    return { success: false, error: error.message };
  }
};

// ==================== STUDENT CLASSES ====================

export const getStudentClasses = async (studentId) => {
  try {
    const { data: enrollments, error: enrollmentError } = await supabase
      .from('class_students')
      .select('class_id, enrolled_at')
      .eq('student_id', studentId)
      .order('enrolled_at', { ascending: false });

    if (enrollmentError) throw enrollmentError;

    const classIds = [...new Set((enrollments || []).map(({ class_id: classId }) => classId).filter(Boolean))];
    if (classIds.length === 0) return { success: true, data: [] };

    const { data: classRows, error: classError } = await supabase
      .from('classes')
      .select('id, name, grade, section, subject, color, teacher_id, is_active')
      .in('id', classIds)
      .eq('is_active', true);

    if (classError) throw classError;

    const classesById = new Map((classRows || []).map((classInfo) => [classInfo.id, classInfo]));
    const classes = (enrollments || []).flatMap((enrollment) => {
      const classInfo = classesById.get(enrollment.class_id);
      return classInfo ? [{ ...classInfo, enrolled_at: enrollment.enrolled_at }] : [];
    });
    
    return { success: true, data: classes };
  } catch (error) {
    console.error('Error fetching student classes:', error);
    return { success: false, error: error.message };
  }
};

// ==================== STUDENT ACTIVITIES ====================

export const getStudentActivities = async (studentId) => {
  try {
    // Get all assignments for this student
    const { data: assignments, error: assignError } = await supabase
      .from('activity_assignments')
      .select(`
        id,
        activity_id,
        status,
        assigned_at,
        activity:activities (
          id,
          title,
          description,
          due_date,
          status,
          image_url,
          class_id,
          grade,
          subject
        )
      `)
      .eq('student_id', studentId);

    if (assignError) throw assignError;

    const { data: enrollments, error: enrollmentError } = await supabase
      .from('class_students')
      .select('class_id')
      .eq('student_id', studentId);

    if (enrollmentError) {
      console.warn('Unable to fetch student class enrollments for activity fallback:', enrollmentError);
    }

    const enrolledClassIds = enrollmentError
      ? []
      : [...new Set((enrollments || []).map((enrollment) => enrollment.class_id).filter(Boolean))];
    let classIds = [];
    let classActivities = [];

    if (enrolledClassIds.length > 0) {
      const { data: activeClasses, error: classError } = await supabase
        .from('classes')
        .select('id')
        .in('id', enrolledClassIds)
        .eq('is_active', true);

      if (classError) {
        console.warn('Unable to confirm active classes for student activity fallback:', classError);
      } else {
        classIds = (activeClasses || []).map((classInfo) => classInfo.id).filter(Boolean);
      }
    }

    if (classIds.length > 0) {
      const { data, error } = await supabase
        .from('activities')
        .select('id, title, description, due_date, status, image_url, class_id, grade, subject')
        .in('class_id', classIds)
        .eq('status', 'active')
        .order('due_date', { ascending: true });

      if (error) {
        console.warn('Unable to fetch class activities for student activity fallback:', error);
      } else {
        classActivities = data || [];
      }
    }

    // Get submissions to mark which are completed
    const { data: submissions, error: subError } = await supabase
      .from('submissions')
      .select('activity_id, status, submitted_at, reviewed_at, artwork_url, description, score, feedback')
      .eq('student_id', studentId);

    if (subError) throw subError;

    const submissionMap = new Map();
    (submissions || []).forEach(sub => {
      submissionMap.set(sub.activity_id, sub);
    });

    const assignmentMap = new Map();
    (assignments || []).forEach((assignment) => {
      if (assignment.activity?.id) {
        assignmentMap.set(assignment.activity.id, assignment);
      }
    });

    const activityRows = [
      ...(assignments || []),
      ...classActivities
        .filter((activity) => activity?.id && !assignmentMap.has(activity.id))
        .map((activity) => ({
          id: null,
          activity_id: activity.id,
          status: 'assigned',
          assigned_at: null,
          activity,
        })),
    ]
      .filter((row) => row.activity?.id)
      .sort((a, b) => {
        const aDue = a.activity?.due_date ? new Date(a.activity.due_date).getTime() : Number.MAX_SAFE_INTEGER;
        const bDue = b.activity?.due_date ? new Date(b.activity.due_date).getTime() : Number.MAX_SAFE_INTEGER;
        if (aDue !== bDue) return aDue - bDue;
        return String(a.activity?.title || '').localeCompare(String(b.activity?.title || ''));
      });

    // Combine and categorize
    const activities = activityRows.map(a => {
      const submission = submissionMap.get(a.activity_id);
      const parsedArSubmission = parseArSubmissionDescription(submission?.description);
      const parsedActivity = parseActivityDescription(a.activity?.description);
      const state = resolveStudentActivityState({
        assignmentStatus: a.status,
        submissionStatus: submission?.status,
        submittedAt: submission?.submitted_at,
        reviewedAt: submission?.reviewed_at,
        dueDate: a.activity?.due_date,
      });

      return {
        id: a.activity?.id,
        assignment_id: a.id,
        title: a.activity?.title || 'Untitled',
        description: parsedActivity.summary || '',
        ar_instructions: parsedActivity.instructions || '',
        due_date: a.activity?.due_date,
        image_url: submission?.artwork_url || a.activity?.image_url,
        paint_state: parsedArSubmission?.paintState || [],
        scene_state: parsedArSubmission?.sceneState || [],
        puzzle_state: parsedArSubmission?.puzzleState || [],
        model_state: parsedArSubmission?.modelState || [],
        group_state: parsedArSubmission?.groupState || null,
        allowed_object_ids: parsedActivity.allowedObjectIds || [],
        model_id: parsedActivity.modelId || null,
        model_url: parsedActivity.modelUrl || null,
        model_file_type: parsedActivity.modelFileType || null,
        model_configs: parsedActivity.models || [],
        puzzle_pieces: parsedActivity.puzzlePieces || 0,
        submission_description: parsedArSubmission?.summary || submission?.description || '',
        grade: a.activity?.grade,
        subject: a.activity?.subject,
        status: state.status,
        assignment_status: normalizeStatus(a.status),
        submission_status: normalizeStatus(submission?.status),
        submitted_at: submission?.submitted_at,
        reviewed_at: submission?.reviewed_at || null,
        score: submission?.score ?? null,
        feedback: submission?.feedback || '',
        is_submitted: state.isSubmitted,
        is_reviewed: state.isReviewed,
        is_overdue: state.isOverdue,
      };
    });

    return { success: true, data: activities };
  } catch (error) {
    console.error('Error fetching student activities:', error);
    return { success: false, error: error.message };
  }
};

export const getStudentPendingActivities = async (studentId) => {
  const result = await getStudentActivities(studentId);
  if (!result.success) return result;
  
  const pending = result.data.filter((a) => ['assigned', 'overdue'].includes(a.status));
  return { success: true, data: pending };
};

export const getStudentCompletedActivities = async (studentId) => {
  const result = await getStudentActivities(studentId);
  if (!result.success) return result;
  
  const completed = result.data.filter((a) => ['submitted', 'reviewed'].includes(a.status));
  return { success: true, data: completed };
};

// ==================== ACTIVITY DETAILS ====================

export const getActivityDetails = async (activityId, studentId) => {
  try {
    const { data: activity, error: actError } = await supabase
      .from('activities')
      .select('*')
      .eq('id', activityId)
      .single();

    if (actError) throw actError;

    // Get student's assignment status
    const { data: assignment } = await supabase
      .from('activity_assignments')
      .select('*')
      .eq('activity_id', activityId)
      .eq('student_id', studentId)
      .single();

    // Get student's submission if any
    const { data: submission } = await supabase
      .from('submissions')
      .select('*')
      .eq('activity_id', activityId)
      .eq('student_id', studentId)
      .single();

    const parsedActivity = parseActivityDescription(activity?.description);
    const parsedSubmission = parseArSubmissionDescription(submission?.description);
    const state = resolveStudentActivityState({
      assignmentStatus: assignment?.status,
      submissionStatus: submission?.status,
      submittedAt: submission?.submitted_at,
      reviewedAt: submission?.reviewed_at,
      dueDate: activity?.due_date,
    });

    return {
      success: true,
      data: {
        ...activity,
        description: parsedActivity.summary || '',
        ar_instructions: parsedActivity.instructions || '',
        allowed_object_ids: parsedActivity.allowedObjectIds || [],
        model_id: parsedActivity.modelId || null,
        model_url: parsedActivity.modelUrl || null,
        model_file_type: parsedActivity.modelFileType || null,
        model_configs: parsedActivity.models || [],
        puzzle_pieces: parsedActivity.puzzlePieces || 0,
        paint_state: parsedSubmission?.paintState || [],
        scene_state: parsedSubmission?.sceneState || [],
        puzzle_state: parsedSubmission?.puzzleState || [],
        model_state: parsedSubmission?.modelState || [],
        group_state: parsedSubmission?.groupState || null,
        assignment,
        submission,
        student_status: state.status,
        is_submitted: state.isSubmitted,
        is_reviewed: state.isReviewed,
        is_overdue: state.isOverdue,
      }
    };
  } catch (error) {
    console.error('Error fetching activity details:', error);
    return { success: false, error: error.message };
  }
};

export const getStudentActivityAssessment = async (activityId) => {
  if (!activityId) {
    return { success: false, error: 'Activity information is required.' };
  }

  try {
    const { data, error } = await supabase.rpc('get_student_activity_assessment', {
      p_activity_id: activityId,
    });

    if (error) throw error;
    return { success: true, data: normalizeStudentActivityAssessment(data) };
  } catch (error) {
    console.error('Error fetching student activity rubric and review:', error);
    return {
      success: false,
      error: error?.message || 'Rubric and review details are unavailable right now.',
    };
  }
};

// ==================== SUBMISSIONS ====================

export const submitActivity = async (studentId, activityId, submissionData) => {
  try {
    const { data, error } = await supabase.rpc('submit_assigned_activity', {
      p_student_id: studentId,
      p_activity_id: activityId,
      p_artwork_url: submissionData.artwork_url || null,
      p_description: submissionData.description || null,
      p_artwork_title: `AR Submission ${new Date().toLocaleDateString()}`,
    });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error submitting activity:', error);
    return { success: false, error: error.message };
  }
};

// ==================== ARTWORKS ====================

export const getStudentArtworks = async (studentId) => {
  try {
    const { data: artworks, error } = await supabase
      .from('artworks')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const items = artworks || [];
    const submissionIds = items
      .map((artwork) => artwork.submission_id)
      .filter(Boolean);

    let submissionMap = new Map();
    if (submissionIds.length > 0) {
      const { data: submissions, error: submissionError } = await supabase
        .from('submissions')
        .select(`
          id,
          activity_id,
          description,
          artwork_url,
          activity:activities (
            id,
            title,
            description
          )
        `)
        .in('id', submissionIds);

      if (submissionError) throw submissionError;

      submissionMap = new Map(
        (submissions || []).map((submission) => [submission.id, submission])
      );
    }

    const enriched = items.map((artwork) => {
      const submission = submissionMap.get(artwork.submission_id) || null;
      const parsed = parseArSubmissionDescription(submission?.description);
      const parsedActivity = parseActivityDescription(submission?.activity?.description);

      return {
        ...artwork,
        activity_id: submission?.activity_id || null,
        activity_title: submission?.activity?.title || null,
        paint_state: parsed?.paintState || [],
        scene_state: parsed?.sceneState || [],
        puzzle_state: parsed?.puzzleState || [],
        model_state: parsed?.modelState || [],
        group_state: parsed?.groupState || null,
        allowed_object_ids: parsedActivity.allowedObjectIds || [],
        ar_instructions: parsedActivity.instructions || '',
        model_url: parsedActivity.modelUrl || null,
        model_file_type: parsedActivity.modelFileType || null,
        model_configs: parsedActivity.models || [],
        puzzle_pieces: parsedActivity.puzzlePieces || 0,
        image_url: artwork.image_url || submission?.artwork_url || null,
      };
    });

    return { success: true, data: enriched };
  } catch (error) {
    console.error('Error fetching student artworks:', error);
    return { success: false, error: error.message };
  }
};

export const saveArtwork = async (studentId, artworkData) => {
  try {
    const { data, error } = await supabase
      .from('artworks')
      .insert([{
        student_id: studentId,
        title: artworkData.title,
        description: artworkData.description,
        image_url: artworkData.image_url,
        submission_id: artworkData.submission_id || null
      }])
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error saving artwork:', error);
    return { success: false, error: error.message };
  }
};

export const reportGestureAlert = async ({
  studentId,
  activityId,
  gestureType = 'middle_finger',
  metadata = {},
}) => {
  try {
    if (!studentId || !activityId) {
      return { success: false, error: 'Missing student or activity for gesture alert.' };
    }

    const { data, error } = await supabase.rpc('log_gesture_alert', {
      p_student_id: studentId,
      p_activity_id: activityId,
      p_gesture_type: gestureType,
      p_metadata: metadata || {},
    });

    if (error) throw error;

    return {
      success: true,
      data: {
        id: data || null,
      },
    };
  } catch (error) {
    console.error('Error reporting gesture alert:', error);
    return { success: false, error: error.message };
  }
};

export const reportActivityLockAlert = async ({ studentId, activityId, eventType, metadata = {} }) => {
  try {
    if (!studentId || !activityId || !eventType) {
      return { success: false, error: 'Missing activity lock alert details.' };
    }
    const { error } = await supabase.from('activity_lock_alerts').insert([{
      student_id: studentId,
      activity_id: activityId,
      event_type: eventType,
      metadata,
    }]);
    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error reporting activity lock alert:', error);
    return {
      success: false,
      error: error.message || 'Unable to report the activity lock event.',
    };
  }
};

// ==================== DASHBOARD STATS ====================

export const getStudentDashboardStats = async (studentId) => {
  try {
    const activitiesResult = await getStudentActivities(studentId);
    if (!activitiesResult.success) throw new Error(activitiesResult.error);

    const activities = activitiesResult.data;
    const pending = activities.filter((a) => ['assigned', 'overdue'].includes(a.status));
    const completed = activities.filter((a) => ['submitted', 'reviewed'].includes(a.status));
    const overdue = activities.filter((a) => a.status === 'overdue');

    const { count: artworkCount } = await supabase
      .from('artworks')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', studentId);

    return {
      success: true,
      data: {
        totalActivities: activities.length,
        pendingCount: pending.length,
        completedCount: completed.length,
        overdueCount: overdue.length,
        artworkCount: artworkCount || 0,
        completionRate: activities.length > 0 
          ? Math.round((completed.length / activities.length) * 100) 
          : 0
      }
    };
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return { success: false, error: error.message };
  }
};

// ==================== NOTIFICATIONS ====================

export const getStudentNotifications = async (studentId) => {
  try {
    // Get recent activities assigned
    const { data: recentAssignments } = await supabase
      .from('activity_assignments')
      .select(`
        id,
        assigned_at,
        activity:activities (title)
      `)
      .eq('student_id', studentId)
      .order('assigned_at', { ascending: false })
      .limit(10);

    // Get reviewed submissions
    const { data: reviewedSubmissions } = await supabase
      .from('submissions')
      .select(`
        id,
        reviewed_at,
        score,
        feedback,
        activity:activities (title)
      `)
      .eq('student_id', studentId)
      .not('reviewed_at', 'is', null)
      .order('reviewed_at', { ascending: false })
      .limit(10);

    const notifications = [
      ...(recentAssignments || []).map(a => ({
        id: `assign-${a.id}`,
        type: 'assignment',
        title: 'New Activity Assigned',
        message: `You have been assigned: ${a.activity?.title}`,
        timestamp: a.assigned_at,
        read: false
      })),
      ...(reviewedSubmissions || []).map(s => ({
        id: `review-${s.id}`,
        type: 'review',
        title: 'Submission Reviewed',
        message: `Your submission for "${s.activity?.title}" has been reviewed. Rating: ${starRatingLabel(s.score)}`,
        timestamp: s.reviewed_at,
        read: false
      }))
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return { success: true, data: notifications };
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return { success: false, error: error.message };
  }
};
