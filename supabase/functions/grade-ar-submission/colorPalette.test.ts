import assert from "node:assert/strict";
import test from "node:test";
import { normalizeArColorSuggestions } from "./colorPalette.ts";

test("keeps only colors from the AR palette and canonicalizes their labels", () => {
  assert.deepEqual(
    normalizeArColorSuggestions([
      { name: "Electric Blue", hex: "#2563eb" },
      { name: "red", hex: "#FF0000" },
      { name: "neon pink", hex: "#FF1493" },
      { name: "blue violet", hex: "#111111" },
      { name: "BLUE VIOLET", hex: "#2563EB" },
    ]),
    [
      { name: "Blue Violet", hex: "#2563EB" },
      { name: "Red", hex: "#FF0000" },
    ],
  );
});

test("returns no learner-facing suggestions for unknown colors", () => {
  assert.deepEqual(normalizeArColorSuggestions([
    { name: "aqua", hex: "#00FFFF" },
    { name: "magenta", hex: "#FF00FF" },
  ]), []);
});
