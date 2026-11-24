import { describe, expect, it } from "vitest";
import type { ActiveSession, AppState } from "../domain/models";
import {
  ACTIVE_SESSION_KEY,
  STATE_KEY,
  clearAll,
  createInitialState,
  exportStateJson,
  loadActiveSession,
  loadState,
  parseImportedJson,
  saveActiveSession,
  saveState,
  type KeyValueStorage,
} from "./workoutStore";

class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const sample: AppState = {
  schemaVersion: 1,
  variant: "incline",
  baselineMax: 10,
  currentMax: 11,
  sessions: [
    {
      id: "a",
      date: "2026-01-01T10:00:00.000Z",
      week: 1,
      sessionInWeek: 1,
      isRetest: false,
      startingMax: 10,
      endingMax: 11,
      sets: [
        { setIndex: 1, targetReps: 6, actualReps: 6, cleanForm: true, restSecondsPlanned: 90, completedAt: "2026-01-01T10:01:00.000Z" },
      ],
    },
  ],
};

describe("workoutStore", () => {
  it("liefert Initialzustand bei leerem Speicher", () => {
    expect(loadState(new MemoryStorage())).toEqual({ state: createInitialState() });
    expect(loadState(null).state).toEqual(createInitialState());
  });

  it("speichert und lädt den State (Roundtrip)", () => {
    const s = new MemoryStorage();
    expect(saveState(sample, s)).toBe(true);
    expect(loadState(s)).toEqual({ state: sample });
  });

  it("fällt bei korruptem JSON zurück und sichert die Rohdaten", () => {
    const s = new MemoryStorage();
    s.setItem(STATE_KEY, "{kaputt");
    const res = loadState(s);
    expect(res.state).toEqual(createInitialState());
    expect(res.recoveredFromError).toBeDefined();
    expect([...s.data.keys()].some((k) => k.startsWith(`${STATE_KEY}.corrupt-`))).toBe(true);
  });

  it("fällt bei schemawidrigen Daten zurück", () => {
    const s = new MemoryStorage();
    s.setItem(STATE_KEY, JSON.stringify({ ...sample, variant: "one-arm" }));
    expect(loadState(s).recoveredFromError).toMatch(/Variante/);
  });

  it("migriert Daten ohne schemaVersion", () => {
    const s = new MemoryStorage();
    const { schemaVersion: _omit, ...legacy } = sample;
    s.setItem(STATE_KEY, JSON.stringify(legacy));
    expect(loadState(s).state).toEqual(sample);
  });

  it("Export/Import-Roundtrip und Validierung", () => {
    expect(parseImportedJson(exportStateJson(sample))).toEqual({ ok: true, state: sample });
    expect(parseImportedJson("nope").ok).toBe(false);
    expect(parseImportedJson(JSON.stringify({ ...sample, schemaVersion: 2 })).ok).toBe(false);
    expect(parseImportedJson(JSON.stringify({ ...sample, baselineMax: null })).ok).toBe(false);
    const badSet = structuredClone(sample);
    (badSet.sessions[0]!.sets[0] as unknown as Record<string, unknown>).actualReps = "6";
    expect(parseImportedJson(JSON.stringify(badSet))).toEqual({ ok: false, error: "Einheit #1 ist ungültig." });
  });

  it("persistiert die laufende Einheit separat", () => {
    const s = new MemoryStorage();
    const active: ActiveSession = {
      id: "x",
      startedAt: "2026-01-01T10:00:00.000Z",
      week: 2,
      sessionInWeek: 1,
      isRetest: false,
      startingMax: 10,
      plannedSets: [{ setIndex: 1, targetReps: 7, restSeconds: 90 }],
      logs: [],
    };
    saveActiveSession(active, s);
    expect(loadActiveSession(s)).toEqual(active);
    s.setItem(ACTIVE_SESSION_KEY, "{");
    expect(loadActiveSession(s)).toBeNull();
    saveActiveSession(null, s);
    expect(s.getItem(ACTIVE_SESSION_KEY)).toBeNull();
  });

  it("clearAll entfernt alle Daten", () => {
    const s = new MemoryStorage();
    saveState(sample, s);
    clearAll(s);
    expect(s.getItem(STATE_KEY)).toBeNull();
  });
});
