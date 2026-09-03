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

**β.1 ausgeliefert 2026-09-01** — die Kante ist ein Objekt. Typ und Abstand
sind setzbar (Maske am Pfeil im Diagramm, inline im Register), das Register kann
erstmals **anlegen**, ein Pfeil mit Abweichung vom Normalfall trägt ein sichtbares
Abzeichen, und der Pfeil ist per Tastatur erreichbar. Neue Route
`PATCH …/dependencies/[did]`; keine Migration, kein Paket. Damit sieht der
künftige Scheduler nicht mehr ausschliesslich `FS`/0.

Vier Funde beim Bauen, alle gemessen und alle mitbehoben: die Typliste stand
**viermal** im Repo (einmal mit englischen Beschriftungen) → eine Autorität in
`@/types/dependency`, aus der auch das Zod-Enum abgeleitet ist; `DELETE` prüfte
die Projektzugehörigkeit **nicht** (Klasse PROJ-45-β, kein Mandantenleck, aber
Wirkung am falschen Ort möglich); der Gantt las `lag_days` **gar nicht**; und der
Anlege-Pfad zeigte **nie einen Grund** — er las `err?.message`, die API antwortet
`{ error: { code, message } }`, die Beschreibung war also immer `undefined`.
Abweichung: **Dialog statt Popover** — ein Popover müsste an einem SVG-Pfad
verankert werden, dessen Lage von Zoom, Bildlauf und Zeilenhöhe abhängt; die
Substanz des Kriteriums ist „Löschen ist eine von drei Handlungen".

Empfohlene Reihenfolge: **PROJ-Y-155a → β.1 → CIA-Pass → β.2** (beide ersten
Schritte erledigt). PROJ-Y-155a wandert
nach vorn, weil der Gantt 2091 Zeilen ohne Komponententests und ohne
Visual-Baseline ist und die Fixture-Lane, die er baut, genau die ist, die β.1
zum Prüfen braucht.

## β.2 — QA Test Results (2026-09-02)

**Verdikt: β.2 ist NICHT produktionsreif — 0 Critical / 2 High / 0 Medium / 1 Info.**
Lifecycle bleibt `Deployed`, Scope bleibt `alpha`: ein rückwirkender Durchgang
bewertet, er nimmt die Auslieferung nicht zurück (Präzedenz PROJ-51-`/qa`). Die
Zeile wird durch diesen Durchgang aber **ehrlicher**, nicht besser — β.2 ist in
Produktion heute **inert**, und das war vorher nicht bekannt.

Der Durchgang holt nach, was `/frontend` ausdrücklich offen gelassen hatte: den
authentifizierten Browser-Durchlauf der Verkettung Ziehen → Vorschau →
Übernehmen. Genau dort liegen beide Funde.

### Kriterien

| AC | Ergebnis | Nachweis |
|---|---|---|
| AC-11 Schalter per Default aus | **PASS** | `PROJ-155-beta2-qa-chain` — Prod-Zustand `settings = {}` |
| AC-12 bei „aus" byte-gleiches Verhalten | **PASS, aber trivial** | Ziehen schreibt direkt, alte Erfolgsmeldung, kein Vorschau-Bereich — besteht heute allerdings auch deshalb, weil F-2 den Schalter nie auf „an" bringt. Nach der Behebung erneut zu fahren |
| AC-13 Vorschau **vor** dem Schreiben | **FAIL (F-2)** | im Browser nicht erreichbar; die Vorschau erscheint nie, weil der Schalter nicht eingelesen wird |
| AC-14 Verwerfen schreibt nichts | **nicht führbar (F-2)** | serverseitig gedeckt (ohne Aufruf von `…/schedule/apply` wird nichts geschrieben, Rot-Team R1–R7), die Browser-Hälfte hängt an F-2 |
| AC-15 Übernehmen atomar | **PASS** | Kette: Nachfolger zieht mit; ein unmögliches Ziel verwirft **alle** Schreibvorgänge (409 `shift_target_not_writable`); Pentest V2 |
| AC-16 keine erfundenen Termine | **PASS** | terminloser Nachfolger bleibt terminlos, erscheint als `skipped` |
| AC-17 die vier Kantentypen unterscheiden sich | **PASS** | 20 Unit-Fälle; gleiche Ausgangslage → `[10, 0, 5, 0]` je Typ |
| AC-19 Tiefenriegel | **PASS** | Kette der Tiefe 25, `CASCADE_MAX_DEPTH = 200`, `truncated` wird ausgewiesen |
| AC-20 Phasen-Zug nimmt Kind-Meilensteine mit | **PASS** | `applied.phases: 1`, `applied.milestones: 1`, Meilenstein +3 Tage — in **einer** Transaktion |
| AC-21 der Schalter ist auditiert | **PASS** | genau **eine** Feld-Audit-Zeile je Umstellung; Gegenprobe: `updated_at` bleibt unprotokolliert |

### F-1 (High) → **PROJ-Y-155f**: die Route sieht die Kanten nicht, die es in Prod gibt

`schedule/apply/route.ts:181-182` filtert die Abhängigkeiten auf
`from_type = "todo"` **und** `to_type = "todo"`. `dependencyEntityTypes` hat aber
**vier** Werte, und in Produktion gibt es **keine einzige** todo/todo-Kante —
gemessen: 2× `work_package→work_package`, 2× `phase→phase`, 1× gemischt. Die
Kaskade der Route ist damit in Prod **immer leer**.

Live über HTTP belegt, nicht abgeleitet: mit einer geseedeten
`work_package→work_package`-Kante und terminiertem Nachfolger antwortet die Route

```
{"applied":{"total":1,…},"cascade":{"shifts":[],"skipped":[],"conflicts":[],"truncated":false},"diverged_from_preview":false}
```

— der Nachfolger bleibt auf `2026-03-11` stehen statt auf `2026-03-16` zu wandern.

**Das Gewicht liegt in der Asymmetrie:** der Gantt filtert *anders*
(`known.has(from_id) && known.has(to_id)`, ohne Typprüfung) und zeigt die Kaskade
korrekt an. Vorschau und Server sehen also **verschiedene Kantenmengen** —
ausgerechnet in der Slice, deren tragende Entscheidung war, dass es nur **eine**
Formel gibt. Die Formel ist geteilt (`computeScheduleCascade`), ihre **Eingabe**
wird an zwei Orten unterschiedlich beschafft. Nebenbefund: `diverged_from_preview`
meldet `false`, weil der Browser bei ausgeschaltetem Schalter keine Erwartung
mitschickt — die Divergenzmeldung verschleiert den Grund, statt ihn zu nennen.

### F-2 (High) → **PROJ-Y-155g**: der Schalter lässt sich setzen, aber nicht einlesen

`planung-client.tsx:71` liest `project?.settings?.autoScheduleSuccessors` aus
`useProject` (**Einzahl**, `src/hooks/use-project.ts`). Dessen SELECT (Zeile 73)
führt `settings` **nicht** — β.2 hat die Spalte nur in `use-projects.ts`
(**Mehrzahl**, Zeile 74) ergänzt. Folge: der Schalter rendert **immer** als „aus",
der Gantt bekommt `autoScheduleSuccessors={false}`, und Vorschau, Geisterbalken,
Escape-Abbruch und Übernehmen sind über die Oberfläche **nicht erreichbar**.

Im Browser gemessen: `settings = {"autoScheduleSuccessors": true}` in der
Datenbank, `aria-checked="false"` in der Oberfläche, und das Ziehen geht den
alten Weg (`PATCH …/work-items/…`, Termine sofort geschrieben, `REGION count: 0`).

**Der Schreibweg ist intakt** — `PATCH /api/projects/[id]` persistiert und erzeugt
seine Audit-Zeile (AC-21 PASS). Es fehlt nur der Rückweg. Umfang exakt: von den
16 Feldern des `Project`-Typs fehlen dem Einzel-Hook **zwei**, `settings` und
`project_method`; `project_method` liest **kein** Konsument dieses Hooks (alle acht
geprüft), `settings` liest genau einer — und das ist der Defekt. Der Fix umfasst **zwei** Zeilen, nicht eine: `settings` in die SELECT-Liste **und** `settings: raw.settings ?? null` in die explizite Abbildung. Das erklärt zugleich die Stummheit des zweiten Wächters — `hook-mapping-drift` verlangt, dass jede **gelesene** Spalte abgebildet wird; `settings` war in dieser Datei weder gelesen noch abgebildet, das Paar ist also in sich **konsistent** und schweigt zu Recht.

### F-3 (Info) → Teil von **PROJ-Y-155g**: warum die Drift-Wächter das durchgelassen haben

`type-vs-select-drift.test.ts` erklärt je Typ **einen** `primarySelect` — für
`Project` ist das `use-projects.ts`. Die Spalte dort zu ergänzen hat den Wächter
befriedigt. `hook-mapping-drift.test.ts` prüft die Gegenrichtung (jede gelesene
Spalte muss abgebildet werden) und listet `use-project.ts` sehr wohl auf — es
verlangt aber nicht, dass die Felder des Typs auch **gelesen** werden. Das Paar
erzwingt beide Richtungen also **je Datei**, und „Typfeld muss im SELECT stehen"
nur für die eine erklärte Datei. Ein zweiter Hook auf denselben Typ ist ungeprüft.
Eine Behebung von F-2 ohne diese Erweiterung schließt den Einzelfall, nicht die Klasse.

### Nachweise

- **Kette + Fundkodierung** `tests/PROJ-155-beta2-qa-chain.spec.ts` **9/9** chromium
  (F-1 und F-2 als `test.fail()` **im Testkörper** — sie beschreiben den
  Soll-Zustand und schlagen an, sobald jemand sie behebt, statt den Ist-Zustand
  einzufrieren; Muster aus dem PROJ-51-`/qa`).
- **Rot-Team über HTTP** `tests/PROJ-155-beta2-redteam.spec.ts` **5/5** — die Route
  war mit β.2 neu und hatte **keinen** Auth-Gate-Test (dieselbe Lücke wie an
  PROJ-45-βs fünf neuen Routen). R1 ohne Sitzung genau **307**, Rumpf ohne
  Arbeitspaket-Kennung; R2 wirklich fremdes Projekt → 404 und nichts geschrieben;
  R3 kaputte Projekt-Kennung → 400; R4/R5/R6 kein JSON, Injektion im Datum,
  Meilenstein ohne Zieldatum → je 400 **mit Gegenprobe**, dass keiner der drei
  Versuche geschrieben hat; R7 projektfremder Knoten → abgewiesen, die Adresse ist
  nicht dekorativ.
- **R2 musste korrigiert werden, und das ist der Nebenertrag:** der erste Anlauf
  nahm `E2E_PROJECT_ID` als „fremd" — live gemessen ist der geteilte E2E-Nutzer
  aber Mandanten-Admin in **vier von fünf** Test-Mandanten (und Mandanten-Admins
  bekommen per `isProjectEditAllowed` in *jedem* Projekt Schreibrecht). Der Vektor
  hätte belegt, dass ein Berechtigter schreiben darf. Einziger echter Fremdmandant
  ist die Visual-Spur aus PROJ-Y-143l; eine Vorbedingung im Test bricht ab, falls
  sich das ändert. Klasse B-γ2 / PROJ-Y-114a.
- **Live-Pentest wörtlich 12/12 PASS / 0 FAIL** gegen Prod, Rollback erzwungen
  (V2 Atomizität `P0002` ohne Teilerfolg · V3 Audit 0→1 **mit** V3b-Gegenprobe ·
  V4/V5/V6 `22023` · V7 fremdes Projekt · **V8** Nicht-Mitglied `P0002`, INVOKER
  trägt, **mit V8b-Gegenprobe**, dass ein Mitglied sehr wohl schreibt).
- **Regression** `PROJ-Y-155a` **7/7** und Visual **9/9 ohne Neuaufnahme** —
  darunter „Baseline des Diagramms", also der Nachweis, dass β.2 das Diagramm im
  Ruhezustand nicht bewegt hat.
- **Gates:** vitest **4227/4227** · ESLint **0 Fehler** (4 Warnungen, alle in einer
  fremden PROJ-153-Datei) · tsc **11 = Baseline**, keiner in einer Datei dieses
  Durchgangs · alle **fünf** Datei-Wächter OK (index-scope, register-consistency,
  token-drift, migration-naming, function-inventory).
- **Rückstände 0** über sechs Zähler: kein `[PENTEST 155b2]`-Projekt, kein
  `[QA β.2]`-Arbeitspaket, Gantt-Schalter wieder `{}`, `WP_DATED` wieder
  `2026-03-02 bis 2026-03-10`, `WP_DERIVED` wieder terminlos, geteiltes Projekt
  wieder 0 Arbeitspakete.

### Offengelegt statt gerundet

**145 Feld-Audit-Zeilen** bleiben aus diesem Durchgang stehen (58 `planned_start`
+ 58 `planned_end` + 12 `settings` + 6+6 Phasen + 3 Meilenstein + 2
`constraint_type`). Sie sind seit PROJ-130-α ohne Löschpfad, und
`audit_lifecycle_exempt` deckt Anlage und Löschung, **nicht** Feldänderungen —
genau **PROJ-Y-45e**. Bewusst **nicht** über den Runbook-Weg entfernt: dafür wären
in Produktion Append-only-Wächter abzuschalten, und dieses Risiko ist größer als
145 synthetische Zeilen in einem Test-Mandanten.

### Abweichungen

- **D-β.2-QA-1** kein Viewer-Durchlauf im Browser: in der Gantt-Spur ist der
  geteilte Nutzer Mandanten-Admin und bekommt damit überall `edit`; das Rollen-Tor
  ist auf Route-Ebene (Unit) und in der Datenbank (Pentest V8) belegt. Gleiche
  Grenze wie in PROJ-80-α.
- **D-β.2-QA-2** Mobile Safari umgebungsbedingt übersprungen (WebKit-Bibliotheken
  fehlen, PROJ-67/F2); Firefox ist nicht konfiguriert. Alle Browser-Zahlen sind
  **chromium-only**.
- **D-β.2-QA-3** AC-18 (kritischer Pfad) ist nicht Teil von β.2 — beim
  Design-Pass herausgenommen und als PROJ-Y-155d registriert; hier also kein
  offenes Kriterium.

### Handoff

Zwei High-Funde, beide **nicht** in diesem Durchgang behoben (die QA findet und
dokumentiert, sie repariert nicht): **PROJ-Y-155f** (Kantentypen in der Route) und
**PROJ-Y-155g** (Einzel-Hook liest `settings` nicht, samt Wächter-Erweiterung aus
F-3). Beide sind klein — eine Zeile für F-1, zwei für F-2, plus Wächter —, aber
zusammen entscheiden sie, ob β.2 überhaupt etwas tut. Nach der Behebung sind
AC-13 und AC-14 im Browser zu führen und AC-12 erneut, weil er heute nur den
einzigen erreichbaren Zweig belegt.

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
- **PROJ-Y-155f** — die Route filtert die Abhängigkeiten auf `todo`/`todo`, in Prod
  existiert **keine** solche Kante (2× `work_package`, 2× `phase`, 1× gemischt). Die
  Kaskade der Route ist damit immer leer, während der Gantt sie korrekt anzeigt —
  Vorschau und Server sehen verschiedene Kantenmengen. **High**, aus dem β.2-`/qa`
  (F-1). Fix ist eine Zeile; der eigentliche Auftrag ist, die Kantenbeschaffung an
  **einen** Ort zu ziehen, so wie es die Rechnung schon ist.
- **PROJ-Y-155g** — `use-project.ts` (Einzahl) liest `settings` nicht, deshalb rendert
  der Auto-Scheduling-Schalter immer als „aus" und die ganze Vorschau-Kaskade ist über
  die Oberfläche unerreichbar. **High**, aus dem β.2-`/qa` (F-2). Umfasst die
  Wächter-Erweiterung aus F-3: `type-vs-select-drift` prüft je Typ nur **einen**
  erklärten SELECT — ein zweiter Hook auf denselben Typ ist ungeprüft, und ohne diese
  Hälfte ist nur der Einzelfall geschlossen, nicht die Klasse.
- **Registerkorrektur** — die PROJ-25-Zeile im INDEX nennt SVAR React Gantt „MIT";
  das Paket ist GPLv3.
