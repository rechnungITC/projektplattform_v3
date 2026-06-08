# PROJ-77: Skill-Customizing

## Status: Planned
**Created:** 2026-06-06
**Last Updated:** 2026-06-07

## Summary
Extends PROJ-76 with the three customizing dimensions confirmed in /requirements: linked knowledge sources from the DMS, reusable example interactions, and an explicit allow-list of actions a skill's agent may perform. Plus a proper draft-and-publish workflow on top of the version mechanism. Admin-only.

## Dependencies
- Requires: PROJ-76 (Skill-Framework Foundation)
- Requires: PROJ-79 (DMS Foundation) — knowledge sources reference document nodes
- Requires: PROJ-10 (Audit)
- Influences: PROJ-80 (RAG) — examples and knowledge links feed retrieval prompts
- Influences: PROJ-82 (Skill-driven AI Proposals) — `allowed_actions` is enforced at proposal time

## V2 Reference Material
- None.
- ADR to be created: `docs/decisions/skill-allowed-actions.md`.

## User Stories
- **[V3 SK-07]** As a tenant admin, I want to link specific DMS document nodes to a Skill, so that the Skill's agent can read those documents at runtime through PROJ-80 retrieval.
- **[V3 SK-08]** As a tenant admin, I want to attach reusable input/output example pairs to a Skill, so that the agent learns expected patterns by example.
- **[V3 SK-09]** As a tenant admin, I want to declare which actions a Skill's agent may perform (`create_proposal`, `create_document`, `read_only`, etc.), so that the agent cannot take actions outside its mandate.
- **[V3 SK-10]** As a tenant admin, I want a clean draft → review → publish flow on skill versions with a rollback path, so that I can iterate without exposing half-finished changes to PMs.

## Acceptance Criteria

### `skill_knowledge_links` table
- [ ] `id UUID PK, skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE, document_node_id UUID NOT NULL REFERENCES document_tree_nodes(id) ON DELETE CASCADE, include_subtree BOOLEAN NOT NULL DEFAULT false, link_mode TEXT NOT NULL CHECK (link_mode IN ('reference','required')), tenant_id UUID NOT NULL`.
- [ ] Unique `(skill_id, document_node_id)`.
- [ ] `link_mode='required'` means agent must include this in retrieval context; `reference` means optional weighting.
- [ ] RLS: tenant-scoped, admin write.

### `skill_examples` table
- [ ] `id UUID PK, skill_id UUID NOT NULL, title TEXT NOT NULL, input TEXT NOT NULL, expected_output TEXT NOT NULL, tags TEXT[] DEFAULT '{}', display_order INT NOT NULL DEFAULT 0, tenant_id UUID NOT NULL`.
- [ ] Examples ordered by `display_order` then `created_at`.

### Allowed actions
- [ ] Stored in `skill_versions.frontmatter` as `allowed_actions: string[]` (validated against a fixed enum, V1 list: `propose_work_item`, `propose_risk`, `propose_budget_item`, `propose_phase`, `propose_milestone`, `generate_document`, `summarize_document`, `read_only`).
- [ ] Enforced server-side in PROJ-82 proposal endpoints and PROJ-83 document-generation endpoint: skills attempt actions outside their allow-list → 403 + audit `skill.action_denied`.

### Draft → publish workflow
- [ ] Admin edits markdown of a version with `status='draft'`. Draft is invisible to PMs (PROJ-76 only exposes `active`).
- [ ] Admin clicks "Publish" → backend transitions: previous active → `archived`, draft → `active`, `skills.current_version_id` updated.
- [ ] "Save as Draft" creates a NEW draft if current version is already `active`; never mutates an active version's content.
- [ ] Concurrent edit detection: if two admins edit the same draft, the second `PATCH` carries `If-Match: <updated_at>`; mismatch → 409.

### Rollback UX
- [ ] On admin detail page, version timeline shows status badges (draft / active / archived) and a "Rollback to this version" action on archived rows.
- [ ] Rollback opens a confirmation dialog showing the diff between current active and the target archived version's content.

### Audit
- [ ] Events: `skill_knowledge_link.added`, `skill_knowledge_link.removed`, `skill_example.added`, `skill_example.updated`, `skill_example.removed`, `skill_version.published`, `skill_version.draft_discarded`.
- [ ] Action-denial events: `skill.action_denied` with action_name and reason.

## Edge Cases
- **Linked document node is deleted in DMS** → `skill_knowledge_links` row cascade-deletes. If `link_mode='required'` and skill becomes unusable, surface a warning on the skill detail page; PROJ-82 returns a soft warning rather than failing the action.
- **Skill has zero linked knowledge nodes** → permitted; agent runs prompt-only.
- **`allowed_actions` includes an unknown action** → 422 at publish time (validated against enum).
- **Two admins activate two different drafts within the same second** → DB constraint (only one active per skill) plus optimistic concurrency on `skills.current_version_id` ensures one of them gets 409.
- **Example with empty input or expected_output** → 422.
- **Examples carry PII** → flagged for review (heuristic optional in V1); enforced by PROJ-84 data-class tags.

## Technical Requirements
- **Stack:** Next.js 16 + Supabase, shadcn/ui (`Dialog`, `Tabs`, `Badge`, `AlertDialog` for destructive ops).
- **Diff view:** lightweight client-side text-diff for rollback confirmation (e.g. `diff-match-patch` or shadcn's own).
- **Multi-tenant:** all new tables carry `tenant_id` with cascade delete; RLS via `is_tenant_admin()` and `is_tenant_member()`.
- **Validation:** Zod for table writes; allowed_actions enum centralized in `src/lib/skills/allowed-actions.ts`.
- **Auth:** Supabase Auth; admin gate everywhere.
- **Audit hook:** PROJ-10.

## Out of Scope
- Example-based fine-tuning of the underlying LLM (just retrieval injection in V1).
- Action policies more nuanced than allow-list (e.g. rate limits per action).
- Knowledge link weight tuning (V2).
- Example-driven evaluation harness ("does the agent actually produce expected_output?").

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be filled by /architecture._

## Implementation Notes
_To be added by /frontend and /backend._

## QA Test Results
_To be added by /qa._

## Deployment
_To be added by /deploy._
