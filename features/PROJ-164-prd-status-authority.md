# PROJ-164 — Eine Autorität für den Lieferzustand: PRD-Status-Drift und ID-Vorausversprechen

## Status: In Review
## Deployment Scope: —

**Created:** 2026-09-01

## Problem

Zwei Dateien behaupteten denselben Sachverhalt, und beide wurden gelesen.

**(1) `docs/PRD.md` führte eine Status-Spalte, die niemand pflegte.** Gemessen am 2026-09-01:
**52 von 71** Roadmap-Zeilen widersprachen `features/INDEX.md` — **51** davon behaupteten `Planned`
für längst ausgelieferte Features (`PROJ-1` „In Progress", `PROJ-2`–`PROJ-20` durchgehend
`Planned`, ebenso `PROJ-151`, `PROJ-156`, `PROJ-158`). Nur **18** stimmten überein.

Die Ursache ist keine Nachlässigkeit, sondern eine Regel-Lücke:
`.claude/skills/requirements/SKILL.md:133` schreibt vor, ein neues Feature **in** die Roadmap-Tabelle
einzutragen, und `.claude/rules/general.md` („Status Updates", MANDATORY) nennt als zu
aktualisierende Quellen ausschließlich **Spec + `features/INDEX.md`** — die PRD kommt dort nicht vor,
und `deploy/SKILL.md` erwähnt sie überhaupt nicht. Die Spalte **musste** driften.

Der Schaden ist nicht kosmetisch: die PRD wird per `@docs/PRD.md` in **jeden** Sitzungskontext
geladen, und der CIA-Portfolio-Review liest sie ausdrücklich als Quelle
(`continuous-improvement/SKILL.md:42`). Für INDEX (`check:index-scope`) und Register
(`check:register-consistency`) gibt es Wächter; für die Datei, die jede Sitzung als erstes sieht,
gab es keinen.

**(2) IDs wurden in Prosa im Voraus versprochen.** Die `PROJ-158`-Zeile sagte wörtlich „Kette
Mail-Eingang: **158 Anbindung → 159 Abholung und Posteingang → 160 Zuweisung zum Projekt → 161
Zuleitungsregeln → 162 KI auf der Mail**" — und am 2026-09-01 wurde `PROJ-160` für eine
Supply-Chain-Slice verbraucht. Zwei INDEX-Zeilen widersprachen sich damit über dieselbe Kennung.
Dieselbe Ursache hat schon zweimal gekostet: `PROJ-Y-151d` war doppelt vergeben (eine Spur baute und
lieferte unter dem Tag, die andere musste als `PROJ-Y-151e` weichen), `PROJ-145` und `PROJ-Y-145`
mussten zusammengeführt werden. PROJ-157 hat dabei **gemessen**, dass ein „Next Available
ID"-Check den Fall nicht fängt.

## Messungen

Alles am 2026-09-01 erhoben, nicht angenommen:

- **52 von 71** PRD-Roadmap-Zeilen im Widerspruch zum INDEX, 51-mal in der gefährlicheren Richtung.
  Eine Sammelzeile (`PROJ-94–132`) hat gar kein INDEX-Gegenstück.
- **Nur 4 der 71 Status-Zellen trugen Prosa**, und **alle vier waren überholt**: `PROJ-45` sagte
  Scope `alpha` (INDEX: `mvp`), `PROJ-70` „In Progress" (INDEX: `Deployed/full`), `PROJ-74` nannte
  den `SNYK_TOKEN`-Handoff (PROJ-147 hat Snyk ausgetragen und durch OSV ersetzt), `PROJ-94–132`
  nannte „PR #168 offen" (längst gemergt). Das Entfernen der Spalte vernichtet also **keine** gültige
  Information — nachgemessen, nicht behauptet.
- Tabellenform uniform: alle 76 Tabellenzeilen (Kopf, Trenner, 71 PROJ, 3 `_TBD_`) hatten genau
  6 Pipe-Segmente, **0** escapte Pipes in der Prosa — der Spaltenumbau war deshalb mechanisch
  sicher.
- Von den vier Spalten ist `Status` die **einzige** Zweitkopie: ID, Priorität und Feature sind
  Produktabsicht (PRD-Zweck), Status ist Lieferzustand (INDEX-Zweck, dort mit Wächter).

## Nutzer-Entscheidungen

Der Zuschnitt entstand in einem `grill-me`-Durchgang, eine Frage pro Turn.

- **L1** — Status-Spalte **entfernen**, nicht bewachen. Erwogen und verworfen wurde ein
  `check:prd-roadmap` nach dem Muster PROJ-145/157: PROJ-157 hat die zweite Form behalten, **weil
  sie eigenen Inhalt trägt** (Erzählteil ≠ Tabellenzeile). Die Status-Spalte trägt keinen eigenen
  Inhalt — eine reine Kopie zu bewachen erzwingt Doppelpflege für null Informationsgewinn. Drift
  wird hier **strukturell unmöglich** statt bewacht.
- **L2** — Die Regel-Lücke wird mitgeschlossen: ohne das bleibt „bitte hier keinen Status pflegen"
  eine Bitte, und die nächste Slice trägt ihn wieder ein.
- **L3** — Die Mail-Kette wird **entnummeriert**, nicht auf freie IDs umgeschrieben. Umschreiben
  hätte vier IDs erneut im Voraus versprochen — derselbe Defekt in Neuauflage.

## Akzeptanzkriterien

- **AC-164.1** — `docs/PRD.md` führt keine Status-Spalte mehr; die Roadmap-Tabelle hat drei Spalten
  (ID · Priorität · Feature), alle 71 Feature-Zeilen und die 3 `_TBD_`-Zeilen umgebaut, keine Zeile
  mit falscher Zellenzahl.
- **AC-164.2** — Über der Tabelle steht, **wo** der Lieferzustand geführt wird, samt der gemessenen
  Zahl, die den Umbau begründet — damit niemand die Spalte aus Unwissen wieder einführt.
- **AC-164.3** — `.claude/rules/general.md` benennt die PRD ausdrücklich als Ort, an dem Status
  **nicht** gepflegt wird, und sagt „Status lebt an genau zwei Stellen".
- **AC-164.4** — `requirements/SKILL.md` ist an allen **drei** Stellen präzisiert, die die
  Roadmap-Tabelle betreffen (Eintrag, Init-Verifikation, Definition-of-Done-Checkliste).
- **AC-164.5** — Die Mail-Kette verspricht keine IDs mehr: die drei unbelegten Glieder sind fachlich
  benannt, in `features/PROJ-158-*.md` (5 Stellen) und in der INDEX-Zeile. `PROJ-159` bleibt
  verdrahtet, weil es die unmittelbar nächste Slice ist und 24-mal als Blocker referenziert wird —
  eine Entnummerierung dort hätte Präzision gekostet, ohne einen Widerspruch zu lösen.
- **AC-164.6** — Kein `src/`-Diff, keine Migration, kein neues Paket; alle fünf Datei-Wächter grün.
- **AC-164.7** — Kein Akzeptanzkriterium einer ausgelieferten Spec verändert. Angefasst ist an
  `PROJ-158` ausschließlich Verweis-Prosa.

## Bewusste Abweichungen und Grenzen

- **D-164.1:** die vier überholten Status-Zellen werden **nicht** archiviert. Begründung ist die
  Messung: keine trug gültige Information, alle vier stehen im INDEX aktueller. Ein Archiv wäre eine
  dritte Kopie desselben Sachverhalts.
- **D-164.2:** `PROJ-159` bleibt als einzige Kennung in der Kette verdrahtet (AC-164.5). Das ist
  eine bewusste Ausnahme von L3, gemessen begründet, nicht übersehen.
- **D-164.3:** kein Wächter für die PRD. Sie führt nach dieser Slice keine Aussage mehr, die mit dem
  INDEX kollidieren **kann** — es gibt nichts zu bewachen. Kehrt jemand die Spalte zurück, fängt es
  keine Automatik, sondern nur die Regel in `general.md`. Ausgesprochen statt gerundet.
- **D-164.4:** kein CIA-Pass — keine Technologie, keine Migration, kein `src/`-Diff, kein
  `.claude/agents/`-Diff (Präzedenz PROJ-150 · 157 · Y-148e).
- **D-164.5:** kein eigener `/qa`-Durchgang; jedes Kriterium trägt einen ausgeführten Nachweis.

## Zwei Funde, bewusst nicht in dieser Slice behoben

- **F-164.1 — der Register-Wächter prüft keinen Status, und das ist heute sichtbar falsch.**
  `features/OPEN-DEFERRED-STATUS.md:837` führt „## PROJ-160 — Supply-Chain-Remediation `browserslist`
  (**In Progress**)", während der INDEX `Deployed / full` trägt. `check:register-consistency` meldet
  **OK**, weil er per Entwurf keinen Status abgleicht (PROJ-157: „INDEX-Status-Zellen sind Prosa →
  Falsch-Rot"). Die Begründung war richtig — die **Abschnitts-Überschriften** des Registers sind
  aber kein Prosa-Freitext, sondern ein enges Vokabular. Prüfbar wäre das also; hier nicht angefasst,
  weil es PROJ-157s Wächter erweitert und eine fremde, heute ausgelieferte Slice betrifft.
- **F-164.2 — veralteter Readiness-Blockquote.** `features/INDEX.md:163` behauptet seit dem
  2026-06-23 „PROJ-94 ist QA PASS, PR #168 offen; PROJ-100a ist Approved" — beide sind
  `Deployed / full`, der PR ist gemergt. Gehört in die M&A-Tranche der Portfolio-Erdung, nicht
  hierher.

## Nachweise

- **AC-164.1** gemessen: 76 Tabellenzeilen von 4 auf 3 Spalten umgebaut, danach **0** Zeilen mit
  falscher Zellenzahl, 71 Feature-Zeilen unverändert vorhanden.
- **AC-164.5** gemessen: **0** verbleibende Verweise auf `PROJ-160`/`161`/`162` in
  `features/PROJ-158-*.md`.
- **Datei-Wächter**: `check:index-scope`, `check:register-consistency`, `check:migration-naming`,
  `check:token-drift`, `check:function-inventory` — siehe Deployment-Abschnitt.
- **Umfang** gemessen statt behauptet: `src/` 0 Dateien, `supabase/migrations/` 0,
  `package.json` 0, `package-lock.json` 0.
