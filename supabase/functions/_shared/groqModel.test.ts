import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_GROQ_MODEL, resolveGroqModel } from "./groqModel.ts";

test("defaults missing and blank configuration to the current multimodal successor", () => {
  assert.equal(DEFAULT_GROQ_MODEL, "qwen/qwen3.8-27b");
  assert.equal(resolveGroqModel(), DEFAULT_GROQ_MODEL);
  assert.equal(resolveGroqModel(""), DEFAULT_GROQ_MODEL);
  assert.equal(resolveGroqModel("  \n  "), DEFAULT_GROQ_MODEL);
});

test("migrates an explicit retired Qwen override and warns once per isolate", (context) => {
  const warnings: string[] = [];
  context.mock.method(console, "warn", (message: string) => warnings.push(message));

  assert.equal(resolveGroqModel("qwen/qwen3.6-27b"), DEFAULT_GROQ_MODEL);
  assert.equal(resolveGroqModel("  qwen/qwen3.6-27b  "), DEFAULT_GROQ_MODEL);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /qwen\/qwen3\.6-27b.*qwen\/qwen3\.8-27b/);
  assert.match(warnings[0], /Update GROQ_MODEL/);
});

test("preserves deliberate active or custom overrides without substituting a fallback", () => {
  assert.equal(resolveGroqModel(DEFAULT_GROQ_MODEL), DEFAULT_GROQ_MODEL);
  assert.equal(resolveGroqModel("  custom/vision-model  "), "custom/vision-model");
  assert.equal(resolveGroqModel("openai/gpt-oss-120b"), "openai/gpt-oss-120b");
});
