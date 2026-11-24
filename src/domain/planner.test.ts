import { describe, expect, it } from "vitest";
import type { AppState, SetLog, SetTarget, WorkoutSession } from "./models";
import {
  adaptRemainingSets,
  applyBaselineTest,
  applyMaxTest,
  buildSessionPlan,
  computeNextMax,
  computeRetestMax,
  currentSetTarget,
  evaluateSession,
  finishSession,
  getNextSlot,
  isRetestSlot,
  isStrugglingSet,
  logSet,
  normalizeMax,
  planNextSession,
  reduceTarget,
  shouldSuggestEasierVariant,
  slotFromIndex,
  startSession,
} from "./planner";

const NOW = new Date("2026-01-01T10:00:00.000Z");

function log(targetReps: number, actualReps: number, cleanForm = true, setIndex = 1): SetLog {
  return {
    setIndex,
    targetReps,
    actualReps,
    cleanForm,
    restSecondsPlanned: 90,
    completedAt: NOW.toISOString(),
  };
}

function session(partial: Partial<WorkoutSession> & Pick<WorkoutSession, "startingMax" | "endingMax" | "sets">): WorkoutSession {
  return {
    id: Math.random().toString(36).slice(2),
    date: NOW.toISOString(),
    week: 1,
    sessionInWeek: 1,
    isRetest: false,
    ...partial,
  };
}

function emptyState(): AppState {
  return {
    schemaVersion: 2,
    variant: "standard",
    baselineMax: null,
    currentMax: null,
    sessions: [],
    cycleStartIndex: 0,
    cycle: 1,
    maxTests: [],
  };
}

const cleanSets = (target: number, n = 4) => Array.from({ length: n }, (_, i) => log(target, target, true, i + 1));

describe("Basiswert", () => {
  it("setzt baselineMax und currentMax mit Minimum 3", () => {
    expect(applyBaselineTest(emptyState(), 12, "incline", "b", NOW)).toMatchObject({
      variant: "incline",
      baselineMax: 12,
      currentMax: 12,
    });
    expect(applyBaselineTest(emptyState(), 1, "knees", "b", NOW)).toMatchObject({ baselineMax: 3, currentMax: 3 });
    expect(normalizeMax(0)).toBe(3);
    expect(normalizeMax(Number.NaN)).toBe(3);
    expect(normalizeMax(7.6)).toBe(8);
  });

  it("empfiehlt leichtere Variante nur bei klassisch < 8", () => {
    expect(shouldSuggestEasierVariant("standard", 7)).toBe(true);
    expect(shouldSuggestEasierVariant("standard", 8)).toBe(false);
    expect(shouldSuggestEasierVariant("knees", 3)).toBe(false);
    expect(shouldSuggestEasierVariant("incline", 5)).toBe(false);
  });

  it("generiert nach dem Basiswert sofort Woche 1, Einheit 1", () => {
    expect(planNextSession(emptyState())).toBeNull();
    const plan = planNextSession(applyBaselineTest(emptyState(), 15, "standard", "b", NOW));
    expect(plan).toMatchObject({ week: 1, sessionInWeek: 1, isRetest: false, effectiveMax: 15 });
    expect(plan!.sets).toHaveLength(4);
  });
});

describe("Plan-Generierung Wochen 1–4", () => {
  const cases: Array<{ max: number; w1: number; w2: number; w3: number; w4: number }> = [
    { max: 3, w1: 2, w2: 2, w3: 2, w4: 2 },
    { max: 6, w1: 3, w2: 4, w3: 4, w4: 4 },
    { max: 15, w1: 8, w2: 10, w3: 11, w4: 11 },
    { max: 30, w1: 17, w2: 20, w3: 21, w4: 21 },
  ];

  for (const c of cases) {
    it(`max ${c.max}`, () => {
      const expectations = [
        { week: 1, sets: 4, reps: c.w1, rest: 90 },
        { week: 2, sets: 4, reps: c.w2, rest: 90 },
        { week: 3, sets: 5, reps: c.w3, rest: 105 },
      ] as const;
      for (const e of expectations) {
        for (const sessionInWeek of [1, 2, 3] as const) {
          const plan = buildSessionPlan({ week: e.week, sessionInWeek }, c.max);
          expect(plan.isRetest).toBe(false);
          expect(plan.sets).toHaveLength(e.sets);
          expect(plan.sets.map((s) => s.targetReps)).toEqual(Array(e.sets).fill(e.reps));
          expect(plan.sets.every((s) => s.restSeconds === e.rest)).toBe(true);
          expect(plan.sets.map((s) => s.setIndex)).toEqual(Array.from({ length: e.sets }, (_, i) => i + 1));
        }
      }
      for (const sessionInWeek of [1, 2] as const) {
        const plan = buildSessionPlan({ week: 4, sessionInWeek }, c.max);
        expect(plan.isRetest).toBe(false);
        expect(plan.sets).toHaveLength(3);
        expect(plan.sets.every((s) => s.targetReps === c.w4 && s.restSeconds === 120)).toBe(true);
      }
    });
  }

  it("Ziel-Wiederholungen nie unter 2, auch bei ungültigem Max", () => {
    const plan = buildSessionPlan({ week: 1, sessionInWeek: 1 }, 0);
    expect(plan.effectiveMax).toBe(3);
    expect(plan.sets.every((s) => s.targetReps >= 2)).toBe(true);
  });
});

describe("Retest-Erkennung", () => {
  it("nur Woche 4, Einheit 3 ist Retest", () => {
    for (let i = 0; i < 12; i++) {
      const slot = slotFromIndex(i);
      expect(isRetestSlot(slot.week, slot.sessionInWeek)).toBe(i === 11);
    }
  });

  it("Retest-Plan enthält einen Max-Satz ohne Pause", () => {
    const plan = buildSessionPlan({ week: 4, sessionInWeek: 3 }, 20);
    expect(plan.isRetest).toBe(true);
    expect(plan.sets).toEqual([{ setIndex: 1, targetReps: 20, restSeconds: 0 }]);
  });

  it("Retest übernimmt den besten Satz als neuen Max (min. 3)", () => {
    expect(computeRetestMax([log(20, 24)])).toBe(24);
    expect(computeRetestMax([log(20, 1)])).toBe(3);
    expect(computeRetestMax([])).toBe(3);
  });
});

describe("Zyklus-Position", () => {
  it("bildet Indizes auf Woche/Einheit ab", () => {
    expect(slotFromIndex(0)).toEqual({ week: 1, sessionInWeek: 1 });
    expect(slotFromIndex(2)).toEqual({ week: 1, sessionInWeek: 3 });
    expect(slotFromIndex(3)).toEqual({ week: 2, sessionInWeek: 1 });
    expect(slotFromIndex(10)).toEqual({ week: 4, sessionInWeek: 2 });
    expect(slotFromIndex(11)).toEqual({ week: 4, sessionInWeek: 3 });
  });

  it("zählt Einheiten ab dem Zyklusbeginn", () => {
    const regular = (n: number) => Array.from({ length: n }, () => session({ startingMax: 10, endingMax: 10, sets: [] }));
    expect(getNextSlot({ sessions: [], cycleStartIndex: 0 })).toEqual({ week: 1, sessionInWeek: 1 });
    expect(getNextSlot({ sessions: regular(4), cycleStartIndex: 0 })).toEqual({ week: 2, sessionInWeek: 2 });
    expect(getNextSlot({ sessions: regular(11), cycleStartIndex: 0 })).toEqual({ week: 4, sessionInWeek: 3 });
    expect(getNextSlot({ sessions: regular(12), cycleStartIndex: 12 })).toEqual({ week: 1, sessionInWeek: 1 });
    expect(getNextSlot({ sessions: regular(15), cycleStartIndex: 12 })).toEqual({ week: 2, sessionInWeek: 1 });
  });
});

describe("adaptRemainingSets (innerhalb einer Einheit)", () => {
  const remaining: SetTarget[] = [
    { setIndex: 2, targetReps: 10, restSeconds: 90 },
    { setIndex: 3, targetReps: 10, restSeconds: 90 },
    { setIndex: 4, targetReps: 3, restSeconds: 90 },
  ];

  it("reduziert bei unsauberer Technik um ~20 %", () => {
    const adapted = adaptRemainingSets(remaining, log(10, 10, false));
    expect(adapted.map((s) => s.targetReps)).toEqual([8, 8, 2]);
    expect(adapted.map((s) => s.setIndex)).toEqual([2, 3, 4]);
  });

  it("reduziert bei deutlichem Unterschreiten (actual < target - 1)", () => {
    expect(adaptRemainingSets(remaining, log(10, 8)).map((s) => s.targetReps)).toEqual([8, 8, 2]);
  });

  it("toleriert 1 Wiederholung unter Ziel", () => {
    expect(isStrugglingSet(log(10, 9))).toBe(false);
    expect(adaptRemainingSets(remaining, log(10, 9))).toEqual(remaining);
  });

  it("regelt bei Übererfüllung nicht hoch", () => {
    expect(adaptRemainingSets(remaining, log(10, 15))).toEqual(remaining);
  });

  it("verändert die Eingabe nicht", () => {
    const copy = structuredClone(remaining);
    adaptRemainingSets(remaining, log(10, 0, false));
    expect(remaining).toEqual(copy);
  });

  it("reduceTarget hält Minimum 2", () => {
    expect(reduceTarget(2)).toBe(2);
    expect(reduceTarget(3)).toBe(2);
    expect(reduceTarget(12)).toBe(9);
    expect(reduceTarget(21)).toBe(16);
  });
});

describe("computeNextMax (nach einer Einheit)", () => {
  it("+1 bei komplett sauberer Einheit mit erreichten Zielen", () => {
    expect(evaluateSession(cleanSets(8))).toBe("progress");
    expect(computeNextMax(15, cleanSets(8))).toBe(16);
    expect(computeNextMax(15, [log(8, 10), log(8, 9), log(8, 8), log(8, 8)])).toBe(16);
  });

  it("-1 bei mindestens 2 Einbruch-Sätzen (min. 3)", () => {
    const sets = [log(8, 8), log(8, 8, false), log(8, 5), log(8, 8)];
    expect(evaluateSession(sets)).toBe("regress");
    expect(computeNextMax(15, sets)).toBe(14);
    expect(computeNextMax(3, sets)).toBe(3);
  });

  it("unverändert bei teils sauberer Einheit", () => {
    const oneBad = [log(8, 8), log(8, 8, false), log(8, 8), log(8, 8)];
    expect(evaluateSession(oneBad)).toBe("hold");
    expect(computeNextMax(15, oneBad)).toBe(15);
    const slightlyShort = [log(8, 8), log(8, 7), log(8, 7), log(8, 8)];
    expect(evaluateSession(slightlyShort)).toBe("hold");
    expect(computeNextMax(15, slightlyShort)).toBe(15);
    expect(evaluateSession([])).toBe("hold");
  });

  it("bei startingMax < 10 nur jede 2. saubere Einheit +1", () => {
    const first = computeNextMax(6, cleanSets(3));
    expect(first).toBe(6);
    const banked = session({ startingMax: 6, endingMax: first, sets: cleanSets(3) });
    expect(computeNextMax(6, cleanSets(3), [banked])).toBe(7);
    const rewarded = session({ startingMax: 6, endingMax: 7, sets: cleanSets(3) });
    expect(computeNextMax(7, cleanSets(4), [banked, rewarded])).toBe(7);
    const notClean = session({ startingMax: 6, endingMax: 6, sets: [log(3, 3, false), ...cleanSets(3, 3)] });
    expect(computeNextMax(6, cleanSets(3), [notClean])).toBe(6);
  });

  it("ignoriert Retests bei der Suche nach der vorherigen Einheit", () => {
    const banked = session({ startingMax: 6, endingMax: 6, sets: cleanSets(3) });
    const retest = session({ isRetest: true, startingMax: 6, endingMax: 6, sets: [log(6, 6)] });
    expect(computeNextMax(6, cleanSets(3), [banked, retest])).toBe(7);
  });
});

describe("Ablauf einer Einheit", () => {
  it("loggt Sätze, passt an und schließt ab", () => {
    let state = applyBaselineTest(emptyState(), 15, "standard", "b", NOW);
    const plan = planNextSession(state)!;
    let active = startSession(plan, "s1", NOW);
    expect(currentSetTarget(active)).toEqual({ setIndex: 1, targetReps: 8, restSeconds: 90 });

    active = logSet(active, { actualReps: 8, cleanForm: true }, NOW);
    expect(active.plannedSets.map((s) => s.targetReps)).toEqual([8, 8, 8, 8]);
    active = logSet(active, { actualReps: 5, cleanForm: true }, NOW);
    expect(active.plannedSets.map((s) => s.targetReps)).toEqual([8, 8, 6, 6]);
    active = logSet(active, { actualReps: 6, cleanForm: false }, NOW);
    expect(active.plannedSets.map((s) => s.targetReps)).toEqual([8, 8, 6, 4]);
    active = logSet(active, { actualReps: 4, cleanForm: true }, NOW);
    expect(currentSetTarget(active)).toBeNull();
    expect(logSet(active, { actualReps: 4, cleanForm: true }, NOW)).toBe(active);
    expect(active.logs.map((l) => l.targetReps)).toEqual([8, 8, 6, 4]);

    state = finishSession(state, active, NOW);
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0]).toMatchObject({ week: 1, sessionInWeek: 1, startingMax: 15, endingMax: 14 });
    expect(state.currentMax).toBe(14);
    expect(getNextSlot(state)).toEqual({ week: 1, sessionInWeek: 2 });
  });

  it("Retest-Einheit setzt currentMax auf das Testergebnis", () => {
    let state = applyBaselineTest(emptyState(), 10, "standard", "b", NOW);
    for (let i = 0; i < 11; i++) {
      const plan = planNextSession(state)!;
      let active = startSession(plan, `s${i}`, NOW);
      for (const s of plan.sets) active = logSet(active, { actualReps: s.targetReps, cleanForm: true }, NOW);
      state = finishSession(state, active, NOW);
    }
    expect(state.currentMax).toBe(21);
    const retestPlan = planNextSession(state)!;
    expect(retestPlan.isRetest).toBe(true);
    const active = logSet(startSession(retestPlan, "retest", NOW), { actualReps: 18, cleanForm: true }, NOW);
    state = finishSession(state, active, NOW);
    expect(state.currentMax).toBe(18);
    expect(state.cycle).toBe(2);
    expect(state.cycleStartIndex).toBe(12);
    expect(planNextSession(state)).toMatchObject({ week: 1, sessionInWeek: 1, effectiveMax: 18 });
  });
});

describe("Plan neu starten", () => {
  function stateAfter(sessions: number): AppState {
    let state = applyBaselineTest(emptyState(), 12, "standard", "b0", NOW);
    for (let i = 0; i < sessions; i++) {
      const plan = planNextSession(state)!;
      let active = startSession(plan, `s${i}`, NOW);
      for (const s of plan.sets) active = logSet(active, { actualReps: s.targetReps, cleanForm: true }, NOW);
      state = finishSession(state, active, NOW);
    }
    return state;
  }

  it("startet mitten im Zyklus neu bei Woche 1, Einheit 1 mit neuem Basiswert und Variante", () => {
    const before = stateAfter(5);
    expect(getNextSlot(before)).toEqual({ week: 2, sessionInWeek: 3 });
    const after = applyBaselineTest(before, 6, "incline", "b1", NOW);
    expect(after).toMatchObject({ variant: "incline", baselineMax: 6, currentMax: 6, cycle: 2, cycleStartIndex: 5 });
    expect(after.sessions).toHaveLength(5); // Verlauf bleibt erhalten
    expect(planNextSession(after)).toMatchObject({ week: 1, sessionInWeek: 1, effectiveMax: 6 });
    expect(after.maxTests.map((t) => [t.kind, t.previousMax, t.newMax])).toEqual([
      ["baseline", null, 12],
      ["baseline", 17, 6],
    ]);
  });

  it("zählt einen Neustart ohne absolvierte Einheit nicht als neuen Zyklus", () => {
    const after = applyBaselineTest(stateAfter(0), 20, "standard", "b1", NOW);
    expect(after).toMatchObject({ cycle: 1, cycleStartIndex: 0, baselineMax: 20 });
  });
});

describe("Freie Max-Messung", () => {
  it("setzt currentMax, lässt Zyklus-Position und Basiswert unverändert", () => {
    let state = applyBaselineTest(emptyState(), 15, "knees", "b", NOW);
    const plan = planNextSession(state)!;
    let active = startSession(plan, "s1", NOW);
    for (const s of plan.sets) active = logSet(active, { actualReps: s.targetReps, cleanForm: true }, NOW);
    state = finishSession(state, active, NOW);

    const tested = applyMaxTest(state, 20, "t1", NOW)!;
    expect(tested).toMatchObject({ currentMax: 20, baselineMax: 15, cycle: 1, cycleStartIndex: 0 });
    expect(tested.maxTests.at(-1)).toEqual({
      id: "t1",
      date: NOW.toISOString(),
      kind: "test",
      variant: "knees",
      reps: 20,
      previousMax: 16,
      newMax: 20,
    });
    expect(planNextSession(tested)).toMatchObject({ week: 1, sessionInWeek: 2, effectiveMax: 20 });
  });

  it("kann den Max-Wert auch senken (min. 3)", () => {
    const state = applyBaselineTest(emptyState(), 15, "standard", "b", NOW);
    expect(applyMaxTest(state, 9, "t", NOW)!.currentMax).toBe(9);
    expect(applyMaxTest(state, 1, "t", NOW)!.maxTests.at(-1)).toMatchObject({ reps: 1, newMax: 3 });
  });

  it("ist ohne Basiswert nicht möglich", () => {
    expect(applyMaxTest(emptyState(), 10, "t", NOW)).toBeNull();
  });
});
