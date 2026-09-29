import * as THREE from 'three';
import { renderStereoViews, updateStereoCameras, videoCoverScale } from './stereoRendering';
import { screenToRay } from './raycasting';

const setup = () => {
  const camera = new THREE.PerspectiveCamera(60, 800 / 900, 0.1, 1000);
  const stereo = new THREE.StereoCamera();
  updateStereoCameras(stereo, camera);
  for (const eye of [stereo.cameraL, stereo.cameraR]) {
    eye.matrixWorldInverse.copy(eye.matrixWorld).invert();
  }
  return { camera, stereo };
};

test('uses distinct eye positions with a total separation of 64 mm', () => {
  const { stereo } = setup();
  expect(stereo.cameraL.matrixWorld.elements[12]).toBeCloseTo(-0.032);
  expect(stereo.cameraR.matrixWorld.elements[12]).toBeCloseTo(0.032);
});

test('has no disparity at the workspace plane and opposite disparity in front/behind', () => {
  const { stereo } = setup();
  const disparity = (z) => new THREE.Vector3(0, 0, z).project(stereo.cameraL).x
    - new THREE.Vector3(0, 0, z).project(stereo.cameraR).x;
  expect(disparity(-3)).toBeCloseTo(0);
  expect(disparity(-1)).toBeGreaterThan(0);
  expect(disparity(-6)).toBeLessThan(0);
});

test('preserves per-eye aspect without squeezing the full-screen image', () => {
  const { camera, stereo } = setup();
  expect(stereo.cameraL.projectionMatrix.elements[0]).toBeCloseTo(camera.projectionMatrix.elements[0]);
  expect(stereo.cameraR.projectionMatrix.elements[0]).toBeCloseTo(camera.projectionMatrix.elements[0]);
});

test('matches fingertip rays to the camera image cover crop, leaving normal AR unchanged', () => {
  const { camera } = setup();
  const monoRay = screenToRay(0.6, 0.5, camera).ray.direction.clone();
  camera.userData.videoCoverScale = videoCoverScale(16 / 9, 8 / 9);
  expect(camera.userData.videoCoverScale).toEqual({ x: 2, y: 1 });
  const croppedRay = screenToRay(0.55, 0.5, camera).ray.direction;
  expect(croppedRay.x).toBeCloseTo(monoRay.x);
  expect(croppedRay.y).toBeCloseTo(monoRay.y);
  expect(videoCoverScale(0.5, 1)).toEqual({ x: 1, y: 2 });
});

test('draws the same scene with two different cameras and restores renderer state', () => {
  const { camera, stereo } = setup();
  const scene = new THREE.Scene();
  const viewport = new THREE.Vector4(0, 0, 1600, 900);
  const gl = {
    autoClear: true,
    getViewport: (target) => target.copy(viewport),
    getScissor: (target) => target.copy(viewport),
    getScissorTest: () => false,
    setViewport: jest.fn(), setScissor: jest.fn(), setScissorTest: jest.fn(),
    clear: jest.fn(), render: jest.fn(),
  };
  renderStereoViews(gl, scene, camera, stereo, 1600, 900);
  expect(gl.render.mock.calls).toEqual([[scene, stereo.cameraL], [scene, stereo.cameraR]]);
  expect(gl.setViewport).toHaveBeenNthCalledWith(1, 0, 0, 800, 900);
  expect(gl.setViewport).toHaveBeenNthCalledWith(2, 800, 0, 800, 900);
  expect(gl.setViewport).toHaveBeenLastCalledWith(viewport);
  expect(gl.setScissorTest).toHaveBeenLastCalledWith(false);
  expect(gl.autoClear).toBe(true);
});
