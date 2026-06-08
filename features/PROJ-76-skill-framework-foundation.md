# PROJ-76: Skill-Framework Foundation

## Status: Planned
**Created:** 2026-06-06
**Last Updated:** 2026-06-07

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
_To be filled by /architecture._

## Implementation Notes
_To be added by /frontend and /backend._

## QA Test Results
_To be added by /qa._

## Deployment
_To be added by /deploy._
