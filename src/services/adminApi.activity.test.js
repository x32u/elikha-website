import {
  createAdminActivity,
  deleteAdminClassSection,
  restoreAdminClassSection,
} from './adminApi';

const mockRpc = jest.fn();
const mockFrom = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args) => mockFrom(...args),
    rpc: (...args) => mockRpc(...args),
  },
}));

describe('administrator activity creation', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockFrom.mockReset();
  });

  test('passes the selected class teacher rubric to the atomic create RPC', async () => {
    const single = jest.fn().mockResolvedValue({
      data: {
        id: 'class-1',
        teacher_id: 'teacher-1',
        grade: 'Grade 6',
        subject: 'Arts',
        is_active: true,
      },
      error: null,
    });
    const eq = jest.fn(() => ({ single }));
    const select = jest.fn(() => ({ eq }));
    mockFrom.mockImplementation((table) => {
      if (table === 'classes') return { select };
      throw new Error(`Unexpected table ${table}`);
    });
    mockRpc.mockResolvedValue({
      data: { id: 'activity-1', rubric_id: 'rubric-1' },
      error: null,
    });

    const result = await createAdminActivity({
      title: 'Color the bird',
      description: 'Use bright colors.',
      classId: 'class-1',
      dueDate: '2026-08-29',
      modelId: 'bird',
      allowedObjectIds: ['cube'],
      puzzlePieces: 0,
      rubricId: 'rubric-1',
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'create_activity_with_assignments',
      expect.objectContaining({
        p_teacher_id: 'teacher-1',
        p_class_id: 'class-1',
        p_rubric_id: 'rubric-1',
      })
    );
    expect(result).toEqual({
      success: true,
      data: { id: 'activity-1', rubric_id: 'rubric-1' },
    });
  });

  test('rejects activity creation without a rubric before querying the class', async () => {
    const result = await createAdminActivity({
      title: 'Missing rubric',
      classId: 'class-1',
    });

    expect(result).toEqual({ success: false, error: 'A rubric is required to create an activity.' });
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('administrator class lifecycle', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockFrom.mockReset();
  });

  test.each([
    ['disables', deleteAdminClassSection, false],
    ['restores', restoreAdminClassSection, true],
  ])('%s a class without deleting its records', async (_label, action, isActive) => {
    const single = jest.fn().mockResolvedValue({
      data: { id: 'class-1', is_active: isActive },
      error: null,
    });
    const select = jest.fn(() => ({ single }));
    const eq = jest.fn(() => ({ select }));
    const update = jest.fn(() => ({ eq }));
    mockFrom.mockReturnValue({ update });

    const result = await action('class-1');

    expect(mockFrom).toHaveBeenCalledWith('classes');
    expect(update).toHaveBeenCalledWith({ is_active: isActive });
    expect(eq).toHaveBeenCalledWith('id', 'class-1');
    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({ id: 'class-1', is_active: isActive }),
    });
  });
});
