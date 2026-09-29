import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PaintCursor } from './PaintCursor';

test('tracks the fingertip, updates color, and hides when tracking or paint mode ends', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const request = window.requestAnimationFrame;
  const cancel = window.cancelAnimationFrame;
  let tick;
  window.requestAnimationFrame = jest.fn(callback => { tick = callback; return 1; });
  window.cancelAnimationFrame = jest.fn();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const videoRef = { current: null };
  const render = (landmarks, color = '#ff0000', enabled = true) => {
    act(() => root.render(<PaintCursor landmarks={landmarks} videoRef={videoRef} color={color} enabled={enabled} mirrorX={false} />));
    act(() => tick());
  };
  try {
    render({ indexTip: { x: 0.5, y: 0.5 } });
    const dot = container.firstChild;
    expect(dot.style.display).toBe('block');
    expect(dot.style.backgroundColor).toBe('rgb(255, 0, 0)');
    expect(dot.style.transform).toBe(`translate(${window.innerWidth / 2 - 11}px, ${window.innerHeight / 2 - 11}px)`);
    expect(dot.style.pointerEvents).toBe('none');
    render({ indexTip: { x: 0.2, y: 0.3 } }, '#ffff00');
    expect(dot.style.backgroundColor).toBe('rgb(255, 255, 0)');
    render(null);
    expect(dot.style.display).toBe('none');
    render({ indexTip: { x: 0.5, y: 0.5 } }, '#ff0000', false);
    expect(dot.style.display).toBe('none');
  } finally {
    act(() => root.unmount());
    window.requestAnimationFrame = request;
    window.cancelAnimationFrame = cancel;
    delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});
