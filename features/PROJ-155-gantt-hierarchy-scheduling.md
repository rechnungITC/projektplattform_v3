# PROJ-155 — Gantt: WBS-Hierarchie, Sammelvorgänge und Netzablaufplan

## Status: Deployed
## Deployment Scope: alpha

Nutzer-Meldung 2026-08-28: *„das gantt diagramm ist fehlerhaft — die arbeitspakete
ordnen sich nicht dem zeitstrahl unter, die anzeige ist nicht über den gesamten
bildschirm anzeigbar, die arbeitspakete werden ohne kontext hinzugefügt, die tasks
also die sub arbeitspakete werden gar nicht angezeigt und können auch nicht als
netzablaufplan verknüpft werden"* — mit dem Auftrag, die Sichtweise von MS Project
bzw. vergleichbaren offenen Modulen (SVAR react-gantt, DHTMLX gantt, OpenProject)
zu übernehmen.

## Befunde, alle live gegen Prod gemessen (2026-08-28)

| # | Meldung | Gemessene Ursache |
|---|---|---|
| 1 | Arbeitspakete ordnen sich nicht dem Zeitstrahl unter | **Datenmangel plus zwei echte Defekte.** In `AUE_0001` haben **0 von 18** Arbeitspaketen und **0 von 23** Tasks einen Termin — ohne Termin zeichnet auch MS Project keinen Balken. Dazu: die Gruppierung sortierte **gar nicht** (Reihenfolge = API-Antwort), und der Sammelvorgang-Rollup war wirkungslos (siehe unten) |
| 2 | Nicht über den ganzen Bildschirm anzeigbar | Höhe hart auf `max-h-[70vh]` gedeckelt, linke Spalte fest `w-72`, kein Vollbild. Bei 42 Zeilen sah man rund ein Viertel |
| 3 | Arbeitspakete ohne Kontext hinzugefügt | Die KI-Übernahme setzt weder Phase noch Termine (bereits als **PROJ-Y-154a** registriert, CIA-pflichtig) |
| 4 | Tasks fehlen, kein Netzablaufplan | Zeilenregel verlangte `phase_id`; Tasks hängen per `parent_id` am Arbeitspaket → **1 von 48** sichtbar. Und der UI-Typ war `"phase" \| "work_package"`, obwohl DB **und** API-Route `todo` seit PROJ-9-R2 tragen |

### Der gewichtigste Fund: der Sammelvorgang-Rollup war strukturell wirkungslos

`tg_work_items_36a_rollup_recompute_fn` (PROJ-36) las `attributes->>'planned_start'`.
Gemessen: von 138 lebenden `work_items` trägt dieses JSONB-Feld **0** Zeilen, die
echte Spalte `planned_start` dagegen **4**. Folge: `derived_planned_start` war bei
**0 von 138** Zeilen gesetzt, obwohl der Trigger aktiv ist und feuert.

Die Zusage stand längst im Code: PROJ-25 (`20260504060000`) legt `planned_start` an
und ihr **eigener Spaltenkommentar** sagt *„rolled up via derived_planned_start when
this is null"*. Der PROJ-36a-Rollup-Redeploy (`20260504400001`) lief **danach** und
löste sie nicht ein. Gleiche Klasse wie PROJ-151s Skill-Lader (`content_md` vs
`markdown_content`) und PROJ-Y-151ds Kostenrechnung: zwei Namen für dasselbe Datum,
geschrieben wird der eine, gelesen der andere.

## Fundament-Entscheidung (Nutzer-Lock)

**Eigenes SVG erweitern**, nicht auf eine Bibliothek wechseln. Zwei Register-Annahmen
kippten bei der Prüfung:

- **SVAR `wx-react-gantt` ist GPLv3**, nicht MIT wie die PROJ-25-Zeile im INDEX
  behauptet (Registerfehler), und `peerDependencies: react ^18.3.1` — kein React 19.
  Doppelt ausgeschlossen: GPL-only wäre die **erste** in 1166 Prod-Paketen
  (PROJ-45-ε-Präzedenz, libde265).
- **DHTMLX `dhtmlx-gantt@10.0.2` ist echt MIT** (LICENSE.md, XB Software, 0 Deps) und
  der Standard-Build **enthält `auto_scheduling`** — eine ernste Option, aber der
  Wechsel würde PROJ-25/52/53 (1813 Zeilen: Zoom, Feiertage, Sticky-Header,
  Drag/Resize, Kritischer Pfad) wegwerfen und alle Visual-Baselines neu ziehen.
- OpenProject ist AGPL-Rails, nicht übernehmbar — sein Bedienmodell (feste linke
  Tabelle, Zeilen ohne Balken bleiben sichtbar) steckt bereits in der Fläche.

## Deployment

**Deployed 2026-08-28: Tag `v2.86.0-PROJ-155` auf dem Merge-Commit `bf82bb7`
(PR #504, squash → `main`).** Die Migration lag seit dem Bau in Prod; der Merge
liefert die Oberfläche aus und löst damit einen halben Zustand auf (Rollup-Fix
live, Anzeige nicht). Vercel-Produktions-Deployment aus genau diesem SHA
**success**, Post-Deploy-Smoke `/projects` und die Abhängigkeits-Route je **307**
(Auth-Gate). Alle **9** Pflicht-Checks grün — darunter der **Schema-Drift-Wächter**,
der unabhängig belegt, dass die Trigger-Neufassung auch in einer frisch aus den
Migrationsdateien gebauten Datenbank entsteht (bis dahin war sie nur gegen die
Live-Definition gemessen).

Der **Token-Drift-Wächter** (PROJ-Y-51d, einen Tag alt) hat dabei zu Recht
angeschlagen: die create-Vorschau brachte zwei rohe Palette-Farben und hob die
Datei von 15 auf 17 Treffer. Auf semantische Tokens umgestellt statt die Ratsche
anzuheben.

### Scope `alpha` — und warum nicht mehr

`full` ist **nicht** buchbar, und zwar aus zwei Gründen, die ich nicht runde:

1. **Es gab keinen `/qa`-Durchgang.** Die Hausregel lässt `Deployed` erst nach
   QA ohne Critical/High zu. Belegt sind Zeilenlogik (27 Unit-Tests), Rollup
   (rot-grün live gegen Prod) und Verknüpfbarkeit (live gegen Prod) — nicht die
   Verkettung im Browser. Der Gantt hat im Bestand weder Komponententests noch
   eine Visual-Baseline, es gibt also keinen Netzschutz, den ich hätte erben
   können.
2. **β ist namentlich offen** (Auto-Scheduling), und diese Spec ist ausdrücklich
   als α geschnitten — der Nutzer hat den Zuschnitt „Termine + Hierarchie zuerst"
   selbst gewählt.

`mvp` trifft nicht, weil dafür eine AC-Matrix für den gelieferten Kern verlangt
ist; diese Spec führt Befunde und Lieferungen, keine numerierten Kriterien. Das
ist eine Schwäche der Slice, nicht ein Etikett-Problem — der saubere nächste
Schritt ist ein `/qa`-Durchgang mit AC-Liste.

## α — geliefert

1. **Rollup-Fix** (Migration `20260828140000`): der Trigger liest jetzt
   `coalesce(planned_start, attributes→…, derived_…)`. Vorrang: echte Spalte (der
   Schreibpfad von Gantt und PATCH-Route), dann Altbestands-JSONB, dann der
   Enkel-Rollup. Plus Bestands-Heilung bottom-up. Das JSONB-Feld bleibt bewusst als
   Quelle — es zu entfernen wäre eine zweite, nicht gedeckte Änderung.
2. **Hierarchie** (`src/lib/work-items/gantt-rows.ts`, neu): WBS-Baum je Phase über
   `parent_id`, Einrückung nach Tiefe, Auf-/Zuklappen, Eimer „Ohne Phase". Reine
   Logik ohne React, 27 Tests.
3. **Sammelvorgang**: ein Elternteil ohne eigene Termine zeigt die Spanne seiner
   Kinder als Klammerbalken (MS-Project-Darstellung) und ist **nicht ziehbar** —
   sein Zeitraum ist ein Ergebnis, kein Eingabefeld. Abzeichen „abgeleitet" in der
   Tabelle, damit es nicht wie ein eingetragener Termin aussieht.
4. **Sortierung am Zeitstrahl**: je Ebene nach Start, dann Ende, dann `position`;
   terminlose Zeilen zuletzt statt mitten in der Balkenfolge.
5. **Zeitraum aufziehen**: auf einer terminlosen Zeile den Balken direkt im Diagramm
   ziehen (`create`-Drag → PATCH). Der Weg von MS Project und OpenProject — statt 41
   Dialoge zu öffnen. Termine werden **nicht** aus der Phase erfunden; der Mensch
   legt sie fest.
6. **Netzablaufplan für Tasks**: `LinkType` um `todo` erweitert (WBS-Ebene unter dem
   Arbeitspaket, ADR-004), Ladefilter und Drop-Erkennung generisch. Verknüpfungspunkt
   an jedem Balken.
7. **Layout**: `70vh`-Deckel → `calc(100vh-16rem)`, Vollbild-Umschalter mit
   Escape-Ausstieg, im Vollbild breitere Namensspalte, „Alle zu-/aufklappen".

### Konsolidierung statt zweiter Wahrheit

`ganttRowItems` (PROJ-154) ist **entfernt** samt Tests: es filterte Tasks weg, bevor
die Baumlogik sie sah. Sichtbarkeit braucht den Baum, also entscheidet sie an einer
Stelle. Die Einschränkung des Eimers auf Arbeitspakete ist mit umgezogen — sonst
läuft er mit dem Scrum-Backlog voll (im Messprojekt 22 zusätzliche Zeilen), genau
PROJ-154s Anliegen.

## Nachweise

- **Rot-Grün beidseitig gegen Prod, zurückgerollt:** mit der alten Trigger-Fassung
  bleibt `derived_planned_start` bei einem terminierten Task `null` (Defekt
  reproduziert); mit der neuen erbt das Arbeitspaket `2026-09-01…09-05`.
- **Task→Task-Abhängigkeit live anlegbar** (`todo`/`todo`/`FS`) gegen echte
  Prod-Daten; der Validierungs-Trigger `tg_dep_validate_polymorphic_fk_fn` akzeptiert
  sie. Ein erfundener Typ wird mit `22023` abgelehnt.
- **API-Seite war immer bereit, unabhängig bestätigt:** die Route leitet den Typ mit
  genau derselben Regel ab (`kind === "work_package" ? "work_package" : "todo"`,
  `dependencies/route.ts:144/146`), `DependencyEntityType` enthält `todo`, das
  Zod-Schema akzeptiert es. Gefiltert hat nur die Oberfläche.
- **27 Zeilenlogik-Tests**, zwei davon fingen echte Fehler meiner ersten Fassung
  (doppelt gerenderte Kinder bei abweichender Phase; Zyklus ließ Items verschwinden).
- Gates: vitest **3959/3959** (457 Dateien) · ESLint **0** · tsc **13 = Baseline / 0
  neu** · Build clean · migration-naming 0 Fehler.
- Die ESLint-Regel `exhaustive-deps` fing einen echten Defekt: `calendarStart` fehlte
  im Commit-Effekt — nach einer Fensterverschiebung hätte das Aufziehen **falsche
  Termine** geschrieben. Behoben statt unterdrückt.

## Ausdrücklich nicht belegt

> **Nachtrag 2026-09-01:** der erste Punkt ist mit **PROJ-Y-155a** erledigt — der
> angemeldete Durchlauf und die Baseline existieren. Die beiden anderen stehen
> unverändert. Der Text bleibt als Stand vom 2026-08-28 erhalten, statt ihn
> umzuschreiben.

- **Kein angemeldeter Browser-Durchlauf.** Belegt sind Zeilenlogik (Unit), Rollup
  (live gegen Prod) und Verknüpfbarkeit (live gegen Prod) — nicht die Verkettung im
  Browser. Der Gantt hat im Bestand keine Komponententests und keine Visual-Baseline.
- **Kein Auto-Scheduling.** Eine Abhängigkeit verschiebt den Nachfolger noch nicht
  automatisch (`lag_days` existiert in `dependencies` und ist ungenutzt). Das ist der
  eigentliche Netzablaufplan-Ausbau → β.
- **Befund 3** (KI-Übernahme ohne Phase/Termin) bleibt PROJ-Y-154a.

## β — benannt, nicht gebaut

Auto-Scheduling (Nachfolger folgt dem Vorgänger, FS/SS/FF/SF wählbar, `lag_days`),
Vorgänger-Spalte in der Tabelle, kritischer Pfad über Tasks, Baseline-Vergleich.

**Design-Pass 2026-09-01 → [`docs/design/PROJ-155-beta-autoscheduling-brief.md`](../docs/design/PROJ-155-beta-autoscheduling-brief.md).**
Er teilt β in **β.1** (die Kante wird ein Objekt) und **β.2** (Auto-Scheduling) und
dreht damit die Reihenfolge dieses Absatzes um. Der Grund ist gemessen, nicht
erwogen: **„FS/SS/FF/SF wählbar" ist kein Merkmal des Schedulers, sondern eine
fehlende Eingabefläche.** Datenbank und *beide* Routen können alle vier Typen plus
`lag_days`; der Gantt schreibt hartkodiert `FS` (`gantt-view.tsx:964`, `lag_days`
kommt in der Datei **0-mal** vor), und `/abhaengigkeiten` kann nur lesen und
löschen — es gibt im ganzen Produkt **keine Stelle**, an der ein anderer Kantentyp
entsteht. Prod ausnahmslos: 4 Kanten, 4 × `FS`, 4 × Abstand 0.

Zwei weitere Befunde des Passes:

- **Die Rechenmaschine hätte kaum Treibstoff.** 138 lebende Arbeitspakete, davon
  **4** terminiert, **0** mit abgeleitetem Termin, **7** mit Phase; 4 Kanten;
  3 Wasserfall-Projekte von 32. Die **0** bei `derived_planned_start` ist dabei
  **kein Defekt** — nachgemessen sind Migration und Trigger aktiv, aber alle vier
  terminierten Items sind Wurzeln ohne Eltern und **0 Eltern haben terminierte
  Kinder**. Es gibt nichts hochzurollen; der α-Fix stimmt, der Bestand hat den Fall
  noch nicht.
- **β.2 braucht Vorschau statt stiller Kaskade.** Es gibt **kein Rückgängig** im
  Gantt (der einzige `undo`-Treffer ist ein Kommentar, der es für PROJ-25-β/γ
  reserviert), `planned_start`/`planned_end` stehen im Feld-Audit, und eine Kaskade
  über 30 Nachfolger schriebe **60** append-only Zeilen gegen heute **207**
  insgesamt. Dazu die eigene α-Entscheidung: der Sammelvorgang ist nicht ziehbar,
  weil „sein Zeitraum ein Ergebnis ist, kein Eingabefeld" — errechnete Termine
  still zu schreiben wäre die Gegenrichtung derselben Frage.

Empfohlene Reihenfolge: **PROJ-Y-155a → β.1 → CIA-Pass → β.2**. PROJ-Y-155a wandert
nach vorn, weil der Gantt 2091 Zeilen ohne Komponententests und ohne
Visual-Baseline ist und die Fixture-Lane, die er baut, genau die ist, die β.1
zum Prüfen braucht.

## Followups

- **PROJ-Y-155a** — angemeldeter Browser-Durchlauf plus Visual-Baseline für den Gantt.
  **Erledigt 2026-09-01** (`tests/PROJ-Y-155a-gantt-chain.spec.ts`, 6 Fälle, seriell,
  3× grün plus Kaltstart; Baseline `gantt-diagram.png`, Toleranz **20** gemessen
  zwischen 0 px Rauschen und 32 px kleinster Änderung). Damit ist die im Abschnitt
  „Ausdrücklich nicht belegt" benannte Lücke geschlossen: dass Aufgaben eingerückt
  erscheinen, das Aufziehen einen Balken erzeugt, der Sammelvorgang mitwächst und das
  Vollbild greift, ist jetzt im Browser belegt statt nur in Unit-Tests. **Der Rollup
  aus α ist dabei zum ersten Mal überhaupt gerendert worden** — die Lane seedet den
  Fall, den Produktion nicht enthält (0 von 138), und `derived_planned_start` steht
  danach auf der exakten Kinder-Spanne. Zwei Bedienbefunde fielen an → **PROJ-Y-155c**.
- **PROJ-Y-155b** — `wbs-display.ts` liest Termine weiter aus `attributes`, der Rest
  des Produkts aus der echten Spalte. Nach dem Rollup-Fix ist das keine stille Lücke
  mehr, aber zwei Leseorte bleiben. Mit Messung entscheiden, ob das JSONB-Feld
  irgendwo noch geschrieben wird.
- **Registerkorrektur** — die PROJ-25-Zeile im INDEX nennt SVAR React Gantt „MIT";
  das Paket ist GPLv3.
