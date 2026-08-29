import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { supabase } from '../lib/supabase';
import { resolveAuthenticatedProfile } from '../utils/authState';

const AuthContext = createContext(null);

const publishUserInfo = (userInfo) => {
  if (userInfo) {
    window.sessionStorage.setItem('userInfo', JSON.stringify(userInfo));
  } else {
    window.sessionStorage.removeItem('userInfo');
  }
  window.dispatchEvent(new Event('elikha-auth-changed'));
};

export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState({
    status: 'loading',
    userInfo: null,
  });
  const requestSequence = useRef(0);

  const setAnonymous = useCallback(() => {
    requestSequence.current += 1;
    publishUserInfo(null);
    setAuthState({ status: 'anonymous', userInfo: null });
  }, []);

  const refreshAuth = useCallback(async ({ showLoading = true } = {}) => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;

    if (showLoading) {
      setAuthState((current) => ({ ...current, status: 'loading' }));
    }

    let result;
    try {
      result = await resolveAuthenticatedProfile(supabase);
    } catch (error) {
      result = { success: false, reason: 'verification-failed', error };
    }

    if (requestId !== requestSequence.current) return result;

    if (!result.success) {
      publishUserInfo(null);
      setAuthState({ status: 'anonymous', userInfo: null });
      return result;
    }

    publishUserInfo(result.user);
    setAuthState({ status: 'authenticated', userInfo: result.user });
    return result;
  }, []);

  useEffect(() => {
    const scheduledRefreshes = new Set();
    refreshAuth();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || event === 'USER_DELETED' || !session) {
        setAnonymous();
        return;
      }

      // Supabase advises deferring additional client calls until its auth callback
      // has returned. This also coalesces session restoration with route rendering.
      const timeoutId = window.setTimeout(() => {
        scheduledRefreshes.delete(timeoutId);
        refreshAuth({ showLoading: false });
      }, 0);
      scheduledRefreshes.add(timeoutId);
    });

    return () => {
      requestSequence.current += 1;
      scheduledRefreshes.forEach((timeoutId) => window.clearTimeout(timeoutId));
      data?.subscription?.unsubscribe();
    };
  }, [refreshAuth, setAnonymous]);

  const contextValue = useMemo(() => ({
    ...authState,
    refreshAuth,
  }), [authState, refreshAuth]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

