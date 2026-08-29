import { normalizeStarRating } from './starRating';

export const REPORT_TIME_ZONE = 'Asia/Manila';

const MANILA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const REVIEWED_STATUSES = new Set(['reviewed', 'graded', 'completed']);
const SUBMITTED_STATUSES = new Set(['submitted', 'late', 'reviewed', 'graded', 'completed']);
const FORMULA_PREFIX_PATTERN = /^[\t\r\n ]*[=+\-@]/;

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

const parseDateMs = (value) => {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }

  // Internal helpers pass parsed epoch milliseconds back through this parser.
  // Keep those values numeric: stringifying an epoch (for example,
  // "1786579200000") produces an invalid JavaScript date.
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  // Existing Supabase event columns are timestamp without time zone, but the
  // app writes ISO UTC values. PostgREST returns them without a suffix, so add
  // Z to prevent the browser from reinterpreting the same row in device time.
  const normalized = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(text)
    ? `${text.replace(' ', 'T')}Z`
    : text;
  const time = new Date(normalized).getTime();
  return Number.isFinite(time) ? time : null;
};

const requireDateMs = (value, label) => {
  const time = parseDateMs(value);
  if (time === null) throw new TypeError(`${label} must be a valid date.`);
  return time;
};

const toManilaDayStartMs = (value) => {
  const time = requireDateMs(value, 'Date');
  const shifted = new Date(time + MANILA_UTC_OFFSET_MS);
  return Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate()
  ) - MANILA_UTC_OFFSET_MS;
};

const parseDateOnlyToManilaStartMs = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return null;
  }

  return Date.UTC(year, month - 1, day) - MANILA_UTC_OFFSET_MS;
};

const getDueEndExclusiveMs = (dueDate) => {
  if (!dueDate) return null;
  const dateOnlyStart = parseDateOnlyToManilaStartMs(dueDate);
  if (dateOnlyStart !== null) return dateOnlyStart + DAY_MS;

  const dueTime = parseDateMs(dueDate);
  if (dueTime === null) return null;

  // Activity forms collect a calendar date. Supabase may return that value as a
  // timestamp, so reports consistently treat the Manila calendar day as due.
  return toManilaDayStartMs(dueTime) + DAY_MS;
};

const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const rate = (numerator, denominator) => (
  denominator > 0 ? round((numerator / denominator) * 100, 1) : null
);

const pairKey = (activityId, studentId) => `${String(activityId || '')}::${String(studentId || '')}`;

const isInRange = (value, range) => {
  const time = parseDateMs(value);
  if (time === null) return false;
  return time >= range.startMs && time < range.endExclusiveMs;
};

const chooseLatest = (left, right, dateFields) => {
  const getLatestTime = (row) => {
    for (const field of dateFields) {
      const time = parseDateMs(row?.[field]);
      if (time !== null) return time;
    }
    return Number.NEGATIVE_INFINITY;
  };

  const leftTime = getLatestTime(left);
  const rightTime = getLatestTime(right);
  if (rightTime !== leftTime) return rightTime > leftTime ? right : left;
  return String(right?.id || '').localeCompare(String(left?.id || '')) >= 0 ? right : left;
};

const normalizeRange = ({ range, days = 30, asOf }) => {
  if (range) {
    const startMs = requireDateMs(range.start ?? range.startIso, 'Range start');
    const endExclusiveMs = requireDateMs(
      range.endExclusive ?? range.endExclusiveIso ?? range.end,
      'Range end'
    );
    if (endExclusiveMs <= startMs) {
      throw new RangeError('Range end must be after range start.');
    }
    return {
      timeZone: REPORT_TIME_ZONE,
      startMs,
      endExclusiveMs,
      startIso: new Date(startMs).toISOString(),
      endExclusiveIso: new Date(endExclusiveMs).toISOString(),
    };
  }

  return createReportDateRange(days, asOf);
};

/** Returns the last N Manila calendar days as a start-inclusive/end-exclusive range. */
export const createReportDateRange = (days = 30, asOf = new Date()) => {
  const safeDays = Math.max(1, Math.floor(Number(days) || 1));
  const currentDayStartMs = toManilaDayStartMs(asOf);
  const startMs = currentDayStartMs - (safeDays - 1) * DAY_MS;
  const endExclusiveMs = currentDayStartMs + DAY_MS;

  return {
    timeZone: REPORT_TIME_ZONE,
    days: safeDays,
    startMs,
    endExclusiveMs,
    startIso: new Date(startMs).toISOString(),
    endExclusiveIso: new Date(endExclusiveMs).toISOString(),
  };
};

/**
 * Classifies one assignment using its canonical submission, if one exists.
 * Late/on-time is an orthogonal flag; `outcome` remains mutually exclusive.
 */
export const classifyAssignmentOutcome = ({
  assignment = {},
  activity = {},
  submission = null,
  asOf = new Date(),
} = {}) => {
  const asOfMs = requireDateMs(asOf, 'asOf');
  const submissionStatus = normalizeStatus(submission?.status);
  const assignmentStatus = normalizeStatus(assignment?.status);
  const submittedAtMs = parseDateMs(submission?.submitted_at);
  const reviewedAtMs = parseDateMs(submission?.reviewed_at);
  const dueEndExclusiveMs = getDueEndExclusiveMs(activity?.due_date ?? assignment?.due_date);
  const hasSubmission = Boolean(submission);
  const isReviewed = hasSubmission && (
    reviewedAtMs !== null || REVIEWED_STATUSES.has(submissionStatus)
  );
  const isSubmitted = hasSubmission && (
    submittedAtMs !== null || SUBMITTED_STATUSES.has(submissionStatus) || isReviewed || hasSubmission
  );
  const normalizedScore = normalizeStarRating(submission?.score);
  const isGraded = isReviewed && normalizedScore > 0;
  const isPendingReview = isSubmitted && !isReviewed;
  const isMissing = !isSubmitted && dueEndExclusiveMs !== null && asOfMs >= dueEndExclusiveMs;
  const isPending = !isSubmitted && !isMissing;
  const isLate = isSubmitted && (
    submissionStatus === 'late' || (
      submittedAtMs !== null &&
      dueEndExclusiveMs !== null &&
      submittedAtMs >= dueEndExclusiveMs
    )
  );
  const isOnTime = isSubmitted && submittedAtMs !== null && dueEndExclusiveMs !== null && !isLate;

  let outcome = 'pending';
  if (isGraded) outcome = 'graded';
  else if (isReviewed) outcome = 'reviewed_unscored';
  else if (isPendingReview) outcome = 'pending_review';
  else if (isMissing) outcome = 'missing';

  return {
    outcome,
    assignmentStatus,
    submissionStatus,
    isSubmitted,
    isReviewed,
    isGraded,
    isPendingReview,
    isMissing,
    isPending,
    isLate,
    isOnTime,
    normalizedScore: isGraded ? normalizedScore : null,
    dueEndExclusiveIso: dueEndExclusiveMs === null
      ? null
      : new Date(dueEndExclusiveMs).toISOString(),
  };
};

const summarizeOutcomes = (outcomes) => {
  const assigned = outcomes.length;
  const submitted = outcomes.filter((row) => row.isSubmitted).length;
  const reviewed = outcomes.filter((row) => row.isReviewed).length;
  const graded = outcomes.filter((row) => row.isGraded).length;
  const reviewedUnscored = outcomes.filter((row) => row.outcome === 'reviewed_unscored').length;
  const pendingReview = outcomes.filter((row) => row.isPendingReview).length;
  const missing = outcomes.filter((row) => row.isMissing).length;
  const pending = outcomes.filter((row) => row.isPending).length;
  const lateSubmissions = outcomes.filter((row) => row.isLate).length;
  const submissionsWithDueDate = outcomes.filter((row) => (
    row.isSubmitted && row.submittedAtMs !== null && row.dueEndExclusiveIso
  )).length;
  const onTimeSubmissions = outcomes.filter((row) => row.isOnTime).length;
  const scores = outcomes
    .map((row) => row.normalizedScore)
    .filter((score) => typeof score === 'number' && score > 0);
  const turnaroundHours = outcomes
    .map((row) => {
      if (row.submittedAtMs === null || row.reviewedAtMs === null) return null;
      const duration = row.reviewedAtMs - row.submittedAtMs;
      return duration >= 0 ? duration / (60 * 60 * 1000) : null;
    })
    .filter((duration) => duration !== null);

  return {
    assigned,
    submitted,
    reviewed,
    graded,
    reviewedUnscored,
    pendingReview,
    missing,
    pending,
    lateSubmissions,
    onTimeSubmissions,
    submissionsWithDueDate,
    completionRate: rate(submitted, assigned),
    reviewRate: rate(reviewed, submitted),
    gradingRate: rate(graded, submitted),
    missingRate: rate(missing, assigned),
    pendingRate: rate(pending, assigned),
    onTimeRate: rate(onTimeSubmissions, submissionsWithDueDate),
    averageScore: scores.length
      ? round(scores.reduce((sum, score) => sum + score, 0) / scores.length, 2)
      : null,
    averageReviewTurnaroundHours: turnaroundHours.length
      ? round(turnaroundHours.reduce((sum, duration) => sum + duration, 0) / turnaroundHours.length, 1)
      : null,
  };
};

/**
 * Builds a report from database-shaped rows. Assignment outcomes use the full
 * scoped cohort; `events` alone applies the selected date range.
 */
export const aggregateAnalyticsReport = ({
  activities = [],
  assignments = [],
  submissions = [],
  users = [],
  classes = [],
} = {}, {
  asOf = new Date(),
  days = 30,
  range = null,
  teacherId = null,
  classId = null,
} = {}) => {
  const asOfMs = requireDateMs(asOf, 'asOf');
  const normalizedRange = normalizeRange({ range, days, asOf });
  const classMap = new Map((classes || []).filter((row) => row?.id).map((row) => [row.id, row]));
  const userMap = new Map((users || []).filter((row) => row?.id).map((row) => [row.id, row]));
  const scopedActivities = (activities || []).filter((activity) => (
    activity?.id &&
    (!teacherId || activity.teacher_id === teacherId) &&
    (!classId || activity.class_id === classId)
  ));
  const activityMap = new Map(scopedActivities.map((activity) => [activity.id, activity]));

  const assignmentMap = new Map();
  let duplicateAssignments = 0;
  let assignmentsMissingActivity = 0;
  (assignments || []).forEach((assignment) => {
    if (!assignment?.activity_id || !assignment?.student_id) return;
    if (!activityMap.has(assignment.activity_id)) {
      if (!(teacherId || classId) || !(activities || []).some((row) => row?.id === assignment.activity_id)) {
        assignmentsMissingActivity += 1;
      }
      return;
    }
    const assignedAtMs = parseDateMs(assignment.assigned_at);
    if (assignedAtMs !== null && assignedAtMs > asOfMs) return;
    const key = pairKey(assignment.activity_id, assignment.student_id);
    const current = assignmentMap.get(key);
    if (current) {
      duplicateAssignments += 1;
      assignmentMap.set(key, chooseLatest(current, assignment, ['assigned_at', 'created_at']));
    } else {
      assignmentMap.set(key, assignment);
    }
  });

  const scopedSubmissions = (submissions || []).filter((submission) => (
    submission?.activity_id && activityMap.has(submission.activity_id)
  ));
  const submissionMap = new Map();
  let duplicateSubmissions = 0;
  scopedSubmissions.forEach((submission) => {
    if (!submission?.student_id) return;
    const key = pairKey(submission.activity_id, submission.student_id);
    const current = submissionMap.get(key);
    if (current) {
      duplicateSubmissions += 1;
      submissionMap.set(
        key,
        chooseLatest(current, submission, ['submitted_at', 'updated_at', 'reviewed_at', 'created_at'])
      );
    } else {
      submissionMap.set(key, submission);
    }
  });

  const outcomes = Array.from(assignmentMap.entries()).map(([key, assignment]) => {
    const activity = activityMap.get(assignment.activity_id) || {};
    const submission = submissionMap.get(key) || null;
    const classification = classifyAssignmentOutcome({ assignment, activity, submission, asOf });
    return {
      key,
      activityId: assignment.activity_id,
      activityTitle: activity.title || 'Untitled Activity',
      classId: activity.class_id || null,
      className: classMap.get(activity.class_id)?.name || null,
      teacherId: activity.teacher_id || null,
      studentId: assignment.student_id,
      studentName: userMap.get(assignment.student_id)?.name || null,
      assignment,
      submission,
      submittedAtMs: parseDateMs(submission?.submitted_at),
      reviewedAtMs: parseDateMs(submission?.reviewed_at),
      ...classification,
    };
  });

  const byActivity = scopedActivities
    .map((activity) => {
      const rows = outcomes.filter((row) => row.activityId === activity.id);
      if (rows.length === 0) return null;
      return {
        activityId: activity.id,
        activityTitle: activity.title || 'Untitled Activity',
        classId: activity.class_id || null,
        teacherId: activity.teacher_id || null,
        ...summarizeOutcomes(rows),
      };
    })
    .filter(Boolean);

  const orphanSubmissions = Array.from(submissionMap.entries())
    .filter(([key]) => !assignmentMap.has(key))
    .map(([, submission]) => submission);

  return {
    range: normalizedRange,
    asOfIso: new Date(asOfMs).toISOString(),
    summary: summarizeOutcomes(outcomes),
    events: {
      // Event cards use the same assigned cohort as the completion and trend
      // metrics. Orphan rows remain visible in dataQuality without making the
      // displayed event total disagree with its chart.
      submissionsInRange: outcomes.filter((row) => (
        isInRange(row.submission?.submitted_at, normalizedRange)
      )).length,
      reviewsInRange: outcomes.filter((row) => (
        isInRange(row.submission?.reviewed_at, normalizedRange)
      )).length,
    },
    byActivity,
    outcomes,
    dataQuality: {
      duplicateAssignments,
      duplicateSubmissions,
      orphanSubmissions: orphanSubmissions.length,
      assignmentsMissingActivity,
    },
  };
};

/** Escapes one CSV cell and prevents spreadsheet formula execution. */
export const escapeCsvCell = (value) => {
  let text = value === null || value === undefined
    ? ''
    : value instanceof Date
      ? value.toISOString()
      : String(value);

  if (typeof value === 'string' && FORMULA_PREFIX_PATTERN.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replaceAll('"', '""')}"`;
};

export const serializeCsvRow = (values = []) => values.map(escapeCsvCell).join(',');
