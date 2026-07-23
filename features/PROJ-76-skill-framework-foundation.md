# PROJ-76: Skill-Framework Foundation

## Status: Architected
**Created:** 2026-06-06
**Last Updated:** 2026-07-23

## Summary
Foundation for a platform-wide Skills capability. A "Skill" is a Markdown-based instruction file (Anthropic-Skill schema: YAML frontmatter + body) that defines an agent's behavior, allowed scope, and context bindings. Tenant-managed, admin-only edit, PM read-only. This story ships the data model, CRUD endpoints, versioning, activation toggle, and method/project-type tagging — but NOT the customizing surface (knowledge links, examples, actions) which lives in PROJ-77.

## Dependencies
- Requires: PROJ-2 (Project CRUD) — for tenant model + auth
- Requires: PROJ-4 (Platform Foundation) — RBAC helpers `is_tenant_admin()`, `is_tenant_member()`, top-nav
- Requires: PROJ-10 (Audit hook) — every skill mutation is logged
- Influences: PROJ-77 (Skill-Customizing) — extends the data model
- Influences: PROJ-78 (Skill-Projektzuordnung) — selects from this catalog
- Influences: PROJ-82 (Skill-driven AI Proposals) — reads active skill markdown to build prompts

## V2 Reference Material
- None — new in V3. No V2 equivalent.
- Conceptual reference: Anthropic Skills format (YAML frontmatter + Markdown body).
- ADRs to be created during /architecture: `docs/decisions/skills-data-model.md`, `docs/decisions/skill-versioning.md`.

## User Stories
- **[V3 SK-01]** As a tenant admin, I want to create a Skill as a Markdown file with structured metadata, so that the platform can offer this skill tenant-wide to agents.
- **[V3 SK-02]** As a tenant admin, I want to save a Skill as a new version, so that I can iterate without losing the previous content.
- **[V3 SK-03]** As a tenant admin, I want to roll back a Skill to a previous version, so that I can recover quickly from a problematic update.
- **[V3 SK-04]** As a tenant admin, I want to toggle a Skill between active and inactive, so that I can stage changes before they go live to PMs.
- **[V3 SK-05]** As a PM, I want to browse the catalog of active Skills with descriptions, so that I understand what's available — without being able to edit.
- **[V3 SK-06]** As a tenant admin, I want to tag a Skill with method tags and project-type tags, so that automatic assignment (PROJ-78) can match it.

## Acceptance Criteria

### Data model `skills`
- [ ] Table `skills` with: `id UUID PK, tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, name TEXT NOT NULL, slug TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL CHECK (category IN ('method','project_type','cross_cutting')), method_tags TEXT[] NOT NULL DEFAULT '{}', project_type_tags TEXT[] NOT NULL DEFAULT '{}', is_active BOOLEAN NOT NULL DEFAULT false, current_version_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by UUID REFERENCES auth.users(id)`.
- [ ] Unique constraint `(tenant_id, slug)`.
- [ ] `method_tags` allowed values enforced via CHECK or trigger: `scrum`, `pmi`, `prince2`, `itil`, `safe`, `kanban`, `waterfall`, `general`.
- [ ] `project_type_tags` allowed values: `software`, `sap`, `dynamics`, `construction`, `infrastructure`, `organizational`, `generic`.

### Data model `skill_versions`
- [ ] Table `skill_versions` with: `id UUID PK, skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE, version_number INT NOT NULL, markdown_content TEXT NOT NULL, frontmatter JSONB NOT NULL, change_summary TEXT, status TEXT NOT NULL CHECK (status IN ('draft','active','archived')), created_by UUID REFERENCES auth.users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- [ ] Unique constraint `(skill_id, version_number)`.
- [ ] `skills.current_version_id` is a FK to `skill_versions.id`; exactly one version per skill may have `status='active'` at any time.

### Markdown content rules
- [ ] Stored content has parseable YAML frontmatter with required keys: `name`, `description`, optional: `model_overrides`, `temperature`, `allowed_kinds`, `tone`.
- [ ] Body is free-form Markdown; max 50,000 characters (V1).
- [ ] Validation at API boundary: Zod for metadata, frontmatter parser (e.g. `gray-matter`) for the file split.

### RLS
- [ ] `skills`: read = `is_tenant_member(tenant_id) AND is_active = true` OR `is_tenant_admin(tenant_id)`. Write = `is_tenant_admin(tenant_id)`.
- [ ] `skill_versions`: read inherits from parent skill via join + same rules. Write = admin only.

### API endpoints
- [ ] `POST /api/skills` — admin only — creates skill + initial v1 in `draft` status.
- [ ] `GET /api/skills` — tenant members see active only; admins see all (with `?include_inactive=true` flag).
- [ ] `GET /api/skills/:id` — returns skill + current active version's markdown.
- [ ] `GET /api/skills/:id/versions` — list all versions (admin only).
- [ ] `POST /api/skills/:id/versions` — admin only — creates new version with `status='draft'`.
- [ ] `POST /api/skills/:id/versions/:vid/activate` — admin only — sets target version to `active`, demotes previous active to `archived`, updates `skills.current_version_id`.
- [ ] `POST /api/skills/:id/versions/:vid/rollback` — admin only — creates a new version (`version_number = max + 1`) with content copied from the target archived version, then activates it. Never modifies historical rows.
- [ ] `PATCH /api/skills/:id` — admin only — updates metadata (name, description, tags, category) but not markdown.
- [ ] `POST /api/skills/:id/toggle-active` — admin only — flips `skills.is_active`.

### UI
- [ ] Admin route `/admin/skills` — list view (name, category, method tags, project type tags, active toggle, current version, last updated).
- [ ] Admin detail `/admin/skills/[id]` — split panel: left version timeline, right markdown editor with edit/preview tabs (shadcn `Tabs`).
- [ ] PM route `/catalog/skills` — read-only list with descriptions, filter by category.
- [ ] Frontmatter validation errors shown inline with field markers.

### Audit (via PROJ-10)
- [ ] Events logged: `skill.created`, `skill.metadata_updated`, `skill.activated`, `skill.deactivated`, `skill_version.created`, `skill_version.activated`, `skill_version.rolled_back`.
- [ ] Every event carries: actor user_id, tenant_id, skill_id, optional version_id, before/after diff for metadata changes.

## Edge Cases
- **Duplicate slug in same tenant** → 409 Conflict at create.
- **Activate version on inactive skill** → version flagged active but skill stays hidden from PMs; admin must toggle skill active separately.
- **Rollback to archived version** → new version row created; old archived rows untouched. Historical audit chain intact.
- **Hard delete skill** → not supported in V1; only deactivate. Referential integrity with PROJ-78 assignments needs design before delete is added.
- **Frontmatter parsing fails** → 422 with line number and key.
- **Cross-tenant access attempt** → 404 via RLS.
- **Admin demoted while editing draft** → next save returns 403; draft is not lost on the client until refresh.
- **Empty markdown body (only frontmatter)** → allowed; agent will use frontmatter-only behavior.

## Technical Requirements
- **Stack:** Next.js 16 + Supabase, shadcn/ui (`Tabs`, `Card`, `Table`, `Badge`, `Tooltip`, `DropdownMenu`).
- **Markdown editor:** decide in /architecture between `@uiw/react-md-editor` and a custom textarea + preview combo. Frontmatter handling via `gray-matter` server-side.
- **Multi-tenant:** all tables `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`. RLS via `is_tenant_admin()` and `is_tenant_member()` from PROJ-4.
- **Validation:** Zod schemas at all API boundaries; frontmatter shape validated separately and returned as structured errors.
- **Auth:** Supabase Auth; admin gate is `is_tenant_admin(tenant_id)`.
- **Performance:** Skill list cached per tenant for 60 s; cache invalidated on any mutation via Supabase Realtime channel or revalidatePath.
- **Audit hook:** Wire into PROJ-10 audit table.

## Out of Scope (deferred or explicit non-goals)
- Linked knowledge sources, examples, allowed actions (PROJ-77).
- Skill-to-RAG node scoping (PROJ-81).
- Cross-tenant skill marketplace.
- Skill testing / preview-run harness.
- Skill import/export (JSON/zip).
- Per-project skill override by PMs.
- Skill localization (DE/EN variants) — see cross-batch open question.

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

> Authored 2026-07-23. Both dependency forks were CIA-reviewed (mandatory — new-technology trigger). Verdict: **no new transitive dependency surface** — see "Dependencies" and ADRs `docs/decisions/skills-data-model.md` + `docs/decisions/skill-versioning.md`.

### What we're building (in one sentence)
A tenant-managed catalog of "Skills" — reusable agent-behaviour definitions authored by tenant admins as structured metadata + a Markdown body, versioned immutably with a single live version at a time, browsable read-only by PMs, and tagged so PROJ-78 can auto-match them to projects.

### CIA-locked architecture decisions (deviate from the spec's suggestions — documented)

**Decision 1 — Authoring is form-first, not raw-frontmatter (Fork 1 → Option B).**
Admins enter metadata through structured form fields (name, description, category, tags, and the optional behaviour keys `model_overrides`, `temperature`, `allowed_kinds`, `tone`) plus a Markdown body text area. The metadata is the source of truth and is stored as structured JSON. The canonical `.md` string (YAML frontmatter + body) is *generated* server-side by serialising that JSON — it is never parsed back.
- Rejected: `gray-matter` (would re-introduce a parse path + its own YAML copy for something we never need to parse back).
- **Deviation from spec AC** (lines 45–47, 79): "parse YAML frontmatter with gray-matter" and edge case "Frontmatter parsing fails → 422" are dropped. Replaced by Zod validation of the structured fields with inline field-level errors (this actually satisfies AC line 68 more directly). Recorded here as a deviation.

**Decision 2 — Editor is a text area + tabs, no Markdown renderer (Fork 2 → Option B).**
The body is a monospace text area (50,000-char cap). A shadcn `Tabs` control offers "Bearbeiten" (edit) and "Vorschau (Rohtext)" — the preview shows the exact serialised `.md` string that will be stored and that PROJ-82 will later consume. No rendered-HTML preview in V1.
- Rejected: `@uiw/react-md-editor` (heavy remark/rehype tree for a rarely-used admin tool) and any renderer (`react-markdown`/`marked` + DOMPurify — either a heavy tree or an XSS-sanitising burden; PMs have no need for a rendered body in V1).
- **Deviation from spec Technical Requirements** (line 86): the `@uiw/react-md-editor`-vs-custom decision resolves to custom. Rendered preview is a demand-gated PROJ-Y follow-up.

**Decision 3 — Tag vocabularies bind to the real code catalogs, not the spec's aspirational lists.**
Because PROJ-78 auto-assigns skills by matching a project's method and type, the tags MUST use the values that actually exist:
- `method_tags` allowed values = the real `PROJECT_METHODS` (`src/types/project-method.ts`): `scrum, kanban, safe, waterfall, pmi, prince2, vxt2`.
- `project_type_tags` allowed values = the real `ProjectType` (`src/types/project.ts`): `erp, construction, software, general, ma`.
- **"Applies to everything" is expressed as an empty tag array** (no magic `general`/`*` sentinel). PROJ-78 treats an empty method-tag list as "matches any method", same for type.
- **Deviation from spec AC** (lines 36–37): the listed values `itil/prince2-extra/sap/dynamics/infrastructure/organizational/generic` are replaced by the code-true vocabularies above. The allowed sets are enforced by the app-layer Zod schema validated against the imported constants (single source of truth), not a hand-copied DB CHECK that would drift.

### Component structure (UI)
```
Admin — /stammdaten/skills            (tenant-admin only)
+-- Skills list (Table)
|   +-- columns: name · category badge · method tags · project-type tags
|   |            · active toggle · current version · last updated
|   +-- "Neuer Skill" quick-create (Dialog: name, slug, category, tags)
|   +-- row → detail
+-- Empty state ("noch keine Skills")

Admin — /stammdaten/skills/[id]       (tenant-admin only)
+-- Left: Version timeline (v3 active · v2 archived · v1 archived …)
|          + per-version actions: Aktivieren / Zurückrollen (rollback)
+-- Right: Tabs
|   +-- "Bearbeiten"  → metadata form fields + body text area
|   +-- "Vorschau (Rohtext)" → serialised .md string (read-only)
+-- Metadata edit (name, description, category, tags) — separate save
+-- Skill active/inactive toggle (staging control)
+-- History tab (PROJ-10 field-level audit)

PM — /skills                          (any tenant member, read-only)
+-- Catalog list of ACTIVE skills only
|   +-- description + category + tags
|   +-- filter by category
+-- no edit affordances anywhere
```
(Deviation from spec's `/admin/skills` + `/catalog/skills`: aligned to V3 conventions — admin master-data lives under `/stammdaten/…`, member-facing surfaces are top-level.)

### Data model (plain language)

**A Skill** (the catalog entry) holds:
- identity: a unique-per-tenant slug + a display name + a description
- a category: one of `method`, `project_type`, `cross_cutting`
- method tags and project-type tags (from the real vocabularies above; empty = all)
- an active/inactive flag (staging: inactive skills are hidden from PMs even if they have an active version)
- a pointer to its current live version
- ownership + timestamps
- belongs to exactly one tenant (`tenant_id`, cascade-deleted with the tenant)

**A Skill Version** (immutable content snapshot) holds:
- which skill it belongs to + a version number (unique within the skill)
- the Markdown body + the structured frontmatter (as JSON)
- a status: `draft`, `active`, or `archived`
- an optional change summary + author + creation timestamp
- belongs to the same tenant as its parent skill

**Invariants:**
- At most **one** version per skill may be `active` at any time (enforced by a partial-unique guarantee at the database level, belt-and-suspenders with the skill's current-version pointer).
- Version **content is immutable** once written — only its status may change, and only through the controlled activation/rollback path. Historical rows are never edited (mirrors the PROJ-20 `decisions` immutability pattern).

### State transitions — via SECURITY DEFINER RPCs, never direct status writes
Consistent with the project's state-machine convention (like `transition_project_status`, `record_approval_response`), status changes go through controlled server functions, not raw table updates:
- **Activate a version** → sets the target to `active`, demotes the previously active one to `archived`, and repoints the skill's current-version pointer — atomically.
- **Rollback** → creates a *new* version (number = max + 1) whose content is copied from a chosen archived version, then activates it. No historical row is mutated (satisfies AC line 60 + edge case line 77).
- **Toggle skill active/inactive** and **create draft version** and **create skill** are ordinary admin writes (no state-machine risk), guarded by RLS.

### Access rules (RLS, plain language)
- **Skills — read:** a tenant admin sees all skills; a regular tenant member sees only skills that are `active`. Cross-tenant reads return nothing (404 to the client).
- **Skills — write (create/update/delete-as-deactivate):** tenant admin only.
- **Skill versions — read:** inherited from the parent skill (admins all, members only versions of active skills). **write:** tenant admin only; content-mutation blocked by the immutability trigger regardless.
- Helpers reused as-is: `is_tenant_admin(tenant_id)`, `is_tenant_member(tenant_id)` (PROJ-1). Activation/rollback RPCs run SECURITY DEFINER and re-check admin membership internally, take no actor parameter (use `auth.uid()` — impersonation-safe), following the established RPC hardening rules.

### Audit (PROJ-10 wiring)
Both `skills` and `skill_versions` opt into field-level audit:
- add both table names to the audit `entity_type` allow-list,
- add per-table tracked-column whitelists,
- add read-gate branches to `can_read_audit_entry` (tenant-member gate).
- **Critical wiring rule** (known footgun): the audit helper functions are recreated from their *current live definitions* in the same migration, preserving all sibling entity branches, and the `authenticated` EXECUTE grant on `can_read_audit_entry` is re-granted afterwards (recreating it silently drops the grant and breaks the History tab). The most recent full recreation to base off lives in the PROJ-117 migration.
- Spec's event names (`skill.created`, `skill_version.activated`, …) map onto the standard insert/update audit rows; the activation/rollback RPCs annotate the change reason so the History tab reads cleanly.

### API surface (unchanged from spec intent, conventions applied)
`/api/skills` (GET list — members active-only, admins all with `?include_inactive=true`; POST create + initial draft v1), `/api/skills/[id]` (GET skill + active version; PATCH metadata), `/api/skills/[id]/versions` (GET all — admin; POST new draft), `/api/skills/[id]/versions/[vid]/activate`, `/api/skills/[id]/versions/[vid]/rollback`, `/api/skills/[id]/toggle-active`. All validated with Zod at the boundary; duplicate slug → **409** via the shared `apiError` 23505-mapping helper (same shape as `/api/risk-categories`).

### Reuse map (what we copy, not invent)
| Need | Reused precedent |
|---|---|
| Admin catalog CRUD (table + 4-policy RLS + route + page + api-wrapper) | PROJ-107 `risk_categories` |
| Immutable versioned rows + controlled transitions | PROJ-20 `decisions` immutability trigger + state-machine RPC convention |
| Audit opt-in + recreate-from-live + re-grant | PROJ-117 audit block |
| RLS helpers | PROJ-1 |
| Method / project-type vocab constants | `src/types/project-method.ts`, `src/types/project.ts` |
| 409-on-duplicate | `/api/risk-categories` `apiError` mapping |

### Dependencies (packages)
- **`js-yaml`** — promote from an existing `overrides` pin to a declared direct dependency; used **server-side only, `dump()` only**, to serialise frontmatter JSON → the canonical `.md` string. No new transitive tree (already resolved + pinned by the supply-chain hardening).
- **`@types/js-yaml`** — devDependency for types.
- **Nothing else.** No `gray-matter`, no Markdown editor, no Markdown renderer. Net new transitive surface: **zero**.

### Out-of-scope confirmations / PROJ-Y follow-up candidates
- Skill import (paste a ready-made Anthropic-Skill `.md` → parse) — needs the parse path we deliberately avoided; demand-gated follow-up.
- Rendered (HTML) Markdown preview — demand-gated follow-up (PROJ-77/82).
- Referential-integrity handling for hard-delete once PROJ-78 assignments exist (V1 = deactivate only, per spec).

### Resolved decisions
- **Localization** (DE/EN skill variants, spec line 100): **out of scope for V1** — confirmed by the user on 2026-07-23. A variant model is a demand-gated PROJ-Y follow-up, not part of the foundation.
- **Design approved** by the user on 2026-07-23 → status flipped to Architected. Next: `/frontend` (admin list/detail + PM catalog), then `/backend` (tables, RLS, RPCs, audit wiring, API routes).

## Implementation Notes
_To be added by /frontend and /backend._

## QA Test Results
_To be added by /qa._

## Deployment
_To be added by /deploy._
