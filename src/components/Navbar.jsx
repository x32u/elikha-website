import React, { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import elikhaLogo from '../assets/images/elikhalogo-cropped.png';
import './Navbar.css';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get user role from session storage
  const userInfo = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem('userInfo') || '{}');
    } catch {
      return {};
    }
  }, []);
  
  const isTeacher = userInfo.role === 'teacher';

  // Teacher navigation items
  const teacherNavItems = [
    {
      key: 'dashboard',
      path: '/homepage',
      label: 'Dashboard',
      icon: (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    },
    {
      key: 'classes',
      path: '/classes',
      label: 'Classes',
      icon: (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 6.5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6.5Z" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 9.5h16" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
    },
    {
      key: 'assignments',
      path: '/activities',
      label: 'Assignments',
      icon: (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 4.5h12a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 8.5h6M9 12h6M9 15.5h3" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
    },
    {
      key: 'students',
      path: '/students',
      label: 'Students',
      icon: (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M7.5 9.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M16.5 13a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3 20.5c0-3 2.5-5 5-5s5 2 5 5" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14 18.5c.4-1.9 1.9-3 3.5-3 1.6 0 3.1 1.1 3.5 3" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    },
    {
      key: 'reviews',
      path: '/reviews',
      label: 'Reviews',
      icon: (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="m12 3.5 2.2 4.4 4.8.7-3.5 3.4.8 4.8L12 14.8l-4.3 2.3.8-4.8-3.5-3.4 4.8-.7L12 3.5Z" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    },
    {
      key: 'gesture-alerts',
      path: '/gesture-alerts',
      label: 'Alerts',
      icon: (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 3.5 3.5 19h17L12 3.5Z" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 9.2v5.8M12 18.3h.01" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
    },
    {
      key: 'settings',
      path: '/settings',
      label: 'Settings',
      icon: (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    }
  ];

  // Student navigation items
  const studentNavItems = [
    {
      key: 'dashboard',
      path: '/homepage',
      label: 'Home',
      icon: (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    },
    {
      key: 'assignments',
      path: '/activities',
      label: 'Activities',
      icon: (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 4.5h12a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 8.5h6M9 12h6M9 15.5h3" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
    },
    {
      key: 'profile',
      path: '/profile',
      label: 'Profile',
      icon: (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="8" r="4" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 20c0-4 4-6 8-6s8 2 8 6" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    },
    {
      key: 'settings',
      path: '/settings',
      label: 'Settings',
      icon: (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    }
  ];

  const handleLogout = () => {
    sessionStorage.removeItem('userInfo');
    window.dispatchEvent(new Event('elikha-auth-changed'));
    navigate('/login');
  };

  // Use appropriate nav items based on role
  const navItems = isTeacher ? teacherNavItems : studentNavItems;

  const activeKey = (() => {
    const path = location.pathname;
    if (path.startsWith('/activities') || path.startsWith('/activity')) return 'assignments';
    if (path.startsWith('/profile')) return 'profile';
    if (path.startsWith('/settings')) return 'settings';
    if (path.startsWith('/students') || path.startsWith('/student/')) return 'students';
    if (path.startsWith('/reviews')) return 'reviews';
    if (path.startsWith('/gesture-alerts')) return 'gesture-alerts';
    if (path.startsWith('/classes') || path.startsWith('/class/')) return 'classes';
    if (path.startsWith('/homepage')) return 'dashboard';
    return '';
  })();

  return (
    <nav className={`navbar ${isTeacher ? 'teacher-nav' : 'student-nav'}`}>
      <div className="navbar-logo">
        <img src={elikhaLogo} alt="Elikha Logo" className="logo-image" />
      </div>
      <div className="navbar-content">
        {navItems.map((item) => {
          const isActive = activeKey === item.key;
          return (
            <button
              key={item.key}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
              aria-label={item.label}
            >
              <div className="nav-icon">
                {item.icon}
              </div>
              <span className="nav-label">{item.label}</span>
            </button>
          );
        })}
        {isTeacher && (
          <button
            className="nav-item logout-item"
            onClick={handleLogout}
            aria-label="Logout"
          >
            <div className="nav-icon">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 17l5-5-5-5" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M15 12H3" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M21 4v16" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="nav-label">Logout</span>
          </button>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
