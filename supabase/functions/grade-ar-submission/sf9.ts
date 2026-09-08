/**
 * Compatibility layer for older imports. The active grading implementation is
 * the private-school scale in `ratingScale.ts`; persisted BG/DV/CO values do
 * not need a data migration.
 */
export {
  RUBRIC_AI_RATING_CODES as SF9_AI_RATING_CODES,
  RUBRIC_JUDGED_CODES as SF9_JUDGED_CODES,
  RUBRIC_RATING_LABELS as SF9_RATING_LABELS,
  isDevelopmentalRubric as isSf9Rubric,
  rubricDraftStarRating as sf9DraftStarRating,
  rubricOrdinalScore as sf9OrdinalScore,
  rubricRatingLabel as sf9RatingLabel,
  summarizeRubricRatings as summarizeSf9Ratings,
  toRubricRatingCode as toSf9RatingCode,
} from "./ratingScale.ts";
