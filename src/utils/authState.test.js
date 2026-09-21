import {
  getDefaultRouteForRole,
  normalizeRole,
  resolveAuthenticatedProfile,
} from './authState';

const createProfileQuery = (result) => {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    single: jest.fn(async () => result),
  };
  return query;
};

describe('auth state helpers', () => {
  it('rejects a stale local identity when Supabase has no authenticated user', async () => {
    const client = {
      auth: {
        getUser: jest.fn(async () => ({
          data: { user: null },
          error: new Error('expired token'),
        })),
      },
      from: jest.fn(),
    };

    const result = await resolveAuthenticatedProfile(client);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('unauthenticated');
    expect(client.from).not.toHaveBeenCalled();
  });

  it('classifies temporary user verification failures without invalidating a persisted session', async () => {
    const client = {
      auth: {
        getSession: jest.fn(async () => ({
          data: { session: { user: { id: 'student-7' } } },
          error: null,
        })),
        getUser: jest.fn(async () => ({
          data: { user: null },
          error: new Error('Failed to fetch'),
        })),
      },
      from: jest.fn(),
    };

    const result = await resolveAuthenticatedProfile(client);
    expect(result).toMatchObject({ success: false, reason: 'transient', userId: 'student-7' });
    expect(client.from).not.toHaveBeenCalled();
  });

  it('loads the profile belonging to the server-verified user and normalizes its role', async () => {
    const query = createProfileQuery({
      data: { id: 'server-user', name: 'Sam', role: 'Super Admin' },
      error: null,
    });
    const client = {
      auth: {
        getUser: jest.fn(async () => ({
          data: { user: { id: 'server-user' } },
          error: null,
        })),
      },
      from: jest.fn(() => query),
    };

    const result = await resolveAuthenticatedProfile(client);

    expect(client.from).toHaveBeenCalledWith('users');
    expect(query.eq).toHaveBeenCalledWith('id', 'server-user');
    expect(result).toEqual({
      success: true,
      user: { id: 'server-user', name: 'Sam', role: 'superadmin' },
    });
  });

  it('uses safe role normalization for route decisions', () => {
    expect(normalizeRole('Super-Admin')).toBe('superadmin');
    expect(getDefaultRouteForRole('Teacher')).toBe('/classes');
    expect(getDefaultRouteForRole('unknown')).toBe('/homepage');
  });

  it('rejects a valid Auth session when its database profile is inactive', async () => {
    const query = createProfileQuery({ data: { id: 'disabled-user', role: 'student', is_active: false }, error: null });
    const client = {
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'disabled-user' } }, error: null })) },
      from: jest.fn(() => query),
    };
    const result = await resolveAuthenticatedProfile(client);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('inactive');
  });

  it('rejects a session whose application profile was removed', async () => {
    const query = createProfileQuery({ data: null, error: { code: 'PGRST116' } });
    const client = {
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'removed-user' } }, error: null })) },
      from: jest.fn(() => query),
    };
    const result = await resolveAuthenticatedProfile(client);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('profile-missing');
  });
});
