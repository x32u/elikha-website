import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  getNotificationPreferences,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  refreshMyActivityReminders,
  saveNotificationPreferences,
  subscribeToNotifications,
} from '../../services/notificationApi';
import './Notifications.css';

const FILTER_OPTIONS = [
  { value: 'all', label: 'All notifications' },
  { value: 'unread', label: 'Unread' },
  { value: 'activities', label: 'Activities' },
  { value: 'grades', label: 'Grades and feedback' },
  { value: 'reminders', label: 'Due and missing work' },
  { value: 'account', label: 'Account updates' },
];

const PREFERENCE_OPTIONS = [
  {
    key: 'activity_assigned',
    label: 'New activities',
    help: 'When an activity is assigned to your child.',
  },
  {
    key: 'grade_posted',
    label: 'Grades and feedback',
    help: 'When a teacher reviews and grades submitted work.',
  },
  {
    key: 'due_soon',
    label: 'Activities due soon',
    help: 'Reminders before an activity deadline.',
  },
  {
    key: 'missing_work',
    label: 'Missing activities',
    help: 'When an activity passes its deadline without a submission.',
  },
  {
    key: 'account_updates',
    label: 'Account updates',
    help:
      'Registration, linked-student, and general account notices. Required OTP, recovery, and security emails are always sent.',
  },
];

const normalizeType = (type) => String(type || '').trim().toLowerCase();

const getNotificationCategory = (type) => {
  const normalized = normalizeType(type);
  if (/grade|score|review|feedback/.test(normalized)) return 'grades';
  if (/due|missing|overdue|reminder/.test(normalized)) return 'reminders';
  if (/account|registration|registered|password|otp|link|welcome/.test(normalized)) return 'account';
  return 'activities';
};

const getIconType = (type) => {
  const normalized = normalizeType(type);
  if (/achievement|award|completed/.test(normalized)) return 'achievement';
  const category = getNotificationCategory(normalized);
  if (category === 'grades') return 'feedback';
  if (category === 'reminders') return 'reminder';
  if (category === 'account') return 'account';
  return 'activity';
};

const formatRelativeTime = (value) => {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Recently';

  const deltaSeconds = Math.round((timestamp - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(deltaSeconds);
  if (absoluteSeconds < 45) return 'Just now';

  const units = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  const [unit, seconds] = units.find(([, size]) => absoluteSeconds >= size) || ['minute', 60];
  const amount = Math.round(deltaSeconds / seconds);

  try {
    return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(amount, unit);
  } catch {
    return new Date(value).toLocaleString();
  }
};

const isSafeInternalPath = (value) =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');

const mergeNotificationRows = (current, incoming) => {
  const byId = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => {
    const existing = byId.get(item.id);
    byId.set(item.id, {
      ...(existing || {}),
      ...item,
      read_at: existing?.read_at || item.read_at || null,
    });
  });
  return [...byId.values()].sort(
    (left, right) => new Date(right.created_at) - new Date(left.created_at)
  );
};

const reconcileNotificationRows = (current, fetched) => {
  const currentById = new Map(current.map((item) => [item.id, item]));
  return fetched
    .map((item) => ({
      ...item,
      read_at: currentById.get(item.id)?.read_at || item.read_at || null,
    }))
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at));
};

const NotificationIcon = ({ type }) => {
  if (type === 'feedback') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6A8.4 8.4 0 0 1 12.5 3h.5a8.5 8.5 0 0 1 8 8v.5Z" />
      </svg>
    );
  }

  if (type === 'reminder') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </svg>
    );
  }

  if (type === 'achievement') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 3.5 2.2 4.4 4.8.7-3.5 3.4.8 4.8-4.3-2.3-4.3 2.3.8-4.8L5 8.6l4.8-.7L12 3.5Z" />
      </svg>
    );
  }

  if (type === 'account') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c.5-4 3.4-6 7-6s6.5 2 7 6" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 4.5h12a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z" />
      <path d="M9 8.5h6M9 12h6M9 15.5h3" />
    </svg>
  );
};

const Notifications = () => {
  const navigate = useNavigate();
  const userInfo = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem('userInfo') || '{}');
    } catch {
      return {};
    }
  }, []);
  const role = String(userInfo.role || '').toLowerCase().replace(/[_\s-]/g, '');
  const isTeacher = role === 'teacher';
  const isParent = role === 'parent';

  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingAll, setUpdatingAll] = useState(false);
  const [error, setError] = useState('');
  const [liveStatus, setLiveStatus] = useState('CONNECTING');
  const [preferences, setPreferences] = useState({ ...DEFAULT_NOTIFICATION_PREFERENCES });
  const [preferencesLoading, setPreferencesLoading] = useState(isParent);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [preferencesStatus, setPreferencesStatus] = useState(null);

  const loadNotifications = useCallback(
    async ({ quiet = false } = {}) => {
      if (quiet) setRefreshing(true);
      else setLoading(true);
      setError('');

      await refreshMyActivityReminders();
      const result = await listNotifications(userInfo.id);
      if (result.success) {
        setNotifications((current) => reconcileNotificationRows(current, result.data));
      }
      else setError(result.error || 'Unable to load notifications.');

      setLoading(false);
      setRefreshing(false);
    },
    [userInfo.id]
  );

  useEffect(() => {
    let cancelled = false;

    const initialLoad = async () => {
      setLoading(true);
      await refreshMyActivityReminders();
      const result = await listNotifications(userInfo.id);
      if (cancelled) return;
      if (result.success) {
        setNotifications((current) => reconcileNotificationRows(current, result.data));
      }
      else setError(result.error || 'Unable to load notifications.');
      setLoading(false);
    };

    initialLoad();

    const unsubscribe = subscribeToNotifications(
      userInfo.id,
      (payload) => {
        if (payload.eventType === 'INSERT' && payload.new) {
          setNotifications((current) => mergeNotificationRows(current, [payload.new]));
        } else if (payload.eventType === 'UPDATE' && payload.new) {
          setNotifications((current) =>
            current.map((item) => (item.id === payload.new.id ? { ...item, ...payload.new } : item))
          );
        } else if (payload.eventType === 'DELETE' && payload.old) {
          setNotifications((current) => current.filter((item) => item.id !== payload.old.id));
        }
        window.dispatchEvent(new Event('elikha-notifications-changed'));
      },
      setLiveStatus
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [userInfo.id]);

  useEffect(() => {
    if (!isParent) {
      setPreferencesLoading(false);
      return undefined;
    }

    let cancelled = false;
    const loadPreferences = async () => {
      setPreferencesLoading(true);
      const result = await getNotificationPreferences(userInfo.id);
      if (cancelled) return;
      if (result.success) setPreferences(result.data);
      else setPreferencesStatus({ type: 'error', text: result.error });
      setPreferencesLoading(false);
    };
    loadPreferences();

    return () => {
      cancelled = true;
    };
  }, [isParent, userInfo.id]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read_at).length,
    [notifications]
  );

  const filteredNotifications = useMemo(() => {
    if (filter === 'all') return notifications;
    if (filter === 'unread') return notifications.filter((notification) => !notification.read_at);
    return notifications.filter(
      (notification) => getNotificationCategory(notification.type) === filter
    );
  }, [filter, notifications]);

  const markOneRead = async (notification) => {
    if (notification.read_at) return true;

    const optimisticReadAt = new Date().toISOString();
    setNotifications((current) =>
      current.map((item) =>
        item.id === notification.id ? { ...item, read_at: optimisticReadAt } : item
      )
    );
    window.dispatchEvent(new Event('elikha-notifications-changed'));

    const result = await markNotificationRead(notification.id, userInfo.id);
    if (!result.success) {
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, read_at: notification.read_at || null } : item
        )
      );
      setError(result.error || 'Unable to mark the notification as read.');
      window.dispatchEvent(new Event('elikha-notifications-changed'));
      return false;
    }
    window.dispatchEvent(new Event('elikha-notifications-changed'));
    return true;
  };

  const openNotification = async (notification) => {
    await markOneRead(notification);
    if (isSafeInternalPath(notification.action_url)) navigate(notification.action_url);
  };

  const handleMarkAllRead = async () => {
    if (!unreadCount || updatingAll) return;

    const previous = notifications;
    const optimisticReadAt = new Date().toISOString();
    setUpdatingAll(true);
    setNotifications((current) =>
      current.map((notification) => ({
        ...notification,
        read_at: notification.read_at || optimisticReadAt,
      }))
    );
    window.dispatchEvent(new Event('elikha-notifications-changed'));

    const result = await markAllNotificationsRead(userInfo.id);
    if (!result.success) {
      const previousReadById = new Map(previous.map((item) => [item.id, item.read_at || null]));
      setNotifications((current) =>
        current.map((item) =>
          previousReadById.has(item.id)
            ? { ...item, read_at: previousReadById.get(item.id) }
            : item
        )
      );
      setError(result.error || 'Unable to mark all notifications as read.');
      window.dispatchEvent(new Event('elikha-notifications-changed'));
    }
    if (result.success) window.dispatchEvent(new Event('elikha-notifications-changed'));
    setUpdatingAll(false);
  };

  const togglePreference = (key) => {
    setPreferencesStatus(null);
    setPreferences((current) => ({ ...current, [key]: !current[key] }));
  };

  const handleSavePreferences = async () => {
    setPreferencesSaving(true);
    setPreferencesStatus(null);
    const result = await saveNotificationPreferences(userInfo.id, preferences);
    setPreferencesSaving(false);

    if (result.success) {
      setPreferences(result.data);
      setPreferencesStatus({ type: 'success', text: 'Notification preferences saved.' });
      await loadNotifications({ quiet: true });
      window.dispatchEvent(new Event('elikha-notifications-changed'));
    } else {
      setPreferencesStatus({
        type: 'error',
        text: result.error || 'Unable to save notification preferences.',
      });
    }
  };

  const layoutClass = isTeacher
    ? 'teacher-notifications'
    : isParent
    ? 'parent-notifications'
    : 'student-notifications';

  return (
    <div className={`notifications-layout ${layoutClass}`}>
      <Navbar />
      <main className="notifications-main">
        <div className="notifications-content">
          <header className="notifications-header">
            <div>
              <p className="notifications-eyebrow">
                {isParent ? 'Parent updates' : 'Your updates'}
              </p>
              <h1 className="notifications-title">Notifications</h1>
              <p className="notifications-summary" aria-live="polite">
                {loading
                  ? 'Loading your updates…'
                  : `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`}
              </p>
            </div>
            <div className="notifications-header-actions">
              <span
                className={`notifications-live ${liveStatus === 'SUBSCRIBED' ? 'connected' : ''}`}
                title={
                  liveStatus === 'SUBSCRIBED'
                    ? 'New notifications will appear automatically.'
                    : 'Connecting to live notifications.'
                }
              >
                <span aria-hidden="true" />
                {liveStatus === 'SUBSCRIBED' ? 'Live' : 'Syncing'}
              </span>
              <button
                className="notifications-secondary-button"
                type="button"
                onClick={() => loadNotifications({ quiet: true })}
                disabled={loading || refreshing}
              >
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
              <button
                className="notifications-primary-button"
                type="button"
                onClick={handleMarkAllRead}
                disabled={!unreadCount || updatingAll}
              >
                {updatingAll ? 'Updating…' : 'Mark all read'}
              </button>
            </div>
          </header>

          {error && (
            <div className="notifications-alert error" role="alert">
              <span>{error}</span>
              <button type="button" onClick={() => loadNotifications()}>
                Try again
              </button>
            </div>
          )}

          <section className="notifications-panel" aria-labelledby="notification-list-title">
            <div className="notifications-toolbar">
              <div>
                <h2 id="notification-list-title">Recent updates</h2>
                <p>{notifications.length} total</p>
              </div>
              <label className="notifications-filter">
                <span>Show</span>
                <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                  {FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {loading ? (
              <div className="notifications-state" role="status">
                <span className="notifications-spinner" aria-hidden="true" />
                <h3>Loading notifications</h3>
                <p>Your latest E-Likha updates will appear here.</p>
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="notifications-state">
                <div className="notifications-empty-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M18 10a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" />
                    <path d="M10 22h4" />
                  </svg>
                </div>
                <h3>{notifications.length ? 'No matching notifications' : 'You are all caught up'}</h3>
                <p>
                  {notifications.length
                    ? 'Choose another filter to see more updates.'
                    : isParent
                    ? 'Updates about your linked child will appear here.'
                    : 'New activities, grades, and reminders will appear here.'}
                </p>
              </div>
            ) : (
              <div className="notifications-list">
                {filteredNotifications.map((notification) => {
                  const unread = !notification.read_at;
                  const iconType = getIconType(notification.type);
                  const hasAction = isSafeInternalPath(notification.action_url);
                  return (
                    <article
                      key={notification.id}
                      className={`notification-item ${unread ? 'unread' : 'read'}`}
                    >
                      <div className={`notification-icon-wrapper ${iconType}`}>
                        <NotificationIcon type={iconType} />
                      </div>
                      <button
                        className="notification-open-button"
                        type="button"
                        onClick={() => openNotification(notification)}
                        aria-label={`${unread ? 'Unread: ' : ''}${notification.title}${
                          hasAction ? '. Open details.' : '. Mark as read.'
                        }`}
                      >
                        <span className="notification-heading-row">
                          <span className="notification-title">{notification.title}</span>
                          {unread && <span className="unread-dot" aria-label="Unread" />}
                        </span>
                        <span className="notification-message">{notification.message}</span>
                        <span className="notification-meta-row">
                          <time
                            className="notification-time"
                            dateTime={notification.created_at}
                            title={new Date(notification.created_at).toLocaleString()}
                          >
                            {formatRelativeTime(notification.created_at)}
                          </time>
                          {hasAction && <span className="notification-action-label">Open details →</span>}
                        </span>
                      </button>
                      {unread && (
                        <button
                          className="notification-read-button"
                          type="button"
                          onClick={() => markOneRead(notification)}
                          aria-label={`Mark ${notification.title} as read`}
                        >
                          Mark read
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {isParent && (
            <section className="notification-preferences" aria-labelledby="preferences-title">
              <div className="notification-preferences-heading">
                <div>
                  <p className="notifications-eyebrow">Parent delivery settings</p>
                  <h2 id="preferences-title">How should we notify you?</h2>
                  <p>Choose which child and account updates arrive in E-Likha and by email.</p>
                </div>
                <button
                  className="notifications-primary-button"
                  type="button"
                  onClick={handleSavePreferences}
                  disabled={preferencesLoading || preferencesSaving}
                >
                  {preferencesSaving ? 'Saving…' : 'Save preferences'}
                </button>
              </div>

              {preferencesStatus && (
                <div className={`notifications-alert ${preferencesStatus.type}`} role="status">
                  <span>{preferencesStatus.text}</span>
                </div>
              )}

              <div className="notification-channel-grid">
                <div className="notification-preference-row featured">
                  <div>
                    <strong>In-app notifications</strong>
                    <span>Show selected updates on this page.</span>
                  </div>
                  <button
                    className={`notification-toggle ${preferences.in_app_enabled ? 'active' : ''}`}
                    type="button"
                    aria-label="In-app notifications"
                    aria-pressed={preferences.in_app_enabled}
                    disabled={preferencesLoading || preferencesSaving}
                    onClick={() => togglePreference('in_app_enabled')}
                  >
                    <span />
                  </button>
                </div>
                <div className="notification-preference-row featured">
                  <div>
                    <strong>Email notifications</strong>
                    <span>Send selected updates to your registered email.</span>
                  </div>
                  <button
                    className={`notification-toggle ${preferences.email_enabled ? 'active' : ''}`}
                    type="button"
                    aria-label="Email notifications"
                    aria-pressed={preferences.email_enabled}
                    disabled={preferencesLoading || preferencesSaving}
                    onClick={() => togglePreference('email_enabled')}
                  >
                    <span />
                  </button>
                </div>
              </div>

              <div className="notification-event-list">
                {PREFERENCE_OPTIONS.map((option) => (
                  <div className="notification-preference-row" key={option.key}>
                    <div>
                      <strong>{option.label}</strong>
                      <span>{option.help}</span>
                    </div>
                    <button
                      className={`notification-toggle ${preferences[option.key] ? 'active' : ''}`}
                      type="button"
                      aria-label={option.label}
                      aria-pressed={preferences[option.key]}
                      disabled={preferencesLoading || preferencesSaving}
                      onClick={() => togglePreference(option.key)}
                    >
                      <span />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
};

export default Notifications;
