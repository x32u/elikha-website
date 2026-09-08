import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Rubrics, { findSubjectMismatch } from './Rubrics';

const mockGetTeacherRubrics = jest.fn();
const mockGetTeacherActivities = jest.fn();
const mockCreateRubric = jest.fn();

jest.mock('../../components/Navbar', () => () => <nav>Navigation</nav>);
jest.mock('../../services/rubricApi', () => ({
  assignRubricToActivity: jest.fn(),
  createRubric: (...args) => mockCreateRubric(...args),
  deleteRubric: jest.fn(),
  getTeacherRubrics: (...args) => mockGetTeacherRubrics(...args),
}));
jest.mock('../../services/teacherApi', () => ({
  getTeacherActivities: (...args) => mockGetTeacherActivities(...args),
}));

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

describe('private-school rubric builder', () => {
  let container;
  let root;

  beforeEach(() => {
    mockGetTeacherRubrics.mockResolvedValue({ success: true, data: [] });
    mockGetTeacherActivities.mockResolvedValue({ success: true, data: [] });
    mockCreateRubric.mockResolvedValue({ success: true, data: { id: 'rubric-new' } });
    sessionStorage.setItem('userInfo', JSON.stringify({ id: 'teacher-1' }));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    global.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    sessionStorage.clear();
    jest.clearAllMocks();
    delete global.IS_REACT_ACT_ENVIRONMENT;
  });

  it('uses free-form criteria and full private-school rating labels', async () => {
    await act(async () => {
      root.render(<MemoryRouter><Rubrics /></MemoryRouter>);
    });

    expect(container.textContent).toContain('Private-school rubric');
    expect(container.textContent).toContain('Flexible Rubrics');
    expect(container.querySelectorAll('.criterion-input')).toHaveLength(1);
    expect(container.querySelector('.competency-select')).toBeNull();
    expect(container.querySelector('.excluded-details')).toBeNull();
    expect(container.textContent).not.toMatch(/DepEd|SF9|III\.1|IV\.G\.24/);

    const headers = Array.from(container.querySelectorAll('.rubric-level-table th'))
      .map((header) => header.textContent);
    expect(headers[1]).toContain('Beginning');
    expect(headers[2]).toContain('Developing');
    expect(headers[3]).toContain('Consistent');
  });

  it('preloads editable criteria for the selected activity type', async () => {
    await act(async () => {
      root.render(<MemoryRouter><Rubrics /></MemoryRouter>);
    });

    const activityType = container.querySelector('.rubric-top-fields select');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(activityType, 'puzzle');
      activityType.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const starterCriteria = Array.from(container.querySelectorAll('.criterion-input'));
    expect(starterCriteria).toHaveLength(3);
    expect(starterCriteria.map((field) => field.value)).toEqual([
      'Matches each puzzle piece to its correct location',
      'Positions and connects the puzzle pieces accurately',
      'Completes the puzzle with growing independence',
    ]);

    const addButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent.trim() === '+ Add criterion');
    await act(async () => {
      addButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelectorAll('.criterion-input')).toHaveLength(4);
    expect(container.querySelectorAll('.rubric-level-table tbody textarea')).toHaveLength(16);
  });

  it('saves only free-form text and the compatible three-level contract', async () => {
    await act(async () => {
      root.render(<MemoryRouter><Rubrics /></MemoryRouter>);
    });

    const setValue = (element, value) => {
      const prototype = element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    };

    await act(async () => {
      setValue(container.querySelector('input[placeholder="e.g. Cactus Coloring"]'), 'Creative Color Choices');
      setValue(container.querySelector('.criterion-input'), 'Uses the requested colors on each shape');
    });
    await act(async () => {
      container.querySelector('.simple-rubric-form form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(mockCreateRubric).toHaveBeenCalledTimes(1);
    const payload = mockCreateRubric.mock.calls[0][0];
    expect(payload.description).toBe('Teacher-created private-school activity rubric.');
    expect(payload.metadata).toMatchObject({ version: 2, assessmentStyle: 'private-school' });
    expect(payload.criteria).toHaveLength(1);
    expect(payload.criteria[0].name).toBe('Uses the requested colors on each shape');
    expect(payload.criteria[0]).not.toHaveProperty('competencyCode');
    expect(payload.criteria[0].levels.map((level) => level.code)).toEqual(['BG', 'DV', 'CO']);
  });
});
