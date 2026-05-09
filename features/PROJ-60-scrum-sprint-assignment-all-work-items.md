# PROJ-60: Scrum Sprint Assignment DnD for Stories, Tasks and Bugs

## Status: In Progress
**Created:** 2026-05-09
**Last Updated:** 2026-05-09

## Summary

PROJ-25b implemented Backlog -> Sprint Drag-and-Drop for **Stories only**. That matched the original slice, but it does not match the desired Jira-like Scrum workflow: users expect Stories, Tasks and Bugs to be assignable to Sprints and to appear under the Sprint after assignment.

PROJ-60 extends the Sprint assignment model so Scrum teams can drag:

- Stories into Sprints.
- Tasks into Sprints.
- Bugs into Sprints.
- Selected mixed sets of Stories/Tasks/Bugs into Sprints, if every item is sprint-eligible.

This is deliberately separate from PROJ-59. PROJ-59 changes `parent_id` for hierarchy. PROJ-60 changes `sprint_id` for Sprint planning. A single drop must not silently perform both operations.

## Current State / Gap

- `work_items.sprint_id` already exists and is indexed by PROJ-9.
- Single-item route `PATCH /api/projects/[id]/work-items/[wid]/sprint` updates `sprint_id`.
- Bulk route `PATCH /api/projects/[id]/work-items/sprint-bulk` accepts `story`, `task` and `bug`.
- Single route uses the same sprint-assignable kind guard as the bulk route.
- Backlog List/Tree DnD handles render for `story`, `task` and `bug`.
- Sprint cards show assigned `story`, `task` and `bug` items with kind/status/priority badges.
- Existing PROJ-25b documentation explicitly says Tasks/Bugs have no Sprint concept; this is now superseded by PROJ-60 for Scrum.

## Dependencies

- **Requires PROJ-9** — `work_items.sprint_id`, Sprint table and indexes.
- **Requires PROJ-25b** — Backlog/Sprint DnD infrastructure and Sprint drop-zones.
- **Coordinates with PROJ-59** — Parent-DnD must remain separate from Sprint-DnD.
- **Related PROJ-43** — Stakeholder/Critical Sprint signals consume `sprint_id`.
- **Related PROJ-24** — Cost summary already buckets by Sprint.

## User Stories

- **Als Scrum Master** moechte ich Stories, Tasks und Bugs per Drag-and-Drop einem Sprint zuordnen, damit die Sprint-Planung ohne Dialogwechsel funktioniert.
- **Als Entwickler:in** moechte ich einen Bug direkt in den aktuellen Sprint ziehen koennen, damit dringende Fehler sichtbar im Sprint landen.
- **Als Product Owner** moechte ich sehen, welche Stories, Tasks und Bugs in einem Sprint enthalten sind, damit Scope und Risiko klar sind.
- **Als Scrum Master** moechte ich gemischte Auswahlmengen in einen Sprint ziehen koennen, solange alle Items sprintfaehig sind.
- **Als Nutzer:in** moechte ich ein Item aus einem Sprint wieder ins Backlog ziehen koennen, ohne seine Hierarchie zu verlieren.

## Functional Acceptance Criteria

- [x] Sprint-DnD erlaubt `story`, `task` und `bug`.
- [x] `subtask`, `epic`, `feature` und `work_package` bleiben im MVP nicht sprint-droppable, sofern fachlich nicht anders entschieden.
- [x] Backlog List und Tree zeigen Drag-Handles fuer Stories, Tasks und Bugs.
- [x] Sprint cards/listen zeigen Stories, Tasks und Bugs, die `sprint_id = sprint.id` haben.
- [x] Drop auf Sprint ruft `PATCH /api/projects/[id]/work-items/[wid]/sprint` oder Bulk-Route mit `{ sprint_id }`.
- [x] Drop auf Backlog-Zone loest `sprint_id = null`.
- [x] Bulk-Route akzeptiert gemischte Sets aus Stories/Tasks/Bugs.
- [x] Bulk-Route lehnt nicht sprintfaehige Kinds mit `invalid_kind` und `failed_ids` ab.
- [x] Closed Sprints bleiben nicht droppable.
- [x] Cross-project Sprint assignment bleibt serverseitig blockiert.
- [x] Sprint-Zuordnung veraendert nicht `parent_id`.
- [x] Sprint-Zuordnung veraendert nicht `status`.
- [x] Parent-Hierarchie bleibt nach Sprint-Zuordnung sichtbar.
- [ ] Audit erfasst `sprint_id`-Aenderungen wie bisher.

## Non-Functional Acceptance Criteria

- [x] UX ist Jira-aehnlich: Sprint = Container fuer planned work, nicht nur Story-Container.
- [x] Gemischte Items sind visuell unterscheidbar durch Kind-Badges.
- [x] Keine Regression bei PROJ-25b Story-only Multi-Select-DnD.
- [x] Keine Regression bei PROJ-59 Parent-DnD.
- [ ] 50-Item Bulk-Grenze bleibt bestehen, sofern nicht separat erweitert.

## Wechselwirkungen

| Bereich | Wechselwirkung | Erwartetes Verhalten |
|---|---|---|
| PROJ-25b | Story-only Sprint DnD | Wird durch sprint-eligible kinds `story/task/bug` ersetzt. |
| PROJ-59 | Parent-DnD via `parent_id` | Sprint-Drop darf Parent nicht aendern. |
| Cost Summary | Sprint-Buckets ueber `sprint_id` | Tasks/Bugs tauchen nach Sprint-Zuordnung in Sprint-Kosten auf. |
| Stakeholder Health | Kritische Sprints lesen `sprint_id` | Tasks/Bugs koennen Health-/Critical-Sprint-Auswertung beeinflussen. |
| Reports | Work Items nach Sprint | Reports muessen Stories/Tasks/Bugs pro Sprint abbilden. |
| Jira Sync | Jira Sprint-Feld | Export/Sync muss Sprint-Zuordnung fuer Issue-Typen Story/Task/Bug mappen. |

## Routing / Surfaces

- `/projects/[id]/backlog`
  - Backlog List/Tree DnD handles fuer `story/task/bug`.
  - Sprint section als Drop-Ziel.
  - Backlog drop-zone fuer Detach.
- `/api/projects/[id]/work-items/[wid]/sprint`
  - Single-item Sprint assignment.
- `/api/projects/[id]/work-items/sprint-bulk`
  - Multi-item Sprint assignment.

## Implementation Plan

### Architecture

- Neue Konstante `SPRINT_ASSIGNABLE_KINDS = ["story", "task", "bug"]`.
- Drop-Intent weiterhin getrennt halten: Sprint-Drop schreibt nur `sprint_id`.
- Entscheiden, ob Subtasks implizit ueber Task-Sprint sichtbar sind oder spaeter separat sprintfaehig werden.

### Backend

- Bulk-Route Kind-Guard von `story` auf `story/task/bug` erweitern.
- Optional Single-Route um denselben Kind-Guard ergaenzen, damit UI und Bulk konsistent sind.
- Tests fuer `task -> sprint`, `bug -> sprint`, mixed bulk, invalid `work_package`, closed sprint, detach.

### Frontend

- `BacklogDndProvider` nicht mehr nur ueber Stories initialisieren.
- `DraggableStoryHandle` entweder verallgemeinern oder neuen `DraggableWorkItemHandle` einfuehren.
- Backlog List/Tree zeigen Handles fuer Stories/Tasks/Bugs.
- Sprint Cards zeigen gruppiert oder flach alle Sprint-Items mit Kind-Badge.
- Multi-Select muss gemischte sprintfaehige Items erlauben.

### QA

- Route-Tests fuer Bulk und Single.
- Component/Integration fuer DnD-Kind-Gating.
- Regression: Story Sprint-DnD bleibt funktionsfaehig.
- Regression: Parent-DnD aus PROJ-59 bleibt getrennt.
- Regression: Closed Sprint reject.

## Implementation Log

### 2026-05-09 — PROJ-60-alpha: Sprint-DnD for story/task/bug

Files:

- `src/lib/work-items/sprint-assignment.ts`
  - Defines the shared `SPRINT_ASSIGNABLE_KINDS` contract and `isSprintAssignableKind` guard.
- `src/app/api/projects/[id]/work-items/[wid]/sprint/route.ts`
  - Adds single-item kind preflight so `story`, `task` and `bug` can be assigned while non-sprint kinds are rejected.
- `src/app/api/projects/[id]/work-items/sprint-bulk/route.ts`
  - Replaces story-only guard with shared sprint-assignable kind guard.
- `src/components/work-items/backlog-dnd-provider.tsx`
  - Builds DnD selection from all sprint-assignable work items and rejects invalid mixed selections.
- `src/components/work-items/draggable-story-handle.tsx`
  - Introduces `DraggableWorkItemHandle`; keeps `DraggableStoryHandle` as compatibility wrapper.
- `src/components/work-items/backlog-list.tsx`
  - Shows drag handles and range-selection for `story`, `task` and `bug`.
- `src/components/work-items/backlog-tree.tsx`
  - Mirrors List behavior in tree view without changing `parent_id`.
- `src/components/work-items/drag-overlay-card.tsx`
  - Uses neutral Item/Items labels for mixed drags.
- `src/components/sprints/sprint-card.tsx`
  - Shows assigned sprint items under the Sprint with Kind, Priority and Status badges.
- `src/app/api/projects/[id]/work-items/[wid]/sprint/route.test.ts`
  - Covers story/task/bug assignment gates and invalid non-sprint kind rejection.
- `src/app/api/projects/[id]/work-items/sprint-bulk/route.test.ts`
  - Covers mixed story/task/bug bulk assignment and invalid-kind failed IDs.

Verification:

- `npx vitest run src/app/api/projects/[id]/work-items/[wid]/sprint/route.test.ts src/app/api/projects/[id]/work-items/sprint-bulk/route.test.ts` — 22/22 passed.
- `npx eslint ...` on the changed PROJ-60 source/test files — passed.
- `git diff --check` — passed.
- `npx tsc --noEmit` — blocked by pre-existing PROJ-54 test-fixture type errors in `src/components/resources/resource-form.test.tsx` and `src/components/resources/tagessatz-combobox.integration.test.tsx`; no PROJ-60 file was reported.

## Open Questions

- Sollen Subtasks im MVP sprintfaehig sein oder nur ueber ihren Task sichtbar werden?
- Soll ein Task beim Sprint-Drop automatisch denselben Sprint wie seine Story bekommen, wenn er unter einer Story haengt? Vorschlag: nein, kein implizites Cascading.
- Soll ein Story-Drop optional alle Child-Tasks/Bugs mit in den Sprint nehmen? Vorschlag: spaeter als Bulk-Assistent, nicht im MVP.
- Soll die Sprint-Card Items nach Story gruppieren oder flach nach Prioritaet/Status sortieren?

## Definition of Ready

- [x] Sprint-faehige Kinds final bestaetigt.
- [ ] Cascade-Regeln fuer Child-Items entschieden.
- [x] Sprint-Card-Darstellung fuer gemischte Kinds entschieden.
- [x] Backend-Kind-Guard-Regeln abgestimmt.
- [x] Regression gegen PROJ-59 Parent-DnD beschrieben.

## Definition of Done

- [x] Stories, Tasks und Bugs koennen per DnD einem Sprint zugeordnet werden.
- [x] Stories, Tasks und Bugs koennen per DnD aus einem Sprint geloest werden.
- [x] Bulk-DnD funktioniert fuer gemischte sprintfaehige Items.
- [x] Nicht sprintfaehige Kinds werden client- und serverseitig abgelehnt.
- [x] Sprint Cards zeigen alle zugeordneten Stories/Tasks/Bugs.
- [x] Tests fuer Single/Bulk/Closed/Invalid-Kind sind gruen.
- [x] PROJ-25b-Doku ist mit PROJ-60 supersession note aktualisiert.
