import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import AdminReports from './AdminReports';

const mockFetchAdminAnalytics = jest.fn();

jest.mock('./components/AdminShell', () => ({ children }) => <main>{children}</main>);
jest.mock('../../services/adminApi', () => ({
  fetchAdminAnalytics: (...args) => mockFetchAdminAnalytics(...args),
}));

const createAnalytics = () => ({
  summary: {
    totalUsers: 2,
    totalActivities: 12,
    totalAssignments: 12,
    totalSubmissions: 0,
    reviewedSubmissions: 0,
    averageScore: null,
    classesCount: 1,
    pendingReviews: 0,
    missing: 12,
    completionRate: 0,
    reviewRate: null,
    onTimeRate: null,
  },
  activityPerformance: Array.from({ length: 12 }, (_, index) => ({
    activity_id: `activity-${index + 1}`,
    activity_title: `Activity ${String(index + 1).padStart(2, '0')}`,
    completion_rate: 0,
    assigned: 1,
    submissions: 0,
    pending_review: 0,
    missing: 1,
    average_score: null,
  })),
  studentEngagement: [],
  engagedStudentCount: 0,
  teacherPerformance: [],
  modelUsage: [],
  submissionTrend: [],
  dataQuality: {},
});

const setInputValue = (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('AdminReports activity pagination', () => {
  let container;
  let root;

  beforeEach(() => {
    mockFetchAdminAnalytics.mockResolvedValue({ success: true, data: createAnalytics() });
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

  const renderReports = async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <AdminReports role="Admin" />
        </MemoryRouter>
      );
    });
  };

  it('shows 10 rows initially and moves through the remaining rows', async () => {
    await renderReports();

    expect(container.querySelectorAll('.rpt-table tbody tr')).toHaveLength(10);
    expect(container.textContent).toContain('Showing 1–10 of 12 activities');

    const nextButton = [...container.querySelectorAll('.rpt-pagination button')]
      .find((button) => button.textContent.trim() === 'Next');
    await act(async () => nextButton.click());

    expect(container.querySelectorAll('.rpt-table tbody tr')).toHaveLength(2);
    expect(container.textContent).toContain('Showing 11–12 of 12 activities');
    expect(container.textContent).toContain('Activity 12');
  });

  it('filters by activity name and resets the result to page 1', async () => {
    await renderReports();

    const search = container.querySelector('input[name="activity-search"]');
    await act(async () => setInputValue(search, 'Activity 12'));

    expect(container.querySelectorAll('.rpt-table tbody tr')).toHaveLength(1);
    expect(container.textContent).toContain('Showing 1–1 of 1 activities');
    expect(container.textContent).toContain('Activity 12');
    expect(container.textContent).not.toContain('Activity 01');
  });
});
