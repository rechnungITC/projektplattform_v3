# PROJ-6: Project Types, Methods Catalog, and Rule Engine

## Status: Deployed
**Created:** 2026-04-25
**Last Updated:** 2026-04-27

## Summary
Defines the catalog of project types (ERP, Generic Software, plus prepared-but-shallow Construction/General slots) and methods (Scrum, Kanban, Waterfall, SAFe; PMI/PRINCE2/VXT2.0 as templates layered on top). Adds a pure-function rule engine that derives, from `(type, method)`, the set of active modules, suggested roles, required wizard info, and starter work-item kinds. Inherits V2 EP-04. The catalog is a code registry (not a DB table) for V3, mirroring V2's decision; tenant-level overrides are a later concern (PROJ-16).

## Dependencies
- Requires: PROJ-2 (Project CRUD) — adds `project_type` and `method` columns
- Requires: PROJ-1 (Auth, Tenants, Roles) — for tenant scoping where overrides apply later
- Influences: PROJ-5 (Wizard) — drives dynamic follow-ups
- Influences: PROJ-7 (Project Room) — `active_modules` controls visible tabs
- Influences: PROJ-8 (Stakeholders) — `suggested_roles` feeds stakeholder suggestions
- Influences: PROJ-9 (Work Items) — `starter_kinds` and method visibility filter

## V2 Reference Material
- **Epic file:** `~/projects/Projeketplattform_v2_D.U/planning/epics/ep-04-projekttypen-methoden-regelwerk.md`
- **Stories:** `~/projects/Projeketplattform_v2_D.U/planning/stories/ep-04.md` (ST-01 type catalog, ST-02 method catalog, ST-03 method-dependent objects, ST-04 rule engine)
- **ADRs:** `docs/decisions/project-type-catalog.md`, `docs/decisions/method-catalog.md`, `docs/decisions/method-object-mapping.md`, `docs/decisions/project-rule-engine.md`
- **V2 code paths to study during /architecture and /backend:**
  - `apps/api/src/projektplattform_api/domain/core/project_types/catalog.py` — `ProjectTypeProfile` dataclass + initial entries
  - `apps/api/src/projektplattform_api/domain/core/project_types/rule_engine.py` — pure `compute_rules(type, method)`
  - `apps/api/src/projektplattform_api/domain/core/work_items/metamodel.py` — `WORK_ITEM_METHOD_VISIBILITY`
  - `apps/api/src/projektplattform_api/routers/project_types.py` — `GET /project-types`, `GET /project-types/{type}/rules`

## User Stories
- **[V2 EP-04-ST-01]** As the system, I want ERP and Generic Software available as initial project types so that roles, modules, and rules can be derived per type.
- **[V2 EP-04-ST-02]** As the system, I want to distinguish Scrum, Kanban, Waterfall, SAFe (active) and PMI/PRINCE2/VXT2.0 (templates) so the platform behaves method-correctly.
- **[V2 EP-04-ST-03]** As the product team, we want each method to declare its leading planning objects so that the system structures work correctly per method.
- **[V2 EP-04-ST-04]** As the system, I want to derive active modules, suggested roles, and starter structures from `(type, method)` so that new projects don't start empty.

## Acceptance Criteria

### Project type catalog (code-registry)
- [ ] A TypeScript module exports `PROJECT_TYPES` with at minimum `general`, `erp`, `software`, `construction`.
- [ ] Each type has: `key`, `label_de`, `summary_de`, `standard_roles[]`, `standard_modules[]`, `required_info[]`.
- [ ] ERP type: roles include Projektleiter:in, Sponsor, Key-User, IT-Architekt:in, Datenschutzbeauftragte:r; modules include backlog, planning, members, history, stakeholders, governance; required_info includes target systems, business units, migration scope.
- [ ] Generic Software: roles include Projektleiter:in, Product Owner, Scrum Master, Developer, QA-Lead; modules include backlog, planning, members, history, releases; required_info includes target platforms, tech stack.
- [ ] `GET /api/project-types` returns the read-only list (Server Component fetch + API route).
- [ ] No POST/PATCH/DELETE — catalog is changed by code commit only (admin override comes later via PROJ-16).

### Method catalog
- [ ] `projects.method` column added (text, nullable until chosen, CHECK constraint `method IN ('scrum','kanban','waterfall','safe')`).
- [ ] TypeScript enum/object exposes labels (Scrum, Kanban, Wasserfall, SAFe).
- [ ] Templates (PMI, PRINCE2, VXT2.0) documented in `docs/architecture/method-templates.md` but NOT modeled as a separate field; they're starter-structure overlays applied on top of the chosen method.
- [ ] Method changes are audited (PROJ-10 audit hook).

### Method-dependent object visibility
- [ ] A `WORK_ITEM_METHOD_VISIBILITY` config maps `kind → set<method>`. Bugs are visible in all methods.
- [ ] Default mapping (mirrors V2 ADR `method-object-mapping.md`): Scrum → epic/story/task/subtask/bug; Kanban → story/task/bug; Waterfall → task/bug/work_package + phases/milestones; SAFe → epic/feature/story/task/subtask/bug (portfolio_epic/capability optional).
- [ ] When `projects.method IS NULL`, all kinds are allowed (used during initial setup).
- [ ] Frontend mirror function `workItemKindsFor(method)` stays in sync with the backend; an integration test verifies the alignment.

### Rule engine
- [ ] Pure function `computeRules(type, method): ProjectRules` with no side effects.
- [ ] `ProjectRules` shape: `{ active_modules[], suggested_roles[], required_info[], starter_kinds[] }`.
- [ ] `GET /api/project-types/{type}/rules?method=…` for wizard preview.
- [ ] `GET /api/projects/{id}/rules` for project-room module gating.
- [ ] When method is null, `starter_kinds` is empty; modules + roles + required_info still come from the type.

## Edge Cases
- **User picks a method that has no overlap with their type's standard modules** → all type modules stay active (no subtraction by method); a banner can suggest method-fit but never blocks.
- **Catalog code adds a new required_info field** → existing projects don't retroactively become invalid; the field is required only for new projects via wizard.
- **Frontend & backend type lists drift** → integration test compares the catalogs and fails build.
- **Method changed after project has work items** → existing items are NOT deleted; the UI just hides kinds that are no longer visible for the new method (per V2 ADR).
- **`construction` is in the catalog but no real depth** → catalog entry minimal; UI flags it as "Strukturell vorbereitet, Vertiefung folgt" until P2 work activates the extension.
- **A user from tenant A tries to fetch tenant B's rules preview** → not applicable, the catalog is global; a future tenant override (PROJ-16) is RLS-isolated.

## Technical Requirements
- **Stack:** Next.js 16 (TypeScript catalog modules in `src/lib/project-types/` and `src/lib/methods/`), Supabase (only for the `projects.method` column + future override table).
- **Multi-tenant:** Catalog itself is global. Future overrides will be in `tenant_project_type_overrides` with `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` (PROJ-16).
- **Validation:** Zod schemas validate the catalog shape at boot (or as a build-time test).
- **Auth:** No auth needed for `GET /api/project-types` — it's public configuration. Rule preview is open. Project rule fetch (`/api/projects/{id}/rules`) requires project read access.
- **Tests:** Pin the Wave-1-binding type/method/visibility mappings as integration tests.

## Out of Scope (deferred or explicit non-goals)
- KI-driven rule generation.
- Tenant-level catalog overrides (covered by PROJ-16).
- Method conversion logic (turning a Scrum project into a Waterfall project).
- Free admin UI to define entirely new project types.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

> **Authored:** 2026-04-27 · **Author:** /architecture skill
> **Audience:** PM + dev team. No code blocks; file paths and structural references only.

### 0. Decisions captured during architecture review

The user reframed two parts of the V2 ADR `method-catalog.md` during this design pass:

1. **Methods are a flat list — no separation into "active methods" + "templates."** PMI, PRINCE2, VXT2.0 are first-class methods, equal in standing to Scrum, Kanban, Wasserfall, SAFe. The "template overlay" concept from the V2 ADR is dropped. The V2 ADR `method-catalog.md` is **superseded** by this design and gets a back-reference note.
2. **Hierarchy: a project has exactly one method, and it is hard-locked after first selection.** When a team needs to work differently, the answer is **sub-projects**: a project may have a parent project (`parent_project_id`), and each sub-project picks its own method independently. The PMO governs the top-level project (e.g. PMI / SAFe / Wasserfall); sub-projects underneath can run Scrum, Kanban, etc.
3. **Method-migration on a single project is deferred** to a later story (audit-tracked one-shot) — sub-projects cover the operational need today.

These decisions enlarge the original PROJ-6 scope: it now also introduces the **sub-project hierarchy** and the **method-immutability** rule. Both are required for the model to make sense; deferring them would leave the catalog/rule-engine semantically incomplete.

### 1. What gets built (component view)

```
PROJ-6
+-- Project Type Catalog (code, frontend + backend share via single source)
|   +-- src/lib/project-types/catalog.ts      <- the registry
|   +-- src/lib/project-types/index.ts        <- public exports
|   +-- ProjectTypeProfile shape              <- key, label_de, summary_de,
|                                                standard_roles[], standard_modules[],
|                                                required_info[]
|
+-- Method Catalog (code, flat list of 7 methods)
|   +-- src/types/project-method.ts           <- expand union to 7 methods,
|   |                                            drop "general" as a method value,
|   |                                            treat "no method chosen" = null
|   +-- src/lib/methods/catalog.ts            <- labels, descriptions, lead-objects
|
+-- Method-Object Visibility (already partially exists; extended)
|   +-- src/types/work-item.ts                <- WORK_ITEM_METHOD_VISIBILITY,
|                                                expand to 7 methods + bug-cross-method
|
+-- Rule Engine (pure function, used by both server + client)
|   +-- src/lib/project-rules/engine.ts       <- computeRules(type, method)
|   +-- src/lib/project-rules/types.ts        <- ProjectRules return shape
|
+-- Public API
|   +-- GET /api/project-types                <- list catalog
|   +-- GET /api/project-types/[type]/rules?method=...   <- wizard preview
|   +-- GET /api/projects/[id]/rules          <- project-room module gating
|
+-- Database (Supabase migration)
|   +-- projects.project_method               <- tighten CHECK to 7 methods,
|   |                                            make nullable, drop "general" default,
|   |                                            data-migrate existing rows
|   +-- projects.parent_project_id (NEW)      <- nullable self-FK for sub-projects,
|   |                                            cross-tenant guard, max-depth = 2 in v1
|   +-- enforce_method_immutable() trigger    <- once project_method is non-null,
|                                                further changes are blocked
|
+-- Cleanup of interim method-templates registry (PROJ-7 leftover)
    +-- src/lib/method-templates/             <- remove 'general.ts',
                                                 add 'prince2.ts' + 'vxt2.ts',
                                                 keep 'pmi.ts' (now first-class)
                                                 update consumers to handle null
                                                 instead of 'general' fallback
```

### 2. Data model in plain language

**Project type catalog** (lives in code, never in DB):
- 4 entries: `general`, `erp`, `software`, `construction`
- Each entry carries: a key, German label + summary, a list of standard roles, a list of standard modules (backlog / planning / members / history / stakeholders / governance / releases), and a list of required-info questions for the wizard
- Construction stays minimal ("Strukturell vorbereitet, Vertiefung folgt") — placeholder until the construction extension activates

**Method catalog** (lives in code, persisted as a string column on `projects`):
- 7 methods, flat: `scrum`, `kanban`, `waterfall`, `safe`, `pmi`, `prince2`, `vxt2`
- "no method yet" = `NULL` (replaces today's `general` value)
- Each method has: German label, short description, list of leading objects (e.g. Scrum → Epic / Story / Task / Subtask / Bug; PMI → Phase / Meilenstein / Arbeitspaket)

**Method-object visibility** (already exists, expanded):
- A registry per work-item kind that lists which methods show it
- Bugs are visible in all 7 methods
- For the new methods (PRINCE2, VXT2), the kind list mirrors the closest sibling: PRINCE2 ≈ Wasserfall (phase / milestone / work_package), VXT2 → hybrid (work_package + story + task + bug)
- Frontend and backend share the same source of truth; an integration test pins the values

**Rule engine** (pure function, no side effects):
- Input: a project type key and a method (or null)
- Output: `active_modules[]`, `suggested_roles[]`, `required_info[]`, `starter_kinds[]`
- `active_modules`, `suggested_roles`, `required_info` come 1:1 from the type catalog (no method-driven subtraction in v1)
- `starter_kinds` comes from the method's leading objects, intersected with the work-item visibility registry (consistency guarantee)
- When method is null: starter_kinds is empty; modules + roles + required_info still come from the type

**`projects.project_method` column changes:**
- Today: `text NOT NULL DEFAULT 'general'` with CHECK `IN (...6 values...)`
- Becomes: `text NULL` (no default), CHECK `IN (...7 values...)`
- Data migration: existing rows where `project_method = 'general'` → set to NULL; rows with `project_method = 'pmi'` → keep as `pmi` (now first-class, no migration)
- New trigger `enforce_method_immutable`: blocks `UPDATE` that changes `project_method` from a non-null value to anything else; allows the first set (NULL → real value)

**`projects.parent_project_id` (new column):**
- Nullable self-FK to `projects.id`, `ON DELETE RESTRICT` (parent stays as long as children exist; soft-delete is already the official path)
- Cross-tenant guard: parent must be in the same tenant as the child (trigger, mirroring PROJ-9's pattern for parent_id on work_items)
- Cycle prevention: a child can't be its own ancestor (trigger, mirroring PROJ-9's `prevent_work_item_parent_cycle`)
- Max depth = 2 in v1 (top-level + one layer of children); 3+ levels deferred to a later story
- Sub-projects inherit nothing automatically — RBAC, work items, phases, milestones are independent. The `parent_project_id` only links them for navigation/rollup later

### 3. Tech decisions (the why)

| Decision | Choice | Reason |
|---|---|---|
| Catalog storage | Code registry, not DB | Configuration, not data. Changes are review-pflichtig (commit). No tenant overrides yet (PROJ-16 territory). Migration-frei. |
| Methods as flat list | All 7 first-class, equal | Reflects the user's domain model: PMOs pick PMI / PRINCE2 / SAFe / Wasserfall as governance; teams below pick Scrum / Kanban as execution. Treating PMI/PRINCE2 as "templates" doesn't match how the user actually thinks about it. |
| Rule engine as pure function | No DB side effects, no I/O | Same engine runs server-side (API endpoints) and client-side (wizard preview); no caching or eviction logic; trivially testable. |
| Method lock via trigger | Hard-block at DB level | Defense in depth — even if API or RLS lets a write through, the trigger refuses. Migration-to-another-method is a deferred story; trigger gets bypassed there explicitly via SECURITY DEFINER (same pattern as `bootstrap_project_lead`). |
| Sub-projects as the team-layer model | One entity (`projects`), self-FK | Avoids a parallel `teams` table. RBAC and work-item rules already work per-project; sub-projects reuse all of it for free. PMO's "two-layer hybrid" maps to a 2-level project hierarchy. |
| Max depth 2 in v1 | One level of children | Keeps the cycle-prevention and rollup logic simple. Real customers asking for grandchild-level granularity get an explicit follow-up story. |
| 'general' value retired from `project_method` | Replaced by NULL | "Method not yet chosen" is a real state; encoding it as a separate enum value caused conceptual drift (general was both "no choice" and "default"). Going to NULL aligns DB and domain. |
| Cleanup of interim method-templates | Same release | The interim registry was tagged as "to be revisited when PROJ-6 lands" in PROJ-7's QA. Doing it now avoids a second migration and aligns the UI shell with the new method list. |

### 4. Public API

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/project-types` | none | Returns the full catalog (read-only). Used by wizard, master-data UI, future PROJ-16 overrides. |
| `GET /api/project-types/[type]/rules?method=...` | none | Wizard preview — what would `(type, method)` produce? Returns a `ProjectRules` object. |
| `GET /api/projects/[id]/rules` | project view (PROJ-4 `requireProjectAccess`, action `view`) | Per-project rule resolution; reads the project's stored `project_type` + `project_method` and runs the engine. Used by the project-room layout to gate tabs/modules. |
| `POST /api/projects` (existing) | unchanged | The `project_method` field is optional on creation; if set, it's locked from then on. The existing `bootstrap_project_lead` flow is unaffected. |
| `POST /api/projects` (new sub-project case) | unchanged | When `parent_project_id` is set, a one-time check ensures the parent is in the same tenant and the depth stays ≤ 2. Method on the sub-project is independent. |
| _no PATCH for project_method_ | n/a | Method is immutable post-set. Any future "migrate method" endpoint is a deferred story. |

### 5. Migration plan (Supabase)

One migration file, applied as a single transaction:

1. Tighten the column type:
   - Drop `DEFAULT 'general'` on `projects.project_method`
   - Drop existing CHECK constraint
   - Add new CHECK `project_method IN ('scrum','kanban','waterfall','safe','pmi','prince2','vxt2')`
   - Allow NULL (drop NOT NULL)
2. Data-migrate existing rows:
   - `UPDATE projects SET project_method = NULL WHERE project_method = 'general'`
   - Existing `pmi` rows are kept (now valid)
3. Add the immutability trigger `enforce_method_immutable` (BEFORE UPDATE on `projects`)
4. Add `parent_project_id` column + FK + cross-tenant guard trigger + cycle prevention trigger + depth-≤-2 check (in trigger or via a CHECK against a derived column)
5. RLS update: parent project must be readable by the user (`is_project_member(parent_project_id)`) for sub-project creation; parent stays readable from the child's row to enable navigation

### 6. What changes outside PROJ-6 (cleanup tasks bundled here)

These are **not new features** — they're consequences of the catalog/rule-engine landing:

- `src/types/project-method.ts` — replace 6-method union with 7-method union; drop `'general'`; export label/description for new entries (PRINCE2, VXT2)
- `src/lib/method-templates/` — add `prince2.ts` + `vxt2.ts`; remove `general.ts`; consumers stop using `'general'` as fallback and handle `null` (= no method) instead
- `useCurrentProjectMethod` hook — return type becomes `ProjectMethod | null`, consumers add a "noch nicht festgelegt" UI state
- PROJ-7 project-room shell sidebar logic — `getMethodConfig(method)` already accepts null; the fallback path renders a neutral shell + a banner inviting the user to pick a method

### 7. Tests

- **Catalog shape**: Zod schemas validate `PROJECT_TYPES` and `METHODS` at module load (run as a build-time vitest). Drift between TypeScript shape and Zod schema fails the test.
- **Frontend/backend parity**: a vitest hits `GET /api/project-types` and asserts the response equals the in-process catalog (only meaningful in integration env, mocked otherwise).
- **WORK_ITEM_METHOD_VISIBILITY**: a vitest pins each method's visible-kinds set so accidental edits fail loudly.
- **Rule engine**: a fixture-table test pins `(type, method) → ProjectRules` for every combination including `(type, null)`.
- **Method immutability trigger**: a Supabase live test attempts UPDATE-after-set and expects `check_violation` (or a custom raise).
- **Sub-project cycle / depth**: live tests for self-parenting, parent-of-grandchild, and cross-tenant parent.

### 8. Out of scope (deferred — explicitly named so PROJ-X candidates exist)

- **Method migration on a single project** — future story, audit-tracked, SECURITY DEFINER RPC bypassing the immutability trigger
- **Tenant-level catalog overrides** — PROJ-16 (`tenant_project_type_overrides`)
- **3+ level project hierarchy** — future story; v1 is max-depth = 2
- **Sub-project rollup of phases / work items / risks / decisions** — separate concern; PROJ-6 only adds the structural link
- **Free admin UI for adding new types or methods** — explicitly non-AC
- **Construction-type fachliche Tiefe** — placeholder only; activated when the construction extension lands (P2)
- **KI-driven rule generation** — not in PROJ-6's scope

### 9. Dependencies (packages)

No new npm packages required. The work uses existing dependencies (`zod` for schema validation, Supabase JS client, Next.js Server Components).

### 10. Risk + trade-off summary

| Risk | Mitigation |
|---|---|
| Cleaning up `'general'` mid-flight breaks PROJ-7 frontend pages | Migration sets existing `general` rows to NULL; frontend handles `null` in the same release; QA round verifies the project-room shell still renders correctly. |
| `parent_project_id` introduces RBAC complexity | v1 explicitly does NOT inherit RBAC from parent — each project's memberships are independent. A future story can add inheritance if needed. |
| Method immutability is too strict for early-stage projects | Sub-projects with different methods cover the practical case today. The deferred "method-migration RPC" story will cover the rare full-switch use case with audit. |
| 7 methods × 4 types × null gives 32 rule-engine combinations to keep stable | Fixture-table test pins all 32; any change requires a deliberate test update. |
| Two-source-of-truth for method labels (`project-method.ts` + `method-templates/*.ts`) | Method labels live only in `project-method.ts` (single source); `method-templates/` consumes them. Drift impossible by import. |

## Implementation Notes

### Backend + Frontend (2026-04-27)

Shipped as a single all-in change per user direction. Architecture (above) and implementation align 1:1.

**Migrations**
- `supabase/migrations/20260428140000_proj6_method_lock_and_subprojects.sql` — column tightening, data migration, immutability trigger, parent_project_id + 2 hierarchy guards.
- `supabase/migrations/20260428150000_proj6_harden_trigger_search_path.sql` — adds `set search_path = public, pg_temp` to the three new trigger functions (advisor lint fix).

**Code-registries (TypeScript)**
- `src/types/project-method.ts` — flat 7-method union; drop `'general'`, add `'prince2'`, `'vxt2'`. Adds `PROJECT_METHOD_LEAD_OBJECTS` (per-method leading planning objects).
- `src/lib/methods/catalog.ts` — wraps `project-method.ts` constants into a structured `METHOD_CATALOG` of `MethodProfile` records.
- `src/lib/project-types/catalog.ts` — `PROJECT_TYPE_CATALOG` with 4 entries (general, erp, software, construction). ERP and Generic Software carry the V2-AC role/module/required-info sets verbatim. Construction is `is_placeholder: true`.
- `src/types/work-item.ts` — `WORK_ITEM_METHOD_VISIBILITY` rebased on the 7 methods; `'general'` removed; `isKindVisibleInMethod(kind, null)` returns `true` (every kind creatable when no method chosen).

**Rule engine (pure)**
- `src/lib/project-rules/types.ts` — `ProjectRules` shape.
- `src/lib/project-rules/engine.ts` — `computeRules(type, method | null) → ProjectRules`. Modules + roles + required_info come from the type catalog; `starter_kinds` from per-method leading objects intersected with the visibility registry; empty when method is null.

**API routes**
- `GET /api/project-types` — read-only platform catalog (project_types + methods). 5-min cache.
- `GET /api/project-types/[type]/rules?method=...` — wizard preview, no auth.
- `GET /api/projects/[id]/rules` — per-project rule resolution; pre-checked via `requireProjectAccess(..., 'view')`.
- `POST /api/projects` — accepts optional `project_method` (nullable, drops `'general'` enum) and optional `parent_project_id`. Maps trigger errors to clean field-scoped 422s (parent_project_id vs. responsible_user_id distinguished by message content).
- `PATCH /api/projects/[id]` — drops `'general'`, accepts the 7 methods. Surfaces the immutability trigger as `409 method_locked` with German copy pointing to sub-projects / migration RPC.

**Frontend cleanup (consequences of method list change)**
- `src/lib/method-templates/`: `general.ts` removed; `prince2.ts` + `vxt2.ts` added; `neutral.ts` introduced as a UI-only fallback (`method: null`, label "Methode wählen") used when `getMethodConfig(null)` is called. `MethodConfig.method` widened to `ProjectMethod | null` to accommodate the neutral fallback.
- `src/types/method-config.ts` — method field nullable.
- `src/lib/work-items/method-context.ts` — `useCurrentProjectMethod` returns `ProjectMethod | null`; `getCurrentMethod`/`kindsForMethod`/`isKindCreatable` handle null (= "all kinds creatable" semantics).
- `src/components/projects/new-project-dialog.tsx` — method dropdown adds "Noch nicht festgelegt" option (= null), description text adapts.
- `src/components/projects/edit-project-master-data-dialog.tsx` — method picker disables when already set + shows lock copy.
- `src/components/work-items/{backlog-toolbar, change-kind-dialog, new-work-item-dialog, work-item-detail-drawer}.tsx` — `method` prop type widened to `ProjectMethod | null`.
- `src/app/(app)/projects/[id]/backlog/backlog-client.tsx` — comment updated.
- `src/app/api/projects/[id]/work-items/route.ts` + `…/[wid]/route.ts` — duplicated `WORK_ITEM_METHOD_VISIBILITY` removed; routes import the single source from `@/types/work-item`. Method = null path adds: every kind is creatable.

**Test coverage**
- vitest 97 → **121 passing** (+24): rule engine matrix, project-types catalog shape, GET endpoints (project-types + rules previews), per-project rules endpoint with mocked Supabase chains.
- Live red-team SQL (via MCP):
  - **Method immutability** — UPDATE `safe → scrum` blocks with `42501 project_method is immutable once set; use a method-migration RPC` ✓
  - **Sub-project hierarchy depth-2 allowed** — A → child of B succeeds ✓
  - **Depth-3 via parent-already-has-child** — B → child of C blocks (`B already has child A`) ✓
  - **Self-parent** — A → A blocks (`project cannot be its own parent`) ✓
  - **Depth-3 via inherited parent** — C → child of A (where A already has parent B) blocks (`hierarchy depth is limited to 2 levels`) ✓

**Advisor**
- 3 new triggers initially flagged with `function_search_path_mutable`; remediation migration applied (search_path = public, pg_temp on each). Other warnings are pre-existing intentional (RLS helpers + state-machine RPCs callable by `authenticated`; `auth_leaked_password_protection` is project-wide config).

**Verified**
- TypeScript strict — 0 errors
- `npm run build` — green, 23 routes generated
- Existing tests — all green (97 → 121)

**Out of this story (deferred to follow-ups)**
- Method-migration RPC for locked projects (audit-tracked one-shot)
- Sub-project rollup of phases / work-items / risks / decisions
- Tenant-level catalog overrides (PROJ-16)
- 3+ level project hierarchy
- KI rule generation

## QA Test Results

**Date:** 2026-04-27
**Tester:** /qa skill
**Verdict:** ✅ **Approved** — no Critical or High bugs.

### Automated tests
- `npm test --run` — **121/121 pass** (97 → 121, +24 new for PROJ-6: rule-engine matrix, project-types catalog shape, GET /api/project-types, GET /api/project-types/[type]/rules, GET /api/projects/[id]/rules).
- TypeScript strict — **0 errors**.
- `npm run build` — green, 23 routes generated.

### Schema integrity (via `information_schema` + `pg_catalog`)
- `projects.project_method` — nullable (YES), no default, CHECK on the 7 values (scrum, kanban, waterfall, safe, pmi, prince2, vxt2 — `NULL` allowed).
- `projects.parent_project_id` — uuid, nullable, FK to `projects(id)` ON DELETE RESTRICT, partial index on the non-null subset.
- 3 new triggers active on `projects`: `projects_method_immutable` (BEFORE UPDATE OF project_method), `projects_parent_in_tenant` (BEFORE INSERT/UPDATE), `projects_hierarchy_depth` (BEFORE INSERT/UPDATE OF parent_project_id).
- All 3 trigger functions: SECURITY INVOKER (default), `search_path = public, pg_temp`, ACL only `postgres + service_role` — `function_search_path_mutable` advisor lint clean.
- Existing rows: 0× `general`, 2× NULL (migrated), 1× `safe` (kept). 0× `pmi`/`prince2`/`vxt2` in prod (no real users yet).

### Live red-team SQL (via MCP `execute_sql`)

| # | Attack | Expected | Result |
|---|---|---|---|
| A | UPDATE locked method (`safe → scrum`) | block | ✅ 42501 "project_method is immutable once set; use a method-migration RPC" |
| B | Initial set of method (NULL → real value) | allow | ✅ structurally guaranteed by trigger code (`if OLD.project_method is null then return NEW`); not live-executed to avoid mutating prod |
| C | Sub-project depth-2 allowed (A → child of B) | allow | ✅ |
| D | Become sub-project while having children (B with child A → child of C) | block | ✅ 22023 "cannot become a sub-project: this project already has its own sub-projects" |
| E | Self-parent (A → child of itself) | block | ✅ 22023 "project cannot be its own parent" |
| F | Depth-3 via inherited parent (C → child of A, where A already has parent B) | block | ✅ 22023 "project hierarchy depth is limited to 2 levels (parent + child)" |
| G | Cross-tenant parent | block | 🟡 NOT YET LIVE-TESTABLE — only one tenant exists in prod; structurally enforced by `enforce_parent_project_in_tenant` trigger and unit-tested via API mocks. Live test will be exercised once a second tenant signs up. |

### Acceptance Criteria walkthrough

#### Project type catalog (code-registry)
| AC | Status | Notes |
|---|---|---|
| `PROJECT_TYPE_CATALOG` exports general/erp/software/construction | ✅ | Vitest pins the keys. |
| Each type has key/label_de/summary_de/standard_roles/standard_modules/required_info | ✅ | `ProjectTypeProfile` interface enforces; vitest pins ERP and Software shape. |
| ERP roles: PL, Sponsor, Key-User, IT-Architekt:in, DSB | ✅ | Verified in catalog test. |
| ERP modules: backlog/planning/members/history/stakeholders/governance | ✅ | Verified in catalog test. |
| ERP required_info: target_systems, business_units, migration_scope | ✅ | Verified in catalog test. |
| Software roles: PL, PO, SM, Developer, QA-Lead | ✅ | Verified in catalog test. |
| Software modules: backlog/planning/members/history/releases | ✅ | Verified in catalog test. |
| Software required_info: target_platforms, tech_stack | ✅ | Verified in catalog test. |
| `GET /api/project-types` returns read-only list | ✅ | Vitest verifies; cache-control header set; route is in build output. |
| No POST/PATCH/DELETE | ✅ | Route exports only `GET`. |

#### Method catalog
| AC | Status | Notes |
|---|---|---|
| `projects.project_method` column with CHECK | ✅ | Column nullable; CHECK on 7 methods + NULL. **Note:** spec said `IN ('scrum','kanban','waterfall','safe')` — superseded by architecture decision (flat 7-method list); ADR `method-catalog.md` is the V2 source that PROJ-6 explicitly supersedes via the Tech Design § 0. |
| TypeScript enum + DE labels | ✅ | `PROJECT_METHODS`, `PROJECT_METHOD_LABELS`, `PROJECT_METHOD_DESCRIPTIONS` carry all 7 with German labels. |
| Templates documented in `docs/architecture/method-templates.md` | ⚪ DEFERRED | Architecture decision retired the templates concept; PMI/PRINCE2/VXT2 are first-class methods now. The doc may still be created as a "method comparison reference" if useful — non-blocking. |
| Method changes audited (PROJ-10 hook) | ⚪ DEFERRED | PROJ-10 not yet built. Initial method set is captured by the create-time `created_at` already; subsequent changes are blocked by the immutability trigger anyway. |

#### Method-dependent object visibility
| AC | Status | Notes |
|---|---|---|
| `WORK_ITEM_METHOD_VISIBILITY` maps kind → set<method>; bug all-methods | ✅ | Pinned in `src/types/work-item.ts`; integration test in rule-engine matrix verifies bug across all 7 methods. |
| Default mapping mirrors V2 ADR `method-object-mapping.md` | ✅ | Scrum/Kanban/Waterfall/SAFe entries match. New methods (PMI/PRINCE2/VXT2): PMI ≡ Wasserfall (governance overlay); PRINCE2 ≡ Wasserfall + governance; VXT2 hybrid (work_package + story + task + bug). |
| `method = NULL` → all kinds allowed | ✅ | `isKindVisibleInMethod(kind, null)` returns true; rule engine returns empty `starter_kinds` (the user must commit before suggestions). API `POST /work-items` skips the visibility check when method is null. |
| Frontend mirror `kindsForMethod(method)` stays in sync; integration test | ✅ | `kindsForMethod` reads from the shared `WORK_ITEM_METHOD_VISIBILITY`; rule-engine test pins the alignment. |

#### Rule engine
| AC | Status | Notes |
|---|---|---|
| Pure function `computeRules(type, method)` | ✅ | No I/O, no DB; vitest exercises every (type × method) combination including null. |
| `ProjectRules` shape: active_modules / suggested_roles / required_info / starter_kinds | ✅ | `src/lib/project-rules/types.ts` enforces. |
| `GET /api/project-types/[type]/rules?method=...` for wizard preview | ✅ | Endpoint live; vitest covers happy + missing-method + bad-type + bad-method paths. |
| `GET /api/projects/[id]/rules` for project-room module gating | ✅ | Endpoint live; pre-checks via `requireProjectAccess(..., 'view')`; returns 404 for cross-tenant; vitest covers all paths. |
| `method = NULL` → starter_kinds empty, modules/roles/required_info from type | ✅ | Pinned by rule-engine test. |

#### Architecture-pass additions (now part of AC scope)

| AC | Status | Notes |
|---|---|---|
| Method immutability trigger | ✅ | Verified live (Test A). |
| `parent_project_id` self-FK + cycle prevention | ✅ | Verified live (Tests C–F). |
| Depth-2 max in v1 | ✅ | Verified live (Tests D, F). |
| Cross-tenant parent guard | 🟡 | Trigger present + unit-tested; cross-tenant live test deferred to multi-tenant deployment. |

### Edge cases verified
| Edge case | Result |
|---|---|
| User picks a method with no module overlap → modules stay | ✅ Architecture decision: no method-driven subtraction in v1. |
| Catalog adds a new required_info field → existing projects don't retroactively break | ✅ Required-info is consumed at wizard time only; no DB-level required-info constraint. |
| Frontend & backend type lists drift | ✅ Both pull from `PROJECT_TYPES` in `src/types/project.ts`; rule-engine test covers full matrix. |
| Method changed after work items exist | ⚪ N/A — method is immutable now. Sub-projects with different methods are the documented escape valve. |
| Construction is in catalog but no real depth | ✅ `is_placeholder: true`; required_info empty. |
| Cross-tenant rules preview attempt | ✅ N/A — catalog is global; per-project rules endpoint goes through `requireProjectAccess`. |

### Bugs found

**0 Critical / 0 High.**

| Severity | ID | Finding | Status |
|---|---|---|---|
| Low | L1 | The `method-templates.md` architecture doc envisioned in the original AC is intentionally not produced — the architecture pass dropped the methods-vs-templates split, so the doc would be misleading. Could optionally be re-purposed as a "method comparison reference" later. | Documentation/scope clarification, not a bug. |
| Info | I1 | Cross-tenant parent_project_id guard is structurally present but not live-testable until a second tenant signs up. | Will be exercised during PROJ-3 (Tenant Operations) live tests. |
| Info | I2 | The `bootstrap_project_lead` and other authenticated SECURITY DEFINER functions still appear in the advisor — same intentional category as PROJ-4-M1 hardening; not introduced by PROJ-6. | Pre-existing accepted state. |
| Info | I3 | `auth_leaked_password_protection` disabled — Supabase project-wide config, not specific to PROJ-6. | Toggle in Auth dashboard if desired. |

### Security audit (red-team perspective)
- **Method tampering** — UPDATE blocked by trigger (Test A); CHECK constraint excludes off-list values; Zod at every API boundary.
- **Sub-project privilege escalation** — sub-project creation goes through normal `POST /api/projects` + RLS + project-membership rules. The cross-tenant-parent trigger blocks attaching to a parent in a different tenant. Hierarchy depth limit prevents DoS via deeply nested chains.
- **Catalog leakage** — `GET /api/project-types` is read-only and global; carries no tenant data; cache-able.
- **SQL injection** — all routes use Supabase JS client (parameterised queries); UUID inputs validated via Zod; `format(... %L ...)` only used in test fixtures, never in production code paths.
- **Mass assignment** — Zod schemas reject unknown keys; `tenant_id`/`created_by` are server-controlled; `project_method` patch path can only set NULL → real (initial) and is otherwise blocked.
- **Cycle DoS via parent_project_id** — limited to depth 2; the cycle check is O(1) (one parent lookup); no recursion.

### Production-ready decision
**READY** — no Critical or High bugs. Architecture decisions captured in spec § 0 are properly reflected in code, DB, and tests. All 3 new API endpoints work; all 7 methods exposed; method lock active; sub-project hierarchy guards active. Cross-tenant parent test is structurally guaranteed and pending live exercise once multi-tenant data exists.

Suggested next:
1. **`/deploy`** when ready — no blockers.
2. **PROJ-5 Wizard** — uses the rule engine; can now run on a stable catalog.
3. **PROJ-10 Change Mgmt** — provides the audit hook for method's initial set (currently untracked).
4. **Method-migration RPC** as a separate small story — audit-tracked one-shot to unlock PROJ-6's intentional immutability when business reality demands it.

## Deployment

- **Date deployed:** 2026-04-28
- **Production URL:** https://projektplattform-v3.vercel.app
- **Git tag:** `v0.1.0-mvp-backbone`
- **Deviations:** none observed.
