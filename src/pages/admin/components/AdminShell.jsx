import React from "react";
import "../styles/AdminShell.css";

function Icon({ children }) {
  return (
    <span className="dash-ico" aria-hidden="true">
      {children}
    </span>
  );
}

function Sidebar({
  active,
  onNavigate,
  homePageKey = "homepage",
  settingsPageKey = "settings",
  showAudit = false,
  auditPageKey = "audit",
  showClasses = null,
}) {
  const shouldShowClasses = showClasses ?? homePageKey !== "sa-dashboard";

  const [profile, setProfile] = React.useState(() => {
    try {
      return {
        name: window.localStorage.getItem("elikha_profile_name") || "Admin",
        avatar: window.localStorage.getItem("elikha_profile_avatar") || "",
      };
    } catch {
      return { name: "Admin", avatar: "" };
    }
  });

  React.useEffect(() => {
    const refresh = () => {
      try {
        setProfile({
          name: window.localStorage.getItem("elikha_profile_name") || "Admin",
          avatar: window.localStorage.getItem("elikha_profile_avatar") || "",
        });
      } catch {
        // ignore
      }
    };

    window.addEventListener("storage", refresh);
    window.addEventListener("elikha-profile-updated", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("elikha-profile-updated", refresh);
    };
  }, []);

  return (
    <aside className="dash-sidebar">
      <div className="dash-brand">
        <div className="dash-brand-left">
          <button
            className="dash-brand-home"
            type="button"
            onClick={() => onNavigate?.(homePageKey)}
            aria-label="Go to dashboard"
            title="Dashboard"
          >
            <img className="dash-logo" src="/logo.jpg" alt="e-likha" />
          </button>
        </div>
        <button
          className="dash-profile"
          type="button"
          onClick={() => onNavigate?.(settingsPageKey)}
          aria-label="Open settings"
          title="Settings"
        >
          {profile.avatar ? (
            <img
              className="dash-avatarimg"
              src={profile.avatar}
              alt={profile.name ? `${profile.name} avatar` : "Profile"}
            />
          ) : (
            <span className="dash-avatar" aria-hidden="true" />
          )}
        </button>
      </div>

      <nav className="dash-nav" aria-label="Admin navigation">
        <button
          className={`dash-link ${active === homePageKey ? "active" : ""}`}
          type="button"
          onClick={() => onNavigate?.(homePageKey)}
        >
          <Icon>
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M3 11.5L12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-8.5Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </Icon>
          Dashboard
        </button>

        <button
          className={`dash-link ${active === "users" ? "active" : ""}`}
          type="button"
          onClick={() => onNavigate?.("users")}
        >
          <Icon>
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M4 20a8 8 0 0 1 16 0"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </Icon>
          Users
        </button>

        {shouldShowClasses && (
          <button
            className={`dash-link ${active === "classes" ? "active" : ""}`}
            type="button"
            onClick={() => onNavigate?.("classes")}
          >
            <Icon>
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M4 6.5h16M4 12h16M4 17.5h16"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M8 4v16M16 4v16"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </Icon>
            Classes
          </button>
        )}

        <button
          className={`dash-link ${active === "models" ? "active" : ""}`}
          type="button"
          onClick={() => onNavigate?.("models")}
        >
          <Icon>
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M7 7h10v10H7V7Z"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M7 7l5-3 5 3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path
                d="M7 17l5 3 5-3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </Icon>
          3D Models
        </button>

        <button
          className={`dash-link ${active === "reports" ? "active" : ""}`}
          type="button"
          onClick={() => onNavigate?.("reports")}
        >
          <Icon>
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M5 19V9"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M12 19V5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M19 19v-7"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </Icon>
          Analytics
        </button>

        {showAudit && (
          <button
            className={`dash-link ${active === auditPageKey ? "active" : ""}`}
            type="button"
            onClick={() => onNavigate?.(auditPageKey)}
          >
            <Icon>
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M8 5h8M8 9h8M8 13h5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M6 3h12a2 2 0 0 1 2 2v14l-4-2-4 2-4-2-4 2V5a2 2 0 0 1 2-2Z"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
            </Icon>
            Audit
          </button>
        )}

        <button
          className={`dash-link ${active === settingsPageKey ? "active" : ""}`}
          type="button"
          onClick={() => onNavigate?.(settingsPageKey)}
        >
          <Icon>
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M19 12a7.1 7.1 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7.8 7.8 0 0 0-1.7-1l-.4-2.6H9.6L9.2 6a7.8 7.8 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.1 7.1 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7.8 7.8 0 0 0 1.7 1l.4 2.6h4.8l.4-2.6a7.8 7.8 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5c.1-.3.1-.7.1-1Z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
          </Icon>
          Settings
        </button>
      </nav>
    </aside>
  );
}

function AdminShell({
  active,
  onNavigate,
  className,
  children,
  homePageKey,
  settingsPageKey,
  showAudit,
  auditPageKey,
  showClasses,
}) {
  const rootClassName = ["dash", className].filter(Boolean).join(" ");
  return (
    <div className={rootClassName}>
      <Sidebar
        active={active}
        onNavigate={onNavigate}
        homePageKey={homePageKey}
        settingsPageKey={settingsPageKey}
        showAudit={showAudit}
        auditPageKey={auditPageKey}
        showClasses={showClasses}
      />
      <main className="dash-main">{children}</main>
    </div>
  );
}

export default AdminShell;
