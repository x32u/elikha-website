import {
  bindWebglContextRecovery,
  createRenderingRecoverySnapshot,
  createStableModelConfigsKey,
} from './renderingRecovery';

describe('AR rendering recovery', () => {
  test.each(['cactus', 'lion', 'robot'])('preserves a long %s paint session and interaction state', (modelId) => {
    const paint = Array.from({ length: 3000 }, (_, index) => ({
      id: `${modelId}-stamp-${index}`,
      color: index % 2 === 0 ? '#E8576C' : '#3156E0',
      meshPath: [modelId, `mesh-${index % 12}`],
    }));
    const model = [{
      id: modelId,
      position: [1.25, -0.5, -2.75],
      rotation: [0.25, 1.1, -0.15],
      scale: [1.4, 1.4, 1.4],
    }];
    const snapshot = createRenderingRecoverySnapshot({
      arState: { paint, scene: [], puzzle: [], model, group: null },
      activeTool: 'bucket',
      paintColor: '#F4A72E',
      brushLevel: 8,
    });

    paint.length = 0;
    model[0].position[0] = 99;

    expect(snapshot.arState.paint).toHaveLength(3000);
    expect(snapshot.arState.paint[0].id).toBe(`${modelId}-stamp-0`);
    expect(snapshot.arState.model[0]).toEqual(expect.objectContaining({
      position: [1.25, -0.5, -2.75],
      rotation: [0.25, 1.1, -0.15],
      scale: [1.4, 1.4, 1.4],
    }));
    expect(snapshot).toEqual(expect.objectContaining({
      activeTool: 'bucket',
      paintColor: '#F4A72E',
      brushLevel: 8,
    }));
  });

  test('captures and restores through the browser WebGL context events', () => {
    const canvas = document.createElement('canvas');
    const onInterrupted = jest.fn();
    const onRestored = jest.fn();
    const unbind = bindWebglContextRecovery(canvas, { onInterrupted, onRestored });
    const lostEvent = new Event('webglcontextlost', { cancelable: true });

    canvas.dispatchEvent(lostEvent);
    canvas.dispatchEvent(new Event('webglcontextrestored'));

    expect(lostEvent.defaultPrevented).toBe(true);
    expect(onInterrupted).toHaveBeenCalledTimes(1);
    expect(onRestored).toHaveBeenCalledTimes(1);

    unbind();
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(onRestored).toHaveBeenCalledTimes(1);
  });

  test('keeps equivalent model configuration arrays stable across rerenders', () => {
    const firstRender = [{
      id: 'lion', label: 'Lion', modelUrl: '/models/lion.glb', modelFileType: 'glb', transient: 1,
    }];
    const secondRender = [{
      id: 'lion', label: 'Lion', modelUrl: '/models/lion.glb', modelFileType: 'glb', transient: 2,
    }];

    expect(createStableModelConfigsKey(firstRender)).toBe(createStableModelConfigsKey(secondRender));
    expect(createStableModelConfigsKey(firstRender)).not.toBe(createStableModelConfigsKey([
      { ...secondRender[0], modelUrl: '/models/other.glb' },
    ]));
  });
});
