import React from 'react';
import './styles/AdminReports.css';
import AdminShell from './components/AdminShell';
import { fetchAdminAnalytics } from '../../services/adminApi';
import { serializeCsvRow } from '../../utils/reportAnalytics';

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

const createEmptyAnalytics = () => ({
  summary: {
    totalUsers: 0,
    totalActivities: 0,
    totalAssignments: 0,
    totalSubmissions: 0,
    reviewedSubmissions: 0,
    averageScore: null,
    classesCount: 0,
    pendingReviews: 0,
    missing: 0,
    completionRate: null,
    reviewRate: null,
    onTimeRate: null,
  },
  activityPerformance: [],
  studentEngagement: [],
  engagedStudentCount: 0,
  teacherPerformance: [],
  modelUsage: [],
  submissionTrend: [],
  dataQuality: {},
});

function AdminReports({ onNavigate, role }) {
  const isSuperAdmin = role === 'SuperAdmin';
  const homePageKey = isSuperAdmin ? 'sa-dashboard' : 'homepage';
  const requestSequence = React.useRef(0);
  const lastActivityTriggerRef = React.useRef(null);
  const modalRef = React.useRef(null);
  const modalCloseRef = React.useRef(null);

  const [range, setRange] = React.useState('30d');
  const [selectedActivity, setSelectedActivity] = React.useState(null);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [analytics, setAnalytics] = React.useState(createEmptyAnalytics);

  const loadAnalytics = React.useCallback(async () => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    setLoading(true);
    setError('');

    try {
      const result = await fetchAdminAnalytics({ days: RANGE_TO_DAYS[range] || 30 });
      if (requestSequence.current !== requestId) return;
      if (!result.success) throw new Error(result.error || 'Failed to load analytics data.');
      setAnalytics(result.data);
    } catch (loadError) {
      if (requestSequence.current !== requestId) return;
      setError(loadError?.message || 'Failed to load analytics data.');
      setAnalytics(createEmptyAnalytics());
    } finally {
      if (requestSequence.current === requestId) setLoading(false);
    }
  }, [range]);

  React.useEffect(() => {
    loadAnalytics();
    return () => {
      requestSequence.current += 1;
    };
  }, [loadAnalytics]);

  const closeActivityModal = React.useCallback(() => {
    setSelectedActivity(null);
    window.setTimeout(() => lastActivityTriggerRef.current?.focus(), 0);
  }, []);

  React.useEffect(() => {
    if (!selectedActivity) return undefined;
    modalCloseRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeActivityModal();
        return;
      }

      if (event.key === 'Tab' && modalRef.current) {
        const focusable = [...modalRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
          .filter((element) => !element.disabled);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closeActivityModal, selectedActivity]);

  const exportCSV = () => {
    const header = [
      'Activity Name',
      'Completion Rate',
      'Assigned',
      'Submissions',
      'Pending Review',
      'Missing',
      'Late Submissions',
      'Average Rating (1-5)',
    ];
    const rows = analytics.activityPerformance.map((item) => [
      item.activity_title,
      item.completion_rate == null ? 'N/A' : `${item.completion_rate}%`,
      String(item.assigned),
      String(item.submissions),
      String(item.pending_review || 0),
      String(item.missing || 0),
      String(item.late_submissions || 0),
      item.average_score == null ? 'N/A' : String(item.average_score),
    ]);

    const csv = `\uFEFF${[header, ...rows].map(serializeCsvRow).join('\n')}`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `elikha-activity-snapshot-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const trendMax = Math.max(1, ...analytics.submissionTrend.map((item) => item.count));
  const studentMax = Math.max(1, ...analytics.studentEngagement.map((item) => item.submissions));
  const formatPercent = (value) => value == null ? 'N/A' : `${value}%`;

  return (
    <AdminShell
      active="reports"
      onNavigate={onNavigate}
      className="page-reports"
      homePageKey={homePageKey}
      showAudit={isSuperAdmin}
      auditPageKey="audit"
    >
      <header className="rpt-header">
        <div className="rpt-headrow">
          <div>
            <h1 className="rpt-title">Reports &amp; Analytics</h1>
            <p className="rpt-subtitle">Current platform and assignment totals with a selectable submission-event trend.</p>
          </div>

          <div className="rpt-actions">
            <label className="rpt-range">
              <span className="rpt-range-caption">Submission trend period</span>
              <select className="rpt-rangebtn rpt-range-select" value={range} onChange={(event) => setRange(event.target.value)}>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
              </select>
            </label>

            <button className="rpt-export" type="button" onClick={exportCSV} disabled={loading || Boolean(error)}>
              Export CSV
            </button>
          </div>
        </div>
      </header>

      {error && <div className="rpt-detail-note">{error}</div>}

      <h2 className="rpt-h2">Platform Overview</h2>
      <section className="rpt-summary-grid" aria-label="Platform totals">
        {[
          ['Users', analytics.summary.totalUsers],
          ['Classes', analytics.summary.classesCount],
          ['Activities', analytics.summary.totalActivities],
          ['Assigned Work', analytics.summary.totalAssignments],
          ['Pending Reviews', analytics.summary.pendingReviews],
          ['Missing Work', analytics.summary.missing],
        ].map(([label, value]) => (
          <article className="rpt-summary-card" key={label}>
            <span>{label}</span>
            <strong>{loading ? '…' : value}</strong>
          </article>
        ))}
      </section>

      <section className="rpt-grid2" aria-label="Platform health analytics">
        <article className="rpt-card">
          <div className="rpt-card-title">Submission Trend</div>
          <div className="rpt-card-big">{loading ? '…' : analytics.summary.totalSubmissions}</div>
          <div className="rpt-card-sub"><span className="rpt-muted">New submissions · {rangeLabel(range)}</span></div>
          {analytics.submissionTrend.length > 0 && analytics.summary.totalSubmissions > 0 ? (
            <div className="rpt-trend" aria-label={`Submission counts for ${rangeLabel(range)}`}>
              {analytics.submissionTrend.map((item) => (
                <div
                  className="rpt-trend-item"
                  key={item.key}
                  title={`${item.label}: ${item.count}`}
                  role="img"
                  aria-label={`${item.label}: ${item.count} submission${item.count === 1 ? '' : 's'}`}
                >
                  <strong>{item.count}</strong>
                  <div className="rpt-trend-track" aria-hidden="true">
                    <span style={{ height: `${Math.max(0, (item.count / trendMax) * 100)}%` }} />
                  </div>
                  <small>{item.label}</small>
                </div>
              ))}
            </div>
          ) : (
            <div className="rpt-empty">No submissions were received in this period.</div>
          )}
        </article>

        <article className="rpt-card rpt-review-card">
          <div className="rpt-card-title">Review &amp; Rating Health</div>
          <div className="rpt-rating-value">
            <strong>{loading ? '…' : analytics.summary.averageScore ?? 'N/A'}</strong>
            <span>{analytics.summary.averageScore == null ? 'No final ratings' : 'out of 5 stars'}</span>
          </div>
          <dl className="rpt-health-list">
            <div><dt>Overall completion</dt><dd>{formatPercent(analytics.summary.completionRate)}</dd></div>
            <div><dt>Submitted work reviewed</dt><dd>{formatPercent(analytics.summary.reviewRate)}</dd></div>
            <div><dt>On-time submissions</dt><dd>{formatPercent(analytics.summary.onTimeRate)}</dd></div>
            <div><dt>Reviews completed in range</dt><dd>{analytics.summary.reviewedSubmissions}</dd></div>
          </dl>
        </article>
      </section>

      <h2 className="rpt-h2">Activity Performance</h2>
      <div className="rpt-tablewrap" role="region" aria-label="Activity performance table" tabIndex={0}>
        <table className="rpt-table">
          <thead>
            <tr>
              <th scope="col">Activity Name</th>
              <th scope="col">Completion Rate</th>
              <th scope="col">Assigned</th>
              <th scope="col">Submissions</th>
              <th scope="col">Pending Review</th>
              <th scope="col">Missing</th>
              <th scope="col">Avg. Rating</th>
              <th scope="col" className="rpt-th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8}>Loading analytics...</td>
              </tr>
            ) : analytics.activityPerformance.length === 0 ? (
              <tr>
                <td colSpan={8}>No activity data is available.</td>
              </tr>
            ) : (
              analytics.activityPerformance.map((activity) => (
                <tr key={activity.activity_id}>
                  <th scope="row">{activity.activity_title}</th>
                  <td>
                    <div className="rpt-progress">
                      <div className="rpt-meter" aria-hidden="true">
                        <div className="rpt-track" />
                        <div
                          className="rpt-fill"
                          style={{
                            width: `${Math.max(0, Math.min(100, activity.completion_rate || 0))}%`,
                          }}
                        />
                      </div>
                      <div className="rpt-pct">{formatPercent(activity.completion_rate)}</div>
                    </div>
                  </td>
                  <td className="rpt-muted">{activity.assigned}</td>
                  <td className="rpt-muted">{activity.submissions}</td>
                  <td className="rpt-muted">{activity.pending_review || 0}</td>
                  <td className={activity.missing ? 'rpt-bad' : 'rpt-muted'}>{activity.missing || 0}</td>
                  <td className="rpt-muted">{activity.average_score == null ? 'N/A' : `${activity.average_score}/5`}</td>
                  <td className="rpt-actions-cell">
                    <button
                      className="rpt-view"
                      type="button"
                      onClick={(event) => {
                        lastActivityTriggerRef.current = event.currentTarget;
                        setSelectedActivity(activity);
                      }}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="rpt-h2">Student Engagement</h2>
      <section className="rpt-grid2" aria-label="Student engagement">
        <div className="rpt-card">
          <div className="rpt-card-title">Top Students by Submission Count</div>
          <div className="rpt-card-big">{analytics.engagedStudentCount ?? analytics.studentEngagement.length}</div>
          <div className="rpt-card-sub">
            <span className="rpt-muted">Students with activity in this range</span>
          </div>
          {analytics.studentEngagement.length > 0 ? (
            <div className="rpt-bars student">
              {analytics.studentEngagement.slice(0, 6).map((student) => (
                <div className="rpt-barcol" key={student.student_id}>
                  <div
                    className="rpt-bar hS"
                    style={{ height: `${(student.submissions / studentMax) * 135}px` }}
                    aria-hidden="true"
                  />
                  <span>{student.student_name}<small>{student.submissions}</small></span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rpt-empty">No student submissions were received in this period.</div>
          )}
        </div>

        <div className="rpt-card">
          <div className="rpt-card-title">Teacher Completion Rates</div>
          <div className="rpt-card-big">{analytics.teacherPerformance.length}</div>
          <div className="rpt-card-sub">
            <span className="rpt-muted">Teachers with active assignments</span>
          </div>
          {analytics.teacherPerformance.length > 0 ? (
            <div className="rpt-bars ratings">
              {analytics.teacherPerformance.slice(0, 6).map((teacher) => (
                <div className="rpt-barcol" key={teacher.teacher_id}>
                  <div
                    className="rpt-bar hR"
                    style={{ height: `${Math.max(0, teacher.completion_rate || 0)}px` }}
                    aria-hidden="true"
                  />
                  <span>{teacher.teacher_name}<small>{formatPercent(teacher.completion_rate)}</small></span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rpt-empty">No teachers have active assignments yet.</div>
          )}
        </div>
      </section>

      {selectedActivity && (
        <div className="rpt-modal-backdrop" role="presentation" onClick={closeActivityModal}>
          <div
            ref={modalRef}
            className="rpt-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rpt-activity-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="rpt-modal-head">
              <div className="rpt-modal-title" id="rpt-activity-dialog-title">{selectedActivity.activity_title}</div>
              <button
                ref={modalCloseRef}
                className="rpt-modal-x"
                type="button"
                onClick={closeActivityModal}
                aria-label="Close"
              >
                x
              </button>
            </div>

            <div className="rpt-modal-body">
              <div className="rpt-kpis">
                <div className="rpt-kpi">
                  <div className="rpt-kpi-label">Completion Rate</div>
                  <div className="rpt-kpi-value">{formatPercent(selectedActivity.completion_rate)}</div>
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
                  <div className="rpt-kpi-label">Pending Review</div>
                  <div className="rpt-kpi-value">{selectedActivity.pending_review || 0}</div>
                </div>
                <div className="rpt-kpi">
                  <div className="rpt-kpi-label">Missing</div>
                  <div className="rpt-kpi-value">{selectedActivity.missing || 0}</div>
                </div>
                <div className="rpt-kpi">
                  <div className="rpt-kpi-label">Average Rating</div>
                  <div className="rpt-kpi-value">
                    {selectedActivity.average_score == null ? 'N/A' : `${selectedActivity.average_score}/5`}
                  </div>
                </div>
              </div>
            </div>

            <div className="rpt-modal-actions">
              <button className="rpt-btn ghost" type="button" onClick={closeActivityModal}>
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
