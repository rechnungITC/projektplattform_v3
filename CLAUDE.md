# AI Coding Starter Kit

> A Next.js template with an AI-powered development workflow using specialized skills for Requirements, Architecture, Frontend, Backend, QA, and Deployment.

## Tech Stack

- **Framework:** Next.js 16 (App Router), TypeScript
- **Styling:** Tailwind CSS + shadcn/ui (copy-paste components)
- **Backend:** Supabase (PostgreSQL + Auth + Storage) - optional
- **Deployment:** Vercel
- **Validation:** Zod + react-hook-form
- **State:** React useState / Context API

## Project Structure

```
src/
  app/              Pages (Next.js App Router)
  components/
    ui/             shadcn/ui components (NEVER recreate these)
  hooks/            Custom React hooks
  lib/              Utilities (supabase.ts, utils.ts)
features/           Feature specifications (PROJ-X-name.md)
  INDEX.md          Feature status overview
docs/
  PRD.md            Product Requirements Document
  production/       Production guides (Sentry, security, performance)
```

## Development Workflow

1. `/requirements` - Create feature spec from idea
2. `/architecture` - Design tech architecture (PM-friendly, no code)
3. `/frontend` - Build UI components (shadcn/ui first!)
4. `/backend` - Build APIs, database, RLS policies
5. `/qa` - Test against acceptance criteria + security audit
6. `/deploy` - Deploy to Vercel + production-ready checks

## Feature Tracking

All features tracked in `features/INDEX.md`. Every skill reads it at start and updates it when done. Feature specs live in `features/PROJ-X-name.md`.

## Key Conventions

- **Feature IDs:** PROJ-1, PROJ-2, etc. (sequential)
- **Commits:** `feat(PROJ-X): description`, `fix(PROJ-X): description`
- **Single Responsibility:** One feature per spec file
- **shadcn/ui first:** NEVER create custom versions of installed shadcn components
- **Human-in-the-loop:** All workflows have user approval checkpoints
- **Tests:** Unit tests co-located next to source files (`useHook.test.ts` next to `useHook.ts`). E2E tests in `tests/`.

## Build & Test Commands

```bash
npm run dev          # Development server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npm run start        # Production server
npm test             # Vitest unit/integration tests
npm run test:e2e     # Playwright E2E tests
npm run test:all     # Both test suites
```

## Product Context

@docs/PRD.md

## Feature Overview

@features/INDEX.md

## V2 Heritage

V3 inherits a stable domain model, decision history, and story roadmap from V2 (`/home/sven/projects/Projeketplattform_v2_D.U/`). When in doubt about domain semantics or decisions:

1. Check `docs/decisions/` for ADRs (22 inherited records, see [INDEX.md](docs/decisions/INDEX.md))
2. Check `docs/GLOSSARY.md` and `docs/architecture/{domain-model,term-boundaries,target-picture,module-structure}.md` for terminology and architecture intent
3. Check `features/PROJ-X-*.md` "V2 Reference Material" section for V2 code paths to study
4. Reference V2 code as INPUT for V3 implementations — never copy/paste; rewrite for Next.js + Supabase + RLS

`docs/V2-MIGRATION-INVENTORY.md` is the reference doc that explains what's in V2 (epic count, story naming, migration count, ADR catalog, code layout). `docs/EPICS-TO-PROJS.md` is the audit trail mapping V2 epics → V3 PROJ-X.

### Multi-tenant invariant
Every new table created from PROJ-3 onward MUST include `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`. RLS policies MUST use the helpers established in PROJ-1: `is_tenant_member(tenant_id)`, `has_tenant_role(tenant_id, role)`, `is_tenant_admin(tenant_id)`. Tenant data MUST never leak across tenant boundaries — there is no "global" data in this product (except for catalogs explicitly marked as global, e.g. project-type catalog in PROJ-6).

### Architecture principles inherited from V2
1. **Shared core before specialization** — anything universal (Project, Phase, Milestone, Task, Risk, Stakeholder, Decision) lives in core; ERP/Construction/Software specifics are extensions.
2. **AI as proposal layer** — AI never silently mutates business data. Every AI-derived item carries source traceability, model identity, and a review state (draft/accepted/rejected/modified).
3. **Class-3 hard block** — personal data (per `docs/decisions/data-privacy-classification.md`) is technically blocked from external models — no bypass, even for tenant admins. PROJ-12 enforces this.
4. **Stakeholder ≠ User** — fachliche Projektrolle ≠ technische RBAC-Identität (see `docs/decisions/stakeholder-vs-user.md`). Always model these as separate entities.
5. **Decisions are immutable** — revisions create a new decision with `supersedes_decision_id`. PROJ-20 owns the model.
6. **Compliance as dependency** — ISO/DSGVO/process artifacts are first-class via tags + `ComplianceTrigger` (PROJ-18), not afterthoughts.
7. **Field-level audit** — every editable business field is field-level versioned, undo-able, and DSGVO-redactable on export (PROJ-10).
8. **MCP-first for external tools** — when exposing tools to the LLM, prefer MCP server integration (PROJ-14) over ad-hoc API adapters.

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

## Continuous Improvement Agent

Dieses Projekt verwendet einen spezialisierten **Continuous Improvement & Technology Scout Agent**.

Agent-Datei: `.claude/agents/continuous-improvement-agent.md`

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

This project is indexed by GitNexus as **projektplattform_v3** (14343 symbols, 21689 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

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
