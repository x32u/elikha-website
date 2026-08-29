export const clearLocalAuthSession = () => {
  if (typeof window === 'undefined') return;

  window.sessionStorage.removeItem('userInfo');
  window.dispatchEvent(new Event('elikha-auth-changed'));
};
