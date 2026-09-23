import React, { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useTouchArLayout } from './useTouchArLayout';

const originalMatchMedia = window.matchMedia;
afterEach(() => {
  window.matchMedia = originalMatchMedia;
  delete global.IS_REACT_ACT_ENVIRONMENT;
});

test.each([
  ['desktop pointer', false],
  ['iPad desktop mode or narrow phone', true],
])('shared AR layout detects %s and updates without remounting content', (_, matches) => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  let listener;
  const query = {
    matches,
    addEventListener: jest.fn((type, callback) => { listener = callback; }),
    removeEventListener: jest.fn(),
  };
  window.matchMedia = jest.fn(() => query);
  const mounted = jest.fn();
  const unmounted = jest.fn();
  function Scene() {
    useEffect(() => { mounted(); return unmounted; }, []);
    return null;
  }
  function Harness() {
    const touch = useTouchArLayout();
    return <div data-touch={String(touch)}><Scene /></div>;
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<Harness />));
  expect(window.matchMedia).toHaveBeenCalledWith(
    '(any-pointer: coarse), (pointer: coarse), (max-width: 768px)',
  );
  expect(container.firstChild.dataset.touch).toBe(String(matches));
  act(() => { query.matches = !matches; listener(); });
  expect(container.firstChild.dataset.touch).toBe(String(!matches));
  expect(mounted).toHaveBeenCalledTimes(1);
  expect(unmounted).not.toHaveBeenCalled();
  act(() => root.unmount());
  expect(query.removeEventListener).toHaveBeenCalledWith('change', listener);
});
