# PROJ-6: Project Types, Methods Catalog, and Rule Engine

## Status: Planned
**Created:** 2026-04-25
**Last Updated:** 2026-04-25

## Summary
Defines the catalog of project types (ERP, Generic Software, plus prepared-but-shallow Construction/General slots) and methods (Scrum, Kanban, Waterfall, SAFe; PMI/PRINCE2/VXT2.0 as templates layered on top). Adds a pure-function rule engine that derives, from `(type, method)`, the set of active modules, suggested roles, required wizard info, and starter work-item kinds. Inherits V2 EP-04. The catalog is a code registry (not a DB table) for V3, mirroring V2's decision; tenant-level overrides are a later concern (PROJ-16).

## Dependencies
- Requires: PROJ-2 (Project CRUD) — adds `project_type` and `method` columns
- Requires: PROJ-1 (Auth, Tenants, Roles) — for tenant scoping where overrides apply later
- Influences: PROJ-5 (Wizard) — drives dynamic follow-ups
- Influences: PROJ-7 (Project Room) — `active_modules` controls visible tabs
- Influences: PROJ-8 (Stakeholders) — `suggested_roles` feeds stakeholder suggestions
- Influences: PROJ-9 (Work Items) — `starter_kinds` and method visibility filter

## V2 Reference Material
- **Epic file:** `~/projects/Projeketplattform_v2_D.U/planning/epics/ep-04-projekttypen-methoden-regelwerk.md`
- **Stories:** `~/projects/Projeketplattform_v2_D.U/planning/stories/ep-04.md` (ST-01 type catalog, ST-02 method catalog, ST-03 method-dependent objects, ST-04 rule engine)
- **ADRs:** `docs/decisions/project-type-catalog.md`, `docs/decisions/method-catalog.md`, `docs/decisions/method-object-mapping.md`, `docs/decisions/project-rule-engine.md`
- **V2 code paths to study during /architecture and /backend:**
  - `apps/api/src/projektplattform_api/domain/core/project_types/catalog.py` — `ProjectTypeProfile` dataclass + initial entries
  - `apps/api/src/projektplattform_api/domain/core/project_types/rule_engine.py` — pure `compute_rules(type, method)`
  - `apps/api/src/projektplattform_api/domain/core/work_items/metamodel.py` — `WORK_ITEM_METHOD_VISIBILITY`
  - `apps/api/src/projektplattform_api/routers/project_types.py` — `GET /project-types`, `GET /project-types/{type}/rules`

## User Stories
- **[V2 EP-04-ST-01]** As the system, I want ERP and Generic Software available as initial project types so that roles, modules, and rules can be derived per type.
- **[V2 EP-04-ST-02]** As the system, I want to distinguish Scrum, Kanban, Waterfall, SAFe (active) and PMI/PRINCE2/VXT2.0 (templates) so the platform behaves method-correctly.
- **[V2 EP-04-ST-03]** As the product team, we want each method to declare its leading planning objects so that the system structures work correctly per method.
- **[V2 EP-04-ST-04]** As the system, I want to derive active modules, suggested roles, and starter structures from `(type, method)` so that new projects don't start empty.

## Acceptance Criteria

### Project type catalog (code-registry)
- [ ] A TypeScript module exports `PROJECT_TYPES` with at minimum `general`, `erp`, `software`, `construction`.
- [ ] Each type has: `key`, `label_de`, `summary_de`, `standard_roles[]`, `standard_modules[]`, `required_info[]`.
- [ ] ERP type: roles include Projektleiter:in, Sponsor, Key-User, IT-Architekt:in, Datenschutzbeauftragte:r; modules include backlog, planning, members, history, stakeholders, governance; required_info includes target systems, business units, migration scope.
- [ ] Generic Software: roles include Projektleiter:in, Product Owner, Scrum Master, Developer, QA-Lead; modules include backlog, planning, members, history, releases; required_info includes target platforms, tech stack.
- [ ] `GET /api/project-types` returns the read-only list (Server Component fetch + API route).
- [ ] No POST/PATCH/DELETE — catalog is changed by code commit only (admin override comes later via PROJ-16).

### Method catalog
- [ ] `projects.method` column added (text, nullable until chosen, CHECK constraint `method IN ('scrum','kanban','waterfall','safe')`).
- [ ] TypeScript enum/object exposes labels (Scrum, Kanban, Wasserfall, SAFe).
- [ ] Templates (PMI, PRINCE2, VXT2.0) documented in `docs/architecture/method-templates.md` but NOT modeled as a separate field; they're starter-structure overlays applied on top of the chosen method.
- [ ] Method changes are audited (PROJ-10 audit hook).

### Method-dependent object visibility
- [ ] A `WORK_ITEM_METHOD_VISIBILITY` config maps `kind → set<method>`. Bugs are visible in all methods.
- [ ] Default mapping (mirrors V2 ADR `method-object-mapping.md`): Scrum → epic/story/task/subtask/bug; Kanban → story/task/bug; Waterfall → task/bug/work_package + phases/milestones; SAFe → epic/feature/story/task/subtask/bug (portfolio_epic/capability optional).
- [ ] When `projects.method IS NULL`, all kinds are allowed (used during initial setup).
- [ ] Frontend mirror function `workItemKindsFor(method)` stays in sync with the backend; an integration test verifies the alignment.

### Rule engine
- [ ] Pure function `computeRules(type, method): ProjectRules` with no side effects.
- [ ] `ProjectRules` shape: `{ active_modules[], suggested_roles[], required_info[], starter_kinds[] }`.
- [ ] `GET /api/project-types/{type}/rules?method=…` for wizard preview.
- [ ] `GET /api/projects/{id}/rules` for project-room module gating.
- [ ] When method is null, `starter_kinds` is empty; modules + roles + required_info still come from the type.

## Edge Cases
- **User picks a method that has no overlap with their type's standard modules** → all type modules stay active (no subtraction by method); a banner can suggest method-fit but never blocks.
- **Catalog code adds a new required_info field** → existing projects don't retroactively become invalid; the field is required only for new projects via wizard.
- **Frontend & backend type lists drift** → integration test compares the catalogs and fails build.
- **Method changed after project has work items** → existing items are NOT deleted; the UI just hides kinds that are no longer visible for the new method (per V2 ADR).
- **`construction` is in the catalog but no real depth** → catalog entry minimal; UI flags it as "Strukturell vorbereitet, Vertiefung folgt" until P2 work activates the extension.
- **A user from tenant A tries to fetch tenant B's rules preview** → not applicable, the catalog is global; a future tenant override (PROJ-16) is RLS-isolated.

## Technical Requirements
- **Stack:** Next.js 16 (TypeScript catalog modules in `src/lib/project-types/` and `src/lib/methods/`), Supabase (only for the `projects.method` column + future override table).
- **Multi-tenant:** Catalog itself is global. Future overrides will be in `tenant_project_type_overrides` with `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` (PROJ-16).
- **Validation:** Zod schemas validate the catalog shape at boot (or as a build-time test).
- **Auth:** No auth needed for `GET /api/project-types` — it's public configuration. Rule preview is open. Project rule fetch (`/api/projects/{id}/rules`) requires project read access.
- **Tests:** Pin the Wave-1-binding type/method/visibility mappings as integration tests.

## Out of Scope (deferred or explicit non-goals)
- KI-driven rule generation.
- Tenant-level catalog overrides (covered by PROJ-16).
- Method conversion logic (turning a Scrum project into a Waterfall project).
- Free admin UI to define entirely new project types.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## Implementation Notes
_To be added by /frontend and /backend_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
