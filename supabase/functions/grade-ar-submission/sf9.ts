/**
 * DepEd SF9 rating helpers shared by the grading Edge Function.
 *
 * Mirrors `src/utils/sf9Competencies.js` and `src/utils/sf9StarRating.js`.
 * Deno cannot import from `src/`, so the logic is duplicated here and kept
 * honest by `sf9.test.ts`, which asserts the same cases as the web tests.
 */

/** Ratings that represent an actual developmental judgement. */
export const SF9_JUDGED_CODES = Object.freeze(["CO", "DV", "BG"]);

/** Every rating the AI may return. NO = nothing observable in the submission. */
export const SF9_AI_RATING_CODES = Object.freeze(["CO", "DV", "BG", "NO"]);

export const SF9_RATING_LABELS = Object.freeze({
  CO: "Consistent",
  DV: "Developing",
  BG: "Beginning",
  NO: "Not observed",
  NA: "Not applicable",
});

const LEGACY_ALIASES: Record<string, string> = {
  C: "CO",
  D: "DV",
  B: "BG",
};

/** Normalizes a legacy letter or SF9 code to its SF9 code, or "" if invalid. */
export const toSf9RatingCode = (value: unknown): string => {
  const code = String(value ?? "").trim().toUpperCase();
  if (!code) return "";
  const mapped = LEGACY_ALIASES[code] ?? code;
  return Object.prototype.hasOwnProperty.call(SF9_RATING_LABELS, mapped) ? mapped : "";
};

export const sf9RatingLabel = (value: unknown): string =>
  SF9_RATING_LABELS[toSf9RatingCode(value) as keyof typeof SF9_RATING_LABELS] ?? "";

export type Sf9Summary = {
  judged: number;
  consistent: number;
  developing: number;
  beginning: number;
  skipped: number;
};

export const summarizeSf9Ratings = (ratings: unknown[]): Sf9Summary => {
  const codes = (Array.isArray(ratings) ? ratings : []).map(toSf9RatingCode);
  const judged = codes.filter((code) => SF9_JUDGED_CODES.includes(code));
  return {
    judged: judged.length,
    consistent: judged.filter((code) => code === "CO").length,
    developing: judged.filter((code) => code === "DV").length,
    beginning: judged.filter((code) => code === "BG").length,
    skipped: codes.length - judged.length,
  };
};

/**
 * Draft star rating (1-5) for a set of criterion ratings, or null when no
 * criterion could be judged.
 *
 * SF9 levels are ordinal categories, so they are not averaged as points: doing
 * that collapsed very different learners onto the same star (four Developing
 * ratings and two Consistent + two Beginning both landed on 4). A Beginning
 * rating instead caps the draft so follow-up stays visible, and NO/NA are
 * excluded rather than counted as zero.
 */
export const sf9DraftStarRating = (ratings: unknown[]): number | null => {
  const { judged, consistent, beginning } = summarizeSf9Ratings(ratings);
  if (judged === 0) return null;
  if (consistent === judged) return 5;
  if (beginning === 0) return 4;
  if (beginning === judged) return 1;
  return beginning * 2 >= judged ? 2 : 3;
};

/** True when every criterion offers the three SF9 developmental levels. */
export const isSf9Rubric = (
  criteria: Array<{ levels: Array<{ code?: string }> }>,
): boolean =>
  criteria.length > 0 &&
  criteria.every((criterion) =>
    SF9_JUDGED_CODES.every((code) =>
      criterion.levels.some((level) => toSf9RatingCode(level.code) === code)
    )
  );

/**
 * Ordinal score for a rating code: BG=1, DV=2, CO=3 (legacy B/D/C map the
 * same). SF9 rubric levels carry a code but no numeric score, so this supplies
 * one for the max-score guard and stored rubric_score. Returns NaN for codes
 * with no developmental rank (NO/NA/unknown).
 */
export const sf9OrdinalScore = (code: unknown): number => {
  const mapped = toSf9RatingCode(code);
  return mapped === 'CO' ? 3 : mapped === 'DV' ? 2 : mapped === 'BG' ? 1 : NaN;
};
