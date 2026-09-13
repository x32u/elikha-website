import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ClassDetails from './ClassDetails';

const mockGetClassById = jest.fn();
const mockGetClassStudents = jest.fn();
const mockGetClassActivities = jest.fn();
const mockUpdateClass = jest.fn();
const mockGetActivityRubricOptions = jest.fn();
const mockGetActivityRubricManagementState = jest.fn();
const mockResolveUserAvatarUrl = jest.fn();

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
jest.mock('../../services/avatarApi', () => ({
  resolveUserAvatarUrl: (...args) => mockResolveUserAvatarUrl(...args),
}));

describe('Class activity rubric selector', () => {
  let container;
  let root;

  beforeEach(() => {
    sessionStorage.setItem('userInfo', JSON.stringify({ id: 'teacher-1', role: 'teacher' }));
    mockGetClassById.mockResolvedValue({
      success: true,
      data: { id: 'class-1', name: 'Grade 6 - A', grade: 'Grade 6', section: 'A', subject: 'Arts' },
    });
    mockGetClassStudents.mockResolvedValue({ success: true, data: [] });
    mockResolveUserAvatarUrl.mockResolvedValue('');
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
      data: { id: 'class-1', name: 'Kindergarten 2 - A', grade: 'Kindergarten 2', section: 'A', subject: 'Arts' },
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

  test('lets the teacher edit the grade level without recreating the class', async () => {
    await act(async () => {
      root.render(<ClassDetails />);
    });

    const editButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent.trim() === 'Edit class'
    );
    expect(editButton).toBeDefined();

    await act(async () => {
      editButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const gradeInput = container.querySelector('#edit-class-grade');
    expect(gradeInput.value).toBe('Grade 6');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(gradeInput, 'Kindergarten 2');
      gradeInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      container.querySelector('.edit-class-modal').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(mockUpdateClass).toHaveBeenCalledWith('class-1', {
      name: 'Kindergarten 2 - A',
      grade: 'Kindergarten 2',
      section: 'A',
      subject: 'Arts',
    });
    expect(container.querySelector('.edit-class-modal')).toBeNull();
  });

  test('renders a student profile picture inside the class roster', async () => {
    mockGetClassStudents.mockResolvedValue({
      success: true,
      data: [{
        id: 'student-1',
        name: 'Sophia Lei Torrefiel',
        email: 'sophia@example.com',
        avatar_url: 'r2-media/avatars/student-1',
      }],
    });
    mockResolveUserAvatarUrl.mockResolvedValue('blob:sophia-avatar');

    await act(async () => {
      root.render(<ClassDetails />);
    });

    expect(mockResolveUserAvatarUrl).toHaveBeenCalledWith(
      'student-1',
      'r2-media/avatars/student-1'
    );
    const avatar = container.querySelector('.student-avatar img');
    expect(avatar).not.toBeNull();
    expect(avatar.getAttribute('src')).toBe('blob:sophia-avatar');
    expect(avatar.getAttribute('alt')).toBe('Sophia Lei Torrefiel profile');
  });
});
