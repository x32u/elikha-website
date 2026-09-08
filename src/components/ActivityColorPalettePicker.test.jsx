import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ActivityColorPalettePicker from './ActivityColorPalettePicker';

describe('ActivityColorPalettePicker', () => {
  let container; let root;
  beforeEach(() => {
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container); global.IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); delete global.IS_REACT_ACT_ENVIRONMENT; });

  it('shows saved colors in activity order and removes them accessibly', async () => {
    const onChange = jest.fn();
    await act(async () => root.render(<ActivityColorPalettePicker value={[
      { hex: '#123456', name: 'Ocean' }, { hex: '#ABCDEF', name: 'Sky' },
    ]} onChange={onChange} />));
    expect([...container.querySelectorAll('.activity-palette__swatch')].map((item) => item.title)).toEqual(['ocean', 'sky']);
    await act(async () => container.querySelector('[aria-label="Remove ocean"]').click());
    expect(onChange).toHaveBeenCalledWith([{ hex: '#ABCDEF', name: 'sky' }]);
  });

  it('hard-blocks more than ten colors', async () => {
    const colors = Array.from({ length: 10 }, (_, index) => ({ hex: `#0000${index.toString(16).padStart(2, '0')}` }));
    await act(async () => root.render(<ActivityColorPalettePicker value={colors} onChange={jest.fn()} />));
    expect(container.querySelector('.activity-palette__saved-head button').disabled).toBe(true);
    expect(container.textContent).toContain('Maximum reached');
  });
});
