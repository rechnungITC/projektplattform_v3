# PROJ-3: Tenant Operations and Deployment Modes (Stand-alone vs SaaS)

## Status: Planned
**Created:** 2026-04-25
**Last Updated:** 2026-04-25

## Summary
Defines the operational dimension of the platform: how it runs as multi-tenant SaaS today (V3 default), how an enterprise customer can run it stand-alone on their own infrastructure later, and how updates/backups/restores work. Inherits V2 EP-01 (Mandanten-/Betriebsarchitektur), with PROJ-1 already covering the multi-tenant data model and tenant isolation. PROJ-3 covers what's left: stand-alone operation mode and the update/operations strategy.

## Dependencies
- Requires: PROJ-1 (Auth, Tenants, Roles) — for the tenant + RLS foundation
- Requires: PROJ-2 (Project CRUD) — to verify isolation across all tenant-scoped tables
- Influences: PROJ-12 (KI-Assistenz) — stand-alone instances must support local LLM models
- Influences: PROJ-14 (Integrations) — connectors must work in stand-alone

## V2 Reference Material
- **Epic file:** `~/projects/Projeketplattform_v2_D.U/planning/epics/ep-01-mandanten-und-betriebsarchitektur.md`
- **Stories:** `~/projects/Projeketplattform_v2_D.U/planning/stories/ep-01.md` (ST-03 stand-alone mode, ST-04 update/operations strategy)
- **ADRs:** `docs/decisions/deployment-modes.md`, `docs/decisions/architecture-decisions-table.md`
- **V2 code paths to study during /architecture and /backend:**
  - `infra/` (V2's Docker Compose, S3 config, monitoring scripts) — for inspiration; V3 does not need most of this
  - `apps/api/src/projektplattform_api/config.py` — `PPV2_MODE=shared|standalone` env switch
  - `db/migrations/versions/` — Alembic upgrade/downgrade pattern (V3 uses Supabase migrations)

## User Stories
- **[V2 EP-01-ST-03]** As an enterprise customer, I want to run the platform on my own infrastructure (own server, VPS, or own cloud) so that I can meet regulatory and organizational requirements.
- **[V2 EP-01-ST-04]** As an operator, I want a defined update and operations strategy for stand-alone instances so that enterprise installations stay maintainable.

## Acceptance Criteria

### Stand-alone mode definition
- [ ] A stand-alone deployment guide exists (in `docs/deployment/`) describing: which Supabase setup (self-hosted Supabase) is supported, environment variables required, migration apply order, edge function deployment.
- [ ] Stand-alone runs with one tenant (`tenants` row count = 1) and the same codebase as the SaaS deployment — no V3 code branches.
- [ ] Cross-tenant UI affordances (tenant switcher) gracefully collapse when only one tenant exists.
- [ ] Differences vs. SaaS are documented for: authentication (self-hosted Supabase vs hosted), updates, monitoring, and configuration.
- [ ] Local LLM models are listed as a supported AI provider path for stand-alone (see PROJ-12).

### Update strategy
- [ ] An ordered update procedure is documented: (1) apply Supabase migrations, (2) deploy Edge Functions, (3) deploy Next.js app (Vercel or self-host), (4) flip feature flags as needed.
- [ ] Migrations are designed to be backward-compatible (rolling deploy works: old code with new schema).
- [ ] Rollback is possible: each migration has a documented down-step or recovery procedure; previous Vercel/Next.js build is one click away.
- [ ] Backups: daily Postgres backup is documented (Supabase managed) or scripted (self-hosted); object storage (Supabase Storage) versioning enabled.
- [ ] Recovery procedure is documented: cold-restore from latest backup, point-in-time recovery via WAL where available.

## Edge Cases
- **Multi-tenant isolation must hold in stand-alone mode** — tests written for SaaS isolation (cross-tenant 404, RLS denial) must continue to pass with one tenant.
- **Migration drift** — applying migrations out of order corrupts state. Document a sanity check: "all migrations from this commit's `supabase/migrations/` must be applied before deploying this app version."
- **Stand-alone customer wants no external AI** — `EXTERNAL_AI_DISABLED=true` env var that hard-blocks all external LLM calls (defense in depth on top of the class-3 block from PROJ-12).
- **SaaS instance with one tenant (yet)** — must not differ from a real stand-alone (config flag is the only difference).
- **Restore at PITR overwrites recent data** — operator confirmation step required; document the data-loss window.

## Technical Requirements
- **Stack:** Next.js 16 + Supabase (Postgres + Auth + RLS + Edge Functions + Storage). NOT FastAPI.
- **Multi-tenant:** Already enforced by PROJ-1; PROJ-3 only affects deployment topology, not schema.
- **Validation:** N/A (this PROJ produces docs + ops scripts, not API endpoints).
- **Auth:** Same Supabase Auth; in stand-alone, the customer can disable email/password and configure their own provider.
- **Config switch:** `OPERATION_MODE=shared|standalone` env var, read at app boot. UI hides cross-tenant affordances when standalone.
- **Backups:** Supabase managed when SaaS; self-hosted documents `pg_basebackup` + WAL archive flow.
- **Observability:** Sentry (already in V3 setup), structured logging in Edge Functions and route handlers.

## Out of Scope (deferred or explicit non-goals)
- A productized one-click stand-alone installer.
- Automated migration tool between SaaS and stand-alone (a tenant stays in their mode).
- Hot-standby / streaming replication.
- Auto-scaling, SLA tiers, or managed monitoring stack.

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
