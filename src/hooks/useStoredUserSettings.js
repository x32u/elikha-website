import { useEffect, useState } from 'react';
import { getCurrentUserSettings, subscribeToUserSettings } from '../utils/userSettings';

export const useStoredUserSettings = () => {
  const [settings, setSettings] = useState(() => getCurrentUserSettings());

  useEffect(() => {
    setSettings(getCurrentUserSettings());
    return subscribeToUserSettings((nextSettings) => {
      setSettings(nextSettings);
    });
  }, []);

  return settings;
};
