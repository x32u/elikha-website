export type GroqJsonRecord = Record<string, unknown>;

type GroqImage = {
  mimeType: string;
  base64: string;
};

type GroqEvaluationOptions<T> = {
  apiKey: string;
  model: string;
  prompt: string;
  image: GroqImage;
  signal: AbortSignal;
  validate: (value: GroqJsonRecord) => T;
  fetchImpl?: typeof fetch;
};

const MAX_ATTEMPTS = 2;
const GENERIC_FAILURE =
  "AI could not format a complete rubric check. Please try again or continue with the teacher assessment.";
const TEMPORARY_FAILURE =
  "AI checking is temporarily unavailable. Please try again or continue with the teacher assessment.";
const BUSY_FAILURE =
  "AI checking is temporarily busy. Please try again shortly or continue with the teacher assessment.";
const TIMEOUT_FAILURE =
  "AI checking took too long. Please try again or continue with the teacher assessment.";

const asObject = (value: unknown): GroqJsonRecord =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as GroqJsonRecord
    : {};

const cleanText = (value: unknown, maxLength = 300) =>
  String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const hasFailedGeneration = (error: GroqJsonRecord) =>
  Object.prototype.hasOwnProperty.call(error, "failed_generation");

const isJsonGenerationFailure = (payload: GroqJsonRecord) => {
  const error = asObject(payload.error);
  const code = cleanText(error.code ?? error.type, 100).toLowerCase();
  const message = cleanText(error.message, 500).toLowerCase();

  return hasFailedGeneration(error) ||
    code.includes("json_validate") ||
    message.includes("validate json") ||
    message.includes("generated json") ||
    message.includes("failed_generation");
};

const extractGroqText = (payload: GroqJsonRecord) => {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const message = asObject(asObject(choices[0]).message);
  const content = message.content;
  let text = "";

  if (typeof content === "string") {
    text = content.trim();
  } else if (Array.isArray(content)) {
    text = content
      .map((part) => {
        const item = asObject(part);
        return typeof item.text === "string" ? item.text : "";
      })
      .join("")
      .trim();
  }

  if (!text) throw new Error("empty_response");

  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
};

const retryInstruction = [
  "The previous response could not be accepted.",
  "Return exactly one complete JSON object with every required key.",
  "Use one criterionScores entry for every rubric criterion, with only an allowed rubric score.",
  "Do not include markdown, comments, reasoning, or text outside the JSON object.",
].join(" ");

export const buildGroqRequestBody = ({
  model,
  prompt,
  image,
  attempt,
}: {
  model: string;
  prompt: string;
  image: GroqImage;
  attempt: number;
}) => ({
  model,
  messages: [{
    role: "user",
    content: [
      {
        type: "text",
        text: `${prompt}\n\n${attempt > 0 ? retryInstruction : "Return only the requested JSON object."}`,
      },
      {
        type: "image_url",
        image_url: {
          url: `data:${image.mimeType};base64,${image.base64}`,
        },
      },
    ],
  }],
  response_format: { type: "json_object" },
  reasoning_effort: "none",
  reasoning_format: "hidden",
  temperature: 0.6,
  top_p: 0.8,
  max_completion_tokens: 4096,
  stream: false,
});

const safeStatusMessage = (status: number) => {
  if (status === 429) return BUSY_FAILURE;
  if (status === 401 || status === 403 || status === 404) return TEMPORARY_FAILURE;
  return GENERIC_FAILURE;
};

export const callGroqEvaluation = async <T>({
  apiKey,
  model,
  prompt,
  image,
  signal,
  validate,
  fetchImpl = fetch,
}: GroqEvaluationOptions<T>): Promise<T> => {
  let finalMessage = GENERIC_FAILURE;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          signal,
          body: JSON.stringify(buildGroqRequestBody({ model, prompt, image, attempt })),
        },
      );
      const payload = asObject(await response.json().catch(() => ({})));

      if (!response.ok) {
        const retryable = isJsonGenerationFailure(payload) || response.status >= 500;
        finalMessage = safeStatusMessage(response.status);
        if (retryable && attempt + 1 < MAX_ATTEMPTS) continue;
        throw new Error(finalMessage);
      }

      try {
        const parsed = asObject(JSON.parse(extractGroqText(payload)));
        return validate(parsed);
      } catch {
        finalMessage = GENERIC_FAILURE;
        if (attempt + 1 < MAX_ATTEMPTS) continue;
        throw new Error(finalMessage);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(TIMEOUT_FAILURE);
      }
      if (error instanceof Error && [
        GENERIC_FAILURE,
        TEMPORARY_FAILURE,
        BUSY_FAILURE,
        TIMEOUT_FAILURE,
      ].includes(error.message)) {
        throw error;
      }
      finalMessage = TEMPORARY_FAILURE;
      if (attempt + 1 < MAX_ATTEMPTS) continue;
      throw new Error(finalMessage);
    }
  }

  throw new Error(finalMessage);
};

export const groqSafeMessages = {
  format: GENERIC_FAILURE,
  temporary: TEMPORARY_FAILURE,
  busy: BUSY_FAILURE,
  timeout: TIMEOUT_FAILURE,
};
