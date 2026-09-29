import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AdminDashboard from './AdminDashboard';
import SuperAdminDashboard from '../superadmin/SuperAdminDashboard';

const mockStorage = jest.fn();
jest.mock('./components/AdminShell', () => ({ children }) => <main>{children}</main>);
jest.mock('../../services/adminApi', () => ({
  fetchAdminDashboardData: async () => ({ success: true, data: {
    metrics: {}, trend: { weekLabels: [], newUsersByWeek: [], submissionsByWeek: [] }, recentSubmissions: [],
  } }),
  fetchAdminStorageUsage: (...args) => mockStorage(...args),
  createAdminActivity: jest.fn(),
}));
jest.mock('../../services/rubricApi', () => ({ getActivityRubricOptions: jest.fn() }));
jest.mock('../../utils/activityArConfig', () => ({
  AR_MODEL_LIBRARY_UPDATED_EVENT: 'models-updated', DEFAULT_MODEL_ID: 'cube',
  DEFAULT_PUZZLE_PIECES: 4, PUZZLE_PIECE_OPTIONS: [4], getArRenderableModelLibrary: () => [],
}));

describe.each([['admin', AdminDashboard], ['superadmin', SuperAdminDashboard]])('%s storage dashboard', (_, Component) => {
  let root; let container;
  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete global.IS_REACT_ACT_ENVIRONMENT;
  });
  test('renders uncapped storage without formatting a null percentage', async () => {
    mockStorage.mockResolvedValue({ success: true, data: {
      usedBytes: 90000000, capacityBytes: null, usedPercent: null, remainingBytes: null,
      fileCount: 20, models: { totalLibraryCount: 42 },
    } });
    await act(async () => root.render(<Component />));
    expect(container.querySelector('.storage-heading').textContent).toBe('90 MB');
    expect(container.textContent).toContain('No app-level cap');
    expect(container.textContent).not.toContain('Remaining storage');
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    expect(container.textContent).toContain('System Analytics');
  });
  test('keeps dashboard visible when storage fails', async () => {
    mockStorage.mockResolvedValue({ success: false, error: 'Storage request failed. Retry.' });
    await act(async () => root.render(<Component />));
    expect(container.textContent).toContain('Usage unavailable');
    expect(container.textContent).toContain('Storage request failed. Retry.');
    expect(container.textContent).toContain('System Analytics');
  });
});
