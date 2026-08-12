---
id: PROJ-Y-143h
title: "Dashboard-Visual-Baseline deterministisch machen"
issue_type: Chore
epic_code: HYGIENE
epic_title: "Hygiene & Supply-Chain"
priority: Medium
priority_source: "Should"
labels: ["hygiene", "testing", "ui"]
dependencies: ["PROJ-Y-143g", "PROJ-64", "PROJ-51"]
roles: ["Platform"]
summary_for_jira: "[HYGIENE] Dashboard-Visual-Baseline über gepinnte Antworten deterministisch machen"
---

# PROJ-Y-143h: die Dashboard-Baseline bewacht wieder Inhalt

## Status: Deployed
## Deployment Scope: tooling-only
**Created:** 2026-08-12
**Deployed:** 2026-08-12 — Tag `v2.51.0-PROJ-Y-143h`
**Origin:** Fund aus PROJ-Y-143g.

## Problem

Das Dashboard war die einzige der sieben Aufnahmen, für die **keine Toleranzzahl** richtig war.
PROJ-Y-143g hat beide Hörner gemessen:

- **eng (20 px):** ein einzelner KPI-Zähler 0 → 3 kostet **82 px**. Sobald irgendein anderer
  E2E-Spec dem `[E2E]`-Nutzer etwas zuweist, wird der Test rot — für etwas, das er nicht
  bewacht.
- **Verhältnis 0.02:** ~44.000 px Spielraum. Ein volllaufendes My-Work-Panel liefe still durch.

Die scheinbare Stabilität kam nicht von der Seite, sondern vom **leeren Mandanten**: alle
Zähler 0, My Work „0 Items", und die vier zeitformatierenden Panels deshalb still.

## Entscheidung: dritter Weg — Antworten pinnen, nicht maskieren und nicht seeden

In 143g waren zwei Wege registriert. Die Untersuchung hat einen dritten gefunden, der beide
schlägt:

| Weg | Kosten | Ergebnis |
|---|---|---|
| (a) Masken über KPI-Strip + 6 Panels | `data-testid` in **7 Produktionskomponenten** | maskiert weg, wofür die Aufnahme da ist — übrig bliebe Shell + Überschriften |
| (b) gepinnte Seed-Daten im `[E2E]`-Mandanten | schreibt in einen Mandanten, den andere Specs lesen | pinnt die **relative** Zeitdarstellung trotzdem nicht |
| **(c) Antworten an der Netzgrenze pinnen** | eine typisierte Fixture-Datei | Seite bleibt echt, Panels bleiben **gerendert**, nichts im Produktivcode, nichts im Mandanten |

Umgesetzt ist (c): `page.route()` beantwortet die drei Dashboard-Endpunkte
(`summary`, `approvals`, `deliverable-approvals`) aus einer Fixture. Alles andere — Shell,
Navigation, Komponenten, Layout — ist die echte Anwendung.

### Zwei Pins, beide nötig

`page.clock.setFixedTime()` friert zusätzlich die Uhr ein. Das ist **nicht** Vorsicht, sondern
gemessen: dieselbe Fixture ohne eingefrorene Uhr rendert

| | mit Uhr | ohne Uhr |
|---|---|---|
| Filter-Chips (all/überfällig/bald fällig/blockiert/in Arbeit) | `4, 2, **1**, 1, 2` | `4, 2, **0**, 1, 2` |
| Seitenhöhe | 1547 px | **1567 px** |

Grund: `my-work-panel.tsx` bucketet über `Date.now()` für „Bald fällig". Ein festes
Fälligkeitsdatum wandert also mit der Realzeit aus seinem Bucket — die Fixture allein hätte
die Drift nur verlangsamt, nicht beseitigt. `setFixedTime` fixiert Datums-Lesungen und lässt
Timer weiterlaufen, React und Next verhalten sich normal.

## Fixture-Drift: zwei unabhängige Wächter

Eine gemockte Antwort kann veralten und der Test bewacht dann eine Fiktion — dieselbe
Fehlerklasse wie die gemockten Parser-Suites aus PROJ-142/PROJ-Y-142b. Deshalb:

1. **Typ-Ebene:** die Fixture ist als `DashboardSummary` deklariert — derselbe Vertrag, den
   der Produktions-Hook konsumiert. Ändert sich der Vertrag, kompiliert die Datei nicht mehr.
   Das ist kein theoretischer Schutz: er hat **beim Bau dieser Slice zugeschlagen** und
   `kind: "todo"` abgelehnt (`WorkItemKind` kennt nur 7 Werte, `todo` gehört zur
   ADR-004-Ebene, nicht zum Work-Item-Enum). Sichtbar wurde es zuerst als React-Absturz
   („Element type is invalid … got: undefined", Icon-Lookup ins Leere) — `tsc` hat dann exakt
   die Zeile benannt.
2. **Laufzeit-Ebene:** ein eigener Test vergleicht die **Schlüssel der Live-Antwort** mit denen
   der Fixture, oben und je Sektion. Der Typ bindet die Fixture an den *Typ*; dieser Test
   bindet sie an den *Server*, falls die Route von ihrem eigenen Typ abdriftet. Rot-Grün
   belegt: Sektion aus der Fixture entfernt → Test rot.

## Was die Suite jetzt hat

- **`Dashboard with pinned data`** — besitzt das Bild `dashboard.png`, Schranke
  `maxDiffPixels: 20`. Zusätzlich eine Nicht-Leerlauf-Sicherung *im Test*: es wird auf
  „Offene Aufgaben: **4**" geprüft; mit Live-Daten stünde dort 0, ein stillschweigend nicht
  greifendes Routing fiele also sofort auf.
- **`Dashboard renders past auth gate (live data)`** — bewusst **ohne** Bild. Hält die echte
  Seite in der Suite (der Aggregations-Endpunkt antwortet wirklich, die Shell rendert
  wirklich), ohne eine Baseline zurückzuholen, deren Inhalt niemand kontrolliert.
- **`dashboard fixture still matches the live contract`** — der Wächter von oben.

## Acceptance Criteria

- **AC-Y143h.1** — Die Dashboard-Baseline ist deterministisch, ohne dass Testdaten im
  Mandanten sie beeinflussen können. ✅ Antworten gepinnt; die Prüfung auf „Offene Aufgaben: 4"
  beweist, dass die Live-Nullwerte das Bild nicht mehr erreichen.
- **AC-Y143h.2** — Kein Produktivcode geändert, nichts in den geteilten Mandanten geschrieben. ✅
- **AC-Y143h.3** — Die Panels sind **gerendert**, nicht maskiert. ✅ Alle Fixture-Inhalte im
  geladenen Zustand nachgewiesen (Work-Item-Titel, Genehmigungen, Projekt-Health-Begründung,
  Alerts, Report-Zeile), Höhe 1547 = Bildhöhe.
- **AC-Y143h.4** — Schranke gemessen statt geerbt. ✅ `maxDiffPixels: 20`; Rot-Grün: eine
  Zwei-Zeichen-Änderung in `my-work-panel.tsx` erzeugt **956 px** Diff → rot. Unter der alten
  Verhältnis-Toleranz (~39.600 px bei dieser Bildhöhe) wäre genau diese Regression
  **unsichtbar** geblieben.
- **AC-Y143h.5** — Fixture-Drift ist abgesichert. ✅ Typ-Ebene (hat real gegriffen) +
  Laufzeit-Vertragstest (Rot-Grün belegt).
- **AC-Y143h.6** — Die Live-Seite bleibt abgedeckt. ✅ eigener Smoke ohne Bild.
- **AC-Y143h.7** — Stabilität belegt. ✅ 3× 9/9 + Kaltstart 9/9 mit geleertem `.next`.

## Gates

Playwright chromium **3× 9/9** + Kaltstart **9/9** · Rot-Grün: UI-Änderung 956 px → rot,
Fixture-Drift → rot, danach grün · ESLint **0** · tsc **13 = Baseline** (die eine zusätzliche
Meldung war der gefangene Fixture-Fehler und ist behoben). Test-only: kein Produktivcode,
keine Migration.

## Deviations

- **D-Y143h.1** — Weder (a) Masken noch (b) Seeds umgesetzt, sondern der in 143g nicht
  registrierte Weg (c). Begründung oben; (a) und (b) bleiben unnötig.
- **D-Y143h.2** — `dashboard.png` neu gezogen: die Aufnahme zeigt jetzt gefüllte Panels statt
  des leeren Mandanten. Vorher der geladene Zustand verifiziert (AC-Y143b.7-Disziplin).
- **D-Y143h.3** — Kein `dashboard-empty.png` für den Leerzustand. Wäre mit derselben Technik
  billig (Fixture mit leeren Arrays) und ist bewusst nicht mitgenommen → Followup, falls der
  Leerzustand je regressiert.
- **D-Y143h.4** — Die während dieser Slice lokal ergänzte Regel „Deployment Scope" liegt noch
  **nicht** auf `main`. Das Pro-Spec-Feld ist hier vorwärtskompatibel gesetzt
  (`tooling-only`); die `features/INDEX.md`-Spalte verlangt laut Regel eine eigene
  Portfolio-Migration und wurde daher **nicht** angelegt.
- **D-Y143h.5** — Mobile Safari übersprungen (WebKit-Host-Libs, PROJ-67/F2).

## Followups

- **PROJ-Y-143i** (optional) — `dashboard-empty.png` mit leeren Fixture-Arrays, falls der
  Leerzustand eigenständig bewacht werden soll.
- Offen aus der Reihe: **PROJ-Y-143c** (Alt-Mandant), **PROJ-Y-143e** (Sprachmix),
  **PROJ-Y-143f** (404 als Leerzustand).
