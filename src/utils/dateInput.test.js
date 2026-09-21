import { getLocalDateInputValue } from './dateInput';

describe('date input helpers', () => {
  test('formats dates with local calendar fields', () => {
    const date = new Date(2026, 8, 13, 23, 45);
    expect(getLocalDateInputValue(date)).toBe('2026-09-13');
  });

  test('returns an empty value for invalid input', () => {
    expect(getLocalDateInputValue('not-a-date')).toBe('');
  });
});
