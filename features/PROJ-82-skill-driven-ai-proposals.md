# PROJ-82: Skill-driven AI Proposals

## Status: Planned
**Created:** 2026-06-06
**Last Updated:** 2026-06-07

## Summary
Connects Skills (PROJ-76) to the existing AI Proposal Layer (PROJ-12). When a PM triggers an action that has AI assistance (create work item, suggest risks, plan phases, draft acceptance criteria, etc.), the system picks the matching assigned Skill(s) from PROJ-78, loads the skill's markdown + scoped RAG context (PROJ-80/81), and invokes the agent to produce proposal entries in `ki_suggestions`. The PM reviews and accepts as today. When multiple skills match, the system explicitly asks the PM to pick one or run both.

## Dependencies
- Requires: PROJ-76 (Skill-Framework — content)
- Requires: PROJ-77 (Skill-Customizing — `allowed_actions` enforcement)
- Requires: PROJ-78 (Skill-Projektzuordnung — which skills apply)
- Requires: PROJ-80 (RAG retrieval)
- Requires: PROJ-81 (Scope enforcement)
- Requires: PROJ-12 (AI Proposal Layer — target system for proposals)
- Requires: PROJ-9 (Work item metamodel — for `allowed_kinds`)
- Influences: PROJ-83 (Task-driven Content Generation — shares same invocation core)
- Influences: PROJ-84 (KI-Kennzeichnung — proposals are flagged AI-generated)

## V2 Reference Material
- ADR `v3-ai-proposal-architecture.md` (referenced from PROJ-7).
- ADR `architecture-principles` — "AI as proposal layer, never silent mutation".

## User Stories
- **[V3 SK-25]** As a PM, when I trigger an AI-assisted action on a project artifact, I want the system to use the project's assigned Skills, so that the proposals reflect the chosen methodology and project type.
- **[V3 SK-26]** As a PM, when multiple Skills match my action (e.g. Scrum Master + Datenschützer on a DSGVO-affecting story), I want to choose which Skill drives the proposal — or run both and see two proposals, so that I stay in control of conflicting perspectives.
- **[V3 SK-27]** As the system, I want to enforce a Skill's `allowed_actions` list, so that a Skill cannot propose artifact kinds outside its mandate.
- **[V3 SK-28]** As a PM, I want to see a per-proposal indicator showing which Skill generated it, so that I can trace the reasoning back to a specific persona.
- **[V3 SK-29]** As an admin, I want a configurable conflict-resolution mode at tenant level (PM picks / sequential / priority order), so that we can decide the default tenant-wide.

## Acceptance Criteria

### Skill-to-action mapping
- [ ] Action enum (V1): `propose_work_item`, `propose_risk`, `propose_budget_item`, `propose_phase`, `propose_milestone`, `propose_acceptance_criteria`, `propose_dependency`.
- [ ] Each Skill's `frontmatter.allowed_actions[]` (PROJ-77) lists which of these it can run.
- [ ] When the PM triggers action X on project P:
  1. System fetches active `project_skills` for P (PROJ-78).
  2. Filters to skills where `allowed_actions` contains X.
  3. If zero → respond "No Skill is configured for this action in this project" with deep link for admin.
  4. If exactly one → proceed directly.
  5. If more than one → conflict resolution (see below).

### Conflict resolution
- [ ] Tenant setting `skill_conflict_mode TEXT CHECK (skill_conflict_mode IN ('pm_picks','sequential','priority_order'))` with default `pm_picks`.
- [ ] **`pm_picks`**: UI dialog lists matching skills; PM picks one or "Run all (parallel)".
- [ ] **`sequential`**: All matching skills run in order of `project_skills.assigned_at`; outputs aggregated into a single proposal review queue.
- [ ] **`priority_order`**: Method-skill > project_type-skill > cross_cutting (deterministic).
- [ ] All matching skills' results are written as separate `ki_suggestions` rows, each tagged with `originating_skill_id` and `originating_skill_version_id`.

### Invocation flow
- [ ] New endpoint `POST /api/projects/:id/ai/run-action` with body `{ action, target_table, target_row_id?, input_payload?, force_skill_id? }`.
- [ ] Server:
  1. Validates action against assigned skills.
  2. Resolves RAG scope via PROJ-81.
  3. Builds prompt: skill.markdown + frontmatter directives + RAG context + input_payload.
  4. Calls LLM, parses output into a `payload` matching the existing `ki_suggestions` purpose-specific schema.
  5. Writes one `ki_suggestions` row per skill outcome with `originating_skill_id` and `originating_skill_version_id` columns added to that table.
  6. Returns the created proposal ids.
- [ ] Allowed-action check: if a skill returns a proposal for a kind not in its `allowed_actions`, the row is rejected and `skill.action_denied` audited.

### Schema additions to existing `ki_suggestions`
- [ ] Add columns: `originating_skill_id UUID REFERENCES skills(id)`, `originating_skill_version_id UUID REFERENCES skill_versions(id)`, `rag_scope_size INT`, `conflict_group_id UUID NULL`.
- [ ] `conflict_group_id` groups proposals produced by the same triggered action when multiple skills ran.

### UI
- [ ] In the AI-proposal review inbox (existing PROJ-12 surface), each proposal card shows: skill name, skill version badge, conflict group indicator if part of a multi-skill run.
- [ ] PM can compare proposals within a conflict group side-by-side and accept one (others auto-archive with status `rejected_in_conflict_resolution`).

### Audit
- [ ] Events: `ai.action_invoked`, `ai.proposal_created`, `ai.proposal_accepted`, `ai.proposal_rejected`, `skill.action_denied`, `skill.conflict_resolved`.

## Edge Cases
- **No skills match action** → user gets actionable error with admin deep link.
- **Skill markdown is malformed at invocation time** → invocation fails fast with a structured error; proposal not created; audit row `ai.invocation_failed`.
- **LLM output cannot be parsed into target schema** → proposal row created with `status='parse_error'` and raw output in `error_payload` for review.
- **Skill returns multiple sub-proposals** (e.g. one input → three suggested risks) → each becomes a separate `ki_suggestions` row sharing one `conflict_group_id`.
- **`allowed_actions` empty** → skill is treated as `read_only`; cannot be invoked for any action; visible only as RAG context donor where applicable.
- **Skill deactivated mid-flight** → in-progress invocation completes (was already loaded); next invocation skips it.
- **PM cancels conflict-resolution dialog without picking** → no `ki_suggestions` rows are persisted.
- **Rate limit / cost guard at tenant level** → exceeding budget returns 429 with retry hint; tracked in PROJ-84 cost ledger if implemented.

## Technical Requirements
- **Stack:** Next.js 16 + Supabase (Edge Functions for LLM calls or server actions), shadcn/ui (`Dialog`, `Tabs`, `Badge`, `RadioGroup`).
- **Multi-tenant:** every row in `ki_suggestions` already carries `tenant_id`; new FK columns inherit; scope resolution joins through `project_skills`.
- **Validation:** Zod for action payloads; LLM output validated against a Zod schema per `target_table`.
- **Auth:** project_lead or editor role on the project to trigger; viewer role can read proposals only.
- **Performance:** Skill invocation runs async with a background job; PM sees "Vorschlag wird erstellt …" state with optimistic placeholder. Target end-to-end latency ≤ 30 s.
- **Cost guard:** per-tenant cost ledger increment per invocation (token usage estimate). Hard limit per license tier (open question — V1 default budget configurable).
- **Audit hook:** PROJ-10.

## Out of Scope
- Auto-acceptance of proposals (explicit ADR `architecture-principles` says never).
- Conversational refinement of a single proposal in chat (V2; PROJ-83 handles document chat).
- Learning loop (reuse accepted proposals as future few-shot examples) — V2.
- A/B comparison of two skill versions on the same action — V2.

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be filled by /architecture._

## Implementation Notes
_To be added by /frontend and /backend._

## QA Test Results
_To be added by /qa._

## Deployment
_To be added by /deploy._
