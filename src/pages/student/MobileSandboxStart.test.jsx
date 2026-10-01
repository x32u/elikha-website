import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import MobileSandboxStart from './MobileSandboxStart';

const mockUseAuth = jest.fn();
const mockRefresh = jest.fn();
const mockMount = jest.fn();
const mockProps = jest.fn();
jest.mock('../../context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('../../services/r2ModelApi', () => ({ refreshR2ModelLibrary: (...args) => mockRefresh(...args) }));
jest.mock('../ar/ARApp', () => function MockAR(props) {
  mockProps(props);
  require('react').useEffect(() => { mockMount(); }, []);
  return <div data-testid="ar">{props.modelConfigs[0].label}<button onClick={props.onExit}>Exit AR</button></div>;
});

const torii = { id: 'torii-shrine-1', label: 'Torii Shrine', fileType: 'glb', modelUrl: '/models/torii.glb' };
const auth = { status: 'authenticated', userInfo: { id: 'student-1', role: 'student' }, refreshAuth: jest.fn() };
const deferred = () => { let resolve; let reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

describe('native Sandbox launch', () => {
  let container;
  let root;
  const render = async () => act(async () => root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><MobileSandboxStart /></MemoryRouter>));
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, '', '/sandbox?mobile=1&autostart=1&model=Torii%20Shrine_1&difficulty=easy&studentId=student-1');
    mockUseAuth.mockReturnValue(auth);
    mockRefresh.mockResolvedValue([torii]);
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container); global.IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(() => {
    act(() => root.unmount()); container.remove(); jest.useRealTimers();
    delete window.ElikhaMobile; delete global.IS_REACT_ACT_ENVIRONMENT;
    window.history.replaceState({}, '', '/');
  });
  it('waits for verified auth, then the cold catalog, without rendering website setup', async () => {
    const pending = deferred(); mockRefresh.mockReturnValue(pending.promise);
    mockUseAuth.mockReturnValue({ ...auth, status: 'loading', userInfo: null });
    await render();
    expect(container.textContent).toContain('Loading your session'); expect(mockRefresh).not.toHaveBeenCalled();
    mockUseAuth.mockReturnValue(auth); await render();
    expect(container.textContent).toContain('Loading your selected 3D model');
    expect(container.querySelector('nav')).toBeNull(); expect(container.textContent).not.toContain('Practice AR by level');
    await act(async () => pending.resolve([torii]));
    expect(container.querySelector('[data-testid="ar"]')).not.toBeNull();
    expect(mockRefresh).toHaveBeenCalledWith({ signal: expect.any(AbortSignal), expectedUserId: 'student-1' });
    expect(mockProps.mock.calls.at(-1)[0]).toMatchObject({ mobileMode: true, sandboxDifficulty: 'easy', modelUrl: torii.modelUrl });
  });
  it.each([[[]], [[{ ...torii, id: 'other-model' }]]])('does not silently choose another model when requested model is missing (%j)', async (models) => {
    mockRefresh.mockResolvedValue(models); await render();
    expect(container.textContent).toContain('selected model is no longer available');
    expect(mockMount).not.toHaveBeenCalled();
  });
  it('reports a network failure and retries successfully', async () => {
    mockRefresh.mockRejectedValueOnce(new TypeError('Failed to fetch')); await render();
    expect(container.querySelector('[role="alert"]').textContent).toContain('Check your connection');
    await act(async () => [...container.querySelectorAll('button')].find((b) => b.textContent === 'Retry').click());
    expect(mockMount).toHaveBeenCalledTimes(1);
  });
  it('bounds loading, aborts and ignores late catalog results', async () => {
    jest.useFakeTimers(); const pending = deferred(); mockRefresh.mockReturnValue(pending.promise); await render();
    await act(async () => jest.advanceTimersByTime(20000));
    expect(container.textContent).toContain('loading took too long');
    expect(mockRefresh.mock.calls[0][0].signal.aborted).toBe(true);
    await act(async () => pending.resolve([torii])); expect(mockMount).not.toHaveBeenCalled();
  });
  it.each([
    { ...auth, userInfo: { id: 'student-2', role: 'student' } },
    { ...auth, userInfo: { id: 'student-1', role: 'teacher' } },
    { ...auth, status: 'anonymous', userInfo: null },
  ])('rejects invalid identity before fetching the catalog', async (state) => {
    mockUseAuth.mockReturnValue(state); await render();
    expect(container.querySelector('[role="alert"]')).not.toBeNull(); expect(mockRefresh).not.toHaveBeenCalled();
  });
  it('keeps the same AR instance and model config through token/profile refresh and library updates', async () => {
    await render(); const initial = mockProps.mock.calls.at(-1)[0];
    mockUseAuth.mockReturnValue({ ...auth, userInfo: { ...auth.userInfo, name: 'Student 1' } });
    await render(); window.dispatchEvent(new Event('elikha-ar-model-library-updated'));
    expect(mockMount).toHaveBeenCalledTimes(1); expect(mockRefresh).toHaveBeenCalledTimes(1);
    const latest = mockProps.mock.calls.at(-1)[0];
    expect(latest.modelConfigs).toBe(initial.modelConfigs); expect(latest.allowedObjectIds).toBe(initial.allowedObjectIds);
  });
  it('does not show the previous account scene after an account switch', async () => {
    await render(); mockUseAuth.mockReturnValue({ ...auth, userInfo: { id: 'student-2', role: 'student' } }); await render();
    expect(container.querySelector('[data-testid="ar"]')).toBeNull();
  });
  it('returns to the native app through its exit bridge', async () => {
    window.ElikhaMobile = { postMessage: jest.fn() }; await render();
    await act(async () => container.querySelector('button').click());
    expect(JSON.parse(window.ElikhaMobile.postMessage.mock.calls[0][0])).toEqual({ type: 'exit', source: 'sandbox' });
  });
  it('supports existing APK links without studentId, still using the verified identity', async () => {
    window.history.replaceState({}, '', '/sandbox?mobile=1&autostart=1&model=torii-shrine-1&difficulty=advanced');
    await render(); expect(mockProps.mock.calls.at(-1)[0].sandboxDifficulty).toBe('advanced');
  });
  it('rejects incomplete links without falling back to a default model', async () => {
    window.history.replaceState({}, '', '/sandbox?mobile=1&autostart=1'); await render();
    expect(container.textContent).toContain('link is incomplete'); expect(mockRefresh).not.toHaveBeenCalled();
  });
});
