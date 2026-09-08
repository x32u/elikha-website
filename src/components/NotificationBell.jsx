import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getUnreadNotificationCount,
  listNotifications,
  markNotificationRead,
  subscribeToNotifications,
} from '../services/notificationApi';
import './NotificationBell.css';

const isSafeInternalPath = (value) =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');

const formatNotificationTime = (value) => {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Recently';
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(value).toLocaleDateString();
};

const sortNotifications = (items) =>
  [...items].sort((left, right) => new Date(right.created_at) - new Date(left.created_at));

function NotificationBell({ inline = false }) {
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const userInfo = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem('userInfo') || '{}');
    } catch {
      return {};
    }
  }, []);

  const loadRecent = useCallback(async () => {
    if (!userInfo.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [notificationResult, countResult] = await Promise.all([
      listNotifications(userInfo.id, { limit: 5 }),
      getUnreadNotificationCount(userInfo.id),
    ]);
    if (notificationResult.success) {
      setNotifications(sortNotifications(notificationResult.data || []));
      setError('');
    } else {
      setError(notificationResult.error || 'Could not load notifications.');
    }
    if (countResult.success) setUnreadCount(countResult.count || 0);
    setLoading(false);
  }, [userInfo.id]);

  useEffect(() => {
    loadRecent();
    const unsubscribe = subscribeToNotifications(userInfo.id, loadRecent);
    const refresh = () => loadRecent();
    window.addEventListener('elikha-notifications-changed', refresh);
    return () => {
      unsubscribe();
      window.removeEventListener('elikha-notifications-changed', refresh);
    };
  }, [loadRecent, userInfo.id]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const openNotification = async (notification) => {
    if (!notification.read_at) {
      const previous = notifications;
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) => (
        item.id === notification.id ? { ...item, read_at: readAt } : item
      )));
      setUnreadCount((current) => Math.max(0, current - 1));
      const result = await markNotificationRead(notification.id, userInfo.id);
      if (!result.success) {
        setNotifications(previous);
        setUnreadCount((current) => current + 1);
      }
      else window.dispatchEvent(new Event('elikha-notifications-changed'));
    }
    setOpen(false);
    if (isSafeInternalPath(notification.action_url)) navigate(notification.action_url);
  };

  return (
    <div ref={rootRef} className={`app-notification-bell ${inline ? 'is-inline' : ''}`}>
      <button
        type="button"
        className="app-notification-bell__button"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 10a6 6 0 0 0-12 0c0 6-2.5 7-3 8h18c-.5-1-3-2-3-8Z" />
          <path d="M10 21h4" />
        </svg>
        {unreadCount > 0 && (
          <span className="app-notification-bell__badge" aria-hidden="true">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <section className="app-notification-menu" role="dialog" aria-label="Recent notifications">
          <header className="app-notification-menu__header">
            <div>
              <strong>Notifications</strong>
              <span>{unreadCount ? `${unreadCount} unread` : 'You’re all caught up'}</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close notifications">×</button>
          </header>

          <div className="app-notification-menu__list" aria-live="polite">
            {loading ? (
              <p className="app-notification-menu__state">Loading recent notifications…</p>
            ) : error ? (
              <div className="app-notification-menu__state is-error">
                <span>{error}</span>
                <button type="button" onClick={loadRecent}>Try again</button>
              </div>
            ) : notifications.length === 0 ? (
              <p className="app-notification-menu__state">New updates will appear here.</p>
            ) : notifications.map((notification) => (
              <button
                type="button"
                className={`app-notification-menu__item ${notification.read_at ? '' : 'is-unread'}`}
                key={notification.id}
                onClick={() => openNotification(notification)}
              >
                <span className="app-notification-menu__dot" aria-hidden="true" />
                <span className="app-notification-menu__copy">
                  <strong>{notification.title || 'Notification'}</strong>
                  <span>{notification.message || 'Open to view this update.'}</span>
                  <time dateTime={notification.created_at}>{formatNotificationTime(notification.created_at)}</time>
                </span>
              </button>
            ))}
          </div>

          <button
            type="button"
            className="app-notification-menu__all"
            onClick={() => {
              setOpen(false);
              navigate('/notifications');
            }}
          >
            View all notifications
          </button>
        </section>
      )}
    </div>
  );
}

export default NotificationBell;
