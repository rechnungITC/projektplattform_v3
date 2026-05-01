# Product Requirements Document

## Vision

A modular, web-based, AI-supported **project orchestration platform** that turns fragmented project information into structured, actionable project logic.

This is **not** a generic to-do tool, ticket board, or execution-only tracker. It is built to support real enterprise projects — across **ERP implementations**, **construction**, and **software projects** — on a shared foundation that handles the full lifecycle: from project initiation, through structured planning and decision-making, into operational delivery and management steering.

The product thesis: enterprise projects fail at the seams between execution, governance, and communication — not at task tracking. The platform's job is to bridge those seams using a shared project core plus type-specific extensions, with AI that pre-analyzes and proposes structure from emails, meeting notes, and documents — always reviewable, never opaque.

## Target Users

- **Project leads and project managers** running enterprise projects (ERP rollouts, construction projects, software delivery)
- **Project sponsors and steering committee members** who need decision-ready summaries, not raw task lists
- **Key users and business stakeholders** who provide requirements, sign off on milestones, and depend on clear governance
- **Functional roles around the project**: IT, purchasing, works council / staff council, external partners

**Pain points the platform addresses:**
- project information is fragmented across emails, meeting notes, and documents — never structured
- decisions, approvals, and escalations are ad-hoc; no audit trail
- generic PM tools (Trello, Jira) collapse all project types into one flat model and ignore governance
- specialized tools (e.g. construction scheduling) don't share data with the rest of project context
- AI features in existing tools are opaque and not traceable back to the original input

## Core Features (Roadmap)

| ID | Priority | Feature | Status |
|----|----------|---------|--------|
| PROJ-1 | P0 (MVP) | Authentication, Tenants, Role-Based Membership (Supabase Auth + RLS) | In Progress |
| PROJ-2 | P0 (MVP) | Project CRUD + Lifecycle State Machine (Draft → Active → Paused → Completed/Canceled) | Planned |
| PROJ-3 | P0 (MVP) | Tenant Operations and Deployment Modes (Stand-alone vs SaaS) | Planned |
| PROJ-4 | P0 (MVP) | Platform Foundation: Navigation, Project Roles, RBAC Enforcement | Planned |
| PROJ-5 | P0 (MVP) | Guided Project Creation Wizard with Type/Method-Aware Questions | Planned |
| PROJ-6 | P0 (MVP) | Project Types, Methods Catalog, and Rule Engine | Planned |
| PROJ-19 | P0 (MVP) | Shared core: Phases, Milestones (cross-cutting schedule backbone) | Planned |
| PROJ-9 | P0 (MVP) | Shared core: Work Items (Epic/Story/Task/Subtask/Bug/Work Package) | Planned |
| PROJ-7 | P0 (MVP) | Project Room with Internal Kanban / Scrum / Gantt Modules + Risks/Budget | Planned |
| PROJ-8 | P0 (MVP) | Shared core: Stakeholders | Planned |
| PROJ-20 | P0 (MVP) | Shared core: Risks (cross-link), Decisions, Open Items | Planned |
| PROJ-10 | P0 (MVP) | Change Management: field-level versioning, compare, undo, copy, audit | Planned |
| PROJ-15 | P1 | ERP extension: vendor evaluation, vendor master data, document slots | Planned |
| PROJ-12 | P1 | Context ingestion + AI-supported proposals (Claude, traceable, reviewable) | Planned |
| PROJ-13 | P1 | Communication center, email/Slack/Teams send, internal project chat | Planned |
| PROJ-11 | P1 | Resources, capacities, utilization across projects | Planned |
| PROJ-14 | P1 | Connector framework + Jira integration + MCP bridge | Planned |
| PROJ-16 | P1 | Master Data UI: users, stakeholder rollup, catalog overrides | Planned |
| PROJ-17 | P1 | Tenant Administration: branding, modules, privacy defaults, export, offboarding | Planned |
| PROJ-18 | P1 | Compliance Automatik & Process Templates (ISO/DSGVO/MS-365/vendor-eval/...) | Planned |
| _TBD_ | P2 | Construction extension: trades, sections, schedule logic, Gantt views | Planned |
| _TBD_ | P2 | Software project extension: sprints, releases, technical dependencies | Planned |
| PROJ-21 | P2 | Output rendering: Status-Report + Executive-Summary (HTML+PDF). Gantt, PPTX, Markdown deferred to PROJ-21b/c. | Planned |
| PROJ-22 | P1 | Budget-Modul: 3 Ebenen (Kategorien/Posten/Buchungen) + Vendor-Invoice-Integration + Multi-Currency mit FX. Schließt P0-Lücke aus PROJ-7. | Planned |
| PROJ-23 | P2 | Globale Sidebar-Navigation: Top-Level + Project-Room als vertikale Sidebar links, mit Branding + Hotkeys + Persistenz. Reine UI-Foundation. | Planned |
| PROJ-24 | P2 | Cost-Stack: role_rates (versioniert), Velocity-Modell für Stories, generische work_item_cost_lines mit source_type für spätere Erweiterung (LV, Stückliste). | Planned |
| PROJ-25 | P2 | Drag-and-Drop: Backlog↔Sprint, Gantt-Verschieben/Resize/Dependencies-Linien. Erweiterung PROJ-7 + PROJ-19. | Planned |
| PROJ-28 | P2 | Method-aware Project-Room Navigation: Sidebar-Labels + URL-Slugs (Wasserfall: /arbeitspakete, /phasen; Scrum: /releases) per Methode. Schließt PROJ-26 deferred-frontend (L1). | Planned |
| PROJ-29 | P2 | Hygiene-Slice: ESLint-Baseline auf 0 (97→0), 3 Supabase-Functions search_path-hardenen, Playwright-Logged-In-Auth-Fixture-Skelett. Quick-Win vor PROJ-21. | Planned |
| PROJ-30 | P1 | KI-Narrative-Purpose: Erweiterung des PROJ-12 AI-Routers um `narrative`-Purpose; ersetzt PROJ-21 preview-ki Stub durch echten AI-Call mit Class-3-Defense-in-Depth. Validates Multi-Purpose-Pattern für PROJ-33. | Planned |
| _TBD_ | P2 | Governance workflows: approval gates, escalations, formal decisions | Planned |

## Success Metrics

_To be refined with stakeholders. Initial proposals:_

- **Adoption (3 months):** ≥ 1 ERP project actively managed end-to-end on the platform
- **Coverage:** ≥ 80% of project artifacts (tasks, risks, decisions, stakeholders) created or proposed by the platform rather than parallel tools
- **AI quality:** ≥ 70% of AI-derived proposals accepted by the user without significant rework
- **Governance:** 100% of formal decisions and approvals have a traceable audit trail
- **Time-to-structure:** initial project setup from kick-off email/document to structured project plan in < 1 hour (vs. days manually)

## Constraints

**Technical:**
- Stack is fixed: **Next.js 16 (App Router) + TypeScript + Supabase** (PostgreSQL, Auth, Storage, Realtime, Edge Functions)
- No separate Python/FastAPI services in MVP — business logic lives in API routes and Edge Functions
- LLM: **Claude** as primary model (via Anthropic SDK in Edge Functions). Other models optional later.
- Tool connectivity: **MCP-first** for external integrations
- Deployment: Vercel (frontend) + Supabase (backend)

**Architectural:**
- Multi-tenant from day 1 — Supabase Row-Level Security on every table
- Shared project core, project-type-specific extensions — never blur them
- AI proposals must be **traceable** (link back to source context) and **reviewable** (human accepts/rejects)
- Incremental delivery — bounded, reviewable increments only

**Product:**
- Reuse V2's validated domain model (entities, lifecycle states, role distinctions) — do not reopen those decisions
- Build the shared core first; ERP extension second; construction and software extensions architecturally accommodated but deprioritized for MVP

## Non-Goals

- ❌ A generic to-do tool, Kanban board, or Trello/Jira clone
- ❌ Execution-only tracking without governance, decisions, or analysis layers
- ❌ One flat data model that collapses ERP, construction, and software projects together
- ❌ Opaque AI automation that creates artifacts without human review or source traceability
- ❌ Reintroducing V2's heavier stack (FastAPI, Redis workers, custom S3) in MVP — only revisit if Supabase Edge Functions prove insufficient
- ❌ Building all 12 epics at once — strictly P0 first, then P1, then P2

---

_Use `/requirements` to create detailed feature specifications for each item in the roadmap above._
