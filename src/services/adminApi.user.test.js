import { createPlatformUser } from './adminApi';

const mockInvoke = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args) => mockInvoke(...args),
    },
  },
}));

describe('secure platform account provisioning', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  test('uses the protected Edge Function and maps an orphan-profile recovery', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        success: true,
        status: 'recovered',
        message: 'The existing sign-in account was restored to User Management. Its password was not changed.',
        user: {
          id: '275266ae-37ce-4c10-8798-cfe47e737180',
          name: 'jcxxme',
          email: 'jcxxme@gmail.com',
          role: 'student',
        },
      },
      error: null,
    });

    const result = await createPlatformUser({
      name: 'jc',
      email: 'JCXXME@gmail.com',
      password: 'TemporaryPassword123!',
      role: 'student',
    });

    expect(mockInvoke).toHaveBeenCalledWith('manage-platform-user', {
      body: {
        name: 'jc',
        email: 'jcxxme@gmail.com',
        password: 'TemporaryPassword123!',
        role: 'student',
      },
    });
    expect(result).toEqual(expect.objectContaining({
      success: true,
      creationStatus: 'recovered',
      message: expect.stringContaining('password was not changed'),
      data: expect.objectContaining({
        id: '275266ae-37ce-4c10-8798-cfe47e737180',
        email: 'jcxxme@gmail.com',
        role: 'student',
        role_label: 'Student',
        status_label: 'Active',
      }),
    }));
  });

  test('shows the safe server message for an existing complete account', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          json: jest.fn().mockResolvedValue({
            message: 'This email already belongs to an E-Likha account.',
          }),
        },
      },
    });

    const result = await createPlatformUser({
      name: 'Existing',
      email: 'existing@example.com',
      password: 'TemporaryPassword123!',
      role: 'student',
    });

    expect(result).toEqual({
      success: false,
      error: 'This email already belongs to an E-Likha account.',
    });
  });
});
