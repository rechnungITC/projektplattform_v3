# PROJ-10: Change Management — Field-level Versioning, Compare, Undo, Copy, Audit Reports

## Status: Planned
**Created:** 2026-04-25
**Last Updated:** 2026-04-25

## Summary
Field-level audit history for all planning objects (work_items, phases, milestones, stakeholders, risks, budget) plus version compare, single-field rollback, full-version restore, object copy, and tenant-wide audit/activity reports. Inherits V2 EP-08, including the F13.x cross-cutting features. Retention and DSGVO export rules apply.

## Dependencies
- Requires: PROJ-1 (Auth, Tenants, Roles)
- Requires: PROJ-9 (Work Items) — main subject of versioning
- Requires: PROJ-7 (Risks, Budget) — also versioned
- Requires: PROJ-8 (Stakeholders) — also versioned
- Influences: PROJ-12 (KI traceability uses the audit log to track AI provenance)

## V2 Reference Material
- **Epic file:** `~/projects/Projeketplattform_v2_D.U/planning/epics/ep-08-aenderungsmanagement-versionierung.md`
- **Stories:** `~/projects/Projeketplattform_v2_D.U/planning/stories/ep-08.md` (ST-01 field-level audit, ST-02 version display + compare, ST-03 selective field rollback, ST-04 object copy, F13.2 work-package edit with versioning, F13.4 undo + restore, F13.7 retention + GDPR + export, ST-05 tenant-wide audit report)
- **ADRs:** `docs/decisions/master-data-editing.md`, `docs/decisions/retention-and-export.md`, `docs/decisions/data-privacy-classification.md`
- **V2 code paths to study during /architecture and /backend:**
  - `apps/api/src/projektplattform_api/services/audit/hook.py` — central audit hook
  - `apps/api/src/projektplattform_api/services/retention.py` — retention policy
  - `apps/api/src/projektplattform_api/routers/audit.py` — `/audit/{id}/undo`, `/audit/export`
  - `db/migrations/versions/0010_audit_log_entries.py`

## User Stories
- **[V2 EP-08-ST-01]** As the system, I want to historize field-level changes on planning objects so that edits are traceable and reversible.
- **[V2 EP-08-ST-02]** As a user, I want to see prior versions of an object and compare them so that changes are nachvollziehbar.
- **[V2 EP-08-ST-03]** As a user, I want to selectively undo individual field changes so that I can fix mistakes without resetting the whole object.
- **[V2 EP-08-ST-04]** As a user, I want to copy planning objects to reuse content quickly.
- **[V2 F13.2]** As a project member, I want to edit work packages anytime, with each save creating a new version.
- **[V2 F13.4]** As a project member, I want immediate Undo and arbitrary version Restore.
- **[V2 F13.7]** As a sysadmin, I want governance rules (retention, GDPR redaction, export, access logging) on the version history.
- **[V2 EP-08-ST-05]** As a tenant admin or compliance officer, I want a tenant-wide audit/activity report.

## Acceptance Criteria

### Field-level audit (EP-08-ST-01)
- [ ] Table `audit_log_entries`: `id, tenant_id, entity_type, entity_id, field_name, old_value (JSONB), new_value (JSONB), actor_user_id, changed_at, change_reason (nullable, e.g. 'compliance_trigger', 'ki_acceptance')`.
- [ ] At minimum these fields are tracked across entities: title, description, status, priority, responsible/responsible_user_id.
- [ ] Hook: any PATCH that mutates a tracked field on a tracked entity inserts one row per changed field.
- [ ] Audit rows tied to the entity by `entity_type`+`entity_id`.

### Version display + compare (EP-08-ST-02)
- [ ] `GET /api/{entity_type}/{id}/history` returns chronological list of audit rows.
- [ ] UI History tab on entities renders the list, group-by-time-bucket.
- [ ] Compare mode: pick two timestamps; show field-level diff.
- [ ] AI-generated versions (PROJ-12) marked with a badge per F12.2 metadata.
- [ ] RBAC: only project_viewer+ on the project can read.

### Selective field rollback (EP-08-ST-03)
- [ ] Each history row has an "Undo this change" button.
- [ ] `POST /api/audit/{id}/undo` sets that one field back to `old_value` and creates a new audit row (the rollback is itself audited).
- [ ] Other fields untouched.
- [ ] Permission: project_editor+.
- [ ] Cannot undo if the field has been further modified after this entry (no silent stale rollback) — UI shows a warning.

### Object copy (EP-08-ST-04)
- [ ] `POST /api/{entity_type}/{id}/copy` creates a new row with a new ID.
- [ ] Copy carries: title (with " (Copy)" suffix), description, structural fields.
- [ ] Copy does NOT carry: history, assignments (responsible_user_id), due dates.
- [ ] Copy includes `metadata.copied_from = { entity_id, copied_at }`.
- [ ] Copy lands in the same project (no cross-tenant copy).

### Undo + Restore (F13.4)
- [ ] Last action has an undo affordance immediately after save (toast with Undo button).
- [ ] Restore: pick any prior version timestamp; UI shows diff vs current; on confirm, all fields are set to that version's values; new audit row written with reason "Restore from {timestamp}".
- [ ] Permission gating: editor+ for restore. **Risk R2 must be resolved before allowing PL to undo edits made by another user — record the policy as an ADR before implementation.**

### Retention + GDPR + Export (F13.7)
- [ ] Retention policy table-or-config: default 730 days for `audit_log_entries`.
- [ ] `apply_retention()` Edge Function (or SQL function) deletes audit rows older than policy; logs how many rows removed.
- [ ] `GET /api/audit/export` (admin-only) exports the tenant's audit log as JSON; class-3 fields redacted with `[redacted:class-3]`.
- [ ] Each export logged in `retention_export_log` with actor + timestamp + scope.
- [ ] Per-tenant overrides via `tenant_settings.retention_overrides` JSONB (PROJ-17).

### Tenant-wide audit report (EP-08-ST-05)
- [ ] `/reports/audit` page (admin/PMO).
- [ ] Filters: time range, entity type, actor, field name.
- [ ] CSV export.
- [ ] Class-3 fields redacted; if "Redaction off" toggled on, every read is itself audited (audit-on-audit).
- [ ] Cross-tenant queries return empty.

## Edge Cases
- **Concurrent edits on the same field** → both audit rows recorded; last write wins; conflict surfaced via History UI.
- **DSGVO right-to-be-forgotten on a stakeholder** → depersonalize the original row first (set name/email to NULL); audit rows referencing the old name age out via retention.
- **Undo after retention purge of the prior value** → button disabled with explanation "Old value retained beyond policy".
- **Restore across DSGVO redaction** → restore writes redacted values back; log warning.
- **Cross-tenant audit query** → returns empty list.
- **Massive bulk imports** → audit hook batches inserts; rate-limit visible in logs.

## Technical Requirements
- **Stack:** Next.js 16 + Supabase, Postgres triggers for audit hooks (preferred over app-layer hooks for atomicity).
- **Multi-tenant:** `audit_log_entries`, `retention_export_log` MUST have `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`. RLS: tenant admins for all rows; project members for rows scoped to their project.
- **Validation:** Zod for export filters + retention policy edits.
- **Auth:** Supabase Auth + admin/PMO roles.
- **Performance:** Index on `(entity_type, entity_id, changed_at DESC)`. Partition `audit_log_entries` by month if volume justifies.
- **Privacy:** Class-3 redaction logic shared with the data-privacy registry (PROJ-12).

## Out of Scope (deferred or explicit non-goals)
- Mass historization across multiple objects (no batch-undo of dozens of edits).
- File-attachment versioning.
- Project-level total rollback.
- Restoration of deleted objects.
- Automatic GDPR-compliance reporting (manual today).
- Retention-deadline notifications.

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
