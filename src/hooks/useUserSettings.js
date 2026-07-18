import { useEffect, useState } from 'react';
import { getUserSettings } from '../services/userSettingsApi';
import { getSessionUserInfo, getStoredUserSettings, subscribeToUserSettings } from '../utils/userSettings';

export const useUserSettings = () => {
  const [userInfo, setUserInfo] = useState(() => getSessionUserInfo());
  const [settings, setSettings] = useState(() => getStoredUserSettings(userInfo.id));
  const [loading, setLoading] = useState(Boolean(userInfo.id));
  const [needsDatabaseSetup, setNeedsDatabaseSetup] = useState(false);

  useEffect(() => {
    const refreshUserInfo = () => setUserInfo(getSessionUserInfo());
    window.addEventListener('elikha-auth-changed', refreshUserInfo);
    window.addEventListener('storage', refreshUserInfo);
    window.addEventListener('focus', refreshUserInfo);

    return () => {
      window.removeEventListener('elikha-auth-changed', refreshUserInfo);
      window.removeEventListener('storage', refreshUserInfo);
      window.removeEventListener('focus', refreshUserInfo);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!userInfo.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const result = await getUserSettings(userInfo.id);
      if (!cancelled) {
        setSettings(result.data);
        setNeedsDatabaseSetup(Boolean(result.needsDatabaseSetup));
        setLoading(false);
      }
    };

    load();

    const unsubscribe = subscribeToUserSettings((nextSettings) => {
      if (!cancelled) setSettings(nextSettings);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [userInfo.id]);

  return { settings, setSettings, loading, userId: userInfo.id, needsDatabaseSetup };
};
