import {
  PASSWORD_RESET_GENERIC_MESSAGE,
  clearPasswordRecoveryVerification,
  getVerifiedPasswordRecovery,
  requestPasswordResetOtp,
  verifyPasswordResetOtp,
} from './passwordResetApi';

const mockResetPasswordForEmail = jest.fn();
const mockVerifyOtp = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: (...args) => mockResetPasswordForEmail(...args),
      verifyOtp: (...args) => mockVerifyOtp(...args),
    },
  },
}));

describe('password reset email OTP service', () => {
  beforeEach(() => {
    mockResetPasswordForEmail.mockReset();
    mockVerifyOtp.mockReset();
    window.sessionStorage.clear();
  });

  it('normalizes the address and requests a Supabase recovery email directly', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    const result = await requestPasswordResetOtp('  Learner@Example.COM ');

    expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
      'learner@example.com',
      { redirectTo: expect.stringMatching(/\/reset-password$/) }
    );
    expect(result).toEqual({
      success: true,
      email: 'learner@example.com',
      message: PASSWORD_RESET_GENERIC_MESSAGE,
    });
  });

  it('does not reveal whether an email address has an account', async () => {
    mockResetPasswordForEmail.mockResolvedValue({
      data: null,
      error: { code: 'user_not_found', message: 'User not found' },
    });

    await expect(requestPasswordResetOtp('missing@example.com')).resolves.toEqual({
      success: true,
      email: 'missing@example.com',
      message: PASSWORD_RESET_GENERIC_MESSAGE,
    });
  });

  it('gives a retry delay instead of repeatedly sending rate-limited emails', async () => {
    mockResetPasswordForEmail.mockResolvedValue({
      data: null,
      error: { status: 429, message: 'Too many requests' },
    });

    await expect(requestPasswordResetOtp('learner@example.com')).resolves.toEqual({
      success: false,
      code: 'rate_limited',
      error: 'Please wait about a minute before requesting another code.',
    });
  });

  it('verifies the six-digit token as a recovery OTP and records the short-lived recovery session', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: {
        user: { id: 'student-1', email: 'learner@example.com' },
        session: { access_token: 'recovery-access-token' },
      },
      error: null,
    });

    const result = await verifyPasswordResetOtp('Learner@Example.com', '123456');

    expect(mockVerifyOtp).toHaveBeenCalledWith({
      email: 'learner@example.com',
      token: '123456',
      type: 'recovery',
    });
    expect(result.success).toBe(true);
    expect(getVerifiedPasswordRecovery()).toEqual(expect.objectContaining({
      email: 'learner@example.com',
    }));
  });

  it('uses one generic response for incorrect and expired OTPs', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'otp_expired', message: 'Token expired or invalid' },
    });

    await expect(verifyPasswordResetOtp('learner@example.com', '000000')).resolves.toEqual({
      success: false,
      code: 'invalid_or_expired',
      error: 'That code is invalid or expired. Check the latest email or request a new code.',
    });
    expect(getVerifiedPasswordRecovery()).toBeNull();
  });

  it('clears the temporary recovery marker', () => {
    window.sessionStorage.setItem('elikha-password-recovery', '{}');
    clearPasswordRecoveryVerification();
    expect(window.sessionStorage.getItem('elikha-password-recovery')).toBeNull();
  });
});
