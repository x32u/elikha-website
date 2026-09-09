import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import SuperAdminAudit from './SuperAdminAudit';

const mockFetchSuperAdminAuditEvents = jest.fn();

jest.mock('../admin/components/AdminShell', () => ({ children }) => <main>{children}</main>);
jest.mock('../../services/adminApi', () => ({
  fetchSuperAdminAuditEvents: (...args) => mockFetchSuperAdminAuditEvents(...args),
}));

describe('SuperAdminAudit presentation', () => {
  let container;
  let root;

  beforeEach(() => {
    mockFetchSuperAdminAuditEvents.mockResolvedValue({
      success: true,
      data: [{
        id: 'audit-1',
        user: 'Teacher One',
        role: 'Teacher',
        action: 'Activity created',
        timestamp: '2026-09-08T06:07:00Z',
        details: 'Created the Lantern activity.',
      }],
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    global.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete global.IS_REACT_ACT_ENVIRONMENT;
    jest.clearAllMocks();
  });

  it('uses the designed action and event pill styles and opens structured details', async () => {
    await act(async () => root.render(<SuperAdminAudit />));

    const viewButton = container.querySelector('.saud-view');
    expect(viewButton).not.toBeNull();
    expect(container.querySelector('.saud-actionpill.success')).not.toBeNull();

    await act(async () => viewButton.click());

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.querySelectorAll('.saud-detailrow')).toHaveLength(5);
    expect(container.textContent).toContain('Created the Lantern activity.');
  });
});
