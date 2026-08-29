import { forwardRef, useEffect, useImperativeHandle } from 'react';

interface CameraFeedProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onReady?: () => void;
  onError?: (message: string) => void;
  facingMode?: 'user' | 'environment';
  enabled?: boolean;
}

export interface CameraFeedHandle {
  video: HTMLVideoElement | null;
}

export const CameraFeed = forwardRef<CameraFeedHandle, CameraFeedProps>(
  ({ videoRef, onReady, onError, facingMode = 'environment', enabled = false }, ref) => {
    useImperativeHandle(ref, () => ({
      video: videoRef.current,
    }));

    useEffect(() => {
      const video = videoRef.current;
      if (!video || !enabled) return;
      let active = true;

      const startCamera = async () => {
        try {
          let stream: MediaStream;

          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode,
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
              audio: false,
            });
          } catch (primaryError) {
            console.warn('Preferred camera constraints failed, retrying with default camera:', primaryError);
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          }

          // Permission can resolve after the student has already left the activity.
          // Stop that stream immediately so the camera indicator never stays on.
          if (!active) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }

          video.srcObject = stream;
          video.onloadedmetadata = async () => {
            try {
              await video.play();
              onReady?.();
            } catch (playError) {
              console.error('Failed to start camera video playback:', playError);
            }
          };
        } catch (error) {
          console.error('Failed to access camera:', error);
          const message = error instanceof DOMException && error.name === 'NotAllowedError'
            ? 'Camera permission was not allowed. Allow camera access in Chrome to continue this activity.'
            : 'Unable to start the camera. Check that it is connected and not being used by another app.';
          onError?.(message);
        }
      };

      startCamera();

      return () => {
        active = false;
        if (video.srcObject) {
          const stream = video.srcObject as MediaStream;
          stream.getTracks().forEach((track) => track.stop());
        }
      };
    }, [enabled, facingMode, onError, onReady, videoRef]);

    return (
      <video
        ref={videoRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          zIndex: 0,
          transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
        }}
        playsInline
        muted
        autoPlay
      />
    );
  }
);

CameraFeed.displayName = 'CameraFeed';
