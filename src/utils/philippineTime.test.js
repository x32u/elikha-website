import { parseUtcTimestamp, formatPhilippineTimestamp, formatPhilippineDeadline, isSubmissionLate } from './philippineTime';

test('interprets bare database timestamps as UTC', () => {
  expect(parseUtcTimestamp('2026-09-28 11:50:22.855334').toISOString()).toBe('2026-09-28T11:50:22.855Z');
  expect(formatPhilippineTimestamp('2026-09-28T11:50:22.855334')).toBe('Sep 28, 2026, 7:50:22 PM PHT');
});
test('preserves explicit offsets without double conversion', () => {
  expect(formatPhilippineTimestamp('2026-09-28T08:30:00+08:00')).toBe('Sep 28, 2026, 8:30:00 AM PHT');
  expect(formatPhilippineTimestamp('2026-09-28T00:30:00Z')).toBe('Sep 28, 2026, 8:30:00 AM PHT');
});
test('handles PH midnight rollover', () => {
  expect(formatPhilippineTimestamp('2026-09-28T16:15:00')).toBe('Sep 29, 2026, 12:15:00 AM PHT');
});
test('date-only and legacy midnight deadlines allow the whole PH day', () => {
  expect(formatPhilippineDeadline('2026-09-26T00:00:00')).toBe('Sep 26, 2026, 11:59:59 PM PHT');
  expect(isSubmissionLate('2026-09-26T15:59:59Z', '2026-09-26')).toBe(false);
  expect(isSubmissionLate('2026-09-26T16:00:00Z', '2026-09-26T00:00:00')).toBe(true);
});
test('handles missing and invalid values', () => {
  expect(formatPhilippineTimestamp(null)).toBe('N/A');
  expect(formatPhilippineTimestamp('invalid')).toBe('N/A');
  expect(isSubmissionLate('invalid', null)).toBe(false);
});
