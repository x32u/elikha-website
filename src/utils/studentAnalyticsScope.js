const pairKey = (classId, studentId) => `${classId || ''}:${studentId || ''}`;

/**
 * Keep report evidence inside the teacher's current class roster.
 * Historical assignments can outlive an enrollment, but they should not make
 * a zero-class account appear as a current learner in class rankings.
 */
export const scopeAnalyticsToCurrentEnrollments = ({
  activities = [],
  enrollments = [],
  assignments = [],
  submissions = [],
  observations = [],
  criteria = [],
} = {}) => {
  const classByActivity = new Map(
    activities
      .filter((activity) => activity?.id)
      .map((activity) => [activity.id, activity.class_id])
  );
  const enrolledPairs = new Set(
    enrollments
      .filter((enrollment) => enrollment?.class_id && enrollment?.student_id)
      .map((enrollment) => pairKey(enrollment.class_id, enrollment.student_id))
  );
  const isCurrentlyEnrolledForActivity = (row) => {
    const classId = classByActivity.get(row?.activity_id);
    return Boolean(classId && row?.student_id && enrolledPairs.has(pairKey(classId, row.student_id)));
  };

  const scopedAssignments = assignments.filter(isCurrentlyEnrolledForActivity);
  const scopedSubmissions = submissions.filter(isCurrentlyEnrolledForActivity);
  const scopedObservations = observations.filter((observation) => {
    const classId = classByActivity.get(observation?.activity_id);
    return Boolean(classId && observation?.learner_id && enrolledPairs.has(pairKey(classId, observation.learner_id)));
  });
  const observationIds = new Set(scopedObservations.map((observation) => observation.id));

  return {
    assignments: scopedAssignments,
    submissions: scopedSubmissions,
    observations: scopedObservations,
    criteria: criteria.filter((criterion) => observationIds.has(criterion?.observation_id)),
    excludedStudentIds: new Set([
      ...assignments.filter((row) => !isCurrentlyEnrolledForActivity(row)).map((row) => row?.student_id),
      ...submissions.filter((row) => !isCurrentlyEnrolledForActivity(row)).map((row) => row?.student_id),
      ...observations.filter((row) => {
        const classId = classByActivity.get(row?.activity_id);
        return !(classId && row?.learner_id && enrolledPairs.has(pairKey(classId, row.learner_id)));
      }).map((row) => row?.learner_id),
    ].filter(Boolean)),
  };
};
