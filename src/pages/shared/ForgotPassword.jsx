import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './ForgotPassword.css';
import logo from '../../assets/images/elikhalogo-ui.png';
import { createPasswordResetRequest } from '../../services/passwordResetApi';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [submitMessage, setSubmitMessage] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setSubmitting(true);
    setError('');
    const result = await createPasswordResetRequest(email);
    setSubmitting(false);

    if (!result.success) {
      setError(result.error || 'Failed to submit password reset request.');
      return;
    }

    setSubmittedEmail(email.trim().toLowerCase());
    setSubmitMessage(result.message || 'Your reset request is waiting for super admin approval.');
    setIsSubmitted(true);
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
            {!isSubmitted ? (
              <>
                <h2 className="form-title">Forgot Password?</h2>
                <p className="form-subtitle">
                  Enter your registered student or teacher email. A super admin must approve the request before the reset link is sent.
                </p>
                
                <form onSubmit={handleSubmit} className="forgot-form">
                  <div className={`form-group ${error ? 'error' : ''}`}>
                    <label htmlFor="email">Email Address</label>
                    <input
                      type="email"
                      id="email"
                      placeholder="student@example.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setError('');
                      }}
                    />
                    {error && <span className="error-message">{error}</span>}
                  </div>
                  
                  <button type="submit" className="submit-button" disabled={submitting}>
                    {submitting ? 'Submitting...' : 'Request Reset Link'}
                  </button>
                </form>
                
                <div className="back-to-login">
                  <button onClick={() => navigate('/login')} className="back-link">
                    ← Back to Login
                  </button>
                </div>
              </>
            ) : (
              <div className="success-message">
                <div className="success-icon">✓</div>
                <h2>Request Submitted</h2>
                <p>
                  Your reset request for <strong>{submittedEmail}</strong> is waiting for super admin approval.
                </p>
                <p className="redirect-text">{submitMessage || 'If approved, the reset link will be sent to your registered email.'}</p>
                <button onClick={() => navigate('/login')} className="submit-button">
                  Back to Login
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
