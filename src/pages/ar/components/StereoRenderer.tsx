import { useLayoutEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { renderStereoViews, videoCoverScale } from '../utils/stereoRendering';

export function StereoRenderer({ videoRef }: { videoRef?: React.RefObject<HTMLVideoElement | null> }) {
  const { camera, size } = useThree();
  const stereo = useMemo(() => new THREE.StereoCamera(), []);
  useLayoutEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    const previousAspect = perspective.aspect;
    const previousFocus = perspective.focus;
    perspective.aspect = size.width / (2 * Math.max(1, size.height));
    perspective.updateProjectionMatrix();
    return () => {
      perspective.aspect = previousAspect;
      perspective.focus = previousFocus;
      perspective.updateProjectionMatrix();
      delete camera.userData.videoCoverScale;
    };
  }, [camera, size.width, size.height]);

  // Update before gesture raycasts. Match the camera image's per-eye cover crop.
  useFrame(() => {
    const eyeAspect = size.width / (2 * Math.max(1, size.height));
    const perspective = camera as THREE.PerspectiveCamera;
    // R3F also updates the camera on resize. Reassert per-eye aspect before input/render.
    if (perspective.aspect !== eyeAspect) {
      perspective.aspect = eyeAspect;
      perspective.updateProjectionMatrix();
    }
    const video = videoRef?.current;
    const aspect = video?.videoWidth && video?.videoHeight ? video.videoWidth / video.videoHeight : eyeAspect;
    camera.userData.videoCoverScale = videoCoverScale(aspect, eyeAspect);
  }, -1);

  // Take over only in VR. Scene updates/painting still run once, rendering runs twice.
  useFrame(({ gl, scene }) => {
    renderStereoViews(gl, scene, camera as THREE.PerspectiveCamera, stereo, size.width, size.height);
  }, 1);
  return null;
}
