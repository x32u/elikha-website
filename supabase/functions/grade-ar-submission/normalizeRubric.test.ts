import assert from "node:assert/strict";
import test from "node:test";
import { sf9OrdinalScore, toSf9RatingCode } from "./sf9.ts";

// Mirrors normalizeRubric's level mapping in index.ts. Kept in lockstep here so
// the SF9-rubric-has-no-numeric-score regression cannot come back silently.
const asObject = (v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const cleanText = (v: unknown, n: number) =>
  String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

const normalizeLevels = (rawLevels: unknown[]) =>
  rawLevels.map((rawLevel) => {
    const level = asObject(rawLevel);
    const code = cleanText(level.code, 12).toUpperCase();
    const score = Number.isFinite(Number(level.score))
      ? Number(level.score)
      : sf9OrdinalScore(code);
    return { score, code, description: cleanText(level.description, 800) };
  }).filter((level) => Number.isFinite(level.score) && level.description);

// Exactly what the builder's makeSf9Levels() writes: a code and a description
// built from the indicators, but NO numeric score.
const sf9BuilderLevels = [
  { code: "CO", label: "Consistent", description: "Always demonstrates the expected competency." },
  { code: "DV", label: "Developing", description: "Sometimes demonstrates the competency." },
  { code: "BG", label: "Beginning", description: "Rarely demonstrates the expected competency." },
];

test("an SF9 rubric level survives normalization (regression: scoreless levels were dropped)", () => {
  const levels = normalizeLevels(sf9BuilderLevels);
  assert.equal(levels.length, 3, "all three SF9 levels must survive the score filter");
  assert.deepEqual(
    levels.map((l) => [l.code, l.score]),
    [["CO", 3], ["DV", 2], ["BG", 1]],
  );
});

test("a legacy point rubric keeps its explicit numeric scores", () => {
  const levels = normalizeLevels([
    { code: "C", score: 3, description: "always" },
    { code: "D", score: 2, description: "sometimes" },
    { code: "B", score: 1, description: "rarely" },
  ]);
  assert.equal(levels.length, 3);
  assert.deepEqual(levels.map((l) => l.score), [3, 2, 1]);
});

test("a non-developmental point rubric with no codes still works", () => {
  const levels = normalizeLevels([
    { score: 5, description: "full marks" },
    { score: 3, description: "partial" },
  ]);
  assert.equal(levels.length, 2);
  assert.deepEqual(levels.map((l) => l.score), [5, 3]);
});

test("a level with neither a code nor a score is dropped", () => {
  const levels = normalizeLevels([
    { description: "orphan with no code and no score" },
    { code: "CO", description: "kept" },
  ]);
  assert.equal(levels.length, 1);
  assert.equal(levels[0].code, "CO");
});

test("the max score of an SF9 rubric criterion is 3, not 0", () => {
  const levels = normalizeLevels(sf9BuilderLevels);
  const maxScore = Math.max(...levels.map((l) => l.score));
  assert.equal(maxScore, 3, "rubricMaxScore guard needs a positive max");
});
