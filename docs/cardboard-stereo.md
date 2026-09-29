# Cardboard stereo rendering

VR mode renders the existing scene twice through Three.js StereoCamera, at
64 mm total eye separation (one scene unit is one virtual meter). Each eye
uses half the canvas width and its own off-axis projection. The workspace
focus plane is 3 virtual meters away. Painting and scene updates still run
once per frame; models/materials are shared, not cloned or reloaded.

The compositor copies only the corresponding eye region, over the existing
single-camera video. Video remains monoscopic. Gesture rays and movement
account for the video cover crop in each eye. Saved artwork captures the left
eye only, without the live camera, rather than exporting a doubled image.

Normal AR does not mount the stereo renderer. It retains its original camera
and frame loop. Renderer viewport/scissor/clear settings are restored after
each stereo frame.

## Limits

This is stereo camera-relative AR, not a world-tracked VR environment.
There is no gyro head tracking, positional tracking, viewer-specific lens
distortion correction, or measured user IPD calibration. Do not describe it
as full Cardboard/WebXR support. Stereo rendering adds a second scene draw;
actual headset comfort and performance need hardware validation.

## Hardware acceptance checks

- Use landscape orientation on the target phone in its Cardboard viewer.
- Cover each eye in turn: a near object should shift relative to a far object.
- Verify objects are not horizontally squeezed; resize/rotate and recheck.
- Test Sandbox and an assigned activity: paint, bucket, erase, pinch/move,
  rotate, zoom, undo, and add multiple models. Check both eyes show identical
  artwork changes without duplicated actions.
- Check fingertip cursor and toolbar selection in both eyes.
- Submit a test artwork and verify its preview is a single image.
- Exit VR and reopen normal AR; verify normal view/gestures remain unchanged.
- Stop if the image cannot be comfortably fused or causes discomfort. Viewer
  calibration is a separate feature and cannot be inferred from screenshots.
