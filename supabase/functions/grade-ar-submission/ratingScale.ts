/** Private-school three-level rubric helpers used by the grading function. */
export const RUBRIC_JUDGED_CODES = Object.freeze(["BG", "DV", "CO"]);
export const RUBRIC_AI_RATING_CODES = Object.freeze(["BG", "DV", "CO", "NO"]);

export const RUBRIC_RATING_LABELS = Object.freeze({
  BG: "Beginning",
  DV: "Developing",
  CO: "Consistent",
  NO: "Not observed",
  NA: "Not applicable",
});

const LEGACY_ALIASES: Record<string, string> = { B: "BG", D: "DV", C: "CO" };

export const toRubricRatingCode = (value: unknown): string => {
  const code = String(value ?? "").trim().toUpperCase();
  if (!code) return "";
  const mapped = LEGACY_ALIASES[code] ?? code;
  return Object.prototype.hasOwnProperty.call(RUBRIC_RATING_LABELS, mapped) ? mapped : "";
};

export const rubricRatingLabel = (value: unknown): string =>
  RUBRIC_RATING_LABELS[toRubricRatingCode(value) as keyof typeof RUBRIC_RATING_LABELS] ?? "";

export type RubricRatingSummary = {
  judged: number;
  consistent: number;
  developing: number;
  beginning: number;
  skipped: number;
};

export const summarizeRubricRatings = (ratings: unknown[]): RubricRatingSummary => {
  const codes = (Array.isArray(ratings) ? ratings : []).map(toRubricRatingCode);
  const judged = codes.filter((code) => RUBRIC_JUDGED_CODES.includes(code));
  return {
    judged: judged.length,
    consistent: judged.filter((code) => code === "CO").length,
    developing: judged.filter((code) => code === "DV").length,
    beginning: judged.filter((code) => code === "BG").length,
    skipped: codes.length - judged.length,
  };
};

export const rubricDraftStarRating = (ratings: unknown[]): number | null => {
  const { judged, consistent, beginning } = summarizeRubricRatings(ratings);
  if (judged === 0) return null;
  if (consistent === judged) return 5;
  if (beginning === 0) return 4;
  if (beginning === judged) return 1;
  return beginning * 2 >= judged ? 2 : 3;
};

/** True for both new private-school and older rubrics using the same codes. */
export const isDevelopmentalRubric = (
  criteria: Array<{ levels: Array<{ code?: string }> }>,
): boolean =>
  criteria.length > 0 &&
  criteria.every((criterion) =>
    RUBRIC_JUDGED_CODES.every((code) =>
      criterion.levels.some((level) => toRubricRatingCode(level.code) === code)
    )
  );

/** Ordinal values retained for stored score compatibility: BG=1, DV=2, CO=3. */
export const rubricOrdinalScore = (code: unknown): number => {
  const mapped = toRubricRatingCode(code);
  return mapped === "CO" ? 3 : mapped === "DV" ? 2 : mapped === "BG" ? 1 : NaN;
};

export const buildRubricRatingPromptLines = (): string[] => [
  "Evaluate each free-form criterion exactly as the teacher wrote it; do not require curriculum, domain, or competency codes.",
  "Compare the visible submission evidence with that criterion's own Beginning, Developing, and Consistent descriptions.",
  "Return exactly one internal rating value for every criterion: BG (Beginning), DV (Developing), CO (Consistent), or NO (Not observed).",
  `Rating labels: ${JSON.stringify(RUBRIC_RATING_LABELS)}.`,
  "Use NO when the image and saved AR state do not provide enough evidence to judge the criterion. Do not lower a learner to Beginning merely because evidence is missing.",
  "Use BG only when visible evidence matches the teacher's Beginning description, DV when it matches Developing, and CO when it matches Consistent.",
];

