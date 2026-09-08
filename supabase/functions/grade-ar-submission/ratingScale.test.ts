import assert from "node:assert/strict";
import test from "node:test";
import {
  RUBRIC_AI_RATING_CODES,
  buildRubricRatingPromptLines,
  isDevelopmentalRubric,
  rubricDraftStarRating,
  rubricOrdinalScore,
  toRubricRatingCode,
} from "./ratingScale.ts";

test("uses private-school labels with compatible stored codes", () => {
  assert.deepEqual([...RUBRIC_AI_RATING_CODES], ["BG", "DV", "CO", "NO"]);
  assert.equal(toRubricRatingCode("B"), "BG");
  assert.equal(toRubricRatingCode("C"), "CO");
  assert.equal(rubricOrdinalScore("BG"), 1);
  assert.equal(rubricOrdinalScore("CO"), 3);
});

test("recognizes new and historical three-level rubrics", () => {
  assert.equal(isDevelopmentalRubric([{
    levels: [{ code: "BG" }, { code: "DV" }, { code: "CO" }],
  }]), true);
  assert.equal(isDevelopmentalRubric([{
    levels: [{ code: "B" }, { code: "D" }, { code: "C" }],
  }]), true);
});

test("prompt grades free-form criteria without requiring public-school standards", () => {
  const prompt = buildRubricRatingPromptLines().join("\n");
  assert.match(prompt, /free-form criterion/i);
  assert.match(prompt, /Beginning.*Developing.*Consistent/i);
  assert.doesNotMatch(prompt, /DepEd|SF9|III\.|IV\.G/i);
});

test("star draft remains compatible and excludes missing evidence", () => {
  assert.equal(rubricDraftStarRating(["CO", "CO", "CO"]), 5);
  assert.equal(rubricDraftStarRating(["CO", "BG", "NO"]), 2);
  assert.equal(rubricDraftStarRating(["NO"]), null);
});
