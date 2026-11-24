import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Tone = "primary" | "secondary" | "danger" | "ghost";

const TONES: Record<Tone, string> = {
  primary: "bg-emerald-500 text-slate-950 hover:bg-emerald-400 active:bg-emerald-600",
  secondary:
    "bg-slate-200 text-slate-900 hover:bg-slate-300 active:bg-slate-400 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 dark:active:bg-slate-600",
  danger: "bg-rose-600 text-white hover:bg-rose-500 active:bg-rose-700",
  ghost:
    "bg-transparent text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800",
};

export function Button({
  tone = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      type="button"
      className={`min-h-12 rounded-2xl px-4 py-3 text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-40 ${TONES[tone]} ${className}`}
      {...props}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 ${className}`}>
      {children}
    </section>
  );
}

/** Große +/- Eingabe für Wiederholungen (Ein-Hand-Bedienung). */
export function RepStepper({
  value,
  onChange,
  min = 0,
  max = 999,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <div className="flex items-center justify-between gap-3" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`${label} verringern`}
        onClick={() => set(value - 1)}
        disabled={value <= min}
        className="size-20 shrink-0 rounded-full bg-slate-200 text-4xl font-bold active:bg-slate-300 disabled:opacity-40 dark:bg-slate-800 dark:active:bg-slate-700"
      >
        −
      </button>
      <output aria-live="polite" className="min-w-0 flex-1 text-center text-6xl font-black tabular-nums">
        {value}
      </output>
      <button
        type="button"
        aria-label={`${label} erhöhen`}
        onClick={() => set(value + 1)}
        disabled={value >= max}
        className="size-20 shrink-0 rounded-full bg-slate-200 text-4xl font-bold active:bg-slate-300 disabled:opacity-40 dark:bg-slate-800 dark:active:bg-slate-700"
      >
        +
      </button>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex min-h-16 w-full items-center justify-between gap-4 rounded-2xl px-4 py-3 text-left ring-2 transition-colors ${
        checked
          ? "bg-emerald-500/10 ring-emerald-500"
          : "bg-amber-500/10 ring-amber-500"
      }`}
    >
      <span>
        <span className="block text-lg font-semibold">{label}</span>
        {description && <span className="block text-sm text-slate-500 dark:text-slate-400">{description}</span>}
      </span>
      <span
        aria-hidden
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${checked ? "bg-emerald-500" : "bg-amber-500"}`}
      >
        <span
          className={`absolute top-1 size-6 rounded-full bg-white shadow transition-all ${checked ? "left-7" : "left-1"}`}
        />
      </span>
    </button>
  );
}

/** Modaler Bestätigungsdialog auf Basis von <dialog>. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  tone = "danger",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  tone?: Tone;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-3xl bg-white p-6 text-slate-900 backdrop:bg-black/60 dark:bg-slate-900 dark:text-slate-100"
    >
      <h2 className="mb-2 text-xl font-bold">{title}</h2>
      <div className="mb-6 text-slate-600 dark:text-slate-300">{children}</div>
      <div className="grid grid-cols-2 gap-3">
        <Button onClick={onCancel}>Abbrechen</Button>
        <Button tone={tone} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}

export function formatSeconds(total: number): string {
  const s = Math.max(0, Math.round(total));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
