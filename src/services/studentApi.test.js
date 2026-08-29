import {
  getStudentActivities,
  getStudentActivityAssessment,
  getStudentClasses,
  submitActivity,
} from './studentApi';

const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args) => mockFrom(...args),
    rpc: (...args) => mockRpc(...args),
  },
}));

describe('getStudentClasses', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('returns active class details in enrollment order', async () => {
    const enrollmentOrder = jest.fn().mockResolvedValue({
      data: [
        { class_id: 'diamond-id', enrolled_at: '2026-08-13T10:00:00Z' },
        { class_id: 'disabled-id', enrolled_at: '2026-08-12T10:00:00Z' },
      ],
      error: null,
    });
    const enrollmentEq = jest.fn(() => ({ order: enrollmentOrder }));
    const enrollmentSelect = jest.fn(() => ({ eq: enrollmentEq }));

    const activeEq = jest.fn().mockResolvedValue({
      data: [
        {
          id: 'diamond-id',
          name: 'Grade 6 - Diamond',
          grade: 'Grade 6',
          section: 'Diamond',
          is_active: true,
        },
      ],
      error: null,
    });
    const classIn = jest.fn(() => ({ eq: activeEq }));
    const classSelect = jest.fn(() => ({ in: classIn }));

    mockFrom.mockImplementation((table) => {
      if (table === 'class_students') return { select: enrollmentSelect };
      if (table === 'classes') return { select: classSelect };
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await getStudentClasses('student-id');

    expect(result).toEqual({
      success: true,
      data: [
        expect.objectContaining({
          id: 'diamond-id',
          name: 'Grade 6 - Diamond',
          enrolled_at: '2026-08-13T10:00:00Z',
        }),
      ],
    });
    expect(enrollmentEq).toHaveBeenCalledWith('student_id', 'student-id');
    expect(classIn).toHaveBeenCalledWith('id', ['diamond-id', 'disabled-id']);
    expect(activeEq).toHaveBeenCalledWith('is_active', true);
  });
});

describe('submitActivity', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    mockFrom.mockReset();
    mockRpc.mockReset();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => consoleErrorSpy.mockRestore());

  it('uses the transactional assigned-activity RPC', async () => {
    mockRpc.mockResolvedValue({
      data: { id: 'submission-1', assignment_id: 'assignment-1', status: 'submitted' },
      error: null,
    });

    const result = await submitActivity('student-1', 'activity-1', {
      artwork_url: 'data:image/webp;base64,art',
      description: '{"sceneState":[]}',
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'submit_assigned_activity',
      expect.objectContaining({
        p_student_id: 'student-1',
        p_activity_id: 'activity-1',
        p_artwork_url: 'data:image/webp;base64,art',
        p_description: '{"sceneState":[]}',
        p_artwork_title: expect.stringMatching(/^AR Submission /),
      })
    );
    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({ id: 'submission-1', status: 'submitted' }),
    });
  });

  it('surfaces transactional submission failures', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Reviewed work cannot be resubmitted.' },
    });

    await expect(submitActivity('student-1', 'activity-1', {})).resolves.toEqual({
      success: false,
      error: 'Reviewed work cannot be resubmitted.',
    });
  });
});

describe('getStudentActivityAssessment', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    mockRpc.mockReset();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => consoleErrorSpy.mockRestore());

  it('uses the learner-safe RPC and keeps only confirmed teacher-facing review fields', async () => {
    mockRpc.mockResolvedValue({
      data: {
        rubric: {
          id: 'rubric-1',
          title: 'Lantern Colors',
          description: 'Use the listed skills.',
          assignedVersion: '2',
          teacher_id: 'must-not-leak',
          criteria: [{
            name: 'Uses color carefully',
            levels: [{ code: 'C', label: 'Consistent', description: 'Works independently.' }],
          }],
        },
        final_review: {
          score: 4,
          feedback: 'Well done.',
          reviewed_at: '2026-08-13T02:00:00Z',
          teacher_confirmed_at: '2026-08-13T02:01:00Z',
          next_steps: 'Try a contrasting border.',
          suggested_score: 5,
          ai_feedback: 'Unconfirmed draft feedback',
          criteria: [{
            criterion_index: 0,
            criterion_title_snapshot: 'Uses color carefully',
            selected_rating: 'C',
            consistent_descriptor_snapshot: 'Works independently.',
            teacher_note: 'Strong color control.',
          }],
          approved_color_suggestion: {
            message: 'Try blue for the border.',
            colors: [{ name: 'Blue', hex: '#2255CC', confidence: 0.98 }],
            rationale: 'It gives clear contrast.',
            internal_prompt: 'must-not-leak',
          },
        },
      },
      error: null,
    });

    const result = await getStudentActivityAssessment('activity-1');

    expect(mockRpc).toHaveBeenCalledWith('get_student_activity_assessment', {
      p_activity_id: 'activity-1',
    });
    expect(result.success).toBe(true);
    expect(result.data.rubric).toEqual(expect.objectContaining({
      id: 'rubric-1',
      title: 'Lantern Colors',
      assignedVersion: '2',
    }));
    expect(result.data.rubric).not.toHaveProperty('teacher_id');
    expect(result.data.final_review).toEqual(expect.objectContaining({
      score: 4,
      feedback: 'Well done.',
      next_steps: 'Try a contrasting border.',
      criteria: [expect.objectContaining({
        selected_rating: 'C',
        teacher_note: 'Strong color control.',
      })],
      approved_color_suggestion: {
        message: 'Try blue for the border.',
        colors: [{ name: 'Blue', hex: '#2255CC' }],
        rationale: 'It gives clear contrast.',
      },
    }));
    expect(result.data.final_review).not.toHaveProperty('suggested_score');
    expect(result.data.final_review).not.toHaveProperty('ai_feedback');
  });

  it('keeps a finalized legacy score while withholding unconfirmed rubric evidence and suggestions', async () => {
    mockRpc.mockResolvedValue({
      data: {
        rubric: { id: 'rubric-1', title: 'Attached rubric', criteria: [] },
        final_review: {
          score: 5,
          reviewed_at: '2026-08-13T02:00:00Z',
          teacher_confirmed_at: null,
          feedback: 'Final teacher feedback',
          next_steps: 'UNCONFIRMED NEXT STEPS',
          criteria: [{ criterion_title_snapshot: 'Draft criterion', selected_rating: 'C' }],
          approved_color_suggestion: { message: 'UNCONFIRMED COLOR DRAFT' },
        },
      },
      error: null,
    });

    const result = await getStudentActivityAssessment('activity-1');

    expect(result.data.final_review).toEqual(expect.objectContaining({
      score: 5,
      feedback: 'Final teacher feedback',
      reviewed_at: '2026-08-13T02:00:00Z',
      teacher_confirmed_at: '',
      next_steps: '',
      criteria: [],
      approved_color_suggestion: null,
    }));
  });
});

describe('getStudentActivities', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('uses only active enrolled classes for fallback activities', async () => {
    const assignmentEq = jest.fn().mockResolvedValue({ data: [], error: null });
    const assignmentSelect = jest.fn(() => ({ eq: assignmentEq }));

    const enrollmentEq = jest.fn().mockResolvedValue({
      data: [{ class_id: 'active-class' }, { class_id: 'disabled-class' }],
      error: null,
    });
    const enrollmentSelect = jest.fn(() => ({ eq: enrollmentEq }));

    const activeClassEq = jest.fn().mockResolvedValue({
      data: [{ id: 'active-class' }],
      error: null,
    });
    const activeClassIn = jest.fn(() => ({ eq: activeClassEq }));
    const activeClassSelect = jest.fn(() => ({ in: activeClassIn }));

    const activityOrder = jest.fn().mockResolvedValue({
      data: [{
        id: 'activity-1',
        title: 'Active Class Activity',
        class_id: 'active-class',
        status: 'active',
      }],
      error: null,
    });
    const activityStatusEq = jest.fn(() => ({ order: activityOrder }));
    const activityIn = jest.fn(() => ({ eq: activityStatusEq }));
    const activitySelect = jest.fn(() => ({ in: activityIn }));

    const submissionEq = jest.fn().mockResolvedValue({ data: [], error: null });
    const submissionSelect = jest.fn(() => ({ eq: submissionEq }));

    mockFrom.mockImplementation((table) => {
      if (table === 'activity_assignments') return { select: assignmentSelect };
      if (table === 'class_students') return { select: enrollmentSelect };
      if (table === 'classes') return { select: activeClassSelect };
      if (table === 'activities') return { select: activitySelect };
      if (table === 'submissions') return { select: submissionSelect };
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await getStudentActivities('student-id');

    expect(result).toEqual({
      success: true,
      data: [expect.objectContaining({
        id: 'activity-1',
        title: 'Active Class Activity',
        status: 'assigned',
      })],
    });
    expect(activeClassIn).toHaveBeenCalledWith('id', ['active-class', 'disabled-class']);
    expect(activeClassEq).toHaveBeenCalledWith('is_active', true);
    expect(activityIn).toHaveBeenCalledWith('class_id', ['active-class']);
  });
});
