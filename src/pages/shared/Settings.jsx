import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { supabase } from '../../lib/supabase';
import { getUserSettings, saveUserSettings } from '../../services/userSettingsApi';
import {
  AVATAR_ACCEPT_ATTR,
  removeUserAvatar,
  resolveAvatarUrl,
  uploadUserAvatar,
  validateAvatarFile,
} from '../../services/avatarApi';
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
  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const [restrictionsOpen, setRestrictionsOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarStoredPath, setAvatarStoredPath] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  const displayName = userInfo.name || userInfo.firstName || userInfo.email?.split('@')[0] || 'User';
  const avatarInitial = displayName.charAt(0).toUpperCase();

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

  useEffect(() => {
    let cancelled = false;
    const loadAvatar = async () => {
      if (!userInfo.id) return;
      try {
        const { data, error } = await supabase
          .from('users')
          .select('avatar_url')
          .eq('id', userInfo.id)
          .single();
        if (cancelled || error) return;
        const stored = data?.avatar_url || '';
        setAvatarStoredPath(stored);
        const signed = await resolveAvatarUrl(stored);
        if (!cancelled) setAvatarUrl(signed);
      } catch {
        // fall back to initials
      }
    };
    loadAvatar();
    return () => {
      cancelled = true;
    };
  }, [userInfo.id]);

  const handleAvatarPick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !userInfo.id) return;
    const check = validateAvatarFile(file);
    if (!check.valid) {
      setAvatarError(check.error);
      return;
    }
    setAvatarError('');
    setAvatarBusy(true);
    try {
      const { path, signedUrl } = await uploadUserAvatar(userInfo.id, file);
      setAvatarStoredPath(path);
      setAvatarUrl(signedUrl);
      window.dispatchEvent(new Event('elikha-profile-updated'));
    } catch (uploadError) {
      setAvatarError(uploadError?.message || 'Failed to upload the profile picture.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleAvatarRemove = async () => {
    if (!userInfo.id) return;
    setAvatarBusy(true);
    setAvatarError('');
    try {
      await removeUserAvatar(userInfo.id, avatarStoredPath);
      setAvatarStoredPath('');
      setAvatarUrl('');
      window.dispatchEvent(new Event('elikha-profile-updated'));
    } catch (removeError) {
      setAvatarError(removeError?.message || 'Failed to remove the profile picture.');
    } finally {
      setAvatarBusy(false);
    }
  };

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

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      sessionStorage.removeItem('userInfo');
      window.dispatchEvent(new Event('elikha-auth-changed'));
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="settings-page-container student-shell">
      <main className="settings-page">
        <h1 className="settings-page-title">Settings</h1>

        <section className="settings-panel">
          {status && <div className={`settings-status ${status.type}`}>{status.text}</div>}

          <div className="settings-card">
            <div className="card-title">Profile Picture</div>
            {avatarError && <div className="settings-status error">{avatarError}</div>}
            <div className="settings-avatar-row">
              <div className="settings-avatar-preview" aria-hidden="true">
                {avatarUrl ? (
                  <img className="settings-avatar-img" src={avatarUrl} alt={`${displayName} profile`} />
                ) : (
                  <span className="settings-avatar-initial">{avatarInitial}</span>
                )}
              </div>
              <div className="settings-avatar-controls">
                <div className="settings-avatar-buttons">
                  <label className={`settings-btn primary ${avatarBusy ? 'disabled' : ''}`}>
                    {avatarBusy ? 'Working…' : avatarUrl ? 'Change photo' : 'Upload photo'}
                    <input
                      type="file"
                      accept={AVATAR_ACCEPT_ATTR}
                      onChange={handleAvatarPick}
                      disabled={avatarBusy}
                      hidden
                    />
                  </label>
                  {avatarUrl && (
                    <button
                      className="settings-btn ghost"
                      type="button"
                      onClick={handleAvatarRemove}
                      disabled={avatarBusy}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="settings-help">PNG, JPG, or WebP up to 2 MB. Shown across your profile.</p>
              </div>
            </div>
          </div>

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
            <div className="settings-row">
              <div>
                <p className="settings-label">Voice Instructions &amp; Audio Guides</p>
                <p className="settings-help">
                  Read activity steps and confirm AR actions aloud, including selected colors and tools.
                </p>
              </div>
              <button
                className={`toggle ${settings.voiceInstructions ? 'active' : ''}`}
                type="button"
                aria-label="Voice instructions and audio guides"
                aria-pressed={settings.voiceInstructions}
                disabled={loading}
                onClick={() => updateSetting('voiceInstructions', !settings.voiceInstructions)}
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

          <section className="settings-card requirements-card" aria-labelledby="system-requirements-title">
            <button className="settings-card-toggle" type="button" onClick={() => setRequirementsOpen((open) => !open)} aria-expanded={requirementsOpen} aria-controls="system-requirements-content">
              <span className="card-title" id="system-requirements-title">System Requirements</span>
              <span className="settings-card-toggle-label">{requirementsOpen ? 'Minimize' : 'Expand'} <span aria-hidden="true">{requirementsOpen ? '−' : '+'}</span></span>
            </button>
            {requirementsOpen && (
              <div id="system-requirements-content">
                <p className="requirements-intro">Use a compatible device and stable internet connection for the best E-Likha experience.</p>
                <div className="requirements-grid">
                  <div className="requirements-column">
                    <h2>Mobile App</h2>
                    <p><strong>Minimum</strong></p>
                    <ul>
                      <li><strong>Lowest supported version:</strong> Android 10 (API level 29) or later</li>
                      <li>4 GB RAM</li>
                      <li>720 × 1280 screen resolution</li>
                      <li>Working rear camera</li>
                      <li>Stable Wi-Fi or mobile data</li>
                    </ul>
                    <p className="requirements-note">Android 9 and earlier are not supported. Camera permission is required for AR activities. Low-spec phones may experience lag or unreliable hand tracking.</p>
                  </div>
                  <div className="requirements-column">
                    <h2>Website</h2>
                    <p><strong>Minimum</strong></p>
                    <ul>
                      <li>Current Chrome, Edge, Firefox, or Safari</li>
                      <li>4 GB RAM</li>
                      <li>WebGL-enabled graphics</li>
                      <li>720 × 1280 screen resolution</li>
                      <li>Stable Wi-Fi or broadband connection</li>
                    </ul>
                    <p className="requirements-note">A webcam and browser camera permission are required only for AR activities. Desktop or tablet is recommended for teacher and admin tools.</p>
                  </div>
                </div>
                <p className="requirements-warning">Unsupported devices may not be able to use AR, 3D models, hand gestures, painting tools, or AR submission capture.</p>
              </div>
            )}
          </section>

          <section className="settings-card restrictions-card" aria-labelledby="application-restrictions-title">
            <button className="settings-card-toggle" type="button" onClick={() => setRestrictionsOpen((open) => !open)} aria-expanded={restrictionsOpen} aria-controls="application-restrictions-content">
              <span className="card-title" id="application-restrictions-title">Application Restrictions</span>
              <span className="settings-card-toggle-label">{restrictionsOpen ? 'Minimize' : 'Expand'} <span aria-hidden="true">{restrictionsOpen ? '−' : '+'}</span></span>
            </button>
            {restrictionsOpen && (
              <div className="restrictions-grid" id="application-restrictions-content">
                <div className="restriction-section">
                <h2>Mobile Application</h2>
                <ul>
                  <li>Intended for smartphones and requires internet access for accounts, activities, saved progress, submissions, and online content.</li>
                  <li>Camera permission is required when opening an AR activity.</li>
                  <li>A working rear camera is required for mobile AR; E-Likha uses the environment-facing camera.</li>
                  <li>Phones with insufficient memory or processing power may load slowly, lag, or provide unstable AR and hand-gesture detection.</li>
                  <li>If camera permission is denied, the learner cannot start AR activities.</li>
                  <li>Without internet, login, activity retrieval, saving work, submissions, and AI checking are unavailable.</li>
                  <li>AR may not work correctly if the camera is unavailable or the phone does not support the needed 3D graphics capability.</li>
                </ul>
                <p className="restriction-note"><strong>AR-dependent features:</strong> camera view, gesture tracking, 3D object movement, painting, and submission capture.</p>
              </div>
                <div className="restriction-section">
                <h2>Website</h2>
                <ul>
                  <li>Requires a modern browser with JavaScript enabled.</li>
                  <li>Requires stable internet for login, activities, progress tracking, saving, submissions, dashboards, and cloud-based records.</li>
                  <li>Browser-based AR requires a webcam and browser camera permission.</li>
                  <li>The browser must support camera access and WebGL/3D rendering for AR, 3D models, and hand tracking.</li>
                  <li>The website is responsive for mobile, tablet, and desktop screens; teacher and admin pages are better suited to tablets, laptops, or desktops.</li>
                  <li>Outdated browsers, unavailable WebGL, blocked camera access, or low graphics performance can prevent AR, 3D models, hand gestures, painting, and AR submission capture from working.</li>
                </ul>
                </div>
              </div>
            )}
          </section>

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
