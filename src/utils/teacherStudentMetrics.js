const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const readDueDate = (submission) => {
  const activity = Array.isArray(submission?.activity)
    ? submission.activity[0]
    : submission?.activity;
  return activity?.due_date || submission?.due_date || null;
};

export const isSubmissionLate = ({ status = '', submitted_at: submittedAt = null, due_date: dueDate = null } = {}) => {
  if (normalizeStatus(status) === 'late') return true;

  const submittedDate = parseDate(submittedAt);
  const due = parseDate(dueDate);
  return Boolean(submittedDate && due && submittedDate > due);
};

export const countLateSubmissionsByStudent = (submissions = []) => {
  const counts = {};

  submissions.forEach((submission) => {
    const studentId = submission?.student_id;
    if (!studentId) return;

    const late = isSubmissionLate({
      status: submission.status,
      submitted_at: submission.submitted_at,
      due_date: readDueDate(submission),
    });
    if (late) counts[studentId] = (counts[studentId] || 0) + 1;
  });

  return counts;
};
