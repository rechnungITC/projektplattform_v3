# PROJ-61: Jira-like Releases with Story Gantt / Phase Mapping

## Status: In Progress
**Created:** 2026-05-09
**Last Updated:** 2026-05-13

## Summary

Scrum and software projects expose `/projects/[id]/releases` through PROJ-28, but the page currently reuses the generic `planung` implementation. That implementation is phase/work-package oriented and loads only `work_package` items into the Gantt.

For a Jira-like Scrum workflow, Releases must show the delivery timeline of Stories, Tasks and Bugs in relation to Sprints, phases/milestones and release windows. Users expect the Release view to answer:

- Which Stories/Bugs/Tasks are in which release?
- Which Sprint contributes to which release?
- Where are Stories on a timeline?
- Which Stories are delayed, blocked or outside the release window?
- How does the Story timeline relate to phases/Gantt?

PROJ-61 defines the Release planning layer and Story-Gantt view for Scrum/SAFe/software projects.

## Current State / Gap

- `/projects/[id]/releases` is a thin alias to `/planung`.
- `PlanungClient` loads phases, milestones and `work_package` items.
- `GanttView` visualizes phases, milestones and work packages, not Stories.
- There is no first-class `release` entity yet.
- PROJ-46 mentions software extension, but release planning is not yet implemented.

## Dependencies

- **Requires PROJ-9** — Work Items with `kind`, `sprint_id`, `phase_id`, parent hierarchy.
- **Requires PROJ-25** — existing Gantt rendering concepts and date handling.
- **Requires PROJ-28** — method-aware `/releases` route exists.
- **Coordinates with PROJ-60** — Sprint assignment for Stories/Tasks/Bugs feeds release scope.
- **Related PROJ-46** — broader Software Project Extension.
- **Related PROJ-47/50** — Jira Export/Bidirectional Sync must map release/version fields later.

## Scope

### In Scope

- Jira-like Release view for Scrum/SAFe/software projects.
- Release entity or release-like metadata, depending on architecture decision.
- Story/Task/Bug timeline in the Release view.
- Sprint-to-release relationship.
- Story-to-phase/milestone relation where available.
- Release health signals: blocked items, outside-window items, overdue items.
- Gantt-like visualization of Stories and their child Tasks/Bugs.

### Out of Scope

- Full Jira sync implementation.
- Full portfolio roadmap.
- Resource capacity leveling.
- Automatic scheduling engine.
- Replacing the existing Waterfall phase Gantt.

## User Stories

- **Als Product Owner** moechte ich Releases wie in Jira sehen, damit ich Scope und Liefertermin je Release kontrollieren kann.
- **Als Scrum Master** moechte ich Stories, Tasks und Bugs im Release-Gantt sehen, damit ich Sprint-Planung und Release-Ziel abgleichen kann.
- **Als Projektleiter:in** moechte ich erkennen, welche Stories ausserhalb des Release-Zeitraums liegen, damit ich Scope oder Termin korrigieren kann.
- **Als Stakeholder** moechte ich eine verstaendliche Release-Timeline sehen, damit ich nachvollziehen kann, wann welche Funktion geliefert wird.
- **Als Jira-erfahrener Nutzer** moechte ich eine Version/Release-Sicht, die Stories und Bugs nicht nur in Phasen versteckt.

## Functional Acceptance Criteria

- [ ] `/projects/[id]/releases` nutzt fuer Scrum/SAFe nicht mehr nur die generische Phase/Work-Package-Planung.
- [ ] Releases koennen als eigene Planungscontainer angezeigt werden.
- [ ] Stories, Tasks und Bugs koennen einem Release zugeordnet oder mindestens in Release-Scope berechnet werden.
- [ ] Release view zeigt Sprints, die zum Release beitragen.
- [ ] Release view zeigt Stories/Tasks/Bugs mit Status, Prioritaet, Sprint und Parent.
- [ ] Story-Gantt zeigt Stories als Timeline-Bars.
- [ ] Child Tasks/Bugs koennen unter einer Story sichtbar werden.
- [ ] Items ohne Datum verwenden Sprint-Zeitraum als abgeleiteten Zeitraum, wenn `sprint_id` gesetzt ist.
- [ ] Items mit eigenem Datum verwenden `planned_start`/`planned_end`.
- [ ] Items ohne Sprint und ohne Datum werden als "nicht geplant" ausgewiesen.
- [ ] Milestones koennen als Release-Marker angezeigt werden.
- [ ] Phasen koennen als Hintergrund-/Swimlane-Kontext eingeblendet werden.
- [ ] Items ausserhalb des Release-Zeitraums werden markiert.
- [ ] Blockierte/kritische Items werden hervorgehoben.
- [ ] Existing `/planung` Gantt fuer Wasserfall/PMI/PRINCE2 bleibt unveraendert.

## Non-Functional Acceptance Criteria

- [ ] Die Ansicht ist fuer nicht-technische Stakeholder lesbar.
- [ ] Jira-like, aber V3-method-aware: Scrum Release View != Waterfall Phase Gantt.
- [ ] Timeline bleibt bei 500 Work Items performant.
- [ ] Keine Vermischung von Release-Scope, Sprint-Zuordnung und Parent-Hierarchie in einem unklaren Drop.
- [ ] Spätere Jira Sync Felder koennen ohne Bruch ergaenzt werden.

## Wechselwirkungen

| Bereich | Wechselwirkung | Erwartetes Verhalten |
|---|---|---|
| PROJ-28 Routing | `/releases` aliasiert heute `/planung` | PROJ-61 muss Scrum/SAFe dort eigene Release-UX liefern oder `PlanungClient` method-aware splitten. |
| PROJ-25 Gantt | Gantt-Komponente ist phase/work_package-zentriert | Story-Gantt kann reuse/split brauchen, darf Phase-Gantt nicht regressieren. |
| PROJ-60 Sprint Assignment | Sprint-scope bestimmt Release-Fortschritt | Release view konsumiert Sprint-Zuordnung von Stories/Tasks/Bugs. |
| PROJ-59 Hierarchy DnD | Story -> Task/Bug Struktur | Release-Gantt soll Parent-Ketten sichtbar machen. |
| PROJ-24 Costs | Kosten pro Sprint/Work Item | Release kann Kosten aus enthaltenen Items aggregieren. |
| PROJ-43 Health | Kritische Sprints/Stakeholder | Release health kann kritische Sprint-/Story-Signale anzeigen. |
| PROJ-46 Software Extension | Release-/Version-Domäne | PROJ-61 kann als konkreter Release-Planungsslice von PROJ-46 dienen. |
| PROJ-47/50 Jira | Jira Versions/FixVersion | Release-Feld muss spaeter mapbar sein. |

## Routing / Surfaces

- `/projects/[id]/releases`
  - Jira-like Release Planning fuer Scrum/SAFe/software projects.
- `/projects/[id]/planung`
  - Bleibt generische Planung und Wasserfall/Phase-Gantt.
- Potential API:
  - `GET /api/projects/[id]/releases`
  - `POST /api/projects/[id]/releases`
  - `PATCH /api/projects/[id]/releases/[rid]`
  - `PATCH /api/projects/[id]/work-items/[wid]/release`

## Tech Design (Solution Architect) — /architecture Lock (2026-05-13)

### Architekturentscheidung

PROJ-61 baut eine echte Release-Domäne. Releases werden nicht aus Phasen, Meilensteinen oder Sprints abgeleitet, sondern als eigene Planungscontainer geführt. Stories, Tasks und Bugs bekommen eine optionale Release-Zuordnung; Sprints, Phasen und Meilensteine bleiben Kontext, aber nicht die fachliche Quelle des Release-Scopes.

Warum: Jira-Releases entsprechen fachlich eher Versionen/FixVersions als Projektphasen. Eine eigene Release-Domäne macht Scope, Reporting und spätere Jira-Synchronisierung eindeutig und verhindert, dass Scrum-Planung in den bestehenden Wasserfall-Gantt hineingemischt wird.

### UI-Struktur

```text
/projects/[id]/releases
+-- Release Header
|   +-- Release-Auswahl / Neuer Release
|   +-- Status, Zeitraum, Ziel-Meilenstein
+-- Release Health Strip
|   +-- Scope-Fortschritt
|   +-- Blockierte Items
|   +-- Items ausserhalb des Release-Fensters
|   +-- Nicht geplante Items
+-- Release Scope
|   +-- Stories
|   |   +-- Child Tasks / Bugs
|   +-- Sprint-Beitrag je Sprint
|   +-- Ungeplante Items
+-- Story-Gantt
|   +-- Release-Fenster als Rahmen
|   +-- Sprint-Bänder als Zeitkontext
|   +-- Story-Balken
|   +-- eingerückte Task-/Bug-Zeilen
|   +-- Marker für blockiert, überfällig, ausserhalb Fenster
+-- Kontext
    +-- Meilenstein-Marker
    +-- optionale Phasen-/Swimlane-Einblendung
```

`/projects/[id]/planung` bleibt die bestehende Phasen-/Meilenstein-/Arbeitspaket-Planung. `/projects/[id]/releases` bekommt eine eigene Release-Oberfläche für Scrum/SAFe/software-orientierte Projekte, statt weiter nur auf `PlanungClient` zu zeigen.

### Datenmodell in Alltagssprache

Jeder Release speichert:

- Namen und Beschreibung.
- Projekt und Tenant.
- Start- und Enddatum des Release-Fensters.
- Status wie geplant, aktiv, released, archiviert.
- optionalen Ziel-Meilenstein.
- wer ihn angelegt und zuletzt geändert hat.

Jedes relevante Work Item kann optional einem Release zugeordnet werden. Für den MVP zählen `story`, `task` und `bug`; `epic` und `feature` bleiben über die bestehende Parent-Hierarchie sichtbar, aber nicht primärer Gantt-Balken. Child Tasks/Bugs erben im Gantt den Story-Kontext für die Darstellung, behalten aber ihre eigene Release-Zuordnung, falls sie explizit abweicht.

Sprints bekommen keine harte Release-Besitzschaft. Ein Sprint kann zu einem Release beitragen, sobald mindestens ein enthaltenes Work Item diesem Release zugeordnet ist. Das hält spätere Scrum-Realität abbildbar, in der ein Sprint Fixes für mehrere Releases enthalten kann.

### Zeitraum-Regeln

Für die Timeline wird pro Item genau eine sichtbare Zeitquelle ausgewiesen:

1. eigenes geplantes Start-/Enddatum des Work Items.
2. Sprint-Zeitraum, wenn das Item keine eigenen Daten hat.
3. Parent-Story-Zeitraum, wenn Child Task/Bug keine eigenen Daten und keinen Sprint hat.
4. "Nicht geplant", wenn keine der Quellen verfügbar ist.

Items ausserhalb des Release-Fensters bleiben sichtbar und werden markiert. Sie verschwinden nicht aus der Planung, weil genau diese Abweichung für Product Owner und Projektleitung entscheidend ist.

### Backend-Design

Backend ist erforderlich. Browser-only oder localStorage ist fachlich falsch, weil Releases tenant- und projektweit geteilt, auditierbar und später mit Jira synchronisierbar sein müssen.

Der Backend-Schnitt wird in drei Schichten aufgebaut:

- Release-Verwaltung: Releases pro Projekt listen, erstellen und ändern.
- Scope-Zuordnung: Work Items einem Release zuordnen oder aus dem Release entfernen.
- Release-Summary: Release, zugehörige Items, Sprint-Beiträge, Meilenstein-/Phasen-Kontext und Health-Signale gemeinsam liefern.

Die Summary wird serverseitig vorbereitet, damit die UI bei bis zu 500 Work Items nicht mehrere voneinander abhängige Listen im Browser zusammenrechnen muss. RLS, Tenant-Grenzen und Cross-Project-Checks bleiben im API-/DB-Layer.

### Frontend-Design

Die bestehende `GanttView` bleibt für Phasen und Arbeitspakete zuständig. PROJ-61 bekommt eine eigene Story-Gantt-Komponente, die vorhandene Datums- und UI-Konventionen wiederverwendet, aber nicht die Phase-Gantt-Logik mutiert.

Warum: `GanttView` ist auf Phasen, Meilensteine, Arbeitspakete, Drag/Resize und Abhängigkeitslinien ausgerichtet. Eine direkte Erweiterung auf Stories, Sprints und Release-Fenster hätte hohe Regressionsgefahr für Wasserfall/PMI/PRINCE2. Ein eigener Story-Gantt hält die Domänen sauber getrennt.

### Technische Entscheidungen

- First-class Release-Domäne: klare Jira/FixVersion-Abbildung und keine Überladung von Meilensteinen.
- Explizite Work-Item-Zuordnung: Product Owner kontrollieren Release-Scope direkt; Sprints bleiben Lieferkontext.
- Server-seitige Summary: bessere Performance und einheitliche Health-Regeln.
- Eigener Story-Gantt: schützt den bestehenden Phase-Gantt vor Regressionen.
- Keine neue UI-Library im MVP: vorhandene React-/Tailwind-/shadcn-Komponenten und bestehende Timeline-Hilfen reichen aus.
- Method-aware Routing: Scrum/SAFe/software bekommen Release Planning; klassische Methoden behalten `/planung` als Planungszentrum.

### Abhängigkeiten

Keine neue Runtime-Dependency für den MVP.

Bestehende Bausteine, die genutzt werden:

- Work Items mit Kind, Sprint, Phase, Parent und eigenen Plan-Daten.
- Sprints mit Start-/Enddatum.
- Phasen und Meilensteine als Kontext.
- Projektmethoden und method-aware Navigation.
- Audit/RLS/Schema-Drift-Guard aus der Plattformbasis.

### Architektur-Grenzen für die Umsetzung

- `/planung` darf nicht auf Stories/Tasks/Bugs umgestellt werden.
- `GanttView` darf nicht zur universellen Alles-Komponente wachsen.
- Release-Scope, Sprint-Zuordnung und Parent-Hierarchie bleiben drei getrennte Konzepte.
- Drag-and-Drop zur Datumspflege ist nicht MVP; Anzeige, Zuordnung und Health-Signale kommen zuerst.
- Jira-Sync-Felder werden vorbereitet, aber nicht implementiert.

### Slice-Empfehlung

- α: Schema + Release-Grund-API + Work-Item-Release-Zuordnung.
- β: Release-Summary mit Zeitquellen, Sprint-Beiträgen und Health-Signalen.
- γ: Release-UI + Story-Gantt ohne Datum-Drag.
- δ: QA, Regression für `/planung`, Performance-Prüfung mit 500 Items und Doku-Abschluss.

## Backend Implementation Notes — α/β Slice (2026-05-13)

Backend-Backbone umgesetzt:

- Neue Tabelle `releases` mit Tenant/Projekt-Bezug, Status, Zeitraum und optionalem Ziel-Meilenstein.
- `work_items.release_id` als explizite Release-Scope-Zuordnung für `story`, `task`, `bug`.
- RLS auf `releases`: Projektmitglieder lesen, Projekt-Editor/Lead/Tenant-Admin schreiben.
- DB-Guards:
  - Releases nur für Scrum/SAFe oder Method-NULL.
  - Ziel-Meilenstein muss im selben Projekt liegen.
  - Work-Item-Release-Zuordnung muss im selben Projekt/Tenant liegen.
  - Nur Stories, Tasks und Bugs dürfen Release-Scope bekommen.
- Audit:
  - `releases` als Audit-Entity ergänzt.
  - `work_items.release_id` wird über bestehendes Work-Item-Audit getrackt.
  - Release-History ist für Projektmitglieder über `can_read_audit_entry` lesbar.

Backend-APIs umgesetzt:

- `GET /api/projects/[id]/releases`
- `POST /api/projects/[id]/releases`
- `GET /api/projects/[id]/releases/[rid]`
- `PATCH /api/projects/[id]/releases/[rid]`
- `GET /api/projects/[id]/releases/[rid]/summary`
- `PATCH /api/projects/[id]/work-items/[wid]/release`

Summary-Regeln umgesetzt:

- Release-Scope umfasst explizit zugeordnete Stories/Tasks/Bugs plus Tasks/Bugs unter einer release-zugeordneten Story.
- Zeitquelle: Work-Item-Daten vor Sprint-Daten vor Parent-Story-Daten vor "unscheduled".
- Health-Signale: done, blocked, critical, outside-window, overdue, unscheduled, contributing sprints.
- Summary-Endpunkt limitiert Work Items auf 500 plus `truncated`-Flag.

Backend-QA bisher:

- `npm run test -- src/lib/project-releases/release-summary.test.ts src/app/api/projects/[id]/releases/route.test.ts src/app/api/projects/[id]/work-items/[wid]/release/route.test.ts` — PASS, 14 Tests.

## Frontend Implementation Notes — γ Slice (2026-05-13)

Release-UI umgesetzt:

- `/projects/[id]/releases` ist kein Re-Export von `/planung` mehr.
- Neue Release-Client-Ansicht mit:
  - Release-Auswahl und Create-Dialog.
  - Health Strip für Scope, Sprints, Blocker, Outside-Window, Overdue und Fortschritt.
  - eigenem Story-Gantt für Stories, Tasks und Bugs.
  - Scope-Tabelle mit Status, Priorität, Zeitquelle und Release-Zuordnung.
  - Side-Panel für nicht zugeordnete Stories/Tasks/Bugs mit Zuordnungs-Aktion.
  - Kontext-Tab für Sprint-Beiträge, Phasen und Meilensteine.
- Bestehende `/planung`-Gantt-Komponente bleibt unberührt.

Frontend-Bausteine:

- `src/components/releases/*`
- `src/hooks/use-project-releases.ts`
- `src/types/release.ts`

Frontend-QA bisher:

- `npm run test -- 'src/lib/project-releases/release-summary.test.ts' 'src/app/api/projects/[id]/releases/route.test.ts' 'src/app/api/projects/[id]/work-items/[wid]/release/route.test.ts'` — PASS, 14 Tests.
- `npm run lint` — PASS mit 0 Errors; 1 bestehende React-Hook-Form-Warnung in `src/components/work-items/edit-work-item-dialog.tsx`.
- `npm run build` — PASS; `/projects/[id]/releases`, `/api/projects/[id]/releases/*` und `/api/projects/[id]/work-items/[wid]/release` im Build-Manifest.

## Architecture Options

### Option A — First-class `releases` table

Fields:

- `id`
- `tenant_id`
- `project_id`
- `name`
- `start_date`
- `end_date`
- `status`
- `target_milestone_id`
- `created_by`
- timestamps

Work Items get nullable `release_id`.

**Pros:** clear Jira mapping, clean reporting, explicit scope.  
**Cons:** migration and new CRUD/API surface.

### Option B — Release as Milestone + Sprint grouping

Use existing milestones as release markers and derive Release scope from Sprints/date windows.

**Pros:** less schema.  
**Cons:** weak Jira mapping, ambiguous ownership, hard to sync.

### Recommendation

Use **Option A** for a Jira-like product. Releases/Versions are not the same as Phases or Milestones. A first-class table avoids overloading `phase_id`, `milestone_id` or `sprint_id`.

## Implementation Plan

### Architecture

- Decide first-class `releases` table vs milestone-derived release.
- Define date derivation precedence:
  1. Work Item own `planned_start`/`planned_end`.
  2. Sprint `start_date`/`end_date`.
  3. Parent Story dates.
  4. "Unscheduled".
- Define how Release Scope is set: explicit `release_id` vs computed from Sprint/date.

### Backend

- Add release schema/API if Option A is chosen.
- Add work-item release assignment route.
- Add release summary endpoint with items, sprint buckets, health and date derivation.
- Tests for release CRUD, assignment, cross-project guard, deleted items, unscheduled items.

### Frontend

- Split `/releases` from generic `PlanungClient` for Scrum/SAFe.
- Build Release list/detail layout.
- Build Story-Gantt view:
  - release bands,
  - sprint bands,
  - story bars,
  - nested task/bug rows,
  - blocked/outside-window markers.
- Keep Waterfall Gantt untouched.

### QA

- Unit tests for date derivation.
- API tests for release assignment.
- Visual/component tests for release timeline states.
- Regression: `/planung` phase Gantt still loads work packages.
- Regression: `/releases` route remains method-aware.

## Risks

| Risiko | Level | Mitigation |
|---|---|---|
| Releases get confused with phases | Hoch | First-class release domain and clear labels. |
| Gantt reuse breaks Waterfall view | Hoch | Story-Gantt split or adapter, no direct mutation of phase Gantt logic without tests. |
| Missing dates make timeline misleading | Mittel | Explicit "Unscheduled" lane and date-source badges. |
| Jira Sync later needs different field | Mittel | Align names with Jira FixVersion/Version early. |
| Scope too large | Mittel | α: architecture + schema; β: APIs; γ: UI timeline; δ: reporting/sync hooks. |

## Open Questions

- Soll Release Scope explizit ueber `release_id` gepflegt werden oder aus Sprint/Datum berechnet werden?
- Sollen Sprints genau einem Release gehoeren duerfen oder mehrere Releases bedienen koennen?
- Soll ein Release mehrere Milestones haben oder nur einen Ziel-Meilenstein?
- Werden Tasks/Bugs direkt einem Release zugeordnet oder nur ueber Story/Sprint?
- Soll Story-Gantt Drag-and-Drop fuer Datumsaenderung im MVP enthalten sein?

## Definition of Ready

- [x] Architekturentscheidung Release als Tabelle vs Milestone/Sprint-Derivat getroffen.
- [x] Jira Mapping fuer Release/FixVersion fachlich bestaetigt.
- [x] Date derivation precedence bestaetigt.
- [x] MVP-Scope fuer Story-Gantt festgelegt.
- [x] Regression-Grenzen zum bestehenden Phase-Gantt definiert.

## Definition of Done

- [ ] `/projects/[id]/releases` zeigt eine echte Release-Planungsansicht fuer Scrum/SAFe.
- [ ] Stories/Tasks/Bugs erscheinen im Release-Kontext.
- [ ] Story-Gantt zeigt Timeline aus eigenen Daten oder Sprint-Daten.
- [ ] Unscheduled Items sind sichtbar.
- [ ] Blockierte/outside-window Items sind markiert.
- [ ] Bestehender Phase/Work-Package-Gantt bleibt gruen.
- [ ] Doku beschreibt Routing, Datenmodell, Wechselwirkungen und Jira-Mapping.
