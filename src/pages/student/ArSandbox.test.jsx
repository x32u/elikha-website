import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ArSandbox from './ArSandbox';

const mockSaveUserSettings = jest.fn();
const mockUseUserSettings = jest.fn();

jest.mock('../../components/Navbar', () => () => <nav>Navigation</nav>);
jest.mock('../ar/ARApp', () => () => <div>AR session</div>);
jest.mock('../../hooks/useUserSettings', () => ({
  useUserSettings: () => mockUseUserSettings(),
}));
jest.mock('../../services/userSettingsApi', () => ({
  saveUserSettings: (...args) => mockSaveUserSettings(...args),
}));

describe('AR Sandbox voice guide preference', () => {
  let container;
  let root;

  beforeEach(() => {
    mockSaveUserSettings.mockReset();
    mockUseUserSettings.mockReturnValue({
      userId: 'student-7',
      settings: {
        backgroundMusic: false,
        soundEffects: true,
        voiceInstructions: true,
        notifications: true,
        dataSaver: false,
        quality: 'auto',
      },
    });
    window.matchMedia = jest.fn().mockReturnValue({ matches: false });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    global.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete global.IS_REACT_ACT_ENVIRONMENT;
  });

  it('shows the current state and saves an opt-out for the signed-in student', async () => {
    await act(async () => {
      root.render(<ArSandbox />);
    });

    const toggle = container.querySelector('[aria-label="Turn Sandbox voice guide off"]');
    expect(toggle).not.toBeNull();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.textContent).toContain('Voice On');

    await act(async () => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockSaveUserSettings).toHaveBeenCalledWith(
      'student-7',
      expect.objectContaining({
        backgroundMusic: false,
        voiceInstructions: false,
      })
    );
  });

  it('shows an existing opt-out and allows voice guidance to be enabled again', async () => {
    mockUseUserSettings.mockReturnValue({
      userId: 'student-7',
      settings: {
        voiceInstructions: false,
        quality: 'auto',
      },
    });

    await act(async () => {
      root.render(<ArSandbox />);
    });

    const toggle = container.querySelector('[aria-label="Turn Sandbox voice guide on"]');
    expect(toggle).not.toBeNull();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.textContent).toContain('Voice Off');

    await act(async () => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockSaveUserSettings).toHaveBeenCalledWith(
      'student-7',
      expect.objectContaining({ voiceInstructions: true })
    );
  });
});
