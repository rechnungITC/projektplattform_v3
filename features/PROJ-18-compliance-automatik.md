# PROJ-18: Compliance Automatik & Process Templates

## Status: Planned
**Created:** 2026-04-25
**Last Updated:** 2026-04-25

## Summary
Compliance & process requirements (ISO 9001, ISO 27001, DSGVO, MS-365 rollout, vendor-evaluation, change-management, onboarding) become first-class project dependencies. Tags on work items, a `ComplianceTrigger` service that auto-creates follow-up work items + document slots, a Markdown template system with tenant-additive overrides, a phase-gate check that warns (does not block) on incomplete compliance, project-type default tag sets, and an admin UI for template maintenance. Inherits V2 EP-16.

## Dependencies
- Requires: PROJ-1 (Auth, Tenants, Roles)
- Requires: PROJ-9 (Work item metamodel) — tags attach here
- Requires: PROJ-10 (Audit) — trigger reasons logged
- Requires: PROJ-7 (Phases) — gate check on phase complete
- Requires: PROJ-15 (Vendor) — vendor-evaluation tag drives evaluation matrix creation
- Requires: PROJ-16 (Project type override UI) — default tag sets per type

## V2 Reference Material
- **Epic file:** `~/projects/Projeketplattform_v2_D.U/planning/epics/ep-16-compliance-automatik.md`
- **Stories:** `~/projects/Projeketplattform_v2_D.U/planning/stories/ep-16.md` (ST-01 tag registry, ST-02 trigger service, ST-03 templates + override, ST-04 phase-gate check, ST-05 default tag sets per type, ST-06 template UI)
- **ADRs:** `docs/decisions/compliance-as-dependency.md`
- **V2 code paths to study during /architecture and /backend:**
  - `apps/api/src/projektplattform_api/domain/core/compliance/` — V2's planned compliance module
  - `apps/api/src/projektplattform_api/services/compliance/trigger.py` — `ComplianceTrigger` service
  - `domain/core/compliance/templates/*.md` — V2 default templates (Markdown + YAML front-matter)

## User Stories
- **[V2 EP-16-ST-01]** As a platform / tenant admin, I want a controllable list of compliance/process tags so that work items can be tagged and the trigger service knows what to do.
- **[V2 EP-16-ST-02]** As the system, I want auto-creation of follow-up work items + document slots when an item with a compliance tag is created or transitions status.
- **[V2 EP-16-ST-03]** As the platform, I want a Markdown template system per tag with tenant-additive overrides so companies can bring their own forms.
- **[V2 EP-16-ST-04]** As a project lead, I want a phase-gate check that warns (does not block) when compliance increments are still open.
- **[V2 EP-16-ST-05]** As a tenant admin, I want default tag sets per project type (e.g. ERP rollout → `change-management` + `iso-9001`).
- **[V2 EP-16-ST-06]** As a tenant admin, I want a UI for template overrides so I'm not editing code.

## Acceptance Criteria

### Tag registry (ST-01)
- [ ] Table `compliance_tags`: `id, tenant_id, key (slug), display_name, description, is_active, template_ids (text[]), default_child_kinds (text[]), created_at, updated_at`.
- [ ] Platform-default tags shipped via initial migration: `iso-9001, iso-27001, dsgvo, microsoft-365-intro, vendor-evaluation, change-management, onboarding`.
- [ ] Tenant admin can deactivate, but cannot rename or structurally change platform defaults; can ADD additional custom tags only at tenant level (still v1: code-only, UI activate/deactivate).
- [ ] `GET /api/compliance-tags` (tenant scoped); `PATCH` tenant-admin only.
- [ ] Audit on changes.

### Trigger service (ST-02)
- [ ] Table `work_item_tags`: `id, tenant_id, work_item_id, tag_id, created_at, created_by`. Unique on `(work_item_id, tag_id)`.
- [ ] Service module `src/lib/compliance/trigger.ts` (or Edge Function):
  - `onWorkItemCreated(workItem)` — resolves tags + creates child increments.
  - `onWorkItemStatusChanged(workItem, newStatus)` — fires further increments at `in_progress` and `done` thresholds.
- [ ] Children carry `parent_id = workItem.id` and audit reason `compliance_trigger` with tag key + phase.
- [ ] Idempotent: second fire for the same `(work_item, tag, phase)` is a no-op.
- [ ] Templates render into `work_items.description` or into `work_item_documents` rows (see ST-03).

### Template system + override (ST-03)
- [ ] Default templates ship as Markdown files with YAML front-matter (`tag, kind, checklist_items, disclaimer`).
- [ ] Table `compliance_template_overrides`: `id, tenant_id, tag_key, template_key, override_body, override_checklist (JSONB), updated_at, updated_by` (tenant-additive, no destructive replace).
- [ ] Trigger service merges defaults + overrides at fire time.
- [ ] New entity `work_item_documents` (analog vendor_documents but with inline `body` + version).
- [ ] Doc edits go through audit (PROJ-10).

### Phase-gate check (ST-04)
- [ ] On `PATCH phases/{id}` with `status=completed`:
  - Server identifies compliance-derived child work items in this phase with `status != done`.
  - Response includes `compliance_warnings` field listing them.
- [ ] UI shows warnings as a banner at phase close.
- [ ] Closing is NOT blocked; user can confirm.
- [ ] Confirmation logged to audit with reason ("Phase closed despite N open compliance increments").

### Default tag sets per project type (ST-05)
- [ ] Project type catalog (PROJ-6) extended with `default_tags[]`.
- [ ] Tenant override (PROJ-16) `default_tags` editable per type.
- [ ] On `POST /api/projects`, default tags are applied to the project's root work item (or to a project-level tag table); trigger service fires.
- [ ] User can deselect tags during project creation (logged in audit).
- [ ] Project-type change AFTER creation does NOT re-fire tags (only at creation).

### Template UI (ST-06)
- [ ] Page `/stammdaten/compliance-templates` (tenant-admin only).
- [ ] Lists all platform tags with their default templates (read-only) + override editor (Markdown textarea + checklist editor).
- [ ] "Reset to default" per override.
- [ ] Audit on edits.
- [ ] Overrides take effect on the next trigger fire.

## Edge Cases
- **Same tag added twice on the same work item** → second add is a no-op (UNIQUE constraint).
- **Tag deactivated mid-project** → already-fired children stay; tag removal recorded but does NOT delete children (per V2 ADR).
- **Tag on a deleted work item** → cascade delete `work_item_tags`.
- **Cross-tenant tag access** → 404 (RLS).
- **Phase gate warns on bugs that happen to have compliance tags** → bugs are filtered out of compliance-derived children unless explicitly tagged (the trigger only counts auto-children).
- **Project type default tags collide with manually added tags** → dedup by tag key; first wins; second add no-op.
- **Override cleared back to default while children exist with override text** → new fires use default; old children keep their text.

## Technical Requirements
- **Stack:** Next.js 16 + Supabase + Edge Functions for trigger; Postgres triggers as second line of defense if budget allows.
- **Multi-tenant:** All compliance tables MUST have `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`. RLS: tenant_member for reads on active tags; tenant_admin for writes; project members for `work_item_tags`.
- **Validation:** Zod (tag key slug, override length cap).
- **Auth:** Supabase Auth + tenant_admin/role checks.
- **Idempotency:** `(work_item_id, tag_id, phase)` natural key for trigger fires recorded in `compliance_trigger_log`.
- **Performance:** Trigger inserts batched in a transaction.
- **Audit:** PROJ-10 hook with `change_reason='compliance_trigger'`.

## Out of Scope (deferred or explicit non-goals)
- Legally-binding evaluations.
- Hard locks (warn only).
- KI text generation in templates (later).
- Recursive cascade onto grandchildren.
- Tag hierarchy / grouping.
- Free admin definition of brand-new tags via UI v1.
- Template inheritance between tenants.
- WYSIWYG editor.

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
