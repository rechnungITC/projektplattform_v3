# PROJ-15: Vendor and Procurement (Stammdaten, Project Assignment, Evaluation Matrix, Document Slots)

## Status: Planned
**Created:** 2026-04-25
**Last Updated:** 2026-04-25

## Summary
Vendor master data per tenant, project ↔ vendor assignment with role, evaluation matrix for vendor selection, and metadata-only document slots (offer, contract, NDA, references) — links to external storage, no upload pipeline. Ki-driven contract pre-screening (V2 EP-13-ST-05) is deliberately deferred until legal review of § 1 RDG. Inherits V2 EP-13.

## Dependencies
- Requires: PROJ-1 (Auth, Tenants, Roles)
- Requires: PROJ-2 (Project CRUD)
- Requires: PROJ-7 (Project Room) — vendor tab
- Requires: PROJ-10 (Audit) — vendor changes audited
- Influences: PROJ-18 (Compliance trigger via `vendor-evaluation` tag generates eval matrix automatically)

## V2 Reference Material
- **Epic file:** `~/projects/Projeketplattform_v2_D.U/planning/epics/ep-13-vendor-und-beschaffung.md`
- **Stories:** `~/projects/Projeketplattform_v2_D.U/planning/stories/ep-13.md` (ST-01 vendor stammdaten, ST-02 vendor↔project, ST-03 evaluation matrix, ST-04 document slots, ST-05 KI contract pre-screening — deferred)
- **ADRs:** `docs/decisions/compliance-as-dependency.md` (vendor-evaluation as a compliance tag)
- **V2 code paths to study during /architecture and /backend:**
  - `apps/api/src/projektplattform_api/domain/extensions/erp/vendors/` (planned in V2; little code yet)
  - `apps/web/app/projects/[id]/components/VendorTab/`

## User Stories
- **[V2 EP-13-ST-01]** As a project lead, I want to maintain vendors at the tenant level so that I can reuse them across projects.
- **[V2 EP-13-ST-02]** As a project lead, I want to assign one or more vendors with roles to a project so that delivery responsibilities are visible in the project room.
- **[V2 EP-13-ST-03]** As a project lead, I want to score vendors on multiple criteria so that selection has a documented basis.
- **[V2 EP-13-ST-04]** As a project lead, I want to register vendor documents (offers, contracts, NDAs) as metadata pointing to external storage.

## Acceptance Criteria

### Vendor master data (ST-01)
- [ ] Table `vendors`: `id, tenant_id, name, category (free text), primary_contact_email, website, status (active|inactive), created_at, updated_at`.
- [ ] Tenant-isolated; cross-tenant access → 404.
- [ ] List filterable by status.
- [ ] Only platform admin and tenant members with project access see the list.
- [ ] Edits audited (PROJ-10).

### Vendor ↔ project assignment (ST-02)
- [ ] Table `vendor_project_assignments`: `id, tenant_id, project_id, vendor_id, role (enum: lieferant|subunternehmer|berater|weitere), scope_note, valid_from, valid_until, created_at`.
- [ ] Unique on `(project_id, vendor_id, role)`.
- [ ] CASCADE delete on vendor.
- [ ] Project room has Vendor tab listing assignments.

### Evaluation matrix (ST-03)
- [ ] Table `vendor_evaluations`: `id, tenant_id, vendor_id, criterion (free text), score (1-5), comment, created_by, created_at`.
- [ ] Average score computed server-side and shown in vendor list.
- [ ] Evaluations preserved on vendor deactivation.
- [ ] Score edit/delete audited.

### Document slots (ST-04)
- [ ] Table `vendor_documents`: `id, tenant_id, vendor_id, kind (offer|contract|nda|reference|other), title, external_url (https), document_date, note, created_by, created_at`.
- [ ] No file upload, no virus scan, no preview — links only.
- [ ] HTTPS-only validation on `external_url`.
- [ ] Deletion audited.

## Edge Cases
- **Vendor in two tenants** → impossible (RLS).
- **Vendor delete cascades** → project assignments + evaluations + documents removed; cascade noted in audit.
- **Same role twice on the same project** → uniqueness constraint blocks.
- **Vendor with multiple contacts** → v1 stores only `primary_contact_email`; multi-contact deferred.
- **External URL schemes other than https** → rejected.
- **Vendor evaluation with score outside 1-5** → 422 validation error.

## Technical Requirements
- **Stack:** Next.js 16 + Supabase, shadcn/ui (`Table`, `Form`, `Sheet` for vendor edit, `Card` for evaluation).
- **Multi-tenant:** Every new table MUST have `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`. RLS uses `is_tenant_member(tenant_id)` for vendor list (tenant-wide); project-scoped policies for project assignments.
- **Validation:** Zod (https URL, score range, role enum).
- **Auth:** Supabase Auth + project/tenant role checks.
- **Audit:** PROJ-10 hooks on every mutation.

## Out of Scope (deferred or explicit non-goals)
- KI contract pre-screening (EP-13-ST-05 — gated by legal § 1 RDG review).
- Vendor self-service portal.
- Duplicate detection.
- Time-banded Gantt of vendor assignments.
- Resource matching against FTE (PROJ-11 cross-cutting later).
- File upload + scan + preview.
- Document version control beyond external URL versioning.

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
