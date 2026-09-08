import { parseArSubmissionDescription } from './arSubmission';
import { isGenericStudentName } from './studentIdentity';

const ratingValue = (value) => ({ CO: 1, C: 1, DV: 0.67, D: 0.67, BG: 0.33, B: 0.33 }[String(value || '').toUpperCase()] ?? null);
const average = (items) => items.length ? items.reduce((sum, value) => sum + value, 0) / items.length : null;
const round = (value, digits = 1) => value == null ? null : Number(value.toFixed(digits));
const formatStars = (value) => Number(value).toFixed(1);
const criterionCategory = (title) => {
  const value = String(title || '').toLowerCase();
  if (/colou?r|paint|hue|shade/.test(value)) return 'coloring';
  if (/puzzle|piece|connect|assembl|arrang|fit|trace/.test(value)) return 'puzzle';
  return 'overall';
};

export const buildStudentInsights = ({ outcomes = [], submissions = [], observations = [], criteria = [], studentUsers = [] } = {}) => {
  const names = new Map(studentUsers.map((item) => [item.id, item.name || 'Student']));
  const emails = new Map(studentUsers.map((item) => [item.id, item.email || '']));
  outcomes.forEach((item) => {
    const currentName = names.get(item.studentId);
    if (!names.has(item.studentId) || (isGenericStudentName(currentName) && !isGenericStudentName(item.studentName))) {
      names.set(item.studentId, item.studentName || 'Student');
    }
  });
  const activityTitles = new Map(outcomes.map((item) => [item.activityId, item.activityTitle || 'Untitled activity']));
  const confirmed = new Map(observations.filter((item) => item.teacher_confirmed_at).map((item) => [item.id, item]));
  const criteriaByStudent = new Map();
  criteria.forEach((criterion) => {
    const observation = confirmed.get(criterion.observation_id);
    const value = ratingValue(criterion.selected_rating);
    if (!observation || value == null) return;
    const studentId = observation.learner_id;
    const list = criteriaByStudent.get(studentId) || [];
    list.push({
      value,
      category: criterionCategory(criterion.criterion_title_snapshot),
      at: observation.teacher_confirmed_at,
      activityId: observation.activity_id,
      activityTitle: activityTitles.get(observation.activity_id) || 'Untitled activity',
    });
    criteriaByStudent.set(studentId, list);
  });

  const students = new Map();
  studentUsers.forEach((student) => {
    if (!student?.id) return;
    students.set(student.id, {
      studentId: student.id,
      studentName: student.name || names.get(student.id) || 'Student',
      studentEmail: student.email || emails.get(student.id) || '',
      durations: [], color: [], puzzle: [], scores: [], activityRecords: [], overallActivityIds: new Set(),
    });
  });
  outcomes.forEach((outcome) => {
    if (!outcome?.studentId || students.has(outcome.studentId)) return;
    students.set(outcome.studentId, {
      studentId: outcome.studentId,
      studentName: outcome.studentName || names.get(outcome.studentId) || 'Student',
      studentEmail: emails.get(outcome.studentId) || '',
      durations: [], color: [], puzzle: [], scores: [], activityRecords: [], overallActivityIds: new Set(),
    });
  });
  submissions.forEach((submission) => {
    const studentId = submission.student_id;
    if (!studentId) return;
    const parsed = parseArSubmissionDescription(submission.description);
    const analytics = parsed?.analytics || {};
    const current = students.get(studentId) || {
      studentId, studentName: names.get(studentId) || 'Student', studentEmail: emails.get(studentId) || '', durations: [], color: [], puzzle: [], scores: [], activityRecords: [], overallActivityIds: new Set(),
    };
    const hasScore = submission.score !== null && submission.score !== undefined && String(submission.score).trim() !== '';
    const numericScore = hasScore ? Number(submission.score) : null;
    const duration = Number(analytics.activeDurationSeconds);
    if (duration > 0) current.durations.push({
      seconds: duration,
      quality: Number.isFinite(numericScore) ? Math.max(0, Math.min(1, numericScore / 5)) : null,
    });
    const color = Number(analytics?.coloring?.accuracyPercent);
    if (Number.isFinite(color)) {
      current.color.push(color / 100);
      if (submission.activity_id) current.overallActivityIds.add(submission.activity_id);
    }
    const puzzleAccuracy = Number(analytics?.puzzle?.accuracyPercent);
    const puzzleSeconds = Number(analytics?.puzzle?.completionSeconds);
    if (Number.isFinite(puzzleAccuracy)) {
      current.puzzle.push({ accuracy: puzzleAccuracy / 100, seconds: puzzleSeconds > 0 ? puzzleSeconds : null });
      if (submission.activity_id) current.overallActivityIds.add(submission.activity_id);
    }
    const reviewed = Boolean(submission.reviewed_at || ['reviewed', 'graded', 'completed'].includes(String(submission.status || '').toLowerCase()));
    if (reviewed && Number.isFinite(numericScore)) current.activityRecords.push({
      activityId: submission.activity_id,
      activityTitle: activityTitles.get(submission.activity_id) || 'Untitled activity',
      stars: Math.max(0, Math.min(5, numericScore)),
      at: submission.reviewed_at || submission.submitted_at,
      source: 'Teacher rating',
    });
    if (reviewed && Number.isFinite(numericScore) && submission.activity_id) current.overallActivityIds.add(submission.activity_id);
    students.set(studentId, current);
  });

  criteriaByStudent.forEach((_, studentId) => {
    if (!students.has(studentId)) students.set(studentId, {
      studentId, studentName: names.get(studentId) || 'Student', studentEmail: emails.get(studentId) || '', durations: [], color: [], puzzle: [], scores: [], activityRecords: [], overallActivityIds: new Set(),
    });
  });
  students.forEach((student) => {
    student.criteria = criteriaByStudent.get(student.studentId) || [];
    student.criteria.forEach((item) => {
      if (item.activityId) student.overallActivityIds.add(item.activityId);
    });
    const criteriaByActivity = new Map();
    student.criteria.forEach((item) => {
      const list = criteriaByActivity.get(item.activityId) || [];
      list.push(item);
      criteriaByActivity.set(item.activityId, list);
    });
    criteriaByActivity.forEach((items, activityId) => {
      if (student.activityRecords.some((record) => record.activityId === activityId)) return;
      const value = average(items.map((item) => item.value));
      student.activityRecords.push({
        activityId,
        activityTitle: items[0]?.activityTitle || 'Untitled activity',
        stars: value * 5,
        at: items.map((item) => item.at).filter(Boolean).sort().at(-1),
        source: 'Confirmed rubric',
      });
    });
    student.scores = student.activityRecords.map((record) => ({ value: record.stars / 5, at: record.at }));
  });

  const rows = [...students.values()].map((student) => {
    const colorRubric = student.criteria.filter((item) => item.category === 'coloring').map((item) => item.value);
    const puzzleRubric = student.criteria.filter((item) => item.category === 'puzzle').map((item) => item.value);
    const colorEvidence = [...student.color, ...colorRubric];
    const puzzleAccuracy = student.puzzle.map((item) => item.accuracy);
    const puzzleSpeed = student.puzzle.filter((item) => item.seconds).map((item) => 1 / (1 + item.seconds / 60));
    const puzzleScore = average([
      average(puzzleAccuracy), average(puzzleRubric), average(puzzleSpeed),
    ].filter((value) => value != null));
    const sortedActivityRecords = student.activityRecords.filter((item) => item.at).sort((a, b) => new Date(a.at) - new Date(b.at));
    const sortedScores = sortedActivityRecords.map((item) => ({ value: item.stars / 5, at: item.at }));
    const improvementStars = sortedActivityRecords.length >= 2
      ? sortedActivityRecords.at(-1).stars - sortedActivityRecords[0].stars
      : null;
    const mean = average(sortedScores.map((item) => item.value));
    const variance = mean != null && sortedScores.length >= 2
      ? average(sortedScores.map((item) => (item.value - mean) ** 2)) : null;
    const overallActivityCount = student.overallActivityIds.size;
    const overallScore = average([
      mean,
      average(colorEvidence),
      puzzleScore,
    ].filter((value) => value != null));
    return {
      ...student,
      fastestSeconds: (() => {
        const confirmedQuality = average(student.criteria.map((item) => item.value));
        const qualifying = student.durations.filter((item) => item.quality >= 0.8 || confirmedQuality >= 0.8);
        return qualifying.length ? Math.min(...qualifying.map((item) => item.seconds)) : null;
      })(),
      coloringScore: average(colorEvidence), coloringEvidence: colorEvidence.length,
      puzzleScore, puzzleEvidence: student.puzzle.length + puzzleRubric.length,
      improvementStars,
      improvementEvidence: sortedActivityRecords.length >= 2 ? [sortedActivityRecords[0], sortedActivityRecords.at(-1)] : [],
      consistency: variance == null ? null : 1 - Math.sqrt(variance),
      overallScore: overallActivityCount >= 2 ? overallScore : null,
      overallEvidence: overallActivityCount,
    };
  });

  const highest = (field) => rows.filter((row) => row[field] != null).sort((a, b) => b[field] - a[field])[0] || null;
  const fastest = rows.filter((row) => row.fastestSeconds != null).sort((a, b) => a.fastestSeconds - b.fastestSeconds)[0] || null;
  const formatRankingValue = (key, value) => {
    if (value == null) return 'Not enough data';
    if (key === 'fastest') return `${Math.max(1, Math.round(value / 60))} min`;
    if (key === 'improved') return `${value > 0 ? '+' : ''}${formatStars(value)} stars`;
    return `${round(value * 100)}%`;
  };
  const rankingsFor = (key, field, evidenceField, { ascending = false } = {}) => {
    const qualifying = rows
      .filter((row) => row[field] != null)
      .sort((left, right) => {
        const difference = ascending ? left[field] - right[field] : right[field] - left[field];
        return difference || left.studentName.localeCompare(right.studentName);
      });
    const unavailable = rows
      .filter((row) => row[field] == null)
      .sort((left, right) => left.studentName.localeCompare(right.studentName));
    const evidenceCount = (row) => Array.isArray(row[evidenceField])
      ? row[evidenceField].length
      : Number(row[evidenceField]) || 0;
    return [
      ...qualifying.map((row, index) => ({
        rank: index + 1,
        student_id: row.studentId,
        student_name: row.studentName,
        student_email: row.studentEmail,
        value: formatRankingValue(key, row[field]),
        score: row[field],
        evidence: evidenceCount(row),
        qualified: true,
      })),
      ...unavailable.map((row) => ({
        rank: null,
        student_id: row.studentId,
        student_name: row.studentName,
        student_email: row.studentEmail,
        value: 'Not enough data',
        score: null,
        evidence: 0,
        qualified: false,
      })),
    ];
  };
  const card = (key, title, row, value, detail, evidence, rankings) => ({ key, title, student_id: row?.studentId || null, student_name: row?.studentName || '', value, detail, evidence, rankings });
  return [
    card('fastest', 'Fastest high-quality finish', fastest, fastest ? `${Math.max(1, Math.round(fastest.fastestSeconds / 60))} min` : null, 'Only teacher-rated or teacher-confirmed high-quality work qualifies.', fastest?.durations.length || 0, rankingsFor('fastest', 'fastestSeconds', 'durations', { ascending: true })),
    (() => { const row = highest('coloringScore'); return card('coloring', 'Strongest in coloring', row, row ? `${round(row.coloringScore * 100)}%` : null, 'Combines exact expected-color matches and confirmed color rubric results.', row?.coloringEvidence || 0, rankingsFor('coloring', 'coloringScore', 'coloringEvidence')); })(),
    (() => { const row = highest('puzzleScore'); return card('puzzle', 'Strongest in puzzle', row, row ? `${round(row.puzzleScore * 100)}%` : null, 'Combines connected pieces, completion speed, and confirmed puzzle rubric results.', row?.puzzleEvidence || 0, rankingsFor('puzzle', 'puzzleScore', 'puzzleEvidence')); })(),
    (() => { const row = highest('consistency'); return card('consistent', 'Most consistent', row, row ? `${round(row.consistency * 100)}%` : null, 'Based on variation across at least two teacher-confirmed results.', row?.scores.length || 0, rankingsFor('consistent', 'consistency', 'scores')); })(),
    (() => {
      const candidate = highest('improvementStars');
      const row = candidate?.improvementStars > 0 ? candidate : null;
      const result = card('improved', 'Most improved', row, row ? `+${formatStars(row.improvementStars)} stars` : null, 'Compares the earliest and latest separately reviewed activities.', row?.activityRecords.length || 0, rankingsFor('improved', 'improvementStars', 'activityRecords'));
      return row ? {
        ...result,
        evidenceItems: row.improvementEvidence.map((record, index) => ({
          label: index === 0 ? 'Earlier' : 'Recent',
          activity: record.activityTitle,
          stars: round(record.stars),
          date: record.at,
          source: record.source,
        })),
        calculation: `${formatStars(row.improvementEvidence[1].stars)} − ${formatStars(row.improvementEvidence[0].stars)} = +${formatStars(row.improvementStars)} stars`,
      } : result;
    })(),
    (() => { const row = highest('overallScore'); return card('overall', 'Overall performance', row, row ? `${round(row.overallScore * 100)}%` : null, 'Combines reviewed teacher ratings, coloring accuracy, and puzzle performance where available.', row?.overallEvidence || 0, rankingsFor('overall', 'overallScore', 'overallEvidence')); })(),
  ];
};
