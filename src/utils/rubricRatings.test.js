import {
  RUBRIC_RATINGS,
  RUBRIC_RATING_CODES,
  makeRubricLevels,
  rubricRatingLabel,
  toRubricRatingCode,
} from './rubricRatings';
import {
  SF9_RATINGS,
  makeSf9Levels,
  sf9RatingLabel,
  toSf9RatingCode,
} from './sf9Competencies';

describe('private-school rubric scale', () => {
  test('shows full levels in the teacher-friendly order while preserving codes', () => {
    expect(RUBRIC_RATINGS.map((rating) => rating.code)).toEqual(['BG', 'DV', 'CO']);
    expect(RUBRIC_RATINGS.map((rating) => rating.label))
      .toEqual(['Beginning', 'Developing', 'Consistent']);
    expect(RUBRIC_RATING_CODES).toEqual(['BG', 'DV', 'CO', 'NO', 'NA']);
  });

  test('provides editable private-school descriptions without DepEd language', () => {
    const levels = makeRubricLevels();
    expect(levels).toHaveLength(3);
    levels.forEach((level) => {
      expect(level.description.trim()).not.toBe('');
      expect(level.description).not.toMatch(/DepEd|SF9|competency/i);
    });
    levels[0].description = 'Teacher-customized wording.';
    expect(makeRubricLevels()[0].description).not.toBe('Teacher-customized wording.');
  });
});

describe('rating normalization and compatibility', () => {
  test('accepts current codes and older single-letter values', () => {
    expect(toRubricRatingCode('B')).toBe('BG');
    expect(toRubricRatingCode('D')).toBe('DV');
    expect(toRubricRatingCode('C')).toBe('CO');
    expect(toRubricRatingCode('bg')).toBe('BG');
    expect(toRubricRatingCode('NO')).toBe('NO');
    expect(toRubricRatingCode('NA')).toBe('NA');
    expect(toRubricRatingCode('X')).toBe('');
  });

  test('always exposes full labels to the UI', () => {
    expect(rubricRatingLabel('B')).toBe('Beginning');
    expect(rubricRatingLabel('CO')).toBe('Consistent');
    expect(rubricRatingLabel('NO')).toBe('Not observed');
  });

  test('keeps the old helper names as aliases for past integrations', () => {
    expect(SF9_RATINGS).toBe(RUBRIC_RATINGS);
    expect(makeSf9Levels()).toEqual(makeRubricLevels());
    expect(toSf9RatingCode('C')).toBe('CO');
    expect(sf9RatingLabel('BG')).toBe('Beginning');
  });
});
