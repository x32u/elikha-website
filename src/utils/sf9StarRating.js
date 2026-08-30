/**
 * Turns a set of SF9 developmental ratings into the single draft star rating a
 * learner sees for a submission.
 *
 * The SF9 form deliberately has no overall score: BG/DV/CO are ordinal
 * categories, so averaging them as 1/2/3 invents arithmetic the scale does not
 * support. Two very different learners collapse onto the same number that way
 * (four Developing ratings and two Consistent + two Beginning both average to
 * 8/12). e-Likha still shows stars because they motivate kindergarten
 * learners, so the star is derived by a rule that keeps a Beginning rating
 * visible instead of letting strong criteria average it away.
 *
 * Rules:
 *  - `NO` (not observed) and `NA` (not applicable) are excluded from the count.
 *    Absence of evidence is not evidence of a low level.
 *  - Every rated criterion Consistent -> 5 stars.
 *  - No Beginning ratings -> 4 stars.
 *  - Beginning in fewer than half of the rated criteria -> 3 stars.
 *  - Beginning in half or more -> 2 stars.
 *  - Every rated criterion Beginning -> 1 star.
 *  - Nothing rated at all -> null, so the UI can say "not enough evidence"
 *    rather than publishing the bottom of the scale.
 */
import { toSf9RatingCode } from './sf9Competencies';

const JUDGED_CODES = ['CO', 'DV', 'BG'];

/** Keeps only the ratings that represent an actual developmental judgement. */
export const judgedSf9Ratings = (ratings) => (Array.isArray(ratings) ? ratings : [])
  .map(toSf9RatingCode)
  .filter((code) => JUDGED_CODES.includes(code));

export const summarizeSf9Ratings = (ratings) => {
  const judged = judgedSf9Ratings(ratings);
  return {
    judged: judged.length,
    consistent: judged.filter((code) => code === 'CO').length,
    developing: judged.filter((code) => code === 'DV').length,
    beginning: judged.filter((code) => code === 'BG').length,
    skipped: (Array.isArray(ratings) ? ratings.length : 0) - judged.length,
  };
};

/**
 * Draft star rating (1-5) for a set of criterion ratings, or null when no
 * criterion could be judged.
 */
export const sf9DraftStarRating = (ratings) => {
  const { judged, consistent, beginning } = summarizeSf9Ratings(ratings);
  if (judged === 0) return null;
  if (consistent === judged) return 5;
  if (beginning === 0) return 4;
  if (beginning === judged) return 1;
  return beginning * 2 >= judged ? 2 : 3;
};

/** Short plain-language reason for the draft, shown next to it in review. */
export const sf9DraftStarRationale = (ratings) => {
  const { judged, consistent, developing, beginning, skipped } = summarizeSf9Ratings(ratings);
  if (judged === 0) {
    return 'No criterion could be observed in this submission, so there is no draft rating.';
  }

  const parts = [];
  if (consistent) parts.push(`${consistent} Consistent`);
  if (developing) parts.push(`${developing} Developing`);
  if (beginning) parts.push(`${beginning} Beginning`);

  const counts = `Based on ${parts.join(', ')} across ${judged} observed ${judged === 1 ? 'criterion' : 'criteria'}.`;
  const note = beginning
    ? ' A Beginning rating keeps the draft lower so follow-up stays visible.'
    : '';
  const skippedNote = skipped
    ? ` ${skipped} ${skipped === 1 ? 'criterion was' : 'criteria were'} not observed and did not affect the draft.`
    : '';

  return `${counts}${note}${skippedNote}`;
};
