# PROJ-17: Tenant Administration — Branding, Modules, Privacy Defaults, Export, Offboarding

## Status: Planned
**Created:** 2026-04-25
**Last Updated:** 2026-04-25

## Summary
Turns `/einstellungen` into the full tenant-admin center. Beyond what PROJ-1 already exposes (rename tenant, manage domain), this adds: tenant base data (display name, language, branding URL/color), module enable/disable, privacy default class, GDPR Art. 15/20 data export, and tenant offboarding (soft-delete with grace period). Inherits V2 EP-15.

## Dependencies
- Requires: PROJ-1 (Auth, Tenants, Roles)
- Requires: PROJ-10 (Audit + retention + redaction)
- Requires: PROJ-12 (Privacy classification — needed for default class field + export redaction)
- Requires: PROJ-13 (Email send for offboarding notice)
- Requires: PROJ-14 (Connector framework — backup destinations for export)

## V2 Reference Material
- **Epic file:** `~/projects/Projeketplattform_v2_D.U/planning/epics/ep-15-mandanten-administration.md`
- **Stories:** `~/projects/Projeketplattform_v2_D.U/planning/stories/ep-15.md` (ST-01 base data, ST-02 active modules, ST-03 privacy default class, ST-04 GDPR export, ST-05 tenant offboarding)
- **ADRs:** `docs/decisions/data-privacy-classification.md`, `docs/decisions/retention-and-export.md`, `docs/decisions/metamodel-infra-followups.md`
- **V2 code paths to study during /architecture and /backend:**
  - `apps/web/app/einstellungen/page.tsx` — V2's tenant settings page
  - `apps/api/src/projektplattform_api/routers/tenant.py`
  - `apps/api/src/projektplattform_api/services/tenant_export.py`

## User Stories
- **[V2 EP-15-ST-01]** As a tenant admin, I want to set display name, language (de/en), and basic branding (logo URL, accent color) so the platform shows in our look.
- **[V2 EP-15-ST-02]** As a tenant admin, I want to enable/disable optional modules (Risiken, Budget, KI, Konnektoren, Vendor, Kommunikation) tenant-wide.
- **[V2 EP-15-ST-03]** As a tenant admin, I want to set a default data-privacy class for unclassified fields so we route conservatively to local AI.
- **[V2 EP-15-ST-04]** As a tenant admin, I want to export all my tenant data as a machine-readable bundle (DSGVO Art. 15/20).
- **[V2 EP-15-ST-05]** As a tenant admin, I want to delete the tenant in a two-step way (soft-delete → 30-day grace → hard-delete) so we leave no orphan data when contracts end.

## Acceptance Criteria

### Tenant base data (ST-01)
- [ ] `tenants.name` editable (already exists from PROJ-1).
- [ ] New columns: `language (de|en)`, `branding (JSONB { logo_url, accent_color })`.
- [ ] `logo_url` HTTPS-only.
- [ ] `accent_color` hex `#RRGGBB`.
- [ ] Language change applies on next page reload (i18n is a separate work item; for now reads from a TS dictionary with de/en keys).
- [ ] Accent color exposed as CSS variable `--color-brand-600`.
- [ ] Audit on changes.

### Active modules (ST-02)
- [ ] `tenant_settings.active_modules` (JSONB array of module keys).
- [ ] Default modules: `projects, master_data, members` (always enabled — core).
- [ ] Optional: `risks, budget, ki, connectors, vendor, communication`.
- [ ] Disabling hides nav entries (global + project-tab); deactivated module APIs return `404` for reads, `403` for writes (per V2 AK).
- [ ] Existing data preserved when module disabled.
- [ ] Audit on toggles.

### Privacy default class (ST-03)
- [ ] `tenant_settings.privacy_defaults` (JSONB, e.g. `{ default_class: 1|2|3 }`).
- [ ] AI router (PROJ-12) honors the tenant default for unclassified fields.
- [ ] Existing class-3 fields STAY class-3 — defaults cannot deklassify.
- [ ] Setting default lower than 1 not allowed; setting higher (more conservative) shows warning "more data routes locally".

### GDPR data export (ST-04)
- [ ] Background job triggered by admin → produces ZIP with JSON dumps per entity (projects, work_items, stakeholders, risks, budget, audit_log, outbox, vendors, …).
- [ ] Class-3 fields redacted when "Redaction on" toggle set; identical behavior to PROJ-10's audit export redaction.
- [ ] UI shows progress + completion.
- [ ] Download link is signed and expires (24h default).
- [ ] Each export logged in audit with actor + timestamp + scope.
- [ ] Edge Function or Supabase scheduled job; storage in Supabase Storage with private bucket + signed URLs.

### Tenant offboarding (ST-05)
- [ ] Two-stage delete: Step 1 → soft-delete (`tenants.is_deleted=true`, `deleted_at` set, grace 30 days). Step 2 → hard-delete after grace.
- [ ] During grace, **platform-admin** (not tenant-admin) can revert.
- [ ] At grace end, a worker (Supabase scheduled function) removes the tenant + all dependent rows (CASCADE on `tenants.id`).
- [ ] Pre-delete: an EP-15-ST-04 export auto-runs and is retained for the platform admin.
- [ ] Audit trail of the deletion stays in a global `deletion_log` table outside the tenant.

## Edge Cases
- **Disabling 'communication' while drafts exist** → drafts preserved; UI shows "module disabled" state.
- **Privacy default raised to 3 then lowered back to 1** → audit trail of both changes; existing class-3 fields unchanged.
- **GDPR export of a huge tenant** → background job streams; progress + retry on chunk failures.
- **Offboarding restored after 31 days** → not allowed; documented at deletion time.
- **Hard-delete fails partway** → fallback: marks deletion as `errored`, alerts platform admin; transaction-bound when possible.
- **Cross-tenant view of another tenant's offboarding** → impossible (RLS).

## Technical Requirements
- **Stack:** Next.js 16 + Supabase + Edge Functions for export/delete background jobs.
- **Multi-tenant:** `tenant_settings` is one row per tenant with `tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE`. RLS: tenant_admin read+write own row; platform admin (separate role) for offboarding actions.
- **Validation:** Zod for branding (hex color regex, https URL), privacy_defaults shape, module key list.
- **Auth:** Supabase Auth + tenant_admin or platform-admin checks.
- **Privacy:** Class-3 fields pass through redaction logic on export.
- **Background jobs:** Long-running export & hard-delete via Supabase scheduled Edge Functions.

## Out of Scope (deferred or explicit non-goals)
- Self-service tenant signup (platform-admin creates tenants).
- Billing / license management.
- File-upload pipeline (URL-based branding only).
- Per-tenant custom translations beyond the de/en code dictionary.
- Reactivation past grace.
- Partial deletion (only-this-project deletion is separate).

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
