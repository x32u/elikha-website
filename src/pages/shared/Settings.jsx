import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { getUserSettings, saveUserSettings } from '../../services/userSettingsApi';
import { DEFAULT_USER_SETTINGS, normalizeUserSettings, storeUserSettings } from '../../utils/userSettings';
import './Settings.css';

const getNotificationPermissionLabel = () => {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'Not supported in this browser';
  if (Notification.permission === 'granted') return 'Browser permission granted';
  if (Notification.permission === 'denied') return 'Browser permission blocked';
  return 'Browser permission not requested';
};

const Settings = () => {
  const navigate = useNavigate();
  const userInfo = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem('userInfo') || '{}');
    } catch {
      return {};
    }
  }, []);

  const [settings, setSettings] = useState(() => normalizeUserSettings(DEFAULT_USER_SETTINGS));
  const [initialSettings, setInitialSettings] = useState(() => normalizeUserSettings(DEFAULT_USER_SETTINGS));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [permissionLabel, setPermissionLabel] = useState(getNotificationPermissionLabel);

  const dirty = JSON.stringify(settings) !== JSON.stringify(initialSettings);

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      setLoading(true);
      const result = await getUserSettings(userInfo.id);
      if (cancelled) return;

      const loaded = normalizeUserSettings(result.data);
      setSettings(loaded);
      setInitialSettings(loaded);
      setStatus(
        result.needsDatabaseSetup
          ? { type: 'warning', text: 'Settings are saved on this browser until the database table is configured.' }
          : !result.success
          ? { type: 'warning', text: result.error || 'Using browser-saved settings because database sync failed.' }
          : null
      );
      setPermissionLabel(getNotificationPermissionLabel());
      setLoading(false);
    };

    loadSettings();

    return () => {
      cancelled = true;
    };
  }, [userInfo.id]);

  const updateSetting = (key, value) => {
    setSettings((prev) => {
      const next = normalizeUserSettings({ ...prev, [key]: value });
      storeUserSettings(userInfo.id, next);
      return next;
    });
  };

  const requestNotificationPermission = async () => {
    if (!settings.notifications || typeof Notification === 'undefined') return true;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;

    const permission = await Notification.requestPermission();
    setPermissionLabel(getNotificationPermissionLabel());
    return permission === 'granted';
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);

    const notificationAllowed = await requestNotificationPermission();
    const result = await saveUserSettings(userInfo.id, settings);
    setSaving(false);
    setPermissionLabel(getNotificationPermissionLabel());

    if (result.success) {
      setInitialSettings(normalizeUserSettings(result.data));
      setStatus({
        type: notificationAllowed || !settings.notifications ? 'success' : 'warning',
        text:
          !notificationAllowed && settings.notifications
            ? 'Settings saved, but browser notifications are blocked. Enable them in Chrome site settings.'
            : 'Settings saved and applied.',
      });
      return;
    }

    setInitialSettings(normalizeUserSettings(result.data));
    setStatus({ type: result.needsDatabaseSetup ? 'warning' : 'error', text: result.error || 'Settings saved locally only.' });
  };

  const handleReset = () => {
    const defaults = normalizeUserSettings(DEFAULT_USER_SETTINGS);
    storeUserSettings(userInfo.id, defaults);
    setSettings(defaults);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('userInfo');
    window.dispatchEvent(new Event('elikha-auth-changed'));
    navigate('/login');
  };

  return (
    <div className="settings-page-container student-shell">
      <main className="settings-page">
        <h1 className="settings-page-title">Settings</h1>

        <section className="settings-panel">
          {status && <div className={`settings-status ${status.type}`}>{status.text}</div>}

          <div className="settings-card">
            <div className="card-title">Audio</div>
            <div className="settings-row">
              <div>
                <p className="settings-label">Background Music</p>
                <p className="settings-help">Play background music while using E-Likha.</p>
              </div>
              <button
                className={`toggle ${settings.backgroundMusic ? 'active' : ''}`}
                type="button"
                aria-pressed={settings.backgroundMusic}
                disabled={loading}
                onClick={() => updateSetting('backgroundMusic', !settings.backgroundMusic)}
              >
                <span className="toggle-handle" />
              </button>
            </div>
            <div className="settings-row">
              <div>
                <p className="settings-label">Sound Effects</p>
                <p className="settings-help">Button click sounds across the app.</p>
              </div>
              <button
                className={`toggle ${settings.soundEffects ? 'active' : ''}`}
                type="button"
                aria-pressed={settings.soundEffects}
                disabled={loading}
                onClick={() => updateSetting('soundEffects', !settings.soundEffects)}
              >
                <span className="toggle-handle" />
              </button>
            </div>
          </div>

          <div className="settings-card">
            <div className="card-title">Notifications</div>
            <div className="settings-row">
              <div>
                <p className="settings-label">Activity Reminders</p>
                <p className="settings-help">Show browser reminders for activities due soon.</p>
                <p className="settings-meta">{permissionLabel}</p>
              </div>
              <button
                className={`toggle ${settings.notifications ? 'active' : ''}`}
                type="button"
                aria-pressed={settings.notifications}
                disabled={loading}
                onClick={() => updateSetting('notifications', !settings.notifications)}
              >
                <span className="toggle-handle" />
              </button>
            </div>
          </div>

          <div className="settings-card">
            <div className="card-title">Performance</div>
            <div className="settings-row">
              <div>
                <p className="settings-label">Data Saver</p>
                <p className="settings-help">Use lightweight placeholders instead of large thumbnails.</p>
              </div>
              <button
                className={`toggle ${settings.dataSaver ? 'active' : ''}`}
                type="button"
                aria-pressed={settings.dataSaver}
                disabled={loading}
                onClick={() => updateSetting('dataSaver', !settings.dataSaver)}
              >
                <span className="toggle-handle" />
              </button>
            </div>

            <div className="settings-row select-row">
              <div>
                <p className="settings-label">Preview Quality</p>
                <p className="settings-help">Low quality disables rich preview images.</p>
              </div>
              <select
                className="settings-select"
                value={settings.quality}
                onChange={(e) => updateSetting('quality', e.target.value)}
                aria-label="Preview quality"
                disabled={loading}
              >
                <option value="auto">Auto</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div className="settings-actions">
            <button className="settings-button secondary" type="button" onClick={handleReset} disabled={loading || saving}>
              Reset Defaults
            </button>
            <button className="settings-button" type="button" onClick={handleSave} disabled={loading || saving || !dirty}>
              {saving ? 'Saving...' : dirty ? 'Save Changes' : 'Saved'}
            </button>
            <button className="settings-button danger" type="button" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </section>
      </main>
      <Navbar />
    </div>
  );
};

export default Settings;
