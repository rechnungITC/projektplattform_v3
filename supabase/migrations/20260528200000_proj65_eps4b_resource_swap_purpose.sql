-- =============================================================================
-- PROJ-65 ε.4.β — `resource_swap` AI purpose (Class-3 hard-fix, Ollama-only)
-- =============================================================================
-- Second of three AI purposes in PROJ-65 ε.4. **Class-3 by design**:
-- recommends "replace stakeholder/resource A with B for work-item X" —
-- the rationale references named people, skill profiles, and (bucketed)
-- day rates. Never routed externally; tenant-supplied Ollama is the
-- only allowed provider, otherwise the run is `external_blocked` with
-- empty output and a user-visible banner.
--
-- Persistence reuses `ki_runs` + `ki_suggestions` (purpose-checks extended).
-- Accept is advisory (no DB entity created); the UI offers a separate
-- "Im Swap-Preview öffnen"-button that wires to PROJ-65 ε.2's existing
-- `stakeholder-swap-preview` endpoint without coupling the AI accept to
-- the operational swap action.
--
-- CIA-locked architecture (2026-05-28):
--   L1  Class-3 hard-fix at classifier
--   L2  Ollama-only routing; Ollama-error → `external_blocked` (NO Stub fallback)
--   L3  Rate-bucketing in auto-context for non-cost-clear-view users
--       (editors see low|mid|high buckets, not €-amounts)
--   L4  Advisory accept; explicit "Open Preview" is a separate audit event
--   L5  No heuristic Stub — emit empty + banner like sentiment/coaching
--   L6  Pre-rank candidate resources locally (deterministic, top-N=10)
--   L7  ki_suggestions for purpose='resource_swap' readable by project
--       members (existing RLS); rate-bucketing is the privacy boundary
--       rather than purpose-specific RLS gating.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. ki_runs.purpose CHECK — admit 'resource_swap'
-- ---------------------------------------------------------------------------
alter table public.ki_runs
  drop constraint if exists ki_runs_purpose_check;
alter table public.ki_runs
  add constraint ki_runs_purpose_check
  check (purpose = any (array[
    'risks'::text, 'decisions'::text, 'work_items'::text, 'open_items'::text,
    'narrative'::text,
    'trajectory_sequence'::text,
    -- PROJ-65 ε.4.β
    'resource_swap'::text
  ]));

-- ---------------------------------------------------------------------------
-- 2. ki_suggestions.purpose CHECK — admit 'resource_swap'
-- ---------------------------------------------------------------------------
alter table public.ki_suggestions
  drop constraint if exists ki_suggestions_purpose_check;
alter table public.ki_suggestions
  add constraint ki_suggestions_purpose_check
  check (purpose in (
    'risks','decisions','work_items','open_items',
    'trajectory_sequence',
    -- PROJ-65 ε.4.β
    'resource_swap'
  ));

-- ---------------------------------------------------------------------------
-- 3. ki_suggestions accepted-consistency — relax for advisory purposes
-- ---------------------------------------------------------------------------
-- trajectory_sequence + resource_swap are both advisory: accept flips the
-- status without creating a downstream DB entity.
alter table public.ki_suggestions
  drop constraint if exists ki_suggestions_accepted_consistency;
alter table public.ki_suggestions
  add constraint ki_suggestions_accepted_consistency
  check (
    (status = 'accepted' and (
      (accepted_entity_type is not null and accepted_entity_id is not null)
      or
      purpose in ('trajectory_sequence', 'resource_swap')
    ))
    or
    (status <> 'accepted' and accepted_entity_type is null and accepted_entity_id is null)
  );

-- ---------------------------------------------------------------------------
-- 4. tenant_ai_cost_caps.purpose CHECK — admit 'resource_swap'
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
      -- PROJ-65 ε.4.β
      'resource_swap'
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
  if v_def is null or v_def not like '%resource_swap%' then
    raise exception 'smoke-fail: ki_runs_purpose_check missing resource_swap (def=%)', v_def;
  end if;

  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conname = 'ki_suggestions_purpose_check';
  if v_def is null or v_def not like '%resource_swap%' then
    raise exception 'smoke-fail: ki_suggestions_purpose_check missing resource_swap (def=%)', v_def;
  end if;

  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conname = 'ki_suggestions_accepted_consistency';
  if v_def is null or v_def not like '%resource_swap%' then
    raise exception 'smoke-fail: ki_suggestions_accepted_consistency missing resource_swap relaxation (def=%)', v_def;
  end if;

  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conname = 'tenant_ai_cost_caps_purpose_check';
  if v_def is null or v_def not like '%resource_swap%' then
    raise exception 'smoke-fail: tenant_ai_cost_caps_purpose_check missing resource_swap (def=%)', v_def;
  end if;

  raise notice 'PROJ-65 eps4b smoke checks passed';
end
$smoke$;
