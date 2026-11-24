import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Reine Timer-Logik (zeitstempelbasiert, testbar)
// ---------------------------------------------------------------------------

export type TimerStatus = "idle" | "running" | "paused" | "finished";

export interface TimerState {
  status: TimerStatus;
  /** Absoluter Endzeitpunkt (ms, Date.now()-Basis) während status === "running". */
  endsAt: number | null;
  /** Restzeit in ms, eingefroren während status === "paused". */
  pausedRemainingMs: number;
  totalSeconds: number;
}

export const IDLE_TIMER: TimerState = { status: "idle", endsAt: null, pausedRemainingMs: 0, totalSeconds: 0 };

export function startTimer(seconds: number, now: number): TimerState {
  const s = Math.max(0, seconds);
  return { status: "running", endsAt: now + s * 1000, pausedRemainingMs: 0, totalSeconds: s };
}

export function remainingMs(t: TimerState, now: number): number {
  if (t.status === "running" && t.endsAt !== null) return Math.max(0, t.endsAt - now);
  if (t.status === "paused") return t.pausedRemainingMs;
  return 0;
}

export function pauseTimer(t: TimerState, now: number): TimerState {
  if (t.status !== "running") return t;
  return { ...t, status: "paused", endsAt: null, pausedRemainingMs: remainingMs(t, now) };
}

export function resumeTimer(t: TimerState, now: number): TimerState {
  if (t.status !== "paused") return t;
  return { ...t, status: "running", endsAt: now + t.pausedRemainingMs, pausedRemainingMs: 0 };
}

/** Verlängert/verkürzt die laufende oder pausierte Pause (nie unter 0). */
export function adjustTimer(t: TimerState, deltaSeconds: number, now: number): TimerState {
  const delta = deltaSeconds * 1000;
  const totalSeconds = Math.max(0, t.totalSeconds + deltaSeconds);
  if (t.status === "running" && t.endsAt !== null) {
    return { ...t, totalSeconds, endsAt: Math.max(now, t.endsAt + delta) };
  }
  if (t.status === "paused") {
    return { ...t, totalSeconds, pausedRemainingMs: Math.max(0, t.pausedRemainingMs + delta) };
  }
  return t;
}

/** Markiert einen abgelaufenen Timer als beendet. */
export function tickTimer(t: TimerState, now: number): TimerState {
  if (t.status === "running" && remainingMs(t, now) <= 0) {
    return { ...t, status: "finished", endsAt: null, pausedRemainingMs: 0 };
  }
  return t;
}

// ---------------------------------------------------------------------------
// Signal (Web Audio + Vibration)
// ---------------------------------------------------------------------------

type AudioCtor = typeof AudioContext;

function getAudioCtor(): AudioCtor | undefined {
  const w = window as Window & { webkitAudioContext?: AudioCtor };
  return window.AudioContext ?? w.webkitAudioContext;
}

function playBeep(ctx: AudioContext): void {
  const t0 = ctx.currentTime;
  [0, 0.25, 0.5].forEach((offset, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = i === 2 ? 1320 : 880;
    gain.gain.setValueAtTime(0.0001, t0 + offset);
    gain.gain.exponentialRampToValueAtTime(0.4, t0 + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0 + offset);
    osc.stop(t0 + offset + 0.2);
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface RestTimer {
  status: TimerStatus;
  remainingSeconds: number;
  totalSeconds: number;
  start: (seconds: number) => void;
  pause: () => void;
  resume: () => void;
  adjust: (deltaSeconds: number) => void;
  skip: () => void;
  reset: () => void;
}

export function useRestTimer(options: { sound?: boolean; vibrate?: boolean } = {}): RestTimer {
  const { sound = true, vibrate = true } = options;
  const [timer, setTimer] = useState<TimerState>(IDLE_TIMER);
  const [now, setNow] = useState(() => Date.now());
  const audioRef = useRef<AudioContext | null>(null);

  // AudioContext muss in einer Nutzer-Geste erzeugt/fortgesetzt werden (iOS/Safari).
  const unlockAudio = useCallback(() => {
    if (!sound) return;
    try {
      if (!audioRef.current) {
        const Ctor = getAudioCtor();
        if (Ctor) audioRef.current = new Ctor();
      }
      void audioRef.current?.resume();
    } catch {
      audioRef.current = null;
    }
  }, [sound]);

  // Tick nur solange der Timer läuft; Restzeit wird stets aus dem Zeitstempel berechnet.
  useEffect(() => {
    if (timer.status !== "running") return;
    const update = () => setNow(Date.now());
    update();
    const id = window.setInterval(update, 250);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", update);
    };
  }, [timer.status]);

  // Ablauf erkennen und Signal geben.
  useEffect(() => {
    const next = tickTimer(timer, now);
    if (next === timer) return;
    setTimer(next);
    if (sound && audioRef.current) {
      try {
        playBeep(audioRef.current);
      } catch {
        // Audio nicht verfügbar – ignorieren
      }
    }
    if (vibrate && "vibrate" in navigator) navigator.vibrate([200, 100, 200]);
  }, [timer, now, sound, vibrate]);

  useEffect(() => () => void audioRef.current?.close().catch(() => undefined), []);

  const start = useCallback(
    (seconds: number) => {
      unlockAudio();
      const t = Date.now();
      setNow(t);
      setTimer(startTimer(seconds, t));
    },
    [unlockAudio],
  );
  const pause = useCallback(() => setTimer((t) => pauseTimer(t, Date.now())), []);
  const resume = useCallback(() => {
    unlockAudio();
    const t = Date.now();
    setNow(t);
    setTimer((s) => resumeTimer(s, t));
  }, [unlockAudio]);
  const adjust = useCallback((delta: number) => {
    const t = Date.now();
    setNow(t);
    setTimer((s) => adjustTimer(s, delta, t));
  }, []);
  const skip = useCallback(() => setTimer(IDLE_TIMER), []);

  return {
    status: timer.status,
    remainingSeconds: Math.ceil(remainingMs(timer, now) / 1000),
    totalSeconds: timer.totalSeconds,
    start,
    pause,
    resume,
    adjust,
    skip,
    reset: skip,
  };
}
