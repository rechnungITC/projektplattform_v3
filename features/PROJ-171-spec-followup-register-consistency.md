# PROJ-171 — Followup-Listen der Feature-Specs gegen den Register-Zustand prüfen (R4)

## Status: Planned
## Deployment Scope: —

**Created:** 2026-09-04
**Origin:** Befund aus PROJ-Y-155f+g (#547). Dort sagte `features/OPEN-DEFERRED-STATUS.md`
„erledigt 2026-09-03", während die Followup-Liste der PROJ-155-Spec dieselbe Kennung weiter im
Präsens als offen führte — und `check:register-consistency` meldete **OK**, weil er per Entwurf
keine Feature-Spec gegen den Register-Zustand prüft.
**Art:** Wächter-Erweiterung plus Bereinigung des Bestands. Reine Dateianalyse, kein DB-Zugang,
kein Secret, kein `src/`-Diff erwartet.

## Dependencies

- Requires: **PROJ-157** (Register-Konsistenz-Guard) — R4 wird eine vierte Regel in
  `scripts/check-register-consistency/`, kein neuer Wächter. Ausgeliefert, Required Check.
- Requires: **PROJ-145** (`check:index-scope`) — nur für das `splitCells`-Muster gegen escapte
  Pipes, das PROJ-157 als F-157.1 nachrüsten musste.

## Das Problem

Das Portfolio führt eine Followup-Kennung an **zwei** Orten: im Register
(`features/OPEN-DEFERRED-STATUS.md`) und in der Followup-Liste der Feature-Spec, aus der sie
hervorgegangen ist. Für den ersten Ort gibt es seit PROJ-157 einen Wächter, für die Verbindung
zwischen beiden nicht.

Die Richtung des Schadens ist die gefährlichere: eine Spec-Followup-Liste ist der Ort, an dem man
„was ist an diesem Feature noch offen" nachliest. Steht dort eine längst ausgelieferte Arbeit als
offen, ist das keine fehlende Information, sondern eine **falsche** — und `/qa` wie
`/architecture` lesen diese Listen.

## Gemessen vor dem Entwurf

Fünf Messungen, und sie haben den Zuschnitt **umgedreht**. Die Slice hieß in ihrer Anlage
„AC-Tabellen gegen Register prüfen"; genau das ist nicht baubar.

**M1 — Die AC-Zellen-Variante ist untauglich.** 40 von 204 Feature-Specs tragen eine AC-Tabelle,
zusammen **656 Zeilen mit 457 distinkten Ergebniswerten**. Die zweite Spalte ist nicht einmal
überall die Ergebnisspalte: gemessen stehen dort auch `α`, `β`, `γ.1`, `ε`, `Wohin`,
`Vitest coverage` und Codeschnipsel. Escapte Pipes kommen vor (`isManual \|`) — dieselbe Falle,
die PROJ-157s eigenen Bug F-157.1 verursachte. **PROJ-157s Ausschluss des Status-Abgleichs war
richtig**, und diese Slice nimmt ihn nicht zurück.

**M2 — Eine dreiwertige Prüfung (done/open/unklar) findet den echten Fall nicht.** Gegen den
Vorzustand `1ef5fcf`, in dem der Widerspruch nachweislich bestand: **0 Treffer**, bei 55 Paaren
davon **50 unklar**. Der Grund ist der eigentliche Befund dieser Messung: **Spec-Followups sagen
nie „offen"** — sie beschreiben das Problem im Präsens. Offenheit ist dort die *Abwesenheit* eines
Erledigungsvermerks, und Abwesenheit ist von „unklar formuliert" nicht unterscheidbar.

**M3 — Die Variante „Register erledigt + Spec-Followup ohne Erledigungsvermerk" findet ihn.**
Gegen `1ef5fcf`: **17 Fundstellen / 16 distinkte Kennungen**, darunter `PROJ-Y-155f`. Heute:
**16 / 15** — der Zähler fällt um **genau 1**, und das ist der Fix aus #547. Die Regel misst also,
was sie messen soll, und der Nachweis ist der echte Vorzustand, nicht eine Fixture.

Die Unterscheidung Fundstelle/Kennung ist nicht kosmetisch, und sie ist ein Fund an der eigenen
Messung: die erste Fassung des Messskripts nahm per `setdefault` nur die **erste** Fundstelle je
Kennung und meldete darum 15 statt 16. `PROJ-Y-143l` steht in **zwei** Specs, beide ohne Vermerk —
wer nur die erste zählt, bereinigt eine Stelle und lässt die zweite falsch stehen.

**M4 — Die 16 Bestandsfundstellen sind echte Schuld, nicht Rauschen.** Stichprobe von drei:
`PROJ-Y-45d` (Register „**Erledigt 2026-08-21**", Spec ohne Vermerk) und `PROJ-Y-151a`
(Register „**Erledigt 2026-08-27** — Migration in Prod, Pentest 7/7", Spec ohne Vermerk) sind
**echt**. `PROJ-Y-130g` ist ein **Falsch-Positiv**: sein Register-Kopf beschreibt ein Problem
(„Zwei Audit-Trigger existieren in Prod, die die Migrationsdateien nicht herstellen"), und das
260-Zeichen-Fenster der Messung fing ein Erledigungswort aus dem Nachbartext ein. Die
Zustandserkennung braucht also eine engere Fassung als die Messung sie hatte.

**M5 — Die Vergleichsmenge ist substanziell, nicht latent.** 193 distinkte Kennungen im Register
(177 davon in Tabellenzeilen), 119 in Spec-Followup-Listen, **79 in beiden Quellen**; als Paare
maschinell auflösbar sind **55**. Anders als PROJ-157s R1, die bewusst latent blieb (0 Paare),
hat R4 von Tag eins etwas zu prüfen.

## User Stories

- Als **Entwickler, der eine Slice beginnt**, will ich der Followup-Liste einer Feature-Spec
  glauben können, damit ich nicht Arbeit plane, die längst ausgeliefert ist.
- Als **`/qa`-Durchgang** will ich aus der Spec ablesen können, welche Befunde noch offen sind,
  ohne jede Kennung im Register gegenzuprüfen.
- Als **`/deploy`-Buchführung** will ich beim Schließen eines Followups merken, wenn ich nur eine
  der beiden Stellen nachgezogen habe — bevor der Widerspruch drei Tage im Portfolio steht
  (PROJ-Y-151e-Klasse).
- Als **Repo-Eigner** will ich, dass der Wächter ohne eingefrorenen Schuldenstand grün ist, damit
  eine Ausnahmeliste nicht später als Umgehungsweg dient (PROJ-147-Lehre).

## Nutzer-Locks

- **L1 — Erst bereinigen, dann hart.** Die 16 Bestandsfundstellen werden nachgetragen, danach urteilt
  R4 **ohne Ausnahmeliste**. Vorbild ist PROJ-157 („Bestand grün ohne Bereinigung"), ausdrücklich
  **nicht** die `token-drift`-Ratsche mit eingefrorener Baseline. Begründung des Nutzers folgt der
  Messung: 16 Stellen sind rein additive Vermerke, also billig, und ein Wächter ohne Ausnahmeliste
  ist der stärkere.
- **L2 — Bereinigung und Wächter in einem Zug.** Damit R4 am **echten** Vorzustand rot-grün
  beweisbar bleibt: nach der Bereinigung gäbe es keinen echten Fehlerfall mehr zu zeigen.

## Acceptance Criteria

**Wächter**

- [ ] **AC-171.1** `npm run check:register-consistency` prüft als vierte Regel **R4**: trägt eine
      Kennung im Register einen Erledigungsvermerk, muss ihr Listenpunkt in der Feature-Spec-
      Followup-Liste ebenfalls einen tragen.
- [ ] **AC-171.2** R4 vergleicht **nur Paare** — eine Kennung, die nur im Register oder nur in
      einer Spec steht, ist **kein** Fehler (Konvention, kein Defekt; dieselbe Entscheidung, mit
      der PROJ-157 seine 6 von 6 Erzähl-Kennungen nicht falsch-rot gemacht hat).
- [ ] **AC-171.3** R4 wertet **keine** AC-Tabelle aus. Das ist gemessen ausgeschlossen (M1) und
      im Wächter-Kopf als Grenze benannt, damit die nächste Slice es nicht erneut versucht.
- [ ] **AC-171.4** Die Zustandserkennung fängt den `PROJ-Y-130g`-Fall **nicht** als Erledigung:
      ein Register-Kopf, der ein Problem beschreibt, gilt nicht als Vermerk. Der Fall ist als
      Testfall festgehalten.
- [ ] **AC-171.5** Escapte Pipes (`\|`) werden in Register-Tabellenzeilen korrekt behandelt —
      über dasselbe `splitCells`-Muster, das PROJ-157 als F-157.1 nachrüsten musste.
- [ ] **AC-171.6** Ein unklarer Fall erzeugt eine **Warnung, nie einen Fehler** — PROJ-157s Regel
      für deutsche Prosa, unverändert übernommen.
- [ ] **AC-171.7** R1, R2 und R3 sind unverändert: ihre Ausgabe und ihr Urteil ändern sich nicht,
      belegt durch die Bestandstests.

**Bereinigung**

- [ ] **AC-171.8** Alle **16** gemessenen Bestandsfundstellen (**15** distinkte Kennungen, eine
      davon in zwei Specs) sind nachgetragen — jede mit Datum und Belegen, Form nach dem Vorbild
      `PROJ-Y-155a` (Erledigung **hinter** der Beschreibung, ursprünglicher Wortlaut bleibt
      vollständig lesbar).
- [ ] **AC-171.9** Die Bereinigung ist **rein additiv**: kein Akzeptanzkriterium und keine
      Befundbeschreibung einer ausgelieferten Spec wird umgeschrieben oder gelöscht.
- [ ] **AC-171.10** Jede der 16 Fundstellen ist vor dem Nachtragen **einzeln am Register verifiziert**
      — nicht aus der Messliste übernommen. Ein Falsch-Positiv wird als solches benannt und
      **nicht** nachgetragen (der `PROJ-Y-130g`-Fall zeigt, dass die Liste welche enthält).

**Nachweis**

- [ ] **AC-171.11** R4 ist **rot-grün am echten Vorzustand** belegt: gegen den Stand vor der
      Bereinigung meldet der Wächter die Fälle, gegen den bereinigten Stand ist er still.
- [ ] **AC-171.12** Der Wächter ist **nach** der Bereinigung ohne Ausnahmeliste grün (L1).
- [ ] **AC-171.13** Eine negative Kontrolle beißt: „Kennung nur in der Spec" wird
      versuchsweise als Fehler gewertet und der Test schlägt an — sonst wäre AC-171.2 trivial
      erfüllt (PROJ-130-δ1/F-1-Falle).

## Edge Cases

- **Kennung nur im Register** (114 von 193) — kein Fehler, viele Followups haben keine
  Elternspec-Liste.
- **Kennung nur in einer Spec** (40 von 119) — kein Fehler; die Kennung kann jünger als der
  letzte Register-Durchgang sein.
- **Dieselbe Kennung in mehreren Specs** — gemessen **13** Kennungen, eine davon in **vier**
  Specs. Zu entscheiden ist, ob **jede** Fundstelle einen Vermerk braucht oder eine genügt; die
  erste Messung dieser Slice nahm nur die erste Fundstelle je Kennung (`setdefault`) und hätte
  Widersprüche in den übrigen übersehen.
- **Register führt eine Kennung in Tabelle *und* Erzählteil** — das ist R1s Gegenstand; R4 darf
  daraus keinen zweiten, widersprüchlichen Befund erzeugen.
- **Register-Kopf beschreibt ein Problem mit Erledigungswort im Nachbartext** — der
  `PROJ-Y-130g`-Fall, siehe AC-171.4.
- **Erledigungsvermerk steht in einer Folgezeile des Listenpunkts** — Normalfall
  (`PROJ-Y-155a`), der Block muss mehrzeilig gelesen werden. Eine Ein-Zeilen-Prüfung meldete in
  der Messung fälschlich 146 offene Fälle.
- **Kennung in einem Fließtext-Absatz statt in einem Listenpunkt** — kommt vor; ob R4 solche
  Fundstellen einbezieht, ist offen (siehe Q3).

## Offene Architekturfragen

Bewusst **nicht** hier entschieden — `/architecture` gehört die Antwort:

- **Q1 — Woran erkennt R4 einen Erledigungsvermerk?** Die Messung nahm ein Wortfeld
  (`erledigt|behoben|geschlossen|abgeschlossen|ausgeliefert`) über ein 260-Zeichen-Fenster und
  produzierte damit den `130g`-Falsch-Positiv. Kandidaten: nur die erste Fettdruck-Gruppe
  auswerten (PROJ-157s Muster „Zustand aus dem Kopf, nicht aus dem Rumpf"), oder eine engere
  Form wie `**Erledigt <Datum>**` verlangen. Letzteres wäre präziser, würde aber eine Schreibweise
  vorschreiben, die der Bestand nicht durchgängig führt — zu messen, nicht zu setzen.
- **Q2 — Zählt R4 auch die Gegenrichtung?** Register sagt offen, Spec sagt erledigt. Gemessen ist
  diese Richtung heute nicht aufgetreten; sie wäre aber der PROJ-164-Fall (`F-164.1`) eine Ebene
  weiter. Kosten und Rauschen sind ungemessen.
- **Q3 — Welche Fundstellen in der Spec gelten?** Die Messung nahm Listenpunkte
  (`^- **PROJ-Y-…`). Fließtext-Erwähnungen sind häufig und meist keine Statusaussage — sie
  einzubeziehen würde vermutlich viel Rauschen erzeugen, ist aber ungemessen.

## Abgrenzungen

- **Kein** Status-Abgleich über AC-Tabellen (M1, gemessen ausgeschlossen).
- **Kein** neuer Wächter und kein neuer CI-Job — R4 ist eine Regel im bestehenden
  `check:register-consistency`, der schon Required Check ist.
- **Keine** Vollständigkeitsprüfung („jeder Befund braucht einen Registereintrag") — das ist die
  PROJ-Y-113c-Klasse und von PROJ-157 ausdrücklich ausgeschlossen.
- **Keine** Bereinigung von Widersprüchen, die R4 nicht prüft (etwa die von PROJ-164 gemeldete
  `F-164.1` über Register-Abschnitts-Überschriften gegen INDEX-Status).

## Technical Requirements

- Reine Dateianalyse; kein DB-Zugang, kein Docker, kein Secret.
- Kein neues Paket.
- Laufzeit im Rahmen der bestehenden Datei-Wächter (< 5 s).

## Abweichung vom `/requirements`-Ablauf

Der Skill verlangt in Phase 5, das Feature in die Roadmap-Tabelle von `docs/PRD.md` einzutragen.
**Hier bewusst nicht getan, gemessen begründet:** kein vergleichbarer Werkzeug-Slice steht dort —
PROJ-145, PROJ-147, PROJ-150, PROJ-157, PROJ-164 und PROJ-169 sind **0 von 6**, die höchste
PRD-Zeile ist PROJ-158. Die Tabelle führt nach ihrem eigenen Kopf die **Produktabsicht**, und
PROJ-164 hat diese Rolle gerade geschärft, indem es die nicht gepflegte Status-Spalte entfernte.
Ein Eintrag wäre die erste Ausnahme und würde die PRD zur Werkzeug-Liste machen. Die Slice ist
über `features/INDEX.md` geführt, wie ihre sechs Vorgänger.

## Nebenbefund (kein Akzeptanzkriterium)

`.claude/skills/requirements/template.md` führt `## Status`, aber **keinen**
`## Deployment Scope` — obwohl `.claude/rules/general.md` beide Felder als Pflicht führt und
`check:index-scope` die INDEX-Seite davon bewacht. Jüngere Specs tragen den Header
(`PROJ-Y-148b`), die älteren M&A-Specs nicht (gemessen: 0 von 6). Eine neue Spec entsteht damit
per Vorlage ohne das Pflichtfeld. Gehört nicht in diese Slice, aber notiert.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
