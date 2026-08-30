import { buildTeacherRubricEvidence } from './teacherReviewEvidence';

const rubric = {
  id: 'rubric-1',
  assignedVersion: '4',
  criteria: [{
    name: 'Uses the assigned colors',
    levels: [
      { code: 'B', description: 'Needs guidance.' },
      { code: 'D', description: 'Sometimes follows the guide.' },
      { code: 'C', description: 'Consistently follows the guide.' },
    ],
  }],
};

const submission = {
  id: 'submission-1',
  studentId: 'student-1',
  activityId: 'activity-1',
  activityTitle: 'Color the bird',
};

const build = (overrides = {}) => buildTeacherRubricEvidence({
  rubric,
  submission,
  observerId: 'teacher-1',
  criterionRatings: ['C'],
  criterionNotes: ['The required areas are visibly complete.'],
  observationDate: '2026-08-13',
  feedback: 'Great work',
  evidenceUrl: 'https://example.test/submission.webp',
  nextSteps: 'Try a contrasting accent color next time.',
  teacherConfirmed: true,
  aiEvaluation: {
    id: 'evaluation-1',
    submission_id: 'submission-1',
    status: 'completed',
  },
  confirmedAt: '2026-08-13T12:00:00.000Z',
  ...overrides,
});

describe('teacher review evidence contract', () => {
  test('persists the teacher decision, criterion snapshots, and exact completed AI link', () => {
    expect(build()).toEqual({
      observation: {
        rubric_id: 'rubric-1',
        rubric_version: '4',
        learner_id: 'student-1',
        activity_id: 'activity-1',
        activity_name: 'Color the bird',
        observer_id: 'teacher-1',
        observation_date: '2026-08-13',
        overall_comment: 'Great work',
        evidence_url: 'https://example.test/submission.webp',
        next_steps: 'Try a contrasting accent color next time.',
        teacher_confirmed_at: '2026-08-13T12:00:00.000Z',
        ai_evaluation_id: 'evaluation-1',
      },
      criteria: [{
        criterion_index: 0,
        criterion_title_snapshot: 'Uses the assigned colors',
        beginning_descriptor_snapshot: 'Needs guidance.',
        developing_descriptor_snapshot: 'Sometimes follows the guide.',
        consistent_descriptor_snapshot: 'Consistently follows the guide.',
        // Ratings are normalized to the SF9 code the DepEd form uses, so a
        // legacy 'C' from an older client is stored as 'CO'.
        selected_rating: 'CO',
        teacher_note: 'The required areas are visibly complete.',
      }],
    });
  });

  test('normalizes legacy and SF9 ratings to the SF9 code', () => {
    expect(build({ criterionRatings: ['C'] }).criteria[0].selected_rating).toBe('CO');
    expect(build({ criterionRatings: ['CO'] }).criteria[0].selected_rating).toBe('CO');
    expect(build({ criterionRatings: ['B'] }).criteria[0].selected_rating).toBe('BG');
    expect(build({ criterionRatings: ['BG'] }).criteria[0].selected_rating).toBe('BG');
    expect(build({ criterionRatings: ['NO'] }).criteria[0].selected_rating).toBe('NO');
  });

  test('reads descriptors from a rubric that uses SF9 level codes', () => {
    const sf9Rubric = {
      id: 'rubric-2',
      assignedVersion: '1',
      criteria: [{
        name: 'Fills the shapes with colour',
        levels: [
          { code: 'CO', description: 'Always demonstrates the expected competency.' },
          { code: 'DV', description: 'Sometimes demonstrates the competency.' },
          { code: 'BG', description: 'Rarely demonstrates the expected competency.' },
        ],
      }],
    };

    const criteria = build({ rubric: sf9Rubric, criterionRatings: ['DV'] }).criteria[0];
    expect(criteria.beginning_descriptor_snapshot).toBe('Rarely demonstrates the expected competency.');
    expect(criteria.developing_descriptor_snapshot).toBe('Sometimes demonstrates the competency.');
    expect(criteria.consistent_descriptor_snapshot).toBe('Always demonstrates the expected competency.');
    expect(criteria.selected_rating).toBe('DV');
  });

  test.each([
    [{ status: 'processing', id: 'evaluation-1', submission_id: 'submission-1' }],
    [{ status: 'completed', id: 'evaluation-1', submission_id: 'another-submission' }],
    [{ status: 'completed', submission_id: 'submission-1' }],
  ])('does not link an unfinished, stale, or unidentified AI draft', (aiEvaluation) => {
    expect(build({ aiEvaluation }).observation.ai_evaluation_id).toBeNull();
  });

  test('requires explicit teacher confirmation and final ratings', () => {
    expect(() => build({ teacherConfirmed: false })).toThrow('Teacher confirmation');
    expect(() => build({ criterionRatings: [''] })).toThrow('valid final teacher rating');
  });

  test('returns no rubric evidence when the activity has no attached rubric', () => {
    expect(build({ rubric: null, teacherConfirmed: false })).toBeNull();
  });
});
