import { supabase } from '../lib/supabase';

const NOTIFICATIONS_TABLE = 'notifications';
const PREFERENCES_TABLE = 'notification_preferences';

export const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  in_app_enabled: true,
  email_enabled: true,
  activity_assigned: true,
  grade_posted: true,
  due_soon: true,
  missing_work: true,
  account_updates: true,
});

const PREFERENCE_FIELDS = Object.keys(DEFAULT_NOTIFICATION_PREFERENCES);

const normalizePreferences = (preferences = {}) =>
  PREFERENCE_FIELDS.reduce(
    (result, field) => ({
      ...result,
      [field]:
        typeof preferences[field] === 'boolean'
          ? preferences[field]
          : DEFAULT_NOTIFICATION_PREFERENCES[field],
    }),
    {}
  );

const failure = (error, fallbackMessage) => ({
  success: false,
  error: error?.message || fallbackMessage,
  code: error?.code || null,
});

export const listNotifications = async (recipientId, { limit = 100 } = {}) => {
  if (!recipientId) return failure(null, 'Sign in to view notifications.');

  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const { data, error } = await supabase
    .from(NOTIFICATIONS_TABLE)
    .select(
      'id, recipient_id, type, title, message, action_url, metadata, read_at, created_at'
    )
    .eq('recipient_id', recipientId)
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) return failure(error, 'Unable to load notifications.');
  return { success: true, data: data || [] };
};

export const getUnreadNotificationCount = async (recipientId) => {
  if (!recipientId) return { success: true, count: 0 };

  const { count, error } = await supabase
    .from(NOTIFICATIONS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', recipientId)
    .is('read_at', null);

  if (error) return { ...failure(error, 'Unable to load the unread count.'), count: 0 };
  return { success: true, count: count || 0 };
};

// The RPC is authenticated and derives the recipient from auth.uid(). It is
// intentionally best-effort so a temporary reminder refresh issue never hides
// notifications that are already stored.
export const refreshMyActivityReminders = async () => {
  const { data, error } = await supabase.rpc('refresh_my_activity_reminders');
  if (error) return failure(error, 'Unable to refresh activity reminders.');
  return { success: true, data };
};

export const markNotificationRead = async (notificationId, recipientId) => {
  if (!notificationId || !recipientId) {
    return failure(null, 'A notification and signed-in user are required.');
  }

  const readAt = new Date().toISOString();
  const { data, error } = await supabase
    .from(NOTIFICATIONS_TABLE)
    .update({ read_at: readAt })
    .eq('id', notificationId)
    .eq('recipient_id', recipientId)
    .is('read_at', null)
    .select('id, read_at')
    .maybeSingle();

  if (error) return failure(error, 'Unable to mark the notification as read.');
  return { success: true, data: data || { id: notificationId, read_at: readAt } };
};

export const markAllNotificationsRead = async (recipientId) => {
  if (!recipientId) return failure(null, 'Sign in to update notifications.');

  const readAt = new Date().toISOString();
  const { data, error } = await supabase
    .from(NOTIFICATIONS_TABLE)
    .update({ read_at: readAt })
    .eq('recipient_id', recipientId)
    .is('read_at', null)
    .select('id');

  if (error) return failure(error, 'Unable to mark all notifications as read.');
  return { success: true, data: data || [], readAt };
};

export const getNotificationPreferences = async (userId) => {
  if (!userId) {
    return {
      success: true,
      data: { ...DEFAULT_NOTIFICATION_PREFERENCES },
      source: 'default',
    };
  }

  const { data, error } = await supabase
    .from(PREFERENCES_TABLE)
    .select(
      'user_id, in_app_enabled, email_enabled, activity_assigned, grade_posted, due_soon, missing_work, account_updates, updated_at'
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return { ...failure(error, 'Unable to load notification preferences.'), data: null };

  return {
    success: true,
    data: normalizePreferences(data || DEFAULT_NOTIFICATION_PREFERENCES),
    source: data ? 'database' : 'default',
  };
};

export const saveNotificationPreferences = async (userId, preferences) => {
  if (!userId) return failure(null, 'Sign in to save notification preferences.');

  const normalized = normalizePreferences(preferences);
  const { data, error } = await supabase
    .from(PREFERENCES_TABLE)
    .upsert(
      {
        user_id: userId,
        ...normalized,
      },
      { onConflict: 'user_id' }
    )
    .select(
      'user_id, in_app_enabled, email_enabled, activity_assigned, grade_posted, due_soon, missing_work, account_updates, updated_at'
    )
    .single();

  if (error) return failure(error, 'Unable to save notification preferences.');
  return { success: true, data: normalizePreferences(data) };
};

export const subscribeToNotifications = (recipientId, onChange, onStatus) => {
  if (!recipientId || typeof onChange !== 'function') return () => {};

  const channel = supabase
    .channel(`notifications:${recipientId}:${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: NOTIFICATIONS_TABLE,
        filter: `recipient_id=eq.${recipientId}`,
      },
      onChange
    )
    .subscribe((status) => {
      if (typeof onStatus === 'function') onStatus(status);
    });

  return () => {
    supabase.removeChannel(channel);
  };
};
