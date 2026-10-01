import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ModelLibraryEffects from './ModelLibraryEffects';
const mockRefresh = jest.fn();
const mockReplace = jest.fn();
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ status: 'authenticated', userInfo: { id: 'student-1' } }) }));
jest.mock('../services/r2ModelApi', () => ({ refreshR2ModelLibrary: (...args) => mockRefresh(...args) }));
jest.mock('../utils/activityArConfig', () => ({ replaceR2ArModelLibrary: (...args) => mockReplace(...args) }));

let root;
let container;
beforeEach(() => {
  jest.clearAllMocks(); mockRefresh.mockResolvedValue([]);
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  global.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => { act(() => root.unmount()); container.remove(); window.history.replaceState({}, '', '/'); delete global.IS_REACT_ACT_ENVIRONMENT; });
test('native auto-launch owns catalog loading instead of launching a competing background request', async () => {
  window.history.replaceState({}, '', '/sandbox?mobile=1&autostart=1&model=torii');
  await act(async () => root.render(<ModelLibraryEffects />));
  window.dispatchEvent(new Event('focus'));
  expect(mockReplace).toHaveBeenCalledWith([], 'student-1'); expect(mockRefresh).not.toHaveBeenCalled();
});
test('ordinary web Sandbox still loads and refreshes on focus', async () => {
  window.history.replaceState({}, '', '/sandbox');
  await act(async () => root.render(<ModelLibraryEffects />));
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(mockRefresh).toHaveBeenCalledTimes(2);
});
