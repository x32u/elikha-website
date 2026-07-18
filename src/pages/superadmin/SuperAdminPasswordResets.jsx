import React from 'react';
import AdminShell from '../admin/components/AdminShell';
import {
  approvePasswordResetRequest,
  fetchPasswordResetRequests,
  rejectPasswordResetRequest,
} from '../../services/passwordResetApi';
import './styles/SuperAdminPasswordResets.css';

const getUserInfo = () => {
  try {
    return JSON.parse(sessionStorage.getItem('userInfo') || '{}');
  } catch {
    return {};
  }
};

const formatDateTime = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
};

const statusLabel = (status) => {
  const normalized = String(status || 'pending').toLowerCase();
  if (normalized === 'approved') return 'Approved';
  if (normalized === 'rejected') return 'Rejected';
  return 'Pending';
};

const accountStatusText = (request) => {
  const role = String(request?.account_role || 'unknown').trim();
  const normalizedRole = role.toLowerCase();

  if (!normalizedRole || normalizedRole === 'unknown') {
    return 'No matching account found';
  }

  return `${role}${request?.is_reset_allowed ? '' : ' - not allowed'}`;
};

function SuperAdminPasswordResets({ onNavigate }) {
  const [requests, setRequests] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState(null);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const userInfo = React.useMemo(getUserInfo, []);

  const loadRequests = React.useCallback(async () => {
    setLoading(true);
    setError('');
    const result = await fetchPasswordResetRequests();
    setLoading(false);

    if (!result.success) {
      setRequests([]);
      setError(result.error || 'Failed to load password reset requests.');
      return;
    }

    setRequests(result.data || []);
  }, []);

  React.useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleApprove = async (request) => {
    const confirmApprove = window.confirm(
      `Approve password reset for ${request.email}?\n\nSupabase will email a reset link if this is a registered student or teacher account.`
    );
    if (!confirmApprove) return;

    setBusyId(request.id);
    setError('');
    setNotice('');
    const result = await approvePasswordResetRequest(request, userInfo.id);
    setBusyId(null);

    if (!result.success) {
      setError(result.error || 'Failed to approve password reset.');
      return;
    }

    setNotice(`Reset link sent to ${request.email}.`);
    await loadRequests();
  };

  const handleReject = async (request) => {
    const reason = window.prompt(`Reject password reset for ${request.email}? Optional reason:`, '');
    if (reason === null) return;

    setBusyId(request.id);
    setError('');
    setNotice('');
    const result = await rejectPasswordResetRequest(request.id, userInfo.id, reason);
    setBusyId(null);

    if (!result.success) {
      setError(result.error || 'Failed to reject password reset.');
      return;
    }

    setNotice(`Password reset request rejected for ${request.email}.`);
    await loadRequests();
  };

  const pendingCount = requests.filter((request) => String(request.status || 'pending').toLowerCase() === 'pending').length;

  return (
    <AdminShell
      active="password-resets"
      onNavigate={onNavigate}
      homePageKey="sa-dashboard"
      showAudit={true}
      showPasswordResets={true}
      className="page-superadmin page-password-resets"
    >
      <header className="pr-header">
        <div>
          <h1 className="pr-title">Password Reset Approvals</h1>
          <p className="pr-subtitle">
            Review student and teacher reset requests before a reset link is emailed.
          </p>
        </div>
        <button className="pr-refresh" type="button" onClick={loadRequests} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      <section className="pr-stats">
        <div className="pr-stat">
          <span>Pending</span>
          <strong>{pendingCount}</strong>
        </div>
        <div className="pr-stat">
          <span>Total Requests</span>
          <strong>{requests.length}</strong>
        </div>
      </section>

      {error ? <div className="pr-alert error">{error}</div> : null}
      {notice ? <div className="pr-alert success">{notice}</div> : null}

      <section className="pr-tablewrap">
        {loading ? (
          <div className="pr-empty">Loading password reset requests...</div>
        ) : requests.length === 0 ? (
          <div className="pr-empty">No password reset requests yet.</div>
        ) : (
          <table className="pr-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Account</th>
                <th>Status</th>
                <th>Requested</th>
                <th>Reviewed</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => {
                const status = String(request.status || 'pending').toLowerCase();
                const isPending = status === 'pending';
                const isBusy = busyId === request.id;

                return (
                  <tr key={request.id}>
                    <td>{request.email}</td>
                    <td>
                      <div className="pr-account">
                        <strong>{request.account_name}</strong>
                        <span className={request.is_reset_allowed ? '' : 'warning'}>
                          {accountStatusText(request)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`pr-status ${status}`}>{statusLabel(status)}</span>
                    </td>
                    <td>{formatDateTime(request.created_at || request.requested_at)}</td>
                    <td>{formatDateTime(request.reviewed_at)}</td>
                    <td>
                      {isPending ? (
                        <div className="pr-actions">
                          <button
                            className="pr-action approve"
                            type="button"
                            onClick={() => handleApprove(request)}
                            disabled={isBusy}
                          >
                            {isBusy ? 'Working...' : 'Approve'}
                          </button>
                          <button
                            className="pr-action reject"
                            type="button"
                            onClick={() => handleReject(request)}
                            disabled={isBusy}
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="pr-muted">Done</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </AdminShell>
  );
}

export default SuperAdminPasswordResets;
