import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import elikhaLogo from '../assets/images/elikhalogo-cropped.png';
import {
  getUnreadNotificationCount,
  subscribeToNotifications,
} from '../services/notificationApi';
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
  
  const role = String(userInfo.role || '').toLowerCase().replace(/[_\s-]/g, '');
  const isTeacher = role === 'teacher';
  const isParent = role === 'parent';
  const [unreadCount, setUnreadCount] = useState(0);
  const unreadRequestRef = useRef(0);

  useEffect(() => {
    let active = true;

    const refreshUnreadCount = async () => {
      const requestId = unreadRequestRef.current + 1;
      unreadRequestRef.current = requestId;
      const result = await getUnreadNotificationCount(userInfo.id);
      if (active && requestId === unreadRequestRef.current && result.success) {
        setUnreadCount(result.count);
      }
    };

    refreshUnreadCount();
    const unsubscribe = subscribeToNotifications(userInfo.id, refreshUnreadCount);
    window.addEventListener('elikha-notifications-changed', refreshUnreadCount);

    return () => {
      active = false;
      unreadRequestRef.current += 1;
      unsubscribe();
      window.removeEventListener('elikha-notifications-changed', refreshUnreadCount);
    };
  }, [userInfo.id]);

  // Teacher navigation items
  const teacherNavItems = [
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
      key: 'notifications',
      path: '/notifications',
      label: 'Notifications',
      icon: (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M18 10a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 22h4" fill="none" strokeWidth="1.6" strokeLinecap="round" />
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
      key: 'reports',
      path: '/teacher/reports',
      label: 'Reports',
      icon: (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M5 19V10M12 19V5M19 19v-7" fill="none" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M3 21h18" fill="none" strokeWidth="1.6" strokeLinecap="round" />
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
      key: 'rubrics',
      path: '/rubrics',
      label: 'Rubrics',
      icon: (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 3.5h9l3 3V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-15a1.5 1.5 0 0 1 1-1.5Z" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 10h6M9 14h6M9 18h3" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
    },
    {
      key: 'models',
      path: '/teacher/models',
      label: '3D Models',
      icon: (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="m4 7.5 8 4.5 8-4.5M12 12v9" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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
      key: 'sandbox',
      path: '/sandbox',
      label: 'Sandbox',
      icon: (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="m4 7.5 8 4.5 8-4.5M12 12v9" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="m8.5 5.1 8 4.5" strokeWidth="1.6" strokeLinecap="round" />
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
      key: 'notifications',
      path: '/notifications',
      label: 'Notifications',
      icon: (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M18 10a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 22h4" fill="none" strokeWidth="1.6" strokeLinecap="round" />
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

  const parentNavItems = studentNavItems.filter(
    (item) => item.key === 'notifications' || item.key === 'settings'
  );

  // Use appropriate nav items based on role
  const navItems = isTeacher ? teacherNavItems : isParent ? parentNavItems : studentNavItems;

  const activeKey = (() => {
    const path = location.pathname;
    if (path.startsWith('/activities') || path.startsWith('/activity')) return 'assignments';
    if (path.startsWith('/notifications')) return 'notifications';
    if (path.startsWith('/sandbox')) return 'sandbox';
    if (path.startsWith('/profile')) return 'profile';
    if (path.startsWith('/settings')) return 'settings';
    if (path.startsWith('/students') || path.startsWith('/student/')) return 'students';
    if (path.startsWith('/teacher/reports')) return 'reports';
    if (path.startsWith('/reviews')) return 'reviews';
    if (path.startsWith('/rubrics')) return 'rubrics';
    if (path === '/teacher/models' || path.startsWith('/teacher/models/')) return 'models';
    if (path.startsWith('/gesture-alerts')) return 'gesture-alerts';
    if (path.startsWith('/classes') || path.startsWith('/class/')) return 'classes';
    if (path.startsWith('/homepage')) return 'dashboard';
    return '';
  })();

  return (
    <nav
      className={`navbar ${
        isTeacher ? 'teacher-nav' : isParent ? 'student-nav parent-nav' : 'student-nav'
      }`}
      aria-label={isParent ? 'Parent navigation' : 'Main navigation'}
    >
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
              aria-label={
                item.key === 'notifications' && unreadCount
                  ? `${item.label}, ${unreadCount} unread`
                  : item.label
              }
            >
              <div className="nav-icon">
                {item.icon}
                {item.key === 'notifications' && unreadCount > 0 && (
                  <span className="nav-badge" aria-hidden="true">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              <span className="nav-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default Navbar;
