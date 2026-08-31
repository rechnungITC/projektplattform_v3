# PROJ-157 — Register-Konsistenz-Guard

## Status: Deployed
## Deployment Scope: tooling-only

**Created:** 2026-08-31

## Problem

`features/OPEN-DEFERRED-STATUS.md` führt einen Followup in **zwei** Formen: als Zeile in einer
seiner Tabellen und — bei jüngeren Slices — als Aufzählungspunkt in einem
featurebezogenen Erzähl-Abschnitt am Dateiende. Am 2026-08-28 wurde `PROJ-Y-151e`
ausgeliefert, die **Tabellenzeile** nachgezogen, der **Erzähl-Abschnitt** nicht.

Drei Tage lang sagte dieselbe Datei über dieselbe Kennung zugleich „**Erledigt und deployed**"
(Zeile 79) und „**(offen, sicherheitsrelevant)**" (Zeile 525). Wer nur den Erzählteil las, hielt
eine **geschlossene Invariante-#3-Lücke für offen** — der Fehler zeigte also in die gefährlichere
Richtung: er hätte Arbeit an etwas ausgelöst, das längst behoben war. Zusätzlich nannte die
Abschnitts-Überschrift Scope `mvp`, während INDEX **und** Spec `full` trugen.

**Nichts hat es gefangen**, und das ist der eigentliche Befund: `check:index-scope` prüft
`features/INDEX.md`, `check:token-drift` prüft `src/`, `check:migration-naming` prüft
`supabase/migrations/` — für die Datei, in der die Auslassungen des ganzen Portfolios stehen, gab
es keinen Wächter. Behoben wurde der Einzelfall in PROJ-151 (`b9c39dd`); diese Slice sichert die
Klasse.

## Messungen vor dem Entwurf (sie haben ihn umgedreht)

Alles am 2026-08-31 gegen den Live-Bestand gemessen, nicht angenommen:

| Messung | Ergebnis | Folge für den Entwurf |
|---|---|---|
| Tabellenzeilen mit Kennung | **287** über 7 Tabellen | Tabellen dürfen nicht einzeln gepflegt werden — der Parser nimmt jede Zeile, die mit `\| PROJ` beginnt |
| Erzähl-Abschnitte | **4** (PROJ-151/152/153/155) | Konvention betrifft nur jüngere Slices |
| Erzähl-Kennungen **ohne** Tabellenzeile | **6 von 6** | **Kein Fehler.** Ein Fehler daraus wäre am ersten Tag sechsfach falsch-rot → der Guard wäre abtrainiert (PROJ-150-Lehre) |
| Kennungen in **mehreren** Tabellenzeilen | **19** | R2 baubar |
| davon mit **widersprüchlichem** Zustand | **0** | R2 darf hart fehlschlagen, kein Bestandsschuld-Ratschen nötig (anders als `token-drift`) |
| Abschnitts-Scope vs INDEX-Scope | **3 Ansprüche, 3 Treffer** | R3 baubar und heute grün |
| INDEX-**Status**-Zellen | Prosa (`Deployed (α + β live)`, `Deployed (Gantt half)`) | Status wird **nicht** verglichen — würde auf legitime Formulierung feuern |

**Die tragende Umkehrung:** meine Ausgangsannahme war „Tabelle und Erzählteil führen dieselben
Kennungen und laufen auseinander". Gemessen ist das Gegenteil der Normalfall — die 6
Erzähl-Kennungen stehen **nur** dort. Der PROJ-151-Fall war der **einzige**, bei dem eine Kennung
in beiden Formen geführt wurde, und genau er ist gedriftet. Der Guard prüft daher **nur Paare**,
nicht Vollständigkeit.

## Locks (gemessene Zwänge)

- **L1 — nur Paare vergleichen.** Eine Kennung ohne Tabellenzeile ist die Konvention, kein Defekt.
  Ein Test friert das ausdrücklich ein (negative Kontrolle).
- **L2 — Zustand aus dem Fettdruck-Kopf, nicht aus dem Rumpf.** Der Rumpf erzählt Geschichte und
  enthält routinemäßig beide Vokabulare („war offen", „zunächst zurückgestellt"). Über den ganzen
  Rumpf klassifiziert wäre fast jeder Eintrag „unklar".
- **L3 — unklar heißt Warnung, nie Fehler.** Das Register ist deutsche Prosa; ein Guard, der auf
  Formulierungsvielfalt hart fehlschlägt, wird umgangen.
- **L4 — nur der Scope-Token wird gegen INDEX geprüft**, nicht der Status (Messung oben).
- **L5 — reine Dateianalyse.** Kein DB-Zugang, kein Docker, keine Secrets — wie `index-scope`,
  `migration-naming`, `token-drift`, `function-inventory`.

## Akzeptanzkriterien

- [x] **AC-157.1** `npm run check:register-consistency` existiert, ist reine Dateianalyse und
      läuft ohne Secrets. *Belegt: Lauf gegen den Bestand, exit 0.*
- [x] **AC-157.2 (R1)** Eine Kennung, die in Tabelle **und** Erzählteil geführt wird, muss in
      beiden denselben Zustand tragen; Widerspruch → **Fehler** mit beiden Zeilennummern.
      *Belegt: Lauf gegen `5e28bca^` meldet `PROJ-Y-151d` (Tabelle Z. 79 „done" vs Erzählteil
      Z. 525 „open").*
- [x] **AC-157.3 (R2)** Dieselbe Kennung in mehreren Tabellenzeilen darf nicht widersprüchliche
      Zustände tragen. *Belegt: 19 Bestandsfälle heute alle konsistent; Unit-Test für den
      Widerspruchsfall.*
- [x] **AC-157.4 (R3)** Nennt eine Abschnitts-Überschrift einen Scope, muss er mit
      `features/INDEX.md` übereinstimmen. *Belegt: Lauf gegen `5e28bca^` meldet PROJ-151
      `mvp` gegen `full`.*
- [x] **AC-157.5** Eine Erzähl-Kennung **ohne** Tabellenzeile ist **kein** Fehler und keine
      Warnung. *Belegt: negative Kontrolle im Test, rot-grün ausgeführt.*
- [x] **AC-157.6** Nicht entscheidbare Zustände erzeugen eine **Warnung**, keinen Fehler.
- [x] **AC-157.7** Findet der Parser **keinen** Erzähl-Abschnitt, warnt der Lauf laut statt still
      „OK" zu melden — ein leerer Check, der grün meldet, ist der Weg, auf dem ein Guard verrottet.
- [x] **AC-157.8** CI-Workflow vorhanden, läuft auf jedem PR gegen `main`.
- [x] **AC-157.9** Rot-Grün ausgeführt: jede der drei Regeln einzeln ausgehängt, jeweils fallen
      genau die zugehörigen Tests; Rücksetzung byte-identisch.
- [x] **AC-157.10** Der Bestand ist **grün ohne Bereinigung** — der Guard friert keine Schuld ein
      und braucht keine Ausnahmeliste.

## Tech Design

`scripts/check-register-consistency/analyze.ts` (rein, testbar) + `index.ts` (CLI, Annotationen)
+ `analyze.test.ts` — dieselbe Dreiteilung wie `check-index-scope`. Kein neues Paket.

Zustandsvokabular **gemessen** statt erfunden: `erledigt · geschlossen · resolved · deployed ·
behoben · closed` gegen `planned · offen · open · in review · approved · architected · in
progress`. `Approved` und `In Review` zählen als **offen** — es sind Lebenszyklus-Zustände *vor*
der Auslieferung.

## Bewusste Abweichungen und Grenzen (gemessen, nicht behauptet)

- **D-157.1 — R1 ist heute latent: 0 verglichene Paare.** Der Bestand führt keine Kennung in
  beiden Formen, die Regel hat also aktuell nichts zu beurteilen; getragen wird der Lauf heute von
  R2 (19 Kennungen) und R3 (3 Ansprüche). Das ist **Absicht, nicht Schwäche**: die Regel feuert
  genau dann, wenn jemand wieder doppelt bucht — und dann sofort. Belegt ist sie am echten
  Vorzustand, nicht an einem Konstrukt.
- **D-157.2 — kein Status-Abgleich gegen INDEX** (L4/Messung). Ein Abschnitt, der „Deployed"
  behauptet, während INDEX „In Progress" führt, bleibt unentdeckt.
- **D-157.3 — Vollständigkeit wird nicht geprüft.** Ein Followup, das **nirgends** registriert ist
  (der PROJ-Y-113c-Fall: nur in einer Spec zugesagt), fällt nicht auf. Dafür bräuchte es einen
  Abgleich gegen alle `features/PROJ-*.md`, und dort ist jede Kennungs-Nennung Prosa — hohe
  Falsch-Rot-Gefahr, eigene Slice wenn es je auftritt.
- **D-157.4 — „Next Available ID" wird nicht geprüft.** Während dieser Slice zeigte sich, dass
  INDEX `PROJ-156` als frei führt, obwohl eine fremde Spur die Slice hält
  (`proj-156/assistant-dialog-continuity`). Ein reiner Dateicheck hätte das **nicht** gefangen —
  die fremde Zeile ist noch nicht gemergt, INDEX ist in sich stimmig. Der zuständige Wächter ist
  `check:branch-collision`, und er hat es gefangen. Festgehalten, nicht gebaut.
- **D-157.5 — als Required Check eingetragen, kein offener Handoff.** Anders als bei
  PROJ-42/74/148e/Y-51d ist das Enrollment am 2026-08-31 auf Nutzer-Entscheid mit erfolgt:
  `main protection` (id `15992143`) trägt **5 → 6** Contexts, mit `main protection1` sperren **7**.
  Die Nutzlast wurde **aus dem gelesenen Ruleset** gebaut, damit keine Regel verlorengeht — genau
  der Fehler, den PROJ-147 gemessen hat — und danach unabhängig nachgelesen.
- **D-157.6 — kein CIA-Pass.** Kein neues Paket, kein Refactoring, keine Architekturentscheidung,
  keine Agentenänderung; Muster von `check-index-scope` übernommen. Präzedenz: PROJ-150 und
  PROJ-Y-148e ebenso ohne Pass.

## Befunde am eigenen Guard (Dogfooding)

- **F-157.1 (behoben) — `indexScope` splittete naiv auf jedes Pipe-Zeichen.** Beim Buchen dieser
  Slice meldete der Guard eine **Phantom**-Abweichung: er las als Scope-Zelle ein Prosa-Fragment,
  weil er die Hausschreibweise `\|` für Pipes in Prosa ignorierte. Betroffen wären **fünf**
  INDEX-Zeilen, die berechtigt escapte Pipes tragen (PROJ-78/79/92/142/Y-142a) — heute latent, weil
  keines dieser Features einen Erzähl-Abschnitt mit Scope-Anspruch hat. Behoben über einen
  escape-bewussten `splitCells` nach dem Vorbild von `check-index-scope` (`structuralPipes`), in
  **beiden** Parsern verwendet (Registertabellen **und** INDEX-Zellen), plus 3 Regressionstests.
  Rot-Grün: naiver Split → **3** Tests rot **und** 1 Fehler gegen den echten Bestand.
- **F-157.2 (behoben, eigener Text) — unescaptes Pipe in der neuen INDEX-Zeile.** Beim Formulieren
  der Zeilenprosa geriet ein rohes `|` in den Text; `check:index-scope` schlug korrekt an
  (Zeilenzahl 199 → 198), dieser Guard meldete die Folgewirkung. Zwei Wächter, zwei Meldungen, ein
  Tippfehler — genau die Arbeitsteilung, für die sie gebaut sind.

## Nachweise

- **Lauf gegen den Bestand:** `287 table row(s), 4 narrative section(s), 6 narrative claim(s) —
  0 id(s) recorded in both places and compared, 0 error(s), 0 warning(s)` → exit 0.
- **Echter Vorzustand (`5e28bca^`), beide Hälften des Defekts gefangen:**
  - `PROJ-Y-151d: the register contradicts itself — table line 79 says "**Erledigt und deployed
    2026-08-28** …" (done), narrative line 525 says "… (offen, sicherheitsrelevant)" (open).`
  - `PROJ-151: scope disagrees — narrative header line 523 says \`mvp\`, features/INDEX.md says
    \`full\`.`
- **Unit-Tests:** 17/17.
- **Rot-Grün, je über eine Dateikopie zurückgesetzt (nicht `git checkout`):** R1 ausgehängt →
  **2** rot · R3 ausgehängt → **1** rot · „nur im Erzählteil" fälschlich als Fehler → **1** rot
  (die negative Kontrolle beißt) · zurückgesetzt byte-identisch → 17/17.
- **Gates:** ESLint 0 · tsc 13 = Baseline / 0 neu · vitest gesamt grün · `check:index-scope` OK ·
  `check:migration-naming` OK · `check:token-drift` OK · `check:register-consistency` OK.

## Deployment

**Deployed 2026-08-31: Tag `v2.87.0-PROJ-157` auf dem Merge-Commit `d4f4a07` (PR #509, squash).**
Der Merge **ist** die Auslieferung; ein Post-Deploy-Smoke wäre gegenstandslos, weil die Slice keine
Route und kein Laufzeitverhalten anfasst (kein `src/`-Diff, keine Migration, kein Paket).

**Der tragende Nachweis ist der Guard selbst in CI:** auf #509 lief
`Verify features/OPEN-DEFERRED-STATUS.md does not contradict itself` **grün** — belegt in der
Umgebung, in der er künftig sperrt, nicht nur lokal. Checks **9 → 10**. Nach dem Merge aus `main`
unabhängig nachgemessen: Guard OK (287 Tabellenzeilen, 5 Abschnitte), Unit-Tests **17/17**.

**Enrollment (Nutzer-Entscheid, im selben Zug):** `main protection` **5 → 6** Contexts; mit
`main protection1` (`Vercel Preview Comments`) sperren **7** statt 6. Unabhängig nachgelesen:
alle **4** Regeltypen erhalten, `enforcement=active`, `strict=true`, `main protection1` unberührt.

**Lebende Probe beim Buchen — der stärkste verfügbare Nachweis:** der Register-Kopf wurde
absichtlich auf `mvp` gesetzt, während INDEX `tooling-only` trug. Der Guard fing seinen **eigenen**
Fehleintrag:

```
::error::PROJ-157: scope disagrees — narrative header line 625 says `mvp`,
  features/INDEX.md says `tooling-only`.
```

Nach der Korrektur war er still. Damit ist R3 nicht nur an einem historischen Stand belegt, sondern
an frisch geschriebenem Inhalt.

**Nebenbefund, festgehalten:** der Branch-Kollisions-Guard wertete den eigenen, Minuten alten Tag
beim Anlegen des Buchführungs-Zweigs korrekt nur als **Warnung** („you shipped it. Follow-up work
is fine; starting the slice over is not") — PROJ-Y-151cs Fix wirkt, es war kein Bypass nötig.
