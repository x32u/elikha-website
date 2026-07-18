import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import {
  getTeacherClasses,
  getDashboardStats,
  getRecentSubmissions
} from '../../services/teacherApi';
import { formatClassLabel } from '../../utils/classLabels';
import './Homepage.css';

const Homepage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [teacher, setTeacher] = useState({ name: '' });
  const [classes, setClasses] = useState([]);
  const [summary, setSummary] = useState([]);
  const [recentSubmissions, setRecentSubmissions] = useState([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const userInfo = JSON.parse(sessionStorage.getItem('userInfo') || '{}');
      
      // Use user info directly
      setTeacher({ name: userInfo.name || 'Teacher' });
      
      // Load data with user ID
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
  };

  const loadClasses = async (tid) => {
    const result = await getTeacherClasses(tid);
    if (result.success) {
      // Add pending count (would need to calculate from submissions)
      const classesWithPending = result.data.map(c => ({
        ...c,
        label: formatClassLabel(c),
        students: c.student_count || 0,
        pending: 0 // TODO: Calculate from submissions
      }));
      setClasses(classesWithPending);
    }
  };

  const loadStats = async (tid) => {
      const result = await getDashboardStats(tid);
    if (result.success) {
      setSummary([
        { id: 'students', label: 'Total Students', value: result.data.totalStudents, route: '/students' },
        { id: 'reviews', label: 'Pending Reviews', value: result.data.pendingReviews, route: '/reviews' },
        { id: 'deadlines', label: 'Upcoming Deadlines', value: result.data.upcomingDeadlines, route: '/activities' },
        { id: 'alerts', label: 'Parent Alerts', value: result.data.parentAlerts, route: '/notifications' }
      ]);
    }
  };

  const loadSubmissions = async (tid) => {
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
          type: reviewed ? 'completed' : 'submitted',
          time: formatTimeAgo(sub.submitted_at),
        };
      });
      setRecentSubmissions(formatted);
    }
  };

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return 'Today';
  };

  if (loading) {
    return (
      <div className="teacher-homepage">
        <Navbar />
        <div className="page-shell">
          <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="teacher-homepage">
      <Navbar />
      <div className="page-shell">
        <header className="page-header">
          <div className="page-header__titles">
            <span className="eyebrow">{teacher.role}</span>
            <h1>{teacher.name}</h1>
            <p className="lede">{teacher.greeting}</p>
          </div>
        </header>

        <div className="f-layout">
          <aside className="f-sidebar">
            <section className="panel">
              <div className="panel__header">
                <h2>Classes</h2>
                <button className="link-btn" type="button" onClick={() => navigate('/classes')}>Manage classes</button>
              </div>
              <div className="classes-grid">
                {classes.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#6B5A4D' }}>
                    No classes yet
                  </div>
                ) : (
                  classes.map((klass) => (
                    <div 
                      key={klass.id} 
                      className="class-card"
                      onClick={() => navigate(`/class/${klass.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="class-avatar" style={{ background: klass.color }}>
                        {klass.label.charAt(0)}
                      </div>
                      <div className="class-meta">
                        <div className="class-name">{klass.label}</div>
                        <div className="class-sub">{klass.students} students</div>
                      </div>
                      {klass.pending > 0 && (
                        <span className="status-pill warn">{klass.pending} pending</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel__header">
                <h2>Summary</h2>
              </div>
              <div className="summary-grid four-up">
                {summary.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="summary-card"
                    onClick={() => navigate(item.route)}
                  >
                    <div className="summary-label">{item.label}</div>
                    <div className="summary-value">{item.value}</div>
                  </button>
                ))}
              </div>
            </section>
          </aside>

          <main className="f-main">
            <section className="panel">
              <div className="panel__header">
                <h2>Recent Submissions</h2>
                <button className="link-btn" type="button" onClick={() => navigate('/reviews')}>View all</button>
              </div>
              <div className="activity-list">
                {recentSubmissions.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#6B5A4D' }}>
                    No recent submissions
                  </div>
                ) : (
                  recentSubmissions.map((item) => (
                    <div key={item.id} className="activity-row">
                      <div className="activity-icon">{item.type === 'completed' ? 'OK' : 'NEW'}</div>
                      <div className="activity-copy">
                        <div className="activity-title">{item.title}</div>
                        <div className="activity-sub">{item.student} | {item.klass} | {item.time}</div>
                      </div>
                      <span className={`status-pill ${item.type === 'completed' ? 'ok' : 'neutral'}`}>
                        {item.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
};

export default Homepage;
