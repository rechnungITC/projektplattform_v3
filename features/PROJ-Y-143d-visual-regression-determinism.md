---
id: PROJ-Y-143d
title: "Determinismus für die authentifizierten Visual-Regression-Snapshots"
issue_type: Chore
epic_code: HYGIENE
epic_title: "Hygiene & Supply-Chain"
priority: Medium
priority_source: "Should"
labels: ["hygiene", "testing", "ui"]
dependencies: ["PROJ-Y-143b", "PROJ-51"]
roles: ["Platform"]
summary_for_jira: "[HYGIENE] Visual-Regression: 3 fixme-Snapshots reproduzierbar machen und neu baselinen"
---

# PROJ-Y-143d: Determinismus für drei Visual-Regression-Snapshots

## Status: Planned
**Created:** 2026-08-11
**Origin:** Fund bei der Umsetzung von PROJ-Y-143b AC-5.

> **Hygiene-Slice.** Ziel ist, drei `test.fixme()`-Markierungen wieder zu entfernen — nicht, die Suite grün zu machen.

## Ausgangslage

PROJ-Y-143b AC-5 hat den Warte-Anker der authentifizierten Snapshot-Tests von der Sidebar (Shell) auf einen Daten-Anker (`[data-slot="skeleton"]` verschwunden) umgestellt. Damit fotografieren die Tests erstmals den **geladenen** Zustand — und legen offen, dass drei Baselines wertlos waren:

| Snapshot | Baseline | Tatsächlich geladen |
|---|---|---|
| `projects-list.png` | **720 px** — leerer Viewport | 1200 px |
| `project-room.png` | **720 px** — leerer Viewport | 2423 px |
| `settings-tenant.png` | 4465 px | 4505 px, 3 % Pixel-Diff (Toleranz 2 %) |

Die beiden 720-px-Bilder sind reine Viewport-Höhe, also **leere Seiten**. Diese Tests waren dauerhaft grün, weil der alte Anker so früh auslöste, dass die Seite noch leer war — passend zur leeren Baseline. Der Test bewachte nichts und meldete Erfolg.

Alle drei sind in `tests/PROJ-51-visual-regression-authenticated.spec.ts` als `test.fixme()` markiert, mit Begründung am Test. Bewusst `fixme` statt `skip`: der Report weist sie aus, sie verschwinden nicht still.

## Warum sie nicht einfach neu baselinet wurden

Weil das Rot nur in den nächsten Lauf verschoben würde. `projects-list` ist mit echtem Inhalt **nicht reproduzierbar**:

1. **Relative Zeitstempel.** Die Spalte „Updated" rendert `just now` / `8m ago` / `5h ago` / `1d ago`. Jeder Lauf verschiebt sie.
2. **Monoton wachsender Datenbestand.** Die E2E-Läufe legen Projekte an und räumen sie nicht ab. Zum Zeitpunkt des Funds standen dort u. a. sechs Zeilen `[E2E 135] Finalize Project` und fünf `[E2E ε] Wizard KI Project`. Mit jedem Lauf kommt eine dazu, die Seitenhöhe wächst mit.

`project-room` hat dasselbe Problem in stärkerer Form — der Dateikopf des Specs sagt das seit PROJ-51 selbst voraus („computed paths, work-item counts, last-edit-times"). Das UUID-Pinning aus PROJ-51-ε.4 hat die *URL* stabilisiert, nicht den *Inhalt*.

## Acceptance Criteria

- **AC-Y143d.1** — Zeitabhängige Regionen sind aus dem Vergleich genommen (Playwright `mask`) **oder** die Anzeige ist im Testmodus auf absolute Werte gepinnt. Zwei Läufe im Abstand von > 1 h liefern identische Bilder.
- **AC-Y143d.2** — Der Datenbestand der Snapshot-Seiten ist reproduzierbar: entweder räumen die E2E-Läufe die von ihnen erzeugten Projekte wieder ab, oder die Snapshot-Tests arbeiten gegen einen gefilterten/isolierten Bestand. Zweimaliges Ausführen der vollen Suite ändert die Seitenhöhe nicht.
- **AC-Y143d.3** — Der 40-px-Unterschied bei `settings-tenant` ist klassifiziert: erwartete UI-Änderung oder Defekt. Bei Defekt entsteht ein eigener Eintrag; die Baseline wird nicht „passend gemacht" (AC-Y143b.2/.3).
- **AC-Y143d.4** — Die drei Baselines sind im **verifiziert geladenen** Zustand neu gezogen und inhaltlich durchgesehen (AC-Y143b.1/.7).
- **AC-Y143d.5** — Die drei `test.fixme()`-Markierungen sind entfernt; die authentifizierte Suite läuft 7/7 grün, und zwar zweimal hintereinander sowie einmal mit geleertem `.next/dev`.

## Abgrenzung

- **PROJ-Y-143c** räumt den **Alt**-Tenant auf (43 Projekte, einmalig, destruktiv, auf Freigabe blockiert). Hier geht es um den **aktiven** Tenant und darum, dass laufende Tests fortwährend neue Zeilen erzeugen. Die Bereinigung aus 143c beseitigt dieses Problem **nicht**.
- **PROJ-Y-143b** klärt, ob die eingefrorenen Oberflächen inhaltlich korrekt sind. Diese Slice stellt die technische Voraussetzung dafür her, dass es überhaupt etwas Stabiles zu prüfen gibt.

## Kontext

Der Daten-Anker selbst ist umgesetzt und belegt: Dashboard läuft im Kaltstart (ohne jedes `.next`) grün, die vier reproduzierbaren Snapshots sind 4/4 grün.
