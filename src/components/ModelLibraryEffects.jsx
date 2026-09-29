import React from 'react';
import { refreshR2ModelLibrary } from '../services/r2ModelApi';
import { replaceR2ArModelLibrary } from '../utils/activityArConfig';
import { useAuth } from '../context/AuthContext';

const ModelLibraryEffects = () => {
  const { userInfo, status } = useAuth();
  const userId = userInfo?.id;
  React.useEffect(() => {
    replaceR2ArModelLibrary([], userId || null);
    if (status !== 'authenticated') return undefined;
    let active = true;

    const refresh = async () => {
      try {
        await refreshR2ModelLibrary();
      } catch (error) {
        if (active) console.error('Unable to refresh the shared 3D model library:', error);
      }
    };

    refresh();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);

    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
    };
  }, [userId, status]);

  return null;
};

export default ModelLibraryEffects;
