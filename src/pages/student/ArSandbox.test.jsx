import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ArSandbox from './ArSandbox';

const mockSaveUserSettings = jest.fn();
const mockUseUserSettings = jest.fn();

jest.mock('../../components/Navbar', () => () => <nav>Navigation</nav>);
jest.mock('../ar/ARApp', () => ({ mobileMode, sandboxDifficulty, onExit }) => (
  <div
    data-mobile-mode={String(mobileMode)}
    data-sandbox-difficulty={sandboxDifficulty}
  >
    AR session
    <button type="button" data-testid="exit-ar" onClick={() => onExit?.('exit')}>
      Exit AR
    </button>
  </div>
));
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
    window.history.replaceState({}, '', '/');
    delete window.ElikhaMobile;
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

  it('keeps the compact mobile AR layout on a wide landscape phone', async () => {
    window.matchMedia = jest.fn((query) => ({
      matches: query === '(pointer: coarse)',
    }));

    await act(async () => {
      root.render(<ArSandbox />);
    });

    const start = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Start Easy Practice')
    );

    await act(async () => {
      start.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[data-mobile-mode="true"]')).not.toBeNull();
  });

  it('enters the immersive sandbox directly from the native mobile launch', async () => {
    window.history.replaceState(
      {},
      '',
      '/sandbox?mobile=1&autostart=1&difficulty=advanced'
    );

    await act(async () => {
      root.render(<ArSandbox />);
    });

    const session = container.querySelector('[data-mobile-mode="true"]');
    expect(session).not.toBeNull();
    expect(session.getAttribute('data-sandbox-difficulty')).toBe('advanced');
    expect(container.querySelector('.sandbox-setup')).toBeNull();
  });

  it('returns an immersive mobile sandbox to the native app on exit', async () => {
    window.history.replaceState({}, '', '/sandbox?mobile=1&autostart=1&difficulty=easy');
    window.ElikhaMobile = { postMessage: jest.fn() };

    await act(async () => {
      root.render(<ArSandbox />);
    });
    await act(async () => {
      container.querySelector('[data-testid="exit-ar"]').dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      );
    });

    expect(window.ElikhaMobile.postMessage).toHaveBeenCalledWith(
      JSON.stringify({ type: 'exit', source: 'sandbox' })
    );
    expect(container.querySelector('.sandbox-setup')).toBeNull();
  });
});
