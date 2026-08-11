---
id: PROJ-Y-143b
title: "Inhaltliche Prüfung der neu baselineten Visual-Regression-Snapshots"
issue_type: Chore
epic_code: HYGIENE
epic_title: "Hygiene & Supply-Chain"
priority: Medium
priority_source: "Should"
labels: ["hygiene", "testing", "ui"]
dependencies: ["PROJ-143", "PROJ-51"]
roles: ["Platform", "Design"]
summary_for_jira: "[HYGIENE] Visual-Regression: eingefrorene UI inhaltlich prüfen statt nur stabil"
---

# PROJ-Y-143b: Inhaltliche Prüfung der neuen Snapshots

## Status: Planned
**Created:** 2026-08-11
**Origin:** Followup aus PROJ-143, Deviation D-1.

> **Hygiene-Slice.** Prüfung + ggf. Korrektur von Baselines. Kein Produktivcode erwartet — falls die Prüfung echte UI-Fehler findet, werden das eigene Slices.

## Problem

PROJ-143 hat `dashboard.png` und `stammdaten.png` neu baselinet. Beide waren **schon vorher rot** — dokumentierte Datendrift aus PROJ-88 F-3, die nie aufgearbeitet wurde. Die neue Baseline friert daher **zwei** Dinge gleichzeitig fest:

1. die beabsichtigte Folge des frischen, RFC-4122-konformen Tenants, und
2. die nie untersuchte UI-Drift.

Vor dem Baselining wurde ausschließlich **Stabilität** geprüft (zwei Läufe, identische Höhen 1554/1714 px; die zuvor beobachtete Schwankung war die Retry-Sequenz innerhalb eines Laufs), danach zweimal verifiziert (2× rc=0, 7/7).

Was **nicht** stattgefunden hat: ein Blick darauf, ob die eingefrorene Oberfläche inhaltlich richtig ist. Ein grüner Visual-Regression-Test beweist derzeit nur „unverändert gegenüber dem, was wir eingefroren haben" — nicht „korrekt".

## Acceptance Criteria

- **AC-Y143b.1** — Beide Baselines sind visuell durchgesehen und gegen die erwartete Soll-UI abgeglichen (Dashboard: My-Work/Approvals/Portfolio-Health-Regionen; Stammdaten: Karten-Inventar inkl. der seit PROJ-66/76/96 ergänzten Einträge).
- **AC-Y143b.2** — Jede Abweichung ist klassifiziert: **(a)** korrekt und erwartet · **(b)** Folge des frischen Tenants (leere Zustände) · **(c)** echter UI-Fehler.
- **AC-Y143b.3** — Für jeden (c)-Fund existiert ein eigener Eintrag (PROJ-Y oder Bug); die Baseline wird **nicht** stillschweigend „passend" gemacht.
- **AC-Y143b.4** — Das Ergebnis ist in dieser Spec dokumentiert, sodass die Baselines künftig als geprüft gelten und nicht erneut pauschal neu gezogen werden.

## Warum das nicht „nur Screenshots anschauen" ist

Der Wert liegt in der Klassifikation. Ein leerer Zustand nach frischem Tenant ist erwartet und darf eingefroren bleiben; eine fehlende Navigationskarte oder ein abgeschnittenes Panel ist ein Produktfehler, der sich hinter einem grünen Test versteckt. Ohne diese Trennung bleibt die Suite grün und sagt nichts aus.

## Kontext

Betroffen sind die authentifizierten PROJ-51-Snapshots (7/7 grün nach dem Re-Baseline). Die Höhen sind stabil, das Problem ist ausschließlich inhaltlicher Natur.
