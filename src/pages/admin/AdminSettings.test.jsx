import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AdminSettings from './AdminSettings';

jest.mock('./components/AdminShell', () => ({ children }) => <main>{children}</main>);
jest.mock('../../services/adminApi', () => ({
  updatePlatformUser: jest.fn(),
}));
jest.mock('../../services/userSettingsApi', () => ({
  getUserSettings: () => Promise.resolve({ success: true, data: null }),
  saveUserSettings: jest.fn(),
}));
jest.mock('../../services/avatarApi', () => ({
  AVATAR_ACCEPT_ATTR: 'image/*',
  removeUserAvatar: jest.fn(),
  resolveAvatarUrl: () => Promise.resolve(''),
  uploadUserAvatar: jest.fn(),
  validateAvatarFile: jest.fn(),
}));
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { avatar_url: '' }, error: null }),
        }),
      }),
    }),
  },
}));

describe.each(['Admin', 'SuperAdmin'])('%s settings', (role) => {
  it('does not show a self-service password change form', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    global.IS_REACT_ACT_ENVIRONMENT = true;

    sessionStorage.setItem('userInfo', JSON.stringify({
      id: 'user-id',
      name: 'Account Owner',
      email: 'owner@example.com',
    }));

    await act(async () => {
      root.render(<AdminSettings role={role} />);
    });

    expect(container.textContent).not.toContain('Current Password');
    expect(container.textContent).not.toContain('New Password');
    expect(container.textContent).not.toContain('Confirm New Password');
    expect(container.textContent).not.toContain('Change Password');
    expect(container.querySelector('input[type="password"]')).toBeNull();

    act(() => root.unmount());
    container.remove();
    sessionStorage.clear();
    delete global.IS_REACT_ACT_ENVIRONMENT;
  });
});
