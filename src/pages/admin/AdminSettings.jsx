import React from "react";
import "./styles/AdminSettings.css";
import AdminShell from "./components/AdminShell";
import { supabase } from "../../lib/supabase";
import { updatePlatformUser } from "../../services/adminApi";
import { getUserSettings, saveUserSettings } from "../../services/userSettingsApi";

function Settings({ onNavigate, role, onLogout }) {
  const isSuperAdmin = role === "SuperAdmin";
  const homePageKey = isSuperAdmin ? "sa-dashboard" : "homepage";
  const [allowNotifications, setAllowNotifications] = React.useState(true);
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [toast, setToast] = React.useState(null);
  const [profileName, setProfileName] = React.useState("Admin");
  const [profileEmail, setProfileEmail] = React.useState("");
  const [profileUserId, setProfileUserId] = React.useState("");
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [savingPassword, setSavingPassword] = React.useState(false);
  const [savingSettings, setSavingSettings] = React.useState(false);

  React.useEffect(() => {
    if (!toast) return undefined;
    const t = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(t);
  }, [toast]);

  React.useEffect(() => {
    const userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}");
    if (userInfo?.id) setProfileUserId(userInfo.id);
    if (typeof userInfo?.name === "string" && userInfo.name.trim()) {
      setProfileName(userInfo.name.trim());
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
    }
  }, []);

  const showToast = (type, message) => {
    setToast({ type, message });
  };

  const handleSaveProfile = async () => {
    const name = profileName.trim() || "Admin";

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
    showToast("success", "Profile updated.");
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      showToast("error", "Current password is required.");
      return;
    }
    if (newPassword.length < 8) {
      showToast("error", "New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("error", "Passwords do not match.");
      return;
    }

    setSavingPassword(true);

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: profileEmail,
      password: currentPassword,
    });

    if (verifyError) {
      setSavingPassword(false);
      showToast("error", "Current password is incorrect.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);

    if (error) {
      showToast("error", error.message || "Failed to update password.");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    showToast("success", "Password updated.");
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
      className="page-settings"
      homePageKey={homePageKey}
      showAudit={isSuperAdmin}
      showPasswordResets={isSuperAdmin}
      auditPageKey="audit"
    >
      <div className="set-container">
        {toast && (
          <div className={`set-toast ${toast.type}`} role="status" aria-live="polite">
            {toast.message}
          </div>
        )}

        <header className="set-header">
          <h1 className="set-title">Settings</h1>
        </header>

        <h2 className="set-section-title">Profile</h2>
        <section className="set-block" aria-label="Profile settings">
          <label className="set-field">
            <div className="set-label">Display Name</div>
            <input
              className="set-input"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="Enter your name"
            />
          </label>
          <label className="set-field">
            <div className="set-label">Email</div>
            <input className="set-input" value={profileEmail} disabled />
          </label>
        </section>

        <div className="set-actions">
          <button className="set-btn" type="button" onClick={handleSaveProfile} disabled={savingProfile}>
            {savingProfile ? "Saving..." : "Save Profile"}
          </button>
        </div>

        <section className="set-block" aria-label="Change password - current">
          <div className="set-field">
            <div className="set-label">Current Password</div>
            <input
              className="set-input"
              type="password"
              placeholder="Enter current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
        </section>

        <section className="set-block" aria-label="Change password - new">
          <div className="set-field">
            <div className="set-label">New Password</div>
            <input
              className="set-input"
              type="password"
              placeholder="Enter new password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
        </section>

        <section className="set-block" aria-label="Change password - confirm">
          <div className="set-field">
            <div className="set-label">Confirm New Password</div>
            <input
              className="set-input"
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
        </section>

        <div className="set-actions">
          <button className="set-btn" type="button" onClick={handleChangePassword} disabled={savingPassword}>
            {savingPassword ? "Changing..." : "Change Password"}
          </button>
        </div>

        <h2 className="set-section-title">Notification Settings</h2>
        <div className="set-toggle-row">
          <div className="set-toggle-label">Allow Notifications</div>
          <button
            className={`set-switch ${allowNotifications ? "on" : ""}`}
            type="button"
            onClick={() => setAllowNotifications((v) => !v)}
            aria-pressed={allowNotifications}
            aria-label="Allow Notifications"
          />
        </div>

        <div className="set-actions">
          <button className="set-btn" type="button" onClick={handleSaveAll} disabled={savingSettings}>
            {savingSettings ? "Saving..." : "Save Changes"}
          </button>
        </div>

        <div className="set-page-actions">
          <button className="set-logout" type="button" onClick={() => onLogout?.()}>
            <span className="set-logout-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M10 7V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-1"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M15 12H3m0 0l3.5-3.5M3 12l3.5 3.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="set-logout-text">Log Out</span>
          </button>
        </div>
      </div>
    </AdminShell>
  );
}

export default Settings;
