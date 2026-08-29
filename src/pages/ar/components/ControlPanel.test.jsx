import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { ControlPanel } from './ControlPanel';

describe('ControlPanel selected 3D model locking', () => {
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

  const renderPanel = async (selectedModel, onToggleModelLock = jest.fn()) => {
    await act(async () => {
      root.render(
        <ControlPanel
          paintColor={new THREE.Color('#ff0000')}
          onPaintColorChange={jest.fn()}
          activeTool="move"
          onToolChange={jest.fn()}
          brushLevel={5}
          onBrushLevelChange={jest.fn()}
          selectedModel={selectedModel}
          onToggleModelLock={onToggleModelLock}
        />
      );
    });
    return onToggleModelLock;
  };

  it('keeps model locking disabled until a 3D model is selected', async () => {
    await renderPanel(null);

    expect(container.textContent).toContain('Select or pinch a 3D model');
    expect(container.querySelector('[aria-label="Lock selected 3D model"]').disabled).toBe(true);
  });

  it('shows and runs the correct lock action for the selected model', async () => {
    const onToggleModelLock = await renderPanel({ label: 'Paper Crane', locked: true });
    const unlockButton = container.querySelector('[aria-label="Unlock selected 3D model"]');

    expect(container.textContent).toContain('Paper Crane • Locked');
    expect(unlockButton.disabled).toBe(false);

    await act(async () => {
      unlockButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onToggleModelLock).toHaveBeenCalledTimes(1);
  });
});
