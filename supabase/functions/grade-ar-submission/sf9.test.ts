import assert from "node:assert/strict";
import test from "node:test";
import {
  isSf9Rubric,
  sf9DraftStarRating,
  sf9OrdinalScore,
  sf9RatingLabel,
  summarizeSf9Ratings,
  toSf9RatingCode,
} from "./sf9.ts";

test("normalizes legacy letters and SF9 codes", () => {
  assert.equal(toSf9RatingCode("B"), "BG");
  assert.equal(toSf9RatingCode("D"), "DV");
  assert.equal(toSf9RatingCode("C"), "CO");
  assert.equal(toSf9RatingCode("bg"), "BG");
  assert.equal(toSf9RatingCode("NO"), "NO");
  assert.equal(toSf9RatingCode("X"), "");
  assert.equal(toSf9RatingCode(null), "");
});

test("labels ratings for teachers and parents", () => {
  assert.equal(sf9RatingLabel("BG"), "Beginning");
  assert.equal(sf9RatingLabel("B"), "Beginning");
  assert.equal(sf9RatingLabel("NO"), "Not observed");
  assert.equal(sf9RatingLabel("Z"), "");
});

test("all Consistent earns the top draft rating", () => {
  assert.equal(sf9DraftStarRating(["CO", "CO", "CO", "CO"]), 5);
});

test("no Beginning ratings earns 4", () => {
  assert.equal(sf9DraftStarRating(["CO", "CO", "DV", "DV"]), 4);
  assert.equal(sf9DraftStarRating(["DV", "DV", "DV", "DV"]), 4);
});

test("a minority of Beginning ratings earns 3", () => {
  assert.equal(sf9DraftStarRating(["CO", "CO", "CO", "BG"]), 3);
});

test("Beginning in half or more earns 2", () => {
  assert.equal(sf9DraftStarRating(["CO", "CO", "BG", "BG"]), 2);
});

test("all Beginning reaches the bottom of the scale", () => {
  assert.equal(sf9DraftStarRating(["BG", "BG", "BG", "BG"]), 1);
});

test("distinguishes learners the retired point average collapsed together", () => {
  // Both were 8/12 and both showed 4 stars before the SF9 alignment.
  assert.equal(sf9DraftStarRating(["DV", "DV", "DV", "DV"]), 4);
  assert.equal(sf9DraftStarRating(["CO", "CO", "BG", "BG"]), 2);
});

test("not-observed criteria are excluded rather than counted as zero", () => {
  assert.equal(sf9DraftStarRating(["CO", "CO", "NO", "NO"]), 5);
  assert.equal(sf9DraftStarRating(["BG", "NO", "NO", "NO"]), 1);
});

test("returns null when nothing could be observed", () => {
  assert.equal(sf9DraftStarRating(["NO", "NO", "NO", "NO"]), null);
  assert.equal(sf9DraftStarRating([]), null);
});

test("summarizes level counts and skipped criteria", () => {
  assert.deepEqual(summarizeSf9Ratings(["CO", "CO", "DV", "BG", "NO"]), {
    judged: 4,
    consistent: 2,
    developing: 1,
    beginning: 1,
    skipped: 1,
  });
});

test("detects SF9 rubrics by their level codes", () => {
  const sf9 = [{
    levels: [{ code: "CO" }, { code: "DV" }, { code: "BG" }],
  }];
  const legacy = [{
    levels: [{ code: "C" }, { code: "D" }, { code: "B" }],
  }];
  const points = [{ levels: [{ code: "" }, { code: "" }] }];

  assert.equal(isSf9Rubric(sf9), true);
  assert.equal(isSf9Rubric(legacy), true, "legacy letters are the same three levels");
  assert.equal(isSf9Rubric(points), false);
  assert.equal(isSf9Rubric([]), false);
});

test("gives SF9 and legacy codes an ordinal score, and NaN to the rest", () => {
  assert.equal(sf9OrdinalScore("CO"), 3);
  assert.equal(sf9OrdinalScore("DV"), 2);
  assert.equal(sf9OrdinalScore("BG"), 1);
  assert.equal(sf9OrdinalScore("C"), 3);
  assert.equal(sf9OrdinalScore("D"), 2);
  assert.equal(sf9OrdinalScore("B"), 1);
  assert.ok(Number.isNaN(sf9OrdinalScore("NO")));
  assert.ok(Number.isNaN(sf9OrdinalScore("NA")));
  assert.ok(Number.isNaN(sf9OrdinalScore("")));
});
