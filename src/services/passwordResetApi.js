import { supabase } from '../lib/supabase';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_PATTERN = /^\d{6}$/;
const RECOVERY_SESSION_KEY = 'elikha-password-recovery';
const RECOVERY_SESSION_MAX_AGE_MS = 30 * 60 * 1000;

export const PASSWORD_RESET_COOLDOWN_SECONDS = 60;
export const PASSWORD_RESET_MAX_OTP_ATTEMPTS = 5;
export const PASSWORD_RESET_GENERIC_MESSAGE =
  'If an account uses that email, a 6-digit password reset code has been sent.';

export const normalizePasswordResetEmail = (email) =>
  String(email || '').trim().toLowerCase();

const isRateLimitError = (error) => {
  const status = Number(error?.status || error?.statusCode || 0);
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();

  return (
    status === 429 ||
    code.includes('rate_limit') ||
    code.includes('over_email_send_rate_limit') ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('only request this after')
  );
};

const isUnknownAccountError = (error) => {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();

  return (
    code === 'user_not_found' ||
    message.includes('user not found') ||
    message.includes('email not found')
  );
};

const getResetRedirectUrl = () => {
  const explicitUrl = process.env.REACT_APP_PASSWORD_RESET_REDIRECT_URL?.trim();
  if (explicitUrl) return explicitUrl;

  const siteUrl = process.env.REACT_APP_SITE_URL?.trim();
  if (siteUrl) return `${siteUrl.replace(/\/$/, '')}/reset-password`;

  if (typeof window !== 'undefined') {
    return `${window.location.origin}/reset-password`;
  }

  return undefined;
};

export const requestPasswordResetOtp = async (email) => {
  const safeEmail = normalizePasswordResetEmail(email);

  if (!EMAIL_PATTERN.test(safeEmail)) {
    return { success: false, error: 'Enter a valid email address.' };
  }

  try {
    const redirectTo = getResetRedirectUrl();
    const options = redirectTo ? { redirectTo } : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(safeEmail, options);

    // Supabase normally returns the same response for registered and unregistered
    // addresses. Preserve that anti-enumeration behavior if a project happens to
    // return an explicit user-not-found error.
    if (error && !isUnknownAccountError(error)) {
      if (isRateLimitError(error)) {
        return {
          success: false,
          code: 'rate_limited',
          error: 'Please wait about a minute before requesting another code.',
        };
      }
      throw error;
    }

    return {
      success: true,
      email: safeEmail,
      message: PASSWORD_RESET_GENERIC_MESSAGE,
    };
  } catch (error) {
    console.error('Unable to request password reset code:', error);
    return {
      success: false,
      error: 'We could not send a reset code right now. Please try again later.',
    };
  }
};

export const verifyPasswordResetOtp = async (email, otp) => {
  const safeEmail = normalizePasswordResetEmail(email);
  const safeOtp = String(otp || '').replace(/\D/g, '').slice(0, 6);

  if (!EMAIL_PATTERN.test(safeEmail)) {
    return { success: false, error: 'Enter a valid email address.' };
  }

  if (!OTP_PATTERN.test(safeOtp)) {
    return { success: false, error: 'Enter the 6-digit code from your email.' };
  }

  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email: safeEmail,
      token: safeOtp,
      type: 'recovery',
    });

    if (error || !data?.session || !data?.user) {
      return {
        success: false,
        code: 'invalid_or_expired',
        error: 'That code is invalid or expired. Check the latest email or request a new code.',
      };
    }

    markPasswordRecoveryVerified(safeEmail);
    return { success: true, email: safeEmail, session: data.session };
  } catch (error) {
    console.error('Unable to verify password reset code:', error);
    return {
      success: false,
      error: 'We could not verify the code right now. Please try again.',
    };
  }
};

export const markPasswordRecoveryVerified = (email) => {
  if (typeof window === 'undefined') return;

  window.sessionStorage.setItem(
    RECOVERY_SESSION_KEY,
    JSON.stringify({
      email: normalizePasswordResetEmail(email),
      verifiedAt: Date.now(),
    })
  );
};

export const getVerifiedPasswordRecovery = () => {
  if (typeof window === 'undefined') return null;

  try {
    const recovery = JSON.parse(window.sessionStorage.getItem(RECOVERY_SESSION_KEY) || 'null');
    const age = Date.now() - Number(recovery?.verifiedAt || 0);

    if (
      !EMAIL_PATTERN.test(normalizePasswordResetEmail(recovery?.email)) ||
      !Number.isFinite(age) ||
      age < 0 ||
      age > RECOVERY_SESSION_MAX_AGE_MS
    ) {
      clearPasswordRecoveryVerification();
      return null;
    }

    return {
      email: normalizePasswordResetEmail(recovery.email),
      verifiedAt: Number(recovery.verifiedAt),
    };
  } catch {
    clearPasswordRecoveryVerification();
    return null;
  }
};

export const clearPasswordRecoveryVerification = () => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(RECOVERY_SESSION_KEY);
};
