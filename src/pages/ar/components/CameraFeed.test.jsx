import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { CameraFeed } from './CameraFeed';

describe('CameraFeed mobile lens selection', () => {
  let container;
  let root;
  let originalMediaDevices;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    global.IS_REACT_ACT_ENVIRONMENT = true;
    originalMediaDevices = navigator.mediaDevices;
  });

  afterEach(() => {
    act(() => root.unmount());
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: originalMediaDevices,
    });
    container.remove();
    delete global.IS_REACT_ACT_ENVIRONMENT;
    jest.restoreAllMocks();
  });

  it.each([
    ['AR', 'user'],
    ['VR', 'environment'],
  ])('requires the intended %s camera without an opposite-lens fallback', async (_, facingMode) => {
    const stop = jest.fn();
    const getUserMedia = jest.fn().mockResolvedValue({ getTracks: () => [{ stop }] });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });

    await act(async () => {
      root.render(
        <CameraFeed
          videoRef={createRef()}
          enabled
          facingMode={facingMode}
          requireExactFacingMode
        />
      );
    });

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({
      video: {
        facingMode: { exact: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
  });

  it('reports a missing required camera instead of opening the default lens', async () => {
    const getUserMedia = jest.fn().mockRejectedValue(
      new DOMException('No matching camera', 'OverconstrainedError')
    );
    const onError = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });

    await act(async () => {
      root.render(
        <CameraFeed
          videoRef={createRef()}
          enabled
          facingMode="environment"
          requireExactFacingMode
          onError={onError}
        />
      );
    });

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      'The required back camera is unavailable on this device.'
    );
  });
});
