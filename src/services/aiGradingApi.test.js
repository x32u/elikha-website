import {
  getAiSubmissionGrade,
  requestAiSubmissionGrade,
  sanitizeAiGradingError,
} from './aiGradingApi';

const mockInvoke = jest.fn();
const mockFrom = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args) => mockInvoke(...args) },
    from: (...args) => mockFrom(...args),
  },
}));

describe('AI grading error privacy', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockFrom.mockReset();
  });

  test('replaces raw Groq failed_generation details with teacher-friendly copy', () => {
    const value = sanitizeAiGradingError(
      "Groq request failed: Failed to validate JSON. See 'failed_generation' for more details: private output",
    );

    expect(value).toBe(
      'AI could not format a complete rubric check. Please try again or continue with the teacher assessment.',
    );
    expect(value).not.toMatch(/Groq|failed_generation|private output/i);
  });

  test('sanitizes provider errors returned by the Edge Function', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          clone: () => ({
            json: async () => ({
              error: 'Groq request failed with status 400. API key secret-value',
            }),
          }),
        },
      },
    });

    const result = await requestAiSubmissionGrade('submission-1');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/^AI could not format/);
    expect(result.error).not.toMatch(/Groq|secret-value|400/i);
  });

  test('sanitizes historical failed evaluations loaded from the database', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({
      data: {
        submission_id: 'submission-1',
        status: 'failed',
        error: "Groq request failed: Failed to validate JSON. See 'failed_generation'.",
      },
      error: null,
    });
    const eq = jest.fn(() => ({ maybeSingle }));
    const select = jest.fn(() => ({ eq }));
    mockFrom.mockReturnValue({ select });

    const result = await getAiSubmissionGrade('submission-1');

    expect(result.success).toBe(true);
    expect(result.data.error).toMatch(/^AI could not format/);
    expect(result.data.error).not.toMatch(/Groq|failed_generation/i);
  });
});
