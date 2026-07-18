import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import './ForgotPassword.css';
import logo from '../../assets/images/elikhalogo-ui.png';

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (updateError) {
      setError(updateError.message || 'Reset link is invalid or expired. Request a new link.');
      return;
    }

    setSuccess(true);
    await supabase.auth.signOut();
  };

  return (
    <div className="forgot-container">
      <div className="forgot-wrapper">
        <div className="forgot-left">
          <div className="forgot-header">
            <div className="logo-container">
              <img src={logo} alt="Elikha Logo" />
            </div>
            <h1>e-Likha</h1>
            <p>Student Learning Platform</p>
          </div>
        </div>

        <div className="forgot-right">
          <div className="forgot-form-container">
            {success ? (
              <div className="success-message">
                <div className="success-icon">✓</div>
                <h2>Password Updated</h2>
                <p>You can now log in using your new password.</p>
                <button onClick={() => navigate('/login')} className="submit-button">
                  Go to Login
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
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setError('');
                      }}
                    />
                  </div>

                  <div className={`form-group ${error ? 'error' : ''}`}>
                    <label htmlFor="confirmPassword">Confirm Password</label>
                    <input
                      type="password"
                      id="confirmPassword"
                      placeholder="Repeat new password"
                      value={confirmPassword}
                      onChange={(event) => {
                        setConfirmPassword(event.target.value);
                        setError('');
                      }}
                    />
                    {error && <span className="error-message">{error}</span>}
                  </div>

                  <button type="submit" className="submit-button" disabled={busy}>
                    {busy ? 'Updating...' : 'Update Password'}
                  </button>
                </form>

                <div className="back-to-login">
                  <button onClick={() => navigate('/login')} className="back-link">
                    Back to Login
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
