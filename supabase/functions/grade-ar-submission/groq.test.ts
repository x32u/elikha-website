import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGroqRequestBody,
  callGroqEvaluation,
  groqSafeMessages,
  type GroqJsonRecord,
} from "./groq.ts";

const image = { mimeType: "image/png", base64: "c2FmZS1maXh0dXJl" };
const signal = new AbortController().signal;

const completion = (content: unknown) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

test("builds the supported Qwen vision JSON-mode request", () => {
  const body = buildGroqRequestBody({
    model: "qwen/qwen3.6-27b",
    prompt: "Grade this artwork.",
    image,
    attempt: 0,
  });

  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.equal(body.reasoning_effort, "none");
  assert.equal(body.reasoning_format, "hidden");
  assert.equal(body.temperature, 0.6);
  assert.equal(body.top_p, 0.8);
  assert.equal(body.messages[0].content[1].image_url.url, "data:image/png;base64,c2FmZS1maXh0dXJl");
  assert.equal("json_schema" in body.response_format, false);
});

test("retries a Groq failed_generation once and then returns validated JSON", async () => {
  const requests: RequestInit[] = [];
  const responses = [
    new Response(JSON.stringify({
      error: {
        message: "Failed to validate JSON. See failed_generation.",
        failed_generation: "private malformed output must not escape",
      },
    }), { status: 400 }),
    completion('{"criterionScores":[]}'),
  ];

  const result = await callGroqEvaluation({
    apiKey: "secret",
    model: "qwen/qwen3.6-27b",
    prompt: "prompt",
    image,
    signal,
    fetchImpl: async (_input, init) => {
      requests.push(init || {});
      return responses.shift() as Response;
    },
    validate: (value) => value,
  });

  assert.deepEqual(result, { criterionScores: [] });
  assert.equal(requests.length, 2);
  const retryBody = JSON.parse(String(requests[1].body));
  assert.match(retryBody.messages[0].content[0].text, /previous response could not be accepted/i);
  assert.doesNotMatch(retryBody.messages[0].content[0].text, /private malformed output/i);
});

test("retries a semantic rubric validation failure without reusing raw output", async () => {
  let calls = 0;
  const result = await callGroqEvaluation({
    apiKey: "secret",
    model: "qwen/qwen3.6-27b",
    prompt: "prompt",
    image,
    signal,
    fetchImpl: async () => {
      calls += 1;
      return completion('{"criterionScores":[{"score":99}]}');
    },
    validate: (value: GroqJsonRecord) => {
      if (calls === 1) throw new Error("score outside rubric");
      return value;
    },
  });

  assert.equal(calls, 2);
  assert.ok(Array.isArray(result.criterionScores));
});

test("returns a privacy-safe error after repeated malformed JSON", async () => {
  let calls = 0;
  await assert.rejects(
    callGroqEvaluation({
      apiKey: "secret",
      model: "qwen/qwen3.6-27b",
      prompt: "prompt",
      image,
      signal,
      fetchImpl: async () => {
        calls += 1;
        return completion("{private-child-data");
      },
      validate: (value) => value,
    }),
    (error: Error) => {
      assert.equal(error.message, groqSafeMessages.format);
      assert.doesNotMatch(error.message, /private-child-data|Groq|failed_generation/i);
      return true;
    },
  );
  assert.equal(calls, 2);
});

test("does not retry provider authentication failures", async () => {
  let calls = 0;
  await assert.rejects(
    callGroqEvaluation({
      apiKey: "bad-secret",
      model: "qwen/qwen3.6-27b",
      prompt: "prompt",
      image,
      signal,
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify({ error: { message: "Invalid API key: bad-secret" } }), {
          status: 401,
        });
      },
      validate: (value) => value,
    }),
    (error: Error) => {
      assert.equal(error.message, groqSafeMessages.temporary);
      assert.doesNotMatch(error.message, /bad-secret|API key/i);
      return true;
    },
  );
  assert.equal(calls, 1);
});

test("accepts fenced JSON and array-form message content", async () => {
  const result = await callGroqEvaluation({
    apiKey: "secret",
    model: "qwen/qwen3.6-27b",
    prompt: "prompt",
    image,
    signal,
    fetchImpl: async () => completion([{ text: "```json\n{\"ok\":true}\n```" }]),
    validate: (value) => value,
  });

  assert.deepEqual(result, { ok: true });
});

test("maps an aborted request to a safe timeout message", async () => {
  await assert.rejects(
    callGroqEvaluation({
      apiKey: "secret",
      model: "qwen/qwen3.6-27b",
      prompt: "prompt",
      image,
      signal,
      fetchImpl: async () => {
        throw new DOMException("request included private data", "AbortError");
      },
      validate: (value) => value,
    }),
    (error: Error) => {
      assert.equal(error.message, groqSafeMessages.timeout);
      assert.doesNotMatch(error.message, /private data/i);
      return true;
    },
  );
});
