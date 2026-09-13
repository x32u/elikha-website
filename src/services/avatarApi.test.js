import { resolveUserAvatarUrl, validateAvatarFile } from './avatarApi';

const mockList = jest.fn();
const mockStorageFrom = jest.fn();
const mockResolveR2MediaUrl = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    storage: { from: (...args) => mockStorageFrom(...args) },
  },
}));

jest.mock('./r2MediaApi', () => ({
  deleteR2Media: jest.fn(),
  uploadR2Media: jest.fn(),
  resolveR2MediaUrl: (...args) => mockResolveR2MediaUrl(...args),
}));

describe('avatar URL resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveR2MediaUrl.mockResolvedValue('');
    mockStorageFrom.mockImplementation(() => ({
      list: (...args) => mockList(...args),
    }));
  });

  test('finds an enrolled user avatar by user folder when the profile path is hidden', async () => {
    mockList.mockResolvedValue({ data: [{ name: 'avatar.webp' }], error: null });
    mockResolveR2MediaUrl
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('blob:r2-avatar');

    const result = await resolveUserAvatarUrl('student-1', '');

    expect(mockStorageFrom).toHaveBeenCalledWith('avatars');
    expect(mockList).toHaveBeenCalledWith('student-1', { limit: 10, search: 'avatar.' });
    expect(mockResolveR2MediaUrl).toHaveBeenLastCalledWith(
      'avatars',
      'student-1',
      'avatars/student-1/avatar.webp'
    );
    expect(result).toBe('blob:r2-avatar');
  });

  test('uses the saved avatar path without listing the folder', async () => {
    mockResolveR2MediaUrl.mockResolvedValue('blob:saved-avatar');

    const result = await resolveUserAvatarUrl('student-1', 'avatars/student-1/avatar.webp');

    expect(mockList).not.toHaveBeenCalled();
    expect(mockResolveR2MediaUrl).toHaveBeenCalledWith(
      'avatars',
      'student-1',
      'avatars/student-1/avatar.webp'
    );
    expect(result).toBe('blob:saved-avatar');
  });

  test('accepts source images up to 20 MB', () => {
    expect(validateAvatarFile({ type: 'image/webp', size: 20 * 1024 * 1024 })).toEqual({ valid: true });
    expect(validateAvatarFile({ type: 'image/webp', size: 20 * 1024 * 1024 + 1 }).valid).toBe(false);
  });
});
