# PROJ-76: Skill-Framework Foundation

## Status: Deployed

## Deployment Scope: mvp

> **Scope-Klassifikation (PROJ-Y-145b, Tranche 5, 2026-08-24):** QA **PASS**, 0 Critical/0 High, mit RLS-Rollen-Pentest 11/11 und RPC-Zustandsmaschinen-Smoke 8/8 live gegen Prod. Die eine dokumentierte Abweichung trifft ein Kriterium: der Audit-**„Verlauf"-Tab** fehlte in der Detailansicht, weil `AuditEntityType` `skills`/`skill_versions` nicht kannte — die Audit-Zeilen entstanden in der Datenbank, waren ueber die Oberflaeche aber nicht lesbar. **Inzwischen geschlossen**, und zwar von der Nachfolge-Slice: `feat(PROJ-77): follow-ups — err.status 409, Verlauf-Tab, audit-entity widening` (#287); heute traegt `src/types/audit.ts` alle vier Skill-Objektarten und `skill-detail-client.tsx` rendert den `HistoryTab`. Nach Hausregel hebt das den Scope nicht automatisch → **Upgrade-Kandidat**.

**Created:** 2026-06-06
**Last Updated:** 2026-07-24

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

### Backend slice (2026-07-23)

**Migration** `20260723120849_proj76_skill_framework` (in Prod-DB; repo file version-matched per PROJ-134):
- `skills` (tenant catalog): slug unique per tenant, category CHECK, `method_tags`/`project_type_tags` (`text[]`, empty = all), `is_active` (default false), `current_version_id` pointer, `created_by → profiles`. 4-policy RLS (PROJ-107 template) with a nuanced SELECT: `is_tenant_admin OR (is_tenant_member AND is_active)`.
- `skill_versions` (immutable snapshots): `version_number` unique per skill, `markdown_content` (body, ≤50k), `frontmatter jsonb` (behaviour keys only), `status` (draft/active/archived). **Single active version** via partial-unique index `where status='active'`. SELECT inherits parent-skill visibility; write = admin.
- **Content immutability** via `enforce_skill_version_immutability` BEFORE-UPDATE trigger (mirrors PROJ-20 decisions): only `status` may change, and only when the transaction-local GUC `skills.allow_status_change` is set by the RPCs. `set search_path to ''` (advisor hygiene). Direct content/status updates are hard-blocked (23514).
- **State-machine RPCs** (SECURITY DEFINER, `auth.uid()` admin re-check, no actor param): `activate_skill_version` (demote current active → archive, promote target, repoint pointer, atomic; idempotent no-op if already active) and `rollback_skill_version` (copy target content into a NEW draft v = max+1, then activate; never mutates history). `authenticated` EXECUTE; `anon`/`public` revoked.
- **PROJ-10 audit**: both tables opted in (AFTER UPDATE — `record_audit_changes` is UPDATE-diff, so version *creation* is captured by the row itself; *activation* logged via tracked `status` + `skills.current_version_id`). Audit helper fns (`entity_type` CHECK, `_tracked_audit_columns`, `can_read_audit_entry`) patched from **live defs via anchor-replace + hard-fail assertions**; `authenticated` EXECUTE re-granted (footgun avoided). Verified: both fns + CHECK contain `skill_versions`, grants intact.

**Application layer:** `src/types/skill.ts`; `src/lib/skills/serialize.ts` (js-yaml `dump()`-only serialiser, generation-only); Zod `_schema.ts` (tags validated against real `PROJECT_METHODS`/`PROJECT_TYPES` constants); 6 route files under `src/app/api/skills/` (list/create · get/patch · versions list/create · activate · rollback · toggle-active); client wrappers `src/lib/skills/api.ts`.

**Dependency:** `js-yaml` promoted from the existing `overrides` pin (`^4.2.0`) to a declared direct dep + `@types/js-yaml` devDep. **Zero new transitive surface** (already resolved by supply-chain hardening).

**Deviations from spec (per CIA + ADRs):** (1) form-first authoring, no `gray-matter`/YAML parse, no 422-frontmatter-error → Zod field validation; (2) no Markdown editor/renderer dep; (3) tag vocab = code-true (empty = all); (4) routes `/stammdaten/skills` + `/skills`; (5) `slug` immutable after create; (6) `markdown_content` stores the body, the canonical `.md` is generated on demand (name/description merged from the mutable skill → never stale).

**Quality gates:** vitest **23/23** new (serialize round-trip proves parseable YAML frontmatter — AC line 45; route auth/validation/authz/409); tsc **0 new** errors (14 pre-existing baseline in unrelated files); ESLint 0 on new files; production build clean. **Live-RPC-Smoke 8/8 PASS** against Prod (activate · single-active-demote · content-immutability blocked · status-immutability blocked · rollback content-copy · idempotent re-activate · admin-gate stranger 42501 · audit rows) with **0 residue** (rollback-marker). Advisors: **0 ERROR**; the 2 `authenticated_security_definer_function_executable` WARNs on the RPCs are the by-design pattern shared by every state-machine RPC.

### Frontend slice (2026-07-23)

**Routes + components** (all in the worktree; shadcn-first, German UI, responsive, loading/empty/error states, a11y):
- **Admin list** `/stammdaten/skills` → `skills-page-client.tsx`: table (name/slug, category badge, method/type tag badges, version indicator, updated_at), per-row active `Switch` with optimistic toggle + revert-on-error (drops deactivated rows when "Inaktive anzeigen" is off), "Neuer Skill" + "Inaktive anzeigen" toggle, rows link to detail. Edit affordances gated by `useAuth().currentRole === "admin"` (UI hint; API enforces).
- **Create dialog** `skill-form-dialog.tsx`: name/slug (`^[a-z0-9-]+$`)/description/category + tag pickers; on success `router.push` to detail; 409 slug-conflict surfaced as inline field error + toast.
- **Admin detail** `/stammdaten/skills/[id]` → `skill-detail-client.tsx`: left version timeline (v-number, status badge, created_at, change_summary, active highlighted; Aktivieren / Zurückrollen[archived-only] buttons, busy-disabled); right `Tabs` — "Bearbeiten" (metadata form with read-only slug + "Neue Version" sub-form: body textarea 50k + temperature/tone/allowed_kinds/model_overrides/change_summary) and "Vorschau (Rohtext)" (`<pre>` of `serializeSkillMarkdown` reflecting live form input).
- **PM catalog** `/skills` → `skills-catalog-client.tsx`: read-only cards of active skills, category filter, click opens a read-only `Sheet` with the active version's serialized `.md`. No edit affordances anywhere.
- **Shared** `skill-tag-picker.tsx`: accessible toggle-badge multi-select (`aria-pressed`, `role=group`), empty = "gilt für alle".
- **Nav**: Skills card added to `/stammdaten` `SECTIONS` (adminOnly); top-level "Skills" (Sparkles) added to `global-sidebar` `NAV_ITEMS` (all members).

**Deviations:** (1) audit "Verlauf" tab omitted — `AuditEntityType` in `src/types/audit.ts` doesn't include `skills`/`skill_versions`; adding it (client-type widening + a `HistoryTab` prop path) is a small **PROJ-Y follow-up**, not worth touching shared audit types in this slice (the DB audit rows exist and are gated — verified in the backend smoke). (2) `model_overrides` UI = simple `key=value`-per-line textarea. (3) one narrow, commented `eslint-disable react-hooks/set-state-in-effect` for the dialog-open one-shot form reset (data-fetching effects use the `let cancelled` async-only pattern, no disable).

**Quality gates (independently re-verified):** ESLint **0** on all 10 new/changed files; tsc **0** skill-related errors (14 pre-existing baseline unchanged); vitest 23/23 (backend, untouched); production build clean (routes `/skills`, `/stammdaten/skills`, `/stammdaten/skills/[id]` registered).

**Remaining:** `/qa` — test against acceptance criteria + security (RLS/admin-gate/tenant-isolation) audit.

## QA Test Results

**Date:** 2026-07-24 · **Verdict: PRODUCTION-READY** (0 Critical / 0 High) · Status → **Approved**

### Acceptance criteria — all covered
| Area | Evidence |
|---|---|
| `skills` + `skill_versions` schema, unique `(tenant,slug)`, `(skill,version_number)` | Migration `20260723120849` live + verified; 409-on-dup-slug in route tests |
| method/project-type tag vocab | App-layer Zod against real `PROJECT_METHODS`/`ProjectType` (documented deviation); route tests reject `itil`/`sap` (400) |
| `current_version_id` + exactly-one-active | Partial-unique index + RPC; **RPC smoke B/E** (single active after activate/rollback) |
| Markdown rules (body ≤50k, parseable frontmatter) | CHECK + `serialize.test.ts` round-trip proves parseable YAML (AC line 45); form-first (no `gray-matter` — documented deviation, no 422-frontmatter path) |
| RLS skills/versions (member active-only, admin all) | **RLS pentest P1–P4, P11** |
| API endpoints (create/list/get/patch/versions/activate/rollback/toggle) | 6 route files + 23 vitest + **Playwright 12/12 auth-gates** |
| Admin list/detail + PM catalog UI | Built (`/stammdaten/skills`, `/stammdaten/skills/[id]`, `/skills`); build clean |
| Audit events | DB audit wired (`status` + `current_version_id` tracked) — **RPC smoke G**; UI "Verlauf" tab deferred → PROJ-Y (deviation) |

### Edge cases
Duplicate slug → 409 (route test); rollback creates a new version, history untouched (RPC smoke E); activate-on-inactive-skill = version active but skill still hidden from PMs (staging semantics, RLS P1/P2); cross-tenant / non-member → 404/0 rows (pentest P9/P10); non-admin write → blocked (pentest P5–P8); empty body allowed (default `''`). Frontmatter-parse-fail edge case is N/A by design (form-first).

### Security audit (red-team, live against prod, 0 residue)
- **RLS role pentest 11/11 PASS** (`tests/sql/PROJ-76-skill-framework-rls-pentest.sql`): member sees active-only (P1/P2), versions of active only (P3/P4), non-admin INSERT skill blocked 42501 (P5), non-admin UPDATE = 0 rows (P6), non-admin INSERT version blocked (P7), non-admin `activate` RPC blocked 42501 (P8, admin-gate), non-member (stranger) sees 0 skills+versions across ALL tenants → **tenant isolation** (P9/P10), admin sees all incl. inactive (P11).
- **RPC state-machine + immutability smoke 8/8 PASS** (`tests/sql/PROJ-76-skill-framework-rpc-smoke.sql`): activate, single-active-demote + pointer move, content-immutability blocked (23514), status-immutability blocked (23514), rollback content-copy, idempotent re-activate, admin-gate (stranger 42501), audit rows.
- Advisors: **0 ERROR** (the 2 `authenticated_security_definer_function_executable` WARNs on the RPCs are the by-design state-machine pattern shared across the codebase).
- Input validation: Zod at every boundary; UUID-checked route params; slug regex; tag-vocab whitelist. No injection surface (parameterised, no dynamic SQL in app code).

### Automated tests
- **Full vitest regression: 2337/2337 passed** (300 files) — no regressions.
- PROJ-76 unit/route: 23/23 (serialize round-trip + skills/[id] routes).
- **Playwright `tests/PROJ-76-skill-framework.spec.ts`: 12/12 chromium** — all 3 pages + all API endpoints (collection/single/versions/activate/rollback/toggle) return 307/401/403 unauthenticated.

### Findings
- **0 Critical, 0 High, 0 Medium.**
- **Info/deviation (not a bug):** audit "Verlauf" tab omitted from the detail UI — `AuditEntityType` doesn't yet include `skills`/`skill_versions`; the DB audit rows exist and are RLS-gated (verified). Widening the client audit type + adding a `HistoryTab` prop path = **PROJ-Y follow-up**.
- **Env deviation:** Mobile-Safari Playwright project skipped (WebKit host libs missing — repo-wide, PROJ-67/F2). Chromium fully green.

### QA fixture note
The prod DB has a minimal seed (2 users / 2 tenants, both memberships `admin`). The non-admin-member and tenant-isolation vectors were exercised by synthesising a `member` row inside the rolled-back pentest transaction and by a non-member "stranger" JWT — 0 residue confirmed after every run.

## Deployment

**Deployed 2026-07-24 — Tag `v2.22.0-PROJ-76`** (squash-merge PR #255 → `main` `98ac44e`).

- Migration `20260723120849_proj76_skill_framework` was already applied to prod during `/backend`; this deploy is code-merge + bookkeeping (no new DB change at deploy time).
- Branch `proj-76/architecture` merged origin/main conflict-free (auto-merge across INDEX/nav/stammdaten hotspots); merged-tree gates re-verified: vitest **2438/2438**, build clean, tsc 0 skill errors, eslint 0 on new files.
- Required checks all green on #255: Schema-Drift-Guard, Migration-Naming-Guard, npm-audit (prod), Snyk. Vercel prod deploy completed.
- Post-deploy prod smoke: `/skills`, `/stammdaten/skills`, `/api/skills` → **307** (auth-gate intact; new routes live).
- Env: no new secret/variable; `js-yaml` was already resolved via the `overrides` pin (now a declared direct dep) → prod audit surface unchanged.

**Open follow-up (PROJ-Y candidate):** audit "Verlauf" tab in the skill-detail UI — widen `AuditEntityType` with `skills`/`skill_versions` + wire `HistoryTab` (DB audit rows already exist and are RLS-gated).
