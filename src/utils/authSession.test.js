import { clearLocalAuthSession } from './authSession';

describe('clearLocalAuthSession', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('removes the route-guard user marker and announces the auth change', () => {
    const listener = jest.fn();
    window.sessionStorage.setItem('userInfo', JSON.stringify({ id: 'student-1' }));
    window.addEventListener('elikha-auth-changed', listener);

    clearLocalAuthSession();

    expect(window.sessionStorage.getItem('userInfo')).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('elikha-auth-changed', listener);
  });
});
