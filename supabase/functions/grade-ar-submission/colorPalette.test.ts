import assert from "node:assert/strict";
import test from "node:test";
import { normalizeArColorSuggestions, resolveActivityColorPalette } from "./colorPalette.ts";

test("keeps only colors from the AR palette and canonicalizes their labels", () => {
  assert.deepEqual(
    normalizeArColorSuggestions([
      { name: "blue", hex: "#0000ff" },
      { name: "red", hex: "#FF0000" },
      { name: "neon pink", hex: "#FF1493" },
      { name: "violet", hex: "#111111" },
      { name: "VIOLET", hex: "#7B2CFF" },
    ]),
    [
      { name: "Blue", hex: "#0000FF" },
      { name: "Red", hex: "#FF0000" },
      { name: "Violet", hex: "#7B2CFF" },
    ],
  );
});

test("restricts suggestions to the activity palette", () => {
  const palette = resolveActivityColorPalette([{ hex: "#123456", name: "Ocean" }]);
  assert.deepEqual(normalizeArColorSuggestions([
    { hex: "#FF0000", name: "red" },
    { hex: "#123456", name: "ocean" },
  ], palette), [{ hex: "#123456", name: "Ocean" }]);
});

test("returns no learner-facing suggestions for unknown colors", () => {
  assert.deepEqual(normalizeArColorSuggestions([
    { name: "aqua", hex: "#00FFFF" },
    { name: "magenta", hex: "#FF00FF" },
  ]), []);
});
