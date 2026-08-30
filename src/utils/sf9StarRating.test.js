import {
  judgedSf9Ratings,
  sf9DraftStarRating,
  sf9DraftStarRationale,
  summarizeSf9Ratings,
} from './sf9StarRating';

describe('judgedSf9Ratings', () => {
  test('keeps only actual developmental judgements', () => {
    expect(judgedSf9Ratings(['CO', 'DV', 'BG', 'NO', 'NA'])).toEqual(['CO', 'DV', 'BG']);
  });

  test('accepts legacy single-letter codes', () => {
    expect(judgedSf9Ratings(['C', 'D', 'B'])).toEqual(['CO', 'DV', 'BG']);
  });

  test('discards unknown values and non-arrays', () => {
    expect(judgedSf9Ratings(['CO', 'X', '', null, 3])).toEqual(['CO']);
    expect(judgedSf9Ratings(null)).toEqual([]);
  });
});

describe('sf9DraftStarRating', () => {
  test('all Consistent earns the top rating', () => {
    expect(sf9DraftStarRating(['CO', 'CO', 'CO', 'CO'])).toBe(5);
    expect(sf9DraftStarRating(['CO'])).toBe(5);
  });

  test('no Beginning ratings earns 4', () => {
    expect(sf9DraftStarRating(['CO', 'CO', 'DV', 'DV'])).toBe(4);
    expect(sf9DraftStarRating(['DV', 'DV', 'DV', 'DV'])).toBe(4);
  });

  test('a minority of Beginning ratings earns 3', () => {
    expect(sf9DraftStarRating(['CO', 'CO', 'CO', 'BG'])).toBe(3);
    expect(sf9DraftStarRating(['CO', 'DV', 'DV', 'BG'])).toBe(3);
  });

  test('Beginning in half or more earns 2', () => {
    expect(sf9DraftStarRating(['CO', 'CO', 'BG', 'BG'])).toBe(2);
    expect(sf9DraftStarRating(['CO', 'BG', 'BG', 'BG'])).toBe(2);
    expect(sf9DraftStarRating(['DV', 'BG'])).toBe(2);
  });

  test('all Beginning reaches the bottom of the scale', () => {
    expect(sf9DraftStarRating(['BG', 'BG', 'BG', 'BG'])).toBe(1);
  });

  test('distinguishes learners the old average collapsed together', () => {
    // Both scored 8/12 under the retired point average and both showed 4 stars.
    expect(sf9DraftStarRating(['DV', 'DV', 'DV', 'DV'])).toBe(4);
    expect(sf9DraftStarRating(['CO', 'CO', 'BG', 'BG'])).toBe(2);
  });

  test('not-observed criteria are excluded rather than counted as zero', () => {
    expect(sf9DraftStarRating(['CO', 'CO', 'NO', 'NO'])).toBe(5);
    expect(sf9DraftStarRating(['CO', 'DV', 'NA'])).toBe(4);
    expect(sf9DraftStarRating(['BG', 'NO', 'NO', 'NO'])).toBe(1);
  });

  test('returns null when nothing could be observed', () => {
    expect(sf9DraftStarRating(['NO', 'NO', 'NO', 'NO'])).toBeNull();
    expect(sf9DraftStarRating(['NA'])).toBeNull();
    expect(sf9DraftStarRating([])).toBeNull();
    expect(sf9DraftStarRating(null)).toBeNull();
  });

  test('never returns a value outside 1-5', () => {
    const codes = ['CO', 'DV', 'BG', 'NO', 'NA'];
    codes.forEach((a) => codes.forEach((b) => codes.forEach((c) => {
      const star = sf9DraftStarRating([a, b, c]);
      if (star !== null) {
        expect(star).toBeGreaterThanOrEqual(1);
        expect(star).toBeLessThanOrEqual(5);
      }
    })));
  });
});

describe('summarizeSf9Ratings', () => {
  test('counts each level and the skipped criteria', () => {
    expect(summarizeSf9Ratings(['CO', 'CO', 'DV', 'BG', 'NO'])).toEqual({
      judged: 4,
      consistent: 2,
      developing: 1,
      beginning: 1,
      skipped: 1,
    });
  });
});

describe('sf9DraftStarRationale', () => {
  test('explains the counts behind the draft', () => {
    const rationale = sf9DraftStarRationale(['CO', 'CO', 'DV', 'BG']);
    expect(rationale).toContain('2 Consistent');
    expect(rationale).toContain('1 Developing');
    expect(rationale).toContain('1 Beginning');
    expect(rationale).toContain('follow-up');
  });

  test('mentions criteria that were not observed', () => {
    expect(sf9DraftStarRationale(['CO', 'NO', 'NO'])).toContain('2 criteria were not observed');
  });

  test('says plainly when there is nothing to rate', () => {
    expect(sf9DraftStarRationale(['NO', 'NO'])).toContain('no draft rating');
  });
});
