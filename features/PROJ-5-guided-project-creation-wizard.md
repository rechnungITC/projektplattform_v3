# PROJ-5: Guided Project Creation Wizard with Type/Method-Aware Questions

## Status: Architected
**Created:** 2026-04-25
**Last Updated:** 2026-04-28

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

### What changes for the user

Today: a single-step modal opens when you click "New Project". You fill ~7 fields in one go. The form is generic — same questions whether you're setting up an ERP rollout or a Scrum software project.

After PROJ-5: a dedicated wizard page replaces the modal. Five clearly labeled steps. Each step asks only what's relevant. Project type "ERP" prompts for target system, business units, migration scope; "Software/Scrum" prompts for tech stack, sprint length. You can save and resume the wizard anytime — drafts live in your account until you finish or discard them.

### Component structure

```
/projects/new/wizard  (the main wizard page)
+-- Stepper Header
|   +-- Progress indicator (Step 3 / 5)
|   +-- Step labels (Basics, Type, Method, Follow-ups, Review)
+-- Step Content Area (one of:)
|   +-- Step 1: Basics
|   |   +-- name, project number, description, dates, project lead
|   +-- Step 2: Project Type
|   |   +-- Radio cards (ERP, Construction, Software, Generic) with descriptions
|   +-- Step 3: Method
|   |   +-- Method cards filtered by chosen type (Scrum, Kanban, PMI, ...)
|   |   +-- Warning: method is locked once project is created (PROJ-6 rule)
|   +-- Step 4: Type/Method Follow-ups
|   |   +-- Dynamic fields driven by PROJ-6 catalog rules
|   +-- Step 5: Review & Create
|       +-- Read-only summary of all answers
|       +-- "Create Project" button
+-- Footer Controls
|   +-- Back (disabled on step 1)
|   +-- Save Draft (manual save, in addition to auto-save on Next/Back)
|   +-- Cancel (with confirmation if dirty)
|   +-- Next / Create (changes label on last step)
+-- Draft Conflict Banner
    +-- Shown if another tab saved a newer version mid-edit

/projects/drafts  (drafts list page)
+-- Header ("Your project drafts")
+-- Draft Cards
|   +-- name (or "Untitled draft"), type, method, last-edited timestamp
|   +-- Resume / Discard actions
+-- Empty State

Existing entry points
+-- "+ New Project" button (replaces today's modal)
    +-- Navigates to /projects/new/wizard
    +-- (Optional, future) "Use KI-Dialog" toggle, hidden until PROJ-12 ships
```

### Data model

**New table: `project_wizard_drafts`**
- Unique ID
- Tenant ID (multi-tenant invariant — never queryable across tenants)
- Created-by user (the only one who can read or edit, per RLS)
- Project name (denormalized so the drafts list shows it without parsing JSON)
- Project type (denormalized)
- Project method (denormalized)
- Data (full wizard answers in a flexible JSON column — survives schema additions)
- Created at, updated at

**Extended table: `projects`**
- One new column: `type_specific_data` (JSON) — stores answers from Step 4 that don't have dedicated columns. Per-type tables (e.g. ERP details from PROJ-15) can later move data out of this column without breaking older projects.

**Stored where:**
Supabase Postgres, with Row-Level Security:
- A user only sees their own drafts within their tenant.
- Tenant boundaries are absolute — no draft ever leaks to another tenant.
- Drafts older than 90 days are auto-purged (a follow-up cron, not blocking ship).

### Tech decisions and why

| Decision | Why |
|---|---|
| **Dedicated page, not a modal** | Five steps don't fit comfortably in a dialog. A page-level URL gives the browser back-button natural behavior and lets the user share a draft URL. |
| **Server Component shell + Client step content** | The PROJ-6 type/method catalog is read-mostly; rendering it server-side avoids a loading spinner waterfall on first paint. The stepper itself needs client interactivity. |
| **React Hook Form + Zod (already installed)** | Same form pattern as PROJ-2; Zod's discriminated unions express type-specific validation cleanly. No new state library. |
| **Auto-save on step transition only** | Balances draft safety against server load. We don't auto-save on every keystroke; a manual "Save draft" button covers the in-step case. |
| **JSON column for type-specific extras (vs. sidecar table)** | Simplest path that meets the AC. Sidecar table would force a join on every project read; per-type extension tables (PROJ-15 for ERP) will eventually extract data from this JSON column. |
| **Dedicated `finalize` endpoint instead of direct POST** | Wraps "create project + delete draft" in one server-side call so the draft cannot be left behind on a partial network failure. |
| **Same shadcn primitives, no new package** | `Form`, `Card`, `RadioGroup`, `Progress`, `Button`, `Input`, `Select`, `Textarea` are all in the project. No new dependencies. |
| **Replace today's `NewProjectDialog`, keep no quick-create path for now** | Single creation flow is simpler to maintain. A future "quick add" mode can come back if user feedback asks for it. |
| **KI-driven alternative (F2.1b) deferred** | Spec says it's gated by PROJ-12. The wizard's entry page leaves a feature-flag slot for the toggle, but no code path is built today. |

### New surfaces added

**API routes** (will be implemented in `/backend`):
- List, get, create, update, discard drafts
- Finalize a draft into a real project (atomic)

**Pages**:
- The wizard itself
- The drafts list

**Components** (under `src/components/projects/wizard/`):
- Stepper, the step body for each of the 5 steps, the type and method radio cards, the dynamic-field renderer for Step 4, the review summary

### Dependencies

No new npm packages. Everything is already installed:
- `react-hook-form` + `@hookform/resolvers` — form state and Zod resolver
- `zod` — validation
- shadcn primitives `Form`, `Card`, `RadioGroup`, `Progress`, `Button`, `Input`, `Select`, `Textarea`
- Existing app helpers `DatePickerField`, `ResponsibleUserPicker`

### Out of scope for this build (deferred)

- The 90-day auto-purge cron (a follow-up; manual discard works without it).
- The KI-Dialog toggle on the entry page (gated by PROJ-12).
- Method conversion of an already-created project (separate spec).
- Stakeholder suggestions during the wizard (PROJ-8).

## Implementation Notes
_To be added by /frontend and /backend_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
