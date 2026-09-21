import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import {
  getTeacherClasses,
  getDashboardStats,
  getRecentSubmissions
} from '../../services/teacherApi';
import { formatClassLabel } from '../../utils/classLabels';
import { formatTimeAgo } from '../../utils/dateDisplay';
import { resolveClassImageUrl } from '../../services/classImageApi';
import './Homepage.css';

const EMPTY_SUMMARY = {
  totalStudents: 0,
  pendingReviews: 0,
  upcomingDeadlines: 0,
  parentAlerts: 0,
};

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

const formatDashboardDate = () => new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
}).format(new Date());

const Homepage = () => {
  const [loading, setLoading] = useState(true);
  const [teacher, setTeacher] = useState({ name: '' });
  const [classes, setClasses] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [recentSubmissions, setRecentSubmissions] = useState([]);

  const loadClasses = useCallback(async (tid) => {
    const result = await getTeacherClasses(tid);
    if (result.success) {
      const classesWithImages = await Promise.all(result.data.map(async (c) => ({
        ...c,
        label: formatClassLabel(c),
        imageSrc: await resolveClassImageUrl(c.image_url),
        students: c.student_count || 0,
      })));
      setClasses(classesWithImages);
    }
  }, []);

  const loadStats = useCallback(async (tid) => {
    const result = await getDashboardStats(tid);
    if (result.success) {
      setSummary({ ...EMPTY_SUMMARY, ...result.data });
    }
  }, []);

  const loadSubmissions = useCallback(async (tid) => {
    const result = await getRecentSubmissions(tid, 3);
    if (result.success) {
      const formatted = result.data.map((sub) => {
        const rawStatus = String(sub.status || '').toLowerCase();
        const reviewed = Boolean(sub.reviewed_at) || ['reviewed', 'graded', 'completed'].includes(rawStatus);
        const late = rawStatus === 'late';

        return {
          id: sub.id,
          title: `Submitted '${sub.activity?.title || 'Activity'}'`,
          student: sub.student?.name || 'Student',
          klass: sub.activity?.class?.name || 'Class',
          status: reviewed ? 'Reviewed' : late ? 'Late submission' : 'Needs review',
          type: reviewed ? 'reviewed' : late ? 'late' : 'pending',
          time: formatTimeAgo(sub.submitted_at),
        };
      });
      setRecentSubmissions(formatted);
    }
  }, []);

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const userInfo = JSON.parse(sessionStorage.getItem('userInfo') || '{}');

      setTeacher({ name: userInfo.name || 'Teacher' });
      await Promise.all([
        loadClasses(userInfo.id),
        loadStats(userInfo.id),
        loadSubmissions(userInfo.id)
      ]);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  }, [loadClasses, loadStats, loadSubmissions]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const summarySeries = useMemo(() => ([
    { id: 'students', label: 'Students', value: summary.totalStudents, route: '/students' },
    { id: 'reviews', label: 'Pending reviews', value: summary.pendingReviews, route: '/reviews' },
    { id: 'deadlines', label: 'Deadlines this week', value: summary.upcomingDeadlines, route: '/activities' },
    { id: 'alerts', label: 'Parent alerts', value: summary.parentAlerts, route: '/notifications' },
  ]), [summary]);

  const chartMaximum = Math.max(1, ...summarySeries.map((item) => item.value));
  const attentionTotal = summary.pendingReviews + summary.upcomingDeadlines + summary.parentAlerts;
  const reviewStop = attentionTotal ? (summary.pendingReviews / attentionTotal) * 100 : 0;
  const deadlineStop = attentionTotal
    ? reviewStop + (summary.upcomingDeadlines / attentionTotal) * 100
    : 0;
  const attentionGradient = attentionTotal
    ? `conic-gradient(#e8576c 0 ${reviewStop}%, #a94d61 ${reviewStop}% ${deadlineStop}%, #716b7a ${deadlineStop}% 100%)`
    : 'conic-gradient(#ececef 0 100%)';

  if (loading) {
    return (
      <div className="teacher-homepage">
        <Navbar />
        <main className="page-shell">
          <div className="home-loading" role="status">Loading dashboard…</div>
        </main>
      </div>
    );
  }

  return (
    <div className="teacher-homepage">
      <Navbar />
      <main className="page-shell">
        <header className="teacher-home-hero">
          <div className="teacher-home-hero__copy">
            <p className="teacher-home-date">{formatDashboardDate()}</p>
            <h1>{getGreeting()}, {teacher.name}</h1>
            <p>See what needs attention and move directly into your next task.</p>
          </div>
          <div className="teacher-home-actions" aria-label="Quick actions">
            <Link className="home-action home-action--primary" to="/reviews">
              Review submissions
              {summary.pendingReviews > 0 && <span>{summary.pendingReviews}</span>}
            </Link>
            <Link className="home-action" to="/activities">
              Open activities
            </Link>
          </div>
        </header>

        <section className="home-panel dashboard-panel--summary" aria-labelledby="workload-heading">
          <div className="home-panel__header">
            <div>
              <h2 id="workload-heading">Workload at a glance</h2>
              <p>Current students and items that may need action.</p>
            </div>
            <span className="home-panel__meta">Live overview</span>
          </div>

          <div className="workload-grid">
            <div className="attention-chart">
              <div
                className="attention-ring"
                style={{ background: attentionGradient }}
                role="img"
                aria-label={`${attentionTotal} actionable items: ${summary.pendingReviews} pending reviews, ${summary.upcomingDeadlines} upcoming deadlines, and ${summary.parentAlerts} parent alerts`}
              >
                <div className="attention-ring__center">
                  <strong>{attentionTotal}</strong>
                  <span>need attention</span>
                </div>
              </div>
              <div className="attention-copy">
                <h3>{attentionTotal === 0 ? 'You’re caught up' : 'Action queue'}</h3>
                <p>{attentionTotal === 0
                  ? 'No reviews, deadlines, or parent alerts require action right now.'
                  : 'Review learner work first, then check this week’s deadlines.'}</p>
                <div className="attention-legend" aria-hidden="true">
                  <span><i className="legend-dot legend-dot--reviews" />Reviews</span>
                  <span><i className="legend-dot legend-dot--deadlines" />Deadlines</span>
                  <span><i className="legend-dot legend-dot--alerts" />Alerts</span>
                </div>
              </div>
            </div>

            <div className="summary-chart" aria-label="Dashboard summary chart">
              {summarySeries.map((item) => (
                <Link
                  key={item.id}
                  className="summary-chart__row"
                  to={item.route}
                  aria-label={`${item.label}: ${item.value}. Open ${item.label.toLowerCase()}.`}
                >
                  <span className="summary-chart__line">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </span>
                  <span className="summary-chart__track" aria-hidden="true">
                    <span
                      className={`summary-chart__fill summary-chart__fill--${item.id}`}
                      style={{ '--bar-size': `${(item.value / chartMaximum) * 100}%` }}
                    />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <div className="home-content-grid">
          <section className="home-panel dashboard-panel--classes">
            <div className="home-panel__header">
              <div>
                <h2>Classes</h2>
                <p>{classes.length} active {classes.length === 1 ? 'class' : 'classes'}</p>
              </div>
              <Link className="home-link" to="/classes">Manage classes</Link>
            </div>
            <div className="classes-grid">
              {classes.length === 0 ? (
                <div className="home-empty-state">
                  <strong>No classes yet</strong>
                  <span>Create a class to begin assigning activities.</span>
                </div>
              ) : (
                classes.map((klass) => (
                  <Link
                    key={klass.id}
                    className="class-card"
                    to={`/class/${klass.id}`}
                  >
                    <div className="class-avatar" style={{ background: klass.color }}>
                      {klass.imageSrc
                        ? <img src={klass.imageSrc} alt="" width="48" height="48" loading="lazy" />
                        : klass.label.charAt(0)}
                    </div>
                    <div className="class-meta">
                      <div className="class-name">{klass.label}</div>
                      <div className="class-sub">{klass.students} {klass.students === 1 ? 'student' : 'students'}</div>
                    </div>
                    <span className="class-card__arrow" aria-hidden="true">→</span>
                  </Link>
                ))
              )}
            </div>
          </section>

          <section className="home-panel dashboard-panel--submissions">
            <div className="home-panel__header">
              <div>
                <h2>Recent submissions</h2>
                <p>Latest learner work across your classes</p>
              </div>
              <Link className="home-link" to="/reviews">View all</Link>
            </div>
            <div className="activity-list">
              {recentSubmissions.length === 0 ? (
                <div className="home-empty-state">
                  <strong>No recent submissions</strong>
                  <span>New learner work will appear here.</span>
                </div>
              ) : (
                recentSubmissions.map((item) => (
                  <Link key={item.id} className="activity-row" to="/reviews">
                    <span className={`activity-icon activity-icon--${item.type}`} aria-hidden="true">
                      {item.type === 'reviewed' ? '✓' : item.type === 'late' ? '!' : '→'}
                    </span>
                    <span className="activity-copy">
                      <span className="activity-title">{item.title}</span>
                      <span className="activity-sub">{item.student} · {item.klass} · {item.time}</span>
                    </span>
                    <span className={`status-pill ${item.type}`}>{item.status}</span>
                  </Link>
                ))
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default Homepage;
