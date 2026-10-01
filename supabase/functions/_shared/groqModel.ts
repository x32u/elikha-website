// Groq's documented multimodal successor to Qwen 3.6 (retired 2026-09-14).
// Keep image + JSON support for artwork grading; do not fall back to a text model.
// https://console.groq.com/docs/deprecations
export const DEFAULT_GROQ_MODEL = "qwen/qwen3.8-27b";

const RETIRED_GROQ_MODEL = "qwen/qwen3.6-27b";
let warnedAboutRetiredModel = false;

export const resolveGroqModel = (configuredModel?: string): string => {
  const model = configuredModel?.trim() || DEFAULT_GROQ_MODEL;

  // Migrate this exact retired override too: changing only the default leaves
  // deployments with the old GROQ_MODEL secret calling a decommissioned model.
  // Preserve all other explicitly configured model IDs.
  if (model === RETIRED_GROQ_MODEL) {
    if (!warnedAboutRetiredModel) {
      console.warn(
        `Groq model ${RETIRED_GROQ_MODEL} was retired; using its documented replacement ${DEFAULT_GROQ_MODEL}. Update GROQ_MODEL to the replacement.`,
      );
      warnedAboutRetiredModel = true;
    }
    return DEFAULT_GROQ_MODEL;
  }

  return model;
};
