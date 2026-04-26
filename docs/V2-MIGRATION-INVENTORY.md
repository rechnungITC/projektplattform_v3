# V2 Migration Inventory

> Reference document for future PROJ-X spec authors. Describes what exists in the V2 repo (`/home/sven/projects/Projeketplattform_v2_D.U/`) so that V3 work can study V2's implementations before redesigning for the V3 stack.

## V2 Repository Layout

```
Projeketplattform_v2_D.U/
├── README.md, CLAUDE.md, CONTEXT.md, GLOSSARY.md, MAP.md, REFERENCES.md
├── apps/
│   ├── api/          (FastAPI backend, Python+SQLAlchemy)
│   └── web/          (Next.js + React frontend)
├── services/
│   ├── orchestrator/ (internal LangGraph-compatible workflow module)
│   └── worker/       (Redis queue worker)
├── packages/         (shared TS types, Python utils)
├── db/
│   └── migrations/   (Alembic SQL migrations)
├── infra/            (Docker, Compose, S3, monitoring scripts)
├── mcp/
│   └── servers/      (MCP server skeletons)
├── docs/
│   ├── architecture/ (target-picture, domain-model, term-boundaries, module-structure)
│   ├── admin-guides/, user-guides/, deployment/, handover/, changelogs/, setup/
├── planning/
│   ├── CONTEXT.md, README.md, jira-reference.md, implementation-mapping.md, phases.md, risks.md
│   ├── vision/platform.md
│   ├── personas/, requirements/, workflows/
│   ├── epics/        (16 epic files: ep-01-*.md through ep-16-*.md)
│   ├── stories/      (16 story collection files: ep-01.md through ep-16.md, one per epic)
│   ├── decisions/    (22 ADRs + README)
│   ├── backlog/      (unprioritized ideas)
│   └── features/     (historical, retired 2026-04-23)
├── workspace/        (sprints, reviews, drafts, exports, archive)
├── inbox/            (raw triage inputs)
├── references/       (external standards, examples, legal)
├── tests/            (cross-service E2E tests)
└── build/            (engineering plans — concepts, not code)
```

## Epic Count + Names

V2 has **16 epics** (`planning/epics/ep-XX-*.md`):

| ID | Title (DE) |
|---|---|
| EP-01 | Mandanten- und Betriebsarchitektur |
| EP-02 | Plattformfundament, Navigation und Rollen |
| EP-03 | Stammdaten und dialoggestützte Projekterstellung |
| EP-04 | Projekttypen, Methoden und Regelwerk |
| EP-05 | Projektraum und interne Module |
| EP-06 | Stakeholder- und Organisationslogik |
| EP-07 | Methodenobjekte, Arbeitspakete und Backlog-Struktur |
| EP-08 | Änderungsmanagement, Versionierung und Wiederherstellung |
| EP-09 | Ressourcen, Kapazitäten und Terminlogik |
| EP-10 | KI-Assistenz und Datenschutzpfade |
| EP-11 | Kommunikation, Versand und interner Chat |
| EP-12 | Integrationen, Vendoren und Ausbaupfade |
| EP-13 | Vendor & Beschaffung |
| EP-14 | Stammdaten-Pflege via UI |
| EP-15 | Mandanten-Administration |
| EP-16 | Compliance-Automatik & Prozess-Templates |

Each epic file is short (10–25 lines) and references its detailed stories in `planning/stories/ep-XX.md`.

## Story Count + Naming

Stories live in `planning/stories/ep-01.md` … `ep-16.md` — one file per epic, multiple stories per file. The naming convention is **`EP-XX-ST-YY`** (e.g. `EP-04-ST-03`). Within several stories there are also cross-cutting features named **F-XY.Z** (e.g. `F2.1b`, `F4.2`, `F12.1`, `F13.4`) — these inherit older Jira PP-numbers from the pre-restructure naming scheme.

V2 MAP.md counts: **"45 EP-XX-ST-YY + 11 F-series"**. Late additions (EP-05-ST-05/06, EP-08-ST-05, EP-09-ST-03, EP-12-ST-04..08, EP-13-ST-05 placeholder, EP-14-ST-01..04, EP-15-ST-01..05, EP-16-ST-01..06) bring the total to roughly **100** story-level items.

## Migration Count + Entities

V2's `db/migrations/versions/` contains Alembic migrations approximately numbered:

| Migration | Topic |
|---|---|
| 0001 | Initial users + tenants |
| 0002 | Projects table |
| 0003 | Phases (cross-cutting schedule) |
| 0004 | Milestones |
| 0005 | Project memberships + role enum |
| 0006 | (or similar) — project lifecycle events |
| 0007 | Stakeholders |
| 0008 | Audit log entries (field-level) |
| 0009 | Work items (STI table with kind discriminator) |
| 0010 | Risks (F4.2) |
| 0011 | Communication outbox (EP-11 framework) |
| 0012 | Tenant secrets / Connector |
| 0013 | Decisions / open items |
| 0014+ | Sprints, SAFe portfolio kinds, tenant_settings |

(Exact count + ordering is verified in V2's `db/migrations/versions/`. V3 specs reference these for inspiration, but V3 uses Supabase migrations under `supabase/migrations/`.)

## ADR Count

**22 ADRs + 1 README** in `planning/decisions/`:

1. architecture-decisions-table.md
2. architecture-principles.md
3. backlog-board-view.md
4. communication-framework.md
5. compliance-as-dependency.md
6. connector-framework.md
7. data-privacy-classification.md
8. deployment-modes.md
9. master-data-editing.md
10. metadata-model-context-sources.md
11. metamodel-infra-followups.md
12. method-catalog.md
13. method-object-mapping.md
14. project-room.md
15. project-rule-engine.md
16. project-type-catalog.md
17. retention-and-export.md
18. role-model.md
19. sprint-1-product-open-points.md
20. stakeholder-data-model.md
21. stakeholder-vs-user.md
22. work-item-metamodel.md

All 22 are inherited into V3 at `docs/decisions/` with the "Inherited from V2" header. See `docs/decisions/INDEX.md`.

## Document Layout

V2's `docs/` (besides architecture):
- `setup/` — installation
- `deployment/` — deploy procedures
- `admin-guides/` — for tenant admins
- `user-guides/` — for end users
- `handover/` — handover materials
- `changelogs/` — release notes

V2's `docs/architecture/`:
- `target-picture.md` — long-form German Zielbild + architecture principles
- `domain-model.md` — English domain model (entity catalog)
- `term-boundaries.md` — Wave-1 binding term definitions (Task, Open Item, Decision, Stakeholder)
- `module-structure.md` — proposed Python package layout

## Code Layout (V2)

V2 is a **monorepo** with pnpm + uv workspaces:

| Package / Service | Tech | Purpose |
|---|---|---|
| `apps/web/` | Next.js 14, React, TS | Frontend |
| `apps/api/` | Python 3.12, FastAPI, SQLAlchemy, Alembic | Backend REST API |
| `services/orchestrator/` | Python | Internal workflow/state-machine module (LangGraph-compatible design) |
| `services/worker/` | Python | Redis queue consumer |
| `mcp/servers/projektplattform/` | Python | MCP tool server |
| `packages/` | TypeScript + Python | Shared types and utils |
| `db/migrations/versions/` | Alembic SQL | Migrations (numbered 0001+) |
| `infra/` | Docker Compose, scripts | Local dev + deploy support |

V2's API layer is structured as `routers/` → `services/` → `domain/{core,erp,...}` → `db/`. The architecture rule: **routers are orchestration only; domain has no FastAPI imports; extensions (`domain/erp/`) only import from `domain/core/`**.

V3 simplifies this dramatically:
- No FastAPI; route handlers live in `src/app/api/` (Next.js App Router).
- No Redis worker; long-running jobs run as Supabase Edge Functions.
- No Alembic; migrations live in `supabase/migrations/` as pure SQL.
- No separate orchestrator service; AI orchestration is a Supabase Edge Function (PROJ-12).

## Key V2 Conventions Carried Forward

1. **Domain-driven separation** — Core vs Extensions (ERP/Construction/Software) is preserved via PROJ-15 (vendor/ERP extensions) and the type catalog (PROJ-6).
2. **AI as proposal layer** — never auto-mutates business data — preserved by PROJ-12 design.
3. **Class-3 hard block** — personal data never reaches external models — preserved (PROJ-12).
4. **Field-level audit + immutable decisions** — preserved (PROJ-10 + PROJ-20).
5. **Compliance as dependency** — preserved (PROJ-18).
6. **Stakeholder ≠ User** — preserved (PROJ-8).
7. **MCP-first for external tool integration** — preserved (PROJ-14).
8. **Two-stage tenant deletion** — preserved (PROJ-17).

## How to Use This Inventory

When authoring or refining a PROJ-X spec:

1. Read the linked V2 epic file in the spec's "V2 Reference Material" section.
2. Read the matching V2 stories in `planning/stories/ep-XX.md` to extract acceptance criteria, edge cases, and Nicht-AK boundaries.
3. Check the ADRs listed in the V2 reference for the architectural decisions still applying to V3.
4. Inspect the V2 code paths listed (e.g. `apps/api/src/projektplattform_api/services/...`) to understand the V2 implementation pattern, then redesign cleanly for Next.js + Supabase. **Never copy/paste V2 code; reread the intent and rebuild.**
5. Update the spec's V2 Reference Material with anything you noticed during exploration that's worth recording.

V2 is read-only material — no changes propagate from V3 back to V2.
