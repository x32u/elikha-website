import {
  aggregateAnalyticsReport,
  classifyAssignmentOutcome,
  createReportDateRange,
  escapeCsvCell,
  serializeCsvRow,
} from './reportAnalytics';

const AS_OF = '2026-08-13T04:00:00.000Z'; // August 13 noon in Manila.

describe('report date range', () => {
  it('returns exactly the requested Manila calendar days', () => {
    const range = createReportDateRange(7, AS_OF);

    expect(range.days).toBe(7);
    expect(range.timeZone).toBe('Asia/Manila');
    expect(range.startIso).toBe('2026-08-06T16:00:00.000Z');
    expect(range.endExclusiveIso).toBe('2026-08-13T16:00:00.000Z');
  });

  it('rejects an invalid as-of date', () => {
    expect(() => createReportDateRange(7, 'not-a-date')).toThrow(TypeError);
  });
});

describe('timestamp normalization', () => {
  it('treats offset-less Supabase event timestamps as UTC on every device', () => {
    const report = aggregateAnalyticsReport(
      {
        activities: [{ id: 'activity-utc', due_date: '2026-08-20' }],
        assignments: [{ id: 'assignment-utc', activity_id: 'activity-utc', student_id: 'student-utc' }],
        submissions: [{
          id: 'submission-utc',
          activity_id: 'activity-utc',
          student_id: 'student-utc',
          status: 'submitted',
          submitted_at: '2026-08-13T15:30:00',
        }],
      },
      {
        asOf: '2026-08-13T15:45:00Z',
        range: {
          start: '2026-08-13T15:00:00Z',
          endExclusive: '2026-08-13T16:00:00Z',
        },
      }
    );

    expect(report.events.submissionsInRange).toBe(1);
    expect(report.outcomes[0].submittedAtMs).toBe(Date.parse('2026-08-13T15:30:00Z'));
  });
});

describe('assignment outcome classifier', () => {
  it('treats a date-only due date as the end of that Manila day', () => {
    const pendingToday = classifyAssignmentOutcome({
      activity: { due_date: '2026-08-13' },
      asOf: AS_OF,
    });
    const missingPastDue = classifyAssignmentOutcome({
      activity: { due_date: '2026-08-10' },
      asOf: AS_OF,
    });

    expect(pendingToday.outcome).toBe('pending');
    expect(pendingToday.dueEndExclusiveIso).toBe('2026-08-13T16:00:00.000Z');
    expect(missingPastDue.outcome).toBe('missing');
  });

  it('uses Manila midnight as the on-time boundary', () => {
    const onTime = classifyAssignmentOutcome({
      activity: { due_date: '2026-08-10' },
      submission: { status: 'submitted', submitted_at: '2026-08-10T15:59:59.999Z' },
      asOf: AS_OF,
    });
    const late = classifyAssignmentOutcome({
      activity: { due_date: '2026-08-10' },
      submission: { status: 'submitted', submitted_at: '2026-08-10T16:00:00.000Z' },
      asOf: AS_OF,
    });

    expect(onTime.isOnTime).toBe(true);
    expect(onTime.isLate).toBe(false);
    expect(late.isOnTime).toBe(false);
    expect(late.isLate).toBe(true);
  });

  it('counts supported reviewed statuses and normalizes legacy ratings', () => {
    const result = classifyAssignmentOutcome({
      activity: { due_date: '2026-08-10' },
      submission: {
        status: 'graded',
        submitted_at: '2026-08-08T02:00:00.000Z',
        reviewed_at: null,
        score: 80,
      },
      asOf: AS_OF,
    });

    expect(result.outcome).toBe('graded');
    expect(result.isReviewed).toBe(true);
    expect(result.normalizedScore).toBe(4);
  });

  it('does not treat an unapproved score as a grade', () => {
    const result = classifyAssignmentOutcome({
      submission: { status: 'submitted', submitted_at: AS_OF, score: 5 },
      asOf: AS_OF,
    });

    expect(result.outcome).toBe('pending_review');
    expect(result.isGraded).toBe(false);
    expect(result.normalizedScore).toBeNull();
  });

  it('lets reviewed_at override a stale submitted status', () => {
    const result = classifyAssignmentOutcome({
      submission: {
        status: 'submitted',
        submitted_at: '2026-08-09T02:00:00.000Z',
        reviewed_at: '2026-08-10T02:00:00.000Z',
        score: 3,
      },
      asOf: AS_OF,
    });

    expect(result.outcome).toBe('graded');
    expect(result.isReviewed).toBe(true);
  });

  it('keeps assignments with no valid due date pending', () => {
    expect(classifyAssignmentOutcome({ activity: {}, asOf: AS_OF }).outcome).toBe('pending');
    expect(classifyAssignmentOutcome({ activity: { due_date: 'invalid' }, asOf: AS_OF }).outcome).toBe('pending');
  });

  it('handles timestamp due dates returned by Supabase', () => {
    const result = classifyAssignmentOutcome({
      activity: { due_date: '2026-08-13T00:00:00' },
      asOf: AS_OF,
    });

    expect(result.outcome).toBe('pending');
    expect(result.dueEndExclusiveIso).toBe('2026-08-13T16:00:00.000Z');
  });
});

describe('analytics aggregation', () => {
  const activities = [
    { id: 'activity-a', title: 'Paper Mask', teacher_id: 'teacher-1', class_id: 'class-1', due_date: '2026-08-10' },
    { id: 'activity-b', title: 'Color Wheel', teacher_id: 'teacher-1', class_id: 'class-1', due_date: '2026-08-20' },
  ];
  const assignments = [
    ...['student-1', 'student-2', 'student-3', 'student-4'].map((studentId, index) => ({
      id: `assignment-a-${index}`,
      activity_id: 'activity-a',
      student_id: studentId,
      status: 'pending',
      assigned_at: '2026-08-01T00:00:00.000Z',
    })),
    ...['student-1', 'student-2'].map((studentId, index) => ({
      id: `assignment-b-${index}`,
      activity_id: 'activity-b',
      student_id: studentId,
      status: 'pending',
      assigned_at: '2026-08-02T00:00:00.000Z',
    })),
  ];
  const submissions = [
    {
      id: 'submission-a-1', activity_id: 'activity-a', student_id: 'student-1', status: 'reviewed',
      submitted_at: '2026-08-09T02:00:00.000Z', reviewed_at: '2026-08-10T02:00:00.000Z', score: 4,
    },
    {
      id: 'submission-a-2', activity_id: 'activity-a', student_id: 'student-2', status: 'submitted',
      submitted_at: '2026-08-11T01:00:00.000Z', reviewed_at: null, score: null,
    },
    {
      id: 'submission-a-4', activity_id: 'activity-a', student_id: 'student-4', status: 'graded',
      submitted_at: '2026-08-08T02:00:00.000Z', reviewed_at: null, score: 80,
    },
    {
      id: 'submission-b-2', activity_id: 'activity-b', student_id: 'student-2', status: 'reviewed',
      submitted_at: '2026-08-12T01:00:00.000Z', reviewed_at: '2026-08-12T13:00:00.000Z', score: 5,
    },
  ];

  it('calculates missing, pending, review, and graded metrics from one cohort', () => {
    const report = aggregateAnalyticsReport(
      { activities, assignments, submissions },
      {
        asOf: AS_OF,
        range: {
          start: '2026-08-01T00:00:00.000Z',
          endExclusive: '2026-08-14T00:00:00.000Z',
        },
      }
    );

    expect(report.summary).toMatchObject({
      assigned: 6,
      submitted: 4,
      reviewed: 3,
      graded: 3,
      pendingReview: 1,
      missing: 1,
      pending: 1,
      completionRate: 66.7,
      reviewRate: 75,
      gradingRate: 75,
      averageScore: 4.33,
      lateSubmissions: 1,
      onTimeSubmissions: 3,
      onTimeRate: 75,
      averageReviewTurnaroundHours: 18,
    });
    expect(report.events).toEqual({ submissionsInRange: 4, reviewsInRange: 2 });
    expect(report.byActivity.find((row) => row.activityId === 'activity-a')).toMatchObject({
      assigned: 4,
      submitted: 3,
      graded: 2,
      pendingReview: 1,
      missing: 1,
      completionRate: 75,
    });
  });

  it('keeps old activities and users when their events fall inside the range', () => {
    const report = aggregateAnalyticsReport(
      {
        activities: [{ ...activities[0], created_at: '2020-01-01T00:00:00.000Z' }],
        assignments: [assignments[0]],
        submissions: [submissions[0]],
        users: [{ id: 'student-1', name: 'Old Student', created_at: '2020-01-01T00:00:00.000Z' }],
      },
      {
        asOf: AS_OF,
        range: {
          start: '2026-08-09T00:00:00.000Z',
          endExclusive: '2026-08-10T12:00:00.000Z',
        },
      }
    );

    expect(report.summary.submitted).toBe(1);
    expect(report.events.submissionsInRange).toBe(1);
    expect(report.outcomes[0].studentName).toBe('Old Student');
  });

  it('deduplicates pairs, uses the latest submission, and flags orphan submissions', () => {
    const report = aggregateAnalyticsReport(
      {
        activities: [activities[0]],
        assignments: [
          assignments[0],
          { ...assignments[0], id: 'duplicate-assignment', assigned_at: '2026-08-02T00:00:00.000Z' },
        ],
        submissions: [
          { ...submissions[0], id: 'older', status: 'submitted', reviewed_at: null, score: null },
          { ...submissions[0], id: 'newer', submitted_at: '2026-08-10T03:00:00.000Z', score: 5 },
          { ...submissions[1], id: 'orphan', student_id: 'student-99' },
        ],
      },
      { asOf: AS_OF }
    );

    expect(report.summary).toMatchObject({ assigned: 1, submitted: 1, graded: 1, averageScore: 5 });
    expect(report.dataQuality).toMatchObject({
      duplicateAssignments: 1,
      duplicateSubmissions: 1,
      orphanSubmissions: 1,
    });
  });

  it('returns null rates instead of NaN for an empty cohort', () => {
    const report = aggregateAnalyticsReport({ activities: [], assignments: [], submissions: [] }, { asOf: AS_OF });

    expect(report.summary).toMatchObject({
      assigned: 0,
      completionRate: null,
      reviewRate: null,
      gradingRate: null,
      averageScore: null,
      onTimeRate: null,
    });
  });

  it('applies teacher and class scope before calculating outcomes', () => {
    const otherActivity = {
      id: 'activity-c', title: 'Other', teacher_id: 'teacher-2', class_id: 'class-2', due_date: '2026-08-20',
    };
    const report = aggregateAnalyticsReport(
      {
        activities: [...activities, otherActivity],
        assignments: [
          ...assignments,
          { id: 'other-assignment', activity_id: 'activity-c', student_id: 'student-9', assigned_at: '2026-08-01T00:00:00.000Z' },
        ],
      },
      { asOf: AS_OF, teacherId: 'teacher-1', classId: 'class-1' }
    );

    expect(report.summary.assigned).toBe(6);
    expect(report.byActivity.map((row) => row.activityId)).toEqual(['activity-a', 'activity-b']);
  });
});

describe('CSV escaping', () => {
  it('quotes values, doubles embedded quotes, and blocks spreadsheet formulas', () => {
    expect(escapeCsvCell('Art "Project"')).toBe('"Art ""Project"""');
    expect(escapeCsvCell('=HYPERLINK("bad")')).toBe('"\'=HYPERLINK(""bad"")"');
    expect(escapeCsvCell('  +SUM(1,2)')).toBe('"\'  +SUM(1,2)"');
    expect(escapeCsvCell(-5)).toBe('"-5"');
    expect(serializeCsvRow(['Name', null, '@command'])).toBe('"Name","","\'@command"');
  });
});
