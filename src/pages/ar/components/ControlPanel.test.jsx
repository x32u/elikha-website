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

  it('keeps short touch toolbars at full size with overflow available as a fallback', async () => {
    await act(async () => {
      root.render(
        <ControlPanel
          paintColor={new THREE.Color('#ff0000')}
          onPaintColorChange={jest.fn()}
          activeTool="paint"
          onToolChange={jest.fn()}
          brushLevel={5}
          onBrushLevelChange={jest.fn()}
          compact
        />
      );
    });

    expect(container.textContent).toContain('Paint');
    expect(container.querySelector('.compact-toolbox-toggle')).toBeNull();
    expect(container.querySelector('.control-panel-content').hidden).toBe(false);
    expect(container.querySelector('.control-panel').getAttribute('data-fit-scale')).toBe('1.000');
    expect(container.querySelector('.control-panel').style.overflow).toBe('auto');
    const panel = container.querySelector('.control-panel');
    expect(panel.style.background).toBe('transparent');
    expect(panel.style.boxShadow).toBe('none');
    expect(panel.style.backdropFilter).toBe('none');
  });

  it('fits long touch toolbars and refits after content changes without tiny controls', async () => {
    let measure;
    let resized;
    const originalObserver = global.ResizeObserver;
    const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      measure = callback;
      return 1;
    });
    global.ResizeObserver = class {
      constructor(callback) { resized = callback; }
      observe() {}
      disconnect() {}
    };
    try {
      await act(async () => root.render(
        <ControlPanel compact paintColor={new THREE.Color('#ff0000')}
          onPaintColorChange={jest.fn()} activeTool="paint" onToolChange={jest.fn()}
          brushLevel={5} onBrushLevelChange={jest.fn()} />
      ));
      const panel = container.querySelector('.control-panel');
      const content = container.querySelector('.control-panel-content');
      Object.defineProperty(content, 'scrollHeight', { configurable: true, value: 1500 });
      act(() => measure());
      expect(panel.dataset.fitScale).toBe('0.850');
      expect(parseFloat(panel.style.maxHeight) * 0.85).toBeCloseTo(window.innerHeight - 120);
      Object.defineProperty(content, 'scrollHeight', { configurable: true, value: 200 });
      act(() => { resized(); measure(); });
      expect(panel.dataset.fitScale).toBe('1.000');
    } finally {
      raf.mockRestore();
      global.ResizeObserver = originalObserver;
    }
  });

  it('renders only the activity palette in its saved order', async () => {
    await act(async () => {
      root.render(
        <ControlPanel
          paintColor={new THREE.Color('#123456')}
          onPaintColorChange={jest.fn()}
          activeTool="paint"
          onToolChange={jest.fn()}
          brushLevel={5}
          onBrushLevelChange={jest.fn()}
          allowedColors={[{ hex: '#123456', name: 'Ocean' }, { hex: '#ABCDEF', name: 'Sky' }]}
        />
      );
    });
    const swatches = [...container.querySelectorAll('.color-swatch')];
    expect(swatches).toHaveLength(2);
    expect(swatches.map((item) => item.getAttribute('aria-label'))).toEqual(['Select ocean', 'Select sky']);
  });
});
