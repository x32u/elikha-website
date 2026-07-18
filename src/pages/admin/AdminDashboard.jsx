import React from 'react';
import './styles/AdminDashboard.css';
import AdminShell from './components/AdminShell';
import {
  createAdminActivity,
  fetchAdminDashboardData,
  fetchClassDirectory,
} from '../../services/adminApi';
import {
  AR_MODEL_LIBRARY_UPDATED_EVENT,
  DEFAULT_MODEL_ID,
  DEFAULT_PUZZLE_PIECES,
  getArModelLibrary,
  PUZZLE_PIECE_OPTIONS,
} from '../../utils/activityArConfig';

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const statusClass = (status) => {
  const value = String(status || '').toLowerCase();
  if (value.includes('reviewed')) return 'approved';
  if (value.includes('reject')) return 'rejected';
  return 'pending';
};

function AdminDashboard({ onNavigate, role = 'Admin' }) {
  const isSuperAdmin = role === 'SuperAdmin';
  const homePageKey = isSuperAdmin ? 'sa-dashboard' : 'homepage';
  const [isAllSubmissionsOpen, setIsAllSubmissionsOpen] = React.useState(false);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [createError, setCreateError] = React.useState('');
  const [createBusy, setCreateBusy] = React.useState(false);

  const [dashboard, setDashboard] = React.useState({
    metrics: {
      totalUsers: 0,
      activeActivities: 0,
      totalSubmissions: 0,
      pendingReview: 0,
      totalClasses: 0,
      activitiesCreated: 0,
    },
    trend: {
      weekLabels: [],
      newUsersByWeek: [],
      submissionsByWeek: [],
    },
    recentSubmissions: [],
  });

  const [classOptions, setClassOptions] = React.useState([]);
  const [modelOptions, setModelOptions] = React.useState(() => getArModelLibrary());

  const [createDraft, setCreateDraft] = React.useState({
    title: '',
    description: '',
    classId: '',
    dueDate: '',
    instructions: '',
    modelId: DEFAULT_MODEL_ID,
    puzzlePieces: DEFAULT_PUZZLE_PIECES,
  });

  const closeAllModals = React.useCallback(() => {
    setIsAllSubmissionsOpen(false);
    setIsCreateOpen(false);
    setCreateError('');
  }, []);

  React.useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeAllModals();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closeAllModals]);

  React.useEffect(() => {
    const refreshModels = () => setModelOptions(getArModelLibrary());
    window.addEventListener(AR_MODEL_LIBRARY_UPDATED_EVENT, refreshModels);
    return () => window.removeEventListener(AR_MODEL_LIBRARY_UPDATED_EVENT, refreshModels);
  }, []);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError('');

    const [dashboardResult, classesResult] = await Promise.all([
      fetchAdminDashboardData(),
      fetchClassDirectory(),
    ]);

    if (!dashboardResult.success) {
      setError(dashboardResult.error || 'Failed to load dashboard');
    } else {
      setDashboard(dashboardResult.data);
    }

    if (classesResult.success) {
      setClassOptions(classesResult.data || []);
      setCreateDraft((prev) => ({
        ...prev,
        classId: prev.classId || classesResult.data?.[0]?.id || '',
      }));
    } else {
      setClassOptions([]);
      if (!dashboardResult.success) {
        setError(classesResult.error || 'Failed to load classes');
      }
    }

    setLoading(false);
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const resetCreateForm = React.useCallback(() => {
    setCreateDraft({
      title: '',
      description: '',
      classId: classOptions[0]?.id || '',
      dueDate: '',
      instructions: '',
      modelId: DEFAULT_MODEL_ID,
      puzzlePieces: DEFAULT_PUZZLE_PIECES,
    });
    setCreateError('');
  }, [classOptions]);

  const handleOpenCreate = () => {
    resetCreateForm();
    setIsCreateOpen(true);
  };

  const submitCreate = async () => {
    setCreateError('');

    const title = createDraft.title.trim();
    const classId = createDraft.classId;

    if (!title) {
      setCreateError('Activity title is required.');
      return;
    }

    if (!classId) {
      setCreateError('Please select a class.');
      return;
    }

    setCreateBusy(true);

    const composedDescription = [createDraft.description.trim(), createDraft.instructions.trim()]
      .filter(Boolean)
      .join('\n\n');

    const result = await createAdminActivity({
      title,
      description: composedDescription,
      classId,
      dueDate: createDraft.dueDate || null,
      modelId: createDraft.modelId,
      puzzlePieces: createDraft.puzzlePieces,
      allowedObjectIds: ['cube', 'sphere', 'cone', 'cylinder'],
    });

    if (!result.success) {
      setCreateError(result.error || 'Failed to create activity.');
      setCreateBusy(false);
      return;
    }

    setCreateBusy(false);
    setIsCreateOpen(false);
    await loadData();
  };

  const recentSubmissions = dashboard.recentSubmissions.slice(0, 5);

  return (
    <AdminShell
      active={homePageKey}
      onNavigate={onNavigate}
      className="page-homepage"
      homePageKey={homePageKey}
      showAudit={isSuperAdmin}
      showPasswordResets={isSuperAdmin}
      auditPageKey="audit"
    >
      <header className="dash-header">
        <h1 className="dash-title">Dashboard</h1>
        <p className="dash-subtitle">Live overview of users, classes, activities, and submissions.</p>
      </header>

      {error && <div className="dash-modal-error">{error}</div>}

      <section className="dash-stats">
        <div className="stat">
          <div className="stat-label">Total Users</div>
          <div className="stat-value">{dashboard.metrics.totalUsers}</div>
          <div className="stat-meta">All roles</div>
        </div>

        <div className="stat">
          <div className="stat-label">Active Activities</div>
          <div className="stat-value">{dashboard.metrics.activeActivities}</div>
          <div className="stat-meta">Currently active</div>
        </div>

        <div className="stat">
          <div className="stat-label">Pending Reviews</div>
          <div className="stat-value">{dashboard.metrics.pendingReview}</div>
          <div className="stat-meta">Need grading</div>
        </div>
      </section>

      <h2 className="dash-h2">System Analytics</h2>

      <section className="dash-analytics">
        <div className="panel">
          <div className="panel-title">New Users by Week</div>
          <div className="panel-big">{dashboard.trend.newUsersByWeek.reduce((a, b) => a + b, 0)}</div>
          <div className="panel-sub">Last {dashboard.trend.weekLabels.length} weeks</div>

          <div className="chart-area">
            {dashboard.trend.newUsersByWeek.map((value, index) => (
              <span key={`users-${dashboard.trend.weekLabels[index] || index}`} className="panel-sub">
                W{index + 1}: {value}
              </span>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">Submissions by Week</div>
          <div className="panel-big">{dashboard.metrics.totalSubmissions}</div>
          <div className="panel-sub">Total submissions recorded</div>

          <div className="bars">
            {dashboard.trend.submissionsByWeek.map((value, index) => (
              <div className="barcol" key={`submissions-${dashboard.trend.weekLabels[index] || index}`}>
                <div
                  className="bar"
                  style={{
                    height: `${Math.max(14, value * 8)}px`,
                  }}
                />
                <span>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <h2 className="dash-h2">Recent Activity Submissions</h2>

      <section className="dash-tablewrap">
        <table className="dash-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Activity</th>
              <th>Submission Date</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4}>Loading submissions...</td>
              </tr>
            ) : recentSubmissions.length === 0 ? (
              <tr>
                <td colSpan={4}>No submissions yet.</td>
              </tr>
            ) : (
              recentSubmissions.map((row) => (
                <tr key={row.id}>
                  <td>{row.student_name}</td>
                  <td>{row.activity_title}</td>
                  <td>{formatDate(row.submitted_at)}</td>
                  <td>
                    <span className={`pill ${statusClass(row.status)}`}>{row.status}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <div className="dash-actions">
        <button className="btn secondary" type="button" onClick={() => setIsAllSubmissionsOpen(true)}>
          View All
        </button>
        <button className="btn primary" type="button" onClick={handleOpenCreate}>
          Create New Activity
        </button>
      </div>

      {isAllSubmissionsOpen && (
        <div className="dash-modal-backdrop" role="presentation" onClick={closeAllModals}>
          <div
            className="dash-modal"
            role="dialog"
            aria-modal="true"
            aria-label="All recent submissions"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dash-modal-head">
              <div className="dash-modal-title">All Recent Submissions</div>
              <button className="dash-modal-x" type="button" onClick={closeAllModals} aria-label="Close">
                x
              </button>
            </div>

            <div className="dash-modal-body">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Activity</th>
                    <th>Submission Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.recentSubmissions.length === 0 ? (
                    <tr>
                      <td colSpan={4}>No submissions yet.</td>
                    </tr>
                  ) : (
                    dashboard.recentSubmissions.map((row) => (
                      <tr key={`all-${row.id}`}>
                        <td>{row.student_name}</td>
                        <td>{row.activity_title}</td>
                        <td>{formatDate(row.submitted_at)}</td>
                        <td>
                          <span className={`pill ${statusClass(row.status)}`}>{row.status}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {isCreateOpen && (
        <div className="dash-modal-backdrop" role="presentation" onClick={closeAllModals}>
          <div
            className="dash-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Create new activity"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dash-modal-head">
              <div className="dash-modal-title">Create New Activity</div>
              <button className="dash-modal-x" type="button" onClick={closeAllModals} aria-label="Close">
                x
              </button>
            </div>

            <div className="dash-modal-body">
              <div className="dash-create">
                {createError && <div className="dash-modal-error">{createError}</div>}

                <label className="dash-field">
                  <span>Activity Title</span>
                  <input
                    className="dash-input"
                    value={createDraft.title}
                    onChange={(event) =>
                      setCreateDraft((prev) => ({
                        ...prev,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Enter activity title"
                  />
                </label>

                <label className="dash-field">
                  <span>Activity Description</span>
                  <textarea
                    className="dash-textarea"
                    value={createDraft.description}
                    onChange={(event) =>
                      setCreateDraft((prev) => ({
                        ...prev,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Describe the activity"
                  />
                </label>

                <label className="dash-field">
                  <span>Assign Class</span>
                  <select
                    className="dash-input"
                    value={createDraft.classId}
                    onChange={(event) =>
                      setCreateDraft((prev) => ({
                        ...prev,
                        classId: event.target.value,
                      }))
                    }
                  >
                    {classOptions.length === 0 ? <option value="">No classes available</option> : null}
                    {classOptions.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name} ({row.grade || '—'}) - {row.teacher_name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="dash-field">
                  <span>Base 3D Model</span>
                  <select
                    className="dash-input"
                    value={createDraft.modelId}
                    onChange={(event) =>
                      setCreateDraft((prev) => ({
                        ...prev,
                        modelId: event.target.value,
                      }))
                    }
                  >
                    {modelOptions.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="dash-field">
                  <span>Puzzle Pieces</span>
                  <select
                    className="dash-input"
                    value={createDraft.puzzlePieces}
                    onChange={(event) =>
                      setCreateDraft((prev) => ({
                        ...prev,
                        puzzlePieces: Number(event.target.value),
                      }))
                    }
                  >
                    {PUZZLE_PIECE_OPTIONS.map((count) => (
                      <option key={count} value={count}>
                        {count === 0 ? 'Off' : `${count} pieces`}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="dash-field">
                  <span>Due Date</span>
                  <input
                    className="dash-input"
                    type="date"
                    value={createDraft.dueDate}
                    onChange={(event) =>
                      setCreateDraft((prev) => ({
                        ...prev,
                        dueDate: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="dash-field">
                  <span>Instructions (Optional)</span>
                  <textarea
                    className="dash-textarea"
                    value={createDraft.instructions}
                    onChange={(event) =>
                      setCreateDraft((prev) => ({
                        ...prev,
                        instructions: event.target.value,
                      }))
                    }
                    placeholder="Add detailed instructions for students"
                  />
                </label>
              </div>
            </div>

            <div className="dash-modal-actions">
              <button className="btn secondary" type="button" onClick={closeAllModals}>
                Cancel
              </button>
              <button
                className="btn primary"
                type="button"
                onClick={submitCreate}
                disabled={createBusy || !createDraft.title.trim() || !createDraft.classId}
              >
                {createBusy ? 'Creating...' : 'Create Activity'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

export default AdminDashboard;
