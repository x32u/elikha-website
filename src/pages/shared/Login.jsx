import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Login.css';
import logo from '../../assets/images/elikhalogo-ui.png';
import { authenticateUser } from '../../services/auth';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const getRouteForRole = (role) => {
    const normalizedRole = String(role || '').toLowerCase().replace(/[_\s-]/g, '');
    if (normalizedRole === 'teacher') return '/classes';
    if (normalizedRole === 'admin') return '/admin';
    if (normalizedRole === 'superadmin') return '/superadmin';
    return '/homepage';
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!email || !email.includes('@')) {
      newErrors.email = 'Please enter a valid email address';
    }
    
    if (!password || password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    
    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const newErrors = validateForm();
    
    if (Object.keys(newErrors).length === 0) {
      setLoading(true);
      setErrors({});
      
      try {
        const result = await authenticateUser(email, password);
        
        if (result.success) {
          sessionStorage.setItem('userInfo', JSON.stringify(result.user));
          window.dispatchEvent(new Event('elikha-auth-changed'));

          navigate(getRouteForRole(result.user.role));
        } else {
          setErrors({ general: result.error });
        }
      } catch (error) {
        console.error('Login error:', error);
        setErrors({ general: 'Login failed. Please try again.' });
      } finally {
        setLoading(false);
      }
    } else {
      setErrors(newErrors);
    }
  };

  return (
    <div className="login-container">
      <div className="login-wrapper">
        <div className="login-left">
          <div className="login-branding">
            <button type="button" className="brand-home-link" onClick={() => navigate('/')}>
              <div className="brand-logo">
                <img src={logo} alt="Elikha Logo" />
              </div>
              <h1 className="brand-title">e-Likha</h1>
            </button>
            <p className="brand-subtitle">Education Platform</p>
            <p className="brand-description">
              Explore arts and crafts through AR-guided and voice-assisted learning.
            </p>
          </div>
        </div>
        
        <div className="login-right">
          <div className="login-card">
            <h2 className="login-title">Welcome Back!</h2>
            <p className="login-subtitle">Sign in to continue your learning journey</p>
            
            {errors.general && (
              <div className="error-banner" style={{
                backgroundColor: '#fee', 
                color: '#c00', 
                padding: '10px', 
                borderRadius: '5px', 
                marginBottom: '15px',
                textAlign: 'center'
              }}>
                {errors.general}
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="login-form">
              <div className={`form-group ${errors.email ? 'error' : ''}`}>
                <label htmlFor="email">Email Address</label>
                <input
                  type="email"
                  id="email"
                  placeholder="your-email@elikha.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setErrors(prev => ({ ...prev, email: '' }));
                  }}
                />
                {errors.email && <span className="error-message">{errors.email}</span>}
              </div>
              
              <div className={`form-group ${errors.password ? 'error' : ''}`}>
                <label htmlFor="password">Password</label>
                <div className="password-field">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setErrors(prev => ({ ...prev, password: '' }));
                    }}
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {errors.password && <span className="error-message">{errors.password}</span>}
              </div>
              
              <button type="submit" className="login-button" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
            
            <div className="login-footer">
              <button onClick={() => navigate('/forgot-password')} className="forgot-link">
                Forgot Password?
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
