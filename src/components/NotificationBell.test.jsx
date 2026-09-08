import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import NotificationBell from './NotificationBell';

const mockNavigate = jest.fn();
const mockListNotifications = jest.fn();
const mockGetUnreadNotificationCount = jest.fn();
const mockMarkNotificationRead = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('../services/notificationApi', () => ({
  listNotifications: (...args) => mockListNotifications(...args),
  getUnreadNotificationCount: (...args) => mockGetUnreadNotificationCount(...args),
  markNotificationRead: (...args) => mockMarkNotificationRead(...args),
  subscribeToNotifications: () => jest.fn(),
}));

describe('NotificationBell', () => {
  let container;
  let root;

  beforeEach(() => {
    sessionStorage.setItem('userInfo', JSON.stringify({ id: 'user-1', role: 'student' }));
    mockListNotifications.mockResolvedValue({
      success: true,
      data: [{
        id: 'notification-1',
        title: 'Activity reviewed',
        message: 'Your teacher reviewed your work.',
        action_url: '/activity/activity-1',
        read_at: null,
        created_at: new Date().toISOString(),
      }],
    });
    mockGetUnreadNotificationCount.mockResolvedValue({ success: true, count: 7 });
    mockMarkNotificationRead.mockResolvedValue({ success: true, data: {} });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    global.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    sessionStorage.clear();
    jest.clearAllMocks();
    delete global.IS_REACT_ACT_ENVIRONMENT;
  });

  test('shows the true unread count and opens the recent notification menu', async () => {
    await act(async () => {
      root.render(<NotificationBell />);
    });

    const bell = container.querySelector('.app-notification-bell__button');
    expect(bell.getAttribute('aria-label')).toBe('Notifications, 7 unread');

    await act(async () => {
      bell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Activity reviewed');
    expect(container.textContent).toContain('View all notifications');
  });

  test('marks an opened notification read and follows its internal action', async () => {
    await act(async () => {
      root.render(<NotificationBell />);
    });
    await act(async () => {
      container.querySelector('.app-notification-bell__button')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      container.querySelector('.app-notification-menu__item')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockMarkNotificationRead).toHaveBeenCalledWith('notification-1', 'user-1');
    expect(mockNavigate).toHaveBeenCalledWith('/activity/activity-1');
  });
});
