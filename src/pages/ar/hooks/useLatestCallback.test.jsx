import React, { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useLatestCallback } from './useLatestCallback';

test('tool changes publish to the latest handler without disposing live paint', () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  const disposePaint = jest.fn();
  let publish;
  function Scene({ onPaint }) {
    publish = useLatestCallback(onPaint);
    useEffect(() => () => { publish(['red', 'yellow']); disposePaint(); }, [publish]);
    return null;
  }
  const handlers = Array.from({ length: 30 }, () => jest.fn());
  handlers.forEach((onPaint) => act(() => root.render(<Scene onPaint={onPaint} />)));
  expect(disposePaint).not.toHaveBeenCalled();
  act(() => publish(['red', 'yellow']));
  expect(handlers[29]).toHaveBeenCalledWith(['red', 'yellow']);
  expect(handlers[0]).not.toHaveBeenCalled();
  act(() => root.unmount());
  expect(disposePaint).toHaveBeenCalledTimes(1);
  delete global.IS_REACT_ACT_ENVIRONMENT;
});
