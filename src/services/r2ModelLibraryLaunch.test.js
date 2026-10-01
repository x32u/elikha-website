process.env.REACT_APP_R2_MODEL_API_URL = 'https://models.example';
const mockGetSession = jest.fn();
jest.mock('../lib/supabase', () => ({ supabase: { auth: { getSession: (...args) => mockGetSession(...args) } } }));
const { refreshR2ModelLibrary } = require('./r2ModelApi');
const { getArModelLibrary, replaceR2ArModelLibrary } = require('../utils/activityArConfig');
const session = { user: { id: 'student-1' }, access_token: 'test-token' };
const response = (data) => ({ ok: true, status: 200, json: async () => ({ data }) });

beforeEach(() => {
  window.sessionStorage.setItem('userInfo', JSON.stringify({ id: 'student-1' }));
  replaceR2ArModelLibrary([], null);
  mockGetSession.mockReset(); mockGetSession.mockResolvedValue({ data: { session } });
  global.fetch = jest.fn().mockResolvedValue(response([{ id: 'torii', label: 'Torii Shrine', fileType: 'glb', modelUrl: 'https://models.example/models/files/torii' }]));
});
afterEach(() => { window.sessionStorage.clear(); replaceR2ArModelLibrary([], null); delete global.fetch; });
test('waits for the catalog and caches it only for the verified account', async () => {
  const controller = new AbortController();
  const models = await refreshR2ModelLibrary({ signal: controller.signal, expectedUserId: 'student-1' });
  expect(models[0].label).toBe('Torii Shrine');
  expect(fetch.mock.calls[0][1].signal).toBe(controller.signal);
  expect(fetch.mock.calls[0][1].cache).toBe('no-store');
});
test('does not request data for a mismatched session', async () => {
  await expect(refreshR2ModelLibrary({ expectedUserId: 'student-2' })).rejects.toThrow('session changed');
  expect(fetch).not.toHaveBeenCalled();
});
test('does not publish a response after cancellation even if the transport ignores abort', async () => {
  const controller = new AbortController();
  fetch.mockImplementation(async () => { controller.abort(); return response([]); });
  await expect(refreshR2ModelLibrary({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  expect(getArModelLibrary()).toEqual([]);
});
test('rejects malformed successful responses instead of disguising them as an empty library', async () => {
  fetch.mockResolvedValue(response(null));
  await expect(refreshR2ModelLibrary()).rejects.toThrow('invalid response');
});
test('does not cache or return another account catalog during an account switch', async () => {
  mockGetSession.mockResolvedValueOnce({ data: { session } }).mockResolvedValueOnce({ data: { session: { ...session, user: { id: 'student-2' } } } });
  await expect(refreshR2ModelLibrary({ expectedUserId: 'student-1' })).rejects.toThrow('session changed');
  expect(getArModelLibrary()).toEqual([]);
});
