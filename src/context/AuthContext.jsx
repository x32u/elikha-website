import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { supabase, AUTH_STORAGE_KEY } from '../lib/supabase';
import { resolveAuthenticatedProfile } from '../utils/authState';
import { invalidateUserDataCache } from '../utils/userDataCache';

const AuthContext = createContext(null);

const publishUserInfo = (userInfo) => {
  if (userInfo) {
    window.sessionStorage.setItem('userInfo', JSON.stringify(userInfo));
  } else {
    window.sessionStorage.removeItem('userInfo');
  }
  window.dispatchEvent(new Event('elikha-auth-changed'));
};

const readPublishedUserInfo = () => {
  try {
    return JSON.parse(window.sessionStorage.getItem('userInfo') || 'null');
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState({
    status: 'loading',
    userInfo: null,
  });
  const requestSequence = useRef(0);
  const lastSuccessfulCheckRef = useRef(0);
  const verifiedUserRef = useRef(null);

  const clearIdentity = useCallback((status = 'loading') => {
    requestSequence.current += 1;
    const previous = verifiedUserRef.current || readPublishedUserInfo();
    if (previous?.id) invalidateUserDataCache(previous.id);
    verifiedUserRef.current = null;
    lastSuccessfulCheckRef.current = 0;
    publishUserInfo(null);
    setAuthState({ status, userInfo: null });
  }, []);

  const setAnonymous = useCallback(() => {
    clearIdentity('anonymous');
  }, [clearIdentity]);

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
      // Only preserve a profile verified in this page lifetime, never a stale
      // per-tab storage snapshot after another tab changes accounts.
      const cachedUser = verifiedUserRef.current;
      const isTemporaryFailure = result.reason === 'transient' || result.reason === 'profile-unavailable' || result.reason === 'verification-failed';
      if (isTemporaryFailure && cachedUser?.id && (!result.userId || result.userId === cachedUser.id)) {
        setAuthState({ status: 'authenticated', userInfo: cachedUser });
        return result;
      }
      if (result.reason === 'inactive') {
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch {
          // Clearing local app state still prevents continued UI access if the
          // network drops while the server-side Auth ban is being enforced.
        }
      }
      setAnonymous();
      return result;
    }

    lastSuccessfulCheckRef.current = Date.now();
    const previous = verifiedUserRef.current;
    if (previous?.id && previous.id !== result.user.id) invalidateUserDataCache(previous.id);
    verifiedUserRef.current = result.user;
    publishUserInfo(result.user);
    setAuthState({ status: 'authenticated', userInfo: result.user });
    return result;
  }, [setAnonymous]);

  useEffect(() => {
    const scheduledRefreshes = new Set();
    refreshAuth();

    const scheduleRefresh = () => {
      scheduledRefreshes.forEach((id) => window.clearTimeout(id));
      scheduledRefreshes.clear();
      const id = window.setTimeout(() => {
        scheduledRefreshes.delete(id);
        refreshAuth({ showLoading: false });
      }, 0);
      scheduledRefreshes.add(id);
    };

    // Storage is only a change signal, never proof of authorization. Always
    // resolve the current session/profile before showing the new identity.
    const checkSharedIdentity = () => {
      let nextId;
      try {
        nextId = JSON.parse(window.localStorage.getItem(AUTH_STORAGE_KEY) || 'null')?.user?.id || null;
      } catch { return; }
      const previous = verifiedUserRef.current || readPublishedUserInfo();
      if ((previous?.id || null) === nextId) return;
      clearIdentity();
      scheduleRefresh();
    };
    const onStorage = (event) => {
      if (event.storageArea === window.localStorage && (event.key === AUTH_STORAGE_KEY || event.key === null)) checkSharedIdentity();
    };
    const onVisible = () => { if (document.visibilityState === 'visible') checkSharedIdentity(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', checkSharedIdentity);
    document.addEventListener('visibilitychange', onVisible);

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || event === 'USER_DELETED' || (event === 'INITIAL_SESSION' && !session)) {
        scheduledRefreshes.forEach((id) => window.clearTimeout(id));
        scheduledRefreshes.clear();
        setAnonymous();
        return;
      }
      if (!session) return;
      const previous = verifiedUserRef.current || readPublishedUserInfo();
      if (previous?.id !== session.user?.id) clearIdentity();

      // Supabase advises deferring additional client calls until its auth callback
      // has returned. This also coalesces session restoration with route rendering.
      scheduleRefresh();
    });

    return () => {
      requestSequence.current += 1;
      scheduledRefreshes.forEach((timeoutId) => window.clearTimeout(timeoutId));
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', checkSharedIdentity);
      document.removeEventListener('visibilitychange', onVisible);
      data?.subscription?.unsubscribe();
    };
  }, [refreshAuth, setAnonymous, clearIdentity]);

  useEffect(() => {
    if (authState.status !== 'authenticated') return undefined;
    const recheck = () => {
      if (Date.now() - lastSuccessfulCheckRef.current < 5 * 60 * 1000) return;
      refreshAuth({ showLoading: false });
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') recheck(); };
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [authState.status, refreshAuth]);

  const contextValue = useMemo(() => ({
    ...authState,
    refreshAuth,
  }), [authState, refreshAuth]);

  return (
    <AuthContext.Provider value={contextValue}>
      <React.Fragment key={authState.userInfo ? `${authState.userInfo.id}:${authState.userInfo.role}` : 'no-account'}>
        {children}
      </React.Fragment>
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
