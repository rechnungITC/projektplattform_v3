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

---

## Nachtrag 2026-08-11 — der Test kann den Ladezustand einfrieren (Fund aus dem E2E-Lauf gegen main)

Beim vollen E2E-Lauf gegen `main` (`61943e6`, nach der Merge-Kette #303/#304/#302/#301) fiel `dashboard.png` erneut aus — **stabil, zweimal isoliert reproduziert**, also kein Flake. Die Untersuchung hat aber keinen Inhalts-, sondern einen **Anker-Fehler** des Tests zutage gefördert. Er ist für diese Spec unmittelbar relevant, weil er die Verlässlichkeit jedes Re-Baselinings betrifft.

**Symptom:** kein Pixel-Diff, sondern ein Höhenunterschied — erwartet 1714 px, erhalten 1430 px. Das `-actual.png` zeigt das Dashboard vollständig im **Skeleton-Zustand**: KPI-Kacheln ohne Zahlen, My-Work-Badges auf `0`, Alerts/Genehmigungen/Deliverable-Freigaben/Project-Health/Reports als graue Platzhalter.

**Messung** (temporäre Probe, danach entfernt):

| Ereignis | Zeitpunkt |
|---|---|
| Sidebar sichtbar (= Warte-Anker des Tests) | 1061 ms |
| finale `scrollHeight` 1714 px erreicht (= Baseline-Höhe) | 2084 ms |
| `/api/dashboard/summary`, `…/approvals`, `…/deliverable-approvals` | alle **200** |

**Ursache:** `tests/PROJ-51-visual-regression-authenticated.spec.ts:43-47` wartet auf `[data-sidebar='sidebar']` — laut Kommentar „the most stable indicator of *fully loaded*". Das ist die **Shell-Hydration**, nicht die Datenverfügbarkeit. Die Panels laden danach asynchron nach. Sind die `/api/dashboard/*`-Routen im Dev-Server **kalt**, kostet deren Turbopack-Erstkompilierung mehr als das 5-s-Budget von `toHaveScreenshot`, und der Test vergleicht gegen Skeletons. Mit warmen Routen: **7/7 grün**, Baseline unverändert korrekt.

Der Warm-Compile aus PROJ-138 / PROJ-67 AC-9 (`warmCompileDeepLinkRoutes`) wärmt ausschließlich **Seiten**-Routen — `/api/**` ist nicht abgedeckt.

**Warum das hierher gehört:** Das Re-Baselining aus PROJ-143 hat den *geladenen* Zustand erwischt (1714 px), also gut ausgegangen. Unter kalten API-Routen hätte derselbe Vorgang jedoch **Skeletons** als Baseline eingefroren — und der Test wäre anschließend dauerhaft grün gewesen, während er nichts als eine Ladeanimation bewacht. Das ist exakt die Klasse „grün, sagt aber nichts aus", die diese Spec adressiert, nur eine Ebene tiefer: nicht der Inhalt war falsch, sondern der Zeitpunkt der Aufnahme ist nicht garantiert.

### Ergänzende Acceptance Criteria

- **AC-Y143b.5** — Der Snapshot-Test wartet auf einen **Daten**-Indikator statt auf die Shell (z. B. Verschwinden der Skeletons bzw. ein gerendertes Panel), sodass weder Vergleich noch Neuaufnahme den Ladezustand erwischen können.
- **AC-Y143b.6** — Entweder sind die `/api/dashboard/*`-Routen in den Warm-Compile aufgenommen, **oder** es ist belegt, dass der Daten-Anker aus AC-Y143b.5 den Kaltstart allein abfängt (ein Lauf mit frisch geleertem `.next/dev` ist grün).
- **AC-Y143b.7** — Für jede künftige Neuaufnahme ist festgehalten, dass sie nur im **verifiziert geladenen** Zustand erfolgen darf; ein Baseline-Bild im Skeleton-Zustand gilt als Fehler, nicht als neue Wahrheit.

### Reproduktion

```
rm -rf .next/dev   # API-Routen kalt erzwingen
npx playwright test tests/PROJ-51-visual-regression-authenticated.spec.ts --project=chromium
# → dashboard.png rot: "Expected an image 1280px by 1714px, received 1280px by 1430px"
# unmittelbar danach erneut (Routen jetzt warm) → 7/7 grün
```

---

## Umsetzung 2026-08-11 — AC-Y143b.5 / .6 / .7 erledigt

**AC-Y143b.5 (Daten-Anker).** Alle sieben authentifizierten Snapshot-Tests nutzen jetzt einen gemeinsamen Helfer `waitForDataReady()` statt des Sidebar-Ankers. Er wartet zusätzlich darauf, dass kein `[data-slot="skeleton"]` mehr im DOM ist. Der veraltete Kommentar („most stable indicator of *fully loaded*") ist entfernt — er behauptete das Gegenteil des Gemessenen.

Zwei Entscheidungen dabei:

- **Anker ist `[data-slot="skeleton"]`, nicht `.animate-pulse`.** Es gibt dauerhaft pulsierende Elemente (Live-Dot in `sprint-card`, `trajectory-badges`); auf diesen Seiten würde ein Klassen-Anker nie null erreichen und den Test in den Timeout laufen lassen. Zusätzlich lässt `cn`s tailwind-merge zu, dass ein `rounded-full` des Aufrufers das `rounded-md` des Primitives verdrängt — eine Klassen-Kombination ist also ebenfalls nicht verlässlich.
- **Eine Zeile Produktivcode**, entgegen der Annahme „kein Produktivcode erwartet": `src/components/ui/skeleton.tsx` bekommt `data-slot="skeleton"`. Rein additives Attribut, kein Styling, kein Verhalten — und genau das, was upstream shadcn/ui inzwischen selbst tut.

**AC-Y143b.6 (Kaltstart-Beleg).** Der zweite Zweig ist erfüllt, der Warm-Compile bleibt unangetastet: Der Lauf erfolgte in einem frischen Worktree **ganz ohne `.next`** — also härter als „nur `.next/dev` geleert" — und das Dashboard war grün. Der 30-s-Wartebudget im Helfer deckt die Turbopack-Erstkompilierung der `/api/**`-Routen ab.

**AC-Y143b.7 (Regel für Neuaufnahmen).** Im Helfer dokumentiert, inklusive Begründung, warum eine Baseline im Ladezustand schlimmer ist als ein roter Test.

### Was die Umstellung aufgedeckt hat

Der Daten-Anker fotografiert erstmals den geladenen Zustand — und **drei Baselines fielen dabei durch**:

| Snapshot | Baseline | Tatsächlich |
|---|---|---|
| `projects-list.png` | **720 px** — leerer Viewport | 1200 px |
| `project-room.png` | **720 px** — leerer Viewport | 2423 px |
| `settings-tenant.png` | 4465 px | 4505 px, 3 % Diff (Toleranz 2 %) |

Das ist der in AC-Y143b.7 beschriebene Fall, in schärfster Ausprägung: zwei Baselines sind **leere Seiten**. Sie waren dauerhaft grün, weil der alte Anker so früh auslöste, dass die Seite noch leer war — passend zur leeren Baseline. Die Tests bewachten nichts und meldeten Erfolg.

Sie wurden **nicht** neu gezogen: `projects-list` rendert relative Zeitstempel und wächst mit jedem E2E-Lauf (die Läufe legen Projekte an und räumen nicht ab), `project-room` ebenso. Ein Re-Baseline verschöbe das Rot nur in den nächsten Lauf. Stattdessen sind alle drei als `test.fixme()` mit Begründung markiert — bewusst nicht `skip`, damit sie im Report sichtbar bleiben — und in **PROJ-Y-143d** als eigener Eintrag erfasst (AC-Y143b.3: keine stillschweigend „passend" gemachte Baseline).

Endstand der authentifizierten Suite: **4 passed, 3 fixme**, davon das Dashboard im vollständigen Kaltstart.
