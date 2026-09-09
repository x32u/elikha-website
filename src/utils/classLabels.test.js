import { formatClassLabel, formatGradeLabel } from './classLabels';

describe('class labels', () => {
  it('adds Grade only to numeric legacy values', () => {
    expect(formatGradeLabel('6')).toBe('Grade 6');
    expect(formatGradeLabel('Grade 6')).toBe('Grade 6');
  });

  it('preserves named and future grade levels exactly as entered', () => {
    expect(formatGradeLabel('Kindergarten')).toBe('Kindergarten');
    expect(formatGradeLabel('Nursery')).toBe('Nursery');
    expect(formatGradeLabel('Senior High')).toBe('Senior High');
    expect(formatClassLabel({ grade: 'Kindergarten', section: 'Sunflower' }))
      .toBe('Kindergarten - Sunflower');
  });
});
