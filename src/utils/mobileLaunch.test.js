import { isMobileSandboxAutoLaunch } from './mobileLaunch';

describe('mobile sandbox launch', () => {
  it('allows the native and Flutter browser auto-start URL', () => {
    expect(
      isMobileSandboxAutoLaunch('?mobile=1&autostart=1&difficulty=easy&model=cactus')
    ).toBe(true);
  });

  it('keeps ordinary sandbox visits behind student authentication', () => {
    expect(isMobileSandboxAutoLaunch('')).toBe(false);
    expect(isMobileSandboxAutoLaunch('?mobile=1')).toBe(false);
    expect(isMobileSandboxAutoLaunch('?autostart=1')).toBe(false);
  });
});
