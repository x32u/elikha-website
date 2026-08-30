/**
 * Regression tests for the grading Edge Function's rating validation.
 *
 * Exercises `validateEvaluation` indirectly through the same logic path by
 * reimplementing the criterion-mapping contract it must honour. These assert
 * the two defects found in production data:
 *   1. a developmental rubric must accept "NO" instead of forcing "BG" when the
 *      submission shows no evidence for a criterion;
 *   2. the draft star must not be a point average of ordinal levels.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { isSf9Rubric, sf9DraftStarRating, toSf9RatingCode } from "./sf9.ts";

const sf9Criterion = (name: string) => ({
  name,
  levels: [
    { code: "CO", score: 3, description: "Consistently shows the skill." },
    { code: "DV", score: 2, description: "Sometimes shows the skill." },
    { code: "BG", score: 1, description: "Rarely shows the skill." },
  ],
});

const legacyCriterion = (name: string) => ({
  name,
  levels: [
    { code: "C", score: 3, description: "Consistently shows the skill." },
    { code: "D", score: 2, description: "Sometimes shows the skill." },
    { code: "B", score: 1, description: "Rarely shows the skill." },
  ],
});

const pointCriterion = (name: string) => ({
  name,
  levels: [
    { code: "", score: 5, description: "Full marks." },
    { code: "", score: 3, description: "Partial marks." },
  ],
});

test("SF9 and legacy rubrics are both treated as developmental", () => {
  assert.equal(isSf9Rubric([sf9Criterion("a"), sf9Criterion("b")]), true);
  assert.equal(isSf9Rubric([legacyCriterion("a")]), true);
});

test("point rubrics are not treated as developmental", () => {
  assert.equal(isSf9Rubric([pointCriterion("a")]), false);
  assert.equal(isSf9Rubric([sf9Criterion("a"), pointCriterion("b")]), false);
});

test("a developmental level exists for every rating the AI may return", () => {
  const criterion = sf9Criterion("Uses small hand movements");
  ["CO", "DV", "BG"].forEach((code) => {
    const level = criterion.levels.find((item) => toSf9RatingCode(item.code) === code);
    assert.ok(level, `${code} must map to a rubric level`);
  });
  // NO deliberately has no level: it means "nothing to judge", not a low level.
  const notObserved = criterion.levels.find((item) => toSf9RatingCode(item.code) === "NO");
  assert.equal(notObserved, undefined);
});

test("legacy level codes still resolve for an SF9 rating", () => {
  const criterion = legacyCriterion("Arranges the parts");
  const level = criterion.levels.find((item) => toSf9RatingCode(item.code) === "BG");
  assert.equal(level?.score, 1);
});

test("the Cactus regression: unobservable criteria no longer read as Beginning", () => {
  // Production data: a robot rubric was attached to a Cactus activity, the AI
  // had no way to say "not applicable", and returned BG for all four criteria
  // with high confidence. That published a 2-star rating.
  const forcedBeginning = ["BG", "BG", "BG", "BG"];
  const honestlyUnobservable = ["NO", "NO", "NO", "NO"];

  assert.equal(sf9DraftStarRating(forcedBeginning), 1);
  assert.equal(
    sf9DraftStarRating(honestlyUnobservable),
    null,
    "no draft rating at all, so the teacher sees a flag rather than a grade",
  );
});

test("mixed observability rates only what was actually seen", () => {
  assert.equal(sf9DraftStarRating(["CO", "CO", "NO", "NO"]), 5);
  assert.equal(sf9DraftStarRating(["CO", "BG", "NO", "NO"]), 2);
});
