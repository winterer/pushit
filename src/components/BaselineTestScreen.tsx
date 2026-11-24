import { useState } from "react";
import { VARIANT_LABELS, type PushupVariant } from "../domain/models";
import { EASIER_VARIANT_THRESHOLD, MIN_MAX, shouldSuggestEasierVariant } from "../domain/planner";
import { Button, Card, RepStepper } from "./ui";

const VARIANT_HINTS: Record<PushupVariant, string> = {
  standard: "Hände schulterbreit am Boden, Körper eine Linie.",
  incline: "Hände auf Bank, Stufe oder Tischkante – je höher, desto leichter.",
  knees: "Knie am Boden, Hüfte gestreckt, Oberkörper bleibt gerade.",
};

export function BaselineTestScreen({
  initialVariant,
  onSave,
}: {
  initialVariant: PushupVariant;
  onSave: (reps: number, variant: PushupVariant) => void;
}) {
  const [variant, setVariant] = useState<PushupVariant>(initialVariant);
  const [reps, setReps] = useState(10);
  const suggestEasier = shouldSuggestEasierVariant(variant, reps);

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold tracking-wide text-emerald-500 uppercase">Basiswert-Test</p>
        <h1 className="text-3xl font-black">Wie viele schaffst du sauber?</h1>
      </header>

      <Card>
        <h2 className="mb-2 text-lg font-bold">So funktioniert's</h2>
        <ol className="list-decimal space-y-1 pl-5 text-slate-600 dark:text-slate-300">
          <li>Kurz aufwärmen: Schulterkreisen, 20–30 s Plank, ein paar leichte Wiederholungen.</li>
          <li>Dann so viele Liegestütze wie möglich am Stück.</li>
          <li>
            Zähle nur <strong>saubere</strong> Wiederholungen. Stopp, sobald die Hüfte durchhängt, die Tiefe nicht
            mehr erreicht wird oder du Schwung holst.
          </li>
        </ol>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-bold">Variante</h2>
        <div className="grid gap-2" role="radiogroup" aria-label="Variante">
          {(Object.keys(VARIANT_LABELS) as PushupVariant[]).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={variant === v}
              onClick={() => setVariant(v)}
              className={`min-h-14 rounded-2xl px-4 py-3 text-left ring-2 transition-colors ${
                variant === v
                  ? "bg-emerald-500/10 ring-emerald-500"
                  : "ring-slate-200 hover:ring-slate-300 dark:ring-slate-700 dark:hover:ring-slate-600"
              }`}
            >
              <span className="block font-semibold">{VARIANT_LABELS[v]}</span>
              <span className="block text-sm text-slate-500 dark:text-slate-400">{VARIANT_HINTS[v]}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-bold">Saubere Wiederholungen</h2>
        <RepStepper label="Wiederholungen" value={reps} onChange={setReps} min={0} max={200} />
        {suggestEasier && (
          <p className="rounded-2xl bg-sky-500/10 p-4 text-sm text-sky-800 dark:text-sky-200" role="note">
            Weniger als {EASIER_VARIANT_THRESHOLD} klassische Wiederholungen? Kein Problem! Mit{" "}
            <button type="button" className="font-semibold underline" onClick={() => setVariant("incline")}>
              erhöhten
            </button>{" "}
            oder{" "}
            <button type="button" className="font-semibold underline" onClick={() => setVariant("knees")}>
              Knie-Liegestützen
            </button>{" "}
            trainierst du sauberer und machst schneller Fortschritte. Die Entscheidung liegt bei dir.
          </p>
        )}
        {reps < MIN_MAX && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Für die Planung wird mindestens mit {MIN_MAX} Wiederholungen gerechnet.
          </p>
        )}
      </Card>

      <Button tone="primary" className="min-h-16 w-full text-lg" onClick={() => onSave(reps, variant)}>
        Basiswert speichern & Plan erstellen
      </Button>
    </div>
  );
}
