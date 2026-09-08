import {
  buildInsightExplanationFallback,
  buildInsightExplanationPayload,
} from './studentInsightAiApi';

jest.mock('../lib/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

describe('student insight explanations', () => {
  const insight = {
    key: 'coloring',
    title: 'Strongest in coloring',
    student_id: 's1',
    student_name: 'Nicos Raphael Nicolas',
    value: '92%',
    evidence: 3,
    detail: 'Combines exact color matches and confirmed rubric results.',
    rankings: [
      { student_id: 's1', student_name: 'Nicos Raphael Nicolas', value: '92%', evidence: 3, qualified: true },
      { student_id: 's2', student_name: 'Sophia', value: '80%', evidence: 2, qualified: true },
    ],
  };

  it('builds a specific evidence explanation instead of generic metric copy', () => {
    expect(buildInsightExplanationFallback(insight)).toBe(
      'Nicos Raphael Nicolas leads this category with 92%, calculated from 3 qualifying evidence records. The next ranked learner is Sophia at 80%.'
    );
  });

  it('sends only bounded winner and comparison facts to the AI endpoint', () => {
    expect(buildInsightExplanationPayload([insight])).toEqual([
      expect.objectContaining({
        key: 'coloring',
        winner: 'Nicos Raphael Nicolas',
        result: '92%',
        evidenceCount: 3,
        runnerUp: { name: 'Sophia', result: '80%', evidenceCount: 2 },
      }),
    ]);
  });
});
