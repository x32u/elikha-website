import React, { useMemo } from 'react';
import Navbar from '../../components/Navbar';
import Header from '../../components/Header';
import './Notifications.css';

const Notifications = () => {
  const userInfo = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem('userInfo') || '{}');
    } catch {
      return {};
    }
  }, []);
  const isTeacher = userInfo.role === 'teacher';

  const notifications = [
    {
      id: 1,
      type: 'activity',
      title: 'New Activity Available',
      message: 'A new art activity "Watercolor Basics" has been assigned to you.',
      time: '2 hours ago',
      read: false
    },
    {
      id: 2,
      type: 'feedback',
      title: 'Feedback Received',
      message: 'Your teacher left feedback on your "Still Life Drawing" submission.',
      time: '1 day ago',
      read: false
    },
    {
      id: 3,
      type: 'reminder',
      title: 'Activity Due Soon',
      message: '"Color Theory Exercise" is due in 2 days. Don\'t forget to submit!',
      time: '2 days ago',
      read: true
    },
    {
      id: 4,
      type: 'achievement',
      title: 'Achievement Unlocked!',
      message: 'Congratulations! You completed 5 activities this week.',
      time: '3 days ago',
      read: true
    }
  ];

  return (
    <div className={`notifications-layout ${isTeacher ? 'teacher-notifications' : 'student-notifications'}`}>
      <Navbar />
      <div className="notifications-main">
        <Header />
        <div className="notifications-content">
          <h1 className="notifications-title">Notifications</h1>
          <div className="notifications-list">
            {notifications.map((notification) => (
              <div 
                key={notification.id} 
                className={`notification-item ${notification.read ? 'read' : 'unread'}`}
              >
                <div className={`notification-icon-wrapper ${notification.type}`}>
                  {notification.type === 'activity' && (
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6 4.5h12a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" strokeWidth="1.6"/>
                      <path d="M9 8.5h6M9 12h6M9 15.5h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                    </svg>
                  )}
                  {notification.type === 'feedback' && (
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                  {notification.type === 'reminder' && (
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.6"/>
                      <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                    </svg>
                  )}
                  {notification.type === 'achievement' && (
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="m12 3.5 2.2 4.4 4.8.7-3.5 3.4.8 4.8L12 14.8l-4.3 2.3.8-4.8-3.5-3.4 4.8-.7L12 3.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <div className="notification-content">
                  <h3 className="notification-title">{notification.title}</h3>
                  <p className="notification-message">{notification.message}</p>
                  <span className="notification-time">{notification.time}</span>
                </div>
                {!notification.read && <div className="unread-dot"></div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Notifications;
