# PROJ-8: Stakeholders and Organization

## Status: In Progress
**Created:** 2026-04-25
**Last Updated:** 2026-04-28

## Summary
Models stakeholders as first-class business entities (separate from technical users — see V2 ADR `stakeholder-vs-user.md`). Internal or external. Person or organization. Per-type suggestion lists. Includes the influence/impact matrix for visual prioritization. Inherits V2 EP-06.

## Dependencies
- Requires: PROJ-1 (Auth, Tenants, Roles)
- Requires: PROJ-2 (Project CRUD)
- Requires: PROJ-6 (Project type catalog) — for type-driven stakeholder suggestions
- Requires: PROJ-10 (Audit / versioning) — stakeholder edits audited
- Influences: PROJ-11 (Resources from stakeholders), PROJ-12 (KI), PROJ-13 (Communication recipients)

## V2 Reference Material
- **Epic file:** `~/projects/Projeketplattform_v2_D.U/planning/epics/ep-06-stakeholder-und-organisation.md`
- **Stories:** `~/projects/Projeketplattform_v2_D.U/planning/stories/ep-06.md` (ST-01 data model, ST-02 manual CRUD, ST-03 type-driven suggestions, F5.3 influence/impact matrix)
- **ADRs:** `docs/decisions/stakeholder-vs-user.md`, `docs/decisions/stakeholder-data-model.md`, `docs/decisions/data-privacy-classification.md`
- **V2 code paths to study during /architecture and /backend:**
  - `apps/api/src/projektplattform_api/routers/stakeholders.py` — CRUD + project-scoped access
  - `apps/api/src/projektplattform_api/domain/core/stakeholders/models.py`
  - `apps/web/app/projects/[id]/components/StakeholderTab/`
  - `apps/web/app/projects/[id]/components/StakeholderMatrix/`

## User Stories
- **[V2 EP-06-ST-01]** As the system, I want stakeholders stored structurally so that role, organization, influence, and impact are usable downstream.
- **[V2 EP-06-ST-02]** As a project lead, I want to create, edit, and deactivate stakeholders so that all relevant parties are captured.
- **[V2 EP-06-ST-03]** As a user, I want stakeholder suggestions per project type so I don't forget typical participants.
- **[V2 F5.3]** As a project lead, I want stakeholders visualized in an influence/impact matrix so I can see steering priorities at a glance.

## Acceptance Criteria

### Stakeholder data model
- [ ] Table `stakeholders` with: `id, tenant_id, project_id, kind (person|organization), origin (internal|external), name, role_key (nullable), org_unit (nullable), contact_email (nullable), contact_phone (nullable), influence (low|medium|high|critical), impact (low|medium|high|critical), linked_user_id (nullable FK auth.users), notes, is_active, created_at, updated_at`.
- [ ] `name`, `contact_email`, `contact_phone`, `linked_user_id`, `notes` are class-3 (personal data) — flagged for the data privacy registry per PROJ-12.
- [ ] Internal vs external is captured via `origin`.
- [ ] Person vs organization via `kind`.

### Manual CRUD + audit
- [ ] CRUD endpoints under `/api/projects/[id]/stakeholders` (GET list, POST create, GET single, PATCH update, POST `/deactivate`).
- [ ] Create/Edit form in the project room's Stakeholder tab.
- [ ] Soft-deactivation toggles `is_active`; deactivated stakeholders hidden from defaults but listable via `?include_inactive=true`.
- [ ] Edits audited via PROJ-10 hook.
- [ ] Only project_editor/project_lead/tenant_admin can write; viewers can only read.

### Type-driven suggestions
- [ ] When opening the Stakeholder tab on an empty project, a sidebar shows "Suggested for ERP / Generic Software / etc." with rows from PROJ-6's `standard_roles`.
- [ ] Single-click "Add" creates a stakeholder shell with `role_key` pre-filled and origin/kind defaults.
- [ ] Single-click "Dismiss" hides the suggestion for this project; dismissals stored in a small `stakeholder_suggestion_dismissals` table.
- [ ] Already-added roles disappear from suggestions automatically.

### Influence/impact matrix (F5.3)
- [ ] Matrix view in the Stakeholder tab plots stakeholders on x=influence, y=impact.
- [ ] Click on a cell or marker opens the stakeholder edit form.
- [ ] Score changes are audited (PROJ-10).
- [ ] PNG export.
- [ ] Default scale is the 4-step low/medium/high/critical; configurable label set per tenant later (PROJ-17).

## Edge Cases
- **Stakeholder with `linked_user_id` of a deleted auth user** → set to NULL (FK ON DELETE SET NULL).
- **Two stakeholders with the same name in different projects** → allowed; deduplication is not v1 (per V2 ADR).
- **Cross-tenant access** → RLS blocks (404).
- **Class-3 export to AI** → blocked by PROJ-12 (test ensures the field gets redacted in any export).
- **Dismissed suggestion still wanted later** → user can clear dismissals via Stakeholder tab settings.
- **Influence/impact matrix with 100+ stakeholders** → cells aggregate counts and clicking a cell opens a list (Gantt-style overflow handling).

## Technical Requirements
- **Stack:** Next.js 16 + Supabase, shadcn/ui (`Form`, `Sheet` for edit drawer, `Table`, `Card`).
- **Multi-tenant:** `stakeholders` and `stakeholder_suggestion_dismissals` MUST have `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`. RLS: project members and tenant admins.
- **Validation:** Zod (email format, score enum, name max length).
- **Auth:** Supabase Auth + project role checks (PROJ-4).
- **Privacy classification:** Class-3 fields registered in the data privacy registry that PROJ-12 reads.
- **Performance:** Index on `(project_id, is_active)`; matrix view uses an aggregation query for counts when large.

## Out of Scope (deferred or explicit non-goals)
- KI-based stakeholder analysis (separate concern in PROJ-12).
- External contact-data enrichment.
- Communication-mode generation (PROJ-13).
- Multi-project stakeholder dedup (out for v1).
- Tenant-wide stakeholder rollup (covered by PROJ-16 admin views).

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### What changes for the user

Today the Stakeholder tab is a Coming-Soon stub. After PROJ-8: a full project-scoped stakeholder list with two views — a sortable table and a 4×4 influence/impact matrix — plus a "Suggestions" sidebar that pulls typical roles from the project type catalog (e.g. an ERP project suggests Sponsor, Key-User, IT-Architect, Datenschutzbeauftragte:r). Single-click "Add" creates a stakeholder shell with the role pre-filled. Edit happens in a slide-in drawer. The matrix is exportable as PNG for steering committee slides.

### Component structure

```
/projects/[id]/stakeholder  (Server Component shell + RLS gate)
+-- Stakeholder Tab Header
|   +-- View toggle (List / Matrix)
|   +-- "+ Stakeholder" button (opens edit drawer in create mode)
|   +-- Search field (filter by name / role / org_unit)
|   +-- "Inaktive einblenden" toggle
+-- Suggestions Sidebar (collapsible, hidden when no suggestions left)
|   +-- "Empfohlen für [project type]" header
|   +-- Suggestion card per role: label, "Add" + "Verwerfen" buttons
+-- Main View (one of:)
|   +-- List View
|   |   +-- Table (Name, Rolle, Org, Origin, Einfluss/Impact, Status)
|   |   +-- Row click -> opens edit drawer
|   |   +-- Empty state: "Noch keine Stakeholder"
|   +-- Matrix View (F5.3)
|       +-- 4x4 grid (x = Einfluss, y = Impact)
|       +-- Cell shows count badge + colored dot markers
|       +-- Click cell -> list of stakeholders in that bucket
|       +-- Click marker -> edit drawer
|       +-- "Als PNG exportieren" button
+-- Edit Drawer (shadcn Sheet, slide from right)
|   +-- Form (RHF + Zod)
|   |   +-- Kind radio (Person / Organisation)
|   |   +-- Origin radio (Intern / Extern)
|   |   +-- Name (required)
|   |   +-- Rolle (combobox from project type catalog + free-text fallback)
|   |   +-- Organisationseinheit
|   |   +-- E-Mail, Telefon (Class-3, marked)
|   |   +-- Verknüpftes Konto (User picker, optional)
|   |   +-- Einfluss + Impact (segmented control, 4 levels each)
|   |   +-- Notizen (Textarea, Class-3)
|   +-- Footer: Speichern / Abbrechen / Deaktivieren (when editing)
```

### Data model

**New table: `stakeholders`**
- Identity: id (UUID), tenant_id (multi-tenant invariant), project_id (cascade-delete on project)
- Classification: kind (`person` / `organization`), origin (`internal` / `external`)
- Identity fields (Class-3 — personal data flagged for PROJ-12 export redaction):
  name (required), contact_email, contact_phone, linked_user_id (FK auth.users ON DELETE SET NULL), notes
- Domain fields (not Class-3): role_key (free or from project-type catalog), org_unit
- Steering fields: influence + impact (each `low` / `medium` / `high` / `critical`)
- Lifecycle: is_active (boolean, default true), created_by, created_at, updated_at

**New table: `stakeholder_suggestion_dismissals`**
- Composite key: (project_id, role_key)
- tenant_id (multi-tenant invariant)
- dismissed_by, dismissed_at (timestamps for "show me the dismissal trail")
- ON DELETE CASCADE from project

**Row-Level Security (both tables)**
- Read: any project member (via PROJ-4's `is_project_member` helper)
- Write: project_editor, project_lead, or tenant_admin (via existing PROJ-4 helpers)
- Cross-tenant access blocked by `is_tenant_member(tenant_id)` check on every policy
- Class-3 fields are stored normally (encryption at rest is Postgres' job); the privacy registry that PROJ-12 reads will mark these column names so an AI export pass can redact them.

### Tech decisions and why

| Decision | Why |
|---|---|
| **Two-table model** (stakeholders + suggestion_dismissals) | Separates "dismissals" from the main entity. Audit is cleaner per-action. Project deletion cascades both. JSON-array-in-stakeholders would be harder to audit and query. |
| **`role_key` is free-text with autocomplete** from PROJ-6's `standard_roles` | Lets users type novel roles (e.g. "Operations-Manager Standort Süd") without forcing pre-defined enum. Catalog roles are first-class suggestions but not the only valid input. |
| **Four-step influence/impact scale** | Matches V2 ADR. Tenant-level customization is a PROJ-17 concern; keeping the column as text enum (not numeric) makes admin queries readable. |
| **Edit drawer (Sheet) instead of modal dialog** | Drawer keeps the table visible behind the form so the user retains context. Modal would force a full-screen overlay for what's a 1-screen edit. |
| **Matrix renders client-side**, PNG export via `html-to-image` | Server-rendering PNG would require a headless browser. The matrix is a 4x4 grid + dots — html-to-image (~12 KB) on a div is fast and zero-server-cost. |
| **No audit log in v1** | Spec lists PROJ-10 as a Required dependency, but PROJ-10 is still Planned. **Decision: build PROJ-8 without audit hooks; flag explicitly.** When PROJ-10 ships, a hook will be added in a follow-up commit — every editable column is field-level and easy to wire later. |
| **No data privacy registry yet** | Same reasoning — PROJ-12 isn't built. Class-3 fields are documented in the migration as comments; enforcement (e.g. AI export redaction) lands with PROJ-12. |
| **Soft-deactivate via `is_active`**, not hard-delete | Keeps the audit trail intact (when PROJ-10 lands), preserves stakeholder history on closed projects, and reactivation is a single PATCH. |

### New surfaces added

**API routes** (built in `/backend`):
- list, get, create, update stakeholders (project-scoped, RLS-gated)
- deactivate / reactivate (small POST endpoints)
- suggestions (computed: catalog roles minus dismissed minus already-added)
- dismiss / clear-dismissals

**Pages**:
- `/projects/[id]/stakeholder` — replaces today's Coming-Soon stub; List view default, Matrix view via `?view=matrix` query

**Components** (under `src/components/projects/stakeholders/`):
- StakeholderTabClient (orchestrator with view toggle)
- StakeholderTable
- StakeholderMatrix + matrix-cell + PNG-export wrapper
- StakeholderForm (used inside the Sheet)
- StakeholderSuggestions (sidebar)

### Dependencies

One small new npm package:
- `html-to-image` (~12 KB) — converts the matrix DOM tree into a downloadable PNG.

Already installed and reused:
- `react-hook-form` + `zod` — same pattern as PROJ-2, PROJ-5
- shadcn `Sheet`, `Form`, `Select`, `Input`, `Textarea`, `Card`, `Table`, `Badge`, `RadioGroup`, `Toggle`, `ScrollArea`
- PROJ-6 catalog (`standard_roles` per project type)
- PROJ-4 helpers (`is_project_member`, `has_project_role`)
- Lucide icons

### Out of scope for this build (deferred)

- KI-based stakeholder analysis (PROJ-12)
- External contact-data enrichment
- Communication-mode generation (PROJ-13)
- Multi-project stakeholder dedup
- Tenant-wide stakeholder rollup (PROJ-16 admin views)
- Audit log entries for edits (waits for PROJ-10)
- Class-3 privacy-registry enforcement (waits for PROJ-12)
- Tenant-configurable influence/impact labels (PROJ-17)

## Implementation Notes

### Backend (this commit)
- Migration `20260428180000_proj8_stakeholders.sql`:
  - `stakeholders` table (tenant + project scoped, soft-deactivate via `is_active`).
  - `stakeholder_suggestion_dismissals` table (composite key project_id + role_key).
  - 4 RLS policies on `stakeholders` (member-read, editor/lead/admin write, lead/admin delete).
  - 3 RLS policies on `stakeholder_suggestion_dismissals` (member-read, editor/lead/admin insert+delete).
  - Indexes: `(project_id, is_active)`, `(project_id, role_key) where active`, `(linked_user_id) where not null`, `(project_id)` on dismissals.
  - Class-3 columns documented via `comment on column` for the future PROJ-12 privacy registry.
  - `moddatetime` trigger keeps `updated_at` fresh.
- 7 API routes:
  - `GET/POST /api/projects/[id]/stakeholders`
  - `GET/PATCH /api/projects/[id]/stakeholders/[sid]`
  - `POST /api/projects/[id]/stakeholders/[sid]/deactivate`
  - `POST /api/projects/[id]/stakeholders/[sid]/reactivate`
  - `GET /api/projects/[id]/stakeholders/suggestions`
  - `POST /api/projects/[id]/stakeholders/suggestions/dismiss`
  - `POST /api/projects/[id]/stakeholders/suggestions/clear`
- Suggestions endpoint computes the list at request time: catalog `standard_roles` minus active-stakeholder roles minus dismissed roles. No persistence beyond the dismissal table.
- Project access gated via existing PROJ-4 helpers (`requireProjectAccess(... "view"/"edit")`).
- Types: `src/types/stakeholder.ts` exports kind/origin/score enums + `Stakeholder` + `StakeholderSuggestion`.
- 8 new vitest cases in `src/app/api/projects/[id]/stakeholders/route.test.ts` covering 401 / 400 / 404 / 403 / happy paths for POST + filter behavior on GET. 148 total tests, all green.

### Frontend (pending — /frontend phase)
- Stakeholder tab page (replaces Coming-Soon stub) with List + Matrix views.
- Edit drawer (Sheet) with the full form.
- Suggestions sidebar.
- PNG export of the matrix via `html-to-image`.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
