# Projektplattform V3

> **`AGENTS.md` is a symlink to this file** — one canonical set of instructions for every tool, so the two
> cannot drift (they did once). Edit `CLAUDE.md`; `AGENTS.md` follows automatically.
> If a tool ever replaces the symlink with a regular file, restore it with `ln -sf CLAUDE.md AGENTS.md`.
>
> Because this file is also served as `AGENTS.md`, keep it tool-agnostic: Claude-Code-specific mechanics
> (`@`-imports, slash commands, sub-agents) always carry a plain-path or plain-prose equivalent alongside.

> A multi-tenant, AI-supported **project orchestration platform** (ERP · construction · software · M&A deal lifecycle),
> built with an AI-driven development workflow. See `docs/PRD.md` for the product thesis.
>
> This is a live product with ~190 migrations in production — not a template. Treat every change as
> touching real tenant data.

## Tech Stack

- **Runtime:** Node.js — `engines: >=22.13.0`, CI + `.nvmrc` pin **24** (matches Vercel prod). Keep the lower bound and the pin distinct.
- **Framework:** Next.js 16 (App Router), React 19, TypeScript
- **Styling:** Tailwind CSS + shadcn/ui (copy-paste components)
- **Backend:** Supabase (PostgreSQL + Auth + Storage + RLS) — **not** optional; it is the system of record
- **AI:** Vercel AI SDK v6, multi-provider (`anthropic` · `openai` · `google` · `azure` · `ollama`), tenant-supplied keys
- **Deployment:** Vercel (auto-deploy from `main`) + Sentry (EU region)
- **Validation:** Zod 4 + react-hook-form
- **State:** React useState / Context API — no global store
- **Tests:** Vitest (unit/integration) + Playwright (E2E) + live SQL pentests

The stack is fixed. Adding a dependency requires a Continuous Improvement Agent review (see below).

## Project Structure

```
src/
  app/              Pages + API routes (Next.js App Router)
  components/
    ui/             shadcn/ui components (NEVER recreate these)
  hooks/            Custom React hooks (useX → {data, loading, error, refresh, ...mutators})
  lib/              Domain modules — one folder per bounded concern
    ai/             Multi-provider router, key-resolver, Class-3 gate
    dms/            Document tree + storage (PROJ-79)
    ma-project/     M&A extension (PROJ-94ff)
    method-templates/  Project-Room nav registry — frequent merge hotspot
    skills/         Skill framework (PROJ-76/77)
  types/            Shared TypeScript types
features/           Feature specifications (PROJ-X-name.md)
  INDEX.md          Feature status overview — read first, update last
  OPEN-DEFERRED-STATUS.md   Deferred follow-ups and MVP cuts
supabase/
  migrations/       ~190 applied migrations — append-only, never edit a shipped file
tests/              Playwright E2E specs (PROJ-X-*.spec.ts)
  sql/              Live RLS/RPC pentests (PROJ-X-*-pentest.sql)
scripts/            check-schema-drift · check-migration-naming · e2e-fresh
docs/
  PRD.md            Product Requirements Document
  decisions/        ADRs (35 records, see decisions/INDEX.md)
  architecture/     Domain model, term boundaries, target picture
  production/       Production guides (Sentry, security, performance)
```

## Development Workflow

Work moves through six stages. In Claude Code each is the slash command shown below, backed by a skill in
`.claude/skills/`; other tools should follow the same sequence manually and read that skill file for the
stage's checklist.

1. `/requirements` — create the feature spec from an idea
2. `/architecture` — design the tech architecture (PM-friendly, no code)
3. `/frontend` — build UI components (shadcn/ui first!)
4. `/backend` — build APIs, database, RLS policies
5. `/qa` — test against acceptance criteria + security audit
6. `/deploy` — deploy to Vercel + production-ready checks

Stages are not optional and not reorderable: a feature reaches `Deployed` only after QA passes with no
critical/high findings. `/continuous-improvement` runs alongside these — see the CIA section below for
when it is mandatory.

Large features ship as lettered sub-slices (α, β, γ, …), each carried through the full
build → QA → deploy chain rather than merged as one block.

## Feature Tracking

All features tracked in `features/INDEX.md`. Every skill reads it at start and updates it when done. Feature specs live in `features/PROJ-X-name.md`.

Lifecycle statuses: **Planned → Architected → In Progress → In Review → Approved → Deployed.**
`Superseded` is an additional terminal status for a feature that is intentionally replaced and was not
deployed as its own feature.

Deployment scope is mandatory and orthogonal to lifecycle status. Use exactly one of:
**`full` | `mvp` | `alpha` | `tooling-only` | `superseded`**.

- Before production deployment, deployment scope is empty (`—`).
- `Deployed` requires `full`, `mvp`, `alpha`, or `tooling-only`.
- `Superseded` requires `superseded`; never combine `Deployed` with `superseded`.
- `full` means every current in-scope acceptance criterion and the Definition of Done are satisfied.
  Separate later enhancements may remain open, but no deferred original acceptance criterion may.
- `mvp` means an explicitly approved usable MVP boundary was deployed. Every omitted original
  requirement is named and tracked as a follow-up.
- `alpha` means a named sub-slice with its own acceptance criteria, QA, and deployment evidence was
  deployed; remaining slices are listed explicitly.
- `tooling-only` means the delivered outcome affects repository tooling, CI, tests, or workflow and adds
  no product runtime capability.
- `superseded` means the replacement feature is named and every original acceptance criterion is mapped
  to absorbed, rejected, or follow-up work. It does not claim an implementation of the superseded feature.

At deployment or supersession, update and then re-read all applicable sources of truth:

1. `features/INDEX.md`: lifecycle status and deployment scope as separate columns/fields.
2. The feature spec: matching `## Status: ...` and `## Deployment Scope: ...` headers,
   acceptance-criteria evidence, QA/deployment evidence,
   deviations, and the exact delivered boundary.
3. `features/OPEN-DEFERRED-STATUS.md`: every accepted omission from an original requirement, with its
   source acceptance criterion and target follow-up ID.

Never infer deployment scope from the word `Deployed`, commit count, file-name matches, or an auth-gate
smoke alone. Classify it from the delivered behavior and evidence. Scope upgrades such as
`alpha → mvp → full` require a new QA/deployment pass; retain the earlier slice history in the spec.
Legacy entries are not auto-classified from their old `Deployed` label. Migrate them in an evidence-based
portfolio audit; until that audit is complete, any feature whose lifecycle status changes must receive an
explicit scope, and the INDEX schema must be upgraded before recording the change.
Follow-ups deferred out of a slice are registered as `PROJ-Y-<id>` and tracked in
`features/OPEN-DEFERRED-STATUS.md`. Keep the INDEX row, the spec header, and reality in sync —
a row claiming "Deployed" for work that was actually deferred is a bug in its own right (PROJ-141-γ1).

## Key Conventions

- **Feature IDs:** PROJ-1, PROJ-2, etc. (sequential — see "Next Available ID" at the bottom of INDEX.md)
- **Commits:** `feat(PROJ-X): description`, `fix(PROJ-X): description`
- **Single Responsibility:** One feature per spec file
- **shadcn/ui first:** NEVER create custom versions of installed shadcn components
- **Human-in-the-loop:** All workflows have user approval checkpoints
- **Tests:** Unit tests co-located next to source files (`useHook.test.ts` next to `useHook.ts`).
  E2E specs in `tests/PROJ-X-*.spec.ts`; live RLS/RPC pentests in `tests/sql/PROJ-X-*-pentest.sql`.
- **Don't mock what you're actually testing.** A parser suite that mocks its parser stayed green across
  a major version bump (PROJ-142); test the real library against a generated fixture instead.
- **Hooks & APIs:** `useX` returns `{data, loading, error, refresh, ...mutators}`; effects use a
  `let cancelled` guard. Routes go through `requireProjectAccess` (`src/app/api/_lib/route-helpers.ts`)
  and the session-bound Supabase client — a report RPC called with the service-role key bypasses every
  RLS gate above it.

## Build & Test Commands

```bash
npm run dev          # Development server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npm run start        # Production server
npm test             # Vitest unit/integration tests
npm run test:e2e     # Playwright E2E tests
npm run test:e2e:fresh   # E2E with a clean dev server (use after a wedged Turbopack worker)
npm run test:all     # Both test suites

# CI guards — run these locally before opening a PR
npm run audit:prod              # npm audit --omit=dev --audit-level=high
npm run check:migration-naming  # filename format + version-prefix collisions
npm run check:index-scope       # INDEX.md: lifecycle status vs deployment scope
npm run check:schema-drift      # .from().select() columns vs migration schema (needs Docker)
```

## CI Required Checks (branch protection on `main`)

A PR cannot merge until all of these pass. Enrollment lives in the branch rulesets on `main`, not in
this file — when you add a workflow, enrol it there too, so this table never claims a gate that does not
exist. **There are two active rulesets, so six contexts block in total:** `main protection` (id
`15992143`) carries the five Actions checks below, and `main protection1` (id `15994143`) carries
`Vercel Preview Comments`. Checking only the first one is how a PR ends up `BLOCKED` with every Actions
check green. Run their local equivalents before pushing:

| Check | Guards against | Local |
|---|---|---|
| `npm audit production dependencies` | HIGH+ CVEs in runtime deps | `npm run audit:prod` |
| `Snyk production dependency scan` | **nothing — decorative.** `SNYK_TOKEN` is deliberately unset (PROJ-74 shelved Snyk, no external account wanted), so the job skips the scan, warns, and reports green. It is still enrolled, so it reads as a passing gate. Deregistration is a repo-owner handoff (PROJ-147) | — |
| `OSV scan of the dependency lockfile` | advisories in `package-lock.json` from the **OSV** database — a genuinely different source than npm's, which is the point of a second opinion. Runs as a pinned, checksum-verified CLI, so it needs no GitHub feature, account, or secret. **Broader than `npm audit`**: it sees dev dependencies too, because a lockfile scan cannot be narrowed to production. **Runs on every PR, not yet enrolled** — PROJ-147 | `osv-scanner scan -L package-lock.json` |
| `Verify SELECT columns vs migration schema` | schema drift — a `.select()` naming a column no migration creates | `npm run check:schema-drift` |
| `Verify migration filename naming + version-prefix uniqueness` | migration version collisions / malformed names | `npm run check:migration-naming` |
| `Verify lifecycle status vs deployment scope in features/INDEX.md` | a `Deployed` row without a scope, a pre-deployment row carrying one, `Deployed + superseded`, an invented scope value, or a row whose cell count is wrong because a prose `\|` was left unescaped | `npm run check:index-scope` |
| `Vercel Preview Comments` | the enrolled Vercel gate — lives in `main protection1`, not in the ruleset with the Actions checks | — (Vercel-side) |
| `Vercel` (build) | build + type errors — **runs on every PR but is not enrolled**, so a red build does not block by ruleset | `npm run build` |

Two of these have bitten repeatedly and are worth knowing up front:

- **Schema-drift replays migrations from files into a fresh shadow DB.** Prod passing proves nothing — a
  migration that depends on a column another migration adds must add it idempotently itself
  (`add column if not exists`), or the dependent migration fails on fresh-apply.
- **`npm audit` breaks unrelated PRs.** When a new CVE lands overnight, fix it in its own slice
  (PROJ-140/142 pattern: targeted `overrides` / in-range bumps) rather than `npm audit fix --force`,
  which happily downgrades Next.js and `pdfjs-dist` into *older, more vulnerable* majors.

## Dev Environment — run everything inside WSL, never from Windows

The repo lives in WSL (`/home/sven/projects/projektplattform_v3`) and its toolchain is
Linux + Node 24 (nvm). **Never run `npm` from a Windows shell against the
`\\wsl.localhost\...` path.** Two independent failures follow:

1. `CMD.EXE` cannot use a UNC path as working directory. It silently falls back to
   `C:\Windows`, so npm tries to write `C:\Windows\package-lock.json` and dies with
   `EPERM ... errno -4048`. The repo itself is untouched — nothing to repair.
2. Even with a correct working directory, Windows npm installs the wrong binaries.
   `node_modules` carries platform-specific artifacts (`@next/swc`, `sharp`,
   Turbopack); a `win32-x64` install breaks build, Vitest, Playwright, and Vercel,
   all of which run on `linux-x64`. `engines.node` is `>=22.13` (PROJ-Y-142a, driven
   by `pdfjs-dist@6`) — a stray `C:\Program Files\nodejs` is a separate, unpinned
   Node install.

One-off from a Windows shell (the `-lc` is required so nvm loads and `node` resolves):

```
wsl.exe -d Ubuntu-24.04 --cd /home/sven/projects/projektplattform_v3 -- bash -lc "npm install"
```

JetBrains IDEs (WebStorm / IntelliJ) — configure once:

- *Settings → Tools → Terminal → Shell path:* `wsl.exe -d Ubuntu-24.04`
- *Settings → Languages & Frameworks → Node.js → Node interpreter → Add → WSL* →
  Ubuntu-24.04 → `/home/sven/.nvm/versions/node/v24.19.0/bin/node`

Best: open the project via *Remote Development → WSL* rather than the
`\\wsl.localhost` network path — the whole toolchain then runs natively in Linux, the
UNC failure mode disappears, and file access avoids the slow 9P bridge.

## Required Reading

Claude Code auto-imports the first two below. **Tools that don't resolve `@`-imports must open these
paths directly** — they are the product and status source of truth, and no change should be planned
without them:

- **`docs/PRD.md`** — vision, target users, roadmap, constraints, non-goals
- **`features/INDEX.md`** — every feature, its status, and its implementation history
  (large; skim for the PROJ-X rows relevant to your task rather than reading end to end)
- **`features/OPEN-DEFERRED-STATUS.md`** — deferred follow-ups and MVP cuts

## Product Context

@docs/PRD.md

## Feature Overview

@features/INDEX.md

## V2 Heritage

V3 inherits a stable domain model, decision history, and story roadmap from V2 (`/home/sven/projects/Projeketplattform_v2_D.U/`). When in doubt about domain semantics or decisions:

1. Check `docs/decisions/` for ADRs (22 inherited from V2, 35 records today — see [INDEX.md](docs/decisions/INDEX.md))
2. Check `docs/GLOSSARY.md` and `docs/architecture/{domain-model,term-boundaries,target-picture,module-structure}.md` for terminology and architecture intent
3. Check `features/PROJ-X-*.md` "V2 Reference Material" section for V2 code paths to study
4. Reference V2 code as INPUT for V3 implementations — never copy/paste; rewrite for Next.js + Supabase + RLS

`docs/V2-MIGRATION-INVENTORY.md` is the reference doc that explains what's in V2 (epic count, story naming, migration count, ADR catalog, code layout). `docs/EPICS-TO-PROJS.md` is the audit trail mapping V2 epics → V3 PROJ-X.

### Multi-tenant invariant
Every new table created from PROJ-3 onward MUST include `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`. RLS policies MUST use the helpers established in PROJ-1: `is_tenant_member(tenant_id)`, `has_tenant_role(tenant_id, role)`, `is_tenant_admin(tenant_id)`. Tenant data MUST never leak across tenant boundaries — there is no "global" data in this product (except for catalogs explicitly marked as global, e.g. project-type catalog in PROJ-6).

### Need-to-know invariant (confidentiality sublayer)
Orthogonal to tenancy and to the Class-3 privacy axis. Objects that can carry sensitive content
(`projects`, `phases`, `work_items`, `risks`, `deliverables`, DD tables, DMS nodes, …) carry
`confidentiality_level ma_confidentiality_level` (`standard` → `confidential` → `strict`, ordered,
default `standard`) and are gated by **RESTRICTIVE** policies calling `can_access_classified(...)`
(PROJ-100a). Rules that keep this honest:

- A confidentiality gate is **additive and RESTRICTIVE** — it narrows, never widens. Default `standard`
  means non-M&A behaviour stays byte-identical; prove that with a regression run of the existing pentests.
- **Aggregates leak.** Any RPC that counts, sums, or produces a pre-read must be `SECURITY INVOKER` so
  the caller's RLS applies. A `SECURITY DEFINER` summary over gated rows is a leak even when the row
  list is correctly hidden — every report slice ships an explicit aggregate-leak probe.
- Child tables inherit via their parent (`floor trigger`: a child may never be *less* confidential than
  its parent). Where a resolver is needed across a polymorphic edge, add one `SECURITY DEFINER` context
  resolver — never a second source of truth.

### Domain extensions on the shared core
The core (Project · Phase · Milestone · Work Item · Risk · Decision · Stakeholder) is shared. Extensions
must reuse it rather than fork it:

- **M&A / deal lifecycle** (PROJ-94–132) is `project_type='ma'` — *not* a parallel module. Deal phases
  reuse `phases`, DD tasks reuse `work_items`, findings link to `risks`, stage gates write PROJ-20
  `decisions`. See `docs/decisions/ma-domain-architecture.md`.
- **DMS** (PROJ-79) owns the canonical binary store (`documents` + `document_tree_nodes`); other
  features link to it rather than growing their own upload path.
- **Skills** (PROJ-76/77) are tenant-scoped markdown with immutable versions and an activate/rollback RPC pair.

Before modelling anything new, search for the primitive that already exists — several slices
(PROJ-101/103/108/109) collapsed from "new table" to "thin read view" once the prior art was found.

### Architecture principles inherited from V2
1. **Shared core before specialization** — anything universal (Project, Phase, Milestone, Task, Risk, Stakeholder, Decision) lives in core; ERP/Construction/Software specifics are extensions.
2. **AI as proposal layer** — AI never silently mutates business data. Every AI-derived item carries source traceability, model identity, and a review state (draft/accepted/rejected/modified).
3. **Class-3 hard block** — personal data (per `docs/decisions/data-privacy-classification.md`) is technically blocked from external models — no bypass, even for tenant admins — **except** an attested EU-resident Trusted-Processor endpoint in the tenant's own Azure tenant (PROJ-93), opt-in per tenant-admin with a documented DPA. Never OpenAI-direct/Anthropic/Google, never global; the TS resolver re-checks attest + EU-region on every call (see `docs/decisions/trusted-processor-provider-class.md`). PROJ-12 enforces the block; PROJ-93 the narrow, audited exception.
4. **Stakeholder ≠ User** — fachliche Projektrolle ≠ technische RBAC-Identität (see `docs/decisions/stakeholder-vs-user.md`). Always model these as separate entities.
5. **Decisions are immutable** — revisions create a new decision with `supersedes_decision_id`. PROJ-20 owns the model.
6. **Compliance as dependency** — ISO/DSGVO/process artifacts are first-class via tags + `ComplianceTrigger` (PROJ-18), not afterthoughts.
7. **Field-level audit** — every editable business field is field-level versioned, undo-able, and DSGVO-redactable on export (PROJ-10).
8. **MCP-first for external tools** — when exposing tools to the LLM, prefer MCP server integration (PROJ-14) over ad-hoc API adapters.

### AI layer (PROJ-12 · 32 · 85 · 137)
One router, many purposes. `src/lib/ai/` holds the purpose registry (`AIPurpose`, 14 values today),
the tenant key-resolver (5 provider types), and the Class-3 gate. When adding a purpose:

- Add it to `AIPurpose` **and** to the `ki_runs` / `tenant_ai_cost_caps` purpose CHECKs in the same
  migration (lockstep — a missing CHECK value 5xx's in prod, as it did for `sentiment`/`coaching`).
- Implement it for **every** cloud provider, not just the one you tested. The router silently falls back
  to the empty `stub` provider otherwise, which is indistinguishable from "the AI found nothing"
  (PROJ-85). A data-driven capability-matrix test over `AIPurpose` catches this.
- Every run persists a typed `reason_code` (`no_provider` · `class3_blocked` · `provider_error` ·
  `cost_cap_exceeded` · `external_ai_disabled`) so an empty result is always explainable to the user (PROJ-137).
- Ground generation in the project's stated intent, but treat that intent as an **evaluation axis only** —
  never as a source of items. The model will otherwise invent a plausible backlog from the goal instead of
  extracting from the document (PROJ-91).

### Language convention (carried from V2)
- **Domain-facing artifacts** (feature specs, user stories, glossary, V2-imported docs) — German is acceptable when quoting V2 verbatim; otherwise English is preferred for V3 originals.
- **Technical artifacts** (CLAUDE.md, ADRs authored in V3, code, comments) — English.
- **Mixed documents** that bridge domain + technology — allowed.

### V2 reference convention
Each `features/PROJ-X-*.md` carries a **V2 Reference Material** section that lists:
- the source V2 epic file path
- the source V2 story file paths
- relevant V2 ADR slugs (now in `docs/decisions/`)
- V2 code paths (under `apps/api/`, `apps/web/`, `services/`, etc.) to study during /architecture and /backend
- V2 migration files relevant to the domain

Engineers and architects can use these as prior-art reading before redesigning for V3's Supabase + Next.js stack.

## Database & Migration Conventions

Hard-won rules. Each one traces to a production incident; none is stylistic.

**Naming (PROJ-134).** When applying a migration via the Supabase MCP `apply_migration`, the `name`
argument MUST equal the repo filename stem. The MCP assigns its own timestamp otherwise, which drifts
from the repo file and breaks `supabase db push`. Version prefixes must be unique — resolve collisions
*order-preservingly* (`+1` on the later file), because the schema-drift guard replays migrations in
filename order and a reorder can make a fresh apply fail where prod passed.

**Migrations are append-only.** Never edit a file that has been applied to prod. Fix forward.

**`moddatetime` must be schema-qualified** — `extensions.moddatetime`. The bare form resolves in prod
but not in the schema-drift shadow DB.

**Live RPC smoke is mandatory before Approved.** Mocked route tests have twice masked a broken prod RPC.
Every new `SECURITY DEFINER` RPC gets one real call against the live DB. Pentests live in
`tests/sql/PROJ-X-*-pentest.sql` and follow the DO-block + nested-`EXCEPTION` + rollback-marker pattern
so they leave **zero residue**. Assert the negative cases (cross-tenant, non-member, non-admin,
`anon` EXECUTE revoked), not just the happy path.

**RPCs must not take an actor parameter.** Read `auth.uid()` inside the function — an actor argument is
an impersonation hole (found live in PROJ-94). Revoke EXECUTE from `anon` on everything.

**Committing test rows to prod needs the fixture runbook.** Verifying the *deployed* function
sometimes requires real rows (PROJ-Y-146a). Never the customer tenant; prefer a rolled-back
transaction (audit triggers write inside it, so rollback costs nothing); when you must commit, seed
your own throwaway tenant rather than switching a module on for a shared `[E2E]` one, set
`tenants.audit_lifecycle_exempt` **before** seeding (audit rows are append-only and outlive the
tenant — the flag is *not* derived from the name prefix), and expect the teardown to be blocked:
`enforce_admin_invariant` refuses the last admin and, via the cascade, the tenant itself
(`23514`) — the final two rows need `session_replication_role = replica`. Full recipe with the
measured numbers: [`docs/production/prod-test-fixtures.md`](docs/production/prod-test-fixtures.md).

**Patching a deployed function: replace from live, never retype.** Fetch `pg_get_functiondef`, anchor-replace
the branch you need, and re-`GRANT` in the same statement. Audit helpers (`can_read_audit_entry`,
`record_audit_changes`, the `entity_type` CHECK) accumulate one branch per feature — transcribing them
from memory silently drops sibling slices' branches, and a concurrent session's recreate-from-live can
clobber yours. Extend the `audit_log_entity_type` CHECK **in the same migration** that adds the table,
or the first `grant`/`revoke` RPC call fails on the constraint.

## Parallel Sessions (MANDATORY — git worktree per session)

Only ONE Claude/agent session may use the primary checkout at a time. Every
additional concurrent session MUST create its own git worktree before doing
anything else:

```bash
git worktree add ../projektplattform_v3-<topic> -b <branch> origin/main
# work there; when done:
git worktree remove ../projektplattform_v3-<topic>
```

Why (incident 2026-06-10): two sessions shared this checkout — branches were
switched mid-command, one session's commit landed on another session's branch,
and `npm run lint` / `vitest` picked up a foreign in-repo worktree
(`.claude/worktrees/...`), doubling test counts and breaking the lint baseline.

Rules:
- Before starting work, check `git worktree list`. If another session is
  active in the primary checkout, create your own worktree — never switch
  branches in a checkout you did not set up this session.
- Place worktrees OUTSIDE the repo (e.g. sibling directory or /tmp), not
  under `.claude/worktrees/`, so lint/test globs in the primary checkout
  don't pick them up.
- Never touch another session's worktree, untracked files, or branches.
- Cleanup after merge: `git worktree remove <path>` + delete the branch.

## Continuous Improvement Agent

Dieses Projekt verwendet einen spezialisierten **Continuous Improvement & Technology Scout Agent**.

Agent-Datei: `.claude/agents/continuous-improvement-agent.md` · Trigger-Regeln:
`.claude/rules/continuous-improvement.md`

Tools without sub-agent support: treat the trigger list below as a **stop-and-ask checkpoint** — surface
the decision to the user with the same structured output (Findings · Risks · Recommendations) instead of
deciding unilaterally. The rule is about the review happening, not about which tool performs it.

### Zweck

Der Agent prüft das Projekt kontinuierlich auf:

- technische Verbesserungen, Architektur-Optimierungen
- Codequalität, Security, Performance
- UI/UX, Testing, Developer Experience
- neue sinnvolle Anforderungen
- technologische Weiterentwicklungen
- Verbesserung bestehender Agenten

### Verbindliche Nutzung

Der Continuous Improvement Agent ist einzubeziehen, wenn:

- neue Technologien vorgeschlagen werden,
- größere Refactorings geplant werden,
- neue Features aus technischen Verbesserungen entstehen,
- bestehende Agenten geändert oder erweitert werden,
- Architekturentscheidungen vorbereitet werden,
- technische Schulden bewertet werden,
- neue Requirements aus Code- oder Architekturprüfung entstehen,
- MVP-Lücken oder produktstrategische Erweiterungen erkannt werden.

### Grundregel

Keine neue Technologie, kein größeres Refactoring und keine Agentenänderung soll ohne Bewertung durch den Continuous Improvement Agent vorgeschlagen oder umgesetzt werden.

### Erwartete Ausgabe

Strukturierte Ergebnisse (kein loser Brainstorm): Findings, Requirements, User Stories, technische Empfehlungen, Agent Reviews, Entscheidungsvorlagen — gemäß Ausgabeformaten in der Agenten-Datei.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **projektplattform_v3** (23429 symbols, 46191 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/projektplattform_v3/context` | Codebase overview, check index freshness |
| `gitnexus://repo/projektplattform_v3/clusters` | All functional areas |
| `gitnexus://repo/projektplattform_v3/processes` | All execution flows |
| `gitnexus://repo/projektplattform_v3/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
