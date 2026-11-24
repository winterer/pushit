import type {
  ActiveSession,
  AppState,
  MaxTest,
  PushupVariant,
  SetLog,
  SetTarget,
  WorkoutSession,
} from "../domain/models";

export const STATE_KEY = "pushit.state";
export const ACTIVE_SESSION_KEY = "pushit.activeSession";

/** Minimales Storage-Interface (erleichtert Tests ohne Browser). */
export const CURRENT_SCHEMA_VERSION = 2;

export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function createInitialState(): AppState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    variant: "standard",
    baselineMax: null,
    currentMax: null,
    sessions: [],
    cycleStartIndex: 0,
    cycle: 1,
    maxTests: [],
  };
}

// ---------------------------------------------------------------------------
// Validierung
// ---------------------------------------------------------------------------

const VARIANTS: readonly PushupVariant[] = ["standard", "incline", "knees"];

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min = 0): v is number => typeof v === "number" && Number.isInteger(v) && v >= min;
const isIsoDate = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));
const isNullableMax = (v: unknown): v is number | null => v === null || isInt(v, 1);
const isWeek = (v: unknown) => isInt(v, 1) && v <= 4;
const isSessionInWeek = (v: unknown) => isInt(v, 1) && v <= 3;

function isSetTarget(v: unknown): v is SetTarget {
  return isObj(v) && isInt(v.setIndex, 1) && isInt(v.targetReps) && isInt(v.restSeconds);
}

function isSetLog(v: unknown): v is SetLog {
  return (
    isObj(v) &&
    isInt(v.setIndex, 1) &&
    isInt(v.targetReps) &&
    isInt(v.actualReps) &&
    typeof v.cleanForm === "boolean" &&
    isInt(v.restSecondsPlanned) &&
    isIsoDate(v.completedAt)
  );
}

function isWorkoutSession(v: unknown): v is WorkoutSession {
  return (
    isObj(v) &&
    typeof v.id === "string" &&
    v.id.length > 0 &&
    isIsoDate(v.date) &&
    isWeek(v.week) &&
    isSessionInWeek(v.sessionInWeek) &&
    typeof v.isRetest === "boolean" &&
    isInt(v.startingMax, 1) &&
    isInt(v.endingMax, 1) &&
    Array.isArray(v.sets) &&
    v.sets.every(isSetLog)
  );
}

function isMaxTest(v: unknown): v is MaxTest {
  return (
    isObj(v) &&
    typeof v.id === "string" &&
    isIsoDate(v.date) &&
    (v.kind === "baseline" || v.kind === "test") &&
    VARIANTS.includes(v.variant as PushupVariant) &&
    isInt(v.reps) &&
    isNullableMax(v.previousMax) &&
    isInt(v.newMax, 1)
  );
}

export type ValidationResult = { ok: true; state: AppState } | { ok: false; error: string };

/** Prüft ein (z. B. importiertes) Objekt gegen das aktuelle AppState-Schema. */
export function validateAppState(data: unknown): ValidationResult {
  if (!isObj(data)) return { ok: false, error: "Kein gültiges JSON-Objekt." };
  if (data.schemaVersion !== CURRENT_SCHEMA_VERSION) return { ok: false, error: `Unbekannte Schema-Version: ${String(data.schemaVersion)}` };
  if (!VARIANTS.includes(data.variant as PushupVariant)) return { ok: false, error: "Ungültige Variante." };
  if (!isNullableMax(data.baselineMax)) return { ok: false, error: "Ungültiger baselineMax." };
  if (!isNullableMax(data.currentMax)) return { ok: false, error: "Ungültiger currentMax." };
  if ((data.baselineMax === null) !== (data.currentMax === null)) {
    return { ok: false, error: "baselineMax und currentMax müssen beide gesetzt oder beide leer sein." };
  }
  if (!Array.isArray(data.sessions)) return { ok: false, error: "sessions fehlt." };
  const badIndex = data.sessions.findIndex((s) => !isWorkoutSession(s));
  if (badIndex >= 0) return { ok: false, error: `Einheit #${badIndex + 1} ist ungültig.` };
  if (!isInt(data.cycleStartIndex) || data.cycleStartIndex > data.sessions.length) {
    return { ok: false, error: "Ungültiger cycleStartIndex." };
  }
  if (!isInt(data.cycle, 1)) return { ok: false, error: "Ungültige Zyklusnummer." };
  if (!Array.isArray(data.maxTests) || !data.maxTests.every(isMaxTest)) {
    return { ok: false, error: "Ungültige Max-Tests." };
  }

  return {
    ok: true,
    state: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      variant: data.variant as PushupVariant,
      baselineMax: data.baselineMax,
      currentMax: data.currentMax,
      sessions: data.sessions as WorkoutSession[],
      cycleStartIndex: data.cycleStartIndex,
      cycle: data.cycle,
      maxTests: data.maxTests as MaxTest[],
    },
  };
}

export function isActiveSession(v: unknown): v is ActiveSession {
  return (
    isObj(v) &&
    typeof v.id === "string" &&
    isIsoDate(v.startedAt) &&
    isWeek(v.week) &&
    isSessionInWeek(v.sessionInWeek) &&
    typeof v.isRetest === "boolean" &&
    isInt(v.startingMax, 1) &&
    Array.isArray(v.plannedSets) &&
    v.plannedSets.length > 0 &&
    v.plannedSets.every(isSetTarget) &&
    Array.isArray(v.logs) &&
    v.logs.length <= v.plannedSets.length &&
    v.logs.every(isSetLog)
  );
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

/**
 * Überführt gespeicherte Daten schrittweise in das aktuelle Schema.
 * - ohne Version (Vorabversion) → v1
 * - v1 → v2: Zyklusbeginn/-nummer aus den Retest-Einheiten ableiten, leere Max-Test-Historie
 * Ungültige Daten werden unverändert durchgereicht und anschließend von der Validierung abgelehnt.
 */
export function migrate(raw: unknown): unknown {
  if (!isObj(raw)) return raw;
  let data: Obj = raw;
  if (data.schemaVersion === undefined) data = { ...data, schemaVersion: 1 };
  if (data.schemaVersion === 1 && Array.isArray(data.sessions)) {
    const sessions = data.sessions as unknown[];
    const isRetest = (s: unknown) => isObj(s) && s.isRetest === true;
    let lastRetest = -1;
    sessions.forEach((s, i) => {
      if (isRetest(s)) lastRetest = i;
    });
    data = {
      ...data,
      schemaVersion: 2,
      cycleStartIndex: lastRetest + 1,
      cycle: sessions.filter(isRetest).length + 1,
      maxTests: [],
    };
  }
  return data;
}

// ---------------------------------------------------------------------------
// localStorage
// ---------------------------------------------------------------------------

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function readJson(storage: KeyValueStorage, key: string): unknown {
  const raw = storage.getItem(key);
  if (raw === null || raw.trim() === "") return undefined;
  return JSON.parse(raw);
}

export interface LoadResult {
  state: AppState;
  /** Gesetzt, wenn gespeicherte Daten unbrauchbar waren und verworfen wurden. */
  recoveredFromError?: string;
}

/** Lädt den App-State; fällt bei leerem/korruptem Speicher auf den Initialzustand zurück. */
export function loadState(storage: KeyValueStorage | null = defaultStorage()): LoadResult {
  if (!storage) return { state: createInitialState() };
  let raw: unknown;
  try {
    raw = readJson(storage, STATE_KEY);
  } catch {
    backupCorrupt(storage);
    return { state: createInitialState(), recoveredFromError: "Gespeicherte Daten waren beschädigt." };
  }
  if (raw === undefined) return { state: createInitialState() };
  const result = validateAppState(migrate(raw));
  if (!result.ok) {
    backupCorrupt(storage);
    return { state: createInitialState(), recoveredFromError: result.error };
  }
  return { state: result.state };
}

/** Sichert unlesbare Daten unter einem eigenen Schlüssel, statt sie stillschweigend zu verlieren. */
function backupCorrupt(storage: KeyValueStorage): void {
  try {
    const raw = storage.getItem(STATE_KEY);
    if (raw !== null) storage.setItem(`${STATE_KEY}.corrupt-${Date.now()}`, raw);
  } catch {
    // Speicher voll o. Ä. – Backup ist nur Best Effort.
  }
}

export function saveState(state: AppState, storage: KeyValueStorage | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STATE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function loadActiveSession(storage: KeyValueStorage | null = defaultStorage()): ActiveSession | null {
  if (!storage) return null;
  try {
    const raw = readJson(storage, ACTIVE_SESSION_KEY);
    return isActiveSession(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function saveActiveSession(
  active: ActiveSession | null,
  storage: KeyValueStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    if (active) storage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(active));
    else storage.removeItem(ACTIVE_SESSION_KEY);
  } catch {
    // ignorieren – laufende Einheit bleibt im Speicher der App erhalten
  }
}

export function clearAll(storage: KeyValueStorage | null = defaultStorage()): void {
  if (!storage) return;
  storage.removeItem(STATE_KEY);
  storage.removeItem(ACTIVE_SESSION_KEY);
}

// ---------------------------------------------------------------------------
// Export / Import
// ---------------------------------------------------------------------------

export function exportStateJson(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

export function parseImportedJson(text: string): ValidationResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "Datei enthält kein gültiges JSON." };
  }
  return validateAppState(migrate(data));
}

/** Startet im Browser einen Download des App-States als JSON-Datei. */
export function downloadStateJson(state: AppState, now: Date = new Date()): void {
  const blob = new Blob([exportStateJson(state)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pushit-export-${now.toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
