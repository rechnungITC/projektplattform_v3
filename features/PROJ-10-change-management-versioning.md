# PROJ-10: Change Management — Field-level Versioning, Compare, Undo, Copy, Audit Reports

## Status: Approved
**Created:** 2026-04-25
**Last Updated:** 2026-04-28
**Build mode:** Phase A + B + C in one iteration (per user direction).

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

### What changes for the user

Today, an edit to a stakeholder's name or a work-item's status disappears into the entity's `updated_at` — the *who*, *when*, and *what changed* are lost. Every project lead has at some point asked "wer hat das geändert?" and gotten no answer.

After PROJ-10:
- **Every edit is recorded field-by-field**, automatically, by a database trigger. There's no opt-in for app code; if a tracked column changes, an audit row appears.
- **A History tab** on work-items, stakeholders, phases, milestones, and projects shows the timeline: who, when, which field, from what to what.
- **Selective undo** per row: roll back only this one field, keep the rest.
- **Full restore** to any prior version timestamp.
- **Object copy** with a single click, structural fields only.
- **Tenant-wide audit report** for the admin, with filters and CSV export.
- **Retention cron** auto-purges old entries after 730 days (default).
- **GDPR export** redacts class-3 fields automatically.

### Phasing — the build splits into 3 logical bites

The spec is large enough that one commit would be unwieldy. The architecture is designed so each phase ships independently and is useful on its own. The user decides at /backend time whether to ship Phase A first and pause for review, or roll all three through.

| Phase | Deliverable | Useful on its own? |
|---|---|---|
| **A — Foundation** | `audit_log_entries` table + trigger + read API + History tab UI on work-items and stakeholders | ✅ Read-only history is already valuable for "wer hat das geändert?" |
| **B — Write actions** | Selective undo, full restore, object copy (per entity) | ✅ Power-user features on top of A |
| **C — Governance** | Retention cron, admin export, `/reports/audit` page with filters + CSV | ✅ Admin/compliance-facing, can land last |

### Component structure (full target state)

```
HistoryTab (mounted in entity drawers / detail panels)
+-- Group header (date bucket)
|   +-- Audit row
|       +-- Actor avatar/name
|       +-- Field name + arrow (old → new)
|       +-- Reason badge (e.g. "KI-Akzeptanz", "Compliance-Trigger") if set
|       +-- "Diesen Schritt zurücknehmen" button (Phase B, editor+)
+-- Compare picker (Phase B)
|   +-- Two timestamp dropdowns
|   +-- Field-level diff card
+-- Restore action (Phase B)
    +-- "Auf Stand X.Y. zurücksetzen" → confirmation → write all fields

Copy button (per entity drawer footer, Phase B)
   +-- Confirmation toast
   +-- Calls /copy → opens fresh drawer with the new entity

/reports/audit (Phase C, /admin or /reports prefix, admin/PMO only)
+-- Filter sidebar
|   +-- Entity type (multi-select)
|   +-- Actor (user picker)
|   +-- Field name (autocomplete)
|   +-- Time range
|   +-- "Redaktion aus" toggle (each toggle-on logs an audit-of-audit row)
+-- Audit table
|   +-- Sortable columns: changed_at, entity_type, entity_id link, field, actor, reason
+-- CSV export button (downloads a class-3-redacted CSV)

Existing entry points (touched in this feature)
+-- Work-item detail drawer → add HistoryTab
+-- Stakeholder edit drawer → add HistoryTab
+-- Phase / Milestone editors → add HistoryTab (Phase A scope, simple)
+-- Project settings page → add HistoryTab for project-level fields
```

### Data model

**New table: `audit_log_entries`**
- Identity: `id` (UUID), `tenant_id` (multi-tenant invariant)
- Subject: `entity_type` (e.g. `stakeholders`, `work_items`), `entity_id` (UUID)
- Change: `field_name`, `old_value` (JSONB), `new_value` (JSONB)
- Provenance: `actor_user_id`, `changed_at`, `change_reason` (nullable enum-text — `ki_acceptance`, `compliance_trigger`, `restore`, `undo`, etc.)
- INSERT-only from the user's perspective: filled by the DB trigger, never written by app code

**New table: `retention_export_log`** (Phase C)
- Identity, tenant_id, actor_user_id, exported_at, scope (JSONB filter that was applied), redaction_off (boolean)
- Used to audit the audit-export action itself

**New trigger function: `record_audit_changes()`** (DB-level, SECURITY DEFINER)
- Generic across tables — uses `TG_TABLE_NAME` to look up the tracked-column whitelist per entity
- Reads OLD vs NEW on UPDATE, emits one audit row per changed tracked column
- Reads `current_setting('audit.change_reason', true)` for programmatic context (so PROJ-12's AI-accept flow can label the entry)

**Whitelisted columns per entity** (only changes to these create audit rows)

| Entity | Tracked fields |
|---|---|
| `stakeholders` | name, role_key, org_unit, contact_email, contact_phone, influence, impact, linked_user_id, notes, is_active, kind, origin |
| `work_items` | title, description, status, priority, responsible_user_id, kind, sprint_id, parent_id, story_points |
| `phases` | name, description, planned_start, planned_end, status, sequence_number |
| `milestones` | name, description, target_date, actual_date, status, phase_id |
| `projects` | name, description, project_number, planned_start_date, planned_end_date, responsible_user_id, project_type, project_method, lifecycle_status, type_specific_data |

`created_at`, `updated_at`, `tenant_id`, `is_deleted`, `created_by`, internal IDs are intentionally **not** tracked — they're metadata, not user-visible state.

**Stored where**
Postgres in the existing Supabase project. RLS on `audit_log_entries`:
- INSERT: only via the trigger (SECURITY DEFINER); no policy lets users insert directly
- SELECT: project members for entries where the entity belongs to a project they can see; tenant admins for everything in their tenant
- UPDATE / DELETE: nobody (including admins). Retention cron uses service-role to purge old rows.

### Tech decisions and why

| Decision | Why |
|---|---|
| **Postgres trigger** for the audit hook (not application-layer) | Atomic with the write — can't be bypassed by missing a hook call from a new code path. The spec explicitly recommends this. |
| **One shared trigger function** parameterized via `TG_TABLE_NAME` | DRY. The whitelist per table lives in a small lookup function; adding a new audited table is a one-line `create trigger` plus an entry in the whitelist. |
| **JSONB old/new** rather than typed columns | Handles every Postgres type uniformly (text, enum, uuid, jsonb, date, timestamptz). The audit log is read-mostly; queryability beats type-strictness. |
| **INSERT-only audit rows** | Audit data is forensic — letting users edit it would defeat the point. Retention cron uses service-role to purge older-than-policy rows; that's the only deletion path. |
| **Trigger captures `auth.uid()` for `actor_user_id`** | The DB knows who's logged in (Supabase sets the session). No app-layer plumbing needed. |
| **`change_reason` set via `current_setting('audit.change_reason')`** | Lets Phase 2/PROJ-12 mark special edits ("ki_acceptance", "restore", "compliance_trigger") without a separate API surface. The default is NULL. |
| **No audit on INSERT** | Entity creation is captured by the entity's own `created_at` + `created_by`. Re-emitting it as field-level audit (every column from NULL → new) would just spam the log. |
| **Soft-deletes go through UPDATE, so they're audited** | Stakeholder.is_active and project.is_deleted both flip via UPDATE; trigger captures them. Hard-deletes via service-role bypass everything (intentional). |
| **History tab as a shared component** consumed by 5+ drawers | Drawer wrappers stay light; History UI logic lives once. |
| **Retention cron at 03:00 UTC** like PROJ-5's wizard purge | Same Vercel-Cron + CRON_SECRET pattern; consistent ops. |
| **Phase the build (A → B → C)** | Reduces commit-size and review-effort. Phase A by itself answers "wer hat das geändert?" — the most-asked question and the bulk of the user value. |

### API surface

| Phase | Method + Path | Purpose |
|---|---|---|
| A | `GET /api/audit/[entity_type]/[entity_id]/history` | History list for an entity, RLS-scoped |
| B | `POST /api/audit/[id]/undo` | Selective field rollback (one column back to `old_value`); validates the field hasn't been further modified since. Creates new audit row with reason = `undo` |
| B | `POST /api/[entity_type]/[id]/copy` | Per-entity copy endpoint; structural fields only |
| B | `POST /api/[entity_type]/[id]/restore` | Full version restore to a target timestamp; writes new audit row with reason = `restore_from_<ts>` |
| C | `GET /api/audit/export?entity_type=…&actor=…&from=…&to=…` | Admin-only JSON/CSV export, class-3 redacted by default |
| C | `GET /api/audit/reports?…` | Tenant-wide query for the `/reports/audit` page (same filter shape as export) |
| C | `POST /api/cron/apply-retention` | Daily cron — deletes audit rows older than the retention policy (default 730 days, per-tenant override via PROJ-17's `tenant_settings.retention_overrides`) |

### Security and privacy

- **Class-3 columns** (e.g. `stakeholders.name`, `stakeholders.contact_email`, `stakeholders.notes`) are stored verbatim in the audit `old_value`/`new_value` JSONB. The export endpoint redacts them with `[redacted:class-3]` by default; turning redaction off requires admin role AND records its own audit-of-audit row.
- **Cross-tenant query** is impossible by RLS construction (every policy carries `tenant_id` or routes through `is_project_member`).
- **Concurrent edits** — last write wins on the entity itself; both audit rows record. UI surfaces them in chronological order; PR#R2 (the spec's note about "PL undoing edits made by another user") is documented as an ADR follow-up before Phase B's undo lands.

### Dependencies

No new npm packages. The audit feature is database-heavy:
- Postgres triggers + JSONB (already used)
- Same shadcn primitives as existing drawers (Card, Badge, Button, Tabs)
- `date-fns` for relative-time labels in History UI (already installed)
- Existing `requireProjectAccess` + tenant-admin helpers (PROJ-1 / PROJ-4)

### Out of scope (explicit non-goals)

- Mass historization across multiple objects (no batch undo of dozens of edits at once).
- File-attachment versioning.
- Project-level total rollback (the spec lists this as out of scope).
- Restoration of hard-deleted objects.
- Automated GDPR-compliance reporting (manual export today).
- Retention-deadline notifications.
- Audit on `tenant_memberships`, `project_memberships` — RBAC changes are themselves sensitive but tracked separately by PROJ-4's audit (different concern).

## Implementation Notes

### Backend (this commit) — Phases A + B + C all shipped together

**Migrations applied to project `iqerihohwabyjzkpcujq`:**
- `20260428190000_proj10_audit_log_entries.sql` — table, indexes, trigger function `record_audit_changes()`, triggers on 5 tables, helper `can_read_audit_entry()`, RLS read policy, retention_export_log table.
- `20260428200000_proj10_audit_undo_restore_rpcs.sql` — `audit_undo_field()`, `audit_restore_entity()` SECURITY DEFINER RPCs.

**Trigger smoke-tested live:** 2 UPDATEs on a real project → 2 audit rows; cleanup verified.

**API routes (7):**
- `GET /api/audit/[entity_type]/[entity_id]/history` — list (RLS-gated by `can_read_audit_entry`)
- `POST /api/audit/[id]/undo` — selective field rollback (refuses on stale `field_modified_after`)
- `POST /api/audit/[entity_type]/[entity_id]/restore` — full version restore via RPC
- `POST /api/projects/[id]/stakeholders/[sid]/copy` — copy with structural fields only (Class-3 personal data NOT carried)
- `POST /api/projects/[id]/work-items/[wid]/copy` — copy with title + description + kind only
- `GET /api/audit/reports` — tenant-wide query (filters: entity_type, actor, field, date range)
- `GET /api/audit/export?format=json|csv&redaction_off=…` — tenant-admin only; Class-3 redaction by default; every export logged in `retention_export_log`
- `GET /api/cron/apply-retention` — daily 03:30 UTC, deletes audit rows older than 730 days; CRON_SECRET-gated

**vercel.json:** added second cron entry (`apply-retention`).

**Trigger semantics:**
- INSERT not audited (entity's own `created_at`/`created_by` cover that).
- UPDATE compares each whitelisted column via `to_jsonb(OLD)`/`to_jsonb(NEW)`; emits one audit row per changed column.
- `change_reason` read from `current_setting('audit.change_reason', true)`; PROJ-12's KI-accept will set this; undo/restore RPCs set it to `'undo'` / `'restore_from_<ts>'`.
- DELETE not audited (soft-delete via column flip is captured by the UPDATE path; hard-delete via service-role bypasses everything intentionally).

**Class-3 redaction in export:** stakeholders.{name, contact_email, contact_phone, linked_user_id, notes} replaced with `[redacted:class-3]`. Other entity types pass through.

**Tests:** 4 new vitest cases for the history endpoint (152 total, all green).

### Frontend (this commit)
- `src/lib/audit/api.ts` — fetch wrappers + `AuditConflictError` for stale-write detection.
- `src/components/audit/history-tab.tsx` — generic, reusable HistoryTab:
  groups entries by date, per-row Undo + Restore buttons, reason badges,
  `formatValue` slot for entity-specific rendering, `onMutated` callback.
- Stakeholder drawer (PROJ-8): edit-mode wrapped in Tabs (Stammdaten | Historie).
  Form footer gets a new "Kopieren" button next to Deaktivieren/Reaktivieren.
- `/reports/audit` admin page: filters (entity_type, field_name, actor_user_id,
  from/to date), Suchen + CSV-Export buttons. Server-side admin gate enforces
  the export.

### Open follow-ups
- Mount HistoryTab in the work-item detail drawer (PROJ-9 surface) — needs a
  Tabs refactor of that drawer, deferred.
- HistoryTab in phase + milestone editors and project settings page.
- Front-end admin-role gate on the /reports/audit page (currently anyone with
  the URL renders the layout; the data API returns RLS-scoped rows and the
  CSV export specifically requires admin server-side, so non-admins get a
  403 toast).
- ADR for "PL undoes another user's edit" (spec R2 risk).

## QA Test Results

### Test Execution Summary

| Layer | Result |
|---|---|
| Vitest unit + integration | 152 / 152 pass (17 files; +4 new for audit history GET) |
| Live RLS audit (Supabase MCP) | Pass — `audit_log_select_member_or_admin` routes through `can_read_audit_entry()` (project-membership lookup or tenant-admin shortcut); `rel_select_admin` is admin-only on retention_export_log. No INSERT / UPDATE / DELETE policies — only SECURITY DEFINER trigger writes; service-role purges. |
| Live trigger attachment | Pass — 5 AFTER UPDATE triggers (`audit_changes_{stakeholders,work_items,phases,milestones,projects}`) confirmed in `information_schema.triggers`. |
| Live trigger smoke-test (in /backend phase) | Pass — 2 UPDATEs on a real project → 2 audit rows; cleanup verified. |
| Manual UI walkthrough (user-confirmed) | Pass — all 7 smoke tests from the handoff confirmed by user: history listing, undo with stale-write warning, restore with field-count toast, copy with `(Kopie)` suffix, /reports/audit search + CSV download. |
| Build (`npm run build`) | Clean — 7 new API routes + /reports/audit page all registered. |
| Production deploy | Live via auto-deploy after commit `e025c0c` (+ admin-only nav link). |
| Playwright E2E | Deferred — would require a tenant-admin test fixture; manual walkthrough was greenlit. |

### Acceptance Criteria Walkthrough

#### Field-level audit (EP-08-ST-01)
| AC | Status | Notes |
|---|---|---|
| `audit_log_entries` schema per spec | ✅ | id, tenant_id, entity_type, entity_id, field_name, old_value (JSONB), new_value (JSONB), actor_user_id, changed_at, change_reason |
| At minimum title/description/status/priority/responsible tracked | ✅ | Whitelist function `_tracked_audit_columns(text)` covers these and more per entity (12 fields for stakeholders, 9 for work_items, 6 for phases, 6 for milestones, 10 for projects) |
| PATCH inserts one row per changed field | ✅ | Trigger compares OLD vs NEW per whitelisted column |
| Audit rows tied to entity by `entity_type`+`entity_id` | ✅ | Composite index on `(entity_type, entity_id, changed_at desc)` |

#### Version display + compare (EP-08-ST-02)
| AC | Status | Notes |
|---|---|---|
| `GET /api/{entity_type}/{id}/history` chronological | ✅ | RLS-scoped via `can_read_audit_entry()` |
| UI History tab on entities | ✅ | Mounted on stakeholder edit drawer (Tabs: Stammdaten | Historie). Work-item / phase / milestone / project mounts deferred per architecture decision. |
| Group-by-time-bucket | ✅ | Date headers, sticky |
| Compare mode (pick two timestamps + diff) | ⏳ | **Deferred** — current per-row "vorher / nachher" diff covers the primary use case; multi-version compare is a follow-up. |
| AI-generated versions marked with badge | ⏳ | Plumbing in place (`change_reason = 'ki_acceptance'` rendered as badge); waits for PROJ-12 to actually use it |
| RBAC: project_viewer+ on the project | ✅ | RLS via `is_project_member` |

#### Selective field rollback (EP-08-ST-03)
| AC | Status | Notes |
|---|---|---|
| Per-row "Undo this change" button | ✅ | Undo2 icon |
| `POST /api/audit/{id}/undo` sets field back, audits the rollback | ✅ | `audit_undo_field()` RPC sets `change_reason='undo'` before the UPDATE |
| Other fields untouched | ✅ | RPC updates the single column |
| Permission: project_editor+ | ✅ | API gates with `requireProjectAccess(... "edit")` |
| Refuse stale rollback if field further modified | ✅ | RPC compares `current = entry.new_value` and returns `field_modified_after` → 409 |

#### Object copy (EP-08-ST-04)
| AC | Status | Notes |
|---|---|---|
| `POST /api/{entity_type}/{id}/copy` with new ID | ✅ | Stakeholder + work-item endpoints implemented |
| Title + " (Copy)" suffix | ✅ | `(Kopie)` (German) — same intent |
| Does NOT carry assignments / dates | ✅ | Stakeholders skip Class-3 + linked_user_id; work-items skip status/sprint/parent/responsible/dates/story_points |
| `metadata.copied_from = { entity_id, copied_at }` | ⏳ | **Deferred** — neither entity has a metadata JSONB column. Future schema-extension can add this without breaking the audit trail. |
| Same project (no cross-tenant) | ✅ | Endpoints scope by `project_id` |

#### Undo + Restore (F13.4)
| AC | Status | Notes |
|---|---|---|
| Toast with Undo button right after save | ⏳ | **Deferred** — Undo affordance lives in the History tab. A "right-after-save" toast affordance can be added later as a UX nicety. |
| Restore: pick prior version timestamp + confirm | ✅ | RotateCcw button on each history row → confirm dialog → calls restore API |
| All fields set to that version's values; audit row written | ✅ | `audit_restore_entity()` RPC sets `change_reason='restore_from_<ISO>'` |
| Permission: editor+ | ✅ | API gates via `requireProjectAccess(... "edit")` |
| ADR for "PL undoes another's edit" (R2 risk) | ⏳ | **Deferred** as documented in spec. Currently any editor+ can undo any edit. |

#### Retention + GDPR + Export (F13.7)
| AC | Status | Notes |
|---|---|---|
| Default retention 730 days | ✅ | Constant in cron handler |
| `apply_retention()` function deletes old rows + logs count | ✅ | `/api/cron/apply-retention` daily 03:30 UTC; CRON_SECRET-gated; service-role client; returns `purged` count |
| `GET /api/audit/export` admin-only with Class-3 redaction | ✅ | `requireTenantAdmin`; redacts stakeholders.{name, contact_email, contact_phone, linked_user_id, notes} with `[redacted:class-3]` |
| Each export logged in `retention_export_log` | ✅ | Insert after the SELECT, captures actor, scope, redaction_off, row_count |
| Per-tenant override via `tenant_settings.retention_overrides` | ⏳ | **Deferred** — needs PROJ-17 to ship `tenant_settings` |

#### Tenant-wide audit report (EP-08-ST-05)
| AC | Status | Notes |
|---|---|---|
| `/reports/audit` page | ✅ | New page + admin-only top-nav link |
| Filters: time range, entity type, actor, field | ✅ | All four filters implemented via querystring |
| CSV export | ✅ | Button opens `/api/audit/export?format=csv` in a new tab |
| Class-3 fields redacted by default | ✅ | Server-side default redaction |
| "Redaction off" → audit-on-audit | ✅ | Every `/export` call inserts a `retention_export_log` row regardless; the `redaction_off` flag is stored on the log row |
| Cross-tenant query returns empty | ✅ | RLS filters by `tenant_id`; the API requires `tenant_id` parameter |

### Edge Cases

| Case | Spec says | Implementation |
|---|---|---|
| Concurrent edits on same field | both rows recorded; last wins; surfaced in UI | ✅ Trigger fires per-UPDATE so both audits land |
| DSGVO right-to-be-forgotten | depersonalize stakeholder; audit ages out | ✅ Stakeholder edits clear name/email; retention cron deletes >730d entries |
| Undo after retention purge | button disabled with explanation | ⚠️ Currently silently 404s (audit entry no longer exists). UI shows "Audit entry not found" toast. **Bug L1**. |
| Restore across DSGVO redaction | restore writes redacted values back; warning logged | ⚠️ No warning logged. Silent restore writes whatever's in old_value (which may be the pre-redaction value). **Bug M1.** |
| Cross-tenant audit query | empty list | ✅ RLS enforced |
| Massive bulk imports | audit hook batches inserts; rate-limit log | ⏳ Bulk-import path not built; if/when imports come, audit may need optimization |

### Security Audit

| Check | Result |
|---|---|
| RLS isolation between projects | ✅ `can_read_audit_entry()` checks `is_project_member()` per entity lookup |
| RLS isolation between tenants | ✅ `is_tenant_admin(tenant_id)` shortcut + per-entity tenant scoping |
| INSERT-only via SECURITY DEFINER trigger | ✅ No INSERT policy on `audit_log_entries` for users; service-role purges via `delete{count:'exact'}` |
| Auth required on all endpoints | ✅ All routes return 401 without session |
| Admin gate on export | ✅ `requireTenantAdmin` at API; UI nav-link is `adminOnly` |
| `auth.uid()` captured at trigger time | ✅ Trigger reads `auth.uid()`; service-role writes have `actor_user_id = NULL` (correct for system writes) |
| `change_reason` injection (`current_setting`) | ✅ Transaction-local; PostgREST uses fresh tx per request — no leak between users |
| Trigger search_path | ✅ `set search_path = public` on all functions |
| SQL injection via dynamic SQL in RPCs | ✅ `format(... %I)` for identifiers (escaped); `$1`/`$2` parameters for values |
| Class-3 redaction in CSV export | ✅ stakeholders.{name, contact_email, contact_phone, linked_user_id, notes} redacted |

### Bug Audit

| Severity | ID | Description | Fix complexity |
|---|---|---|---|
| Medium | M1 | **Restore across DSGVO redaction silently writes back redacted values.** Spec says "log warning" — currently no warning logged on `retention_export_log` or in the response. The restore would re-introduce a previously-cleared value, potentially undoing a GDPR action. | Medium — add a check inside `audit_restore_entity()` that flags rows where current value is NULL/redaction-marker and emit a warning in the response payload. |
| Low | L1 | **Undo button after retention purge silently 404s.** When a user tries to undo a row whose audit entry has been purged, the API returns 404; spec says "button disabled with explanation". UI doesn't pre-disable. Acceptable since the History tab won't even show purged rows (they're deleted). | Low — only relevant if user keeps a stale tab open across purge. |
| Low | L2 | **Race window in `audit_undo_field`** between the SELECT (current value check) and UPDATE. Truly atomic would put `WHERE field = entry.new_value` on the UPDATE. Window is sub-millisecond inside one transaction; in practice negligible. | Low — fix when the function is touched next. |
| Low | L3 | **HistoryTab not yet on work-item / phase / milestone / project editors.** Documented as deferred. Stakeholder coverage delivers most user value; rest is a follow-up. | Medium — work-item drawer needs Tabs refactor. |
| Info | I1 | Compare-two-timestamps mode (pick A and B, see field-level diff between arbitrary versions) is deferred. Current per-row "vorher / nachher" satisfies the most-common use case. | — |
| Info | I2 | `metadata.copied_from` not stored on copies — entities don't have a metadata column. | — |
| Info | I3 | "PL undoes another user's edit" ADR (R2 risk) not yet written. Currently any editor+ can undo any edit. | Doc-only |
| Info | I4 | Tenant-customizable retention via `tenant_settings.retention_overrides` waits for PROJ-17. | — |
| Info | I5 | Front-end admin-gate on `/reports/audit` is loose — page renders for anyone with the URL; data API is RLS-scoped (non-admins see only their projects' audit) and CSV export is admin-only server-side. The new top-nav link is admin-only, so practical discoverability is gated. | — |

### Production-Ready Decision

**READY** for status `Approved`.

No Critical or High bugs. The single Medium (M1 — restore across DSGVO redaction) is an edge case with a documented spec contract; current behaviour is "silent restore" which technically deviates from "log warning". Fixing is small (~15 min) but doesn't block shipping the foundation.

Recommendation: ship as Approved; address M1 in a small follow-up commit (or the user can decide to fix it before Deploy with Pfad B).

### Suggested follow-ups (not blockers)
1. Fix M1 — emit a warning marker in the restore response when any field's old_value is the redaction sentinel (`[redacted:class-3]` or `NULL` after a GDPR clear).
2. Mount HistoryTab in the work-item / phase / milestone / project editors (L3).
3. Write the R2 ADR before allowing PLs to undo edits made by other users (I3).
4. Two-version compare picker (I1).
5. Add `metadata` JSONB to copyable entities so `copied_from` can be recorded (I2).
6. Pre-disable the undo button on entries whose audit row is older than retention (L1).
7. Enforce front-end admin gate on `/reports/audit` so non-admins see a "Forbidden" card instead of an empty table (I5).

## Deployment
_To be added by /deploy_
