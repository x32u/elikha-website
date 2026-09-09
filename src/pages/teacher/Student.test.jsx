import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Student from './Student';

const mockGetTeacherStudents = jest.fn();
const mockResolveUserAvatarUrl = jest.fn();

jest.mock('../../components/Navbar', () => () => <nav>Navigation</nav>);
jest.mock('../../services/teacherApi', () => ({
  getTeacherStudents: (...args) => mockGetTeacherStudents(...args),
  getStudentSubmissions: jest.fn(),
  getStudentArtworks: jest.fn(),
}));
jest.mock('../../services/avatarApi', () => ({
  resolveUserAvatarUrl: (...args) => mockResolveUserAvatarUrl(...args),
}));

describe('teacher student cards', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    global.IS_REACT_ACT_ENVIRONMENT = true;
    sessionStorage.setItem('userInfo', JSON.stringify({ id: 'teacher-1' }));
    mockGetTeacherStudents.mockResolvedValue({
      success: true,
      data: [{
        id: 'student-1',
        name: 'Nicos Raphael Nicolas',
        avatar_url: 'student-1/avatar.webp',
        classes: [{ id: 'class-1', name: 'Diamonds', grade: 'Grade 6' }],
        submittedCount: 1,
        pendingCount: 0,
        lateCount: 0,
      }],
    });
    mockResolveUserAvatarUrl.mockResolvedValue('https://signed.example/avatar.webp');
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    sessionStorage.clear();
    jest.clearAllMocks();
    delete global.IS_REACT_ACT_ENVIRONMENT;
  });

  test('resolves and displays a private student profile picture', async () => {
    await act(async () => {
      root.render(<Student />);
    });

    const avatar = container.querySelector('.student-card-avatar-image');
    expect(mockResolveUserAvatarUrl).toHaveBeenCalledWith('student-1', 'student-1/avatar.webp');
    expect(avatar).not.toBeNull();
    expect(avatar.getAttribute('src')).toBe('https://signed.example/avatar.webp');
    expect(avatar.getAttribute('alt')).toBe('Nicos Raphael Nicolas profile');
  });
});
