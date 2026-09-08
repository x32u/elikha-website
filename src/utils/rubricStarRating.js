import { toRubricRatingCode } from './rubricRatings';

const JUDGED_CODES = ['CO', 'DV', 'BG'];

/** Keeps only ratings that represent an observed developmental level. */
export const judgedRubricRatings = (ratings) => (Array.isArray(ratings) ? ratings : [])
  .map(toRubricRatingCode)
  .filter((code) => JUDGED_CODES.includes(code));

export const summarizeRubricRatings = (ratings) => {
  const judged = judgedRubricRatings(ratings);
  return {
    judged: judged.length,
    consistent: judged.filter((code) => code === 'CO').length,
    developing: judged.filter((code) => code === 'DV').length,
    beginning: judged.filter((code) => code === 'BG').length,
    skipped: (Array.isArray(ratings) ? ratings.length : 0) - judged.length,
  };
};

/**
 * Converts the three-level rubric into the existing learner-facing 1–5 star
 * draft without treating Not observed / Not applicable as a low result.
 */
export const rubricDraftStarRating = (ratings) => {
  const { judged, consistent, beginning } = summarizeRubricRatings(ratings);
  if (judged === 0) return null;
  if (consistent === judged) return 5;
  if (beginning === 0) return 4;
  if (beginning === judged) return 1;
  return beginning * 2 >= judged ? 2 : 3;
};

export const rubricDraftStarRationale = (ratings) => {
  const { judged, consistent, developing, beginning, skipped } = summarizeRubricRatings(ratings);
  if (judged === 0) {
    return 'No criterion could be observed in this submission, so there is no draft rating.';
  }

  const parts = [];
  if (consistent) parts.push(`${consistent} Consistent`);
  if (developing) parts.push(`${developing} Developing`);
  if (beginning) parts.push(`${beginning} Beginning`);

  const counts = `Based on ${parts.join(', ')} across ${judged} observed ${judged === 1 ? 'criterion' : 'criteria'}.`;
  const note = beginning
    ? ' A Beginning result keeps the draft lower so needed support stays visible.'
    : '';
  const skippedNote = skipped
    ? ` ${skipped} ${skipped === 1 ? 'criterion was' : 'criteria were'} not observed and did not affect the draft.`
    : '';

  return `${counts}${note}${skippedNote}`;
};
