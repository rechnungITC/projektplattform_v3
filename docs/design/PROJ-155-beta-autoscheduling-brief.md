# Designer Brief: PROJ-155-β — Netzablaufplan und Auto-Scheduling

**Erstellt:** 2026-09-01 · **Stand des Codes:** `2f26269` · **Alle Zahlen live gegen Prod gemessen.**

> Dieser Brief ist ein Entwurf, kein Code. Er schneidet β zu, liefert die
> Akzeptanzkriterien für `/frontend` — und korrigiert die Reihenfolge, die
> PROJ-155 für β angenommen hat.

---

## Der Befund, der den Zuschnitt umdreht

PROJ-155 beschreibt β als *„Auto-Scheduling (Nachfolger folgt dem Vorgänger, FS/SS/FF/SF
wählbar, `lag_days`), Vorgänger-Spalte in der Tabelle, kritischer Pfad über Tasks,
Baseline-Vergleich"* — also als **eine** Slice, deren Kern die Rechenmaschine ist.

Gemessen ist das die falsche Reihenfolge. **„FS/SS/FF/SF wählbar" ist kein Merkmal des
Schedulers, sondern eine fehlende Eingabefläche** — und ohne sie rechnet der Scheduler
auf Dauer genau einen der vier Fälle.

| Ebene | Kann FS/SS/FF/SF | Kann `lag_days` | Beleg |
|---|---|---|---|
| Datenbank | ✅ `dependencies_constraint_type_check` | ✅ Spalte, Default 0 | Katalog |
| Route `/api/dependencies` | ✅ `z.enum(["FS","SS","FF","SF"])` | ✅ `z.number().int()` | `route.ts:28-29` |
| Route `/api/projects/[id]/dependencies` | ✅ beide Body-Formen | ✅ | `_schema.ts:32-33` |
| **Gantt (einziger Schreibweg)** | ❌ **hartkodiert `"FS"`** | ❌ **0 Vorkommen** | `gantt-view.tsx:964` |
| **`/abhaengigkeiten` (zweite Fläche)** | 👁 zeigt + filtert | 👁 zeigt | nur Lesen + Löschen |

**Netto: Der Kantentyp und die Verzögerung sind im Produkt lesbar, filterbar — und
nirgends setzbar.** Prod bestätigt es ohne Ausnahme: **4 Abhängigkeiten, 4 × `FS`,
4 × `lag_days = 0`**. Das ist keine Nutzerpräferenz, das ist die einzige Kombination,
die die Oberfläche herstellen kann.

### Der zweite Befund: die Maschine hätte fast keinen Treibstoff

| Größe | Prod |
|---|---|
| Lebende Arbeitspakete | **138** |
| davon mit eigenem Termin | **4** |
| davon mit abgeleitetem Termin (`derived_planned_start`) | **0** |
| davon mit Phase | **7** |
| Abhängigkeiten gesamt | **4** |
| Projekte lebend / davon Wasserfall·PMI·PRINCE2 | **32 / 3** |

Die **0** bei `derived_planned_start` ist **kein Defekt** — ich hatte sie zunächst dafür
gehalten und nachgemessen: Migration `20260828133639` ist angewendet, der Trigger
`tg_work_items_36a_rollup_recompute` ist aktiv, aber alle vier terminierten Items sind
Wurzel-Arbeitspakete **ohne Eltern**, und **0 Eltern haben terminierte Kinder**. Es gibt
nichts hochzurollen. Der α-Fix funktioniert; der Bestand hat den Fall noch nicht.

**Folge für den Entwurf:** β darf nicht als Rechenmaschine entworfen werden, die auf
gepflegte Netzpläne trifft. Sie trifft auf ein leeres Netz. Der Entwurf muss den
**Einstieg** mitliefern, sonst ist die erste Begegnung mit β ein Diagramm, in dem nichts
passiert, und die naheliegende Deutung ist „kaputt".

---

## Goal

Ein Projektleiter soll (1) eine Abhängigkeit **fachlich richtig** beschreiben können —
nicht nur „hängt zusammen", sondern *wie* und *mit welchem Abstand* —, und (2) sehen,
**was eine Terminverschiebung nach sich zieht**, bevor sie geschieht.

Nicht das Ziel: ein Termin-Optimierer. Kein Ressourcen-Leveling. Kein Kalender-Rechnen
über Feiertage hinweg (PROJ-53-β liefert die Feiertage nur als Anzeige).

---

## Benchmark Fit

- **Jira (Timeline/Advanced Roadmaps):** Abhängigkeiten sind Pfeile mit Typ; die
  Auswirkung einer Verschiebung wird als **Vorschau in einem Sandbox-Plan** gezeigt und
  erst per „Review changes" übernommen. → Genau das Muster, das hier fehlt.
- **ClickUp:** Kantentyp beim Ziehen wählbar, „Reschedule dependent tasks" ist ein
  **Schalter je Projekt**, nicht stilles Verhalten. → Der Schalter ist die richtige
  Antwort auf „automatisch oder nicht".
- **monday.com:** trennt sauber zwischen *Abhängigkeit* (Beziehung) und *Automation*
  (was bei Verschiebung passiert), inkl. Baseline-Vergleich. → Bestätigt die Trennung
  β.1 / β.2 unten.
- **Lokale V3-Vorlage:** [`dashboards/project-dependencies.html`](dashboards/project-dependencies.html)
  — Knotengraph mit hervorgehobenem kritischem Pfad, blockierten Knoten und
  Seitenpanel zum gewählten Knoten. Die **Seitenpanel-Idee** übernehme ich; den
  Knotengraphen nicht, weil PROJ-58 (`/graph`) ihn bereits hat und eine zweite
  Graphansicht die dritte Fläche für dieselben Kanten wäre.

---

## Zuschnitt: β.1 vor β.2

**β.1 — Die Kante wird ein Objekt.** Kantentyp und Verzögerung werden setzbar und
änderbar; die zwei Abhängigkeitsflächen bekommen klar getrennte Rollen. Kein Rechnen.

**β.2 — Auto-Scheduling.** Nachfolger folgt dem Vorgänger, Vorschau vor Übernahme,
kritischer Pfad über Tasks, Baseline.

**Warum in dieser Reihenfolge, nicht als eine Slice:** β.2 vor β.1 hieße, Rückmeldung
für eine Rechnung zu entwerfen, die nur eine Eingabeform kennt. Jeder
Vorschau-Bildschirm, jede Konflikt-Meldung und jeder Test wäre auf `FS`/`0`
zugeschnitten und müsste mit β.1 nochmal angefasst werden. β.1 ist zudem **für sich
nützlich** — ein Netzplan, dessen Kanten stimmen, ist auch ohne Automatik besser als
einer, in dem jede Kante behauptet, sie sei „Ende→Start ohne Abstand".

---

## β.1 — Die Kante wird ein Objekt

### Recommended View Strategy

- **Default:** unverändert der Gantt (`/planung`). β.1 fügt **keine** neue Fläche hinzu.
- **Sekundär:** `/abhaengigkeiten` — bekommt die Rolle **Register und Pflege**
  (alle Kanten des Projekts, filterbar, in Masse bearbeitbar).
- **Rollenteilung, ausgesprochen:** Der Gantt ist der Ort, an dem eine Kante
  **entsteht** (Ziehen ist die natürliche Geste). Das Register ist der Ort, an dem man
  sie **überblickt und korrigiert**. Beide schreiben dieselbe Tabelle; keine dritte
  Fläche.
- **Gruppierung/Sortierung im Register:** nach Quelle (Default), nach Typ, nach
  Zielphase. Bestehende Filter (Typ, Objektart) bleiben.

### Layout — Gantt

- **Header/Toolbar:** unverändert (Zoom, Heute, kritischer Pfad, Vollbild).
- **Hauptfläche:** unverändert.
- **Neu — Kanten-Popover.** Klick auf einen Pfeil öffnet ein `Popover` statt sofort den
  Löschdialog.

  ```
  ┌─ Abhängigkeit ──────────────────────────┐
  │  Fundament gießen  →  Rohbau starten    │
  │                                         │
  │  Typ        [ Ende → Start        ▾ ]   │
  │  Abstand    [  0 ] Tage                 │
  │             Negativ = Überlappung       │
  │                                         │
  │  [Entfernen]                 [Sichern]  │
  └─────────────────────────────────────────┘
  ```

  **Das ist zugleich eine Korrektur am Bestand:** heute ist Klick-auf-Pfeil ein
  **reiner Löschpfad** (`gantt-view.tsx:994`) — die einzige Handlung an einer Kante ist
  ihre Vernichtung. Nach β.1 ist Löschen eine von drei Handlungen und nicht mehr die
  Standardgeste.

- **Beschriftung am Pfeil:** heute steht der Typ nur im `title`/`aria-label`. Ein
  Tooltip ist auf Touch-Geräten nicht erreichbar. Bei `lag_days ≠ 0` oder Typ ≠ `FS`
  bekommt der Pfeil ein kleines Abzeichen (`SS`, `FF+3`), damit die Abweichung vom
  Normalfall **sichtbar** ist statt nur abfragbar. `FS`/`0` bleibt unbeschriftet — sonst
  ist jedes Diagramm zugepflastert.

### Layout — Register `/abhaengigkeiten`

- **Toolbar:** bestehende Filter + neu **„Abhängigkeit anlegen"** (die Fläche kann heute
  nur lesen und löschen — wer keine Termine hat, sieht im Gantt keine Balken und kann
  dort folglich auch nichts ziehen; ohne Anlege-Weg im Register ist die Kante in einem
  frisch angelegten Projekt **überhaupt nicht** erreichbar).
- **Tabelle:** Spalten Quelle · → · Ziel · **Typ** · **Abstand** · Angelegt von · Aktion.
  Typ und Abstand werden **inline** bearbeitet (`Select` bzw. Zahlenfeld), nicht in
  einem Dialog — es sind zwei Felder, ein Dialog wäre schwerer als die Handlung.
- **Detailpanel:** keins. Eine Kante hat fünf Felder; ein `Sheet` dafür wäre Zierde.

### Interactions

| Handlung | Verhalten |
|---|---|
| **Quick create** | Gantt: Ziehen wie heute → legt weiter `FS`/`0` an, öffnet aber **direkt das Popover**, damit der Typ ohne zweiten Weg korrigierbar ist. Register: „Anlegen" mit zwei Objekt-Auswahlfeldern. |
| **Inline edit** | Register: Typ und Abstand direkt in der Zeile. Gantt: im Popover. |
| **Bulk** | Register: Mehrfachauswahl → „Typ setzen" / „Entfernen". Der Bedarf ist real (ein importierter Plan hat viele Kanten gleichen Typs), der Aufwand klein, weil die Route je Kante ohnehin einzeln schreibt. |
| **Drag/drop** | unverändert. |
| **Tastatur** | Popover ist `Popover` + `Select` — Radix bringt Fokusfalle und Escape mit. Der Pfeil selbst braucht `tabIndex` und `role="button"`, sonst ist die Kante ausschließlich mit der Maus erreichbar (heute so). |
| **Rückmeldung** | Optimistisch **nein.** Ein Kantentyp ist eine Fachaussage; er wird geschrieben und dann angezeigt. Fehler → Toast mit Grund, alter Wert bleibt stehen. |

### States

- **Leer (Register):** „Noch keine Abhängigkeiten. Ziehen Sie im Gantt eine Verbindung
  zwischen zwei Balken — oder legen Sie hier eine an." Der Leerzustand ist in diesem
  Projekt der **Normalfall** (4 Kanten in 32 Projekten), er verdient den besseren Text.
- **Kein Termin, kein Balken:** Der Gantt zeigt für terminlose Zeilen seit α einen
  Aufzieh-Bereich. Im Register erscheint eine Kante zu einem terminlosen Objekt normal —
  mit dem Hinweis „Ziel ohne Termin", weil β.2 sie später nicht rechnen kann.
- **Lesend:** Popover zeigt Werte, Felder deaktiviert, kein „Entfernen".
- **Fehler:** Zyklus wird von `tg_dep_prevent_polymorphic_cycle` abgewiesen → Meldung
  „Diese Verbindung würde einen Kreis schließen" statt rohem Datenbanktext.
- **Mobil:** Der Gantt ist auf 375 px nicht bedienbar und war es nie. β.1 ändert das
  nicht und behauptet es nicht. Das **Register** ist die mobile Antwort und wird dort
  als Karten statt Tabelle gestapelt.

---

## β.2 — Auto-Scheduling

### Die tragende Entwurfsentscheidung: Vorschau statt stiller Kaskade

Drei Messungen zwingen sie, keine davon ist Vorsicht:

1. **Es gibt kein Rückgängig im Gantt.** Der einzige Treffer auf „undo" in
   `gantt-view.tsx` ist ein Kommentar, der es für PROJ-25-β/γ reserviert — nie gebaut.
   Jeder Zug ist heute ein Schreiben mit Toast, ohne Weg zurück.
2. **Eine Kaskade schreibt in ein append-only Protokoll.** `planned_start` und
   `planned_end` stehen in `_tracked_audit_columns('work_items')` (20 Spalten, seit
   PROJ-Y-130s wieder). Zwei Audit-Zeilen je verschobenem Item, **ohne Löschpfad** seit
   PROJ-130-α. Zum Größenvergleich: `work_items` hat heute **207** Audit-Zeilen
   insgesamt — ein einziger Zug, der 30 Nachfolger verschiebt, fügt **60** hinzu.
3. **α hat dieselbe Frage schon einmal beantwortet.** Der Sammelvorgang-Balken ist
   bewusst *nicht* ziehbar, weil „sein Zeitraum ein Ergebnis ist, kein Eingabefeld".
   Termine, die eine Rechnung erzeugt, still zu schreiben, wäre die Gegenrichtung
   derselben Frage.

**Also:** Ziehen berechnet die Kaskade, zeigt sie als **Geisterbalken** und eine
Kopfzeile „12 Nachfolger verschieben sich um 4 Tage · [Übernehmen] [Verwerfen]".
Übernehmen schreibt **eine** Anfrage, nicht zwölf.

Das ist zugleich das Jira-Muster („Review changes"), also kein Sonderweg.

### Der Schalter

Ein Projekt-Schalter „Nachfolger automatisch mitverschieben" (Default **aus**), im
Projektraum bei den Terminen. Aus = das heutige Verhalten, unverändert. An = Vorschau
beim Ziehen. **Auch bei „an" bleibt es die Vorschau** — der Schalter entscheidet, ob
gerechnet wird, nicht ob ungefragt geschrieben wird.

### Layout-Ergänzungen

- **Vorgänger-Spalte** in der Zeilenliste links: kompakt, `WBS-Code` des Vorgängers, bei
  mehreren „+2". Klick springt zur Zeile.
- **Kritischer Pfad über Tasks:** der Schalter existiert (`Kritischen Pfad
  ein-/ausblenden`) und färbt heute **Phasen** (`compute_critical_path_phases`, PROJ-43).
  β.2 erweitert ihn auf die Kanten zwischen Arbeitspaketen. **Vorbedingung, gemessen:**
  der Graph ist per Trigger zyklenfrei, eine topologische Ordnung existiert also immer —
  der längste Pfad ist ohne Abbruchheuristik berechenbar.
- **Baseline:** eigener Balken in Grau unter dem Ist-Balken, plus Abweichung in Tagen
  in der Zeile. Braucht eine Baseline-Tabelle → **nicht** in β.2, siehe „Später".

### Interactions β.2

| Handlung | Verhalten |
|---|---|
| Ziehen mit Schalter an | Geisterbalken + Kopfzeile mit Zahl, Escape verwirft |
| Übernehmen | **eine** Anfrage, serverseitig in einer Transaktion; Teilerfolg gibt es nicht |
| Konflikt | Ein Nachfolger, der durch die Kaskade vor seinen eigenen Vorgänger rutschen würde, wird in der Vorschau **rot** markiert und benannt; Übernehmen bleibt möglich, der Plan ist dann eben eng |
| Terminloser Nachfolger | wird **nicht** erfunden. Er erscheint in der Vorschau als „bekommt keinen Termin (keiner gesetzt)" — Termine aus einer Kante abzuleiten wäre dieselbe Erfindung, die α bei den Phasen abgelehnt hat |

---

## Dashboard And Rollups

- **Projektraum:** Kennzahl „Verschobene Nachfolger (30 Tage)" — misst Planungsunruhe,
  nicht Fortschritt. Erst mit β.2 sinnvoll.
- **Globales Dashboard:** nichts Neues. Eine Kantenzahl ist keine Führungsgröße.
- **My Work:** nichts. Eine Verschiebung erzeugt keine Aufgabe.
- **Alarm:** Erst wenn eine Kaskade einen **Meilenstein** verschiebt, ist es eine
  Ausnahme — das ist die eine Stelle, die nach oben gehört, und sie ist ein eigener
  Followup, weil `milestones` an der Kaskade heute gar nicht teilnimmt.

---

## Frontend Handoff

### Wiederverwenden statt bauen

`Popover`, `Select`, `Input`, `Badge`, `Table`, `AlertDialog`, `Tooltip` (alle
vorhanden) · `gantt-rows.ts` (Zeilenlogik aus α, unverändert) · `gantt-timeline.ts`
(Kalenderfenster) · `dependencies-tab-client.tsx` (Register, wird erweitert) ·
`@/types/dependency` (die **eine** Autorität für `FS`/`SS`/`FF`/`SF`, Beschriftungen,
Abstandsgrenzen und das Abzeichen — von β.1 angelegt, wird **nicht** neu geschrieben).

> **Korrektur des CIA-Passes (2026-09-01):** hier stand ursprünglich `link-types.ts`
> mit der Begründung, die Wahrheit über „welcher Typ verträgt einen Abstand" existiere
> schon. Das war eine **Fehlzuordnung**: `link-types.ts` gehört zu `work_item_links`
> (PROJ-27 — `relates`/`precedes`/`blocks`/…), einer anderen Tabelle, und sein
> `supportsLag` ist dort nur für `precedes`/`follows` wahr, während bei
> `FS`/`SS`/`FF`/`SF` **alle vier** einen Abstand vertragen. β.1 hat die Autorität
> unabhängig davon richtig angelegt (`@/types/dependency`); der Eintrag ist korrigiert,
> damit β.2 nicht an die falsche Registry andockt.

### Neu

- `dependency-edge-popover.tsx` — Popover am Pfeil (β.1)
- `create-dependency-dialog.tsx` — Anlegen im Register (β.1)
- `lib/work-items/schedule-cascade.ts` — **reine** Funktion: Kanten + Termine + gezogene
  Verschiebung → Liste der Folgeverschiebungen. Ohne I/O, damit sie testbar ist wie
  `gantt-rows.ts` (β.2)
- `cascade-preview-bar.tsx` — Kopfzeile mit Zahl und den zwei Knöpfen (β.2)

### Routen/Daten

- `PATCH /api/projects/[id]/dependencies/[did]` — **existiert noch nicht.** Heute gibt es
  nur POST und DELETE; ein Typwechsel wäre sonst Löschen-und-Neuanlegen, was zwei
  Audit-Zeilen und eine neue `created_at` erzeugt. (β.1)
- `POST /api/projects/[id]/schedule/apply` — eine Transaktion für die ganze Kaskade (β.2)
- Kein Schema-Änderungsbedarf für β.1. β.2 braucht den Projekt-Schalter
  (`projects` oder `tenant_settings` — offene Frage Q3).

### MVP-Akzeptanzkriterien β.1

1. Klick auf einen Abhängigkeitspfeil öffnet ein Popover mit Typ, Abstand und Entfernen —
   und **nicht mehr** direkt den Löschdialog.
2. Der Typ ist auf `FS`/`SS`/`FF`/`SF` setzbar, deutsch beschriftet, und der gesetzte
   Wert ist nach dem Neuladen noch da.
3. `lag_days` ist als ganze Zahl setzbar, negative Werte erlaubt, mit sichtbarer
   Erklärung „negativ = Überlappung".
4. Ein Pfeil mit Typ ≠ `FS` oder Abstand ≠ 0 trägt ein sichtbares Abzeichen — nicht nur
   einen Tooltip.
5. Das Register `/abhaengigkeiten` kann eine Abhängigkeit **anlegen**.
6. Typ und Abstand sind im Register inline bearbeitbar.
7. Ein Zyklus wird mit deutschem Klartext abgewiesen, nicht mit rohem Datenbanktext.
8. Der Pfeil ist per Tastatur erreichbar und mit Enter zu öffnen.
9. Ein Nicht-Bearbeiter sieht die Werte, kann sie aber nicht ändern und bekommt kein
   „Entfernen" angeboten.
10. **Gegenprobe:** Eine Kante, die als `FS`/`0` angelegt wurde, sieht im Diagramm
    unverändert aus wie vor β.1 — die Änderung ist additiv.

### MVP-Akzeptanzkriterien β.2

11. Der Projekt-Schalter „Nachfolger automatisch mitverschieben" existiert und steht
    per Default auf **aus**.
12. Bei „aus" verhält sich das Ziehen **byte-gleich** wie heute (Regressionstest).
13. Bei „an" erzeugt das Ziehen eine Vorschau mit Geisterbalken und der Zahl der
    betroffenen Nachfolger, **bevor** geschrieben wird.
14. „Verwerfen" und Escape schreiben nichts — nachgewiesen an der Datenbank, nicht an
    der Oberfläche.
15. „Übernehmen" schreibt in **einer** Anfrage; schlägt sie fehl, ist **kein** Termin
    geändert.
16. Ein Nachfolger ohne eigenen Termin bekommt **keinen** erfunden und wird in der
    Vorschau als solcher benannt.
17. `FS`, `SS`, `FF`, `SF` und ein Abstand ≠ 0 wirken je einzeln nachweisbar auf das
    Ergebnis — vier Fälle plus Abstand, nicht „der Scheduler läuft".
18. ~~Der kritische Pfad umfasst Arbeitspaket-Kanten, nicht nur Phasen.~~
    **Nach dem CIA-Pass aus β.2 herausgenommen → `PROJ-Y-155d`** (Nutzer-Entscheid
    2026-09-01). Begründung unten unter F-2: das ist kein Ausbau der bestehenden
    Funktion, sondern eine neue Rechnung mit eigener Leck-Fläche.
19. Die Kaskade terminiert auch bei tiefen Ketten — belegt an einer Kette der Tiefe
    ≥ 20, nicht an der Prod-Lage (dort sind es 5 Kanten).
20. **Der Meilenstein-Mitzug der Phase läuft über denselben transaktionalen
    Übernahme-Pfad** — nicht mehr über `Promise.all` mit verschluckten Fehlern
    (Nutzer-Entscheid 2026-09-01, Begründung unter F-4). Nachweis: schlägt eine
    Meilenstein-Verschiebung fehl, ist **kein** Termin geändert — an der Datenbank
    belegt, nicht an der Oberfläche.
21. Der Schalter selbst ist **auditiert**: sein Umstellen erzeugt eine Feld-Audit-Zeile
    (Nutzer-Entscheid Q2, Begründung unter F-1/R-B).

### Später (ausdrücklich nicht MVP)

Baseline-Vergleich (braucht eine eigene Tabelle) · Ressourcen-Leveling ·
Arbeitstage/Feiertage in der Rechnung (PROJ-53-β liefert sie nur als Anzeige) ·
Meilenstein-Alarm bei Kaskade · Kaskade über Projektgrenzen (PROJ-27
`cross_project_links` ist ein anderes Modell).

---

## Risks And Open Questions

- **Q1 — Rechnet der Server oder der Browser? → ENTSCHIEDEN (CIA-Pass 2026-09-01):**
  reine TS-Funktion für die Vorschau, der Server rechnet beim Übernehmen **neu** und
  gewinnt bei Abweichung; die Oberfläche sagt es dann. Präzedenz gemessen:
  `accept_proposal_from_context_bulk` (PROJ-70-β) macht genau das — serverseitige
  topologische Sortierung, eine Transaktion, kein Teilerfolg. Restrisiko R-A unten.
- **Q2 — Wohin gehört der Schalter? → ENTSCHIEDEN (CIA-Pass 2026-09-01):**
  `projects.settings` **plus** Audit-Whitelist-Eintrag **plus** `patchSchema`-Erweiterung.
  **Beide Formulierungen der Frage waren falsch** — siehe F-1: die Spalte existiert
  längst (`jsonb NOT NULL DEFAULT '{}'`, in Prod 0 Zeilen belegt), es braucht also
  **keine** Migration für den Speicherort; und `tenant_settings.module_settings`
  **existiert nicht**.
- **Q3 — Braucht β.2 einen CIA-Pass? → JA, und er ist gelaufen (2026-09-01).** Geführt
  als Halt-und-Frage-Checkpoint nach `.claude/rules/continuous-improvement.md`
  („die Regel ist, dass der Review stattfindet, nicht welches Werkzeug ihn durchführt";
  Präzedenz PROJ-45-β, PROJ-45-ε/Q-ε1, PROJ-Y-51b). Ergebnisse unten. β.1 brauchte
  keinen — das hat sich bestätigt.
- **R1 — β.1 ist auf echten Daten kaum prüfbar.** 4 Kanten in Prod, alle `FS`. Ein
  Durchlauf braucht eine eigene Fixture-Lane (Muster PROJ-Y-144d) — dieselbe, die
  **PROJ-Y-155a** ohnehin für den angemeldeten Gantt-Durchlauf braucht. Die beiden
  sollten sich eine Lane teilen statt zwei zu bauen.
- **R2 — Der Gantt ist 2091 Zeilen ohne Komponententests und ohne Visual-Baseline.**
  Jeder Eingriff ist ungesichert. β.1 sollte die erste Baseline mitbringen; das ist
  wörtlich PROJ-Y-155a und spricht dafür, es **vor** β.1 zu ziehen.
- **R3 — Zwei Flächen, ein Datenbestand.** Register und Gantt können auseinanderlaufen.
  Gegenmittel: beide über denselben Client-Wrapper, keine zweite Typ-Liste
  (`dependencyConstraintTypes` aus `_schema.ts` ist die eine Autorität).

---

## Reihenfolge — Nutzer-Entscheid 2026-09-01

**PROJ-Y-155a** (Netzschutz: Baseline + angemeldeter Durchlauf) → **β.1** (Kante wird ein
Objekt) → CIA-Pass → **β.2** (Auto-Scheduling).

β.1 ohne PROJ-Y-155a wäre ein Eingriff in 2091 ungesicherte Zeilen; und die Fixture-Lane,
die 155a baut, ist genau die, die β.1 zum Prüfen braucht.

**Entschieden, nicht mehr vorgeschlagen:** der Nutzer hat diese Reihenfolge am
2026-09-01 bestätigt. Wer β.1 vor PROJ-Y-155a zieht, weicht damit von einem
Nutzer-Entscheid ab und schuldet dafür eine Begründung — nicht bloß von einer
Empfehlung.

Die drei offenen Architekturfragen (Q1 Rechenort, Q2 Ort des Schalters, Q3 CIA-Pass für
β.2) bleiben **unentschieden** und gehören in `/architecture` für β.2. Sie blockieren
weder PROJ-Y-155a noch β.1.

---

## CIA-Pass β.2 — 2026-09-01

Geführt als **Halt-und-Frage-Checkpoint** (Sub-Agenten in dieser Sitzung aus;
`.claude/rules/continuous-improvement.md` sieht das ausdrücklich vor). Auslöser nach
Trigger-Liste: „Architekturentscheidungen vorbereiten" — β.2 verändert das
Schreibverhalten einer Kernentität (`work_items`-Termine). Kein neues Paket, keine neue
Plattform. **Alle Zahlen live gegen Prod gemessen, Stand `c8be1ee`.**

### Findings

**F-1 · Q2 war in beiden Ästen falsch beschrieben.** `projects` trägt bereits
`settings jsonb NOT NULL DEFAULT '{}'` — in Prod **0 Zeilen belegt, 0 Schlüssel in
Benutzung**, ein leerer ungenutzter Eimer. Der Schalter braucht dort **keine Migration**.
Und `tenant_settings.module_settings` **existiert nicht** (vorhanden sind
`active_modules`, `privacy_defaults`, `ai_provider_config`, `retention_overrides`,
`budget_settings`, `output_rendering_settings`, `cost_settings`, `risk_score_overrides`,
`assistant_settings`, `trajectory_plan_mutate_enabled`, `feature_flags`,
`ai_chat_settings`). Zwei Einschränkungen, die zum Entscheid gehören: `settings` steht
**nicht** in `_tracked_audit_columns('projects')` (12 Spalten; `type_specific_data` ja,
`settings` nein), und `patchSchema` der Projekt-Route nimmt es nicht an. → Entscheid:
`projects.settings` + Whitelist-Eintrag (eine Anker-Ersetzung, Muster PROJ-154) +
`patchSchema`.

**F-2 · AC-18 ist kein Ausbau, sondern ein Neubau — und die naive Erweiterung wäre ein
Aggregat-Leck.** `compute_critical_path_phases` ist `SECURITY DEFINER`, gibt `uuid[]`
zurück, trägt `search_path=public, pg_temp` — und liest **`work_items` überhaupt nicht**
(0 Vorkommen im Funktionskörper). Sie auf Arbeitspaket-Kanten zu erweitern hieße: eine
neue Rechnung über eine Tabelle mit `confidentiality_level` und RESTRICTIVE-Policies
(PROJ-100a), ausgeführt im Rechtekontext des Eigentümers. Genau der Fall, den CLAUDE.md
ausschließt („Aggregates leak. Any RPC that counts, sums, or produces a pre-read must be
`SECURITY INVOKER`"). → Entscheid: **aus β.2 heraus** nach `PROJ-Y-155d`; dort als
INVOKER-Funktion mit eigener Aggregat-Leck-Probe.

**F-3 · Der Reuse-Eintrag `link-types.ts` war eine Fehlzuordnung** — oben im Brief
korrigiert. β.1 hatte die Autorität unabhängig richtig angelegt, es ist also kein
Schaden entstanden; der Eintrag hätte β.2 aber an eine Registry über eine **andere**
Tabelle geschickt.

**F-4 · Der Defekt, den AC-15 ausschließt, existiert im Gantt schon.** Der Phasen-Zug
(`gantt-view.tsx`, Zweig `snapshot.kind === "phase"`, Modus `move`) fächert über die
Kind-Meilensteine auf: `Promise.all` über N einzelne `PATCH`-Aufrufe, jeder mit
`.catch(() => undefined)`. **N Schreibvorgänge, keine Transaktion, Fehler verschluckt.**
AC-15 verlangt für die Kaskade das Gegenteil. → Entscheid: **in β.2 mitziehen**
(neues AC-20), damit „eine Anfrage, kein Teilerfolg" auf der ganzen Fläche dasselbe
bedeutet.

**F-5 · Eine vermutete Gefahr widerlegt.** `tg_work_items_36a_rollup_recompute` ist
`AFTER INSERT/DELETE/UPDATE` auf `work_items` und schreibt in seinem Körper selbst
`update public.work_items` — das sah nach Wiedereintritt mit exponentiellem Verhalten in
der Baumtiefe aus. Nachgemessen trägt der Trigger `WHEN (pg_trigger_depth() = 0)`: die
Vorfahren-Schreibvorgänge feuern ihn nicht erneut. **Kein Rekursionsrisiko.** Ferner
stehen die `derived_*`-Spalten **nicht** in der Audit-Whitelist — der Rollup erzeugt
**null** Audit-Zeilen. Das begrenzt die Volumenfrage exakt: 2 Zeilen je verschobenem
Nachfolger, nichts obendrauf.

**F-6 · AC-19s Terminierungs-Prämisse geprüft und gehalten.**
`tg_dep_prevent_polymorphic_cycle` feuert **BEFORE INSERT *und* UPDATE** (nicht nur
INSERT, was ein stiller Weg zum Zyklus gewesen wäre) und hat einen Tiefenriegel von
**10000** — nicht der 20er-Riegel, der in PROJ-Y-45l still unterberichtete. Eine
topologische Ordnung existiert damit immer, der längste Pfad ist ohne Abbruchheuristik
berechenbar.

**F-7 · Zwei Zahlen des Briefs sind schon veraltet.** Gemessen am 2026-09-01 gegen den
Stand vom Vormittag: Abhängigkeiten 4 → **5**, lebende Arbeitspakete 138 → **145**,
davon mit eigenem Termin 4 → **9**, und `derived_planned_start` 0 → **2**. Der Absatz,
mit dem der Brief die „0" erklärt („der Bestand hat den Fall noch nicht"), gilt nicht
mehr — **PROJ-Y-155as Fixture hat den Fall erzeugt**, der α-Rollup ist damit erstmals an
echten Daten beobachtbar. Ferner: **114 von 271** `work_items`-Audit-Zeilen sind bereits
`planned_start`/`planned_end` (42 %). Termin-Unruhe ist schon heute die größte
Audit-Kategorie — das **schärft** das Vorschau-Argument statt es zu schwächen.

### Risks

- **R-A (aus Q1):** Vorschau im Browser und autoritative Rechnung im Server sind zwei
  Kopien einer Formel — die Klasse, an der PROJ-45-γ sich stieß (Postgres klemmt am
  Monatsende, `setUTCMonth` läuft über, und die Maske zeigte ein anderes rechtlich
  relevantes Fristende als gespeichert wurde). Hier ist es reine Tagesaddition, das
  Divergenzrisiko ist kleiner, aber nicht null. **Gegenmittel wie dort:** dieselben
  Datumspaare in beiden Fassungen einfrieren, plus die Regel „bei Abweichung gewinnt der
  Server und die Oberfläche sagt es".
- **R-B (aus Q2):** Ein Schalter in `projects.settings` wäre ohne Whitelist-Eintrag
  **unauditiert**. Wer das Schreibverhalten einer Kernentität umstellt, soll eine Spur
  hinterlassen — die PROJ-Y-130h-Lehre („wer die Ausnahme setzt, kann seine eigene Spur
  nicht verwischen"). Deshalb ist der Whitelist-Eintrag Teil des Entscheids, nicht
  Beiwerk.
- **R-C:** β.2 ändert Schreibverhalten von `work_items`. **AC-12** (Ziehen bei „aus"
  byte-gleich wie heute) ist der tragende Regressionstest, nicht Formsache.
- **R-D (neu, aus F-4):** Den Meilenstein-Mitzug mitzuziehen erweitert den Umfang von
  β.2 um einen Bestandspfad. Der Preis ist bewusst gezahlt: die Alternative wäre eine
  Fläche, auf der dieselbe Zusage zweierlei bedeutet.

### Entscheide (Nutzer, 2026-09-01)

| Frage | Entscheid |
|---|---|
| Q1 Rechenort | Vorschau in TS, Server rechnet beim Übernehmen neu und gewinnt |
| Q2 Ort des Schalters | `projects.settings` + Audit-Whitelist + `patchSchema` |
| Q3 CIA-Pass | Ja für β.2 (dieser Pass), nein für β.1 — bestätigt |
| F-4 Meilenstein-Auffächerung | **in β.2 mitziehen** (AC-20) |
| AC-18 kritischer Pfad | **aus β.2 heraus** → `PROJ-Y-155d` |

Kein neues Paket. Eine Migration (Audit-Whitelist), kein Schema-Change.
Reihenfolge unverändert: dieser Pass → β.2.
