# PROJ-139 — Impact-Analyse: `phases.status` += `suspended`

**Authored:** 2026-06-24 · **Method:** grep-Sweep (gitnexus MCP auf diesem Host nicht geladen; Spec erlaubt „gitnexus/grep") · **Scope:** alle Leser von `phases.status` vor Einführung des fünften Wertes `suspended`.

## Geänderter Vertrag

`phases.status` wechselt von 4 → 5 erlaubten Werten: `planned, in_progress, completed, cancelled` **+ `suspended`**.
State-Machine-Übergänge **neu**: `in_progress → suspended`, `suspended → in_progress`, `suspended → cancelled`. Alle anderen unverändert.

## Leser-Inventar + Verträglichkeit

| Leser | Datei | Art des Zugriffs | Bricht an neuem Wert? | Maßnahme |
|---|---|---|---|---|
| **Typ-Quelle (Linchpin)** | `src/types/phase.ts` | `PhaseStatus`-Union + `PHASE_STATUSES` + `PHASE_STATUS_LABELS` (`Record<PhaseStatus>`) + `ALLOWED_PHASE_TRANSITIONS` (`Record<PhaseStatus>`) | **Compile-Fehler erzwungen** (Record-Typen) — gewünscht | `suspended` ergänzen → TypeScript zwingt alle `Record<PhaseStatus>`-Maps zur Behandlung |
| **Badge** | `src/components/phases/phase-status-badge.tsx` | `STATUS_CLASSES: Record<PhaseStatus,string>` | **Compile-Fehler** bis ergänzt — gewünscht | `suspended`-Klasse (amber/pausiert) ergänzen |
| **Transition-Dialog** | `src/components/phases/phase-status-transition-dialog.tsx` | liest `ALLOWED_PHASE_TRANSITIONS[currentStatus]` + `z.enum(PHASE_STATUSES)` | Nein — propagiert automatisch | keine Code-Änderung; Aktionen „Aussetzen/Fortsetzen" entstehen aus der Transition-Map |
| **Gantt-Bars** | `src/components/phases/gantt-view.tsx` `barClasses()` | `switch(status)` **mit `default`** | Nein (fail-safe → default-Blau) | expliziten `suspended`-Case (gedämpft/gestreift) ergänzen |
| **Timeline-Pills** | `src/components/phases/phases-timeline.tsx` `pillClasses()` | `switch(status)` **mit `default`** | Nein (fail-safe) | expliziten `suspended`-Case ergänzen |
| **use-phases-Hook** | `src/hooks/use-phases.ts` | nur Typ `status: PhaseStatus`, keine Logik | Nein | keine (Typ propagiert) |
| **Phase-Card / Edit / New / Delete / Reorder-Dialoge** | `src/components/phases/*` | Anzeige/`status === "in_progress"`-Checks; keine erschöpfenden Switches | Nein | keine |
| **PROJ-26 Method-Gating** | `src/lib/method-templates/*` | **liest `phases.status` NICHT** (gating auf `project_method`) | Nein | keine — grep 0 Treffer |
| **Report-Snapshot** | `src/lib/reports/aggregate-snapshot-data.ts` | mappt Phase als `SnapshotPhaseRef` (String-Passthrough) | Nein (kein erschöpfender Switch, der bricht) | keine |
| **Report Traffic-Light** | `src/lib/reports/status-traffic-light.ts` | behandelt **risk/milestone**-Status, **nicht** phase.status | Nein | keine |
| **Audit-Whitelist** | `_tracked_audit_columns()` (DB) | `phases.status` **bereits getrackt** (PROJ-10/19) | Nein | verifizieren (kein Neubau) — Statuswechsel auf/aus `suspended` werden automatisch auditiert |
| **State-Machine RPC** | `transition_phase_status` (zuletzt def. in Migration `20260513172000`) | erschöpfende `if/elsif`-Übergangskette | Würde `suspended` als unbekannt abweisen | Übergänge ergänzen (siehe oben); Patch über Live-Body (`pg_get_functiondef`) → neue Migration |

## Fazit

Blast-Radius ist **bounded und großteils TypeScript-erzwungen**: die zwei `Record<PhaseStatus>`-Maps (`phase.ts` Labels + Badge `STATUS_CLASSES`) lösen Compile-Fehler aus, bis `suspended` behandelt ist — kein stiller Durchrutscher. Die beiden `switch`-Leser (Gantt, Timeline) haben `default`-Zweige (fail-safe), bekommen aber explizite Cases für korrekte Darstellung (AC-139-4). Method-Gating und Reports lesen den Wert nicht erschöpfend → unkritisch. Audit ist bereits aktiv. Einziger DB-seitiger Pflicht-Eingriff: die `transition_phase_status`-Übergangskette + der CHECK. **Kein Leser bricht still.**