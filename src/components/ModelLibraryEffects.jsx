import React from 'react';
import { refreshR2ModelLibrary } from '../services/r2ModelApi';

const ModelLibraryEffects = () => {
  React.useEffect(() => {
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
  }, []);

  return null;
};

export default ModelLibraryEffects;
