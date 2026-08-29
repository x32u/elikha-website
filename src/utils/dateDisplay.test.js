import { formatTimeAgo, getDueDateState } from './dateDisplay';

describe('getDueDateState', () => {
  it('keeps a date-only deadline open through the end of that local calendar day', () => {
    const noonOnDueDate = new Date(2026, 7, 13, 12, 0, 0);

    expect(getDueDateState('2026-08-13', noonOnDueDate)).toEqual({
      hasValidDueDate: true,
      isPastDue: false,
      isDueSoon: true,
    });
  });

  it('marks a date-only deadline past due on the next day', () => {
    const nextDay = new Date(2026, 7, 14, 0, 0, 0);
    expect(getDueDateState('2026-08-13', nextDay).isPastDue).toBe(true);
  });

  it('does not classify missing or invalid values as deadlines', () => {
    expect(getDueDateState('not-a-date')).toEqual({
      hasValidDueDate: false,
      isPastDue: false,
      isDueSoon: false,
    });
  });
});

describe('formatTimeAgo', () => {
  const now = new Date('2026-08-13T12:00:00Z');

  it('shows elapsed days instead of labeling old submissions as today', () => {
    expect(formatTimeAgo('2026-08-10T12:00:00Z', now)).toBe('3d ago');
  });

  it('uses a calendar label for submissions at least a week old', () => {
    expect(formatTimeAgo('2026-07-01T12:00:00Z', now)).toBe('Jul 1');
  });

  it('handles future and invalid values safely', () => {
    expect(formatTimeAgo('2026-08-13T12:00:30Z', now)).toBe('Just now');
    expect(formatTimeAgo('invalid', now)).toBe('Recently');
  });
});

