---
id: PROJ-Y-143g
title: "Gemessene Toleranz für die fünf fullPage-Visual-Baselines"
issue_type: Chore
epic_code: HYGIENE
epic_title: "Hygiene & Supply-Chain"
priority: Medium
priority_source: "Should"
labels: ["hygiene", "testing", "ui"]
dependencies: ["PROJ-Y-143d", "PROJ-51"]
roles: ["Platform"]
summary_for_jira: "[HYGIENE] Visual-Regression: Toleranz der fullPage-Baselines messen statt erben"
---

# PROJ-Y-143g: gemessene Toleranz statt geerbter Verhältniszahl

## Status: Deployed
**Created:** 2026-08-12
**Deployed:** 2026-08-12 — Tag `v2.50.0-PROJ-Y-143g`
**Origin:** Fund F-3 aus der PROJ-Y-143d-Abnahme.

## Problem

PROJ-Y-143d hat die zwei viewport-fixierten Aufnahmen auf eine **absolute** Schranke gezogen
(`maxDiffPixels: 20`), nachdem gemessen war: Rauschen 0 px, kleinste sinnvolle Änderung 42 px,
geerbte Toleranz ~18.400 px. Die fünf `fullPage`-Baselines blieben bewusst auf
`maxDiffPixelRatio: 0.02` — ihr Rauschen war **ungemessen**, und eine Verhältniszahl skaliert
mit der Bildfläche:

| Baseline | Bildgröße | von `0.02` erlaubt |
|---|---|---|
| `settings-tenant` | 1280 × 4505 | **~115.300 px** |
| `dashboard` | 1280 × 1714 | ~43.900 px |
| `stammdaten` | 1280 × 1554 | ~39.800 px |
| `settings` | 1280 × 868 | ~22.200 px |
| `stammdaten-resources` | 1280 × 720 | ~18.400 px |

Je länger die Seite, desto blinder der Test. Das ist genau verkehrt herum.

## Was gemessen wurde

Alles unten ist gemessen, nichts geschätzt.

### 1. Rauschen

Alle sieben Aufnahmen, Toleranz 0, drei aufeinanderfolgende Läufe: **pixel-identisch**.
Zusammen mit den vier Läufen aus PROJ-Y-143d ist das Lauf-zu-Lauf-Rauschen dieser Suite
durchgehend **0 px**.

### 2. Kleinste sinnvolle Änderung (je Seite ein Zwei-Zeichen-Wechsel)

| Seite | geänderter Text | Diff |
|---|---|---|
| `stammdaten` | `h1` „Stammdaten" | **228 px** |
| `stammdaten-resources` | Fehlertext „Resource not found." | **44 px** |
| `settings` | Untertitel im Settings-Layout | **42 px** |
| `settings-tenant` | derselbe Untertitel | **42 px** |
| `dashboard` | KPI-Zähler 0 → 3 | **82 px** |

Damit liegt die kleinste echte Änderung bei ~42 px, das Rauschen bei 0 — die Schranke gehört
dazwischen. `maxDiffPixels: 20` (dieselbe wie in 143d) trägt für alle.

## Die eine Seite, die anders behandelt wird: `dashboard`

Hier hätte die reine Zahl in die Irre geführt. Das Rauschen ist zwar auch 0, aber **nicht,
weil die Seite deterministisch ist** — sondern weil der Mandant leer ist. Der ausgelesene
Seitentext zeigt durchgehend Nullen:

```
OFFENE AUFGABEN 0 · ÜBERFÄLLIG 0 · GENEHMIGUNGEN 0 ·
PROJEKTE UNTER BEOBACHTUNG 0 · My Work „0 Items"
```

Vier der Dashboard-Panels formatieren Zeit (`my-work-panel`, `approval-inbox-panel`,
`deliverable-approval-inbox-panel`, `recent-reports-panel`). Sie sind heute still, weil dem
`[E2E]`-Nutzer nichts zugewiesen ist. Die erste zugewiesene Aufgabe, die erste Genehmigung
oder der erste Report in diesem Mandanten ändert das Bild — durch **Daten**, nicht durch eine
UI-Regression.

Beide Hörner wurden gemessen, nicht abgewogen:

- **eng (20 px):** der Zählerwechsel kostet 82 px → ein fremder Spec, der Daten anlegt, macht
  diesen Test rot für etwas, das er gar nicht bewacht. Das ist Flakiness, keine Abdeckung.
- **Verhältnis 0.02:** ~43.900 px auf dieser Bildfläche → selbst ein volllaufendes
  My-Work-Panel liefe stillschweigend durch.

Also ist **keine** Toleranzzahl richtig; die Seite muss deterministisch gemacht werden. Das
heißt entweder gepinnte Seed-Daten oder Masken über die Datenpanels — und Masken brauchen
Test-Hooks in sieben Produktionskomponenten (KPI-Strip + sechs Panels tragen heute keine
stabilen Selektoren). Das ist eine eigene Slice und keine Zahl → **PROJ-Y-143h**.

Bis dahin behält das Dashboard `0.02` und bewacht **wissentlich nur Layout**. Der Testkommentar
sagt das ausdrücklich, damit es nicht wie ein Versehen aussieht. Vorgeführt statt behauptet:
im Rot-Grün-Lauf ist das Dashboard mit der 82-px-Datenänderung als **einzige** Seite grün
geblieben.

## Der Wächter hat noch während der Slice zugeschlagen

Zwischen dem Aufsetzen und dem Merge zog `main` weiter: PROJ-130-γ2b (#338) hängte eine Karte
**„Revisionszugriff"** ins Stammdaten-Raster. Beim Nachziehen des Branches wurde
`stammdaten` prompt rot — 1554 → **1574 px**, 34.129 abweichende Pixel.

Das ist keine Regression, sondern eine **legitime Funktionsergänzung, die ohne Neuaufnahme der
Baseline gemergt wurde** — möglich, weil die Visual-Suite nicht in CI läuft, sondern lokal.
Genau dafür sind diese Tests da.

Ehrlich eingeordnet: **diesen** Fall hätte auch die alte Toleranz gefangen, weil sich die
Bildhöhe geändert hat und Playwright bei abweichender Bildgröße unabhängig von der Toleranz
fehlschlägt. Der Gewinn der Verschärfung liegt bei Änderungen **innerhalb** gleicher Höhe —
umbenannte Karten, vertauschte Labels, geänderte Beschreibungen. Die hätten bei
`stammdaten` bis zu ~39.800 Pixel groß sein dürfen.

Vor dem Neuziehen wurde der geladene Zustand geprüft statt blind aufgenommen (AC-Y143b.7):
14 Karten, „Revisionszugriff" sichtbar, `scrollHeight` 1574 = neue Bildhöhe. Aufnahme über
**Löschen der Datei**, nicht über `--update-snapshots` — Letzteres ist unter der Toleranz ein
stiller No-op (Werkzeug-Fund aus 143d).

## Acceptance Criteria

- **AC-Y143g.1** — Rauschen aller `fullPage`-Baselines gemessen (mehrere Läufe, Toleranz 0). ✅ 0 px
- **AC-Y143g.2** — Kleinste sinnvolle Änderung je Seite gemessen. ✅ 42–228 px
- **AC-Y143g.3** — Schranke liegt zwischen beidem, wo das tragfähig ist. ✅ 4 von 5 auf
  `maxDiffPixels: 20`
- **AC-Y143g.4** — Wo es **nicht** tragfähig ist, steht der Grund im Test statt einer stillen
  Beibehaltung. ✅ `dashboard`, mit beiden gemessenen Hörnern
- **AC-Y143g.5** — Rot-Grün: die verschärften Tests werden bei einer Änderung in der bewachten
  Region rot. ✅ 4/4 rot, danach 7/7 grün
- **AC-Y143g.6** — Keine Baseline **wegen der Schranke** neu gezogen. ✅ Eine Ausnahme mit
  eigenem Grund: `stammdaten` wurde neu aufgenommen, weil PROJ-130-γ2b während der Slice eine
  Karte ergänzt hat (1554 → 1574 px) — verifizierter geladener Zustand, nicht kosmetisch.

## Gates

Playwright chromium **3× 7/7** + Kaltstart mit geleertem `.next` **7/7** · Rot-Grün **4/4 rot**
(Dashboard bewusst grün), danach **7/7** · ESLint **0** · tsc **13 = Baseline, 0 in der
geänderten Datei**. Test-only: kein Produktivcode, keine Migration.

## Deviations

- **D-Y143g.1** — `dashboard` behält die Verhältnis-Toleranz. Bewusst und begründet (s. o.),
  nicht vergessen → PROJ-Y-143h.
- **D-Y143g.2** — `stammdaten-resources` wird verschärft, obwohl es einen **Fehlerzustand**
  einfriert (PROJ-Y-143f). Der Zustand ist statisch, die Schranke also sicher; sie sorgt
  zusätzlich dafür, dass der Test beim Beheben von 143f rot wird — was richtig ist, die
  Baseline wird dort ohnehin neu gezogen.
- **D-Y143g.3** — Mobile Safari übersprungen (WebKit-Host-Libs, PROJ-67/F2).
- **D-Y143g.4** — `stammdaten.png` neu gezogen (s. o.). Ursache liegt außerhalb dieser Slice
  (PROJ-130-γ2b), die Aufnahme geschah nach Prüfung des geladenen Zustands.

## Followups

- **PROJ-Y-143h** (neu) — Dashboard-Baseline deterministisch machen: gepinnte Seed-Daten oder
  Masken über KPI-Strip und die sechs Datenpanels (braucht stabile Test-Hooks in den
  Komponenten). Erst danach ist dort eine gemessene Schranke möglich.
- **PROJ-Y-143f** (offen) — nach dem 404-Fix `stammdaten-resources` neu ziehen; der Test wird
  durch die neue Schranke von selbst darauf hinweisen.
