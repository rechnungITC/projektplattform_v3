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
`link-types.ts` (kennt bereits `supportsLag` je Kanten-Token — die Wahrheit über
„welcher Typ verträgt einen Abstand" existiert schon und wird **nicht** neu geschrieben).

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
18. Der kritische Pfad umfasst Arbeitspaket-Kanten, nicht nur Phasen.
19. Die Kaskade terminiert auch bei tiefen Ketten — belegt an einer Kette der Tiefe
    ≥ 20, nicht an der Prod-Lage (dort sind es 4 Kanten).

### Später (ausdrücklich nicht MVP)

Baseline-Vergleich (braucht eine eigene Tabelle) · Ressourcen-Leveling ·
Arbeitstage/Feiertage in der Rechnung (PROJ-53-β liefert sie nur als Anzeige) ·
Meilenstein-Alarm bei Kaskade · Kaskade über Projektgrenzen (PROJ-27
`cross_project_links` ist ein anderes Modell).

---

## Risks And Open Questions

- **Q1 — Rechnet der Server oder der Browser?** Die Vorschau braucht die Rechnung
  sofort und ohne Netz; das Übernehmen braucht sie autoritativ. Zwei Kopien derselben
  Formel sind genau die zweite Wahrheit, an der PROJ-155-α und PROJ-45-γ sich schon
  gestoßen haben. *Vorschlag:* reine TS-Funktion für die Vorschau, Server rechnet beim
  Übernehmen **neu** und liefert das Ergebnis zurück; weichen sie ab, gewinnt der Server
  und die Oberfläche sagt es. Zu entscheiden bei `/architecture`.
- **Q2 — Wohin gehört der Schalter?** `projects` (je Projekt, mehr Freiheit, eine
  Migration) oder `tenant_settings.module_settings` (kein Schema-Change, aber
  mandantenweit und damit gröber als der Anwendungsfall).
- **Q3 — Braucht β.2 einen CIA-Pass?** Kein neues Paket, keine neue Plattform — aber der
  Eingriff verändert das Schreibverhalten einer Kernentität (`work_items`-Termine) und
  erzeugt Audit-Volumen. Nach `.claude/rules/continuous-improvement.md` fällt das unter
  „Architekturentscheidungen vorbereiten". *Empfehlung: ja, für β.2; nein für β.1.*
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
