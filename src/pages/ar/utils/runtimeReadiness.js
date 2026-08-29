/**
 * @typedef {Object} ArRuntimeReadiness
 * @property {boolean} canRunAr
 * @property {'idle'|'loading'|'ready'|'error'|string} faceStatus
 * @property {boolean} multipleFacesDetected
 * @property {'loading'|'ready'|'error'|string} handStatus
 * @property {boolean} [viewMode]
 * @property {string} [modelLoadError]
 */

/** @param {ArRuntimeReadiness} options */
export const canUseArInteractions = ({
  canRunAr,
  faceStatus,
  multipleFacesDetected,
  handStatus,
  viewMode = false,
  modelLoadError = '',
} = {}) => Boolean(
  canRunAr
    && faceStatus === 'ready'
    && !multipleFacesDetected
    && (viewMode || handStatus === 'ready')
    && !String(modelLoadError || '').trim()
);
