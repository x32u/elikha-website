import { supabase } from '../lib/supabase';

const RESET_REQUESTS_TABLE = 'password_reset_requests';
const RESET_APPROVALS_RPC = 'get_password_reset_approval_requests';
const CREATE_RESET_REQUEST_RPC = 'create_password_reset_approval_request';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_ALLOWED_ROLES = new Set(['student', 'teacher']);

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const normalizeRole = (role) => String(role || '').trim().toLowerCase().replace(/[_\s-]/g, '');

const tableSetupMessage = (error) => {
  const message = String(error?.message || '');
  if (message.includes(RESET_REQUESTS_TABLE) || error?.code === '42P01') {
    return 'Password reset approval table is not configured yet. Apply database/password_reset_requests.sql in Supabase.';
  }
  return message || 'Password reset request failed.';
};

const isMissingRpcError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === 'PGRST202' ||
    message.includes(RESET_APPROVALS_RPC.toLowerCase()) ||
    message.includes(CREATE_RESET_REQUEST_RPC.toLowerCase()) ||
    message.includes('could not find the function') ||
    message.includes('schema cache')
  );
};

const mapResetRequest = (request, account = null) => {
  const accountRole = request?.account_role || account?.role || 'unknown';

  return {
    ...request,
    account,
    account_name: request?.account_name || account?.name || 'Unknown account',
    account_role: accountRole,
    is_reset_allowed:
      typeof request?.is_reset_allowed === 'boolean'
        ? request.is_reset_allowed
        : RESET_ALLOWED_ROLES.has(normalizeRole(accountRole)),
  };
};

const getResetRedirectUrl = () => {
  const explicitUrl = process.env.REACT_APP_PASSWORD_RESET_REDIRECT_URL;
  if (explicitUrl) return explicitUrl;

  const siteUrl = process.env.REACT_APP_SITE_URL;
  if (siteUrl) return `${siteUrl.replace(/\/$/, '')}/reset-password`;

  return `${window.location.origin}/reset-password`;
};

export const createPasswordResetRequest = async (email) => {
  const safeEmail = normalizeEmail(email);

  if (!EMAIL_PATTERN.test(safeEmail)) {
    return { success: false, error: 'Enter a valid email address.' };
  }

  try {
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null;
    const { data: rpcData, error: rpcError } = await supabase.rpc(CREATE_RESET_REQUEST_RPC, {
      p_email: safeEmail,
      p_user_agent: userAgent,
    });

    if (!rpcError) {
      const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      return {
        success: Boolean(result?.success),
        data: result,
        error: result?.success ? null : result?.message || 'Failed to submit password reset request.',
        message: result?.message || '',
        code: result?.code || '',
      };
    }

    if (!isMissingRpcError(rpcError)) throw rpcError;

    const { data, error } = await supabase
      .from(RESET_REQUESTS_TABLE)
      .insert([
        {
          email: safeEmail,
          status: 'pending',
          user_agent: userAgent,
        },
      ]);

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error creating password reset request:', error);
    return { success: false, error: tableSetupMessage(error) };
  }
};

export const fetchPasswordResetRequests = async () => {
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc(RESET_APPROVALS_RPC);

    if (!rpcError) {
      return { success: true, data: (rpcData || []).map((request) => mapResetRequest(request)) };
    }

    if (!isMissingRpcError(rpcError)) throw rpcError;

    const [{ data: requests, error: requestError }, { data: users, error: usersError }] = await Promise.all([
      supabase
        .from(RESET_REQUESTS_TABLE)
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('users')
        .select('id, name, email, role'),
    ]);

    if (requestError) throw requestError;
    if (usersError) {
      console.warn('Unable to resolve password reset accounts:', usersError);
    }

    const userByEmail = new Map(
      (users || []).map((user) => [normalizeEmail(user.email), user])
    );

    const data = (requests || []).map((request) => {
      const account = userByEmail.get(normalizeEmail(request.email)) || null;
      return mapResetRequest(request, account);
    });

    return { success: true, data };
  } catch (error) {
    console.error('Error fetching password reset requests:', error);
    return { success: false, error: tableSetupMessage(error) };
  }
};

const resolveRequestForApproval = async (request) => {
  const fallback = mapResetRequest(request);
  const resolved = await fetchPasswordResetRequests();
  if (!resolved.success) return fallback;

  const freshRequest = resolved.data.find((item) => item.id === request?.id);
  if (!freshRequest) return fallback;

  return freshRequest.is_reset_allowed || !fallback.is_reset_allowed ? freshRequest : fallback;
};

export const approvePasswordResetRequest = async (request, reviewerId) => {
  const safeEmail = normalizeEmail(request?.email);

  if (!request?.id || !safeEmail) {
    return { success: false, error: 'Missing password reset request.' };
  }

  try {
    const resolvedRequest = await resolveRequestForApproval(request);
    const rawAccountRole = resolvedRequest?.account?.role || resolvedRequest?.account_role;
    const accountRole = normalizeRole(rawAccountRole);

    if (!resolvedRequest?.is_reset_allowed && (!accountRole || accountRole === 'unknown')) {
      return {
        success: false,
        error: `No matching student or teacher account was found for ${safeEmail}. Check that the reset email exactly matches the account email.`,
      };
    }

    if (accountRole && accountRole !== 'unknown' && !RESET_ALLOWED_ROLES.has(accountRole)) {
      return {
        success: false,
        error: `Only student and teacher accounts can receive reset links from this panel. This request matched a ${rawAccountRole} account.`,
      };
    }

    const redirectTo = getResetRedirectUrl();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(safeEmail, {
      redirectTo,
    });

    if (resetError) throw resetError;

    const { data, error } = await supabase
      .from(RESET_REQUESTS_TABLE)
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewerId || null,
        reset_sent_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq('id', request.id)
      .select('*')
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error approving password reset request:', error);
    return { success: false, error: tableSetupMessage(error) };
  }
};

export const rejectPasswordResetRequest = async (requestId, reviewerId, reason = '') => {
  if (!requestId) {
    return { success: false, error: 'Missing password reset request.' };
  }

  try {
    const { data, error } = await supabase
      .from(RESET_REQUESTS_TABLE)
      .update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewerId || null,
        rejection_reason: String(reason || '').trim() || null,
      })
      .eq('id', requestId)
      .select('*')
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error rejecting password reset request:', error);
    return { success: false, error: tableSetupMessage(error) };
  }
};
