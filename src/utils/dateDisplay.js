const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const parseDeadline = (value) => {
  if (!value) return { date: null, isDateOnly: false };

  const dateOnlyMatch = String(value).match(DATE_ONLY_PATTERN);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    const isExactDate = date.getFullYear() === Number(year)
      && date.getMonth() === Number(month) - 1
      && date.getDate() === Number(day);
    return { date: isExactDate ? date : null, isDateOnly: true };
  }

  const date = new Date(value);
  return {
    date: Number.isNaN(date.getTime()) ? null : date,
    isDateOnly: false,
  };
};

export const getDueDateState = (value, now = new Date()) => {
  const { date, isDateOnly } = parseDeadline(value);
  if (!date || Number.isNaN(now.getTime())) {
    return {
      hasValidDueDate: false,
      isPastDue: false,
      isDueSoon: false,
    };
  }

  const deadline = new Date(date);
  if (isDateOnly) deadline.setHours(23, 59, 59, 999);

  const timeRemaining = deadline.getTime() - now.getTime();
  return {
    hasValidDueDate: true,
    isPastDue: timeRemaining < 0,
    isDueSoon: timeRemaining >= 0 && timeRemaining <= 7 * DAY_MS,
  };
};

export const formatTimeAgo = (value, now = new Date()) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || Number.isNaN(now.getTime())) return 'Recently';

  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 60 * 1000) return 'Just now';

  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffMs / DAY_MS);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  }).format(date);
};

const calendarDayNumber = (value) => {
  const raw = String(value || '');
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return Date.UTC(Number(year), Number(month) - 1, Number(day)) / DAY_MS;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
};

const relativeUnit = (days, direction) => {
  const suffix = direction < 0 ? 'ago' : '';
  const prefix = direction > 0 ? 'in ' : '';
  const phrase = (amount, unit) => `${prefix}${amount === 1 ? `a ${unit}` : `${amount} ${unit}s`}${suffix ? ` ${suffix}` : ''}`;
  if (days < 7) return phrase(days, 'day');
  if (days < 14) return phrase(1, 'week');
  if (days < 60) return phrase(Math.max(2, Math.round(days / 7)), 'week');
  if (days < 365) return phrase(Math.max(2, Math.round(days / 30)), 'month');
  if (days < 548) return phrase(1, 'year');
  return phrase(Math.max(2, Math.round(days / 365)), 'year');
};

export const formatRelativeDueDate = (value, now = new Date()) => {
  if (!value || Number.isNaN(now.getTime())) return '';
  const dueDay = calendarDayNumber(value);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS;
  if (dueDay === null) return '';
  const difference = Math.round(dueDay - today);
  if (difference === 0) return 'Due today';
  if (difference === 1) return 'Due tomorrow';
  if (difference === -1) return 'Due yesterday';
  return `Due ${relativeUnit(Math.abs(difference), difference)}`;
};
