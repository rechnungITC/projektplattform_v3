# PROJ-81: Skill-to-RAG-Scope

## Status: Planned
**Created:** 2026-06-06
**Last Updated:** 2026-06-07

## Summary
Each Skill can be scoped to specific nodes in the project's DMS navigation tree. When the agent backing that skill performs retrieval (PROJ-80), only documents within the configured scope are returned. Without explicit scope, the skill sees the entire project's tree by default. The configured scopes feed both PROJ-77 (admin-configured links to global knowledge) and per-project overrides at the assignment edge.

## Dependencies
- Requires: PROJ-76 (Skill-Framework)
- Requires: PROJ-77 (Skill-Customizing — global knowledge_links exist there)
- Requires: PROJ-79 (DMS — tree nodes exist)
- Requires: PROJ-80 (RAG — enforcement happens at retrieval)
- Requires: PROJ-78 (Skill-Projektzuordnung — per-project association)
- Influences: PROJ-82, PROJ-83 (every agent invocation goes through scope check)

## V2 Reference Material
- None.

## User Stories
- **[V3 SK-23]** As a tenant admin, I want global knowledge links on a Skill (from PROJ-77) to act as a default scope across all projects using it, so that I can curate baseline reference material centrally.
- **[V3 SK-24]** As a PM, I want to refine the scope of a Skill for my project by picking specific tree nodes from my project DMS, so that the Skill's agent does not pull in irrelevant material from elsewhere in my project.

## Acceptance Criteria

### Data model
- [ ] Junction table `project_skill_scopes`: `id UUID PK, tenant_id UUID NOT NULL, project_skill_id UUID NOT NULL REFERENCES project_skills(id) ON DELETE CASCADE, document_node_id UUID NOT NULL REFERENCES document_tree_nodes(id) ON DELETE CASCADE, include_subtree BOOLEAN NOT NULL DEFAULT true, scope_mode TEXT NOT NULL CHECK (scope_mode IN ('include','exclude')), created_at, created_by`.
- [ ] Unique `(project_skill_id, document_node_id)`.

### Scope resolution at retrieval time
- [ ] Resolution algorithm (server-side, on every agent invocation):
  1. Start with the global `skill_knowledge_links` set (PROJ-77) restricted to the same tenant + cross-project knowledge.
  2. Plus the project's own tree nodes selected via `project_skill_scopes` with `scope_mode='include'` (recursive if `include_subtree=true`).
  3. Minus any explicitly excluded subtrees via `project_skill_scopes` with `scope_mode='exclude'`.
  4. If neither `skill_knowledge_links` (for the assigned skill version) nor `project_skill_scopes` rows exist → default scope = entire project DMS tree.
- [ ] Resolution returns a list of `document_id`s that are filterable in the `document_chunks` retrieval query.

### UI
- [ ] In the project room "Skills" tab (PROJ-78), each assigned skill shows a "Scope verwalten"-button (PM access).
- [ ] Modal lists global knowledge_links (read-only, with "global" badge) plus a tree picker for project-local include/exclude.
- [ ] Save writes `project_skill_scopes` rows.
- [ ] An informational summary line shows "Skill greift auf X Dokumente zu" with current scope size.

### Enforcement
- [ ] Any retrieval call in PROJ-82 and PROJ-83 MUST go through `resolveScopedDocumentIds(project_skill_id)` before querying `document_chunks`.
- [ ] Direct SQL or unscoped retrieval bypassing this function is forbidden; enforced by code-review + integration test.

### Audit
- [ ] Events: `project_skill_scope.added`, `project_skill_scope.removed`, `project_skill_scope.modified`.

## Edge Cases
- **No scope defined** → defaults to entire project tree (intentional).
- **Scope is non-empty but resolves to zero documents** (e.g. all selected nodes are empty folders) → retrieval returns empty; agent receives a "kein Dokument im aktuellen Scope" notice from the orchestrator. No fallback to other documents.
- **Excluded subtree overlaps with an included one** → exclude wins.
- **Scoped node is deleted (PROJ-79 soft delete)** → cascade-deletes the scope row; UI shows "Scope geändert (gelöschter Knoten entfernt)".
- **Global knowledge link is from a different project** (PROJ-77 supports cross-project) → permissioning verified: only documents the executing user has access to are retrieved; otherwise filtered server-side.
- **Concurrent scope edits by two PMs** → optimistic concurrency on `project_skill_scopes` (UI-level snapshot id).

## Technical Requirements
- **Stack:** Next.js 16 + Supabase, shadcn/ui (`Dialog`, `Tree`, `Badge`, `Switch`).
- **Multi-tenant:** `tenant_id` on every row; RLS via `is_project_member(project_id)` joined through `project_skills`.
- **Validation:** Zod for scope writes; CHECK constraint for `scope_mode`.
- **Auth:** PM project-lead or editor role for project-local scope; admin for global knowledge link changes (which actually lives in PROJ-77).
- **Performance:** scope resolution cached per `project_skill_id` for 5 min, invalidated on any scope or knowledge_link mutation.
- **Audit hook:** PROJ-10.

## Out of Scope
- Tag-based scoping (e.g. "all documents tagged 'risk'"). V2.
- Time-based scoping ("only documents from last 90 days"). V2.
- Document-level (vs node-level) include/exclude — V2.
- ML-assisted scope recommendation.

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be filled by /architecture._

## Implementation Notes
_To be added by /frontend and /backend._

## QA Test Results
_To be added by /qa._

## Deployment
_To be added by /deploy._
