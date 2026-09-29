import * as THREE from 'three';

export const STEREO_EYE_SEPARATION = 0.064;
export const STEREO_FOCUS_DISTANCE = 3;

// Camera-relative workspace uses one scene unit as one virtual meter.
export function updateStereoCameras(stereo: THREE.StereoCamera, camera: THREE.PerspectiveCamera) {
  stereo.eyeSep = STEREO_EYE_SEPARATION;
  stereo.aspect = 1; // The source camera already has the per-eye aspect.
  camera.focus = STEREO_FOCUS_DISTANCE;
  camera.updateMatrixWorld(true);
  stereo.update(camera);
  return [stereo.cameraL, stereo.cameraR];
}

export function videoCoverScale(videoAspect: number, eyeAspect: number) {
  return {
    x: Math.max(1, videoAspect / eyeAspect),
    y: Math.max(1, eyeAspect / videoAspect),
  };
}

export function interactionScale(camera: THREE.Camera) {
  return camera.userData.videoCoverScale || { x: 1, y: 1 };
}

export function renderStereoViews(
  gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera,
  stereo: THREE.StereoCamera, width: number, height: number
) {
  const viewport = gl.getViewport(new THREE.Vector4());
  const scissor = gl.getScissor(new THREE.Vector4());
  const scissorTest = gl.getScissorTest();
  const autoClear = gl.autoClear;
  try {
    const eyes = updateStereoCameras(stereo, camera);
    gl.autoClear = false;
    gl.setScissorTest(false);
    gl.clear();
    gl.setScissorTest(true);
    eyes.forEach((eye, index) => {
      gl.setViewport(index * width / 2, 0, width / 2, height);
      gl.setScissor(index * width / 2, 0, width / 2, height);
      gl.render(scene, eye);
    });
  } finally {
    gl.setViewport(viewport);
    gl.setScissor(scissor);
    gl.setScissorTest(scissorTest);
    gl.autoClear = autoClear;
  }
}
