const mockGetSession = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: (...args) => mockGetSession(...args) } },
}));

const API_BASE = 'https://r2.example.test';
const THUMBNAIL_ID = '6ca7a73e-f019-4fa8-914f-eef0cc8ab511';

const loadStorage = () => {
  let storage;
  jest.isolateModules(() => {
    storage = require('./activityThumbnailStorage');
  });
  return storage;
};

describe('activity thumbnail R2 storage', () => {
  const originalApiBase = process.env.REACT_APP_R2_MODEL_API_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.REACT_APP_R2_MODEL_API_URL = API_BASE;
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'session-token' } },
      error: null,
    });
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    if (originalApiBase === undefined) delete process.env.REACT_APP_R2_MODEL_API_URL;
    else process.env.REACT_APP_R2_MODEL_API_URL = originalApiBase;
    global.fetch = originalFetch;
  });

  test('uploads inline thumbnail data to the authenticated R2 endpoint', async () => {
    const publicUrl = `${API_BASE}/activity-thumbnails/${THUMBNAIL_ID}?v=1`;
    global.fetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ success: true, data: { id: THUMBNAIL_ID, url: publicUrl } }),
    });
    const { uploadActivityThumbnail } = loadStorage();

    const result = await uploadActivityThumbnail({
      imageUrl: 'data:image/png;base64,aGVsbG8=',
      teacherId: 'teacher-1',
    });

    expect(result).toBe(publicUrl);
    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE}/activity-thumbnails`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer session-token',
          'Content-Type': 'image/png',
        }),
        body: expect.any(Blob),
      })
    );
  });

  test('leaves an already-hosted thumbnail URL unchanged', async () => {
    const { uploadActivityThumbnail } = loadStorage();
    const existing = 'https://images.example.test/activity.webp';

    await expect(uploadActivityThumbnail({ imageUrl: existing, teacherId: 'teacher-1' }))
      .resolves.toBe(existing);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('can delete only URLs belonging to the configured R2 thumbnail endpoint', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    const { deleteActivityThumbnail } = loadStorage();

    await expect(deleteActivityThumbnail(
      `${API_BASE}/activity-thumbnails/${THUMBNAIL_ID}?v=1`
    )).resolves.toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE}/activity-thumbnails/${THUMBNAIL_ID}`,
      expect.objectContaining({ method: 'DELETE' })
    );

    global.fetch.mockClear();
    await expect(deleteActivityThumbnail('https://other.example.test/image.png')).resolves.toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('surfaces the Worker error without referring to a Supabase bucket', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 413,
      json: async () => ({ success: false, error: 'Image is too large.', code: 'FILE_TOO_LARGE' }),
    });
    const { uploadActivityThumbnail } = loadStorage();

    await expect(uploadActivityThumbnail({
      imageUrl: 'data:image/png;base64,aGVsbG8=',
      teacherId: 'teacher-1',
    })).rejects.toThrow('Image is too large.');
  });
});
