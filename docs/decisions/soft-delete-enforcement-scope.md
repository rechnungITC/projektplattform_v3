# Soft-Delete (Papierkorb) — wo er durchgesetzt wird und wo bewusst nicht

**Status:** Accepted · **Entschieden:** 2026-08-21 (PROJ-Y-45m) · **Umfang:** produktweit

## Frage

Ein weich gelöschtes Projekt (`projects.is_deleted = true`) liegt im Papierkorb.
Müssen die projektbezogenen Auswertungsfunktionen (`construction_schedule_signals`,
`construction_defect_summary`, `project_task_bottlenecks`, `operative_report`,
`steering_report`, `risk_measure_overview`, `dd_report_consolidated`,
`workstream_dashboard`, `dd_findings_summary`, `stage_gate_prereadiness`,
`spa_issues_summary`) und die RLS der Kindtabellen den Papierkorb-Zustand
ebenfalls prüfen?

Der Anlass war ein Rot-Team-Befund an einer einzelnen Funktion (PROJ-45-δ, F-δ3):
`construction_schedule_signals` joint `projects` gar nicht und liefert die
vollständige Auswertung eines Papierkorb-Projekts, wenn man seine Kennung kennt.

## Messung (2026-08-21, gegen Prod)

* **11 von 11** projektbezogenen Auswertungsfunktionen filtern `projects.is_deleted`
  **nicht**. Nur eine (`steering_report`) liest die Tabelle `projects` überhaupt,
  und auch sie filtert nicht. Die `is_deleted`-Vorkommen in den übrigen betreffen
  Kindtabellen (`work_items`, `phases`, `risks`).
* **4 von 4** Bau-RLS-Policies (`construction_defects`, `construction_sections`,
  `project_construction_trades`, `construction_acceptances`) gaten auf
  `is_project_member(project_id)` — **ohne** Papierkorb-Prüfung.
* Die Anwendung prüft ihn dagegen **an genau einer Stelle**:
  `requireProjectAccess` (`src/app/api/_lib/route-helpers.ts`) selektiert
  `.eq("is_deleted", false)` und antwortet für ein Papierkorb-Projekt mit **404** —
  für **jede** der drei Aktionen `view` / `edit` / `manage_members`, und damit für
  jede Route, die den Helfer benutzt (die Terminsignal-Routen eingeschlossen).

## Entscheidung

Der Papierkorb ist ein **Zustand der Anwendungs- und Navigationsschicht**, keine
Datenschicht-Grenze. Durchgesetzt wird er **einmal**, in `requireProjectAccess`.
Auswertungsfunktionen und RLS wiederholen ihn **bewusst nicht**.

## Begründung

1. **Es schützt nichts.** Wer die Auswertung eines Papierkorb-Projekts abrufen kann,
   ist Projektmitglied und darf dieselben Zeilen über die Kindtabellen direkt lesen
   (RLS prüft dort nur die Mitgliedschaft). Ein Filter in der Auswertung würde eine
   Zahl verbergen, deren Bestandteile offen daneben liegen.
2. **Es wäre strenger als die Tabellen, die es liest.** Eine Auswertung, die weniger
   liefert als ein `select` auf ihre Quelltabellen, ist keine Sicherheitsgrenze,
   sondern eine Inkonsistenz.
3. **Elf Kopien driften.** Dieselbe Regel in elf Funktionen zu wiederholen erzeugt
   elf Orte, an denen sie fehlen kann — genau das Muster, das in diesem Repo
   mehrfach zu stillen Lücken geführt hat (vgl. die Register-Drift in PROJ-130-α).
4. **Der Papierkorb ist wiederherstellbar.** Er ist ausdrücklich kein Löschzustand;
   die Wiederherstellung läuft über `PATCH /api/projects/[id]` (`is_deleted`).
   Daten unsichtbar zu machen, die zurückkommen sollen, hilft niemandem.

## Folgen

* Ein direkter `supabase.rpc(...)`-Aufruf mit dem Anon-Key **umgeht** die 404 und
  liefert die Auswertung eines Papierkorb-Projekts an ein Projektmitglied. Das ist
  hiermit **dokumentiertes, akzeptiertes Verhalten** — kein Befund. Ein Nicht-Mitglied
  bekommt weiterhin nichts (RLS).
* Wird die Durchsetzungsstelle entfernt, fällt die Zusage **produktweit** und ohne
  Fehlermeldung. Sie ist deshalb festgenagelt:
  `src/app/api/_lib/route-helpers.soft-delete.test.ts` prüft sowohl das Verhalten
  (404 statt 403/500 für alle drei Aktionen) als auch **strukturell**, dass der
  Filter `.eq("is_deleted", false)` wirklich angewandt wird — ohne die zweite Hälfte
  bliebe der Test grün, wenn der Filter verschwindet.
* Neue projektbezogene Auswertungsfunktionen folgen dieser Konvention: **kein**
  `is_deleted`-Filter in der Funktion, Gate über `requireProjectAccess` in der Route.

## Verworfene Alternative

`projects.is_deleted` in alle elf Auswertungen und in die RLS der Kindtabellen
aufnehmen. Verworfen aus den vier Gründen oben; zusätzlich hätte es die Auswertungen
der M&A-Familie berührt, deren Pentests absolute Zahlen festnageln (PROJ-103,
PROJ-116, PROJ-131, PROJ-132) — ein produktweiter Eingriff für null Schutzgewinn.
