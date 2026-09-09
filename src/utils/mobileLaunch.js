export const isMobileSandboxAutoLaunch = (search = '') => {
  const params = new URLSearchParams(search);
  return params.get('mobile') === '1' && params.get('autostart') === '1';
};
