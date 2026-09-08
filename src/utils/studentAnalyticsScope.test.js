import { scopeAnalyticsToCurrentEnrollments } from './studentAnalyticsScope';

describe('teacher analytics student scope', () => {
  const activities = [
    { id: 'activity-a', class_id: 'class-a' },
    { id: 'activity-b', class_id: 'class-b' },
  ];
  const enrollments = [
    { class_id: 'class-a', student_id: 'enrolled-a' },
    { class_id: 'class-b', student_id: 'enrolled-b' },
  ];

  it('excludes historical evidence for an account with no current class enrollment', () => {
    const result = scopeAnalyticsToCurrentEnrollments({
      activities,
      enrollments,
      assignments: [
        { id: 'kept', activity_id: 'activity-a', student_id: 'enrolled-a' },
        { id: 'orphan', activity_id: 'activity-a', student_id: 'zero-class-student' },
      ],
      submissions: [
        { id: 'kept-submission', activity_id: 'activity-a', student_id: 'enrolled-a' },
        { id: 'orphan-submission', activity_id: 'activity-a', student_id: 'zero-class-student' },
      ],
      observations: [
        { id: 'kept-observation', activity_id: 'activity-a', learner_id: 'enrolled-a' },
        { id: 'orphan-observation', activity_id: 'activity-a', learner_id: 'zero-class-student' },
      ],
      criteria: [
        { observation_id: 'kept-observation' },
        { observation_id: 'orphan-observation' },
      ],
    });

    expect(result.assignments.map((row) => row.id)).toEqual(['kept']);
    expect(result.submissions.map((row) => row.id)).toEqual(['kept-submission']);
    expect(result.observations.map((row) => row.id)).toEqual(['kept-observation']);
    expect(result.criteria.map((row) => row.observation_id)).toEqual(['kept-observation']);
    expect([...result.excludedStudentIds]).toEqual(['zero-class-student']);
  });

  it('requires enrollment in the same class as the activity', () => {
    const result = scopeAnalyticsToCurrentEnrollments({
      activities,
      enrollments,
      assignments: [
        { id: 'wrong-class', activity_id: 'activity-b', student_id: 'enrolled-a' },
        { id: 'right-class', activity_id: 'activity-b', student_id: 'enrolled-b' },
      ],
    });

    expect(result.assignments.map((row) => row.id)).toEqual(['right-class']);
  });
});
