import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Homepage from './Homepage';
import {
  getDashboardStats,
  getRecentSubmissions,
  getTeacherClasses,
} from '../../services/teacherApi';

jest.mock('../../components/Navbar', () => () => <nav aria-label="Primary" />);
jest.mock('react-router-dom', () => ({
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
}));
jest.mock('../../services/teacherApi', () => ({
  getDashboardStats: jest.fn(),
  getRecentSubmissions: jest.fn(),
  getTeacherClasses: jest.fn(),
}));
jest.mock('../../services/classImageApi', () => ({
  resolveClassImageUrl: jest.fn(() => Promise.resolve('')),
}));

describe('Teacher homepage', () => {
  test('renders the dashboard summary as accessible charts and task links', async () => {
    getTeacherClasses.mockResolvedValue({ success: true, data: [] });
    getDashboardStats.mockResolvedValue({
      success: true,
      data: {
        totalStudents: 12,
        pendingReviews: 3,
        upcomingDeadlines: 2,
        parentAlerts: 1,
      },
    });
    getRecentSubmissions.mockResolvedValue({ success: true, data: [] });
    sessionStorage.setItem('userInfo', JSON.stringify({ id: 'teacher-1', name: 'Mrs. Silamor' }));

    const container = document.createElement('div');
    const root = createRoot(container);
    global.IS_REACT_ACT_ENVIRONMENT = true;

    await act(async () => {
      root.render(<Homepage />);
    });

    expect(container.textContent).toContain('Workload at a glance');
    expect(container.querySelector('[role="img"]')?.getAttribute('aria-label'))
      .toContain('6 actionable items');
    expect(container.querySelector('a[aria-label^="Students:"]')?.getAttribute('href'))
      .toBe('/students');
    expect(container.querySelector('a[href="/reviews"]')).not.toBeNull();

    act(() => root.unmount());
    sessionStorage.clear();
    delete global.IS_REACT_ACT_ENVIRONMENT;
  });
});
