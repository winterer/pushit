import { useRef, useState } from "react";
import { VARIANT_LABELS, type AppState } from "../domain/models";
import {
  SESSIONS_PER_CYCLE,
  evaluateSession,
  getCycleNumber,
  sessionsInCurrentCycle,
  slotFromIndex,
} from "../domain/planner";
import { downloadStateJson, parseImportedJson } from "../storage/workoutStore";
import { Button, Card, ConfirmDialog } from "./ui";

const dateFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });

export function ProgressScreen({
  state,
  onImport,
  onReset,
}: {
  state: AppState;
  onImport: (state: AppState) => void;
  onReset: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<AppState | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const done = sessionsInCurrentCycle(state.sessions);
  const totalReps = state.sessions.reduce((sum, s) => sum + s.sets.reduce((a, b) => a + b.actualReps, 0), 0);
  const gain = (state.currentMax ?? 0) - (state.baselineMax ?? 0);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setImportError(null);
    const result = parseImportedJson(await file.text());
    if (result.ok) setPendingImport(result.state);
    else setImportError(result.error);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold tracking-wide text-emerald-500 uppercase">Fortschritt</p>
        <h1 className="text-3xl font-black">{VARIANT_LABELS[state.variant]}</h1>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Basiswert" value={state.baselineMax ?? "–"} />
        <Stat label="Aktuelles Max" value={state.currentMax ?? "–"} highlight />
        <Stat label="Veränderung" value={gain > 0 ? `+${gain}` : gain} />
      </div>

      <Card>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-bold">Zyklus {getCycleNumber(state.sessions)}</h2>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {done}/{SESSIONS_PER_CYCLE} Einheiten
          </span>
        </div>
        <div className="grid grid-cols-[auto_repeat(3,1fr)] items-center gap-2">
          {[1, 2, 3, 4].map((week) => (
            <CycleRow key={week} week={week} done={done} />
          ))}
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-bold">Verlauf</h2>
          <span className="text-sm text-slate-500 dark:text-slate-400">{totalReps} Wdh. gesamt</span>
        </div>
        {state.sessions.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400">Noch keine Einheit abgeschlossen.</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {[...state.sessions].reverse().map((s) => {
              const delta = s.endingMax - s.startingMax;
              const outcome = evaluateSession(s.sets);
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      W{s.week} · E{s.sessionInWeek} {s.isRetest && <span className="text-emerald-500">Retest</span>}
                    </p>
                    <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                      {dateFmt.format(new Date(s.date))} · {s.sets.map((x) => x.actualReps).join(" / ")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold tabular-nums">
                      {s.startingMax} → {s.endingMax}
                    </p>
                    <p
                      className={`text-sm ${
                        delta > 0
                          ? "text-emerald-500"
                          : delta < 0
                            ? "text-amber-500"
                            : "text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {delta > 0 ? `+${delta}` : delta < 0 ? delta : outcome === "progress" ? "sauber" : "gehalten"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-bold">Daten</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Alle Daten liegen nur auf diesem Gerät. Sichere sie regelmäßig per Export.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={() => downloadStateJson(state)}>Export (JSON)</Button>
          <Button onClick={() => fileRef.current?.click()}>Import (JSON)</Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        {importError && (
          <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300" role="alert">
            Import fehlgeschlagen: {importError}
          </p>
        )}
        <Button tone="danger" className="w-full" onClick={() => setConfirmReset(true)}>
          Alles zurücksetzen
        </Button>
      </Card>

      <ConfirmDialog
        open={pendingImport !== null}
        title="Daten importieren?"
        confirmLabel="Importieren"
        tone="primary"
        onCancel={() => setPendingImport(null)}
        onConfirm={() => {
          if (pendingImport) onImport(pendingImport);
          setPendingImport(null);
        }}
      >
        Die importierte Datei enthält {pendingImport?.sessions.length ?? 0} Einheiten. Deine aktuellen Daten
        (inkl. einer laufenden Einheit) werden ersetzt.
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmReset}
        title="Alles zurücksetzen?"
        confirmLabel="Zurücksetzen"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          onReset();
        }}
      >
        Basiswert, Verlauf und laufende Einheit werden unwiderruflich gelöscht. Tipp: Vorher exportieren.
      </ConfirmDialog>
    </div>
  );
}

function Stat({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div
      className={`rounded-3xl p-4 text-center ring-1 ${
        highlight
          ? "bg-emerald-500/10 ring-emerald-500/50"
          : "bg-white ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
      }`}
    >
      <p className="text-3xl font-black tabular-nums">{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

function CycleRow({ week, done }: { week: number; done: number }) {
  return (
    <>
      <span className="pr-1 text-sm font-semibold text-slate-500 dark:text-slate-400">W{week}</span>
      {[0, 1, 2].map((i) => {
        const index = (week - 1) * 3 + i;
        const slot = slotFromIndex(index);
        const state = index < done ? "done" : index === done ? "next" : "open";
        const cls =
          state === "done"
            ? "bg-emerald-500 text-slate-950"
            : state === "next"
              ? "ring-2 ring-emerald-500"
              : "bg-slate-100 text-slate-400 dark:bg-slate-800";
        return (
          <span key={i} className={`flex h-10 items-center justify-center rounded-xl text-sm font-semibold ${cls}`}>
            {index === SESSIONS_PER_CYCLE - 1 ? "Test" : `E${slot.sessionInWeek}`}
          </span>
        );
      })}
    </>
  );
}
