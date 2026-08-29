import { summarizeTeacherActivities } from './teacherActivitySummary';

describe('summarizeTeacherActivities', () => {
  it('uses the nested class and derives distinct assignment and review counts', () => {
    const activities = [{
      id: 'activity-1',
      title: 'Paper Art',
      class: { id: 'class-1', name: 'Grade 6 - Diamond', grade: 'Grade 6', section: 'Diamond' },
    }];
    const assignments = [
      { id: 'assignment-1', activity_id: 'activity-1', student_id: 'student-1', status: 'pending' },
      { id: 'assignment-2', activity_id: 'activity-1', student_id: 'student-2', status: 'pending' },
      { id: 'assignment-3', activity_id: 'activity-1', student_id: 'student-3', status: 'submitted' },
    ];
    const submissions = [
      { id: 'submission-1', activity_id: 'activity-1', student_id: 'student-2', status: 'submitted', submitted_at: '2026-08-13T01:00:00Z' },
      { id: 'submission-2', activity_id: 'activity-1', student_id: 'student-3', status: 'reviewed', submitted_at: '2026-08-13T02:00:00Z', reviewed_at: '2026-08-13T03:00:00Z' },
    ];

    expect(summarizeTeacherActivities(activities, assignments, submissions)).toEqual([
      expect.objectContaining({
        class_name: 'Grade 6 - Diamond',
        assigned_count: 3,
        submission_count: 2,
        pending_count: 1,
        pending_review_count: 1,
        reviewed_count: 1,
      }),
    ]);
  });

  it('does not count draft submissions as submitted and keeps activities isolated', () => {
    const result = summarizeTeacherActivities(
      [
        { id: 'activity-1', grade: '5', section: 'Emerald' },
        { id: 'activity-2' },
      ],
      [{ id: 'assignment-1', activity_id: 'activity-1', student_id: 'student-1', status: 'in_progress' }],
      [{ id: 'submission-1', activity_id: 'activity-1', student_id: 'student-1', status: 'draft' }]
    );

    expect(result[0]).toEqual(expect.objectContaining({
      class_name: 'Grade 5 - Emerald',
      assigned_count: 1,
      submission_count: 0,
      pending_count: 1,
      pending_review_count: 0,
    }));
    expect(result[1]).toEqual(expect.objectContaining({
      class_name: 'Unknown Class',
      assigned_count: 0,
      submission_count: 0,
      pending_count: 0,
    }));
  });
});
