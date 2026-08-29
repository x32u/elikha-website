const FINAL_CRITERION_RATINGS = new Set(['B', 'D', 'C', 'NO', 'NA']);

const nullableText = (value) => {
  const normalized = String(value || '').trim();
  return normalized || null;
};

const confirmedAiEvaluationId = (aiEvaluation, submissionId) => {
  if (
    aiEvaluation?.status !== 'completed' ||
    !aiEvaluation?.id ||
    aiEvaluation?.submission_id !== submissionId
  ) {
    return null;
  }

  return aiEvaluation.id;
};

export const buildTeacherRubricEvidence = ({
  rubric,
  submission,
  observerId,
  criterionRatings = [],
  criterionNotes = [],
  observationDate,
  feedback,
  evidenceUrl,
  nextSteps,
  teacherConfirmed,
  aiEvaluation,
  confirmedAt = new Date().toISOString(),
}) => {
  if (!rubric) return null;
  if (!teacherConfirmed) {
    throw new Error('Teacher confirmation is required before rubric evidence can be finalized.');
  }
  if (!submission?.id || !submission?.studentId || !submission?.activityId || !observerId) {
    throw new Error('The review is missing its submission, learner, activity, or teacher identity.');
  }

  const rubricCriteria = Array.isArray(rubric.criteria) ? rubric.criteria : [];
  if (
    rubricCriteria.length === 0 ||
    criterionRatings.length !== rubricCriteria.length ||
    !criterionRatings.every((value) => FINAL_CRITERION_RATINGS.has(value))
  ) {
    throw new Error('Every rubric criterion needs a valid final teacher rating.');
  }

  return {
    observation: {
      rubric_id: rubric.id,
      rubric_version: String(rubric.assignedVersion || rubric.metadata?.version || 1),
      learner_id: submission.studentId,
      activity_id: submission.activityId,
      activity_name: submission.activityTitle,
      observer_id: observerId,
      observation_date: observationDate,
      overall_comment: nullableText(feedback),
      evidence_url: nullableText(evidenceUrl),
      next_steps: nullableText(nextSteps),
      teacher_confirmed_at: confirmedAt,
      ai_evaluation_id: confirmedAiEvaluationId(aiEvaluation, submission.id),
    },
    criteria: rubricCriteria.map((criterion, index) => ({
      criterion_index: index,
      criterion_title_snapshot: criterion.name,
      beginning_descriptor_snapshot: criterion.levels?.find((level) => level.code === 'B')?.description || '',
      developing_descriptor_snapshot: criterion.levels?.find((level) => level.code === 'D')?.description || '',
      consistent_descriptor_snapshot: criterion.levels?.find((level) => level.code === 'C')?.description || '',
      selected_rating: criterionRatings[index],
      teacher_note: nullableText(criterionNotes[index]),
    })),
  };
};
