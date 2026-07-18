export const normalizeStarRating = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;

  // Older rows may still contain 1-100 scores. Convert those to 1-5 stars.
  const starScaleValue = parsed > 5 ? parsed / 20 : parsed;
  return Math.max(0, Math.min(5, Math.round(starScaleValue)));
};

export const hasStarRating = (value) => normalizeStarRating(value) > 0;

export const starRatingLabel = (value) => {
  const rating = normalizeStarRating(value);
  return rating ? `${rating}/5 stars` : 'Not rated';
};

export const starRatingText = (value) => {
  const rating = normalizeStarRating(value);
  if (!rating) return 'Not rated';
  return `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)} (${rating}/5)`;
};
