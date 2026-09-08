import { buildStudentInsights } from './studentInsights';
import { encodeArSubmissionDescription } from './arSubmission';

describe('student insights', () => {
  it('uses telemetry and confirmed rubric evidence for category highlights', () => {
    const description = encodeArSubmissionDescription([], 'Submitted', [], [], [], null, {
      activeDurationSeconds: 120,
      coloring: { accuracyPercent: 100 },
      puzzle: { accuracyPercent: 100, completionSeconds: 60 },
    });
    const cards = buildStudentInsights({
      outcomes: [{ studentId: 's1', studentName: 'Nico', activityId: 'a1', activityTitle: 'Color Practice' }],
      submissions: [{ student_id: 's1', activity_id: 'a1', status: 'reviewed', score: 5, submitted_at: '2026-09-01', reviewed_at: '2026-09-02', description }],
      observations: [{ id: 'o1', learner_id: 's1', activity_id: 'a1', teacher_confirmed_at: '2026-09-02' }],
      criteria: [{ observation_id: 'o1', criterion_title_snapshot: 'Uses color correctly', selected_rating: 'CO' }],
    });
    expect(cards.find((item) => item.key === 'coloring')).toMatchObject({ student_name: 'Nico', value: '100%' });
    expect(cards.find((item) => item.key === 'fastest')).toMatchObject({ student_name: 'Nico', value: '2 min' });
  });

  it('reports improvement in stars using two separate reviewed activities and provides evidence', () => {
    const cards = buildStudentInsights({
      outcomes: [
        { studentId: 's1', studentName: 'Sophia', activityId: 'a1', activityTitle: 'First Activity' },
        { studentId: 's1', studentName: 'Sophia', activityId: 'a2', activityTitle: 'Recent Activity' },
      ],
      submissions: [
        { student_id: 's1', activity_id: 'a1', status: 'reviewed', score: 1, reviewed_at: '2026-08-01' },
        { student_id: 's1', activity_id: 'a2', status: 'reviewed', score: 5, reviewed_at: '2026-09-01' },
      ],
    });
    expect(cards.find((item) => item.key === 'improved')).toMatchObject({
      student_name: 'Sophia',
      value: '+4.0 stars',
      evidence: 2,
      calculation: '5.0 − 1.0 = +4.0 stars',
      evidenceItems: [
        expect.objectContaining({ label: 'Earlier', activity: 'First Activity', stars: 1 }),
        expect.objectContaining({ label: 'Recent', activity: 'Recent Activity', stars: 5 }),
      ],
    });
  });

  it('adds an overall card and ranks the complete class roster top to bottom', () => {
    const cards = buildStudentInsights({
      studentUsers: [
        { id: 's1', name: 'Nico' },
        { id: 's2', name: 'Sophia' },
        { id: 's3', name: 'Alex' },
      ],
      outcomes: [
        { studentId: 's1', studentName: 'Nico', activityId: 'a1', activityTitle: 'Activity 1' },
        { studentId: 's2', studentName: 'Sophia', activityId: 'a1', activityTitle: 'Activity 1' },
      ],
      submissions: [
        { student_id: 's1', activity_id: 'a1', status: 'reviewed', score: 5, reviewed_at: '2026-09-01' },
        { student_id: 's2', activity_id: 'a1', status: 'reviewed', score: 3, reviewed_at: '2026-09-01' },
      ],
    });

    const overall = cards.find((item) => item.key === 'overall');
    expect(overall).toMatchObject({ student_name: 'Nico', value: '100%' });
    expect(overall.rankings).toEqual([
      expect.objectContaining({ rank: 1, student_name: 'Nico', value: '100%', qualified: true }),
      expect.objectContaining({ rank: 2, student_name: 'Sophia', value: '60%', qualified: true }),
      expect.objectContaining({ rank: null, student_name: 'Alex', value: 'Not enough data', qualified: false }),
    ]);
    expect(cards).toHaveLength(6);
  });
});
