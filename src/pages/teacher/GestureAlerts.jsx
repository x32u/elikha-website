import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { getTeacherActivityLockAlerts, getTeacherGestureAlerts } from '../../services/teacherApi';
import './GestureAlerts.css';

const formatDateTime = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
};

const formatGestureType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'middle_finger') return 'Middle Finger';
  if (!normalized) return 'Unknown';
  return normalized.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatAlertType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'student_unlocked') return 'Activity Unlocked';
  if (normalized === 'left_activity') return 'Left Activity';
  if (normalized === 'fullscreen_exited') return 'Fullscreen Exited';
  return formatGestureType(value);
};

const GestureAlerts = () => {
  const navigate = useNavigate();
  const userInfo = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem('userInfo') || '{}');
    } catch {
      return {};
    }
  }, []);

  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [activityFilter, setActivityFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  useEffect(() => {
    const loadAlerts = async () => {
      setLoading(true);
      setError('');

      const [gestureResult, lockResult] = await Promise.all([
        getTeacherGestureAlerts(userInfo.id),
        getTeacherActivityLockAlerts(userInfo.id),
      ]);
      if (!gestureResult.success) {
        setError(gestureResult.error || 'Failed to load behavior alerts.');
        setAlerts([]);
        setLoading(false);
        return;
      }

      const gestureAlerts = (gestureResult.data || []).map((alertItem) => ({
        id: alertItem.id,
        studentId: alertItem.student_id,
        studentName: alertItem.student?.name || 'Student',
        studentEmail: alertItem.student?.email || 'No email',
        activityId: alertItem.activity_id,
        activityTitle: alertItem.activity?.title || 'Untitled activity',
        className: alertItem.activity?.class?.name || 'No class',
        gestureType: formatAlertType(alertItem.metadata?.activityLockEvent || alertItem.gesture_type),
        createdAt: alertItem.created_at,
        sourceTool: alertItem.metadata?.tool || null,
      }));

      // A missing table means the SQL setup has not been applied yet; gesture
      // alerts remain available while the page explains how to enable lock alerts.
      const lockAlerts = (lockResult.success ? lockResult.data : []).map((alertItem) => ({
        id: `lock-${alertItem.id}`,
        studentId: alertItem.student_id,
        studentName: alertItem.student?.name || 'Student',
        studentEmail: alertItem.student?.email || 'No email',
        activityId: alertItem.activity_id,
        activityTitle: alertItem.activity?.title || 'Untitled activity',
        className: alertItem.activity?.class?.name || 'No class',
        gestureType: formatAlertType(alertItem.event_type),
        createdAt: alertItem.created_at,
        sourceTool: 'Activity Lock',
      }));

      setAlerts([...gestureAlerts, ...lockAlerts].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
      setLoading(false);
    };

    loadAlerts();
    // Polling keeps a proctor's open alert screen current even when Supabase
    // Realtime is not enabled for the table.
    const refreshId = window.setInterval(loadAlerts, 10000);
    return () => window.clearInterval(refreshId);
  }, [userInfo.id]);

  const uniqueClasses = useMemo(
    () => ['all', ...new Set(alerts.map((item) => item.className).filter(Boolean))],
    [alerts]
  );

  const uniqueActivities = useMemo(
    () => ['all', ...new Set(alerts.map((item) => item.activityTitle).filter(Boolean))],
    [alerts]
  );

  const filteredAlerts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return alerts
      .filter((alertItem) => {
        const matchesSearch = !query || [
          alertItem.studentName,
          alertItem.studentEmail,
          alertItem.activityTitle,
          alertItem.className,
          alertItem.gestureType,
          alertItem.sourceTool,
        ].some((value) => String(value || '').toLowerCase().includes(query));
        const matchesClass = classFilter === 'all' || alertItem.className === classFilter;
        const matchesActivity = activityFilter === 'all' || alertItem.activityTitle === activityFilter;
        return matchesSearch && matchesClass && matchesActivity;
      })
      .sort((a, b) => {
        if (sortBy === 'oldest') {
          return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
        }
        if (sortBy === 'student') {
          return a.studentName.localeCompare(b.studentName);
        }
        if (sortBy === 'activity') {
          return a.activityTitle.localeCompare(b.activityTitle);
        }
        if (sortBy === 'class') {
          return a.className.localeCompare(b.className);
        }
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      });
  }, [activityFilter, alerts, classFilter, searchTerm, sortBy]);

  const resetFilters = () => {
    setSearchTerm('');
    setClassFilter('all');
    setActivityFilter('all');
    setSortBy('newest');
  };

  return (
    <div className="gesture-alerts-page">
      <Navbar />
      <main className="gesture-alerts-content">
        <header className="gesture-alerts-header">
          <div>
            <p className="gesture-alerts-eyebrow">Classroom monitoring</p>
            <h1>Behavior Alerts</h1>
            <p>Review activity-lock and AR gesture reports from student sessions.</p>
          </div>
          <div className="gesture-alerts-count" aria-label={`${alerts.length} total alerts`}>
            <strong>{alerts.length}</strong>
            <span>Total alerts</span>
          </div>
        </header>

        {!loading && !error && alerts.length > 0 && (
          <section className="gesture-alerts-toolbar" aria-label="Alert filters">
            <label className="gesture-search">
              <span>Search</span>
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Student, email, class, activity..."
              />
            </label>

            <label>
              <span>Class</span>
              <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
                {uniqueClasses.map((className) => (
                  <option key={className} value={className}>
                    {className === 'all' ? 'All classes' : className}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Activity</span>
              <select value={activityFilter} onChange={(event) => setActivityFilter(event.target.value)}>
                {uniqueActivities.map((activityTitle) => (
                  <option key={activityTitle} value={activityTitle}>
                    {activityTitle === 'all' ? 'All activities' : activityTitle}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Sort</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="student">Student A-Z</option>
                <option value="activity">Activity A-Z</option>
                <option value="class">Class A-Z</option>
              </select>
            </label>

            <button type="button" className="gesture-clear-filters" onClick={resetFilters}>
              Clear
            </button>
          </section>
        )}

        {loading && <div className="gesture-alerts-empty">Loading alerts...</div>}

        {!loading && error && (
          <div className="gesture-alerts-error">
            <strong>Unable to load alerts:</strong> {error}
            <div className="gesture-alerts-error-help">
              If this is a new setup, apply the alert SQL files in the <code>database</code> folder in Supabase.
            </div>
          </div>
        )}

        {!loading && !error && alerts.length === 0 && (
          <div className="gesture-alerts-empty">No gesture alerts recorded yet.</div>
        )}

        {!loading && !error && alerts.length > 0 && filteredAlerts.length === 0 && (
          <div className="gesture-alerts-empty">No alerts match those filters.</div>
        )}

        {!loading && !error && filteredAlerts.length > 0 && (
          <section className="gesture-alerts-list" aria-label="Behavior alert list">
            {filteredAlerts.map((alertItem) => (
              <article
                key={alertItem.id}
                className={`gesture-alert-card ${alertItem.sourceTool === 'Activity Lock' ? 'gesture-alert-card--lock' : ''}`}
              >
                <div className="gesture-alert-top">
                  <span className={`gesture-pill ${alertItem.sourceTool === 'Activity Lock' ? 'gesture-pill--lock' : ''}`}>
                    {alertItem.gestureType}
                  </span>
                  <time>{formatDateTime(alertItem.createdAt)}</time>
                </div>

                <h3>{alertItem.studentName}</h3>
                <p className="gesture-alert-email">{alertItem.studentEmail}</p>

                <div className="gesture-alert-grid">
                  <div>
                    <span className="gesture-alert-label">Activity</span>
                    <span>{alertItem.activityTitle}</span>
                  </div>
                  <div>
                    <span className="gesture-alert-label">Class</span>
                    <span>{alertItem.className}</span>
                  </div>
                  <div>
                    <span className="gesture-alert-label">Tool</span>
                    <span>{alertItem.sourceTool || 'N/A'}</span>
                  </div>
                </div>

                <div className="gesture-alert-actions">
                  <button type="button" onClick={() => navigate(`/student/${alertItem.studentId}`)}>
                    View Student
                  </button>
                  <button type="button" onClick={() => navigate(`/activity/${alertItem.activityId}`)}>
                    View Activity
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
};

export default GestureAlerts;
