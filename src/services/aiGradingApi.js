import { supabase } from '../lib/supabase';

const SAFE_AI_FORMAT_ERROR =
  'AI could not format a complete rubric check. Please try again or continue with the teacher assessment.';

export const sanitizeAiGradingError = (value) => {
  const message = String(value || '').replace(/\s+/g, ' ').trim();
  if (!message) return 'AI checking failed.';

  if (/\b(?:groq|gemini)\b|failed_generation|validate(?:d)? json|generated json|api key|bearer|upstream|status \d{3}/i.test(message)) {
    return SAFE_AI_FORMAT_ERROR;
  }

  return message.slice(0, 700);
};

const readFunctionError = async (error) => {
  const fallback = sanitizeAiGradingError(error?.message);
  const response = error?.context;
  if (!response || typeof response.clone !== 'function') return fallback;

  try {
    const body = await response.clone().json();
    return sanitizeAiGradingError(body?.error || fallback);
  } catch {
    return fallback;
  }
};

export const requestAiSubmissionGrade = async (submissionId, { force = false } = {}) => {
  if (!submissionId) {
    return { success: false, error: 'A submission is required for AI checking.' };
  }

  try {
    const { data, error } = await supabase.functions.invoke('grade-ar-submission', {
      body: { submissionId, force },
    });

    if (error) {
      return { success: false, error: await readFunctionError(error) };
    }

    return {
      success: true,
      status: data?.status || data?.evaluation?.status || 'completed',
      data: data?.evaluation || null,
      colorSuggestion: data?.colorSuggestion || data?.evaluation?.color_suggestion || null,
      cached: data?.cached === true,
    };
  } catch (error) {
    return {
      success: false,
      error: sanitizeAiGradingError(error?.message),
    };
  }
};

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export const requestStudentColorSuggestion = async (submissionId) => {
  let latestResult = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    latestResult = await requestAiSubmissionGrade(submissionId);
    if (!latestResult.success || latestResult.colorSuggestion || latestResult.status !== 'processing') {
      return latestResult;
    }

    await wait(1800);
  }

  return latestResult || {
    success: false,
    error: 'AI color checking did not finish in time.',
  };
};

export const getAiSubmissionGrade = async (submissionId) => {
  if (!submissionId) return { success: true, data: null };

  try {
    const { data, error } = await supabase
      .from('submission_ai_evaluations')
      .select('*')
      .eq('submission_id', submissionId)
      .maybeSingle();

    if (error) throw error;
    return {
      success: true,
      data: data
        ? {
          ...data,
          error: data.error ? sanitizeAiGradingError(data.error) : null,
        }
        : null,
    };
  } catch (error) {
    return {
      success: false,
      error: sanitizeAiGradingError(error?.message || 'Could not load the AI evaluation.'),
    };
  }
};
