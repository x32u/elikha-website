import React from "react";
import "./styles/AdminSettings.css";
import AdminShell from "./components/AdminShell";
import { supabase } from "../../lib/supabase";
import { updatePlatformUser } from "../../services/adminApi";
import { getUserSettings, saveUserSettings } from "../../services/userSettingsApi";
import {
  AVATAR_ACCEPT_ATTR,
  removeUserAvatar,
  resolveAvatarUrl,
  uploadUserAvatar,
  validateAvatarFile,
} from "../../services/avatarApi";

function Settings({ onNavigate, role, onLogout }) {
  const isSuperAdmin = role === "SuperAdmin";
  const homePageKey = isSuperAdmin ? "sa-dashboard" : "homepage";
  const [allowNotifications, setAllowNotifications] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  const [profileName, setProfileName] = React.useState("Admin");
  const [savedProfileName, setSavedProfileName] = React.useState("Admin");
  const [profileEmail, setProfileEmail] = React.useState("");
  const [profileUserId, setProfileUserId] = React.useState("");
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [savingSettings, setSavingSettings] = React.useState(false);
  const [avatarUrl, setAvatarUrl] = React.useState("");
  const [avatarStoredPath, setAvatarStoredPath] = React.useState("");
  const [avatarBusy, setAvatarBusy] = React.useState(false);

  React.useEffect(() => {
    if (!toast) return undefined;
    const t = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(t);
  }, [toast]);

  React.useEffect(() => {
    const userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}");
    if (userInfo?.id) setProfileUserId(userInfo.id);
    if (typeof userInfo?.name === "string" && userInfo.name.trim()) {
      const initialName = userInfo.name.trim();
      setProfileName(initialName);
      setSavedProfileName(initialName);
    }
    if (typeof userInfo?.email === "string") {
      setProfileEmail(userInfo.email);
    }

    if (userInfo?.id) {
      getUserSettings(userInfo.id).then((result) => {
        if (result?.data && typeof result.data.notifications === "boolean") {
          setAllowNotifications(result.data.notifications);
        }
      });

      supabase
        .from("users")
        .select("avatar_url")
        .eq("id", userInfo.id)
        .single()
        .then(async ({ data, error }) => {
          if (error) return;
          const stored = data?.avatar_url || "";
          setAvatarStoredPath(stored);
          setAvatarUrl(await resolveAvatarUrl(stored));
        });
    }
  }, []);

  const handleAvatarPick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !profileUserId) return;
    const check = validateAvatarFile(file);
    if (!check.valid) {
      showToast("error", check.error);
      return;
    }
    setAvatarBusy(true);
    try {
      const { path, signedUrl } = await uploadUserAvatar(profileUserId, file);
      setAvatarStoredPath(path);
      setAvatarUrl(signedUrl);
      try {
        window.localStorage.setItem("elikha_profile_avatar", signedUrl);
      } catch {
        // ignore
      }
      window.dispatchEvent(new Event("elikha-profile-updated"));
      showToast("success", "Profile picture updated.");
    } catch (uploadError) {
      showToast("error", uploadError?.message || "Failed to upload the profile picture.");
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleAvatarRemove = async () => {
    if (!profileUserId) return;
    setAvatarBusy(true);
    try {
      await removeUserAvatar(profileUserId, avatarStoredPath);
      setAvatarStoredPath("");
      setAvatarUrl("");
      try {
        window.localStorage.removeItem("elikha_profile_avatar");
      } catch {
        // ignore
      }
      window.dispatchEvent(new Event("elikha-profile-updated"));
      showToast("success", "Profile picture removed.");
    } catch (removeError) {
      showToast("error", removeError?.message || "Failed to remove the profile picture.");
    } finally {
      setAvatarBusy(false);
    }
  };

  const showToast = (type, message) => {
    setToast({ type, message });
  };

  const handleSaveProfile = async () => {
    const name = profileName.trim();

    if (name.length < 2 || name.length > 60) {
      showToast("error", "Enter a display name between 2 and 60 characters.");
      return;
    }

    if (!profileUserId) {
      showToast("error", "Unable to find account profile.");
      return;
    }

    setSavingProfile(true);

    const result = await updatePlatformUser(profileUserId, { name });
    setSavingProfile(false);

    if (!result.success) {
      showToast("error", result.error || "Failed to update profile.");
      return;
    }

    const userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}");
    sessionStorage.setItem(
      "userInfo",
      JSON.stringify({
        ...userInfo,
        name,
      })
    );

    try {
      window.localStorage.setItem("elikha_profile_name", name);
    } catch {
      // ignore
    }
    window.dispatchEvent(new Event("elikha-profile-updated"));
    setProfileName(name);
    setSavedProfileName(name);
    showToast("success", "Profile updated.");
  };

  const handleSaveAll = async () => {
    setSavingSettings(true);
    const result = await saveUserSettings(profileUserId, {
      notifications: allowNotifications,
    });
    setSavingSettings(false);

    if (!result.success && !result.needsDatabaseSetup) {
      showToast("error", result.error || "Failed to save settings.");
      return;
    }

    showToast(result.needsDatabaseSetup ? "warning" : "success", result.error || "Settings saved.");
  };

  return (
    <AdminShell
      active="settings"
      onNavigate={onNavigate}
      className={`page-settings ${isSuperAdmin ? 'page-superadmin page-superadmin-settings' : 'page-admin page-admin-settings'}`}
      homePageKey={homePageKey}
      showAudit={isSuperAdmin}
      auditPageKey="audit"
      onLogout={onLogout}
    >
      <div className="set-container">
        {toast && (
          <div className={`set-toast ${toast.type}`} role="status" aria-live="polite">
            {toast.message}
          </div>
        )}

        <header className="set-header">
          <div>
            <h1 className="set-title">Settings</h1>
            <p>Manage your account profile and notification preferences.</p>
          </div>
        </header>

        <div className="set-grid">
        <section className="set-section" aria-labelledby="admin-profile-title">
          <div className="set-section-heading">
            <h2 id="admin-profile-title">Profile</h2>
            <p>Update the name and image shown across e-Likha.</p>
          </div>
          <div className="set-block">
          <div className="set-avatar-row">
            <div className="set-avatar-preview">
              {avatarUrl ? (
                <img className="set-avatar-img" src={avatarUrl} alt={`${profileName} profile`} width="72" height="72" />
              ) : (
                <span className="set-avatar-initial" aria-hidden="true">{(profileName || "A").charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="set-avatar-controls">
              <div className="set-avatar-buttons">
                <label className={`set-btn ${avatarBusy ? "disabled" : ""}`}>
                  {avatarBusy ? "Working…" : avatarUrl ? "Change photo" : "Upload photo"}
                  <input
                    type="file"
                    accept={AVATAR_ACCEPT_ATTR}
                    onChange={handleAvatarPick}
                    disabled={avatarBusy}
                    hidden
                  />
                </label>
                {avatarUrl && (
                  <button className="set-btn ghost" type="button" onClick={handleAvatarRemove} disabled={avatarBusy}>
                    Remove
                  </button>
                )}
              </div>
              <div className="set-help">PNG, JPG, or WebP up to 2 MB.</div>
            </div>
          </div>

          <label className="set-field">
            <div className="set-label">Display Name</div>
            <input
              className="set-input"
              name="displayName"
              autoComplete="off"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="Enter your name…"
              minLength="2"
              maxLength="60"
              aria-describedby="display-name-help"
              aria-invalid={profileName.trim().length > 0 && profileName.trim().length < 2}
            />
            <span className="set-field-help" id="display-name-help">Shown in your account menu and administrative records.</span>
          </label>
          <label className="set-field">
            <div className="set-label">Email Address</div>
            <input
              className="set-input set-input-readonly"
              name="email"
              type="email"
              autoComplete="email"
              spellCheck="false"
              value={profileEmail}
              readOnly
              aria-describedby="account-email-help"
            />
            <span className="set-field-help" id="account-email-help">Used to sign in. Contact the system owner to change this address.</span>
          </label>
          </div>
          <div className="set-actions">
          <button
            className="set-btn"
            type="button"
            onClick={handleSaveProfile}
            disabled={savingProfile || profileName.trim().length < 2 || profileName.trim().length > 60 || profileName.trim() === savedProfileName}
          >
            {savingProfile ? "Saving…" : "Save Profile"}
          </button>
          </div>
        </section>

        <section className="set-section" aria-labelledby="admin-notifications-title">
          <div className="set-section-heading">
            <h2 id="admin-notifications-title">Notifications</h2>
            <p>Control whether this account receives platform updates.</p>
          </div>
          <div className="set-toggle-row">
          <div>
            <div className="set-toggle-label">Allow Notifications</div>
            <div className="set-toggle-help">Receive relevant activity and account alerts.</div>
          </div>
          <div className="set-toggle-control">
            <span>{allowNotifications ? "Enabled" : "Muted"}</span>
          <button
            className={`set-switch ${allowNotifications ? "on" : ""}`}
            type="button"
            onClick={() => setAllowNotifications((v) => !v)}
            aria-pressed={allowNotifications}
            aria-label="Allow Notifications"
          />
          </div>
        </div>

        <div className="set-actions">
          <button className="set-btn" type="button" onClick={handleSaveAll} disabled={savingSettings}>
            {savingSettings ? "Saving…" : "Save Changes"}
          </button>
        </div>
        </section>
        </div>

        <div className="set-page-actions">
          <button className="set-logout" type="button" onClick={() => onLogout?.()}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
              <path
                d="M10 7V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-1"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M15 12H3m0 0 3.5-3.5M3 12l3.5 3.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Log Out
          </button>
        </div>
      </div>
    </AdminShell>
  );
}

export default Settings;
