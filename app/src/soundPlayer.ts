import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import { getApiBaseUrl } from './api';

export type ToneType = 'notification' | 'alert' | 'reminder';

let activeWebAudio: any = null;
let activeSound: Audio.Sound | null = null;
let audioCtx: any = null;

function getAudioContext() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => undefined);
  }
  return audioCtx;
}

/** Synthesizes pleasant musical chimes using Web Audio API (zero network / zero file dependency). */
export function playSyntheticChime(type: ToneType = 'notification') {
  if (Platform.OS !== 'web') return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    let notes: { freq: number; start: number; dur: number; gain: number }[] = [];

    if (type === 'notification') {
      // Crisp 2-note chime (E5 -> A5)
      notes = [
        { freq: 659.25, start: 0, dur: 0.18, gain: 0.22 },
        { freq: 880.0, start: 0.1, dur: 0.35, gain: 0.28 },
      ];
    } else if (type === 'alert') {
      // 3-note prompt alert (C5 -> E5 -> G5)
      notes = [
        { freq: 523.25, start: 0, dur: 0.12, gain: 0.22 },
        { freq: 659.25, start: 0.08, dur: 0.14, gain: 0.24 },
        { freq: 783.99, start: 0.18, dur: 0.38, gain: 0.28 },
      ];
    } else {
      // Mellow reminder bell (A4 -> C#5 -> E5)
      notes = [
        { freq: 440.0, start: 0, dur: 0.25, gain: 0.25 },
        { freq: 554.37, start: 0.12, dur: 0.28, gain: 0.25 },
        { freq: 659.25, start: 0.24, dur: 0.45, gain: 0.28 },
      ];
    }

    notes.forEach((n) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.freq, now + n.start);

      gain.gain.setValueAtTime(0.001, now + n.start);
      gain.gain.exponentialRampToValueAtTime(n.gain, now + n.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + n.start);
      osc.stop(now + n.start + n.dur + 0.05);
    });
  } catch {
    // Ignore web audio exceptions
  }
}

/** Stop any currently playing preview/sound */
export async function stopCurrentSound() {
  if (Platform.OS === 'web' && activeWebAudio) {
    try {
      activeWebAudio.pause();
      activeWebAudio.currentTime = 0;
    } catch {}
    activeWebAudio = null;
  }
  if (activeSound) {
    try {
      await activeSound.unloadAsync();
    } catch {}
    activeSound = null;
  }
}

/**
 * Plays a custom sound from URL with automatic fallback to Web Audio synthetic chime.
 * Returns { customPlayed: boolean }
 */
export async function playSoundWithFallback(
  rawUrl?: string | null,
  type: ToneType = 'notification'
): Promise<{ customPlayed: boolean; note?: string }> {
  await stopCurrentSound();

  if (!rawUrl) {
    playSyntheticChime(type);
    return { customPlayed: false, note: 'Playing default system chime' };
  }

  const base = await getApiBaseUrl();
  const uri = rawUrl.startsWith('http') ? rawUrl : `${base}${rawUrl}`;

  // On Web, use standard HTML5 Audio with instant fallback on error
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return new Promise((resolve) => {
      let resolved = false;

      const finishFallback = (msg?: string) => {
        if (resolved) return;
        resolved = true;
        playSyntheticChime(type);
        resolve({ customPlayed: false, note: msg || 'Playing default chime' });
      };

      try {
        const AudioClass = (window as any).Audio;
        if (!AudioClass) {
          return finishFallback();
        }

        const audio = new AudioClass();
        activeWebAudio = audio;

        audio.crossOrigin = 'anonymous';
        audio.preload = 'auto';

        audio.onended = () => {
          if (!resolved) {
            resolved = true;
            resolve({ customPlayed: true });
          }
        };

        audio.onerror = () => {
          finishFallback('Audio could not be loaded; playing default chime');
        };

        // Autoplay timeout guard (if browser blocks or network stalls)
        const timeout = setTimeout(() => {
          if (!resolved && (!audio || audio.paused)) {
            finishFallback();
          }
        }, 3000);

        audio.src = uri;
        const playPromise = audio.play();
        if (playPromise !== undefined && typeof playPromise.then === 'function') {
          playPromise
            .then(() => {
              clearTimeout(timeout);
              if (!resolved) {
                resolved = true;
                resolve({ customPlayed: true });
              }
            })
            .catch(() => {
              clearTimeout(timeout);
              finishFallback();
            });
        }
      } catch {
        finishFallback();
      }
    });
  }

  // On Native (Android / iOS)
  try {
    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true },
      undefined,
      false
    );
    activeSound = sound;
    return { customPlayed: true };
  } catch {
    return { customPlayed: false, note: 'Failed to play custom tone' };
  }
}
