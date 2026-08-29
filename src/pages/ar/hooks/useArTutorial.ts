import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GrabState } from './useHandTrackingV2';
import { normalizeVoiceGuideText, shouldSpeakVoiceAnnouncement } from '../utils/voiceGuidance';

interface UseArTutorialOptions {
  grabState: GrabState;
  enabled?: boolean;
  voiceEnabled?: boolean;
}

interface ArAnnouncementOptions {
  debounceMs?: number;
  dedupeMs?: number;
  force?: boolean;
}

interface TutorialStep {
  texts: string[];
  gapMs?: number;
  holdMs: number;
  check: (grab: GrabState) => boolean;
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const localVoices = voices.filter((v) => v.localService);
  const preferred = voices.find((v) =>
    v.lang?.toLowerCase().startsWith('en') &&
    /female|girl|child|kids|kidz|samantha|victoria|ava|zoe|google us english/i.test(v.name)
  );
  return (
    preferred ||
    localVoices.find((v) => v.lang?.toLowerCase().startsWith('en')) ||
    localVoices[0] ||
    voices.find((v) => v.lang?.toLowerCase().startsWith('en')) ||
    voices[0]
  );
}

export function useArTutorial({ grabState, enabled = true, voiceEnabled = true }: UseArTutorialOptions) {
  const [stepIndex, setStepIndex] = useState(0);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [ttsAvailable, setTtsAvailable] = useState(() => (
    typeof window !== 'undefined'
    && Boolean(window.speechSynthesis)
    && typeof SpeechSynthesisUtterance !== 'undefined'
  ));
  const [currentTexts, setCurrentTexts] = useState<string[]>([]);
  const grabRef = useRef(grabState);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const lastSpokenRef = useRef<number>(-1);
  const progressRef = useRef(0);
  const lastTimeRef = useRef<number>(performance.now());
  const lastStartRef = useRef(0);
  const isTutorialSpeakingRef = useRef(false);
  const pendingSpeakTimeoutsRef = useRef<number[]>([]);
  const pendingSpeakRef = useRef<{ texts: string[]; gapMs: number; baseDelay: number } | null>(null);
  const tapListenerRef = useRef<(() => void) | null>(null);
  const actionSpeakTimeoutRef = useRef<number | null>(null);
  const lastAnnouncementRef = useRef<{ text: string; at: number } | null>(null);
  const transitionDelayMs = 1000;

  useEffect(() => {
    grabRef.current = grabState;
  }, [grabState]);

  useEffect(() => {
    const updateVoice = () => {
      voiceRef.current = pickVoice();
    };
    updateVoice();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.addEventListener('voiceschanged', updateVoice);
      return () => {
        window.speechSynthesis.removeEventListener('voiceschanged', updateVoice);
        window.speechSynthesis.cancel();
      };
    }
    return undefined;
  }, []);

  const steps = useMemo<TutorialStep[]>(
    () => [
      {
        texts: ['Hello there, friend!', 'First, make a fist. Now move up and down.'],
        gapMs: 2000,
        holdMs: 1000,
        check: (grab) => grab.isGrabbing && Math.abs(grab.dy) > 0.02,
      },
      {
        texts: ['Nice! Now move left and right while still in a fist.'],
        holdMs: 1000,
        check: (grab) => grab.isGrabbing && Math.abs(grab.dx) > 0.02,
      },
      {
        texts: ["Now do a pinch. It'll grab the object!"],
        holdMs: 2000,
        check: (grab) => {
          if (!grab.isPinching || !grab.pinchStartPosition || !grab.currentPosition) return false;
          const dx = grab.currentPosition.x - grab.pinchStartPosition.x;
          const dy = grab.currentPosition.y - grab.pinchStartPosition.y;
          return Math.sqrt(dx * dx + dy * dy) > 0.02;
        },
      },
      {
        texts: ['Great! Now make two fists and move them closer or apart to zoom.'],
        holdMs: 2000,
        check: (grab) => grab.isZooming && Math.abs(grab.zoomDelta) > 0.15,
      },
      {
        texts: ['Finally, show two open palms to submit and exit anytime.'],
        holdMs: 0,
        check: () => false,
      },
    ],
    []
  );

  const clearPendingTimeouts = useCallback(() => {
    pendingSpeakTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
    pendingSpeakTimeoutsRef.current = [];
  }, []);

  const removeTapListener = useCallback(() => {
    if (tapListenerRef.current) {
      window.removeEventListener('pointerdown', tapListenerRef.current);
      window.removeEventListener('touchstart', tapListenerRef.current);
      tapListenerRef.current = null;
    }
  }, []);

  const buildUtterance = useCallback((text: string, onStart?: () => void) => {
    const utter = new SpeechSynthesisUtterance(text);
    if (voiceRef.current) utter.voice = voiceRef.current;
    utter.lang = voiceRef.current?.lang || 'en-US';
    utter.volume = 1;
    utter.rate = 0.9;
    utter.pitch = 1.15;
    utter.onstart = () => {
      lastStartRef.current = performance.now();
      isTutorialSpeakingRef.current = true;
      setTtsAvailable(true);
      onStart?.();
      setNeedsGesture(false);
      pendingSpeakRef.current = null;
      removeTapListener();
    };
    utter.onend = () => {
      isTutorialSpeakingRef.current = false;
    };
    utter.onerror = () => {
      isTutorialSpeakingRef.current = false;
      setNeedsGesture(true);
    };
    return utter;
  }, [removeTapListener]);

  const cancelTutorialAudio = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    if (isTutorialSpeakingRef.current || window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel();
    }
    isTutorialSpeakingRef.current = false;
  }, []);

  const speakImmediate = useCallback((texts: string[], gapMs: number) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    if (texts.length === 0) return;

    const attemptSpeak = (attempt: number) => {
      lastStartRef.current = 0;
      cancelTutorialAudio();
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(buildUtterance(texts[0]));
      if (texts.length > 1) {
        const id = window.setTimeout(() => {
          window.speechSynthesis.speak(buildUtterance(texts[1]));
        }, gapMs);
        pendingSpeakTimeoutsRef.current.push(id);
      }

      const retryId = window.setTimeout(() => {
        if (lastStartRef.current === 0 && attempt < 2) {
          attemptSpeak(attempt + 1);
        } else if (lastStartRef.current === 0) {
          setNeedsGesture(true);
          setTtsAvailable(false);
        }
      }, 500);
      pendingSpeakTimeoutsRef.current.push(retryId);
    };

    attemptSpeak(0);
  }, [buildUtterance, cancelTutorialAudio]);

  const speakSequence = useCallback((texts: string[], gapMs: number, baseDelay: number) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    let started = false;
    const markStarted = () => {
      started = true;
    };

    cancelTutorialAudio();
    window.speechSynthesis.resume();

    if (texts.length === 1) {
      const id = window.setTimeout(() => {
        window.speechSynthesis.speak(buildUtterance(texts[0], markStarted));
      }, baseDelay);
      pendingSpeakTimeoutsRef.current.push(id);
    } else {
      const firstId = window.setTimeout(() => {
        window.speechSynthesis.speak(buildUtterance(texts[0], markStarted));
      }, baseDelay);
      const secondId = window.setTimeout(() => {
        window.speechSynthesis.speak(buildUtterance(texts[1], markStarted));
      }, baseDelay + gapMs);
      pendingSpeakTimeoutsRef.current.push(firstId, secondId);
    }

    const watchdogId = window.setTimeout(() => {
      if (!started) {
        pendingSpeakRef.current = { texts, gapMs, baseDelay: 0 };
        setNeedsGesture(true);
        if (!tapListenerRef.current) {
          tapListenerRef.current = () => {
            const pending = pendingSpeakRef.current || { texts, gapMs, baseDelay: 0 };
            pendingSpeakRef.current = null;
            clearPendingTimeouts();
            speakImmediate(pending.texts, pending.gapMs);
          };
          window.addEventListener('pointerdown', tapListenerRef.current, { once: true });
          window.addEventListener('touchstart', tapListenerRef.current, { once: true });
        }
      }
    }, 500);
    pendingSpeakTimeoutsRef.current.push(watchdogId);
  }, [buildUtterance, cancelTutorialAudio, clearPendingTimeouts, speakImmediate]);

  const triggerSpeak = useCallback(() => {
    if (!enabled || !voiceEnabled) return;
    if (stepIndex < 0 || stepIndex >= steps.length) return;
    clearPendingTimeouts();
    const step = steps[stepIndex];
    const gap = step.gapMs ?? 0;
    speakImmediate(step.texts, gap);
  }, [clearPendingTimeouts, enabled, stepIndex, steps, speakImmediate, voiceEnabled]);

  const announce = useCallback((text: string, options: ArAnnouncementOptions = {}) => {
    const message = normalizeVoiceGuideText(text);
    if (!message || typeof window === 'undefined') return;

    const { debounceMs = 0, dedupeMs = 450, force = false } = options;
    const now = Date.now();
    const lastAnnouncement = lastAnnouncementRef.current;
    if (!shouldSpeakVoiceAnnouncement({
      text: message,
      voiceEnabled,
      force,
      previousText: lastAnnouncement?.text,
      previousAt: lastAnnouncement?.at,
      now,
      dedupeMs,
    })) {
      return;
    }

    const performAnnouncement = () => {
      actionSpeakTimeoutRef.current = null;
      lastAnnouncementRef.current = { text: message, at: Date.now() };
      setCurrentTexts([message]);

      if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
        setTtsAvailable(false);
        return;
      }

      clearPendingTimeouts();
      cancelTutorialAudio();
      window.speechSynthesis.resume();

      const utterance = new SpeechSynthesisUtterance(message);
      if (voiceRef.current) utterance.voice = voiceRef.current;
      utterance.lang = voiceRef.current?.lang || 'en-US';
      utterance.volume = 1;
      utterance.rate = 0.9;
      utterance.pitch = 1.1;
      utterance.onstart = () => {
        setTtsAvailable(true);
        setNeedsGesture(false);
      };
      utterance.onerror = () => {
        setTtsAvailable(false);
      };
      window.speechSynthesis.speak(utterance);
    };

    if (actionSpeakTimeoutRef.current) {
      window.clearTimeout(actionSpeakTimeoutRef.current);
      actionSpeakTimeoutRef.current = null;
    }

    if (debounceMs > 0) {
      actionSpeakTimeoutRef.current = window.setTimeout(performAnnouncement, debounceMs);
    } else {
      performAnnouncement();
    }
  }, [cancelTutorialAudio, clearPendingTimeouts, voiceEnabled]);

  const repeatCurrent = useCallback(() => {
    if (!voiceEnabled || currentTexts.length === 0) return;
    clearPendingTimeouts();
    speakImmediate(currentTexts, currentTexts.length > 1 ? 900 : 0);
  }, [clearPendingTimeouts, currentTexts, speakImmediate, voiceEnabled]);

  useEffect(() => {
    if (!enabled || !voiceEnabled) return;
    if (stepIndex < 0 || stepIndex >= steps.length) return;
    if (lastSpokenRef.current === stepIndex) return;
    lastSpokenRef.current = stepIndex;

    clearPendingTimeouts();

    const step = steps[stepIndex];
    setCurrentTexts(step.texts);
    const gap = step.gapMs ?? 0;
    const baseDelay = stepIndex === 0 ? 0 : transitionDelayMs;

    speakSequence(step.texts, gap, baseDelay);
  }, [clearPendingTimeouts, enabled, speakSequence, stepIndex, steps, transitionDelayMs, voiceEnabled]);

  useEffect(() => {
    if (!enabled || !voiceEnabled) return;
    let rafId = 0;

    const tick = () => {
      const now = performance.now();
      const dt = now - lastTimeRef.current;
      lastTimeRef.current = now;

      if (stepIndex >= steps.length - 1) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const step = steps[stepIndex];
      if (step.check(grabRef.current)) {
        progressRef.current += dt;
      } else {
        progressRef.current = 0;
      }

      if (progressRef.current >= step.holdMs) {
        progressRef.current = 0;
        setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [enabled, stepIndex, steps, voiceEnabled]);

  useEffect(() => {
    if (voiceEnabled) return;

    clearPendingTimeouts();
    removeTapListener();
    if (actionSpeakTimeoutRef.current) {
      window.clearTimeout(actionSpeakTimeoutRef.current);
      actionSpeakTimeoutRef.current = null;
    }
    cancelTutorialAudio();
    pendingSpeakRef.current = null;
    lastSpokenRef.current = -1;
    progressRef.current = 0;
    setNeedsGesture(false);
    setCurrentTexts([]);
  }, [cancelTutorialAudio, clearPendingTimeouts, removeTapListener, voiceEnabled]);

  useEffect(() => {
    return () => {
      clearPendingTimeouts();
      removeTapListener();
      if (actionSpeakTimeoutRef.current) {
        window.clearTimeout(actionSpeakTimeoutRef.current);
        actionSpeakTimeoutRef.current = null;
      }
    };
  }, [clearPendingTimeouts, removeTapListener]);

  return {
    stepIndex,
    needsGesture,
    triggerSpeak,
    repeatCurrent,
    ttsAvailable,
    currentTexts,
    announce,
  };
}
