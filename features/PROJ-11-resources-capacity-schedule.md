# PROJ-11: Resources, Capacities, and Schedule Logic

## Status: Planned
**Created:** 2026-04-25
**Last Updated:** 2026-04-25

## Summary
Promotes stakeholders into plannable resources, captures FTE and availability, and exposes a tenant-wide utilization report so PMOs can spot overbooking. Personal data → class-3 → local LLM only. Inherits V2 EP-09.

## Dependencies
- Requires: PROJ-1 (Auth, Tenants, Roles)
- Requires: PROJ-8 (Stakeholders) — resources derive from stakeholders
- Requires: PROJ-9 (Work Items) — resources assign to tasks/work_packages
- Requires: PROJ-7 (Gantt) — resource bars overlay schedule
- Requires: PROJ-12 (KI privacy) — class-3 enforcement

## V2 Reference Material
- **Epic file:** `~/projects/Projeketplattform_v2_D.U/planning/epics/ep-09-ressourcen-kapazitaeten-terminlogik.md`
- **Stories:** `~/projects/Projeketplattform_v2_D.U/planning/stories/ep-09.md` (ST-01 derive resources from stakeholders, ST-02 manual FTE/availability, ST-03 utilization report cross-projects)
- **ADRs:** `docs/decisions/data-privacy-classification.md`
- **V2 code paths to study during /architecture and /backend:**
  - `apps/api/src/projektplattform_api/domain/core/resources/` (V2 placeholder; resource model not implemented in V2 either)
  - `apps/api/src/projektplattform_api/services/utilization.py` (planned in V2 docs)

## User Stories
- **[V2 EP-09-ST-01]** As a project lead, I want to convert a stakeholder into a resource so I can plan that person/party.
- **[V2 EP-09-ST-02]** As a project lead, I want to manually capture FTE and availability so I can plan capacity at a coarse level.
- **[V2 EP-09-ST-03]** As a PMO or tenant admin, I want a tenant-wide utilization report aggregating FTE × project share by time bucket so I see overbooking before it bites.

## Acceptance Criteria

### Resource derivation
- [ ] Table `resources`: `id, tenant_id, project_id, stakeholder_id (FK stakeholders), kind (internal|external), fte_default (decimal 0.0–1.0), availability_default (decimal 0.0–1.0), is_active, created_at, updated_at`.
- [ ] A "Promote to resource" button on a stakeholder creates the row.
- [ ] Stakeholder ↔ resource link preserved bidirectionally.
- [ ] Resources can be assigned to work_items via a `work_item_resources` join table (`work_item_id, resource_id, allocation_pct`).

### Manual FTE/availability
- [ ] Per resource, FTE (e.g. 0.8 = 80%) and availability (e.g. 0.5 = 50% available) are editable.
- [ ] Optional time-segmented availability via `resource_availabilities` (`resource_id, start_date, end_date, fte`).
- [ ] Edits audited (PROJ-10).

### Cross-project utilization report
- [ ] `/reports/utilization` (admin/PMO).
- [ ] Aggregates: `resource_id × time_bucket → SUM(fte × allocation × overlap_days / bucket_days)`.
- [ ] Buckets: weekly, monthly, quarterly (UI toggle).
- [ ] Heat coloring: yellow >90%, red >100%.
- [ ] Filters: role, org unit, time range, internal/external.
- [ ] CSV export.
- [ ] Class-3 gating: external AI calls on resource data are blocked (per PROJ-12).

## Edge Cases
- **Resource derived from a stakeholder that's been deactivated** → resource auto-marked inactive.
- **Project with overlapping work_item allocations summing >1.0 for one resource** → utilization shows red; nothing prevents the over-allocation by design (UI warns).
- **Resource shared across tenants** → impossible by RLS (tenant_id NOT NULL).
- **Time segments overlapping** → last-saved wins for the overlap; audit logs both.
- **Bucket boundary partial overlap (e.g. project starts mid-week)** → pro-rata day-weighted (per V2 EP-09-ST-03 DoR).

## Technical Requirements
- **Stack:** Next.js 16 + Supabase.
- **Multi-tenant:** `resources`, `resource_availabilities`, `work_item_resources` MUST have `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`. RLS: project members for project-scoped tables, tenant admins/PMOs for tenant-wide reports.
- **Validation:** Zod (FTE 0.0–1.0, allocation 0–100%, dates).
- **Auth:** Supabase Auth + project/tenant roles.
- **Privacy:** All resource fields linked to a person are class-3 (per PROJ-12).
- **Performance:** Index on `(tenant_id, resource_id, start_date)` for time-bucket queries.

## Out of Scope (deferred or explicit non-goals)
- Calendar integration (Google/Outlook).
- Auto-detection of overbooking conflicts.
- Capacity optimization / re-allocation.
- Time tracking.

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
