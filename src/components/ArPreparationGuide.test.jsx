import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ArPreparationGuide from './ArPreparationGuide';

describe('ArPreparationGuide', () => {
  let container;
  let root;

  beforeEach(() => {
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

  it('explains the complete AR preparation flow in an accessible ordered list', async () => {
    await act(async () => {
      root.render(<ArPreparationGuide />);
    });

    const guide = container.querySelector('[data-testid="ar-preparation-guide"]');
    const steps = guide.querySelectorAll('ol > li');

    expect(guide.getAttribute('aria-labelledby')).toBeTruthy();
    expect(container.querySelector(`#${guide.getAttribute('aria-labelledby')}`).textContent)
      .toBe('Get ready before you start');
    expect(steps).toHaveLength(4);
    expect(guide.textContent).toContain('Open AR');
    expect(guide.textContent).toContain('Allow the camera');
    expect(guide.textContent).toContain('Check your space');
    expect(guide.textContent).toContain('Position your device');
    expect(guide.textContent).toContain('Camera blocked?');
  });

  it('supports the compact preflight layout', async () => {
    await act(async () => {
      root.render(<ArPreparationGuide compact />);
    });

    expect(container.querySelector('.ar-preparation-guide--compact')).not.toBeNull();
  });
});
