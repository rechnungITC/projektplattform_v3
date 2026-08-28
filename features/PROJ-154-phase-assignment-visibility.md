# PROJ-154 — Phasenzuordnung sichtbar machen + Feld-Audit für `phase_id`/`milestone_id`

## Status: Deployed
## Deployment Scope: full

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
- **Zweite Verhaltensprobe für `milestone_id`** (ebenfalls zurückgerollt): ein
  angelegter Meilenstein wird zugewiesen → genau **1** Audit-Zeile für
  `milestone_id`, während `phase_id` bei **0** bleibt. Damit ist die Wirkung
  spaltengenau belegt, nicht nur als Zugehörigkeit zur Whitelist.
- Gates auf dem endgueltigen Branch-Stand (Basis `789e1b9`): vitest **3936/3936**
  (456 Dateien) · ESLint 0 · tsc **13 = Baseline / 0 neu** · Build clean ·
  migration-naming 0 · index-scope 0 · token-drift 0. Die Zahl ist an den Stand
  gebunden statt absolut genannt: `main` ist waehrend der Slice dreimal gewandert
  (3925 → 3933 → 3936), die Differenz sind ausschliesslich fremde Tests.

## Abweichungen

- **D-154.1 geschlossen (2026-08-28).** `milestone_id` ist jetzt ebenfalls per
  eigenem UPDATE gegen Prod belegt: in einer zurückgerollten Transaktion einen
  Meilenstein angelegt, zugewiesen → genau **1** Audit-Zeile für `milestone_id`,
  und `phase_id` bleibt dabei bei **0** — die Whitelist wirkt also spaltengenau
  statt pauschal. 0 Rückstände (0 Meilensteine, 0 Sondenreste, 0 Audit-Zeilen).
- **D-154.2** Die Planung lädt jetzt **alle** Work-Items eines Projekts statt nur
  Arbeitspakete und filtert clientseitig. Bei den gemessenen Größen (33–40 Items)
  unkritisch; die bekannte Grenze ist als PROJ-Y-101d registriert. Serverseitig
  wäre `kind.eq.work_package,phase_id.not.is.null` möglich, dafür müsste
  `useWorkItems` ein `or`-Filter lernen — eigener Eingriff in einen von vielen
  Flächen geteilten Hook.
- **D-154.3** Gantt-Prop-Name unverändert (siehe oben).
- **D-154.4** Kein authentifizierter Browser-Durchlauf: die Regel ist als reine
  Funktion rot-grün belegt, die Verkettung im Browser nicht.

## Deployment

**Deployed 2026-08-28: PR #497 (squash) → main `1cc4e8f`, Tag `v2.85.0-PROJ-154`.**

Der Merge **ist** die Auslieferung des Anzeige-Fix; die Migration
`20260828100000` liegt seit dem Bau in Prod, beim Merge also **kein
Runtime-DB-Change**. Produktions-Deployment `6138138954` **success**, gebaut aus
genau diesem SHA. Alle **9** Pflicht-Checks grün, darunter der
**Schema-Drift-Wächter** — er spielt die Migrationsdateien in eine frische
Shadow-DB ein und belegt damit unabhängig, dass die Anker-Ersetzung auch dort
greift (bis dahin war sie nur gegen die Live-Definition gemessen).

**Post-Deploy-Smoke mit Gegenprobe:** `/planung`, `/phasen` und `/backlog`
antworten **307** mit Rumpf `Redirecting...` — und **ein erfundener Pfad antwortet
ebenfalls 307**. Der Smoke belegt also das Auth-Gate ohne Leck, **nicht** die
Existenz der Flächen; nötig ist das hier auch nicht, weil die Slice **keine neue
Route** anlegt, sondern nur ändert, was die bestehende Planungsseite geladen
bekommt.

**Zwei Rebases beim Merge**, weil `main` während der Slice dreimal gewandert ist
(`PROJ-Y-151d`, `PROJ-Y-150g`). Beide Konflikte lagen im INDEX-Hotspot und wurden
**nicht** durch Übernahme einer Seite gelöst: die fremde Zeile `PROJ-Y-151d` ist
per `diff` gegen `origin/main` als **byte-identisch** belegt, und über die gesamte
Tabelle sind **0 fremde Zeilen** verloren gegangen (196 → 197, genau die eigene
dazu).

### Scope-Entscheidung: `full`

Alle **9** Akzeptanzkriterien sind erfüllt und **nichts ist zurückgestellt** —
**PROJ-Y-154a** ist eine neu *entdeckte* Nachbarfrage (eine gemessene
Entwurfsentscheidung des KI-Pfads), keine Auslassung dieser Slice: kein Kriterium
verlangt, dass der Accept-Weg eine Phase setzt.

Zur Bedingung „production behavior is verified", ausgesprochen statt still
entschieden: die **Audit-Hälfte** ist mit zwei Verhaltensproben gegen Prod belegt.
Die **Anzeige-Hälfte** ist über die rot-grün belegte reine Regel plus die
**unveränderte** Renderkette belegt (`PhaseList` filtert weiter auf
`phase_id === phase.id`, `PhaseCard` rendert weiter `phaseWorkItems`) — neu ist
ausschließlich die *Menge*, die hineingeht, und diese Kette war für Arbeitspakete
bereits in Betrieb. Das unterscheidet die Lage von **PROJ-152** (dort `mvp`), wo
der Kernmechanismus — das Auslösen des Zeitbudgets — in Produktion nie stattfand
und auch nicht erzwingbar war. Offen bleibt allein die Nachweistiefe eines
angemeldeten Durchlaufs → **PROJ-Y-154b**, eine Erweiterung, kein unerfülltes
Kriterium.
