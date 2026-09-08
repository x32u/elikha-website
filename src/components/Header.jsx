import React, { useMemo } from 'react';
import NotificationBell from './NotificationBell';
import './Header.css';

const Header = () => {
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
      <NotificationBell inline />
    </header>
  );
};

export default Header;
