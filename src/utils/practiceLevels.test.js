import { DEFAULT_PRACTICE_LEVEL_ID, getPracticeLevel, PRACTICE_LEVELS } from './practiceLevels';

describe('practice difficulty levels', () => {
  test('provides the requested easy, medium, and advanced progression', () => {
    expect(PRACTICE_LEVELS.map((level) => level.id)).toEqual(['easy', 'medium', 'advanced']);
    expect(getPracticeLevel('easy')).toMatchObject({ puzzlePieces: 0, allowedTools: ['paint', 'bucket', 'eraser'] });
    expect(getPracticeLevel('medium')).toMatchObject({ puzzlePieces: 3, allowedTools: ['move'] });
    expect(getPracticeLevel('advanced')).toMatchObject({ puzzlePieces: 4, allowedTools: ['move', 'paint', 'bucket', 'eraser'] });
  });

  test('falls back safely to easy mode', () => {
    expect(getPracticeLevel('unknown').id).toBe(DEFAULT_PRACTICE_LEVEL_ID);
  });
});
