import React from 'react';
import AdminShell from '../admin/components/AdminShell';
import './styles/SuperAdminAudit.css';
import { fetchSuperAdminAuditEvents } from '../../services/adminApi';

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const formatDate = (value) => {
  const date = parseDate(value);
  if (!date) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const actionTone = (action) => {
  const text = String(action || '').toLowerCase();
  if (text.includes('deleted') || text.includes('remove')) return 'danger';
  if (text.includes('reviewed') || text.includes('updated')) return 'info';
  if (text.includes('created') || text.includes('submitted')) return 'success';
  return 'neutral';
};

function SuperAdminAudit({ onNavigate }) {
  const [query, setQuery] = React.useState('');
  const [actionFilter, setActionFilter] = React.useState('All Actions');
  const [roleFilter, setRoleFilter] = React.useState('All Roles');
  const [rangeFilter, setRangeFilter] = React.useState('All Time');
  const [openMenu, setOpenMenu] = React.useState(null);
  const [viewing, setViewing] = React.useState(null);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [logs, setLogs] = React.useState([]);

  const loadAudit = React.useCallback(async () => {
    setLoading(true);
    setError('');

    const result = await fetchSuperAdminAuditEvents({ limit: 300 });
    if (!result.success) {
      setError(result.error || 'Failed to load audit logs.');
      setLogs([]);
      setLoading(false);
      return;
    }

    setLogs(result.data || []);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    loadAudit();
  }, [loadAudit]);

  React.useEffect(() => {
    const onDocClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest?.('.saud-filters')) return;
      setOpenMenu(null);
    };

    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  React.useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpenMenu(null);
        setViewing(null);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const actions = React.useMemo(() => {
    const set = new Set(logs.map((log) => log.action).filter(Boolean));
    return ['All Actions', ...Array.from(set).sort()];
  }, [logs]);

  const roles = React.useMemo(() => {
    const set = new Set(logs.map((log) => log.role).filter(Boolean));
    return ['All Roles', ...Array.from(set).sort()];
  }, [logs]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = new Date();

    const inRange = (timestamp) => {
      if (rangeFilter === 'All Time') return true;
      const date = parseDate(timestamp);
      if (!date) return false;

      const diffMs = now.getTime() - date.getTime();
      const days = diffMs / (1000 * 60 * 60 * 24);

      if (rangeFilter === 'Daily') return days <= 1;
      if (rangeFilter === 'Weekly') return days <= 7;
      if (rangeFilter === 'Monthly') return days <= 30;
      return true;
    };

    return logs.filter((log) => {
      const matchesQuery =
        q.length === 0 ||
        String(log.user || '').toLowerCase().includes(q) ||
        String(log.role || '').toLowerCase().includes(q) ||
        String(log.action || '').toLowerCase().includes(q) ||
        String(log.details || '').toLowerCase().includes(q);

      const matchesAction = actionFilter === 'All Actions' || log.action === actionFilter;
      const matchesRole = roleFilter === 'All Roles' || log.role === roleFilter;

      return inRange(log.timestamp) && matchesQuery && matchesAction && matchesRole;
    });
  }, [logs, query, actionFilter, roleFilter, rangeFilter]);

  const stats = React.useMemo(() => {
    const uniqueUsers = new Set(filtered.map((log) => log.user)).size;
    return {
      total: filtered.length,
      uniqueUsers,
    };
  }, [filtered]);

  const clearAll = () => {
    setQuery('');
    setActionFilter('All Actions');
    setRoleFilter('All Roles');
    setRangeFilter('All Time');
    setOpenMenu(null);
  };

  return (
    <AdminShell
      active="audit"
      onNavigate={onNavigate}
      className="page-superadmin page-superadmin-audit"
      homePageKey="sa-dashboard"
      showAudit={true}
      showPasswordResets={true}
      auditPageKey="audit"
    >
      <header className="saud-header">
        <div className="saud-titlewrap">
          <h1 className="saud-title">Audit Trail</h1>
          <p className="saud-subtitle">Track account, activity, and submission events.</p>
        </div>
      </header>

      {error && <div className="saud-empty">{error}</div>}

      <section className="saud-stats" aria-label="Summary">
        <div className="saud-stat">
          <div className="saud-stat-k">Events</div>
          <div className="saud-stat-v">{stats.total}</div>
          <div className="saud-stat-hint">Current view</div>
        </div>
        <div className="saud-stat">
          <div className="saud-stat-k">Users</div>
          <div className="saud-stat-v">{stats.uniqueUsers}</div>
          <div className="saud-stat-hint">In results</div>
        </div>
      </section>

      <section className="saud-searchwrap" aria-label="Search audit logs">
        <div className="saud-search">
          <div className="saud-search-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z" stroke="currentColor" strokeWidth="1.8" />
              <path d="M16.2 16.2 21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <input
            className="saud-search-input"
            type="text"
            placeholder="Search by user, role, action, or details"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </section>

      <section className="saud-filters" aria-label="Filters">
        <div className="saud-filterwrap">
          <button
            className="saud-chip"
            type="button"
            aria-haspopup="menu"
            aria-expanded={openMenu === 'role'}
            onClick={() => setOpenMenu((menu) => (menu === 'role' ? null : 'role'))}
          >
            <span className="saud-chip-label">{roleFilter}</span>
            <span className="saud-chip-caret" aria-hidden="true">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>

          {openMenu === 'role' && (
            <div className="saud-menu" role="menu" aria-label="Role filter">
              {roles.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="menuitemradio"
                  aria-checked={roleFilter === option}
                  className={`saud-menuitem ${roleFilter === option ? 'active' : ''}`}
                  onClick={() => {
                    setRoleFilter(option);
                    setOpenMenu(null);
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="saud-filterwrap">
          <button
            className="saud-chip"
            type="button"
            aria-haspopup="menu"
            aria-expanded={openMenu === 'action'}
            onClick={() => setOpenMenu((menu) => (menu === 'action' ? null : 'action'))}
          >
            <span className="saud-chip-label">{actionFilter}</span>
            <span className="saud-chip-caret" aria-hidden="true">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>

          {openMenu === 'action' && (
            <div className="saud-menu" role="menu" aria-label="Action filter">
              {actions.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="menuitemradio"
                  aria-checked={actionFilter === option}
                  className={`saud-menuitem ${actionFilter === option ? 'active' : ''}`}
                  onClick={() => {
                    setActionFilter(option);
                    setOpenMenu(null);
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="saud-filterwrap">
          <button
            className="saud-chip"
            type="button"
            aria-haspopup="menu"
            aria-expanded={openMenu === 'range'}
            onClick={() => setOpenMenu((menu) => (menu === 'range' ? null : 'range'))}
          >
            <span className="saud-chip-label">{rangeFilter}</span>
            <span className="saud-chip-caret" aria-hidden="true">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>

          {openMenu === 'range' && (
            <div className="saud-menu" role="menu" aria-label="Range filter">
              {['All Time', 'Daily', 'Weekly', 'Monthly'].map((option) => (
                <button
                  key={option}
                  type="button"
                  role="menuitemradio"
                  aria-checked={rangeFilter === option}
                  className={`saud-menuitem ${rangeFilter === option ? 'active' : ''}`}
                  onClick={() => {
                    setRangeFilter(option);
                    setOpenMenu(null);
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="saud-clear" type="button" onClick={clearAll}>
          Clear
        </button>
      </section>

      <section className="saud-tablewrap" aria-label="Audit logs table">
        <table className="saud-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Action</th>
              <th>Date &amp; Time</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="saud-empty" colSpan={5}>
                  Loading logs...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className="saud-empty" colSpan={5}>
                  No logs found.
                </td>
              </tr>
            ) : (
              filtered.map((log) => (
                <tr key={log.id}>
                  <td>{log.user}</td>
                  <td>{log.role}</td>
                  <td>
                    <span className={`saud-pill ${actionTone(log.action)}`}>{log.action}</span>
                  </td>
                  <td className="saud-muted">{formatDate(log.timestamp)}</td>
                  <td>
                    <button className="saud-action" type="button" onClick={() => setViewing(log)}>
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {viewing && (
        <div className="saud-modal-backdrop" role="presentation" onClick={() => setViewing(null)}>
          <div
            className="saud-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Audit event details"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="saud-modal-head">
              <div className="saud-modal-title">Audit Log Details</div>
              <button className="saud-modal-x" type="button" onClick={() => setViewing(null)} aria-label="Close">
                x
              </button>
            </div>

            <div className="saud-modal-body">
              <div className="saud-kv">
                <div className="saud-k">User</div>
                <div className="saud-v">{viewing.user}</div>
              </div>
              <div className="saud-kv">
                <div className="saud-k">Role</div>
                <div className="saud-v">{viewing.role}</div>
              </div>
              <div className="saud-kv">
                <div className="saud-k">Action</div>
                <div className="saud-v">{viewing.action}</div>
              </div>
              <div className="saud-kv">
                <div className="saud-k">Date &amp; Time</div>
                <div className="saud-v">{formatDate(viewing.timestamp)}</div>
              </div>
              <div className="saud-kv saud-kv-stack">
                <div className="saud-k">Details</div>
                <div className="saud-v">{viewing.details || 'No extra details available.'}</div>
              </div>
            </div>

            <div className="saud-modal-actions">
              <button className="saud-btn ghost" type="button" onClick={() => setViewing(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

export default SuperAdminAudit;
