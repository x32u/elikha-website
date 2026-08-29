import { countLateSubmissionsByStudent, isSubmissionLate } from './teacherStudentMetrics';

describe('teacher student metrics', () => {
  it('recognizes explicit and date-derived late submissions', () => {
    expect(isSubmissionLate({ status: 'late' })).toBe(true);
    expect(isSubmissionLate({
      status: 'reviewed',
      submitted_at: '2026-06-02T08:00:00Z',
      due_date: '2026-06-01T23:59:59Z',
    })).toBe(true);
    expect(isSubmissionLate({
      status: 'submitted',
      submitted_at: '2026-06-01T08:00:00Z',
      due_date: '2026-06-01T23:59:59Z',
    })).toBe(false);
  });

  it('counts late submissions per student and accepts nested activity arrays', () => {
    const counts = countLateSubmissionsByStudent([
      { student_id: 'student-1', status: 'late' },
      {
        student_id: 'student-1',
        status: 'reviewed',
        submitted_at: '2026-06-03T00:00:00Z',
        activity: { due_date: '2026-06-02T00:00:00Z' },
      },
      {
        student_id: 'student-2',
        status: 'submitted',
        submitted_at: '2026-06-01T00:00:00Z',
        activity: [{ due_date: '2026-06-02T00:00:00Z' }],
      },
    ]);

    expect(counts).toEqual({ 'student-1': 2 });
  });
});
