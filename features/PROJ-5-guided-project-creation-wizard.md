# PROJ-5: Guided Project Creation Wizard with Type/Method-Aware Questions

## Status: Planned
**Created:** 2026-04-25
**Last Updated:** 2026-04-25

## Summary
A multi-step wizard for creating a project that guides the user through master data, project type, method, and type/method-aware follow-up questions. Drafts are savable. After completion, the wizard hands off to PROJ-2's project creation API. Inherits V2 EP-03 (Stammdaten und dialoggestützte Projekterstellung) — the data model and master-data editing parts are covered by PROJ-2; PROJ-5 covers the wizard, dynamic questions, draft persistence, and the optional KI-driven dialog as a Phase-4 alternative.

## Dependencies
- Requires: PROJ-1 (Auth, Tenants, Roles)
- Requires: PROJ-2 (Project CRUD) — wizard ultimately calls Project create
- Requires: PROJ-6 (Project Types & Methods Catalog) — wizard uses the catalog to drive dynamic questions
- Influences: PROJ-12 (KI-Assistenz) — F2.1b KI-driven wizard alternative

## V2 Reference Material
- **Epic file:** `~/projects/Projeketplattform_v2_D.U/planning/epics/ep-03-stammdaten-und-projektdialog.md`
- **Stories:** `~/projects/Projeketplattform_v2_D.U/planning/stories/ep-03.md` (ST-02 wizard, ST-03 dynamic follow-ups, ST-04 dialog → master data, F2.1b KI-driven dialog)
- **ADRs:** `docs/decisions/master-data-editing.md`, `docs/decisions/project-type-catalog.md`, `docs/decisions/method-catalog.md`, `docs/decisions/project-rule-engine.md`
- **V2 code paths to study during /architecture and /backend:**
  - `apps/web/app/projects/new/` — V2's existing simple Create form (wizard does not exist yet in V2)
  - `apps/api/src/projektplattform_api/domain/core/project_types/catalog.py` — type profiles with `required_info`
  - `apps/api/src/projektplattform_api/routers/project_types.py` — `GET /project-types/{type}/rules?method=…` endpoint that V3 must replicate

## User Stories
- **[V2 EP-03-ST-02]** As a project owner, I want to create a project via a guided wizard so that I can capture all relevant information in a structured way.
- **[V2 EP-03-ST-03]** As a user, I want type- and method-dependent follow-up questions so that only relevant information is asked.
- **[V2 EP-03-ST-04]** As the system, I want answers from the wizard automatically transferred into project master data so that no double entry is needed.
- **[V2 F2.1b]** As a project owner, I optionally want to create a project through a free-form KI-guided dialog instead of the wizard so that I can capture richer context (Phase 4 alternative; gated by PROJ-12).

## Acceptance Criteria

### Wizard structure
- [ ] Wizard has at least 5 logically separated steps (proposed: Basics → Type → Method → Type/Method follow-ups → Review).
- [ ] Each step shows only the fields relevant to that step.
- [ ] Required fields are visually marked.
- [ ] Wizard cannot progress to the next step while required fields are missing.
- [ ] User can save the wizard as a draft and resume later.
- [ ] On completion, exactly one project record is created (atomic).

### Dynamic follow-ups
- [ ] Different project types produce different follow-up questions (e.g. ERP asks about target systems, business units, migration scope; Generic Software asks about target platforms, tech stack).
- [ ] Different methods produce different follow-up questions (e.g. Scrum asks about sprint length).
- [ ] Irrelevant fields are not shown.
- [ ] The follow-up logic is rule-based and extensible (driven by PROJ-6's catalog).

### Draft persistence
- [ ] New table `project_wizard_drafts` with `tenant_id`, `created_by`, `data` (JSONB), `created_at`, `updated_at`.
- [ ] User can list, open, edit, and discard their own drafts.
- [ ] A draft does not appear in the project list (no `projects` row exists yet).
- [ ] Drafts older than 90 days are auto-purged (configurable).

### Hand-off to project creation
- [ ] On wizard completion, the system POSTs to the existing project create API (PROJ-2).
- [ ] All wizard fields land in the matching project columns; type-specific extras land in a `project_extras` JSONB or extension table (decision deferred to /architecture).
- [ ] On project creation success, the draft row is deleted.
- [ ] Failed transfers log a structured error and keep the draft.

### KI-driven alternative (F2.1b — gated by PROJ-12)
- [ ] When PROJ-12 is shipped, a "Use KI-Dialog" toggle appears on the wizard entry page.
- [ ] The KI-dialog extracts structured master data and routes to the same Review step as the wizard — never auto-creates a project without review.
- [ ] Class-3 inputs (personal data) are blocked from external models per PROJ-12.

## Edge Cases
- **User reloads mid-wizard** → draft auto-saved on each step transition; reload restores latest saved state.
- **Two browser tabs editing the same draft** → last-write-wins; show a warning when save target is older than current state.
- **User from tenant A tries to load a draft from tenant B** → blocked by RLS (404).
- **Project type/method changes mid-wizard** → already-answered follow-ups for the old combination are kept in the draft (never silently discarded), but only the new combination's questions are re-shown.
- **Network failure on submit** → wizard does not lose draft; retry button visible.
- **All required type-specific info fields filled out, but the type catalog change in code added a new required field** → the next time the user opens the draft, the new required field appears and blocks completion until filled.

## Technical Requirements
- **Stack:** Next.js 16 (Server Components for shell, Client Components for stepper state), shadcn/ui (`Stepper` from a recipe, `Form`, `Input`, `Select`, `Textarea`, `Card`, `Button`).
- **State:** React Hook Form + Zod for per-step validation; `data` accumulator across steps; auto-save side effect on step transitions.
- **Multi-tenant:** `project_wizard_drafts` MUST have `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`. RLS: only the creator (or tenant admin) can read/write.
- **Validation:** Zod schemas per step; union-discriminated schema for type-specific final-step validation.
- **Auth:** Supabase Auth.
- **Performance:** Type/method catalogs (PROJ-6) are read-mostly — cache with React Server Component fetch.

## Out of Scope (deferred or explicit non-goals)
- KI-based interpretation of free-text user input within the regular wizard (PROJ-12 scope).
- Stakeholder suggestions during wizard (covered by PROJ-8).
- Method conversion of an already-created project.

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
