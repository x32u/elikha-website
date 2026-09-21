import {
  DEFAULT_ACTIVITY_MAX_POINTS,
  MAX_ACTIVITY_POINTS,
  normalizeActivityMaxPoints,
} from './activityPoints';

describe('activity points', () => {
  test('accepts whole-number point values in the supported range', () => {
    expect(normalizeActivityMaxPoints(DEFAULT_ACTIVITY_MAX_POINTS)).toBe(5);
    expect(normalizeActivityMaxPoints('25')).toBe(25);
    expect(normalizeActivityMaxPoints(MAX_ACTIVITY_POINTS)).toBe(1000);
  });

  test.each([0, -1, 1.5, 1001, '', null, undefined])('rejects invalid value %p', (value) => {
    expect(normalizeActivityMaxPoints(value)).toBeNull();
  });
});
