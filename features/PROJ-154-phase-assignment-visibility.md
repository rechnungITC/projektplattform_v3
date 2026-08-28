# PROJ-154 — Phasenzuordnung sichtbar machen + Feld-Audit für `phase_id`/`milestone_id`

## Status: In Progress
## Deployment Scope: —

## Anlass

Nutzer-Meldung 2026-08-28: „die Arbeitspakete tauchen nicht in der Phasenplanung
auf, obwohl diese zugeteilt wurden".

## Befund (live gegen Prod gemessen, Projekt `AUE_0001`, Wasserfall)

| | Anzahl | mit `phase_id` |
|---|---|---|
| Arbeitspakete (`work_package`) | 18 | **0** |
| Aufgaben (`task`) | 22 | **1** |

Drei getrennte Ursachen, nicht eine:

1. **Der KI-Accept-Pfad kann keine Phase setzen.** Alle 39 Work-Items tragen
   `ki_provenance`-Zeilen, sind also über PROJ-70 („Projekt befüllen") entstanden.
   Die Live-Definition von `accept_proposal_from_context_bulk` erwähnt `phase_id`
   an **keiner** Stelle. → Kein Defekt dieser Slice, sondern eine bewusste
   Entwurfsentscheidung (siehe unten) → **PROJ-Y-154a**.
2. **Die Planungsansicht zeigte nur `work_package`** (`planung-client.tsx:39`,
   `kinds: ["work_package"]`). Der einzige tatsächlich zugeordnete Datensatz ist
   ein `task` und war deshalb in Phasenliste **und** Gantt unsichtbar — obwohl der
   Bearbeiten-Dialog jedem Work-Item einen Phasen-Picker anbietet und dazu
   ausdrücklich „für Wasserfall-WBS + Gantt" sagt. **Das ist der Defekt dieser
   Slice.**
3. **Kein Item hat Termine** (`planned_start`/`planned_end` und die abgeleiteten
   je 0 von 40) → im Gantt gibt es nichts zu zeichnen; `gantt-view.tsx:1271`
   rendert dafür eine klickbare Platzhalterzeile. Kein Defekt, nur zu wissen.

**Nebenbefund, der die Diagnose begrenzte:** `phase_id` und `milestone_id` fehlten
in `_tracked_audit_columns('work_items')` (18 Spalten, beide nicht dabei). Es gab
also **keine Audit-Spur für Phasenzuweisungen** — womit nicht rekonstruierbar war,
ob weitere Zuweisungen versucht wurden und verloren gingen. Gleiche Klasse wie die
Geisterspalten aus PROJ-Y-130s.

## Akzeptanzkriterien

- **AC-154.1** Ein Work-Item mit gesetzter `phase_id` erscheint in der Phasenliste,
  unabhängig von seiner Art (`task`, `story`, `work_package`, …).
- **AC-154.2** Ein Work-Item mit gesetzter `phase_id` erscheint als Gantt-Zeile
  unter seiner Phase, unabhängig von seiner Art.
- **AC-154.3** Ein Arbeitspaket **ohne** Phase bleibt im Gantt sichtbar (Eimer
  „ohne Phase") — bisheriges Verhalten unverändert.
- **AC-154.4** Ein Nicht-Arbeitspaket **ohne** Phase erscheint **nicht** im Gantt.
  Ohne diese Einschränkung liefe der Eimer „ohne Phase" mit jedem phasenlosen
  Task voll (im Messprojekt 22 zusätzliche Zeilen).
- **AC-154.5** Gelöschte Items erscheinen in keiner der beiden Flächen.
- **AC-154.6** Die Phasenkarte benennt neutral, was sie zeigt („Zugeordnete
  Elemente"), und die Art jeder Zeile ist am Abzeichen erkennbar. Ein Titel
  „Arbeitspakete" über einer Liste mit Aufgaben wäre eine falsche Zusage.
- **AC-154.7** `work_items.phase_id` und `work_items.milestone_id` sind
  audit-getrackt; eine Zuweisung erzeugt eine Feld-Audit-Zeile mit Alt- und
  Neuwert.
- **AC-154.8** Die Erweiterung der Whitelist lässt alle 78 Zweige und ihre Inhalte
  unberührt (Anker-Ersetzung aus der Live-Definition, whitespace-tolerant, mit
  Treffer-Eindeutigkeit und Post-Verifikation).
- **AC-154.9** Beide neu aufgenommenen Spalten existieren wirklich auf
  `work_items` — die Migration prüft das selbst, weil eine Whitelist mit
  Geisterspalte **lautlos** nichts protokolliert (PROJ-Y-130s-Falle).

## Umsetzung

**Fix 1 — Planungsansicht (Frontend, kein Backend-Eingriff).** Neue reine Lib
`src/lib/work-items/planning-items.ts` mit **zwei** Regeln, weil die beiden
Flächen unterschiedliche Mengen brauchen; `planung-client.tsx` lädt jetzt ohne
`kinds`-Filter und leitet beide Mengen ab. Phasenkarte, Phasenliste und
Gantt-Prop-Doku sprachlich nachgezogen.

**Bewusst nicht umbenannt:** die Gantt-Prop heißt weiter `workPackages`, obwohl
sie jetzt auch Aufgaben enthält — umbenennen hieße 1809 Zeilen Diff-Fläche und
Visual-Baselines anzufassen; der Doc-Kommentar sagt es stattdessen aus.

**Fix 2 — Feld-Audit.** Migration `20260828100000_proj154_audit_phase_milestone`
(Anker-Ersetzung, selbstprüfend, idempotent). Aufnahmeregel aus PROJ-Y-130s
angewandt: beide Spalten sind Fremdschlüssel auf projektinterne Strukturen, also
ohne Personenbezug und ohne Freitext, und über die Oberfläche veränderbar.
`sprint_id` war schon getrackt — die drei Zeitachsen-Zuordnungen sind damit
vollständig.

## Nachweise

- **Unit 9/9** (`planning-items.test.ts`), **Rot-Grün ausgeführt**: mit der alten
  Regel fallen **4 von 9**, danach per Dateikopie zurückgesetzt (byte-identisch,
  kein `git checkout` — PROJ-130-δ2/F-3). Ein Fall ist ausdrücklich die
  Gegenkontrolle „die neue Menge ist echt weiter als die alte".
- **Prod-Whitelist:** 18 → **20** Spalten, `phase_id`/`milestone_id` beide
  getrackt, **78 Zweige unverändert**, Geschwister-Zweige intakt (`phases` 8,
  `risks` 11, `construction_defects` 9).
- **Verhaltensprobe gegen Prod, Rollback erzwungen, 0 Rückstände:** ein UPDATE auf
  `phase_id` erzeugt genau **1** Audit-Zeile mit `alt=null` →
  `neu="6680a512-…"`; **Gegenprobe** `attributes` (nicht in der Whitelist) erzeugt
  **0** Zeilen. Ohne die zweite Hälfte belegte die erste nur, dass irgendein
  Trigger schreibt — nicht, dass die Whitelist ihn steuert.
- Gates: ESLint 0 · tsc 13 = Baseline / 0 neu · migration-naming 0 · index-scope 0.

## Abweichungen

- **D-154.1** `milestone_id` ist strukturell belegt (dieselbe Whitelist, derselbe
  Trigger, in Prod als getrackt gemessen), aber **nicht** über einen eigenen
  UPDATE ausgeübt — `AUE_0001` hat keinen Meilenstein, ein Nachweis hätte einen
  anlegen müssen.
- **D-154.2** Die Planung lädt jetzt **alle** Work-Items eines Projekts statt nur
  Arbeitspakete und filtert clientseitig. Bei den gemessenen Größen (33–40 Items)
  unkritisch; die bekannte Grenze ist als PROJ-Y-101d registriert. Serverseitig
  wäre `kind.eq.work_package,phase_id.not.is.null` möglich, dafür müsste
  `useWorkItems` ein `or`-Filter lernen — eigener Eingriff in einen von vielen
  Flächen geteilten Hook.
- **D-154.3** Gantt-Prop-Name unverändert (siehe oben).
- **D-154.4** Kein authentifizierter Browser-Durchlauf: die Regel ist als reine
  Funktion rot-grün belegt, die Verkettung im Browser nicht.
