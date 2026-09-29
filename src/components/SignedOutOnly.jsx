import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getDefaultRouteForRole } from '../utils/authState';

// Wait for session verification rather than trusting a saved email or profile.
export default function SignedOutOnly({ children }) {
  const { status, userInfo } = useAuth();
  if (status === 'loading') return <main role="status" aria-live="polite">Checking your session…</main>;
  if (status === 'authenticated' && userInfo?.id) {
    return <Navigate to={getDefaultRouteForRole(userInfo.role)} replace />;
  }
  return children;
}
