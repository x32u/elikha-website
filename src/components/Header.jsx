import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStoredUserSettings } from '../hooks/useStoredUserSettings';
import './Header.css';

const Header = () => {
  const navigate = useNavigate();
  const settings = useStoredUserSettings();
  const userInfo = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem('userInfo') || '{}');
    } catch {
      return {};
    }
  }, []);
  const isTeacher = userInfo.role === 'teacher';

  return (
    <header className={`header ${isTeacher ? 'teacher-header' : 'student-header'}`}>
      <button
        className={`notification-icon ${settings.notifications ? '' : 'is-disabled'}`}
        type="button"
        aria-label={settings.notifications ? 'Notifications' : 'Notifications disabled in settings'}
        title={settings.notifications ? 'Notifications' : 'Notifications disabled in settings'}
        aria-disabled={!settings.notifications}
        onClick={() => {
          if (settings.notifications) navigate('/notifications');
        }}
      >
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 17h2v2H2v-2h2v-7a8 8 0 1 1 16 0v7zm-2 0v-7a6 6 0 1 0-12 0v7h12zm-9 4h6v2H9v-2z"/>
        </svg>
      </button>
    </header>
  );
};

export default Header;
