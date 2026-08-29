import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './ForgotPassword.css';
import logo from '../../assets/images/elikhalogo-ui.png';
import {
  PASSWORD_RESET_COOLDOWN_SECONDS,
  PASSWORD_RESET_MAX_OTP_ATTEMPTS,
  requestPasswordResetOtp,
  verifyPasswordResetOtp,
} from '../../services/passwordResetApi';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('request');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (cooldown <= 0) return undefined;

    const timer = window.setInterval(() => {
      setCooldown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [cooldown]);

  const sendCode = async (emailAddress) => {
    setBusy(true);
    setError('');
    setNotice('');
    const result = await requestPasswordResetOtp(emailAddress);
    setBusy(false);

    if (!result.success) {
      setError(result.error || 'We could not send a reset code right now.');
      return false;
    }

    setSubmittedEmail(result.email);
    setNotice(result.message);
    setCooldown(PASSWORD_RESET_COOLDOWN_SECONDS);
    return true;
  };

  const handleRequest = async (event) => {
    event.preventDefault();
    const sent = await sendCode(email);
    if (sent) setStep('verify');
  };

  const handleVerify = async (event) => {
    event.preventDefault();
    setError('');

    if (failedAttempts >= PASSWORD_RESET_MAX_OTP_ATTEMPTS) {
      setError('Too many incorrect attempts. Request a new code and use the latest email.');
      return;
    }

    setBusy(true);
    const result = await verifyPasswordResetOtp(submittedEmail, otp);
    setBusy(false);

    if (!result.success) {
      const nextAttempts = result.code === 'invalid_or_expired'
        ? failedAttempts + 1
        : failedAttempts;
      setFailedAttempts(nextAttempts);
      setError(
        nextAttempts >= PASSWORD_RESET_MAX_OTP_ATTEMPTS
          ? 'Too many incorrect attempts. Request a new code and use the latest email.'
          : result.error || 'We could not verify that code.'
      );
      return;
    }

    navigate('/reset-password', { replace: true });
  };

  const handleResend = async () => {
    const sent = await sendCode(submittedEmail);
    if (!sent) return;

    setOtp('');
    setFailedAttempts(0);
    setNotice('A new code was requested. Use only the latest email you receive.');
  };

  const useDifferentEmail = () => {
    setStep('request');
    setSubmittedEmail('');
    setOtp('');
    setError('');
    setNotice('');
    setCooldown(0);
    setFailedAttempts(0);
  };

  return (
    <div className="forgot-container">
      <div className="forgot-wrapper">
        <div className="forgot-left">
          <div className="forgot-header">
            <div className="logo-container">
              <img src={logo} alt="e-Likha logo" />
            </div>
            <h1>e-Likha</h1>
            <p>Student Learning Platform</p>
          </div>
        </div>

        <div className="forgot-right">
          <div className="forgot-form-container">
            {step === 'request' ? (
              <>
                <h2 className="form-title">Forgot Password?</h2>
                <p className="form-subtitle">
                  Enter the email used for your e-Likha account. We will send a 6-digit reset code—no administrator approval is needed.
                </p>

                <form onSubmit={handleRequest} className="forgot-form">
                  <div className={`form-group ${error ? 'error' : ''}`}>
                    <label htmlFor="email">Email Address</label>
                    <input
                      type="email"
                      id="email"
                      autoComplete="email"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setError('');
                      }}
                      required
                    />
                    {error && <span className="error-message" role="alert">{error}</span>}
                  </div>

                  <button type="submit" className="submit-button" disabled={busy}>
                    {busy ? 'Sending...' : 'Email Reset Code'}
                  </button>
                </form>
              </>
            ) : (
              <>
                <h2 className="form-title">Enter Your Reset Code</h2>
                <p className="form-subtitle">
                  Enter the 6-digit code sent to <strong>{submittedEmail}</strong>. If the address belongs to an account, the email should arrive shortly.
                </p>

                <form onSubmit={handleVerify} className="forgot-form">
                  <div className={`form-group ${error ? 'error' : ''}`}>
                    <label htmlFor="resetOtp">6-Digit Code</label>
                    <input
                      className="otp-input"
                      type="text"
                      id="resetOtp"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      placeholder="000000"
                      value={otp}
                      onChange={(event) => {
                        setOtp(event.target.value.replace(/\D/g, '').slice(0, 6));
                        setError('');
                      }}
                      required
                    />
                    {error && <span className="error-message" role="alert">{error}</span>}
                    {notice && !error && <span className="form-notice" role="status">{notice}</span>}
                  </div>

                  <button
                    type="submit"
                    className="submit-button"
                    disabled={busy || otp.length !== 6 || failedAttempts >= PASSWORD_RESET_MAX_OTP_ATTEMPTS}
                  >
                    {busy ? 'Checking...' : 'Verify Code'}
                  </button>
                </form>

                <div className="reset-code-actions">
                  <button
                    type="button"
                    className="back-link"
                    onClick={handleResend}
                    disabled={busy || cooldown > 0}
                  >
                    {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                  </button>
                  <button type="button" className="back-link" onClick={useDifferentEmail} disabled={busy}>
                    Use a different email
                  </button>
                </div>
              </>
            )}

            <div className="back-to-login">
              <button onClick={() => navigate('/login')} className="back-link" type="button">
                ← Back to Login
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
