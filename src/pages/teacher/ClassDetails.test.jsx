import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ClassDetails from './ClassDetails';

const mockGetClassById = jest.fn();
const mockGetClassStudents = jest.fn();
const mockGetClassActivities = jest.fn();
const mockGetActivityRubricOptions = jest.fn();
const mockGetActivityRubricManagementState = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  useParams: () => ({ classId: 'class-1' }),
}));
jest.mock('../../components/Navbar', () => () => <nav>Navigation</nav>);
jest.mock('../../services/teacherApi', () => ({
  getClassById: (...args) => mockGetClassById(...args),
  getClassStudents: (...args) => mockGetClassStudents(...args),
  getClassActivities: (...args) => mockGetClassActivities(...args),
  createActivity: jest.fn(),
  updateActivity: jest.fn(),
  enrollStudentToClassByEmail: jest.fn(),
  removeStudentFromClass: jest.fn(),
}));
jest.mock('../../services/rubricApi', () => ({
  getActivityRubricOptions: (...args) => mockGetActivityRubricOptions(...args),
  getActivityRubricManagementState: (...args) => mockGetActivityRubricManagementState(...args),
}));

describe('Class activity rubric selector', () => {
  let container;
  let root;

  beforeEach(() => {
    sessionStorage.setItem('userInfo', JSON.stringify({ id: 'teacher-1', role: 'teacher' }));
    mockGetClassById.mockResolvedValue({
      success: true,
      data: { id: 'class-1', name: 'Diamond', grade: 'Grade 6', section: 'A' },
    });
    mockGetClassStudents.mockResolvedValue({ success: true, data: [] });
    mockGetClassActivities.mockResolvedValue({
      success: true,
      data: [{
        id: 'activity-1',
        title: 'Color the bird',
        description: 'Paint the bird',
        due_date: '2026-08-29',
        image_url: '',
      }],
    });
    mockGetActivityRubricOptions.mockResolvedValue({
      success: true,
      data: [{ id: 'rubric-1', title: 'Bird coloring rubric' }],
    });
    mockGetActivityRubricManagementState.mockResolvedValue({
      success: true,
      data: {
        rubricId: 'rubric-1',
        rubricTitle: 'Bird coloring rubric',
        rubricVersion: '1',
        changeLocked: true,
        lockReason: 'This rubric is locked because student work depends on it.',
        hasSubmissions: true,
      },
    });

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

  test('offers saved rubrics while adding and restores the locked choice while editing', async () => {
    await act(async () => {
      root.render(<ClassDetails />);
    });

    const addButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent.trim() === '+ Add Activity'
    );
    await act(async () => {
      addButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const createSelect = container.querySelector('.activities-section > .activity-form .activity-rubric-field select');
    expect(createSelect).not.toBeNull();
    expect(Array.from(createSelect.options).map((option) => option.textContent)).toContain('Bird coloring rubric');

    await act(async () => {
      addButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const expandButton = container.querySelector('[aria-label="Expand activity"]');
    await act(async () => {
      expandButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const editButton = container.querySelector('.activity-edit-button');
    expect(editButton).not.toBeNull();
    await act(async () => {
      editButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const editSelect = container.querySelector('.activity-edit-form .activity-rubric-field select');
    expect(mockGetActivityRubricManagementState).toHaveBeenCalledWith('activity-1');
    expect(editSelect.value).toBe('rubric-1');
    expect(editSelect.disabled).toBe(true);
    expect(container.textContent).toContain('This rubric is locked because student work depends on it.');
  });
});
