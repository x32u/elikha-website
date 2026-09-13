import { resolveClassImageUrl, validateClassImageFile } from './classImageApi';

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

describe('class image service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveR2MediaUrl.mockResolvedValue('');
  });

  test('validates supported image types and the upload limit', () => {
    expect(validateClassImageFile({ type: 'image/png', size: 1024 })).toEqual({ valid: true });
    expect(validateClassImageFile({ type: 'image/gif', size: 1024 }).valid).toBe(false);
    expect(validateClassImageFile({ type: 'image/jpeg', size: 20 * 1024 * 1024 }).valid).toBe(true);
    expect(validateClassImageFile({ type: 'image/jpeg', size: 20 * 1024 * 1024 + 1 }).valid).toBe(false);
  });

  test('creates a signed URL from the stored private object path', async () => {
    mockResolveR2MediaUrl.mockResolvedValue('blob:r2-class');

    const result = await resolveClassImageUrl('class-images/class-1/class.webp');

    expect(mockResolveR2MediaUrl).toHaveBeenCalledWith(
      'classes',
      'class-1',
      'class-images/class-1/class.webp'
    );
    expect(result).toBe('blob:r2-class');
  });

  test('returns an empty URL when no image is stored', async () => {
    await expect(resolveClassImageUrl('')).resolves.toBe('');
    expect(mockResolveR2MediaUrl).not.toHaveBeenCalled();
  });
});
