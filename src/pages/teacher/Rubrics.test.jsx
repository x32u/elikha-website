import { findSubjectMismatch } from './Rubrics';

// The teacher's real activity list from the live project.
const ACTIVITIES = [
  { id: 'a1', title: 'Loose Parts: Creative Robot Building' },
  { id: 'a2', title: 'Cactus' },
  { id: 'a3', title: 'puzzle' },
  { id: 'a4', title: 'mask' },
  { id: 'a5', title: 'Kabuki Mask' },
  { id: 'a6', title: 'Elephant' },
];

const robotRubric = {
  title: 'Creative Robot Building – AR Observation Rubric',
  criteria: [
    { name: 'Selects and uses loose parts to build the robot' },
    { name: 'Arranges parts into a recognizable robot' },
    { name: 'Connects or attaches the robot parts securely' },
    { name: 'Adds creative colors, decorations, or unique details' },
  ],
};

const activity = (id) => ACTIVITIES.find((item) => item.id === id);

describe('findSubjectMismatch', () => {
  test('flags the production case: a robot rubric attached to Cactus', () => {
    const warning = findSubjectMismatch(robotRubric, activity('a2'), ACTIVITIES);
    expect(warning).toContain('Robot Building');
    expect(warning).toContain('Cactus');
  });

  test('flags the same rubric on the puzzle and mask activities', () => {
    expect(findSubjectMismatch(robotRubric, activity('a3'), ACTIVITIES)).toContain('Robot Building');
    expect(findSubjectMismatch(robotRubric, activity('a4'), ACTIVITIES)).toContain('Robot Building');
  });

  test('stays quiet on the activity the rubric was written for', () => {
    expect(findSubjectMismatch(robotRubric, activity('a1'), ACTIVITIES)).toBe('');
  });

  test('does not treat ordinary craft words as a subject mismatch', () => {
    const neutral = {
      criteria: [
        { name: 'Uses small hand movements to place colour' },
        { name: 'Arranges the pieces in the intended layout' },
        { name: 'Adds colours that suit the activity' },
      ],
    };
    expect(findSubjectMismatch(neutral, activity('a2'), ACTIVITIES)).toBe('');
    expect(findSubjectMismatch(neutral, activity('a3'), ACTIVITIES)).toBe('');
  });

  test('flags a mask rubric pointed at the elephant activity', () => {
    const maskRubric = {
      criteria: [
        { name: 'Traces the Kabuki mask outline' },
        { name: 'Fills the mask with chosen colours' },
      ],
    };
    expect(findSubjectMismatch(maskRubric, activity('a6'), ACTIVITIES)).toContain('Mask');
  });

  test('allows a rubric whose own activity matches as well as any other', () => {
    const maskRubric = { criteria: [{ name: 'Fills the mask with chosen colours' }] };
    // "mask" is this activity's own subject, so no warning even though the
    // Kabuki Mask activity shares the word.
    expect(findSubjectMismatch(maskRubric, activity('a4'), ACTIVITIES)).toBe('');
  });

  test('is quiet with no other activities to compare against', () => {
    expect(findSubjectMismatch(robotRubric, activity('a2'), [])).toBe('');
    expect(findSubjectMismatch(robotRubric, activity('a2'))).toBe('');
  });

  test('handles missing rubric or activity data without throwing', () => {
    expect(findSubjectMismatch(null, activity('a2'), ACTIVITIES)).toBe('');
    expect(findSubjectMismatch(robotRubric, null, ACTIVITIES)).toBe('');
    expect(findSubjectMismatch({ criteria: [] }, activity('a2'), ACTIVITIES)).toBe('');
  });
});
