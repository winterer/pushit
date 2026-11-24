import { useEffect, useMemo, useState } from "react";
import { BaselineTestScreen, type MaxTestMode } from "./components/BaselineTestScreen";
import { ProgressScreen } from "./components/ProgressScreen";
import { WorkoutScreen, type LastEvent } from "./components/WorkoutScreen";
import type { ActiveSession, AppState, PushupVariant } from "./domain/models";
import {
  applyBaselineTest,
  applyMaxTest,
  finishSession,
  logSet,
  planNextSession,
  startSession,
} from "./domain/planner";
import {
  clearAll,
  createInitialState,
  loadActiveSession,
  loadState,
  saveActiveSession,
  saveState,
} from "./storage/workoutStore";

type Tab = "workout" | "progress";
type Theme = "dark" | "light";

const THEME_KEY = "pushit.theme";

function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function App() {
  const [initial] = useState(() => loadState());
  const [state, setState] = useState<AppState>(initial.state);
  const [active, setActive] = useState<ActiveSession | null>(() => loadActiveSession());
  const [warning, setWarning] = useState<string | undefined>(initial.recoveredFromError);
  const [lastEvent, setLastEvent] = useState<LastEvent | null>(null);
  const [tab, setTab] = useState<Tab>("workout");
  /** Geöffneter Test-Dialog: Plan-Neustart oder freier Max-Test. */
  const [testMode, setTestMode] = useState<Exclude<MaxTestMode, "initial"> | null>(null);
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    saveState(state);
  }, [state]);
  useEffect(() => {
    saveActiveSession(active);
  }, [active]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignorieren
    }
  }, [theme]);

  const plan = useMemo(() => planNextSession(state), [state]);

  const handleTestSaved = (reps: number, variant: PushupVariant) => {
    const isMaxTest = testMode === "maxTest";
    const next = isMaxTest
      ? applyMaxTest(state, reps, newId(), new Date())
      : applyBaselineTest(state, reps, variant, newId(), new Date());
    if (!next) return;
    setState(next);
    const test = next.maxTests[next.maxTests.length - 1];
    // Beim Erststart keine Rückmeldung – der neue Plan spricht für sich.
    setLastEvent(test && testMode ? { kind: "maxTest", test } : null);
    setActive(null);
    setTestMode(null);
    setTab("workout");
  };

  const handleStart = () => {
    if (!plan) return;
    setLastEvent(null);
    setActive(startSession(plan, newId(), new Date()));
  };

  const handleFinish = () => {
    if (!active) return;
    const next = finishSession(state, active, new Date());
    setState(next);
    const session = next.sessions[next.sessions.length - 1];
    setLastEvent(session ? { kind: "session", session } : null);
    setActive(null);
  };

  const replaceState = (next: AppState) => {
    setState(next);
    setActive(null);
    setLastEvent(null);
    setTestMode(null);
    setTab("workout");
  };

  const openMaxTest = () => setTestMode("maxTest");
  const openRestart = () => setTestMode("restart");

  const handleReset = () => {
    clearAll();
    replaceState(createInitialState());
  };

  let content;
  if (!plan || (testMode && !active)) {
    const mode: MaxTestMode = plan ? testMode! : "initial";
    content = (
      <BaselineTestScreen
        key={mode}
        mode={mode}
        initialVariant={state.variant}
        currentMax={state.currentMax}
        onSave={handleTestSaved}
        onCancel={plan ? () => setTestMode(null) : undefined}
      />
    );
  } else if (tab === "progress" && !active) {
    content = (
      <ProgressScreen
        state={state}
        onImport={replaceState}
        onReset={handleReset}
        onOpenMaxTest={openMaxTest}
        onOpenRestart={openRestart}
      />
    );
  } else {
    content = (
      <WorkoutScreen
        state={state}
        plan={plan}
        active={active}
        lastEvent={lastEvent}
        onStart={handleStart}
        onOpenMaxTest={openMaxTest}
        onOpenRestart={openRestart}
        onLogSet={(input) => setActive((a) => (a ? logSet(a, input, new Date()) : a))}
        onFinish={handleFinish}
        onAbort={() => setActive(null)}
      />
    );
  }

  const showNav = plan !== null && active === null && testMode === null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-lg font-black tracking-tight">
          Push<span className="text-emerald-500">It</span>
        </span>
        <button
          type="button"
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          className="flex size-11 items-center justify-center rounded-full text-xl hover:bg-slate-200 dark:hover:bg-slate-800"
          aria-label={theme === "dark" ? "Helles Design" : "Dunkles Design"}
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
      </div>

      {warning && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-2xl bg-amber-500/10 p-4 text-sm" role="alert">
          <span>Gespeicherte Daten konnten nicht gelesen werden und wurden zurückgesetzt ({warning}).</span>
          <button type="button" className="font-semibold" onClick={() => setWarning(undefined)} aria-label="Hinweis schließen">
            ✕
          </button>
        </div>
      )}

      <main className={`flex-1 ${showNav ? "pb-28" : "pb-[max(1.5rem,env(safe-area-inset-bottom))]"}`}>{content}</main>

      {showNav && (
        <nav className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-[#0b0f17]/90">
          <div className="mx-auto grid max-w-lg grid-cols-2 gap-2 p-2">
            {(
              [
                ["workout", "Training", "🏋️"],
                ["progress", "Fortschritt", "📈"],
              ] as const
            ).map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-current={tab === id ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center rounded-2xl text-sm font-semibold ${
                  tab === id ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "text-slate-500"
                }`}
              >
                <span aria-hidden className="text-xl">
                  {icon}
                </span>
                {label}
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
