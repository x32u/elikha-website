import { resolveUserAvatarUrl } from './avatarApi';

const mockList = jest.fn();
const mockCreateSignedUrl = jest.fn();
const mockStorageFrom = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    storage: { from: (...args) => mockStorageFrom(...args) },
  },
}));

describe('avatar URL resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorageFrom.mockImplementation(() => ({
      list: (...args) => mockList(...args),
      createSignedUrl: (...args) => mockCreateSignedUrl(...args),
    }));
  });

  test('finds an enrolled user avatar by user folder when the profile path is hidden', async () => {
    mockList.mockResolvedValue({ data: [{ name: 'avatar.webp' }], error: null });
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.example/avatar.webp' },
      error: null,
    });

    const result = await resolveUserAvatarUrl('student-1', '');

    expect(mockStorageFrom).toHaveBeenCalledWith('avatars');
    expect(mockList).toHaveBeenCalledWith('student-1', { limit: 10, search: 'avatar.' });
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('student-1/avatar.webp', 3600);
    expect(result).toBe('https://signed.example/avatar.webp');
  });

  test('uses the saved avatar path without listing the folder', async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.example/saved-avatar.webp' },
      error: null,
    });

    const result = await resolveUserAvatarUrl('student-1', 'avatars/student-1/avatar.webp');

    expect(mockList).not.toHaveBeenCalled();
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('student-1/avatar.webp', 3600);
    expect(result).toBe('https://signed.example/saved-avatar.webp');
  });
});
