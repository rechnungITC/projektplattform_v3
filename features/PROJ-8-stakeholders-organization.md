# PROJ-8: Stakeholders and Organization

## Status: Planned
**Created:** 2026-04-25
**Last Updated:** 2026-04-25

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
_To be added by /architecture_

## Implementation Notes
_To be added by /frontend and /backend_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
