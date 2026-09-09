import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AdminClasses from './AdminClasses';

const mockCreateAdminClassSection = jest.fn();
const mockFetchAdminClassSections = jest.fn();
const mockFetchAdminTeachers = jest.fn();

jest.mock('./components/AdminShell', () => ({ children }) => <main>{children}</main>);
jest.mock('../../services/adminApi', () => ({
  createAdminClassSection: (...args) => mockCreateAdminClassSection(...args),
  deleteAdminClassSection: jest.fn(),
  fetchAdminClassSections: (...args) => mockFetchAdminClassSections(...args),
  fetchAdminClassStudents: jest.fn().mockResolvedValue({ success: true, data: [] }),
  fetchAdminTeachers: (...args) => mockFetchAdminTeachers(...args),
  removeAdminStudentFromClass: jest.fn(),
  restoreAdminClassSection: jest.fn(),
  updateAdminClassSection: jest.fn(),
}));

const setInputValue = (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('Admin class grade and color controls', () => {
  let container;
  let root;

  beforeEach(() => {
    mockFetchAdminClassSections.mockResolvedValue({
      success: true,
      data: [{
        id: 'class-1',
        name: 'Nursery - Sunflower',
        grade: 'Nursery',
        section: 'Sunflower',
        subject: 'Arts',
        color: '#138A45',
        teacher_id: 'teacher-1',
      }],
    });
    mockFetchAdminTeachers.mockResolvedValue({
      success: true,
      data: [{ id: 'teacher-1', name: 'Teacher One', email: 'teacher@example.com' }],
    });
    mockCreateAdminClassSection.mockResolvedValue({ success: true, data: { id: 'class-2' } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    global.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete global.IS_REACT_ACT_ENVIRONMENT;
    jest.clearAllMocks();
  });

  const openCreate = async () => {
    await act(async () => root.render(<AdminClasses />));
    const createButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent.trim() === '+ Create Class');
    await act(async () => createButton.click());
  };

  it('suggests existing database grades while allowing free text', async () => {
    await openCreate();

    const gradeInput = container.querySelector('input[list="admin-grade-suggestions"]');
    const suggestions = [...container.querySelectorAll('#admin-grade-suggestions option')]
      .map((option) => option.value);

    expect(gradeInput).not.toBeNull();
    expect(gradeInput.classList.contains('ac-grade-input')).toBe(true);
    expect(suggestions).toEqual(expect.arrayContaining([
      'Kindergarten',
      'Grade 4',
      'Grade 5',
      'Grade 6',
      'Nursery',
    ]));

    await act(async () => setInputValue(gradeInput, 'Grade 11 - TVL'));
    expect(gradeInput.value).toBe('Grade 11 - TVL');
  });

  it('shows one class label and a compact status badge in the table', async () => {
    await act(async () => root.render(<AdminClasses />));

    const classRow = container.querySelector('tbody tr');
    const labelOccurrences = classRow.textContent.match(/Nursery - Sunflower/g) || [];
    const status = classRow.querySelector('.ac-status.active');

    expect(labelOccurrences).toHaveLength(1);
    expect(status).not.toBeNull();
    expect(status.textContent.trim()).toBe('Active');
  });

  it('saves a custom grade and color as normalized text values', async () => {
    await openCreate();

    const gradeInput = container.querySelector('input[list="admin-grade-suggestions"]');
    const sectionInput = container.querySelector('input[placeholder="Ruby, Emerald, Section A"]');
    const subjectInput = container.querySelector('input[placeholder="MAPEH, Arts, Filipino"]');
    const colorInput = container.querySelector('[aria-label="Class color hex value"]');

    await act(async () => {
      setInputValue(gradeInput, 'Grade 11 - TVL');
      setInputValue(sectionInput, 'Innovation');
      setInputValue(subjectInput, 'Digital Arts');
      setInputValue(colorInput, '#12abef');
    });

    const saveButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent.trim() === 'Create Class');
    await act(async () => saveButton.click());

    expect(mockCreateAdminClassSection).toHaveBeenCalledWith({
      grade: 'Grade 11 - TVL',
      section: 'Innovation',
      subject: 'Digital Arts',
      teacherId: 'teacher-1',
      color: '#12ABEF',
    });
  });
});
