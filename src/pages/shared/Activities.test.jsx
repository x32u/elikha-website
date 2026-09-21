import {
  assignmentPointLabel,
  getAssignmentDateLabel,
  getAssignmentStatus,
  getAssignmentVisual,
  getNextAssignmentFilter,
  sortAssignmentsForFilter,
} from './Activities';

describe('student assignment list grouping', () => {
  const now = new Date(2026, 8, 21, 10, 0, 0);

  test('groups assigned work into readable calendar sections', () => {
    expect(getAssignmentDateLabel({ due_date: '2026-09-21' }, 'upcoming', now)).toBe('Due today');
    expect(getAssignmentDateLabel({ due_date: '2026-09-22' }, 'upcoming', now)).toBe('Due tomorrow');
    expect(getAssignmentDateLabel({ due_date: '2026-09-20' }, 'past-due', now)).toBe('Due yesterday');
    expect(getAssignmentDateLabel({ due_date: 0 }, 'upcoming', now)).toBe('No due date');
  });

  test('uses submission state for the completion indicator', () => {
    expect(getAssignmentStatus({ status: 'assigned' })).toBe('upcoming');
    expect(getAssignmentStatus({ status: 'overdue' })).toBe('past-due');
    expect(getAssignmentStatus({ status: 'submitted' })).toBe('completed');
    expect(getAssignmentStatus({ status: 'reviewed' })).toBe('completed');
  });

  test('orders upcoming work forward and completed work most-recent first', () => {
    const items = [
      { id: 'later', title: 'Later', due_date: '2026-09-29', submitted_at: '2026-09-20' },
      { id: 'earlier', title: 'Earlier', due_date: '2026-09-22', submitted_at: '2026-09-21' },
    ];
    expect(sortAssignmentsForFilter(items, 'upcoming').map((item) => item.id)).toEqual(['earlier', 'later']);
    expect(sortAssignmentsForFilter(items, 'completed').map((item) => item.id)).toEqual(['earlier', 'later']);
  });

  test('uses the persisted assignment point value', () => {
    expect(assignmentPointLabel({ max_points: 20 }, false)).toBe('20 points');
    expect(assignmentPointLabel({ max_points: 1 }, false)).toBe('1 point');
    expect(assignmentPointLabel({ max_points: 20, score: 4 }, true)).toBe('4/5 rating · 20 points');
  });

  test('uses a class initial, then teacher thumbnail, then submitted artwork', () => {
    expect(getAssignmentVisual({ class_name: 'Kindergarten 3 - Green' }, false)).toEqual({
      type: 'initial',
      text: 'K',
    });
    expect(getAssignmentVisual({ activity_thumbnail_url: 'https://example.com/activity.png' }, false)).toEqual({
      type: 'thumbnail',
      src: 'https://example.com/activity.png',
    });
    expect(getAssignmentVisual({
      activity_thumbnail_url: 'https://example.com/activity.png',
      artwork_url: 'https://example.com/finished.png',
    }, true)).toEqual({
      type: 'artwork',
      src: 'https://example.com/finished.png',
    });
  });

  test('supports arrow, Home, and End navigation for status tabs', () => {
    expect(getNextAssignmentFilter(0, 'ArrowRight')).toBe('past-due');
    expect(getNextAssignmentFilter(0, 'ArrowLeft')).toBe('completed');
    expect(getNextAssignmentFilter(1, 'Home')).toBe('upcoming');
    expect(getNextAssignmentFilter(1, 'End')).toBe('completed');
    expect(getNextAssignmentFilter(1, 'Enter')).toBeNull();
  });
});
