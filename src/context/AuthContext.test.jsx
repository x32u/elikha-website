import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from './AuthContext';

const mockOnAuthStateChange = jest.fn();
const mockResolveAuthenticatedProfile = jest.fn();

jest.mock('../lib/supabase', () => {
  return {
    supabase: {
      auth: {
        onAuthStateChange: (...args) => mockOnAuthStateChange(...args),
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
});
