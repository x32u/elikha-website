import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ResetPassword from './ResetPassword';

const mockNavigate = jest.fn();
const mockGetUser = jest.fn();
const mockUpdateUser = jest.fn();
const mockSignOut = jest.fn();
const mockGetVerifiedPasswordRecovery = jest.fn();
const mockClearPasswordRecoveryVerification = jest.fn();
const mockClearLocalAuthSession = jest.fn();
const setInputValue = (input, value) => {
  const valueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;
  valueSetter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: (...args) => mockGetUser(...args),
      updateUser: (...args) => mockUpdateUser(...args),
      signOut: (...args) => mockSignOut(...args),
    },
  },
}));

jest.mock('../../services/passwordResetApi', () => ({
  clearPasswordRecoveryVerification: (...args) => mockClearPasswordRecoveryVerification(...args),
  getVerifiedPasswordRecovery: (...args) => mockGetVerifiedPasswordRecovery(...args),
  normalizePasswordResetEmail: (email) => String(email || '').trim().toLowerCase(),
}));

jest.mock('../../utils/authSession', () => ({
  clearLocalAuthSession: (...args) => mockClearLocalAuthSession(...args),
}));

describe('ResetPassword verified recovery session', () => {
  let container;
  let root;

  beforeEach(() => {
    mockNavigate.mockReset();
    mockGetUser.mockReset();
    mockUpdateUser.mockReset();
    mockSignOut.mockReset();
    mockGetVerifiedPasswordRecovery.mockReset();
    mockClearPasswordRecoveryVerification.mockReset();
    mockClearLocalAuthSession.mockReset();
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

  it('blocks password changes without a recently verified recovery OTP', async () => {
    mockGetVerifiedPasswordRecovery.mockReturnValue(null);

    await act(async () => root.render(<ResetPassword />));

    expect(container.textContent).toContain('Reset Code Required');
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(container.querySelector('#password')).toBeNull();
  });

  it('updates the password, revokes sessions, and clears the recovery session', async () => {
    mockGetVerifiedPasswordRecovery.mockReturnValue({ email: 'learner@example.com' });
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'student-1', email: 'Learner@Example.com' } },
      error: null,
    });
    mockUpdateUser.mockResolvedValue({ data: {}, error: null });
    mockSignOut.mockResolvedValue({ error: null });

    await act(async () => root.render(<ResetPassword />));

    const passwordInput = container.querySelector('#password');
    const confirmInput = container.querySelector('#confirmPassword');
    await act(async () => {
      setInputValue(passwordInput, 'NewPassword123!');
      setInputValue(confirmInput, 'NewPassword123!');
    });
    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'NewPassword123!' });
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'global' });
    expect(mockClearPasswordRecoveryVerification).toHaveBeenCalledTimes(1);
    expect(mockClearLocalAuthSession).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Password Updated');
  });
});
