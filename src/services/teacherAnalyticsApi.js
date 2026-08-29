import { supabase } from '../lib/supabase';
import {
  aggregateAnalyticsReport,
  createReportDateRange,
} from '../utils/reportAnalytics';

const PAGE_SIZE = 750;
const IN_FILTER_CHUNK_SIZE = 150;
const DAY_MS = 24 * 60 * 60 * 1000;

const unique = (values = []) => [...new Set(values.filter(Boolean))];

const fetchAllPages = async (createQuery) => {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await createQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
};

const fetchRowsForIds = async (ids, createQuery) => {
  const safeIds = unique(ids);
  if (safeIds.length === 0) return [];

  const rows = [];
  for (let index = 0; index < safeIds.length; index += IN_FILTER_CHUNK_SIZE) {
    const chunk = safeIds.slice(index, index + IN_FILTER_CHUNK_SIZE);
    const chunkRows = await fetchAllPages(() => createQuery(chunk));
    rows.push(...chunkRows);
  }
  return rows;
};

const formatTrendLabel = (timestamp, includeYear = false) => new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  month: 'short',
  day: 'numeric',
  ...(includeYear ? { year: 'numeric' } : {}),
}).format(new Date(timestamp));

const buildSubmissionTrend = (outcomes, range, days) => {
  const bucketDays = days <= 7 ? 1 : days <= 30 ? 5 : 15;
  const bucketMs = bucketDays * DAY_MS;
  const bucketCount = Math.ceil((range.endExclusiveMs - range.startMs) / bucketMs);
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const startMs = range.startMs + index * bucketMs;
    const endMs = Math.min(range.endExclusiveMs, startMs + bucketMs);
    return {
      key: new Date(startMs).toISOString(),
      label: bucketDays === 1
        ? formatTrendLabel(startMs)
        : `${formatTrendLabel(startMs)}–${formatTrendLabel(endMs - 1)}`,
      startMs,
      endMs,
      count: 0,
    };
  });

  outcomes.forEach((outcome) => {
    const submittedAt = outcome.submittedAtMs;
    if (submittedAt === null || submittedAt < range.startMs || submittedAt >= range.endExclusiveMs) return;
    const bucketIndex = Math.min(
      buckets.length - 1,
      Math.floor((submittedAt - range.startMs) / bucketMs)
    );
    if (buckets[bucketIndex]) buckets[bucketIndex].count += 1;
  });

  return buckets.map(({ startMs, endMs, ...bucket }) => bucket);
};

const buildStudentAttention = (outcomes) => {
  const students = new Map();

  outcomes.forEach((outcome) => {
    const key = outcome.studentId;
    if (!key) return;
    const current = students.get(key) || {
      student_id: key,
      student_name: outcome.studentName || 'Student',
      classNames: new Set(),
      missing: 0,
      pending_review: 0,
      late_submissions: 0,
      scores: [],
    };

    if (outcome.className) current.classNames.add(outcome.className);
    if (outcome.isMissing) current.missing += 1;
    if (outcome.isPendingReview) current.pending_review += 1;
    if (outcome.isLate) current.late_submissions += 1;
    if (typeof outcome.normalizedScore === 'number') current.scores.push(outcome.normalizedScore);
    students.set(key, current);
  });

  return Array.from(students.values())
    .map((student) => ({
      student_id: student.student_id,
      student_name: student.student_name,
      class_name: Array.from(student.classNames).join(', ') || 'Class',
      missing: student.missing,
      pending_review: student.pending_review,
      late_submissions: student.late_submissions,
      average_score: student.scores.length
        ? Number((student.scores.reduce((sum, score) => sum + score, 0) / student.scores.length).toFixed(2))
        : null,
    }))
    .filter((student) => student.missing || student.late_submissions)
    .sort((left, right) => (
      right.missing - left.missing ||
      right.pending_review - left.pending_review ||
      right.late_submissions - left.late_submissions ||
      left.student_name.localeCompare(right.student_name)
    ));
};

const emptyActivityMetrics = {
  assigned: 0,
  submitted: 0,
  reviewed: 0,
  graded: 0,
  pendingReview: 0,
  missing: 0,
  pending: 0,
  lateSubmissions: 0,
  completionRate: null,
  reviewRate: null,
  averageScore: null,
};

export const fetchTeacherAnalytics = async ({ teacherId, days = 30, classId = '' } = {}) => {
  try {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;

    const authenticatedTeacherId = authData?.user?.id;
    if (!authenticatedTeacherId) {
      return { success: false, error: 'Your session has expired. Please sign in again.' };
    }

    if (teacherId && teacherId !== authenticatedTeacherId) {
      return { success: false, error: 'The selected teacher account does not match your session.' };
    }

    const safeDays = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
    const [classes, activities] = await Promise.all([
      fetchAllPages(() => supabase
        .from('classes')
        .select('id, teacher_id, name, grade, section, subject, created_at, is_active')
        .eq('teacher_id', authenticatedTeacherId)
        .eq('is_active', true)
        .order('id', { ascending: true })),
      fetchAllPages(() => {
        let query = supabase
          .from('activities')
          .select('id, teacher_id, class_id, title, due_date, status, created_at, description')
          .eq('teacher_id', authenticatedTeacherId)
          .order('id', { ascending: true });
        if (classId) query = query.eq('class_id', classId);
        return query;
      }),
    ]);

    const validClassIds = new Set(classes.map((klass) => klass.id));
    if (classId && !validClassIds.has(classId)) {
      return { success: false, error: 'That class is not assigned to your account.' };
    }

    const activityIds = activities.map((activity) => activity.id);
    const relevantClassIds = classId
      ? [classId]
      : classes.map((klass) => klass.id);

    const [assignments, submissions, enrollments] = await Promise.all([
      fetchRowsForIds(activityIds, (chunk) => supabase
        .from('activity_assignments')
        .select('id, activity_id, student_id, status, assigned_at')
        .in('activity_id', chunk)
        .order('id', { ascending: true })),
      fetchRowsForIds(activityIds, (chunk) => supabase
        .from('submissions')
        .select('id, activity_id, student_id, assignment_id, status, submitted_at, reviewed_at, score')
        .in('activity_id', chunk)
        .order('id', { ascending: true })),
      fetchRowsForIds(relevantClassIds, (chunk) => supabase
        .from('class_students')
        .select('id, class_id, student_id, student_name, student_email, enrolled_at')
        .in('class_id', chunk)
        .order('id', { ascending: true })),
    ]);

    const studentUsers = Array.from(new Map(enrollments.map((enrollment) => [
      enrollment.student_id,
      {
        id: enrollment.student_id,
        name: enrollment.student_name || 'Student',
        email: enrollment.student_email || '',
      },
    ])).values());

    const asOf = new Date();
    const range = createReportDateRange(safeDays, asOf);
    const report = aggregateAnalyticsReport(
      { activities, assignments, submissions, users: studentUsers, classes },
      {
        asOf,
        range,
        teacherId: authenticatedTeacherId,
        classId: classId || null,
      }
    );

    const metricsByActivity = new Map(report.byActivity.map((row) => [row.activityId, row]));
    const classMap = new Map(classes.map((klass) => [klass.id, klass]));
    const activityPerformance = activities.map((activity) => {
      const metrics = metricsByActivity.get(activity.id) || emptyActivityMetrics;
      return {
        activity_id: activity.id,
        activity_title: activity.title || 'Untitled Activity',
        class_id: activity.class_id || null,
        class_name: classMap.get(activity.class_id)?.name || 'No class',
        due_date: activity.due_date || null,
        assigned: metrics.assigned,
        submissions: metrics.submitted,
        pending_review: metrics.pendingReview,
        missing: metrics.missing,
        late_submissions: metrics.lateSubmissions,
        completion_rate: metrics.completionRate,
        average_score: metrics.averageScore,
      };
    }).sort((left, right) => (
      (right.missing - left.missing) ||
      ((right.completion_rate ?? -1) - (left.completion_rate ?? -1))
    ));

    const enrolledStudentIds = new Set(enrollments.map((enrollment) => enrollment.student_id).filter(Boolean));

    return {
      success: true,
      data: {
        summary: {
          totalStudents: enrolledStudentIds.size,
          totalActivities: activities.length,
          ...report.summary,
        },
        events: report.events,
        activityPerformance,
        studentAttention: buildStudentAttention(report.outcomes),
        submissionTrend: buildSubmissionTrend(report.outcomes, range, safeDays),
        classes,
        dataQuality: report.dataQuality,
        range: report.range,
      },
    };
  } catch (error) {
    console.error('Error fetching teacher analytics:', error);
    return { success: false, error: error.message || 'Failed to load reports and analytics.' };
  }
};
