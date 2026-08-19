# PROJ-Y-148d — `construction_defect_events` hält seine Zusage jetzt auch beim Projekt-Abriss

## Status: Approved
## Deployment Scope: —
<!-- Scope bleibt leer bis zum Merge; aus den Belegen ist `full` die Klassifikation. -->

**Created:** 2026-08-19
**Origin:** Fund F-14 aus PROJ-Y-148a. Dort bewusst nicht behoben — der Guard einer fremden, gerade
gemergten Slice ist nicht nebenbei anzufassen.

---

## Der Befund

`enforce_construction_defect_event_immutability` (PROJ-45-β, Migration `20260818104358`) ließ ein
`DELETE` durch, sobald der Eltern-Mangel fehlte — **ohne jede weitere Bedingung**. Ein Kaskaden-Löschen
entfernt die Elternzeile aber zuerst, die Ausnahme griff also bei **jedem** Projekt-Abriss von selbst.
Die Mängel-Historie ging mit dem Projekt, während ihre vier Geschwister-Inseln (PROJ-31 · 33 · 100c ·
105) den Abriss verweigern.

## Warum der Fork aus dem Register entschieden ist

Das Followup fragte: **gewollt** oder **übersehener Kaskadenweg**? Beides ist beantwortet, und zwar
nicht durch Abwägung, sondern durch zwei Fakten:

1. **Die Begründung deckt den Fall nicht ab, den sie zu decken scheint.** PROJ-45-β begründet den Ausweg
   damit, der Zweig sei „über die Anwendung ohnehin unerreichbar (keine DELETE-Policy auf
   `construction_defects`)". Das trifft den **direkten** Weg. Der reale Weg ist die Kaskade
   `projects → construction_defects → construction_defect_events`, und die braucht keine Policy. Das
   spricht für Versehen, nicht für Absicht.
2. **Der zweite Grund ist abgelaufen.** Er lautete: „Ohne das wäre jeder Projekt-Hard-Delete an einem
   Bauprojekt mit Mängeln blockiert — genau die Klasse Blocker, die PROJ-148 gerade behoben hat … Eine
   neue Instanz davon anzulegen wäre ein Rückschritt." Das war richtig, **solange PROJ-Y-148a offen
   war**. Seit dem 2026-08-19 ist Variante 1 entschieden: die Blockade **ist** die richtige Antwort, sie
   wird nur ehrlich kommuniziert (422 mit benannter Ursache statt 500 mit DB-Meldung). Ein Blocker ist
   damit kein Rückschritt mehr, sondern das gewollte Verhalten mit fertiger Oberfläche.

**Die im Register vorgeschlagene Lösung ist nicht mehr baubar.** Dort stand, es fehle die
`_project_teardown_active()`-Bedingung und der Guard sei nachzuziehen. PROJ-Y-148c hat diese Funktion
**entfernt**, weil sie zu einer verworfenen Variante gehörte. Der Ausweg entfällt deshalb ganz, statt an
eine Bedingung geknüpft zu werden — danach sind alle fünf Inseln gleich behandelt und die Zusage hängt
nicht mehr davon ab, welche Tabelle betroffen ist.

## Der Zeitpunkt

Live gemessen: **0** Mängel, **0** Mängel-Ereignisse, 4 Bauprojekte (3 im Papierkorb), **0**
Papierkorb-Projekte mit Mängel-Historie. Die Änderung betrifft heute **niemanden** — und nur heute ist
sie so billig, denn gelöschte Historie ist nicht rückholbar und die Zahl wächst mit der Nutzung.

---

## Akzeptanzkriterien

- [x] **AC-Y148d.1** — Der Guard verweigert `UPDATE`/`DELETE` ausnahmslos; kein `return OLD`, keine
      Elternteil-Bedingung. Meldungstext und `42501` unverändert.
- [x] **AC-Y148d.2** — Ein Projekt-Hard-Delete an einem Bauprojekt **mit** Mängel-Historie wird
      blockiert. Vorher gelang er.
- [x] **AC-Y148d.3** — **Kein Über-Blocken:** ein Bauprojekt **ohne** Mängel bleibt löschbar. Das ist
      die einzige Richtung, in der diese Slice etwas verschlechtern könnte.
- [x] **AC-Y148d.4** — `blocksHardDelete` für `construction_defect_events` steht auf `true`, die
      Vorabprüfung aus PROJ-Y-148a fragt die Insel ab und die Absage nennt „Mängel-Historie".
- [x] **AC-Y148d.5** — Die vier Geschwister-Guards aus PROJ-Y-148c sind unberührt und weiterhin
      ausnahmslos.
- [x] **AC-Y148d.6** — PROJ-45-βs Pentest-Vektor **Z** ist umgedreht statt gelöscht, mit der Begründung
      am Vektor; seine Spec führt D-β5 als **aufgelöst** und AC-45βH-5 als wörtlich erfüllt.
- [x] **AC-Y148d.7** — Die Regel „nicht-blockende Insel wird nicht abgefragt" bleibt **unter Test**,
      obwohl heute keine reale Insel sie mehr auslöst (siehe Abweichung D-Y148d.2).
- [x] **AC-Y148d.8** — Kein Rückstand in Prod; Gegenprobe über Projekte, Mängel, Ereignisse,
      Probe-Zeilen und deaktivierte Trigger.

## Definition of Done

- [x] Migration in Prod **und** in `supabase/migrations/`, `name` = Dateiname-Stamm (PROJ-134),
      Post-Conditions fail-loud in der Migration selbst.
- [x] Pentest als Datei im Repo, live gegen Prod, 0 Rückstände.
- [x] Rot-Grün ausgeführt: die Umstellung bricht genau die Tests, die das alte Verhalten festhielten.
- [x] Gates: ESLint 0 · tsc = Baseline / 0 neu · vitest grün · Build clean · migration-naming ·
      index-scope.
- [x] Buchführung: diese Spec, PROJ-45-βs Spec, `features/INDEX.md`, `features/OPEN-DEFERRED-STATUS.md`.

---

## Nachweise

**Migration:** `supabase/migrations/20260819140000_projy148d_defect_events_no_cascade_exit.sql`.

**Live-Pentest:** `tests/sql/PROJ-Y-148d-defect-events-no-cascade-exit-pentest.sql`, **6/6 PASS** gegen
Prod, **0 Rückstände**.

| Vektor | Ergebnis |
|---|---|
| **A** | Projekt **mit** Mängel-Historie → **`42501`, Kaskade blockiert** (vorher: `SUCCEEDED`) |
| **B** | Projekt **ohne** Mängel → gelöscht (kein Über-Blocken) |
| **C** | direktes `DELETE` bei vorhandenem Elternteil → `42501` (Nicht-Regression) |
| **D** | `DELETE` bei **fehlendem** Elternteil → **`42501`** — der Ausweg ist weg |
| **E** | die vier Geschwister-Guards ausnahmslos |
| **F** | Trigger weiter verdrahtet |

**Rot-Grün, ausgeführt:** die Umstellung von `blocksHardDelete` brach **genau einen** Route-Test
(„does not refuse for history that the cascade removes anyway") — den, der das alte Verhalten festhielt.
Er ist umgedreht statt entfernt. Danach 34/34 bzw. 22/22 in den beiden Suites.

**Gates:** ESLint **0** · tsc **13 = Baseline / 0 neu** · vitest **3342/3342** (405 Dateien) · Build
clean · `check:migration-naming` 0 Fehler · `check:index-scope` 0 Fehler.

## Abweichungen und Funde

- **D-Y148d.1 — eine fremde Test-Datei und eine fremde Spec geändert.** PROJ-45-βs Pentest-Vektor Z und
  seine Deviation D-β5 hielten das alte Verhalten fest und hätten nach dieser Slice Falsches behauptet.
  Beide sind **umgestellt, nicht abgeschwächt oder gelöscht**, mit der Begründung am Ort. Die Migration
  von PROJ-45-β bleibt unangetastet (append-only); ihr Kommentar beschreibt ab hier einen überholten
  Stand, worauf die neue Migration ausdrücklich hinweist.
- **D-Y148d.2 — ein Test wäre durch diese Slice wirkungslos geworden.** „does not refuse for an island
  that does not block the cascade" und „never even asks a non-blocking island" prüfen eine Regel, die
  mit fünf von fünf blockenden Inseln über die echte Registry nicht mehr auslösbar ist — und ein Test,
  der nicht fehlschlagen kann, bewacht nichts. `detectGovernanceHistory` nimmt deshalb die Inselliste
  jetzt als optionalen zweiten Parameter (Default = echte Registry, kein Aufrufer bricht), und die zwei
  Fälle laufen gegen eine **synthetische** Insel. Die Regel bleibt damit bewacht, für die sechste Insel,
  die wieder nicht-blockend sein kann.
- **F-Y148d.1 — eine eigene Vermutung, von der Gegenprobe widerlegt.** Beim Lesen fiel auf, dass
  `pushGovernanceCounts` nur **blockende** Inseln in die Antwort-Warteschlange legt — der Route-Test
  „a table missing in this environment does not block the delete" setzte seine `42P01`-Antwort also für
  eine Insel, die nie abgefragt wurde, und der Eintrag wurde verworfen. Ich nahm an, der Test werde durch
  meine Umstellung „echt". Die Gegenprobe (den `MISSING_TABLE_CODES`-Zweig entfernen) zeigte das
  Gegenteil: er bleibt **grün**, weil ein fehlgeschlagener Vorablauf den Delete ebenfalls durchlässt —
  beide Pfade enden in 200 und die Route kann sie nicht unterscheiden. Der echte Wächter ist der
  Lib-Test, den PROJ-Y-148a bewusst über eine *blockende* Insel führt („so the tolerance is actually
  exercised rather than hidden behind the non-blocking skip"). Der Kommentar am Route-Test sagt das
  jetzt so, statt dem Fall mehr Kraft zuzuschreiben, als er hat.
- **D-Y148d.3 — `SECURITY DEFINER` und `search_path` des Guards bleiben wie in PROJ-45-β.** DEFINER war
  dort begründet (als INVOKER könnte RLS-Unsichtbarkeit sich als „Mangel ist weg" tarnen). Mit dem
  Wegfall des Zweigs ist das nicht mehr tragend, aber eine Änderung daran gehört nicht in diese Slice.

## Was offen bleibt

- **PROJ-Y-148b** — DSGVO Art. 17 auf `payload` der Governance-Inseln, CIA-pflichtig. Diese Slice
  **verschärft** die Frage: mit fünf blockenden Inseln ist der Papierkorb für Projekte mit Historie
  endgültig ein Dauerzustand, und ein Redaktionspfad existiert weiterhin nicht.
- **PROJ-Y-148e** — Wächter gegen Prod/Repo-Divergenz bei Funktionsdefinitionen.
