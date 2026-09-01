import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AdminUsers from './AdminUsers';

const mockFetchAllUsers = jest.fn();
const mockFetchClassDirectory = jest.fn();
const mockCreatePlatformUser = jest.fn();
const setInputValue = (input, value) => {
  const valueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;
  valueSetter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

jest.mock('./components/AdminShell', () => ({ children }) => <main>{children}</main>);
jest.mock('../../services/adminApi', () => ({
  createParentStudentLink: jest.fn(),
  createPlatformUser: (...args) => mockCreatePlatformUser(...args),
  deleteParentStudentLink: jest.fn(),
  fetchAllUsers: (...args) => mockFetchAllUsers(...args),
  fetchClassDirectory: (...args) => mockFetchClassDirectory(...args),
  fetchParentLinkDirectory: jest.fn(),
  fetchParentStudentLinks: jest.fn(),
  updatePlatformUser: jest.fn(),
}));

describe('Super Admin create-account password control', () => {
  let container;
  let root;

  beforeEach(() => {
    mockFetchAllUsers.mockResolvedValue({ success: true, data: [] });
    mockFetchClassDirectory.mockResolvedValue({ success: true, data: [] });
    mockCreatePlatformUser.mockResolvedValue({ success: false, error: 'Not configured.' });
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

  const openCreateAccountModal = async () => {
    const addButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent.trim() === '+ Add User'
    );

    await act(async () => {
      addButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  it('shows, hides, and resets the temporary password without submitting the form', async () => {
    await act(async () => {
      root.render(<AdminUsers role="SuperAdmin" />);
    });

    await openCreateAccountModal();

    const passwordInput = container.querySelector('#add-user-password');
    const showButton = container.querySelector('[aria-label="Show temporary password"]');
    expect(passwordInput.type).toBe('password');
    expect(showButton.type).toBe('button');
    expect(showButton.getAttribute('aria-pressed')).toBe('false');

    await act(async () => {
      setInputValue(passwordInput, 'TemporaryPassword123!');
      showButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const hideButton = container.querySelector('[aria-label="Hide temporary password"]');
    expect(passwordInput.type).toBe('text');
    expect(passwordInput.value).toBe('TemporaryPassword123!');
    expect(hideButton.getAttribute('aria-pressed')).toBe('true');

    await act(async () => {
      container.querySelector('.um-modal-x').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await openCreateAccountModal();

    const reopenedPasswordInput = container.querySelector('#add-user-password');
    expect(reopenedPasswordInput.type).toBe('password');
    expect(reopenedPasswordInput.value).toBe('');
  });

  it('shows a clear success notice when an existing Auth account profile is restored', async () => {
    mockCreatePlatformUser.mockResolvedValue({
      success: true,
      creationStatus: 'recovered',
      message: 'Existing sign-in account found. Its missing E-Likha profile was restored. The temporary password was not changed.',
      data: {
        id: '275266ae-37ce-4c10-8798-cfe47e737180',
        name: 'jc',
        email: 'jcxxme@gmail.com',
        role: 'student',
        role_label: 'Student',
        status: 'Active',
        status_label: 'Active',
      },
      warning: '',
    });

    await act(async () => {
      root.render(<AdminUsers role="SuperAdmin" />);
    });
    await openCreateAccountModal();

    const inputs = container.querySelectorAll('.um-modal-body input:not([type="file"])');
    await act(async () => {
      setInputValue(inputs[0], 'jc');
      setInputValue(inputs[1], 'jcxxme@gmail.com');
      setInputValue(container.querySelector('#add-user-password'), 'TemporaryPassword123!');
    });

    const createButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent.trim() === 'Create User'
    );
    await act(async () => {
      createButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockCreatePlatformUser).toHaveBeenCalledWith({
      name: 'jc',
      email: 'jcxxme@gmail.com',
      password: 'TemporaryPassword123!',
      role: 'student',
      classId: '',
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('[role="status"]').textContent).toContain(
      'missing E-Likha profile was restored'
    );
    expect(container.textContent).toContain('jcxxme@gmail.com');
  });
});
