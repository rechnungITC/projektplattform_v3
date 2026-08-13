# Projektplattform V3

Projektplattform V3 is a multi-tenant, AI-supported project orchestration platform for enterprise projects. It combines a shared project core with extensions for ERP, construction, software delivery, and M&A/deal lifecycles.

The product is designed for the seams between execution, governance, and communication: structured planning, risks, decisions, approvals, stakeholders, documents, reporting, and reviewable AI proposals live in one auditable system.

> This repository contains a live product backed by a production Supabase database and more than 200 append-only migrations. It is not a starter template. Treat every database and authorization change as potentially affecting real tenant data.

## Start here

| If you need to… | Read… |
|---|---|
| Understand the product and roadmap | [`docs/PRD.md`](docs/PRD.md) |
| See feature status and the next available ID | [`features/INDEX.md`](features/INDEX.md) |
| Check MVP cuts and deferred follow-ups | [`features/OPEN-DEFERRED-STATUS.md`](features/OPEN-DEFERRED-STATUS.md) |
| Navigate the repository | [`docs/MAP.md`](docs/MAP.md) |
| Understand domain terms and boundaries | [`docs/GLOSSARY.md`](docs/GLOSSARY.md) and [`docs/architecture/`](docs/architecture/) |
| Review architecture decisions | [`docs/decisions/INDEX.md`](docs/decisions/INDEX.md) |
| Work on the codebase | [`CLAUDE.md`](CLAUDE.md) (`AGENTS.md` is its symlink) |
| Prepare or operate a deployment | [`docs/production/`](docs/production/) and [`docs/deployment/`](docs/deployment/) |

The feature index and the individual `features/PROJ-X-*.md` specifications are the delivery source of truth. Do not infer completeness from filenames, commit counts, or a legacy `Deployed` label.

## Tech stack

- Next.js 16 App Router, React 19, and TypeScript
- Tailwind CSS and shadcn/ui
- Supabase PostgreSQL, Auth, Storage, and row-level security
- Vercel AI SDK v6 with Anthropic, OpenAI, Google, Azure, and Ollama providers
- Zod 4 and react-hook-form
- Vitest and Playwright
- Vercel deployment and EU-region Sentry monitoring

Supabase is the system of record and is not optional. Node.js `>=22.13.0` is supported; development, CI, and production are pinned to Node 24 via `.nvmrc`.

## Local setup

Run the project inside WSL/Linux. Do not run Windows npm against the `\\wsl.localhost\...` path: it can use the wrong working directory and install Windows-native artifacts into Linux `node_modules`.

```bash
cd /home/sven/projects/projektplattform_v3
nvm use
npm install
npx playwright install chromium
cp .env.local.example .env.local
```

Configure at least these variables in `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

The service-role key is a server secret. Never commit it, log it, expose it through a `NEXT_PUBLIC_` variable, or use it as a substitute for the session-bound client in normal project routes. Optional AI, connector, email, approval-link, Sentry, and deployment-mode settings are documented in [`.env.local.example`](.env.local.example).

Start the application:

```bash
npm run dev
```

Then open <http://localhost:3000>. Access to useful data requires a Supabase project and a valid tenant membership.

## Development workflow and skills

Feature work follows six ordered stages. Each stage has a repository skill under `.claude/skills/`; read the corresponding `SKILL.md` and follow its checklist.

| Stage | Skill | Outcome |
|---|---|---|
| 1. Requirements | `/requirements` | Feature specification, user stories, acceptance criteria |
| 2. Architecture | `/architecture` | PM-friendly technical design in the feature spec |
| 3. Frontend | `/frontend` | UI built with existing shadcn/ui primitives first |
| 4. Backend | `/backend` | APIs, migrations, RPCs, and RLS policies |
| 5. QA | `/qa` | Acceptance-criteria validation, regression tests, security audit |
| 6. Deploy | `/deploy` | Production checks, deployment evidence, status bookkeeping |

Supporting skills:

- `/help` assesses the repository state and recommends the next workflow step.
- `/designer` prepares focused design work where the feature workflow calls for it.
- `/continuous-improvement` reviews larger refactors, architecture choices, new technologies, technical debt, agent changes, and product/MVP gaps.
- `.claude/skills/gitnexus/` documents code exploration, impact analysis, debugging, refactoring, and index maintenance.

Stages are not optional or reorderable. Large features ship as named lettered slices, with each slice carried through build, QA, and deployment. Human approval checkpoints remain part of every workflow.

### Before editing code

1. Read `docs/PRD.md`, the relevant rows in `features/INDEX.md`, and `features/OPEN-DEFERRED-STATUS.md`.
2. Read the feature specification and relevant ADRs/architecture documents.
3. Use GitNexus to explore unfamiliar flows.
4. Run upstream impact analysis before modifying a function, class, or method.
5. Warn before proceeding when the impact risk is high or critical.

Before committing, run GitNexus change detection against `main` and verify that only the expected symbols and execution flows changed. Full GitNexus instructions live in [`CLAUDE.md`](CLAUDE.md) and [`.claude/skills/gitnexus/`](.claude/skills/gitnexus/).

## Repository structure

```text
src/
  app/                    Next.js pages, layouts, and API routes
  components/ui/          Installed shadcn/ui primitives
  components/             Product UI components
  hooks/                  Reusable React hooks
  lib/                    Domain modules and integrations
  types/                  Shared TypeScript types
features/
  INDEX.md                Feature lifecycle and deployment scope
  OPEN-DEFERRED-STATUS.md Deferred requirements and MVP cuts
  PROJ-X-*.md             Feature specifications and evidence
supabase/
  migrations/             Append-only schema, RLS, triggers, and RPCs
  functions/              Supabase Edge Functions
tests/
  PROJ-X-*.spec.ts        Playwright end-to-end tests
  sql/                    Live RLS/RPC pentests
docs/
  architecture/           Domain model and target architecture
  decisions/              Architecture decision records
  production/             Production and operational guides
.claude/
  skills/                 Invocable development workflows
  rules/                  Context-specific engineering rules
  agents/                 Specialized agent definitions
```

See [`docs/MAP.md`](docs/MAP.md) for the expanded navigation index.

## Quality checks

Run checks in proportion to the change. Before opening a PR, run all relevant required-check equivalents:

```bash
npm run lint
npm test
npm run build
npm run audit:prod
npm run check:migration-naming
npm run check:index-scope
npm run check:schema-drift
```

Additional test commands:

```bash
npm run test:e2e
npm run test:e2e:fresh
npm run test:all
```

`check:schema-drift` needs Docker and a database connection; see [`docs/production/schema-drift-local.md`](docs/production/schema-drift-local.md). New `SECURITY DEFINER` RPCs also require a real call against the live database plus negative authorization probes before a feature can reach `Approved`.

## Safety and architecture invariants

- Every tenant-owned table includes `tenant_id` and enforces tenant isolation through RLS.
- Sensitive project objects also honor the need-to-know confidentiality layer; aggregate RPCs must not bypass its RLS gates.
- AI proposes changes; it never silently mutates business data. Proposals retain source traceability, model identity, and review state.
- Class-3 personal data is blocked from external providers except for the narrowly attested tenant-owned EU Azure path defined by PROJ-93.
- Stakeholder domain identities and authenticated users are separate concepts.
- Decisions are immutable; revisions supersede prior decisions.
- Database migrations are append-only. Fix forward and never edit a migration already applied to production.
- Project routes use `requireProjectAccess` and a session-bound Supabase client. Service-role access must not bypass project authorization or RLS.

The authoritative details and incident-derived database conventions are in [`CLAUDE.md`](CLAUDE.md).

## Parallel sessions

Only one agent session may use the primary checkout. Every additional concurrent session must work in a separate worktree outside this repository:

```bash
git worktree add ../projektplattform_v3-my-topic -b my-topic origin/main
```

Check `git worktree list` before starting. Never switch branches in another session's checkout, and never place a worktree under this repository because lint and test globs may pick it up.

## Deployment

`main` deploys to Vercel. Production changes must pass the enrolled GitHub checks and the feature's QA gate before deployment. Database changes are forward-only and require migration naming, fresh-replay, authorization, and live RPC verification appropriate to their risk.

Use the `/deploy` skill for the current release workflow. The operational references are:

- [`docs/production/`](docs/production/) for Vercel, Sentry, security, performance, and schema-drift guidance
- [`docs/deployment/`](docs/deployment/) for standalone operation, updates, backup/restore, and Ollama hardening

After deployment, update and re-read the feature index, feature specification, and deferred-status register so lifecycle status, deployment scope, acceptance evidence, and omissions match reality.
