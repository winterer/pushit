import type {
  ActiveSession,
  AppState,
  MaxTest,
  PushupVariant,
  SessionInWeek,
  SessionPlan,
  SessionSlot,
  SetLog,
  SetTarget,
  WeekNumber,
  WorkoutSession,
} from "./models";

/** Untergrenze für jeden Max-Wert. */
export const MIN_MAX = 3;
/** Untergrenze für Ziel-Wiederholungen eines Satzes. */
export const MIN_TARGET_REPS = 2;
/** Unterhalb dieses Wertes (klassisch) empfiehlt die UI eine leichtere Variante. */
export const EASIER_VARIANT_THRESHOLD = 8;
/** Unterhalb dieses startingMax gibt es +1 nur bei jeder 2. sauberen Einheit. */
export const SLOW_PROGRESSION_THRESHOLD = 10;
export const SESSIONS_PER_WEEK = 3;
export const WEEKS_PER_CYCLE = 4;
export const SESSIONS_PER_CYCLE = SESSIONS_PER_WEEK * WEEKS_PER_CYCLE;

interface WeekPrescription {
  sets: number;
  factor: number;
  restSeconds: number;
}

/** Struktur der regulären Einheiten (Woche 4, Einheit 3 ist der Retest). */
const PRESCRIPTIONS: Record<WeekNumber, WeekPrescription> = {
  1: { sets: 4, factor: 0.55, restSeconds: 90 },
  2: { sets: 4, factor: 0.65, restSeconds: 90 },
  3: { sets: 5, factor: 0.7, restSeconds: 105 },
  4: { sets: 3, factor: 0.7, restSeconds: 120 },
};

// ---------------------------------------------------------------------------
// Basiswert
// ---------------------------------------------------------------------------

/** Normalisiert gemessene Wiederholungen zu einem gültigen Max-Wert (>= 3). */
export function normalizeMax(reps: number): number {
  if (!Number.isFinite(reps)) return MIN_MAX;
  return Math.max(MIN_MAX, Math.round(reps));
}

/** Soll die UI eine leichtere Variante (incline/knees) empfehlen? */
export function shouldSuggestEasierVariant(variant: PushupVariant, reps: number): boolean {
  return variant === "standard" && reps < EASIER_VARIANT_THRESHOLD;
}

function maxTestEntry(
  state: AppState,
  kind: MaxTest["kind"],
  reps: number,
  variant: PushupVariant,
  id: string,
  now: Date,
): MaxTest {
  return {
    id,
    date: now.toISOString(),
    kind,
    variant,
    reps: Math.max(0, Math.round(reps)),
    previousMax: state.currentMax,
    newMax: normalizeMax(reps),
  };
}

/**
 * Übernimmt das Ergebnis eines Basiswert-Tests und startet damit einen neuen Plan
 * (Woche 1, Einheit 1). Wird beim Erststart und beim Neustart des Plans genutzt;
 * bisherige Einheiten bleiben als Verlauf erhalten.
 */
export function applyBaselineTest(
  state: AppState,
  reps: number,
  variant: PushupVariant,
  id: string,
  now: Date,
): AppState {
  const entry = maxTestEntry(state, "baseline", reps, variant, id, now);
  // Ein Neustart ohne bereits absolvierte Einheit im Zyklus zählt nicht als neuer Zyklus.
  const cycle = sessionsInCurrentCycle(state) > 0 ? state.cycle + 1 : state.cycle;
  return {
    ...state,
    variant,
    baselineMax: entry.newMax,
    currentMax: entry.newMax,
    cycleStartIndex: state.sessions.length,
    cycle,
    maxTests: [...state.maxTests, entry],
  };
}

/**
 * Freie Max-Messung zu einem beliebigen Zeitpunkt: setzt currentMax auf das
 * Ergebnis (min. 3); die Position im laufenden Zyklus bleibt unverändert.
 */
export function applyMaxTest(state: AppState, reps: number, id: string, now: Date): AppState | null {
  if (state.currentMax === null) return null;
  const entry = maxTestEntry(state, "test", reps, state.variant, id, now);
  return { ...state, currentMax: entry.newMax, maxTests: [...state.maxTests, entry] };
}

// ---------------------------------------------------------------------------
// Zyklus-Position
// ---------------------------------------------------------------------------

export function isRetestSlot(week: WeekNumber, sessionInWeek: SessionInWeek): boolean {
  return week === 4 && sessionInWeek === 3;
}

/** Wandelt einen 0-basierten Index (0..11) in Woche/Einheit um. */
export function slotFromIndex(index: number): SessionSlot {
  const i = ((Math.floor(index) % SESSIONS_PER_CYCLE) + SESSIONS_PER_CYCLE) % SESSIONS_PER_CYCLE;
  return {
    week: (Math.floor(i / SESSIONS_PER_WEEK) + 1) as WeekNumber,
    sessionInWeek: ((i % SESSIONS_PER_WEEK) + 1) as SessionInWeek,
  };
}

/** Anzahl abgeschlossener Einheiten im laufenden Zyklus. */
export function sessionsInCurrentCycle(state: Pick<AppState, "sessions" | "cycleStartIndex">): number {
  return Math.max(0, state.sessions.length - state.cycleStartIndex);
}

/** Nächste anstehende Einheit im laufenden Zyklus. */
export function getNextSlot(state: Pick<AppState, "sessions" | "cycleStartIndex">): SessionSlot {
  return slotFromIndex(sessionsInCurrentCycle(state));
}

// ---------------------------------------------------------------------------
// Plan-Generierung
// ---------------------------------------------------------------------------

export function targetRepsFor(week: WeekNumber, effectiveMax: number): number {
  return Math.max(MIN_TARGET_REPS, Math.round(effectiveMax * PRESCRIPTIONS[week].factor));
}

/**
 * Erzeugt den Plan einer Einheit. Für den Retest (W4/E3) enthält der Plan
 * genau einen Max-Satz, dessen Ziel der bisherige Max-Wert ist.
 */
export function buildSessionPlan(slot: SessionSlot, effectiveMax: number): SessionPlan {
  const max = normalizeMax(effectiveMax);
  if (isRetestSlot(slot.week, slot.sessionInWeek)) {
    return {
      ...slot,
      isRetest: true,
      effectiveMax: max,
      sets: [{ setIndex: 1, targetReps: max, restSeconds: 0 }],
    };
  }
  const p = PRESCRIPTIONS[slot.week];
  const targetReps = targetRepsFor(slot.week, max);
  const sets: SetTarget[] = Array.from({ length: p.sets }, (_, i) => ({
    setIndex: i + 1,
    targetReps,
    restSeconds: p.restSeconds,
  }));
  return { ...slot, isRetest: false, effectiveMax: max, sets };
}

/** Erzeugt den Plan für die nächste anstehende Einheit. */
export function planNextSession(state: AppState): SessionPlan | null {
  if (state.currentMax === null) return null;
  return buildSessionPlan(getNextSlot(state), state.currentMax);
}

// ---------------------------------------------------------------------------
// Anpassung innerhalb einer Einheit
// ---------------------------------------------------------------------------

/** Technik-Einbruch oder deutliches Unterschreiten des Ziels? */
export function isStrugglingSet(log: Pick<SetLog, "cleanForm" | "actualReps" | "targetReps">): boolean {
  return !log.cleanForm || log.actualReps < log.targetReps - 1;
}

export function reduceTarget(targetReps: number): number {
  return Math.max(MIN_TARGET_REPS, Math.floor(targetReps * 0.8));
}

/**
 * Passt die noch ausstehenden Sätze nach einem geloggten Satz an.
 * Bei Technik-Einbruch/deutlichem Unterschreiten werden alle Ziele um ~20 %
 * reduziert; ansonsten bleiben sie unverändert (kein Hochregeln).
 */
export function adaptRemainingSets(remaining: readonly SetTarget[], setLog: SetLog): SetTarget[] {
  if (!isStrugglingSet(setLog)) return remaining.map((s) => ({ ...s }));
  return remaining.map((s) => ({ ...s, targetReps: reduceTarget(s.targetReps) }));
}

// ---------------------------------------------------------------------------
// Anpassung nach Abschluss einer Einheit
// ---------------------------------------------------------------------------

export type SessionOutcome = "progress" | "hold" | "regress";

export function evaluateSession(sets: readonly SetLog[]): SessionOutcome {
  if (sets.length === 0) return "hold";
  const struggling = sets.filter(isStrugglingSet).length;
  if (struggling >= 2) return "regress";
  const allClean = sets.every((s) => s.cleanForm && s.actualReps >= s.targetReps);
  return allClean ? "progress" : "hold";
}

/**
 * Berechnet endingMax einer regulären Einheit.
 *
 * Bei startingMax < 10 gibt es +1 nur bei jeder 2. vollständig sauberen Einheit:
 * War die unmittelbar vorherige reguläre Einheit ebenfalls vollständig sauber und
 * hat sie (wegen dieser Regel) keine Steigerung gebracht, folgt jetzt +1;
 * sonst wird die saubere Einheit nur „angespart“.
 */
export function computeNextMax(
  startingMax: number,
  sets: readonly SetLog[],
  previousSessions: readonly WorkoutSession[] = [],
): number {
  const outcome = evaluateSession(sets);
  if (outcome === "regress") return Math.max(MIN_MAX, startingMax - 1);
  if (outcome === "hold") return startingMax;

  if (startingMax >= SLOW_PROGRESSION_THRESHOLD) return startingMax + 1;

  const lastRegular = [...previousSessions].reverse().find((s) => !s.isRetest);
  const previousWasBanked =
    lastRegular !== undefined &&
    evaluateSession(lastRegular.sets) === "progress" &&
    lastRegular.endingMax === lastRegular.startingMax &&
    lastRegular.startingMax < SLOW_PROGRESSION_THRESHOLD;
  return previousWasBanked ? startingMax + 1 : startingMax;
}

/** Ergebnis des Retests: der saubere Max-Satz wird zum neuen Max-Wert. */
export function computeRetestMax(sets: readonly SetLog[]): number {
  const best = sets.reduce((m, s) => Math.max(m, s.actualReps), 0);
  return normalizeMax(best);
}

// ---------------------------------------------------------------------------
// Laufende Einheit
// ---------------------------------------------------------------------------

export function startSession(plan: SessionPlan, id: string, now: Date): ActiveSession {
  return {
    id,
    startedAt: now.toISOString(),
    week: plan.week,
    sessionInWeek: plan.sessionInWeek,
    isRetest: plan.isRetest,
    startingMax: plan.effectiveMax,
    plannedSets: plan.sets.map((s) => ({ ...s })),
    logs: [],
  };
}

/** Der als Nächstes auszuführende Satz oder null, wenn alle Sätze geloggt sind. */
export function currentSetTarget(active: ActiveSession): SetTarget | null {
  return active.plannedSets[active.logs.length] ?? null;
}

/**
 * Loggt den aktuellen Satz und passt die verbleibenden Sätze an.
 */
export function logSet(
  active: ActiveSession,
  input: { actualReps: number; cleanForm: boolean },
  now: Date,
): ActiveSession {
  const target = currentSetTarget(active);
  if (!target) return active;
  const log: SetLog = {
    setIndex: target.setIndex,
    targetReps: target.targetReps,
    actualReps: Math.max(0, Math.round(input.actualReps)),
    cleanForm: input.cleanForm,
    restSecondsPlanned: target.restSeconds,
    completedAt: now.toISOString(),
  };
  const done = active.logs.length + 1;
  const remaining = adaptRemainingSets(active.plannedSets.slice(done), log);
  return {
    ...active,
    logs: [...active.logs, log],
    plannedSets: [...active.plannedSets.slice(0, done), ...remaining],
  };
}

/** Schließt eine Einheit ab und schreibt sie in den App-State. Nach dem Retest beginnt ein neuer Zyklus. */
export function finishSession(state: AppState, active: ActiveSession, now: Date): AppState {
  const endingMax = active.isRetest
    ? computeRetestMax(active.logs)
    : computeNextMax(active.startingMax, active.logs, state.sessions);
  const session: WorkoutSession = {
    id: active.id,
    date: now.toISOString(),
    week: active.week,
    sessionInWeek: active.sessionInWeek,
    isRetest: active.isRetest,
    startingMax: active.startingMax,
    endingMax,
    sets: active.logs,
  };
  const sessions = [...state.sessions, session];
  return {
    ...state,
    currentMax: endingMax,
    sessions,
    ...(active.isRetest ? { cycleStartIndex: sessions.length, cycle: state.cycle + 1 } : {}),
  };
}
