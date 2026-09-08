/**
 * Private-school developmental rubric scale.
 *
 * BG / DV / CO remain the persisted values so rubrics and reviews created by
 * older e-Likha versions continue to work. The codes are an implementation
 * detail; teacher- and learner-facing screens display the full labels.
 */
export const RUBRIC_RATINGS = Object.freeze([
  Object.freeze({
    code: 'BG',
    label: 'Beginning',
    defaultDescription: 'Shows the skill with guidance and is still building confidence.',
  }),
  Object.freeze({
    code: 'DV',
    label: 'Developing',
    defaultDescription: 'Shows the skill with some support and growing independence.',
  }),
  Object.freeze({
    code: 'CO',
    label: 'Consistent',
    defaultDescription: 'Shows the skill independently and consistently.',
  }),
]);

export const RUBRIC_RATING_CODES = Object.freeze(['BG', 'DV', 'CO', 'NO', 'NA']);

export const RUBRIC_RATING_LABELS = Object.freeze({
  BG: 'Beginning',
  DV: 'Developing',
  CO: 'Consistent',
  NO: 'Not observed',
  NA: 'Not applicable',
});

const LEGACY_RATING_ALIASES = Object.freeze({ B: 'BG', D: 'DV', C: 'CO' });

export const toRubricRatingCode = (value) => {
  const code = String(value ?? '').trim().toUpperCase();
  if (!code) return '';
  const mapped = LEGACY_RATING_ALIASES[code] || code;
  return RUBRIC_RATING_CODES.includes(mapped) ? mapped : '';
};

export const rubricRatingLabel = (value) => (
  RUBRIC_RATING_LABELS[toRubricRatingCode(value)] || ''
);

export const makeRubricLevels = () => RUBRIC_RATINGS.map((rating) => ({
  code: rating.code,
  label: rating.label,
  description: rating.defaultDescription,
}));

