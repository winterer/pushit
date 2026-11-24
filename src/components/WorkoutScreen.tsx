import { useEffect, useRef, useState } from "react";
import {
  VARIANT_LABELS,
  type ActiveSession,
  type AppState,
  type SessionPlan,
  type SetTarget,
  type WorkoutSession,
} from "../domain/models";
import {
  computeNextMax,
  computeRetestMax,
  currentSetTarget,
  evaluateSession,
  getCycleNumber,
  isStrugglingSet,
} from "../domain/planner";
import { useRestTimer, type RestTimer } from "../hooks/useRestTimer";
import { useWakeLock } from "../hooks/useWakeLock";
import { Button, Card, ConfirmDialog, RepStepper, Toggle, formatSeconds } from "./ui";

interface Props {
  state: AppState;
  plan: SessionPlan;
  active: ActiveSession | null;
  lastFinished: WorkoutSession | null;
  onStart: () => void;
  onLogSet: (input: { actualReps: number; cleanForm: boolean }) => void;
  onFinish: () => void;
  onAbort: () => void;
}

export function WorkoutScreen(props: Props) {
  return props.active ? (
    <ActiveWorkout {...props} active={props.active} />
  ) : (
    <SessionPreview state={props.state} plan={props.plan} lastFinished={props.lastFinished} onStart={props.onStart} />
  );
}

function sessionTitle(s: { week: number; sessionInWeek: number }) {
  return `Woche ${s.week} · Einheit ${s.sessionInWeek}`;
}

// ---------------------------------------------------------------------------
// Vorschau der nächsten Einheit
// ---------------------------------------------------------------------------

function SessionPreview({
  state,
  plan,
  lastFinished,
  onStart,
}: Pick<Props, "state" | "plan" | "lastFinished" | "onStart">) {
  const totalReps = plan.sets.reduce((sum, s) => sum + s.targetReps, 0);
  return (
    <div className="space-y-5">
      {lastFinished && <SessionResult session={lastFinished} />}

      <header>
        <p className="text-sm font-semibold tracking-wide text-emerald-500 uppercase">
          Zyklus {getCycleNumber(state.sessions)} · Nächste Einheit
        </p>
        <h1 className="text-3xl font-black">{sessionTitle(plan)}</h1>
        <p className="text-slate-500 dark:text-slate-400">{VARIANT_LABELS[state.variant]}</p>
      </header>

      {plan.isRetest ? (
        <Card className="space-y-2">
          <h2 className="text-xl font-bold">Retest 🎯</h2>
          <p className="text-slate-600 dark:text-slate-300">
            Nach dem Aufwärmen machst du <strong>einen</strong> Satz mit so vielen sauberen Wiederholungen wie möglich.
            Bisheriger Max-Wert: <strong>{plan.effectiveMax}</strong>. Das Ergebnis wird dein neuer Max-Wert für den
            nächsten 4-Wochen-Zyklus.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-xl font-bold">
              {plan.sets.length} Sätze · {totalReps} Wdh.
            </h2>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Pause {formatSeconds(plan.sets[0]?.restSeconds ?? 0)}
            </span>
          </div>
          <ol className="flex flex-wrap gap-2">
            {plan.sets.map((s) => (
              <li
                key={s.setIndex}
                className="flex size-16 flex-col items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800"
              >
                <span className="text-2xl font-black tabular-nums">{s.targetReps}</span>
                <span className="text-xs text-slate-500">Satz {s.setIndex}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            Basis: Max {plan.effectiveMax}. Bei Technik-Einbrüchen werden die restlichen Sätze automatisch reduziert.
          </p>
        </Card>
      )}

      <Button tone="primary" className="min-h-16 w-full text-lg" onClick={onStart}>
        {plan.isRetest ? "Retest starten" : "Einheit starten"}
      </Button>
    </div>
  );
}

function SessionResult({ session }: { session: WorkoutSession }) {
  const delta = session.endingMax - session.startingMax;
  const reps = session.sets.reduce((sum, s) => sum + s.actualReps, 0);
  let text: string;
  if (session.isRetest) {
    text = `Retest: ${session.sets[0]?.actualReps ?? 0} saubere Wiederholungen. Neuer Max-Wert: ${session.endingMax}. Weiter geht's mit einem neuen Zyklus!`;
  } else if (delta > 0) {
    text = `Stark! Alles sauber geschafft – dein Max steigt auf ${session.endingMax}.`;
  } else if (delta < 0) {
    text = `Heute war's zäh. Wir nehmen etwas raus: Max jetzt ${session.endingMax}. Saubere Technik geht vor.`;
  } else if (evaluateSession(session.sets) === "progress") {
    text = `Sauber geschafft! Noch eine solche Einheit, dann steigt dein Max (${session.endingMax}).`;
  } else {
    text = `Solide Einheit. Dein Max bleibt bei ${session.endingMax}.`;
  }
  return (
    <div className="rounded-3xl bg-emerald-500/10 p-5 ring-1 ring-emerald-500/40" role="status">
      <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
        {sessionTitle(session)} abgeschlossen · {reps} Wdh.
      </p>
      <p className="mt-1 text-lg font-semibold">{text}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Laufende Einheit
// ---------------------------------------------------------------------------

const WARMUP = [
  "Schulterkreisen vor & zurück (je 10×)",
  "Arm- und Brustöffner (10×)",
  "Plank 20–30 s",
  "1–2 leichte Sätze (z. B. erhöht) mit 3–5 Wdh.",
];

function Warmup({ defaultOpen }: { defaultOpen: boolean }) {
  const [done, setDone] = useState<boolean[]>(() => WARMUP.map(() => false));
  const count = done.filter(Boolean).length;
  return (
    <details open={defaultOpen} className="group rounded-3xl bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-5 py-3 font-semibold">
        <span>Warm-up</span>
        <span className="text-sm text-slate-500">
          {count}/{WARMUP.length} <span className="inline-block transition-transform group-open:rotate-180">▾</span>
        </span>
      </summary>
      <ul className="space-y-1 px-3 pb-3">
        {WARMUP.map((item, i) => (
          <li key={item}>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-100 dark:hover:bg-slate-800">
              <input
                type="checkbox"
                className="size-6 accent-emerald-500"
                checked={done[i]}
                onChange={(e) => setDone((d) => d.map((v, j) => (j === i ? e.target.checked : v)))}
              />
              <span className={done[i] ? "text-slate-400 line-through" : ""}>{item}</span>
            </label>
          </li>
        ))}
      </ul>
    </details>
  );
}

function RestTimerPanel({ timer, nextReps }: { timer: RestTimer; nextReps: number | null }) {
  if (timer.status === "idle") return null;
  const finished = timer.status === "finished";
  const progress = timer.totalSeconds > 0 ? timer.remainingSeconds / timer.totalSeconds : 0;
  return (
    <Card className={finished ? "ring-2 ring-emerald-500" : ""}>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{finished ? "Pause vorbei – los geht's!" : "Pause"}</h2>
        {nextReps !== null && (
          <span className="text-sm text-slate-500 dark:text-slate-400">Nächster Satz: {nextReps} Wdh.</span>
        )}
      </div>
      {!finished && (
        <>
          <p
            className="my-2 text-center text-7xl font-black tabular-nums"
            aria-live="off"
            aria-label={`Verbleibende Pause ${timer.remainingSeconds} Sekunden`}
          >
            {formatSeconds(timer.remainingSeconds)}
          </p>
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width] duration-200"
              style={{ width: `${Math.min(100, progress * 100)}%` }}
            />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Button onClick={() => timer.adjust(-15)} aria-label="15 Sekunden weniger">
              −15s
            </Button>
            <Button onClick={timer.status === "paused" ? timer.resume : timer.pause}>
              {timer.status === "paused" ? "▶" : "❚❚"}
              <span className="sr-only">{timer.status === "paused" ? "Weiter" : "Pausieren"}</span>
            </Button>
            <Button onClick={() => timer.adjust(15)} aria-label="15 Sekunden mehr">
              +15s
            </Button>
            <Button tone="ghost" onClick={timer.skip}>
              Skip
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function ActiveWorkout({ state, active, onLogSet, onFinish, onAbort }: Props & { active: ActiveSession }) {
  const timer = useRestTimer();
  useWakeLock(true);
  const [confirmAbort, setConfirmAbort] = useState(false);

  const target = currentSetTarget(active);
  const total = active.plannedSets.length;

  // Nach einem Reload eine noch laufende Pause aus dem letzten Satz-Zeitstempel wiederherstellen.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const last = active.logs[active.logs.length - 1];
    if (!last || !currentSetTarget(active)) return;
    const left = last.restSecondsPlanned - (Date.now() - Date.parse(last.completedAt)) / 1000;
    if (left > 1) timer.start(left);
  }, [active, timer]);

  const lastLog = active.logs[active.logs.length - 1];
  const reduced = lastLog !== undefined && target !== null && isStrugglingSet(lastLog);

  const save = (input: { actualReps: number; cleanForm: boolean }) => {
    if (!target) return;
    const isLast = active.logs.length + 1 >= total;
    onLogSet(input);
    if (!isLast && target.restSeconds > 0) timer.start(target.restSeconds);
    else timer.skip();
  };

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tracking-wide text-emerald-500 uppercase">
            {sessionTitle(active)} {active.isRetest && "· Retest"}
          </p>
          <p className="text-slate-500 dark:text-slate-400">{VARIANT_LABELS[state.variant]}</p>
        </div>
        <Button tone="ghost" className="min-h-10 py-2 text-sm" onClick={() => setConfirmAbort(true)}>
          Abbrechen
        </Button>
      </header>

      <SetProgress active={active} />

      <Warmup defaultOpen={active.logs.length === 0} />

      <RestTimerPanel timer={timer} nextReps={target?.targetReps ?? null} />

      {target ? (
        <SetEntry
          // Neuer Schlüssel je Satz/Ziel → Eingabe wird mit dem Ziel vorbelegt.
          key={`${target.setIndex}:${target.targetReps}`}
          target={target}
          total={total}
          isRetest={active.isRetest}
          reduced={reduced}
          onSave={save}
        />
      ) : (
        <FinishCard state={state} active={active} onFinish={onFinish} />
      )}

      <ConfirmDialog
        open={confirmAbort}
        title="Einheit abbrechen?"
        confirmLabel="Verwerfen"
        onCancel={() => setConfirmAbort(false)}
        onConfirm={() => {
          setConfirmAbort(false);
          timer.skip();
          onAbort();
        }}
      >
        Die bisher geloggten Sätze dieser Einheit werden verworfen. Die Einheit bleibt als nächste offen.
      </ConfirmDialog>
    </div>
  );
}

function SetEntry({
  target,
  total,
  isRetest,
  reduced,
  onSave,
}: {
  target: SetTarget;
  total: number;
  isRetest: boolean;
  reduced: boolean;
  onSave: (input: { actualReps: number; cleanForm: boolean }) => void;
}) {
  const [actualReps, setActualReps] = useState(target.targetReps);
  const [cleanForm, setCleanForm] = useState(true);
  return (
    <Card className="space-y-5">
      <div className="text-center">
        <p className="text-lg font-semibold">{isRetest ? "Max-Satz" : `Satz ${target.setIndex} von ${total}`}</p>
        <p className="text-slate-500 dark:text-slate-400">
          {isRetest ? (
            <>So viele saubere Wdh. wie möglich · bisher {target.targetReps}</>
          ) : (
            <>
              Ziel: <strong className="text-2xl text-slate-900 dark:text-slate-100">{target.targetReps}</strong> Wdh.
            </>
          )}
        </p>
        {reduced && (
          <p className="mt-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            Ziele der restlichen Sätze um ~20 % reduziert – Technik geht vor.
          </p>
        )}
      </div>
      <RepStepper label="Geschaffte Wiederholungen" value={actualReps} onChange={setActualReps} />
      <Toggle
        checked={cleanForm}
        onChange={setCleanForm}
        label={cleanForm ? "Technik sauber ✓" : "Technik eingebrochen"}
        description="Hüfte stabil, volle Tiefe, kein Schwung"
      />
      <Button tone="primary" className="min-h-16 w-full text-lg" onClick={() => onSave({ actualReps, cleanForm })}>
        {target.setIndex >= total ? "Satz speichern" : "Satz speichern & Pause starten"}
      </Button>
    </Card>
  );
}

function SetProgress({ active }: { active: ActiveSession }) {
  return (
    <ol className="flex gap-2" aria-label="Satzfortschritt">
      {active.plannedSets.map((s, i) => {
        const log = active.logs[i];
        const current = i === active.logs.length;
        let cls = "bg-slate-200 text-slate-500 dark:bg-slate-800";
        if (log) cls = isStrugglingSet(log) ? "bg-amber-500 text-slate-950" : "bg-emerald-500 text-slate-950";
        else if (current) cls = "bg-slate-900 text-white ring-2 ring-emerald-500 dark:bg-slate-100 dark:text-slate-900";
        return (
          <li
            key={s.setIndex}
            className={`flex h-12 flex-1 items-center justify-center rounded-xl text-lg font-bold tabular-nums ${cls}`}
            aria-current={current ? "step" : undefined}
          >
            {log ? log.actualReps : s.targetReps}
          </li>
        );
      })}
    </ol>
  );
}

function FinishCard({ state, active, onFinish }: { state: AppState; active: ActiveSession; onFinish: () => void }) {
  const next = active.isRetest
    ? computeRetestMax(active.logs)
    : computeNextMax(active.startingMax, active.logs, state.sessions);
  const delta = next - active.startingMax;
  const reps = active.logs.reduce((sum, s) => sum + s.actualReps, 0);
  return (
    <Card className="space-y-4 text-center">
      <h2 className="text-2xl font-black">Alle Sätze erledigt 💪</h2>
      <p className="text-slate-600 dark:text-slate-300">
        {reps} Wiederholungen · Max {active.startingMax} → <strong>{next}</strong>{" "}
        {delta !== 0 && <span>({delta > 0 ? `+${delta}` : delta})</span>}
      </p>
      <Button tone="primary" className="min-h-16 w-full text-lg" onClick={onFinish}>
        Einheit abschließen
      </Button>
    </Card>
  );
}
