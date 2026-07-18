import { supabase } from '../lib/supabase';

const normalizeRole = (role) => String(role || '').toLowerCase().replace(/[_\s-]/g, '');
const ALLOWED_ROLES = new Set(['student', 'teacher', 'admin', 'superadmin']);

export const authenticateUser = async (email, password) => {
  try {
    // Sign in with Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) return { success: false, error: 'Invalid email or password' };

    // Roles are sourced from the users table (database), not hardcoded accounts.
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (userError) {
      if (userError.code === 'PGRST116') {
        return {
          success: false,
          error: 'Account profile not found in database. Please contact admin.',
        };
      }
      return { success: false, error: 'Unable to load account profile' };
    }

    const normalizedRole = normalizeRole(userData.role || 'student');
    const role = ALLOWED_ROLES.has(normalizedRole) ? normalizedRole : 'student';

    return {
      success: true,
      user: {
        ...userData,
        role,
      },
    };
  } catch (error) {
    console.error('Authentication error:', error);
    return { success: false, error: 'Authentication failed' };
  }
};
