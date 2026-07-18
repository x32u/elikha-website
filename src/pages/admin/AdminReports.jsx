import React from 'react';
import './styles/AdminReports.css';
import AdminShell from './components/AdminShell';
import { fetchAdminAnalytics } from '../../services/adminApi';

const RANGE_TO_DAYS = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

const rangeLabel = (range) => {
  if (range === '7d') return 'Last 7 Days';
  if (range === '90d') return 'Last 90 Days';
  return 'Last 30 Days';
};

function AdminReports({ onNavigate, role }) {
  const isSuperAdmin = role === 'SuperAdmin';
  const homePageKey = isSuperAdmin ? 'sa-dashboard' : 'homepage';

  const [range, setRange] = React.useState('30d');
  const [openMenu, setOpenMenu] = React.useState(false);
  const [selectedActivity, setSelectedActivity] = React.useState(null);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [analytics, setAnalytics] = React.useState({
    summary: {
      totalUsers: 0,
      totalActivities: 0,
      totalAssignments: 0,
      totalSubmissions: 0,
      reviewedSubmissions: 0,
      averageScore: null,
      classesCount: 0,
    },
    activityPerformance: [],
    studentEngagement: [],
    teacherPerformance: [],
    modelUsage: [],
  });

  const loadAnalytics = React.useCallback(async () => {
    setLoading(true);
    setError('');

    const result = await fetchAdminAnalytics({ days: RANGE_TO_DAYS[range] || 30 });
    if (!result.success) {
      setError(result.error || 'Failed to load analytics data.');
      setAnalytics((prev) => ({
        ...prev,
        activityPerformance: [],
        studentEngagement: [],
        teacherPerformance: [],
        modelUsage: [],
      }));
      setLoading(false);
      return;
    }

    setAnalytics(result.data);
    setLoading(false);
  }, [range]);

  React.useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  React.useEffect(() => {
    const onDocClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest?.('.rpt-range')) return;
      setOpenMenu(false);
    };

    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  React.useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSelectedActivity(null);
        setOpenMenu(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const exportCSV = () => {
    const header = ['Activity Name', 'Completion Rate', 'Assigned', 'Submissions', 'Average Score'];
    const rows = analytics.activityPerformance.map((item) => [
      item.activity_title,
      `${item.completion_rate}%`,
      String(item.assigned),
      String(item.submissions),
      item.average_score == null ? 'N/A' : String(item.average_score),
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `elikha-analytics-${range}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const reviewedPercent = analytics.summary.totalSubmissions
    ? Math.round((analytics.summary.reviewedSubmissions / analytics.summary.totalSubmissions) * 100)
    : 0;

  return (
    <AdminShell
      active="reports"
      onNavigate={onNavigate}
      className="page-reports"
      homePageKey={homePageKey}
      showAudit={isSuperAdmin}
      showPasswordResets={isSuperAdmin}
      auditPageKey="audit"
    >
      <header className="rpt-header">
        <div className="rpt-headrow">
          <h1 className="rpt-title">Reports &amp; Analytics</h1>

          <div className="rpt-actions">
            <div className="rpt-range">
              <button
                className="rpt-rangebtn"
                type="button"
                aria-haspopup="menu"
                aria-expanded={openMenu}
                onClick={() => setOpenMenu((prev) => !prev)}
              >
                <span className="rpt-range-label">{rangeLabel(range)}</span>
                <span className="rpt-range-caret" aria-hidden="true">
                  <svg
                    viewBox="0 0 20 20"
                    width="16"
                    height="16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M5 7.5 10 12.5 15 7.5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </button>

              {openMenu && (
                <div className="rpt-menu" role="menu" aria-label="Date range">
                  {[
                    { key: '7d', label: 'Last 7 Days' },
                    { key: '30d', label: 'Last 30 Days' },
                    { key: '90d', label: 'Last 90 Days' },
                  ].map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      role="menuitemradio"
                      aria-checked={range === option.key}
                      className={`rpt-menuitem ${range === option.key ? 'active' : ''}`}
                      onClick={() => {
                        setRange(option.key);
                        setOpenMenu(false);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button className="rpt-export" type="button" onClick={exportCSV}>
              Export CSV
            </button>
          </div>
        </div>
      </header>

      {error && <div className="rpt-detail-note">{error}</div>}

      <h2 className="rpt-h2">Platform Health</h2>
      <section className="rpt-grid2" aria-label="Platform health analytics">
        <div className="rpt-card">
          <div className="rpt-card-title">Total Submissions</div>
          <div className="rpt-card-big">{loading ? '...' : analytics.summary.totalSubmissions}</div>
          <div className="rpt-card-sub">
            <span className="rpt-muted">{rangeLabel(range)}</span>
          </div>
          <div className="rpt-area">
            <div className="rpt-area-fill" style={{ width: `${Math.max(4, reviewedPercent)}%` }} />
            <div className="rpt-area-line" />
          </div>
          <div className="rpt-axis">
            <span>Reviewed</span>
            <span>{reviewedPercent}%</span>
          </div>
        </div>

        <div className="rpt-card">
          <div className="rpt-card-title">Average Score</div>
          <div className="rpt-card-big">
            {loading
              ? '...'
              : analytics.summary.averageScore == null
                ? 'N/A'
                : analytics.summary.averageScore}
          </div>
          <div className="rpt-card-sub">
            <span className="rpt-muted">Across reviewed submissions</span>
          </div>
          <div className="rpt-bars">
            {analytics.modelUsage.slice(0, 4).map((item) => (
              <div className="rpt-barcol" key={item.model_id}>
                <div className="rpt-bar" style={{ height: `${Math.max(14, item.count * 12)}px` }} />
                <span>{item.model_id}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <h2 className="rpt-h2">Activity Performance</h2>
      <section className="rpt-tablewrap" aria-label="Activity performance table">
        <table className="rpt-table">
          <thead>
            <tr>
              <th>Activity Name</th>
              <th>Completion Rate</th>
              <th>Assigned</th>
              <th>Submissions</th>
              <th className="rpt-th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5}>Loading analytics...</td>
              </tr>
            ) : analytics.activityPerformance.length === 0 ? (
              <tr>
                <td colSpan={5}>No activity data in this range.</td>
              </tr>
            ) : (
              analytics.activityPerformance.map((activity) => (
                <tr key={activity.activity_id}>
                  <td>{activity.activity_title}</td>
                  <td>
                    <div className="rpt-progress">
                      <div className="rpt-meter" aria-hidden="true">
                        <div className="rpt-track" />
                        <div
                          className="rpt-fill"
                          style={{
                            width: `${Math.max(0, Math.min(100, activity.completion_rate))}%`,
                          }}
                        />
                      </div>
                      <div className="rpt-pct">{activity.completion_rate}%</div>
                    </div>
                  </td>
                  <td className="rpt-muted">{activity.assigned}</td>
                  <td className="rpt-muted">{activity.submissions}</td>
                  <td className="rpt-actions-cell">
                    <button className="rpt-view" type="button" onClick={() => setSelectedActivity(activity)}>
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <h2 className="rpt-h2">Student Engagement</h2>
      <section className="rpt-grid2" aria-label="Student engagement">
        <div className="rpt-card">
          <div className="rpt-card-title">Top Students by Submission Count</div>
          <div className="rpt-card-big">{analytics.studentEngagement.length}</div>
          <div className="rpt-card-sub">
            <span className="rpt-muted">Students with activity in this range</span>
          </div>
          <div className="rpt-bars student">
            {analytics.studentEngagement.slice(0, 6).map((student) => (
              <div className="rpt-barcol" key={student.student_id}>
                <div className="rpt-bar hS" style={{ height: `${Math.max(18, student.submissions * 12)}px` }} />
                <span>{student.student_name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rpt-card">
          <div className="rpt-card-title">Teacher Completion Rates</div>
          <div className="rpt-card-big">{analytics.teacherPerformance.length}</div>
          <div className="rpt-card-sub">
            <span className="rpt-muted">Teachers with active assignments</span>
          </div>
          <div className="rpt-bars ratings">
            {analytics.teacherPerformance.slice(0, 6).map((teacher) => (
              <div className="rpt-barcol" key={teacher.teacher_id}>
                <div
                  className="rpt-bar hR"
                  style={{ height: `${Math.max(16, teacher.completion_rate)}px` }}
                />
                <span>{teacher.teacher_name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {selectedActivity && (
        <div className="rpt-modal-backdrop" role="presentation" onClick={() => setSelectedActivity(null)}>
          <div
            className="rpt-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Activity details"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="rpt-modal-head">
              <div className="rpt-modal-title">{selectedActivity.activity_title}</div>
              <button
                className="rpt-modal-x"
                type="button"
                onClick={() => setSelectedActivity(null)}
                aria-label="Close"
              >
                x
              </button>
            </div>

            <div className="rpt-modal-body">
              <div className="rpt-kpis">
                <div className="rpt-kpi">
                  <div className="rpt-kpi-label">Completion Rate</div>
                  <div className="rpt-kpi-value">{selectedActivity.completion_rate}%</div>
                </div>
                <div className="rpt-kpi">
                  <div className="rpt-kpi-label">Assigned</div>
                  <div className="rpt-kpi-value">{selectedActivity.assigned}</div>
                </div>
                <div className="rpt-kpi">
                  <div className="rpt-kpi-label">Submissions</div>
                  <div className="rpt-kpi-value">{selectedActivity.submissions}</div>
                </div>
                <div className="rpt-kpi">
                  <div className="rpt-kpi-label">Average Score</div>
                  <div className="rpt-kpi-value">
                    {selectedActivity.average_score == null ? 'N/A' : selectedActivity.average_score}
                  </div>
                </div>
              </div>
            </div>

            <div className="rpt-modal-actions">
              <button className="rpt-btn ghost" type="button" onClick={() => setSelectedActivity(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

export default AdminReports;
