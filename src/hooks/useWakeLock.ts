import { useEffect } from "react";

/**
 * Hält den Bildschirm wach, solange `active` true ist (Screen Wake Lock API).
 * Der Lock wird beim Beenden/Verlassen freigegeben und nach einem Tab-Wechsel
 * (der Browser gibt ihn dann automatisch frei) erneut angefordert.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      if (document.visibilityState !== "visible" || (sentinel && !sentinel.released)) return;
      try {
        const s = await navigator.wakeLock.request("screen");
        if (cancelled) void s.release();
        else sentinel = s;
      } catch {
        // z. B. Energiesparmodus oder fehlende Berechtigung – ohne Lock weiter
      }
    };

    void request();
    document.addEventListener("visibilitychange", request);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", request);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}
