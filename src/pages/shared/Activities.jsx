import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import Navbar from '../../components/Navbar';
import { getStudentActivities } from '../../services/studentApi';
import { useStoredUserSettings } from '../../hooks/useStoredUserSettings';
import { shouldLoadRichMedia } from '../../utils/userSettings';
import './Activities.css';

const Activities = () => {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState('upcoming');
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const settings = useStoredUserSettings();

  // Get current user from session
  const userInfo = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem('userInfo') || '{}');
    } catch {
      return {};
    }
  }, []);

  useEffect(() => {
    const fetchActivities = async () => {
      if (!userInfo.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const result = await getStudentActivities(userInfo.id);
      
      if (result.success) {
        setActivities(result.data || []);
      } else {
        setError(result.error);
      }
      setLoading(false);
    };

    fetchActivities();
  }, [userInfo.id]);

  const getActivityStatus = (activity) => {
    const studentStatus = String(activity?.status || '').toLowerCase();
    if (studentStatus === 'submitted' || studentStatus === 'reviewed') return 'completed';
    if (studentStatus === 'overdue') return 'past-due';
    return 'upcoming';
  };

  const getDaysUntilDue = (dueDate) => {
    if (!dueDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    if (Number.isNaN(due.getTime())) return null;
    due.setHours(0, 0, 0, 0);
    const diffTime = due - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getActivityColors = (index) => {
    const colors = [
      { bg: 'linear-gradient(135deg, #FFB6C1 0%, #FF69B4 100%)', label: 'pink' },
      { bg: 'linear-gradient(135deg, #87CEEB 0%, #4682B4 100%)', label: 'blue' },
      { bg: 'linear-gradient(135deg, #98FB98 0%, #32CD32 100%)', label: 'green' },
      { bg: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)', label: 'orange' },
      { bg: 'linear-gradient(135deg, #DDA0DD 0%, #9932CC 100%)', label: 'purple' },
      { bg: 'linear-gradient(135deg, #F0E68C 0%, #DAA520 100%)', label: 'gold' }
    ];
    return colors[index % colors.length];
  };

  const filteredActivities = useMemo(() => {
    return activities.filter(activity => {
      const status = getActivityStatus(activity);
      
      if (activeFilter === 'upcoming') {
        return status === 'upcoming';
      } else if (activeFilter === 'past-due') {
        return status === 'past-due';
      } else if (activeFilter === 'completed') {
        return status === 'completed';
      }
      return true;
    });
  }, [activities, activeFilter]);

  const formatDate = (dateString) => {
    if (!dateString) return 'No due date';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="activities-page-container student-shell">
        <Header />
        <main className="activities-page">
          <div className="activities-header">
            <h1 className="page-title">Activities</h1>
          </div>
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading activities...</p>
          </div>
        </main>
        <Navbar />
      </div>
    );
  }

  return (
    <div className="activities-page-container student-shell">
      <Header />
      <main className="activities-page">
        <div className="activities-header">
          <h1 className="page-title">Activities</h1>
        </div>

        {/* Filter Tabs */}
        <div className="filter-section">
          <div className="filter-tabs">
            <button
              className={`filter-tab ${activeFilter === 'upcoming' ? 'active' : ''}`}
              onClick={() => setActiveFilter('upcoming')}
            >
              Upcoming
            </button>
            <button
              className={`filter-tab ${activeFilter === 'past-due' ? 'active' : ''}`}
              onClick={() => setActiveFilter('past-due')}
            >
              Past Due
            </button>
            <button
              className={`filter-tab ${activeFilter === 'completed' ? 'active' : ''}`}
              onClick={() => setActiveFilter('completed')}
            >
              Completed
            </button>
          </div>
        </div>

        {error && (
          <div className="error-banner">
            <p>Error loading activities: {error}</p>
          </div>
        )}

        {/* Activities List */}
        <div className="activities-list">
          {filteredActivities.length > 0 ? (
            filteredActivities.map((activity, index) => {
              const colors = getActivityColors(index);
              const daysLeft = getDaysUntilDue(activity.due_date);
              const isUrgent = daysLeft !== null && daysLeft <= 1 && daysLeft >= 0;
              const status = getActivityStatus(activity);
              const isPastDue = status === 'past-due';
              const isCompleted = status === 'completed';
              const loadThumbnail = shouldLoadRichMedia(settings) && activity.image_url;

              return (
                <div
                  key={activity.id}
                  className={`activity-item ${isPastDue ? 'past-due' : ''} ${isUrgent ? 'urgent' : ''} ${isCompleted ? 'completed' : ''}`}
                  onClick={() => navigate(`/activity/${activity.id}`)}
                  role="button"
                  tabIndex="0"
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/activity/${activity.id}`)}
                >
                  <div 
                    className="activity-thumbnail" 
                    style={{ 
                      background: loadThumbnail ? `url(${activity.image_url}) center/cover` : colors.bg 
                    }}
                  >
                    {!loadThumbnail && (
                      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM11 13l-2.5 3.01L6 13l-3 4h18l-6-8z" />
                      </svg>
                    )}
                  </div>
                  <div className="activity-details">
                    <h3 className="activity-title">{activity.title}</h3>
                    <p className="activity-description">{activity.description || 'No description'}</p>
                    {activity.subject && (
                      <span className="activity-subject">{activity.subject}</span>
                    )}
                    {!isCompleted && activity.due_date && daysLeft !== null && (
                      <span className={`activity-due-date ${isPastDue ? 'overdue' : ''}`}>
                        {daysLeft < 0 ? `Overdue by ${Math.abs(daysLeft)} days` : 
                         daysLeft === 0 ? 'Due today' : 
                         `Due in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`}
                      </span>
                    )}
                    {isCompleted && (
                      <span className="activity-completed-badge">
                        Submitted {activity.submitted_at ? formatDate(activity.submitted_at) : ''}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="no-activities">
              <div className="empty-icon">Art</div>
              <p>No {activeFilter === 'upcoming' ? 'upcoming' : activeFilter === 'past-due' ? 'past due' : 'completed'} activities</p>
              {activeFilter === 'upcoming' && (
                <p className="empty-subtext">You're all caught up!</p>
              )}
            </div>
          )}
        </div>
      </main>
      <Navbar />
    </div>
  );
};

export default Activities;
