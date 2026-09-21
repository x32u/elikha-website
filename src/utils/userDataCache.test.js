import {
  invalidateUserDataCache,
  readUserDataCache,
  writeUserDataCache,
} from './userDataCache';

describe('user-scoped application data cache', () => {
  beforeEach(() => window.localStorage.clear());

  it('keeps cached activity data isolated between accounts', () => {
    writeUserDataCache('student-a', 'activities', [{ id: 'a1' }]);
    expect(readUserDataCache('student-a', 'activities')?.data).toEqual([{ id: 'a1' }]);
    expect(readUserDataCache('student-b', 'activities')).toBeNull();
  });

  it('invalidates a user cache during mutations or logout', () => {
    writeUserDataCache('student-a', 'activities', [{ id: 'a1' }]);
    invalidateUserDataCache('student-a');
    expect(readUserDataCache('student-a', 'activities')).toBeNull();
  });

  it('does not return entries older than the requested maximum age', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1000);
    writeUserDataCache('student-a', 'activities', [{ id: 'a1' }]);
    nowSpy.mockReturnValue(5000);
    expect(readUserDataCache('student-a', 'activities', { maxAgeMs: 1000 })).toBeNull();
    nowSpy.mockRestore();
  });
});
