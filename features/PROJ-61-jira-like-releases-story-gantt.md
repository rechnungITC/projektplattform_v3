# PROJ-61: Jira-like Releases with Story Gantt / Phase Mapping

## Status: Planned
**Created:** 2026-05-09
**Last Updated:** 2026-05-09

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

- [ ] Architekturentscheidung Release als Tabelle vs Milestone/Sprint-Derivat getroffen.
- [ ] Jira Mapping fuer Release/FixVersion fachlich bestaetigt.
- [ ] Date derivation precedence bestaetigt.
- [ ] MVP-Scope fuer Story-Gantt festgelegt.
- [ ] Regression-Grenzen zum bestehenden Phase-Gantt definiert.

## Definition of Done

- [ ] `/projects/[id]/releases` zeigt eine echte Release-Planungsansicht fuer Scrum/SAFe.
- [ ] Stories/Tasks/Bugs erscheinen im Release-Kontext.
- [ ] Story-Gantt zeigt Timeline aus eigenen Daten oder Sprint-Daten.
- [ ] Unscheduled Items sind sichtbar.
- [ ] Blockierte/outside-window Items sind markiert.
- [ ] Bestehender Phase/Work-Package-Gantt bleibt gruen.
- [ ] Doku beschreibt Routing, Datenmodell, Wechselwirkungen und Jira-Mapping.
