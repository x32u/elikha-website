import { formatClassLabel } from './classLabels';

const SUBMITTED_STATUSES = new Set(['submitted', 'late', 'reviewed', 'graded', 'completed']);
const REVIEWED_STATUSES = new Set(['reviewed', 'graded', 'completed']);
const PENDING_ASSIGNMENT_STATUSES = new Set(['assigned', 'pending', 'in_progress']);

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

const relationRow = (value) => (Array.isArray(value) ? value[0] : value) || null;

const recordKey = (row, index) => row?.student_id || row?.id || `row-${index}`;

const groupByActivity = (rows = []) => {
  const grouped = new Map();

  rows.forEach((row) => {
    if (!row?.activity_id) return;
    if (!grouped.has(row.activity_id)) grouped.set(row.activity_id, []);
    grouped.get(row.activity_id).push(row);
  });

  return grouped;
};

const isSubmitted = (submission) => (
  Boolean(submission?.submitted_at) || SUBMITTED_STATUSES.has(normalizeStatus(submission?.status))
);

const isReviewed = (submission) => (
  Boolean(submission?.reviewed_at) || REVIEWED_STATUSES.has(normalizeStatus(submission?.status))
);

export const summarizeTeacherActivities = (
  activities = [],
  assignments = [],
  submissions = []
) => {
  const assignmentsByActivity = groupByActivity(assignments);
  const submissionsByActivity = groupByActivity(submissions);

  return (activities || []).map((activity) => {
    const activityAssignments = assignmentsByActivity.get(activity.id) || [];
    const activitySubmissions = submissionsByActivity.get(activity.id) || [];
    const submittedByStudent = new Map();

    activitySubmissions.forEach((submission, index) => {
      if (!isSubmitted(submission)) return;
      submittedByStudent.set(recordKey(submission, index), submission);
    });

    const assignedStudents = new Set();
    const pendingStudents = new Set();

    activityAssignments.forEach((assignment, index) => {
      const key = recordKey(assignment, index);
      assignedStudents.add(key);
      if (
        PENDING_ASSIGNMENT_STATUSES.has(normalizeStatus(assignment.status)) &&
        !submittedByStudent.has(key)
      ) {
        pendingStudents.add(key);
      }
    });

    const reviewedCount = [...submittedByStudent.values()].filter(isReviewed).length;
    const pendingReviewCount = submittedByStudent.size - reviewedCount;
    const classInfo = relationRow(activity.class);
    const fallbackClassInfo = {
      name: activity.class_name,
      grade: activity.grade,
      section: activity.section,
    };
    const classLabel = classInfo || activity.class_name || activity.grade || activity.section
      ? formatClassLabel(classInfo || fallbackClassInfo)
      : 'Unknown Class';

    return {
      ...activity,
      class: classInfo || activity.class || null,
      class_name: classLabel,
      assigned_count: assignedStudents.size,
      submission_count: submittedByStudent.size,
      pending_count: pendingStudents.size,
      pending_review_count: pendingReviewCount,
      reviewed_count: reviewedCount,
    };
  });
};
