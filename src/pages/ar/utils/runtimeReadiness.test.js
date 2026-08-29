import { canUseArInteractions } from './runtimeReadiness';

const READY = {
  canRunAr: true,
  faceStatus: 'ready',
  multipleFacesDetected: false,
  handStatus: 'ready',
  viewMode: false,
  modelLoadError: '',
};

describe('AR runtime readiness', () => {
  test('allows editing only after camera, face, hand, and model checks are healthy', () => {
    expect(canUseArInteractions(READY)).toBe(true);
  });

  test.each([
    ['camera is unavailable', { canRunAr: false }],
    ['face checking is loading', { faceStatus: 'loading' }],
    ['face checking failed', { faceStatus: 'error' }],
    ['multiple faces are visible', { multipleFacesDetected: true }],
    ['hand tracking is loading', { handStatus: 'loading' }],
    ['hand tracking failed', { handStatus: 'error' }],
    ['the model failed to load', { modelLoadError: 'Model could not be loaded.' }],
  ])('fails closed when %s', (_label, override) => {
    expect(canUseArInteractions({ ...READY, ...override })).toBe(false);
  });

  test('read-only viewing does not depend on hand tracking', () => {
    expect(canUseArInteractions({
      ...READY,
      viewMode: true,
      handStatus: 'error',
    })).toBe(true);
  });
});

