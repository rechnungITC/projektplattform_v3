# Current Codebase Documentation - 2026-06-04

## Scope

This document describes the current `projektplattform_v3` codebase as inspected
on 2026-06-04 in the local workspace.

Baseline:

- Branch: `proj-70/gamma-cia-patch`
- HEAD: `7025b9d` (`docs(PROJ-70/44): QA-beta + gamma-architecture + PROJ-44 supersession bookkeeping (#89)`)
- GitNexus index after re-analyze: 21,734 nodes, 32,735 edges, 501 clusters, 300 flows
- Repo size snapshot: 1,080 TypeScript/TSX files under `src`, 204 API route files, 57 app pages, 117 Supabase migrations, 193 unit test files
- Working tree caveat: `AGENTS.md`, `CLAUDE.md`, `features/PROJ-70-auto-generated-backlog-from-kickoff.md` and `docs/design/PROJ-65-epsilon3c-beta-bulk-cycle-brief.md` were already dirty or generated during the documentation pass. This document does not normalize or revert those files.

This is a current architecture and module map. It does not replace
`docs/codebase-review-2026-05-28.md`, which remains the quality review log with
test/audit findings.

## Executive Summary

The application is a production-oriented Next.js 16 App Router platform for
AI-assisted project orchestration. Supabase provides authentication,
PostgreSQL persistence, RLS, storage-facing integration points, and SECURITY
DEFINER RPCs for high-integrity operations such as encrypted secret handling,
bulk accept, plan mutation and undo.

The codebase is broadly modular:

- `src/app` owns routes, pages, layouts and API route handlers.
- `src/components` owns the client UI, design-system primitives and domain
  surfaces.
- `src/lib` owns domain services and integrations.
- `supabase/migrations` owns schema, RLS, triggers, indexes and RPCs.
- `tests` and colocated `*.test.ts(x)` files cover API routes, domain modules
  and Playwright flows.

The strongest architecture patterns are:

- tenant-scoped RBAC and project access helpers before domain work;
- Zod request validation at API boundaries;
- explicit module gating via tenant settings;
- server-only credential and AI-provider resolution;
- proposal-first AI writes, where generated content remains reviewable until
  accepted;
- SECURITY DEFINER RPCs for atomic, cross-table mutations that require DB-side
  invariants.

## Runtime Stack

Core runtime:

- Next.js `16.2.6`, React `19`, TypeScript `5`
- Supabase JS/SSR (`@supabase/supabase-js`, `@supabase/ssr`)
- Tailwind CSS, shadcn/Radix primitives, lucide-react icons
- AI SDK providers for Anthropic, OpenAI, Google and OpenAI-compatible local
  providers
- Three.js / React Three Fiber for 3D project graph surfaces
- Vitest for unit tests and Playwright for browser/e2e tests
- Vercel deployment with schema-drift and production smoke workflows in use

Important npm scripts:

```bash
npm run dev
npm run lint
npm run test
npm run build
npm run test:e2e
npm run check:schema-drift
```

`check:schema-drift` needs a `DATABASE_URL` pointing at a freshly migrated
Postgres instance.

## Repository Map

Top-level areas:

- `src/app`: Next.js App Router pages and route handlers.
- `src/app/(app)`: authenticated application shell.
- `src/app/(auth)`: login, signup and auth callback surfaces.
- `src/app/api`: JSON API surface, mostly route-handler based.
- `src/components/app`: application shell, global sidebar, project sidebar,
  tenant switcher and user menu.
- `src/components/projects`: project-room surfaces, graph, AI proposal drawer,
  backlog, releases, budget, stakeholders, risks and decisions UI.
- `src/components/ui`: shadcn/Radix-based design-system primitives.
- `src/hooks`: React client hooks for auth, work items and UI state.
- `src/lib`: domain modules, adapters, server utilities and integration code.
- `src/types`: shared domain types.
- `supabase/migrations`: schema, policies, triggers and RPCs.
- `features`: feature specs and delivery status.
- `docs`: product, architecture, deployment, review and design docs.

High-density `src/lib` modules:

- `ai`, `ai-proposals`, `assistant`, `ki`: AI routing, proposal generation,
  provider selection and assistant surfaces.
- `connectors`, `jira`: connector registry, encrypted tenant credentials and
  outbound Jira export.
- `project-graph`, `plan-mutate`, `project-goals`, `project-releases`:
  trajectory graph and planning controls.
- `work-items`, `project-rules`, `methods`, `method-templates`: work item
  hierarchy, method catalog and validation.
- `risks`, `risk-score`, `risk-links`, `decisions`: governance domain logic.
- `stakeholders`, `stakeholder-*`, `participant-links`, `resources`: people,
  roles, profiles, interactions and capacity/cost links.
- `budget`, `cost`, `role-rates`, `vendors`, `resources`: finance, rates,
  vendor and allocation logic.
- `tenant-settings`, `organization`, `master-data`, `branding`: tenant
  configuration and administration.
- `reports`, `communication`, `comms`, `context-sources`: output, messages and
  source material.

## App Routing And Shell

`src/app/layout.tsx` defines the root shell:

- global metadata,
- theme provider,
- reduced-motion provider,
- toast provider.

`src/app/(app)/layout.tsx` is the authenticated app boundary:

- calls `loadServerAuth()`;
- redirects unauthenticated users to `/login`;
- redirects users without memberships to `/onboarding`;
- resolves active tenant from cookie and memberships;
- loads tenant branding/settings;
- writes tenant brand values as CSS variables;
- wraps children in `AuthProvider` and `AppShell`.

`src/components/app/app-shell.tsx` composes:

- `GlobalSidebar` for global navigation;
- `ProjectSidebar` when the path matches `/projects/[uuid]`;
- `AssistantLauncher` with the current project id when available.

`src/components/app/global-sidebar.tsx` filters navigation by:

- tenant role (`adminOnly`);
- active tenant modules;
- current path for active state.

Main navigation currently covers projects, approvals, master data, connectors,
reports and settings. Settings children include profile, workspace, rates,
FX rates, risk score, AI providers, members and project trash.

## Authentication, Tenant Context And RBAC

The server auth snapshot lives in `src/lib/auth-helpers.ts`.

`loadServerAuth()`:

- reads the Supabase user;
- loads profile and tenant memberships;
- validates the active tenant cookie against memberships;
- resolves tenant base data and `tenant_settings`;
- returns the current tenant config for app initialization.

API route access is standardized in `src/app/api/_lib/route-helpers.ts`.
The important helper pattern is:

- `getAuthenticatedUserId()` for user + Supabase client;
- `requireTenantMember()` for tenant membership;
- `requireTenantAdmin()` for tenant administration;
- `requireProjectAccess()` for view/edit/manage checks on project-scoped
  endpoints.

Cross-tenant and RLS-hidden projects are intentionally surfaced as `404` in
project access flows. Mutation endpoints generally require `edit` or admin
rights, while read endpoints use `view`.

Tenant module gating is handled by `src/lib/tenant-settings/server.ts`.
`requireModuleActive()` returns:

- `404` for disabled read surfaces to avoid existence leaks;
- `403` for disabled write surfaces;
- fail-open only if the tenant settings row is missing, relying on membership
  and RLS as the base guard.

## API Conventions

Project-scoped APIs live under `src/app/api/projects/[id]`.

Common conventions:

- `params` are awaited because the codebase uses App Router route handler
  conventions.
- UUIDs and bodies are validated with Zod.
- errors use `apiError(code, message, status, field?)`.
- route handlers short-circuit on auth and project access before domain work.
- server-side helpers and services live in `src/lib/*` when logic is reusable.
- direct Supabase calls remain in routes only for thin, local CRUD paths.
- mutation-heavy and invariant-heavy operations delegate to RPCs.

Representative API areas:

- projects, transition, members, phases, milestones;
- work-items, dependencies, links, releases, sprints, Gantt state;
- risks, decisions, approvals, budget, cost totals;
- stakeholders, interactions, sentiment, coaching, health;
- AI suggestions, proposal-from-context, resource swap, trajectory sequence,
  cross-project links;
- Jira mapping, preview, export and job log;
- connectors, tenant settings, AI provider keys.

## Data Model And Database Layer

The data model is Supabase/Postgres-first. The schema is evolved via SQL files
under `supabase/migrations`.

Major table families:

- tenant/auth: `tenants`, `tenant_memberships`, `profiles`,
  `tenant_settings`;
- project core: `projects`, `project_memberships`,
  `project_lifecycle_events`, `project_settings`;
- schedule/core planning: `phases`, `milestones`, `sprints`,
  `work_items`, `dependencies`, `project_goals`;
- governance: `risks`, `decisions`, approval tables, risk links;
- people/resources: `stakeholders`, `resources`, `work_item_resources`,
  `stakeholder_profiles`, `stakeholder_interactions`;
- cost/budget: `budget_items`, `budget_postings`, cost lines, rates,
  FX-rate tables;
- AI: `ki_runs`, `ki_suggestions`, tenant AI provider tables;
- connectors: `tenant_secrets`, `external_refs`, `jira_field_mappings`,
  `jira_export_jobs`, `jira_export_log`;
- context/output: `context_sources`, reports/snapshots and communication
  tables.

Key database design choices:

- RLS is the normal access-control boundary.
- Service/admin clients are used only where DB-side functions re-check
  authorization or where system-level work is necessary.
- SECURITY DEFINER RPCs handle encrypted secrets and atomic multi-row
  operations.
- Generated or AI-derived content is stored as suggestion/proposal state until
  accepted.
- Schema drift is checked by the `scripts/check-schema-drift` TypeScript tool
  against `information_schema`.

## AI Architecture

The AI layer is centered in `src/lib/ai`.

Core flow in `src/lib/ai/router.ts`:

1. collect a typed auto-context payload;
2. classify data privacy class;
3. load tenant overrides;
4. resolve a provider for purpose and data class;
5. apply cost caps;
6. insert a `ki_runs` row;
7. call the provider;
8. persist generated `ki_suggestions`;
9. update run status and error/fallback metadata.

Supported purposes include risk, narrative, sentiment, coaching, trajectory
sequence, resource swap, cross-project links and proposal-from-context.

Provider resolution lives in `src/lib/ai/key-resolver.ts`:

- tenant provider keys are decrypted server-side via
  `decrypt_tenant_ai_provider_with_key`;
- provider priority is tenant- and purpose-specific;
- Class-3 data is clamped to local-only providers, currently Ollama;
- external routing can be killed by environment;
- if no valid tenant provider is available, safe fallbacks are used where
  configured.

Provider implementations include:

- Anthropic,
- OpenAI,
- Google,
- Ollama,
- Stub.

The stub provider is not only a test double; it is the safe fallback for blocked
or unavailable external routing.

AI proposal UI is consolidated in
`src/components/projects/ai-proposal-drawer.tsx`.
Current tabs:

- Trajectory,
- Resources,
- Cross-Project,
- Backlog.

Backlog proposal generation is PROJ-70. Backend alpha and beta are implemented:

- `POST /api/projects/[id]/ai/proposal-from-context` creates suggestions from
  a `context_source`;
- `GET /api/projects/[id]/ai/proposal-from-context` lists draft/accepted/rejected
  suggestions;
- `POST /api/projects/[id]/ai/proposal-from-context/accept` calls
  `accept_proposal_from_context_bulk`;
- undo is available via the PROJ-70 undo route/RPC;
- the UI tab uses a generated tree and bulk controls.

## Credential And Secret Handling

Connector and AI credentials are server-only.

`src/lib/connectors/secrets.ts` handles connector secrets:

- `SECRETS_ENCRYPTION_KEY` is required for writes and decrypts;
- encrypt/decrypt uses atomic RPC wrappers;
- plaintext is never stored in regular columns;
- list paths expose only metadata and credential source.

Important RPCs:

- `encrypt_tenant_secret_with_key`
- `decrypt_tenant_secret_with_key`
- `decrypt_tenant_ai_provider_with_key`

The older two-step GUC binding approach is no longer used for these paths
because separate PostgREST RPC requests cannot share a transaction-local GUC.

## Connector Framework

The connector registry lives in `src/lib/connectors`.

`descriptors.ts` declares known connectors:

- Email/Resend,
- Anthropic,
- Slack,
- Microsoft Teams,
- Jira,
- MCP bridge.

`registry.ts` builds tenant runtime status without decrypting credentials in
the list path. Detail/test paths decrypt only when required.

Connector statuses distinguish:

- adapter ready and configured,
- adapter ready but unconfigured,
- adapter missing,
- error.

The UI surface is `/konnektoren`, restricted to tenant admins through the
navigation and route layer.

## Jira Export Connector

PROJ-47 is implemented as an outbound Jira export MVP. It is not the
bidirectional Jira sync; inbound webhooks and conflict handling remain PROJ-50.

Relevant modules:

- `src/lib/jira/client.ts`: Jira REST client, credential schema, sanitized
  errors, issue create/update, transitions, assignable users and assignee PUT.
- `src/lib/jira/resolver.ts`: transition and assignee resolution.
- `src/lib/jira/mapping.ts`: field mapping defaults and validation.
- `src/lib/jira/export-service.ts`: preview and export job orchestration.
- `src/app/api/projects/[id]/jira/*`: mapping, preview, export and job-log
  routes.

Current capabilities:

- tenant-scoped Jira credentials via connector secrets;
- connection health through Jira `/rest/api/3/myself`;
- per-project field mapping;
- preview for selected work items;
- create/update Jira issues;
- idempotency via `external_refs`;
- status transition lookup and application;
- assignable-user lookup and assignment by account id;
- export job row, per-item log rows, sanitized error storage;
- job readback endpoint.

Current API routes:

- `GET/PUT /api/projects/[id]/jira/mapping`
- `POST /api/projects/[id]/jira/export/preview`
- `POST /api/projects/[id]/jira/export`
- `GET /api/projects/[id]/jira/export/jobs/[jobId]`

Security posture:

- preview/export require project edit access and tenant admin;
- job readback requires project view access;
- credentials are read server-side only;
- error messages are sanitized before persistence/response.

Open quality gap:

- a dedicated Playwright authenticated Jira mock happy-path remains deferred.
  Unit/domain tests cover the important resolver and service logic; browser
  coverage for the complete dialog flow is still the missing layer.

## Project Core And Work Items

Project CRUD lives under `src/app/api/projects` and project pages under
`src/app/(app)/projects`.

Key concepts:

- lifecycle state is separated from ordinary project metadata;
- project method is immutable after initial set, enforced by trigger/route
  behavior;
- soft delete and hard delete are separate paths;
- project members and tenant memberships are separate role layers.

Work-item architecture:

- a polymorphic work item metamodel supports epics, stories, tasks, bugs,
  work packages, todos and method-specific structures;
- parent/child rules are method-aware;
- dependencies are polymorphic and feed both Gantt and graph surfaces;
- sprint assignment, release assignment, hierarchy drag-and-drop and WBS
  display are split into targeted modules and route handlers;
- cost, resource and stakeholder assignments attach to work items without
  turning the work item table into a catch-all.

## Project Graph And Trajectory

The project graph backend lives in `src/lib/project-graph`.

`resolveProjectGraph()` returns a library-agnostic snapshot:

- nodes for project, phases, milestones, work items, risks, decisions,
  stakeholders, budget and recommendations;
- edges for belongs-to, dependencies, blockers, influence, cost and
  stakeholder requirements;
- counts by node and edge kind;
- optional trajectory extension when the API receives `?include=trajectory`.

`GET /api/projects/[id]/graph` handles access and calls the aggregator.

Trajectory extension fields include:

- layout hints;
- sprint and epic structure;
- compliance lanes;
- cost lane items;
- project goals;
- node assignees;
- cost-clear-view and plan-mutate permissions;
- per-project trajectory settings.

The frontend includes 2D and 3D graph surfaces, with Three.js/R3F used for the
3D view and SVG/standard UI used as fallback or detail surfaces.

## Plan Mutate And Undo

Plan mutation is implemented through API wrappers over DB RPCs:

- `POST /api/projects/[id]/plan-mutate`
- `POST /api/projects/[id]/plan-mutate/undo`

The route accepts:

- legacy single-source body;
- bulk body with up to 50 sprint/phase sources.

The route calls:

- `plan_mutate_atomic`,
- `plan_mutate_atomic_bulk`,
- `plan_mutate_undo_atomic`.

The RPC envelope supports:

- success diff;
- conflict information with current snapshot hints;
- cycle detection with path and optional source attribution;
- missing source locks;
- HTTP status mapping for 409/422/500-style responses.

This is an important invariant boundary: drag/shift UI can be optimistic, but
the database owns the atomic commit, conflict detection and undo semantics.

## Stakeholders, Resources And Cost

Stakeholder and resource logic is spread across focused modules:

- stakeholder master data and project stakeholders;
- qualitative stakeholder profiles, skills and personality/personality-like
  fields;
- interactions, sentiment review and coaching recommendations;
- resource records, work-item resource assignments and allocation percent;
- role rates, resource override rates, cost lines and budget summaries.

Important design choices:

- stakeholders, tenant members and resources are distinct concepts;
- Class-3 cost and person-related data is masked or gated where required;
- critical path and stakeholder health calculations are derived signals, not
  direct user-maintained truth;
- budget/cost summaries are derived through route/service layers.

## Risks, Decisions, Approvals And Reports

Governance modules include:

- project risks and risk score logic;
- decisions and decision revision state;
- formal approval routes;
- open items and conversion flows;
- project readiness and health summary;
- report snapshots and PDF rendering.

AI-generated risks and narrative/status material enter through proposal or
snapshot preview flows rather than silently mutating approved state.

## Communication And Assistant

The communication surface includes:

- outbox routes and send endpoints;
- email/Slack/Teams adapter framing, with some connectors still stubbed;
- internal project chat API.

The assistant surface is integrated into the app shell through
`AssistantLauncher`. The assistant stack spans voice/text entry points,
intent runtime, audit/transcript governance and action packs. It relies on the
same auth, project access and API flows instead of creating a parallel
permission model.

## Frontend Conventions

Frontend conventions observed in current code:

- App Router server layouts perform auth and tenant bootstrapping.
- Domain pages tend to use server boundaries for initial access and client
  components for interactive work.
- shadcn/Radix primitives are the base component vocabulary.
- lucide-react provides icons.
- Sonner is used for toast feedback.
- React Hook Form and Zod are common in form-heavy surfaces.
- Client data flows commonly use small wrapper functions in `src/lib/*` or
  colocated hooks rather than embedding fetch logic deeply in UI controls.
- Navigation and module visibility are filtered by tenant role and active
  module config.

Design-system notes:

- `docs/design/design-system.md` remains the primary design reference.
- Current UI leans toward dense operational PM surfaces rather than landing-page
  composition.
- Graph and planning surfaces intentionally use stable dimensions and explicit
  mode controls.

## Testing And QA

Primary test layers:

- Vitest for route handlers, domain services, resolver logic and helper
  functions.
- Playwright for authenticated and unauthenticated browser flows.
- Schema drift guard for `.from(...).select(...)` calls against the database
  schema.
- Build/lint gates for Next.js and TypeScript correctness.

Recent documented quality baseline from `docs/codebase-review-2026-05-28.md`:

- unit tests were green at the time of the review and later PROJ-47/PROJ-70
  updates continued to report green targeted/full unit runs in feature docs;
- lint generally runs with zero errors;
- build generally succeeds;
- full local e2e can still be environment-sensitive, especially WebKit/mobile
  dependencies and visual baselines;
- local schema drift requires an explicit `DATABASE_URL`.

For current changes, use this normal sequence:

```bash
npm run lint
npm run test
npm run build
npm run check:schema-drift
```

For UI or interaction-heavy changes, add:

```bash
npm run test:e2e -- --project=chromium
```

## Deployment And Operations

Production deployment is Vercel-based. The repo contains deployment runbooks
under `docs/production` and `docs/deployment`.

Operational dependencies:

- Supabase project and service role credentials;
- `SECRETS_ENCRYPTION_KEY` for encrypted connector and AI provider secrets;
- provider-specific AI credentials when external providers are enabled;
- Vercel environment variables;
- optional email/connector credentials.

Operational checks:

- schema drift check before merge/deploy;
- Vercel preview/production deploy status;
- authenticated-route smoke through expected 307 redirects;
- route-specific smoke where practical;
- production DB migrations applied and verified before relying on new RPCs.

## Current Feature State Highlights

Feature index highlights from `features/INDEX.md`:

- PROJ-47 Jira Export Connector: `Approved`; outbound MVP implemented,
  deployed through backend/frontend/QA slices, Playwright Jira mock flow still
  deferred.
- PROJ-65 Project Trajectory Graph & Decision Steering: deployed across its
  major phases, with ongoing design docs for epsilon follow-up work present.
- PROJ-67 Codebase Review Quality Hardening: still in progress; some lint
  disable audit work is complete, several QA infrastructure items remain.
- PROJ-69 DB Index Audit: in progress after triage; index migrations are the
  next real DB-change step.
- PROJ-70 Auto-Generated Backlog from Project Kickoff: alpha and beta are
  deployed/approved; gamma is architected around uploads and context-source
  handling; delta/epsilon remain planned.

## Known Risks And Open Follow-ups

1. GitNexus query FTS issue

   `gitnexus query` emitted read-only FTS warnings during this documentation
   pass. `gitnexus analyze` worked and refreshed the index, but concept-query
   search may be unreliable until the local FTS index issue is fixed.

2. Dirty workspace state

   The documentation pass ran on a non-clean branch. Existing PROJ-70 and
   PROJ-65 files were not reverted. AGENTS/CLAUDE metadata changed during
   GitNexus reindexing.

3. E2E completeness

   Unit/domain coverage is strong, but some complete browser happy paths remain
   deferred, especially the Jira mock dialog flow.

4. Schema drift local reproducibility

   The schema drift check is reliable when a proper `DATABASE_URL` is present,
   but local self-contained execution is not automatic.

5. Dependency and browser infra hygiene

   Earlier review notes still apply: dependency audit items and Playwright
   browser dependencies should be handled deliberately, not through blind
   upgrade/fix commands.

6. AI provider correctness relies on env and tenant config

   The router is defensive, but real external-provider behavior depends on
   configured tenant provider rows, encrypted secret RPCs, cost caps and
   environment kill switches.

## Maintenance Guidance

When modifying production code:

- follow the AGENTS.md GitNexus rule set;
- run impact analysis before editing symbols;
- keep changes scoped to the feature/spec being handled;
- add route/domain tests for backend behavior;
- add Playwright coverage for complete user flows when UI state, auth, dialogs
  or drag/drop behavior changes;
- run `gitnexus detect-changes --scope staged` before committing;
- do not commit unrelated dirty files unless they are part of the task.

When adding a new feature:

- create or update the feature spec in `features/`;
- update `features/INDEX.md`;
- document architecture decisions in `docs/decisions` or `docs/design` when
  the change affects module boundaries, security or UX patterns;
- prefer existing domain modules and route-helper patterns over new ad hoc
  infrastructure.

