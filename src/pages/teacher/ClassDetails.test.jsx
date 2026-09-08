import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ClassDetails from './ClassDetails';

const mockGetClassById = jest.fn();
const mockGetClassStudents = jest.fn();
const mockGetClassActivities = jest.fn();
const mockUpdateClass = jest.fn();
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
  updateClass: (...args) => mockUpdateClass(...args),
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
    mockUpdateClass.mockResolvedValue({
      success: true,
      data: { id: 'class-1', name: 'Emerald', grade: 'Grade 6', section: 'A' },
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

    const createSelect = container.querySelector('.create-activity-modal #activity-rubric');
    expect(createSelect).not.toBeNull();
    expect(Array.from(createSelect.options).map((option) => option.textContent)).toContain('Bird coloring rubric');
    expect(container.querySelector('#activity-class')).toBeNull();
    expect(container.textContent).not.toContain('Required Materials');

    await act(async () => {
      container.querySelector('.create-activity-modal__close').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const viewButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent.trim() === 'View activity'
    );
    expect(viewButton).toBeDefined();
    await act(async () => {
      viewButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(document.querySelector('.activity-view-modal')).not.toBeNull();
    expect(document.querySelector('.activity-view-modal').textContent).toContain('Color the bird');
    expect(document.querySelector('.activity-view-modal').textContent).toContain('Paint the bird');
    await act(async () => {
      document.querySelector('[aria-label="Close activity overview"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const editButton = container.querySelector('.activity-action .btn-edit');
    expect(editButton).not.toBeNull();
    await act(async () => {
      editButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const editSelect = document.querySelector('.activity-edit-form .activity-rubric-field select');
    expect(mockGetActivityRubricManagementState).toHaveBeenCalledWith('activity-1');
    expect(document.querySelector('[role="dialog"][aria-modal="true"]')).not.toBeNull();
    expect(document.querySelector('.activity-edit-modal-backdrop')).not.toBeNull();
    expect(editSelect.value).toBe('rubric-1');
    expect(editSelect.disabled).toBe(true);
    expect(document.body.textContent).toContain('This rubric is locked because student work depends on it.');
  });

  test('lets the teacher rename the class without recreating it', async () => {
    await act(async () => {
      root.render(<ClassDetails />);
    });

    const editButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent.trim() === 'Edit class name'
    );
    expect(editButton).toBeDefined();

    await act(async () => {
      editButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const nameInput = container.querySelector('#edit-class-name');
    expect(nameInput.value).toBe('Diamond');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(nameInput, 'Emerald');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      container.querySelector('.edit-class-modal').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(mockUpdateClass).toHaveBeenCalledWith('class-1', { name: 'Emerald' });
    expect(container.querySelector('.edit-class-modal')).toBeNull();
  });
});
