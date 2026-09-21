const cloneValue = (value) => JSON.parse(JSON.stringify(value));

export const createStableModelConfigsKey = (modelConfigs = []) => JSON.stringify(
  modelConfigs.map((model) => ({
    id: model?.id || '',
    label: model?.label || '',
    modelUrl: model?.modelUrl || '',
    modelFileType: model?.modelFileType || '',
  }))
);

export const createRenderingRecoverySnapshot = ({
  arState,
  activeTool,
  paintColor,
  brushLevel,
}) => ({
  arState: cloneValue(arState),
  activeTool,
  paintColor,
  brushLevel,
});

export const bindWebglContextRecovery = (canvas, { onInterrupted, onRestored }) => {
  const handleLost = (event) => {
    event.preventDefault();
    onInterrupted?.();
  };
  const handleRestored = () => onRestored?.();

  canvas.addEventListener('webglcontextlost', handleLost, false);
  canvas.addEventListener('webglcontextrestored', handleRestored, false);

  return () => {
    canvas.removeEventListener('webglcontextlost', handleLost, false);
    canvas.removeEventListener('webglcontextrestored', handleRestored, false);
  };
};
