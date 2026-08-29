import {
  assignRubricToActivity,
  deleteRubric,
  getActivityRubricManagementState,
  getActivityRubricOptions,
} from './rubricApi';

const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args) => mockFrom(...args),
    rpc: (...args) => mockRpc(...args),
  },
}));

describe('deleteRubric', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockRpc.mockReset();
  });

  test('protects an attached rubric and preserves its grading history', async () => {
    const usageEq = jest.fn().mockResolvedValue({ count: 2, error: null });
    const usageSelect = jest.fn(() => ({ eq: usageEq }));
    mockFrom.mockImplementation((table) => {
      if (table === 'activity_rubrics') return { select: usageSelect };
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await deleteRubric('rubric-1');

    expect(result).toEqual(expect.objectContaining({
      success: false,
      code: 'rubric_in_use',
    }));
  });

  test('deletes only an unused rubric', async () => {
    const usageEq = jest.fn().mockResolvedValue({ count: 0, error: null });
    const usageSelect = jest.fn(() => ({ eq: usageEq }));
    const deleteEq = jest.fn().mockResolvedValue({ error: null });
    const deleteQuery = jest.fn(() => ({ eq: deleteEq }));

    mockFrom.mockImplementation((table) => {
      if (table === 'activity_rubrics') return { select: usageSelect };
      if (table === 'rubrics') return { delete: deleteQuery };
      throw new Error(`Unexpected table ${table}`);
    });

    await expect(deleteRubric('rubric-2')).resolves.toEqual({ success: true });
    expect(deleteEq).toHaveBeenCalledWith('id', 'rubric-2');
  });
});

describe('activity rubric management', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockRpc.mockReset();
  });

  test('lists only the selected activity teacher rubric options through the checked RPC', async () => {
    mockRpc.mockResolvedValue({
      data: [{ id: 'rubric-1', title: 'Coloring rubric', criteria_count: 3 }],
      error: null,
    });

    await expect(getActivityRubricOptions('teacher-1')).resolves.toEqual({
      success: true,
      data: [{ id: 'rubric-1', title: 'Coloring rubric', criteria_count: 3 }],
    });
    expect(mockRpc).toHaveBeenCalledWith('get_activity_rubric_options', {
      p_teacher_id: 'teacher-1',
    });
  });

  test('attaches and removes rubrics through the protected mutation RPC', async () => {
    mockRpc.mockResolvedValue({ data: { rubric_id: 'rubric-1' }, error: null });

    await expect(assignRubricToActivity('activity-1', 'rubric-1')).resolves.toEqual({
      success: true,
      data: { rubric_id: 'rubric-1' },
    });
    expect(mockRpc).toHaveBeenLastCalledWith('set_activity_rubric', {
      p_activity_id: 'activity-1',
      p_rubric_id: 'rubric-1',
    });

    await assignRubricToActivity('activity-1', '');
    expect(mockRpc).toHaveBeenLastCalledWith('set_activity_rubric', {
      p_activity_id: 'activity-1',
      p_rubric_id: null,
    });
  });

  test('normalizes the server lock state used by the edit form', async () => {
    mockRpc.mockResolvedValue({
      data: {
        rubric_id: 'rubric-1',
        rubric_title: 'Coloring rubric',
        rubric_version: '2',
        change_locked: true,
        lock_reason: 'Student work depends on this rubric.',
        has_submissions: true,
      },
      error: null,
    });

    const result = await getActivityRubricManagementState('activity-1');

    expect(result.data).toEqual({
      rubricId: 'rubric-1',
      rubricTitle: 'Coloring rubric',
      rubricVersion: '2',
      changeLocked: true,
      lockReason: 'Student work depends on this rubric.',
      hasSubmissions: true,
    });
  });
});
