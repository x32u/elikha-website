// Submission RPCs store UTC in PostgreSQL timestamp-without-time-zone fields.
// Preserve explicit offsets; never let a browser interpret bare UTC as local time.
export const parseUtcTimestamp = (value) => {
  if (!value) return null;
  const raw = String(value).trim().replace(' ', 'T');
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)
    && !/(Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? `${raw}Z` : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatPhilippineTimestamp = (value) => {
  const date = parseUtcTimestamp(value);
  if (!date) return 'N/A';
  return `${new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  }).format(date)} PHT`;
};

// Legacy midnight deadlines represent a calendar date, due at end of day in PH.
export const parsePhilippineDeadline = (value) => {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})(?:[T ]00:00:00(?:\.0+)?)?$/);
  return match ? new Date(`${match[1]}T23:59:59.999+08:00`) : parseUtcTimestamp(value);
};

export const formatPhilippineDeadline = (value) => {
  const date = parsePhilippineDeadline(value);
  return date && !Number.isNaN(date.getTime())
    ? formatPhilippineTimestamp(date.toISOString()) : 'N/A';
};

export const isSubmissionLate = (submittedAt, dueAt) => {
  const submitted = parseUtcTimestamp(submittedAt);
  const due = parsePhilippineDeadline(dueAt);
  return Boolean(submitted && due && submitted > due);
};
