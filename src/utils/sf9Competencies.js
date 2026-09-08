/**
 * Backward-compatibility exports for code and saved data created while the
 * platform used SF9 naming. New code should import from `rubricRatings`.
 */
export {
  RUBRIC_RATINGS as SF9_RATINGS,
  RUBRIC_RATING_CODES as SF9_RATING_CODES,
  RUBRIC_RATING_LABELS as SF9_RATING_LABELS,
  makeRubricLevels as makeSf9Levels,
  rubricRatingLabel as sf9RatingLabel,
  toRubricRatingCode as toSf9RatingCode,
} from './rubricRatings';
