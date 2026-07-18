import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { getStudentPendingActivities } from '../services/studentApi';
import { useUserSettings } from '../hooks/useUserSettings';

const musicContext = require.context('../music', false, /\.mp3$/i);
const MUSIC_TRACKS = musicContext.keys().map((file) => {
  const resolved = musicContext(file);
  return resolved?.default || resolved;
});

const getNotificationKey = (userId, activityId) => {
  const today = new Date().toISOString().slice(0, 10);
  return `elikha_due_notification_${userId}_${activityId}_${today}`;
};

const shuffleTracks = (tracks) => {
  const pool = [...tracks];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
};

const playClickSound = (audioContextRef) => {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return;

  const ctx = audioContextRef.current || new AudioContextCtor();
  audioContextRef.current = ctx;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(720, ctx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + 0.045);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.035, ctx.currentTime + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.07);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + 0.08);
};

export default function UserSettingsEffects() {
  const { settings, userId } = useUserSettings();
  const location = useLocation();
  const audioContextRef = useRef(null);
  const latestSettingsRef = useRef(settings);
  const isActivitySession = /^\/(?:mobile\/)?activity\/[^/]+\/start\/?$/.test(location.pathname);

  useEffect(() => {
    latestSettingsRef.current = settings;
    document.documentElement.dataset.elikhaDataSaver = settings.dataSaver ? 'true' : 'false';
    document.documentElement.dataset.elikhaQuality = settings.quality;
  }, [settings]);

  useEffect(() => {
    const canPlayAudio = settings.backgroundMusic && !isActivitySession && MUSIC_TRACKS.length;
    if (!canPlayAudio) return undefined;

    const player = new Audio();
    player.preload = 'auto';
    player.volume = 0.38;

    let playlist = shuffleTracks(MUSIC_TRACKS);
    let index = 0;
    let isStarting = false;

    const removeStartListeners = () => {
      window.removeEventListener('pointerdown', startPlaylist);
      window.removeEventListener('keydown', startPlaylist);
      window.removeEventListener('touchstart', startPlaylist);
    };

    const playCurrentTrack = () => {
      player.src = playlist[index];
      const playPromise = player.play();
      if (playPromise && typeof playPromise.then === 'function') {
        return playPromise;
      }
      return Promise.resolve();
    };

    const playNextTrack = () => {
      index += 1;
      if (index >= playlist.length) {
        playlist = shuffleTracks(MUSIC_TRACKS);
        index = 0;
      }
      playCurrentTrack().catch(() => {
        // Ignore playback interruption; next interaction can restart if needed.
      });
    };

    const startPlaylist = () => {
      if (isStarting) return;
      isStarting = true;
      playCurrentTrack()
        .then(() => {
          removeStartListeners();
          isStarting = false;
        })
        .catch(() => {
          isStarting = false;
        });
    };

    player.addEventListener('ended', playNextTrack);
    player.addEventListener('error', playNextTrack);

    window.addEventListener('pointerdown', startPlaylist);
    window.addEventListener('keydown', startPlaylist);
    window.addEventListener('touchstart', startPlaylist);

    startPlaylist();

    return () => {
      removeStartListeners();
      player.removeEventListener('ended', playNextTrack);
      player.removeEventListener('error', playNextTrack);
      player.pause();
      player.src = '';
    };
  }, [settings.backgroundMusic, isActivitySession]);

  useEffect(() => {
    const handleFirstInteraction = () => {
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
    };

    const handleClick = (event) => {
      const target = event.target;
      const clickable = target?.closest?.('button, a, input, select, textarea, [role="button"]');
      if (!clickable) return;

      if (latestSettingsRef.current.soundEffects) {
        playClickSound(audioContextRef);
      }
    };

    window.addEventListener('pointerdown', handleFirstInteraction, { once: true });
    window.addEventListener('keydown', handleFirstInteraction, { once: true });
    document.addEventListener('click', handleClick, true);

    return () => {
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
      document.removeEventListener('click', handleClick, true);
    };
  }, []);

  useEffect(() => {
    const maybeNotifyDueActivity = async () => {
      if (!settings.notifications || !userId || typeof Notification === 'undefined') return;
      if (Notification.permission !== 'granted') return;

      const userInfo = JSON.parse(window.sessionStorage.getItem('userInfo') || '{}');
      if (String(userInfo.role || '').toLowerCase() !== 'student') return;

      const result = await getStudentPendingActivities(userId);
      if (!result.success) return;

      const now = new Date();
      const dueSoon = (result.data || []).find((activity) => {
        if (!activity.due_date) return false;
        const due = new Date(activity.due_date);
        if (Number.isNaN(due.getTime())) return false;
        const days = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return days >= 0 && days <= 1;
      });

      if (!dueSoon) return;
      const key = getNotificationKey(userId, dueSoon.id);
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, 'sent');

      new Notification('E-Likha activity reminder', {
        body: `${dueSoon.title || 'An activity'} is due soon.`,
      });
    };

    maybeNotifyDueActivity();
  }, [settings.notifications, userId]);

  return null;
}
