import { useEffect, useRef, useState, type RefObject } from 'react';
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import { countConfidentFaces, MIN_FACE_CONFIDENCE } from '../utils/faceDetection';

const TASKS_VISION_VERSION = '0.10.32';
const TASKS_VISION_WASM_URL =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const FACE_DETECTOR_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
const DETECTION_INTERVAL_MS = 320;
const MULTIPLE_FACE_CONFIRMATIONS = 4;
const CLEAR_CONFIRMATIONS = 4;

export type FaceDetectionStatus = 'idle' | 'loading' | 'ready' | 'error';

export type SingleFaceDetectionState = {
  status: FaceDetectionStatus;
  faceCount: number;
  multipleFacesDetected: boolean;
  error: string;
};

const INITIAL_STATE: SingleFaceDetectionState = {
  status: 'idle',
  faceCount: 0,
  multipleFacesDetected: false,
  error: '',
};

/**
 * Counts faces in the live AR camera without identifying or storing anyone.
 * A short confirmation window prevents a single noisy frame from pausing AR.
 */
export function useSingleFaceDetection(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean
): SingleFaceDetectionState {
  const [state, setState] = useState<SingleFaceDetectionState>(INITIAL_STATE);
  const detectorRef = useRef<FaceDetector | null>(null);
  const frameRef = useRef<number>(0);
  const lastInferenceAtRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);
  const multipleFaceFramesRef = useRef(0);
  const clearFramesRef = useRef(0);
  const multipleFacesDetectedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setState(INITIAL_STATE);
      return;
    }

    let active = true;
    setState((previous) => ({ ...previous, status: 'loading', error: '' }));

    const detectFrame = (timestamp: number) => {
      if (!active) return;

      const detector = detectorRef.current;
      const video = videoRef.current;
      const videoReady = Boolean(
        video &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      );

      if (
        detector &&
        video &&
        videoReady &&
        timestamp - lastInferenceAtRef.current >= DETECTION_INTERVAL_MS &&
        video.currentTime !== lastVideoTimeRef.current
      ) {
        lastInferenceAtRef.current = timestamp;
        lastVideoTimeRef.current = video.currentTime;

        try {
          const result = detector.detectForVideo(video, timestamp);
          const faceCount = countConfidentFaces(result.detections);

          if (faceCount > 1) {
            multipleFaceFramesRef.current += 1;
            clearFramesRef.current = 0;
            if (multipleFaceFramesRef.current >= MULTIPLE_FACE_CONFIRMATIONS) {
              multipleFacesDetectedRef.current = true;
            }
          } else {
            multipleFaceFramesRef.current = 0;
            clearFramesRef.current += 1;
            if (clearFramesRef.current >= CLEAR_CONFIRMATIONS) {
              multipleFacesDetectedRef.current = false;
            }
          }

          setState({
            status: 'ready',
            faceCount,
            multipleFacesDetected: multipleFacesDetectedRef.current,
            error: '',
          });
        } catch (error) {
          console.error('Face detection failed:', error);
          detectorRef.current?.close();
          detectorRef.current = null;
          active = false;
          setState((previous) => ({
            ...previous,
            status: 'error',
            error: 'Single-face detection is temporarily unavailable.',
          }));
          return;
        }
      }

      frameRef.current = window.requestAnimationFrame(detectFrame);
    };

    const initialize = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(TASKS_VISION_WASM_URL);
        const commonOptions = {
          runningMode: 'VIDEO' as const,
          minDetectionConfidence: MIN_FACE_CONFIDENCE,
          minSuppressionThreshold: 0.5,
        };
        let detector: FaceDetector;

        try {
          detector = await FaceDetector.createFromOptions(vision, {
            ...commonOptions,
            baseOptions: {
              modelAssetPath: FACE_DETECTOR_MODEL_URL,
              delegate: 'GPU',
            },
          });
        } catch (gpuError) {
          console.warn('GPU face detection unavailable; using CPU instead:', gpuError);
          detector = await FaceDetector.createFromOptions(vision, {
            ...commonOptions,
            baseOptions: { modelAssetPath: FACE_DETECTOR_MODEL_URL },
          });
        }

        if (!active) {
          detector.close();
          return;
        }

        detectorRef.current = detector;
        setState((previous) => ({ ...previous, status: 'ready', error: '' }));
        frameRef.current = window.requestAnimationFrame(detectFrame);
      } catch (error) {
        console.error('Unable to initialize face detection:', error);
        if (!active) return;
        setState({
          status: 'error',
          faceCount: 0,
          multipleFacesDetected: false,
          error: 'Single-face detection could not start on this device.',
        });
      }
    };

    void initialize();

    return () => {
      active = false;
      window.cancelAnimationFrame(frameRef.current);
      detectorRef.current?.close();
      detectorRef.current = null;
      multipleFaceFramesRef.current = 0;
      clearFramesRef.current = 0;
      multipleFacesDetectedRef.current = false;
    };
  }, [enabled, videoRef]);

  return state;
}
