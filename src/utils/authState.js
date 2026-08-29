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

export const resolveAuthenticatedProfile = async (client) => {
  const { data: authData, error: authError } = await client.auth.getUser();
  const authUser = authData?.user;

  if (authError || !authUser?.id) {
    return {
      success: false,
      reason: 'unauthenticated',
      error: authError || null,
    };
  }

  const { data: profile, error: profileError } = await client
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single();

  if (profileError || !profile?.id) {
    return {
      success: false,
      reason: 'profile-unavailable',
      error: profileError || null,
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

