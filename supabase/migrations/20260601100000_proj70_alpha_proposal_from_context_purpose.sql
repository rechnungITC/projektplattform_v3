-- =============================================================================
-- PROJ-70-α — `proposal_from_context` AI purpose
-- =============================================================================
-- First slice of PROJ-70 (Auto-Generated Backlog from Project Kickoff).
-- Purpose: user uploads a kickoff artefact (text/markdown/email plaintext
-- in α; PDF/DOCX/.msg/.eml in γ/δ) → the AI router proposes a
-- hierarchical backlog (Phasen/Stories/Tasks methoden-passend) → user
-- reviews + accepts in slice 70-β.
--
-- Persistence reuses the PROJ-12 `ki_runs` + `ki_suggestions` tables.
-- Four CHECK constraints expand to admit the new purpose:
--   * ki_runs_purpose_check
--   * ki_suggestions_purpose_check
--   * tenant_ai_cost_caps_purpose_check
--   * ki_suggestions_accepted_consistency (relaxed for advisory accept)
--
-- Class-2 default; the heuristic classifier in `classify.ts` may upgrade
-- a run to Class-3 when personal-data markers (email / DACH-name /
-- DACH-phone patterns) are detected in the `content_excerpt`.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. ki_runs.purpose CHECK — admit 'proposal_from_context'
-- ---------------------------------------------------------------------------
alter table public.ki_runs
  drop constraint if exists ki_runs_purpose_check;
alter table public.ki_runs
  add constraint ki_runs_purpose_check
  check (purpose = any (array[
    'risks'::text, 'decisions'::text, 'work_items'::text, 'open_items'::text,
    'narrative'::text,
    'trajectory_sequence'::text,
    'resource_swap'::text,
    'cross_project_links'::text,
    -- PROJ-70-α
    'proposal_from_context'::text
  ]));

-- ---------------------------------------------------------------------------
-- 2. ki_suggestions.purpose CHECK — admit 'proposal_from_context'
-- ---------------------------------------------------------------------------
alter table public.ki_suggestions
  drop constraint if exists ki_suggestions_purpose_check;
alter table public.ki_suggestions
  add constraint ki_suggestions_purpose_check
  check (purpose in (
    'risks','decisions','work_items','open_items',
    'trajectory_sequence',
    'resource_swap',
    'cross_project_links',
    -- PROJ-70-α
    'proposal_from_context'
  ));

-- ---------------------------------------------------------------------------
-- 3. ki_suggestions accepted-consistency — relax for advisory purposes
-- ---------------------------------------------------------------------------
-- trajectory_sequence + resource_swap + cross_project_links + proposal_from_context
-- are all advisory at the router level: accept flips the status without
-- creating a downstream DB entity. The actual work_item-row gets created
-- by a separate operational flow (Plan-Mutate for trajectory_sequence,
-- Swap-Preview for resource_swap, PROJ-27 link-dialog for cross_project_links,
-- and the 70-β bulk-accept-pipeline for proposal_from_context).
alter table public.ki_suggestions
  drop constraint if exists ki_suggestions_accepted_consistency;
alter table public.ki_suggestions
  add constraint ki_suggestions_accepted_consistency
  check (
    (status = 'accepted' and (
      (accepted_entity_type is not null and accepted_entity_id is not null)
      or
      purpose in (
        'trajectory_sequence',
        'resource_swap',
        'cross_project_links',
        'proposal_from_context'
      )
    ))
    or
    (status <> 'accepted' and accepted_entity_type is null and accepted_entity_id is null)
  );

-- ---------------------------------------------------------------------------
-- 4. tenant_ai_cost_caps.purpose CHECK — admit 'proposal_from_context'
-- ---------------------------------------------------------------------------
alter table public.tenant_ai_cost_caps
  drop constraint if exists tenant_ai_cost_caps_purpose_check;
alter table public.tenant_ai_cost_caps
  add constraint tenant_ai_cost_caps_purpose_check
  check (
    purpose is null or purpose in (
      'risks','decisions','work_items','open_items',
      'narrative','sentiment','coaching',
      'trajectory_sequence',
      'resource_swap',
      'cross_project_links',
      -- PROJ-70-α
      'proposal_from_context'
    )
  );


-- =============================================================================
-- Smoke checks (static, no data mutation)
-- =============================================================================
do $smoke$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conname = 'ki_runs_purpose_check';
  if v_def is null or v_def not like '%proposal_from_context%' then
    raise exception 'smoke-fail: ki_runs_purpose_check missing proposal_from_context (def=%)', v_def;
  end if;

  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conname = 'ki_suggestions_purpose_check';
  if v_def is null or v_def not like '%proposal_from_context%' then
    raise exception 'smoke-fail: ki_suggestions_purpose_check missing proposal_from_context (def=%)', v_def;
  end if;

  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conname = 'ki_suggestions_accepted_consistency';
  if v_def is null or v_def not like '%proposal_from_context%' then
    raise exception 'smoke-fail: ki_suggestions_accepted_consistency missing proposal_from_context relaxation (def=%)', v_def;
  end if;

  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conname = 'tenant_ai_cost_caps_purpose_check';
  if v_def is null or v_def not like '%proposal_from_context%' then
    raise exception 'smoke-fail: tenant_ai_cost_caps_purpose_check missing proposal_from_context (def=%)', v_def;
  end if;

  raise notice 'PROJ-70 alpha smoke checks passed';
end
$smoke$;
