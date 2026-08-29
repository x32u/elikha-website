import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { clearLocalAuthSession } from '../../utils/authSession';
import {
  clearPasswordRecoveryVerification,
  getVerifiedPasswordRecovery,
  normalizePasswordResetEmail,
} from '../../services/passwordResetApi';
import './ForgotPassword.css';
import logo from '../../assets/images/elikhalogo-ui.png';

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState('checking');

  React.useEffect(() => {
    let active = true;

    const verifyRecoverySession = async () => {
      const recovery = getVerifiedPasswordRecovery();
      if (!recovery) {
        if (active) setRecoveryStatus('invalid');
        return;
      }

      const { data, error: userError } = await supabase.auth.getUser();
      const sessionEmail = normalizePasswordResetEmail(data?.user?.email);
      if (!active) return;

      if (userError || !sessionEmail || sessionEmail !== recovery.email) {
        clearPasswordRecoveryVerification();
        setRecoveryStatus('invalid');
        return;
      }

      setRecoveryStatus('ready');
    };

    verifyRecoverySession();
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (recoveryStatus !== 'ready') {
      setError('Verify a new password reset code before changing your password.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    let updateError = null;
    try {
      const result = await supabase.auth.updateUser({ password });
      updateError = result.error;
    } catch (requestError) {
      updateError = requestError;
    }

    if (updateError) {
      setBusy(false);
      setError(updateError.message || 'Your reset session expired. Request a new code.');
      return;
    }

    try {
      // A forgotten-password reset should revoke all refresh sessions, including
      // a potentially compromised device, then remove the temporary recovery
      // session from this browser.
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' });
      if (signOutError) console.warn('Password changed, but remote session revocation failed:', signOutError);
    } catch (signOutError) {
      console.warn('Password changed, but remote session revocation failed:', signOutError);
    } finally {
      clearPasswordRecoveryVerification();
      clearLocalAuthSession();
    }
    setBusy(false);
    setSuccess(true);
  };

  return (
    <main className="forgot-container password-recovery-page">
      <div className="forgot-wrapper password-recovery-layout">
        <section className="forgot-left password-recovery-brand" aria-label="e-Likha">
          <div className="forgot-header">
            <div className="logo-container">
              <img src={logo} alt="e-Likha logo" />
            </div>
            <h1>e-Likha</h1>
            <p>Student Learning Platform</p>
          </div>
        </section>

        <section className="forgot-right password-recovery-panel">
          <div className="forgot-form-container password-recovery-card">
            {success ? (
              <div className="success-message">
                <div className="success-icon">✓</div>
                <h2>Password Updated</h2>
                <p>You can now log in using your new password.</p>
                <button type="button" onClick={() => navigate('/login')} className="submit-button">
                  Go to Login
                </button>
              </div>
            ) : recoveryStatus === 'checking' ? (
              <div className="success-message" role="status" aria-live="polite">
                <h2>Checking Reset Code</h2>
                <p>Please wait while we verify your password reset session.</p>
              </div>
            ) : recoveryStatus === 'invalid' ? (
              <div className="success-message">
                <h2>Reset Code Required</h2>
                <p>Your reset session is missing or expired. Request and verify a new email code.</p>
                <button type="button" onClick={() => navigate('/forgot-password')} className="submit-button">
                  Request New Code
                </button>
                <button type="button" onClick={() => navigate('/login')} className="back-link reset-secondary-action">
                  Back to Login
                </button>
              </div>
            ) : (
              <>
                <h2 className="form-title">Reset Password</h2>
                <p className="form-subtitle">
                  Enter a new password for your e-Likha account.
                </p>

                <form onSubmit={handleSubmit} className="forgot-form">
                  <div className={`form-group ${error ? 'error' : ''}`}>
                    <label htmlFor="password">New Password</label>
                    <input
                      type="password"
                      id="password"
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setError('');
                      }}
                      required
                    />
                  </div>

                  <div className={`form-group ${error ? 'error' : ''}`}>
                    <label htmlFor="confirmPassword">Confirm Password</label>
                    <input
                      type="password"
                      id="confirmPassword"
                      autoComplete="new-password"
                      placeholder="Repeat new password"
                      value={confirmPassword}
                      onChange={(event) => {
                        setConfirmPassword(event.target.value);
                        setError('');
                      }}
                      required
                    />
                    {error && <span className="error-message" role="alert">{error}</span>}
                  </div>

                  <button type="submit" className="submit-button" disabled={busy}>
                    {busy ? 'Updating...' : 'Update Password'}
                  </button>
                </form>

                <div className="back-to-login">
                  <button type="button" onClick={() => navigate('/login')} className="back-link">
                    Back to Login
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
};

export default ResetPassword;
