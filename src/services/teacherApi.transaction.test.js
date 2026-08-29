import { createActivity, getAllSubmissions, gradeSubmission, updateActivity } from './teacherApi';

const mockRpc = jest.fn();
const mockFrom = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args) => mockRpc(...args),
    from: (...args) => mockFrom(...args),
  },
}));

describe('teacher transaction services', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockFrom.mockReset();
  });

  test('creates an activity, assignments, and rubric through one RPC', async () => {
    mockRpc.mockResolvedValue({
      data: { id: 'activity-1', title: 'Color the bird' },
      error: null,
    });

    const result = await createActivity({
      teacher_id: 'teacher-1',
      title: 'Color the bird',
      description: 'encoded',
      class_id: 'class-1',
      due_date: '2026-08-20',
      image_url: 'https://example.test/thumb.webp',
      rubric_id: 'rubric-1',
    });

    expect(mockRpc).toHaveBeenCalledWith('create_activity_with_assignments',
      expect.objectContaining({
        p_teacher_id: 'teacher-1',
        p_class_id: 'class-1',
        p_rubric_id: 'rubric-1',
      }));
    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({ id: 'activity-1' }),
    });
  });

  test('updates the activity and its rubric choice atomically', async () => {
    mockRpc.mockResolvedValue({
      data: { id: 'activity-1', title: 'Updated title', rubric_id: 'rubric-2' },
      error: null,
    });

    const result = await updateActivity('activity-1', {
      title: 'Updated title',
      description: 'encoded activity',
      due_date: '2026-08-29',
      image_url: 'https://example.test/activity.webp',
      rubric_action: 'set',
      rubric_id: 'rubric-2',
    });

    expect(mockRpc).toHaveBeenCalledWith('update_activity_with_rubric', {
      p_activity_id: 'activity-1',
      p_title: 'Updated title',
      p_description: 'encoded activity',
      p_due_date: '2026-08-29',
      p_image_url: 'https://example.test/activity.webp',
      p_rubric_action: 'set',
      p_rubric_id: 'rubric-2',
    });
    expect(result.success).toBe(true);
  });

  test('finalizes grade and rubric evidence through one RPC', async () => {
    mockRpc.mockResolvedValue({
      data: { id: 'submission-1', status: 'reviewed', score: 5 },
      error: null,
    });
    const rubricEvidence = {
      observation: { rubric_id: 'rubric-1', learner_id: 'student-1' },
      criteria: [{ criterion_index: 0, selected_rating: 'C' }],
    };

    const result = await gradeSubmission(
      'submission-1',
      'teacher-1',
      { score: 5, feedback: 'Great work' },
      rubricEvidence
    );

    expect(mockRpc).toHaveBeenCalledWith('finalize_submission_review', {
      p_submission_id: 'submission-1',
      p_teacher_id: 'teacher-1',
      p_score: 5,
      p_feedback: 'Great work',
      p_observation: rubricEvidence.observation,
      p_criteria: rubricEvidence.criteria,
    });
    expect(result.success).toBe(true);
  });

  test('hydrates review cards from the teacher-visible enrollment when the users join is hidden by RLS', async () => {
    const submission = {
      id: 'submission-1',
      student_id: 'student-1',
      student: null,
      activity: {
        id: 'activity-1',
        title: 'Kabuki Mask',
        teacher_id: 'teacher-1',
        class_id: 'class-1',
      },
    };

    const submissionsOrder = jest.fn().mockResolvedValue({ data: [submission], error: null });
    const submissionsEq = jest.fn().mockReturnValue({ order: submissionsOrder });
    const submissionsSelect = jest.fn().mockReturnValue({ eq: submissionsEq });

    const enrollmentsByClass = jest.fn().mockResolvedValue({
      data: [{
        class_id: 'class-1',
        student_id: 'student-1',
        student_name: 'Sophia Lei Torrefiel',
        student_email: 'sophia@example.test',
      }],
      error: null,
    });
    const enrollmentsByStudent = jest.fn().mockReturnValue({ in: enrollmentsByClass });
    const enrollmentsSelect = jest.fn().mockReturnValue({ in: enrollmentsByStudent });

    mockFrom.mockImplementation((table) => {
      if (table === 'submissions') return { select: submissionsSelect };
      if (table === 'class_students') return { select: enrollmentsSelect };
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await getAllSubmissions('teacher-1');

    expect(result).toEqual({
      success: true,
      data: [{
        ...submission,
        student: {
          id: 'student-1',
          name: 'Sophia Lei Torrefiel',
          email: 'sophia@example.test',
        },
      }],
    });
    expect(enrollmentsByStudent).toHaveBeenCalledWith('student_id', ['student-1']);
    expect(enrollmentsByClass).toHaveBeenCalledWith('class_id', ['class-1']);
  });
});
