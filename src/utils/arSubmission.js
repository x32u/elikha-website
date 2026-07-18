const AR_SUBMISSION_TAG = 'ar_submission_v1';

export const encodeArSubmissionDescription = (
  paintState = [],
  summary = 'Submitted from AR',
  sceneState = [],
  puzzleState = [],
  modelState = [],
  groupState = null
) => {
  try {
    return JSON.stringify({
      tag: AR_SUBMISSION_TAG,
      summary,
      paintState: Array.isArray(paintState) ? paintState : [],
      sceneState: Array.isArray(sceneState) ? sceneState : [],
      puzzleState: Array.isArray(puzzleState) ? puzzleState : [],
      modelState: Array.isArray(modelState) ? modelState : [],
      groupState: groupState && typeof groupState === 'object' ? groupState : null,
    });
  } catch (error) {
    console.error('Failed to encode AR submission payload:', error);
    return summary;
  }
};

export const parseArSubmissionDescription = (description) => {
  if (typeof description !== 'string' || !description.trim().startsWith('{')) return null;

  try {
    const parsed = JSON.parse(description);
    if (parsed?.tag !== AR_SUBMISSION_TAG) return null;
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : 'Submitted from AR',
      paintState: Array.isArray(parsed.paintState) ? parsed.paintState : [],
      sceneState: Array.isArray(parsed.sceneState) ? parsed.sceneState : [],
      puzzleState: Array.isArray(parsed.puzzleState) ? parsed.puzzleState : [],
      modelState: Array.isArray(parsed.modelState) ? parsed.modelState : [],
      groupState: parsed.groupState && typeof parsed.groupState === 'object' ? parsed.groupState : null,
    };
  } catch {
    return null;
  }
};
