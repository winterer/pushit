import { describe, expect, it } from "vitest";
import { IDLE_TIMER, adjustTimer, pauseTimer, remainingMs, resumeTimer, startTimer, tickTimer } from "./useRestTimer";

describe("Rest-Timer-Logik (zeitstempelbasiert)", () => {
  it("berechnet die Restzeit aus dem Endzeitpunkt (übersteht Tab-Wechsel)", () => {
    const t = startTimer(90, 1_000);
    expect(remainingMs(t, 1_000)).toBe(90_000);
    // 60 s ohne Ticks vergangen (z. B. Display gesperrt)
    expect(remainingMs(t, 61_000)).toBe(30_000);
    expect(remainingMs(t, 200_000)).toBe(0);
  });

  it("pausiert und setzt fort", () => {
    let t = startTimer(90, 0);
    t = pauseTimer(t, 30_000);
    expect(t.status).toBe("paused");
    expect(remainingMs(t, 500_000)).toBe(60_000);
    t = resumeTimer(t, 500_000);
    expect(remainingMs(t, 510_000)).toBe(50_000);
    expect(pauseTimer(IDLE_TIMER, 0)).toBe(IDLE_TIMER);
    expect(resumeTimer(t, 0)).toBe(t);
  });

  it("±15 s, nie negativ", () => {
    let t = startTimer(90, 0);
    t = adjustTimer(t, 15, 0);
    expect(remainingMs(t, 0)).toBe(105_000);
    expect(t.totalSeconds).toBe(105);
    t = adjustTimer(t, -15, 100_000);
    expect(remainingMs(t, 100_000)).toBe(0);
    const p = adjustTimer(pauseTimer(startTimer(10, 0), 0), -15, 0);
    expect(p.pausedRemainingMs).toBe(0);
    expect(adjustTimer(IDLE_TIMER, 15, 0)).toBe(IDLE_TIMER);
  });

  it("wechselt bei Ablauf auf finished", () => {
    const t = startTimer(5, 0);
    expect(tickTimer(t, 4_999)).toBe(t);
    expect(tickTimer(t, 5_000).status).toBe("finished");
  });
});
