# PROJ-5: Guided Project Creation Wizard with Type/Method-Aware Questions

## Status: In Review
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

### Frontend (this commit)
- Wizard route at `/projects/new/wizard`, drafts list at `/projects/drafts`.
- 5-step orchestrator (`wizard-client.tsx`) owns React Hook Form state, navigation gating, and draft auto-save on step transition.
- Step 4 is fully data-driven: `computeRules(type, method).required_info` from PROJ-6 produces the field list at runtime — no hard-coded forms per type.
- Drafts persist in `localStorage` keyed by tenant + user. The adapter (`src/lib/wizard/draft-storage.ts`) keeps a list/get/save/discard surface that the /backend phase will swap for fetch-to-API calls without consumer changes.
- Project create wires to existing `POST /api/projects` (PROJ-2). `type_specific_data` is sent as a forward-compatible field; the column is added by /backend. After successful create, the localStorage draft is discarded.
- `NewProjectDialog` (single-step modal) deleted — the wizard is now the only creation path; both project-list buttons (header + empty-state) link to the wizard.
- New shadcn primitives needed: none. All required components were already installed.

### Backend (this commit)
- Migration `20260428170000_proj5_wizard_drafts_and_type_specific_data.sql`:
  - `project_wizard_drafts` table (tenant-scoped, owner-only RLS — 4 policies: SELECT/INSERT/UPDATE/DELETE all gated on `created_by = auth.uid() AND is_tenant_member(tenant_id)`).
  - `projects.type_specific_data` JSONB column (default `'{}'::jsonb`).
  - Indexes: `(tenant_id, created_by)` and `(updated_at desc)`.
  - `pwd_set_updated_at` trigger via `extensions.moddatetime`.
- API routes:
  - `GET /api/wizard-drafts?tenant_id=…` — list current user's drafts (RLS scoped).
  - `POST /api/wizard-drafts` — create draft.
  - `GET/PATCH/DELETE /api/wizard-drafts/[id]` — single-draft operations (404 hides RLS denials).
  - `POST /api/wizard-drafts/[id]/finalize` — atomic-ish: read draft → insert project → run PROJ-4 auto-lead RPC → delete draft.
- Existing `POST /api/projects` extended to accept and persist `type_specific_data`.
- localStorage adapter replaced with fetch-based one in `src/lib/wizard/draft-storage.ts`. Public surface stays compatible (now async).
- 16 new Vitest tests across `route.test.ts` + `[id]/route.test.ts` (137 total in suite, all green).

### Open follow-ups (deferred)
- 90-day auto-purge cron for stale drafts.
- KI-Dialog (F2.1b) entry-page toggle (gated by PROJ-12).
- Move ERP-specific Step-4 answers from `type_specific_data` JSONB into a per-type table (PROJ-15).

## QA Test Results

### Test Execution Summary

| Layer | Result |
|---|---|
| Vitest unit + integration | 137 / 137 pass (15 files; +16 new for wizard-drafts) |
| Live RLS audit (Supabase MCP) | Pass — owner sees draft (1 row), random `auth.uid()` sees nothing (0 rows). 4 policies verified clause-by-clause. |
| Build (`npm run build`) | Clean — 3 new API routes + 2 new pages registered |
| Production deploy | Live since `dpl_AyxFM2kjY32CFNYDBJ92fFU1dwdy` (auto-deploy via push) |
| Playwright E2E | Deferred — requires test-user fixtures (no test account in DB; manual user-walkthrough was greenlit by user before backend phase) |

### Acceptance Criteria Walkthrough

#### Wizard structure
| AC | Status | Notes |
|---|---|---|
| ≥ 5 logically separated steps | ✅ | Basics → Type → Method → Follow-ups → Review |
| Each step shows only relevant fields | ✅ | |
| Required fields visually marked | ✅ | `*` suffix in StepBasics + Step 4 |
| Block forward progression while required missing | ✅ | `validateStep` per-step gate |
| Save and resume drafts | ✅ | Server-side via `project_wizard_drafts` |
| Exactly one project record on completion | ✅ | Atomic insert via `POST /api/wizard-drafts/[id]/finalize` |

#### Dynamic follow-ups
| AC | Status | Notes |
|---|---|---|
| Type-driven follow-ups | ✅ | ERP/Software profiles ship with `required_info` keys |
| Method-driven follow-ups | ❌ | **Bug M2 — see below.** Catalog has type-specific `required_info` only; method contributes `starter_kinds` but no extra questions. |
| Irrelevant fields not shown | ✅ | StepFollowups renders only `computeRules(...).required_info` |
| Rule-based / extensible | ✅ | Driven by PROJ-6 catalog + engine |

#### Draft persistence
| AC | Status | Notes |
|---|---|---|
| Table with `tenant_id`, `created_by`, `data` JSONB, timestamps | ✅ | Migration applied; columns + denormalized name/type/method |
| User can list / open / edit / discard own drafts | ✅ | `/projects/drafts` page + DraftsListClient |
| Draft does not appear in project list | ✅ | Separate table |
| 90-day auto-purge | ⏳ | **Deferred per design.** Manual discard works. |

#### Hand-off to project creation
| AC | Status | Notes |
|---|---|---|
| POSTs to project create API | ✅ | Via finalize endpoint |
| All wizard fields land in matching columns | ✅ | |
| Type-specific extras → `type_specific_data` JSONB | ✅ | Column added in migration |
| On success, draft row deleted | ✅ | Best-effort delete inside finalize handler |
| Failed transfers log + keep draft | ⚠️ | Draft is preserved on failure but no structured log entry beyond the API error response. Acceptable for MVP. |

#### KI-driven alternative (F2.1b)
| AC | Status | Notes |
|---|---|---|
| All gated by PROJ-12 | ⏳ | **Deferred per spec.** No code path built. |

### Edge Cases

| Case | Spec says | Implementation |
|---|---|---|
| User reloads mid-wizard | auto-save on step transition; reload restores latest | ✅ Auto-save on Next/Back transitions; resume via `?draftId=…` |
| Two browser tabs editing same draft | last-write-wins; **show warning when save target is older** | ⚠️ **Bug M3 — Last-write-wins works, but no version check / no warning.** |
| Tenant A loads tenant B's draft | blocked by RLS (404) | ✅ Verified live (RLS audit) |
| Type/method changes mid-wizard | already-answered follow-ups kept | ✅ `type_specific_data` keeps old keys; new combo only renders new keys |
| Network failure on submit | wizard does not lose draft; **retry button visible** | ⚠️ **Bug L1 — Toast shows error and `Projekt anlegen` button stays clickable, but no explicit "Retry" UI.** |
| Catalog adds new required field | next open shows new field, blocks completion | ✅ `validateStep("followups")` re-evaluates `computeRules` on every visit |

### Security Audit

| Check | Result |
|---|---|
| RLS isolation between users (live) | ✅ Owner sees own row, random `auth.uid()` sees nothing |
| RLS isolation between tenants | ✅ `is_tenant_member(tenant_id)` clause on every policy |
| Tenant-id from request body cannot escalate | ✅ Insert policy `with check` rejects non-member tenant_id |
| Auth required on all endpoints | ✅ All routes return 401 without session (covered in vitest) |
| Input validation (Zod, all writes) | ✅ POST + PATCH validate body; UUID + enum checks on params |
| JSONB structure attacks | ✅ `data` accepts any JSON shape but Postgres handles it safely; downstream is read-only `data.*` access |
| Existing security headers | ✅ All 6 headers apply (HSTS, X-Frame-Options, CSP-Report-Only, …) |
| Sensitive data leakage in API responses | ✅ Drafts contain only what the user typed; service-role key never client-side |

### Bug Audit

| Severity | ID | Description | Where |
|---|---|---|---|
| High | M1 | **Date timezone bug.** StepBasics serializes dates via `value.toISOString()` (UTC). In CET/UTC+1, picking 1. May produces ISO `2026-04-30T23:00:00Z`; finalize `slice(0,10)` then writes `2026-04-30` — date shifts back by one day. The existing codebase has a `dateToIsoDate(date)` helper (e.g. `src/components/milestones/new-milestone-dialog.tsx:275`) that uses local-time components and should be reused. | `src/components/projects/wizard/step-basics.tsx` (DatePickerField onChange) and/or `src/app/api/wizard-drafts/[id]/finalize/route.ts` (`isoDateOnly`) |
| Medium | M2 | **Method-driven follow-up questions not implemented.** Spec says "Different methods produce different follow-up questions (e.g. Scrum asks about sprint length)". `computeRules(type, method).required_info` only returns the project type's `required_info`; method contributes `starter_kinds` but no extra questions. Either extend the catalog with method-specific `required_info`, or note as intentional MVP scope. | `src/lib/project-rules/engine.ts` + `src/lib/project-types/catalog.ts` |
| Medium | M3 | **Two-tab last-write-wins, no warning.** Spec asks for "show a warning when save target is older than current state". PATCH overwrites without optimistic concurrency. Two tabs editing the same draft silently overwrite each other. Fix: add `If-Unmodified-Since` or version column. | `src/app/api/wizard-drafts/[id]/route.ts` |
| Low | L1 | **No explicit retry button after finalize failure.** User has to re-click "Projekt anlegen". A dedicated "Retry" button would be clearer, especially after a network error. | `src/components/projects/wizard/wizard-client.tsx` (onCreate error path) |
| Low | L2 | **Cancel does not offer to discard draft.** Cancel returns to /projects but the draft persists silently. Could add a 3-button confirm: "Discard, Save as draft, Continue editing". | wizard-client.tsx |
| Info | I1 | 90-day auto-purge cron deferred per design. | spec |
| Info | I2 | KI-Dialog (F2.1b) deferred per spec (gated by PROJ-12). | spec |

### Production-Ready Decision

**NOT READY for status `Approved`.**

Blocker: **High M1 (date timezone bug)** — visible to any user not in UTC. Fix is small (replace `toISOString()` with the existing `dateToIsoDate` helper).

Once M1 is fixed and verified:
- M2 (method follow-ups) and M3 (two-tab warning) are spec-AC gaps; user decides whether to fix in PROJ-5 or defer to a follow-up.
- L1, L2, I1, I2 are acceptable for shipping.

After fix → re-run `/qa` for status `Approved` → `/deploy`.

### Suggested follow-ups (not blockers)
1. Seed a test-user fixture (second account in the active tenant) so future Playwright E2E suites can exercise the wizard against the real API surface end-to-end.
2. Add method-specific `required_info` entries to the catalog (Scrum sprint length, SAFe PI cadence, Wasserfall change-control gate, …) — closes M2.
3. Optimistic concurrency on draft updates (`updated_at` check or row-version) — closes M3.

## Deployment
_To be added by /deploy_
