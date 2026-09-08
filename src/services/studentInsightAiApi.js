import { supabase } from '../lib/supabase';

const clean = (value, max = 500) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);

export const buildInsightExplanationFallback = (insight = {}) => {
  if (!insight.student_id) {
    return `There is not enough verified evidence yet to explain a ${clean(insight.title, 80).toLowerCase()} leader.`;
  }
  const rankings = Array.isArray(insight.rankings) ? insight.rankings : [];
  const runnerUp = rankings.find((item) => item.qualified && item.student_id !== insight.student_id);
  const evidence = Math.max(0, Number(insight.evidence) || 0);
  const evidenceText = `${evidence} qualifying evidence record${evidence === 1 ? '' : 's'}`;
  const comparison = runnerUp
    ? ` The next ranked learner is ${clean(runnerUp.student_name, 100)} at ${clean(runnerUp.value, 50)}.`
    : ' No other learner currently has enough comparable evidence to place above this result.';
  return `${clean(insight.student_name, 100)} leads this category with ${clean(insight.value, 50)}, calculated from ${evidenceText}.${comparison}`;
};

export const buildInsightExplanationPayload = (insights = []) => insights
  .filter((insight) => insight?.student_id)
  .slice(0, 6)
  .map((insight) => {
    const rankings = Array.isArray(insight.rankings) ? insight.rankings : [];
    const runnerUp = rankings.find((item) => item.qualified && item.student_id !== insight.student_id);
    return {
      key: clean(insight.key, 40),
      title: clean(insight.title, 100),
      winner: clean(insight.student_name, 120),
      result: clean(insight.value, 60),
      evidenceCount: Math.max(0, Number(insight.evidence) || 0),
      deterministicMethod: clean(insight.detail, 300),
      runnerUp: runnerUp ? {
        name: clean(runnerUp.student_name, 120),
        result: clean(runnerUp.value, 60),
        evidenceCount: Math.max(0, Number(runnerUp.evidence) || 0),
      } : null,
      evidenceItems: (Array.isArray(insight.evidenceItems) ? insight.evidenceItems : [])
        .slice(0, 4)
        .map((item) => ({
          label: clean(item.label, 30),
          activity: clean(item.activity, 160),
          stars: Number(item.stars),
          date: clean(item.date, 60),
          source: clean(item.source, 80),
        })),
      calculation: clean(insight.calculation, 200),
    };
  });

export const addFallbackInsightExplanations = (insights = []) => insights.map((insight) => ({
  ...insight,
  ai_explanation: buildInsightExplanationFallback(insight),
  explanation_source: 'evidence',
}));

export const fetchStudentInsightExplanations = async (insights = []) => {
  const fallback = addFallbackInsightExplanations(insights);
  const payload = buildInsightExplanationPayload(insights);
  if (payload.length === 0) return fallback;
  try {
    const { data, error } = await supabase.functions.invoke('explain-student-insights', {
      body: { insights: payload },
    });
    if (error) throw error;
    const explanations = new Map(
      (Array.isArray(data?.explanations) ? data.explanations : [])
        .map((item) => [clean(item?.key, 40), clean(item?.explanation, 600)])
        .filter(([key, explanation]) => key && explanation)
    );
    return fallback.map((insight) => explanations.has(insight.key) ? {
      ...insight,
      ai_explanation: explanations.get(insight.key),
      explanation_source: 'ai',
    } : insight);
  } catch {
    return fallback;
  }
};
