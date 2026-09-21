const ALLOWED_ROLES = new Set(['student', 'parent', 'teacher', 'admin', 'superadmin']);

export const normalizeRole = (role) => (
  String(role || '').toLowerCase().replace(/[_\s-]/g, '')
);

export const getDefaultRouteForRole = (role) => {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === 'parent') return '/notifications';
  if (normalizedRole === 'teacher') return '/classes';
  if (normalizedRole === 'admin') return '/admin';
  if (normalizedRole === 'superadmin') return '/superadmin';
  return '/homepage';
};

const isInvalidSessionError = (error) => {
  if (!error) return false;
  const status = Number(error.status || error.statusCode || 0);
  const message = String(error.message || error.code || '').toLowerCase();
  return status === 401 || status === 403 || [
    'expired token',
    'invalid jwt',
    'jwt expired',
    'session_not_found',
    'session not found',
    'refresh token not found',
    'invalid refresh token',
    'user not found',
  ].some((fragment) => message.includes(fragment));
};

export const resolveAuthenticatedProfile = async (client) => {
  let persistedSession = null;
  if (typeof client.auth.getSession === 'function') {
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) {
      return {
        success: false,
        reason: isInvalidSessionError(sessionError) ? 'unauthenticated' : 'transient',
        error: sessionError,
      };
    }
    persistedSession = sessionData?.session || null;
    if (!persistedSession?.user?.id) {
      return { success: false, reason: 'unauthenticated', error: null };
    }
  }

  const { data: authData, error: authError } = await client.auth.getUser();
  const authUser = authData?.user || persistedSession?.user;

  if (authError) {
    return {
      success: false,
      reason: isInvalidSessionError(authError) ? 'unauthenticated' : 'transient',
      error: authError,
      userId: authUser?.id || null,
    };
  }
  if (!authUser?.id) return { success: false, reason: 'unauthenticated', error: null };

  const { data: profile, error: profileError } = await client
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single();

  if (profileError || !profile?.id) {
    const profileMissing = !profile?.id && (!profileError || String(profileError.code || '') === 'PGRST116');
    return {
      success: false,
      reason: profileMissing ? 'profile-missing' : 'profile-unavailable',
      error: profileError || null,
      userId: authUser.id,
    };
  }

  if (profile.is_active === false) {
    return {
      success: false,
      reason: 'inactive',
      error: new Error('This account is inactive. Contact a super administrator.'),
    };
  }

  const normalizedRole = normalizeRole(profile.role || 'student');

  return {
    success: true,
    user: {
      ...profile,
      role: ALLOWED_ROLES.has(normalizedRole) ? normalizedRole : 'student',
    },
  };
};
