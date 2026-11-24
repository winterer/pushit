export type PushupVariant = "standard" | "incline" | "knees";

export type WeekNumber = 1 | 2 | 3 | 4;
export type SessionInWeek = 1 | 2 | 3;

export interface SetTarget {
  setIndex: number; // 1-basiert
  targetReps: number;
  restSeconds: number;
}

export interface SetLog {
  setIndex: number;
  targetReps: number;
  actualReps: number;
  cleanForm: boolean;
  restSecondsPlanned: number;
  completedAt: string; // ISO-8601
}

export interface WorkoutSession {
  id: string;
  date: string; // ISO-8601
  week: WeekNumber;
  sessionInWeek: SessionInWeek;
  isRetest: boolean;
  startingMax: number;
  endingMax: number;
  sets: SetLog[];
}

export interface AppState {
  schemaVersion: 1;
  variant: PushupVariant;
  baselineMax: number | null;
  currentMax: number | null;
  sessions: WorkoutSession[];
}

/** Position einer Einheit im 4-Wochen-Zyklus. */
export interface SessionSlot {
  week: WeekNumber;
  sessionInWeek: SessionInWeek;
}

/** Vorab berechneter Plan einer Einheit. */
export interface SessionPlan extends SessionSlot {
  isRetest: boolean;
  effectiveMax: number;
  sets: SetTarget[];
}

/**
 * Laufende (noch nicht abgeschlossene) Einheit. Wird separat vom AppState
 * persistiert, damit geloggte Sätze einen Reload überstehen.
 */
export interface ActiveSession extends SessionSlot {
  id: string;
  startedAt: string; // ISO-8601
  isRetest: boolean;
  startingMax: number;
  /** Aktuelle (ggf. dynamisch reduzierte) Ziele aller Sätze. */
  plannedSets: SetTarget[];
  logs: SetLog[];
}

export const VARIANT_LABELS: Record<PushupVariant, string> = {
  standard: "Klassisch (Boden)",
  incline: "Erhöht (Bank/Stufe)",
  knees: "Knie-Liegestütze",
};
