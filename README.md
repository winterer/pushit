# PushIt – Liegestütz-Progression (PWA)

Offlinefähige PWA für ein 4-wöchiges Liegestütz-Programm (3 Einheiten/Woche) mit
dynamischer Anpassung innerhalb einer Einheit und zwischen Einheiten.
Alle Daten bleiben lokal (localStorage, JSON-Export/-Import).

## Entwicklung

```bash
npm install
npm run dev        # Dev-Server
npm run typecheck  # tsc --noEmit
npm test           # vitest run
npm run build      # Type-Check + Production-Build inkl. Manifest & Service Worker
npm run preview    # Build lokal ausliefern (für Offline-/Installations-Test)
```

## Struktur

| Pfad | Inhalt |
| --- | --- |
| `src/domain/models.ts` | Datenmodell (AppState v1, Sessions, Sets) |
| `src/domain/planner.ts` | Reine Plan- & Anpassungslogik (Wochenstruktur, `adaptRemainingSets`, `computeNextMax`, Retest) |
| `src/storage/workoutStore.ts` | Versionierte Persistenz, Validierung, Migration, Export/Import |
| `src/hooks/useRestTimer.ts` | Zeitstempelbasierter Pausen-Timer mit Web-Audio-Signal & Vibration |
| `src/hooks/useWakeLock.ts` | Screen Wake Lock während einer laufenden Einheit |
| `src/components/*` | Basiswert-Test, Training, Fortschritt |

## Fachliche Entscheidungen

- **Langsame Progression bei Max < 10:** +1 gibt es nur bei jeder 2. *aufeinanderfolgenden*
  vollständig sauberen Einheit (die erste wird „angespart“).
- **Retest (W4/E3):** ein Max-Satz; das Ergebnis (min. 3) wird neuer `currentMax`,
  danach beginnt automatisch ein neuer Zyklus.
- **Laufende Einheit** wird separat (`pushit.activeSession`) gespeichert, damit geloggte
  Sätze und eine laufende Pause einen Reload überstehen.
- **Plan neu starten:** jederzeit möglich (Training/Fortschritt → „Plan neu starten“). Neuer
  Basistest, Variante frei wählbar; der Plan beginnt wieder bei W1/E1, der Verlauf bleibt.
  Ein Neustart ohne absolvierte Einheit im Zyklus erhöht die Zyklusnummer nicht.
- **Freier Max-Test:** jederzeit möglich; das Ergebnis (min. 3, auch niedriger als bisher)
  wird neuer `currentMax`. Variante, Basiswert und Position im Zyklus bleiben unverändert.

## Datenschema

`AppState` ist aktuell **Version 2** (`cycleStartIndex`, `cycle`, `maxTests`). Gespeicherte
oder importierte v1-Daten werden automatisch migriert (Zyklusbeginn aus den Retests abgeleitet).
