import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from './AuthContext';
import { writeUserDataCache, readUserDataCache } from '../utils/userDataCache';

const mockOnAuthStateChange = jest.fn();
const mockResolveAuthenticatedProfile = jest.fn();

jest.mock('../lib/supabase', () => {
  return {
    AUTH_STORAGE_KEY: 'test-auth-token',
    supabase: {
      auth: {
        onAuthStateChange: (...args) => mockOnAuthStateChange(...args),
        signOut: jest.fn().mockResolvedValue({ error: null }),
      },
    },
  };
});

jest.mock('../utils/authState', () => ({
  resolveAuthenticatedProfile: (...args) => mockResolveAuthenticatedProfile(...args),
}));

const Probe = () => {
  const { status, userInfo } = useAuth();
  return (
    <output data-status={status}>
      {userInfo ? `${userInfo.id}:${userInfo.role}` : 'none'}
    </output>
  );
};

describe('AuthProvider', () => {
  let container;
  let root;

  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    mockResolveAuthenticatedProfile.mockReset();
    mockOnAuthStateChange.mockReset();
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: jest.fn() } },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    global.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete global.IS_REACT_ACT_ENVIRONMENT;
  });

  it('removes forged browser state when Supabase cannot verify a user', async () => {
    window.sessionStorage.setItem('userInfo', JSON.stringify({
      id: 'forged-user',
      role: 'superadmin',
    }));
    mockResolveAuthenticatedProfile.mockResolvedValue({
      success: false,
      reason: 'unauthenticated',
    });

    await act(async () => {
      root.render(<AuthProvider><Probe /></AuthProvider>);
    });

    expect(container.querySelector('output').getAttribute('data-status')).toBe('anonymous');
    expect(container.textContent).toBe('none');
    expect(window.sessionStorage.getItem('userInfo')).toBeNull();
  });

  it('restores a valid persisted Supabase session from its database profile', async () => {
    mockResolveAuthenticatedProfile.mockResolvedValue({
      success: true,
      user: { id: 'student-7', name: 'Lea', role: 'student' },
    });

    await act(async () => {
      root.render(<AuthProvider><Probe /></AuthProvider>);
    });

    expect(container.querySelector('output').getAttribute('data-status')).toBe('authenticated');
    expect(container.textContent).toBe('student-7:student');
    expect(JSON.parse(window.sessionStorage.getItem('userInfo'))).toEqual({
      id: 'student-7',
      name: 'Lea',
      role: 'student',
    });
  });

  it('clears an inactive account session', async () => {
    mockResolveAuthenticatedProfile.mockResolvedValue({ success: false, reason: 'inactive' });
    await act(async () => { root.render(<AuthProvider><Probe /></AuthProvider>); });
    expect(container.querySelector('output').getAttribute('data-status')).toBe('anonymous');
    expect(window.sessionStorage.getItem('userInfo')).toBeNull();
  });

  it('keeps the last verified user signed in during a temporary refresh failure', async () => {
    mockResolveAuthenticatedProfile.mockResolvedValue({ success: true, user: { id: 'student-7', role: 'student' } });
    await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));
    mockResolveAuthenticatedProfile.mockResolvedValue({
      success: false,
      reason: 'transient',
      userId: 'student-7',
      error: new Error('network unavailable'),
    });

    await act(async () => {
      mockOnAuthStateChange.mock.calls[0][0]('TOKEN_REFRESHED', { user: { id: 'student-7' } });
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(container.querySelector('output').getAttribute('data-status')).toBe('authenticated');
    expect(container.textContent).toBe('student-7:student');
    expect(window.sessionStorage.getItem('userInfo')).not.toBeNull();
  });

  const signIn = async (id = 'teacher-a') => {
    mockResolveAuthenticatedProfile.mockResolvedValue({ success: true, user: { id, role: 'teacher' } });
    window.localStorage.setItem('test-auth-token', JSON.stringify({ user: { id } }));
    await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));
  };
  const flush = async () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });

  it('clears the previous account and cache immediately on a cross-tab sign-in', async () => {
    await signIn();
    writeUserDataCache('teacher-a', 'classes', ['private-class']);
    let finish;
    mockResolveAuthenticatedProfile.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    act(() => mockOnAuthStateChange.mock.calls[0][0]('SIGNED_IN', { user: { id: 'teacher-b' } }));
    expect(container.textContent).toBe('none');
    expect(window.sessionStorage.getItem('userInfo')).toBeNull();
    expect(readUserDataCache('teacher-a', 'classes')).toBeNull();
    await flush();
    await act(async () => finish({ success: true, user: { id: 'teacher-b', role: 'teacher' } }));
    expect(container.textContent).toBe('teacher-b:teacher');
  });

  it.each(['storage', 'focus'])('detects a missed broadcast using %s', async (eventType) => {
    await signIn();
    window.localStorage.setItem('test-auth-token', JSON.stringify({ user: { id: 'teacher-b' } }));
    mockResolveAuthenticatedProfile.mockResolvedValue({ success: true, user: { id: 'teacher-b', role: 'teacher' } });
    act(() => window.dispatchEvent(eventType === 'storage'
      ? new StorageEvent('storage', { key: 'test-auth-token', storageArea: window.localStorage })
      : new Event('focus')));
    expect(container.textContent).toBe('none');
    await flush();
    expect(container.textContent).toBe('teacher-b:teacher');
  });

  it('ignores an old in-flight result after logout', async () => {
    await signIn();
    let finish;
    mockResolveAuthenticatedProfile.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    act(() => mockOnAuthStateChange.mock.calls[0][0]('SIGNED_IN', { user: { id: 'teacher-b' } }));
    await flush();
    act(() => mockOnAuthStateChange.mock.calls[0][0]('SIGNED_OUT', null));
    await act(async () => finish({ success: true, user: { id: 'teacher-b', role: 'teacher' } }));
    expect(container.textContent).toBe('none');
    expect(container.querySelector('output').dataset.status).toBe('anonymous');
  });

  it('does not restore the previous identity if verification fails during a switch', async () => {
    await signIn();
    mockResolveAuthenticatedProfile.mockResolvedValue({ success: false, reason: 'verification-failed' });
    act(() => mockOnAuthStateChange.mock.calls[0][0]('SIGNED_IN', { user: { id: 'teacher-b' } }));
    await flush();
    expect(container.textContent).toBe('none');
  });

  it('clears the tab when another tab removes the shared login', async () => {
    await signIn();
    window.localStorage.removeItem('test-auth-token');
    mockResolveAuthenticatedProfile.mockResolvedValue({ success: false, reason: 'unauthenticated' });
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'test-auth-token', storageArea: window.localStorage })));
    expect(container.textContent).toBe('none');
    await flush();
    expect(container.querySelector('output').dataset.status).toBe('anonymous');
  });

  it('does not authenticate an unverified tab-local snapshot after a network error', async () => {
    window.sessionStorage.setItem('userInfo', JSON.stringify({ id: 'old-admin', role: 'admin' }));
    mockResolveAuthenticatedProfile.mockResolvedValue({ success: false, reason: 'verification-failed' });
    await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));
    expect(container.textContent).toBe('none');
    expect(window.sessionStorage.getItem('userInfo')).toBeNull();
  });

  it('remounts account-bound state on identity changes, not token refresh', async () => {
    const Snapshot = () => {
      const { userInfo } = useAuth();
      const [initialId] = React.useState(userInfo?.id || 'none');
      return <output>{initialId}</output>;
    };
    await signIn();
    await act(async () => root.render(<AuthProvider><Snapshot /></AuthProvider>));
    act(() => mockOnAuthStateChange.mock.calls[0][0]('TOKEN_REFRESHED', { user: { id: 'teacher-a' } }));
    await flush();
    expect(container.textContent).toBe('teacher-a');
    mockResolveAuthenticatedProfile.mockResolvedValue({ success: true, user: { id: 'teacher-b', role: 'teacher' } });
    act(() => mockOnAuthStateChange.mock.calls[0][0]('SIGNED_IN', { user: { id: 'teacher-b' } }));
    await flush();
    expect(container.textContent).toBe('teacher-b');
  });
});
