# MAP — Repository Navigation Index

Authoritative index of every top-level area in V3. Inspired by V2's `MAP.md`, but rewritten for the V3 stack (Next.js + Supabase, single-app monolith) instead of V2's monorepo (FastAPI + Next.js + workers).

Rules:
- Every top-level folder appears here with purpose + entry point.
- New areas register here first, then get populated.
- Individual files are not listed.

## Root files

| File | Purpose |
|---|---|
| [README.md](../README.md) | Project entry point |
| [CLAUDE.md](../CLAUDE.md) | Working protocol for Claude Code (incl. V2 Heritage section) |
| [package.json](../package.json) | Node/Next.js dependencies |
| [tsconfig.json](../tsconfig.json), [next.config.ts](../next.config.ts) | Build config |
| [tailwind.config.ts](../tailwind.config.ts) | Styling config |
| [vitest.config.ts](../vitest.config.ts), [playwright.config.ts](../playwright.config.ts) | Test runners |
| [components.json](../components.json) | shadcn/ui catalog config |

## Application code

| Path | Purpose |
|---|---|
| `src/app/` | Next.js App Router — pages, layouts, route handlers (`/api/*`) |
| `src/app/(auth)/` | Public auth flows (login, signup, forgot-password, reset-password) |
| `src/app/(app)/` | Protected app shell (top nav, dashboard) |
| `src/app/api/` | Custom API route handlers (only where service-role or non-trivial server logic is needed; everything else uses Supabase client SDK directly) |
| `src/components/ui/` | shadcn/ui copy-paste components — never recreated by hand |
| `src/components/` | Project-specific UI components |
| `src/hooks/` | Reusable React hooks (e.g. `use-auth`, `use-tenant-memberships`) |
| `src/lib/supabase/` | Supabase client factories (browser, server, middleware) |
| `src/lib/` | Cross-cutting utilities (`utils.ts`, `auth-helpers.ts`) |
| `src/proxy.ts` | Next 16.2 middleware (renamed from `middleware.ts`); session refresh + auth redirects |
| `src/types/` | Shared TypeScript types |
| `src/test/` | Test scaffolding shared between vitest tests |

## Database & backend

| Path | Purpose |
|---|---|
| `supabase/migrations/` | SQL migrations (RLS policies, tables, functions, triggers) — apply in order |
| `supabase/functions/` | Supabase Edge Functions (Deno + TypeScript) |
| `supabase/config.toml` | Supabase project config |

## Tests

| Path | Purpose |
|---|---|
| Co-located `*.test.ts(x)` next to source | Vitest unit tests (`useHook.test.ts` next to `useHook.ts`) |
| `tests/` | Playwright E2E tests (only created as features need them) |

## Features & specs

| Path | Purpose |
|---|---|
| `features/INDEX.md` | Central tracking of all features (status, ID, spec link) |
| `features/PROJ-X-*.md` | Per-feature specs — one feature, one file, status header, V2 reference material section |
| `features/README.md` | How features are organized |

## Documentation

| Path | Purpose |
|---|---|
| `docs/PRD.md` | Product Requirements Document — vision, roadmap, success metrics |
| `docs/PRODUCT-CONTEXT.md` | Deeper product context (inherited from V2's `planning/CONTEXT.md`) |
| `docs/VISION.md` | Product vision (inherited from V2) |
| `docs/REFERENCES.md` | External frameworks (Scrum, PMI, SAFe, PMBOK) — reference background |
| `docs/GLOSSARY.md` | DE/EN terminology + boundaries (Stakeholder vs User, Core vs Extension) |
| `docs/ROADMAP-PHASES.md` | 6-phase roadmap inherited from V2 |
| `docs/PROJECT-RISKS.md` | Open strategic risks (R1–R10) |
| `docs/EPICS-TO-PROJS.md` | V2 epics → V3 PROJ-X mapping (migration audit trail) |
| `docs/V2-MIGRATION-INVENTORY.md` | What's in V2 — for reference when authoring PROJ-X specs |
| `docs/MAP.md` | This file |
| `docs/architecture/domain-model.md` | Domain model (Project Core + Extensions + Context + AI Proposals + Governance + Output) |
| `docs/architecture/target-picture.md` | Target picture (with V3 stack adaptation note) |
| `docs/architecture/term-boundaries.md` | Wave-1 binding term definitions (Task, Open Item, Decision, Stakeholder) |
| `docs/architecture/module-structure.md` | Suggested technical module structure |
| `docs/decisions/` | 22 inherited V2 ADRs + INDEX |
| `docs/production/` | Production guides (Sentry, security, performance) |

## Claude Code

| Path | Purpose |
|---|---|
| `.claude/rules/{general,frontend,backend,security}.md` | V3-canonical rules |
| `.claude/skills/{requirements,architecture,frontend,backend,qa,deploy,help,init,review,security-review}/SKILL.md` | Skill definitions for the workflow |
| `.claude/skills/<skill>/<extra>.md` | Supplementary V2-derived materials (architecture/coding-standards, qa/bug-analysis, deploy/code-review, requirements/prompt-templates, requirements/story-writing) |
| `.claude/agents/` | Agent personas (V2-derived: software-architect, architecture-review, documentation-writer; plus V3-native frontend-dev, backend-dev, qa-engineer) |
| `.claude/settings.json`, `.claude/settings.local.json` | Tool permissions, hooks |

## What's missing vs. V2 (intentional)

V3 is a single-app stack on Next.js + Supabase. V2's `apps/api/` (FastAPI), `services/orchestrator/`, `services/worker/`, `mcp/`, `packages/`, `db/`, `infra/`, `inbox/`, `references/`, `workspace/`, `build/` either don't exist as separate areas in V3, or moved into the simpler structure above:

- V2 `apps/api/` → V3 `src/app/api/` + `supabase/functions/`
- V2 `services/orchestrator/` → V3 Edge Functions / API routes (deferred, no separate service)
- V2 `services/worker/` → V3 Supabase scheduled jobs / Edge Functions (when needed)
- V2 `db/migrations/` → V3 `supabase/migrations/`
- V2 `mcp/` → V3 not yet introduced; deferred to PROJ-12 (KI-Assistenz)
- V2 `planning/` → V3 `features/` + `docs/`
- V2 `build/` (concept-level) → V3 `docs/architecture/` + per-feature spec sections

V2 code paths are referenced from individual PROJ-X specs (in the **V2 Reference Material** section) so that future architects/engineers can study how V2 implemented a feature before redesigning it for V3.

## Conventions

1. **MAP first** — new top-level areas register here before being populated.
2. **shadcn/ui first** — never recreate components that exist under `src/components/ui/`.
3. **Single-responsibility specs** — one feature per `features/PROJ-X-*.md`.
4. **Multi-tenant invariant** — every new table has `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`. RLS uses helpers from PROJ-1.
5. **No new top-level code areas without updating this file.**
