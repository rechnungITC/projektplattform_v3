-- =============================================================================
-- PROJ-65 ε.4.α — `trajectory_sequence` AI purpose
-- =============================================================================
-- First of three AI purposes in PROJ-65 ε.4. Class-2 (Cloud OK):
-- AI proposes structural sequence improvements (reorder phases/sprints,
-- parallelize independent chains) based on phase/sprint/dependency layout.
-- Personal data is NOT in the context (Class-2-only allowlist enforced by
-- the context-builder and the data-privacy-registry).
--
-- Persistence reuses the PROJ-12 `ki_runs` + `ki_suggestions` tables. Three
-- CHECK constraints expand to admit the new purpose:
--   * ki_runs_purpose_check
--   * ki_suggestions_purpose_check
--   * tenant_ai_cost_caps_purpose_check
--
-- Plus one CHECK relaxation:
--   * ki_suggestions_accepted_consistency — trajectory_sequence acceptance is
--     advisory (no DB entity is created on accept; user reviews and applies
--     via the existing Plan-Mutate flow), so the `accepted_entity_*` link
--     becomes optional FOR THIS PURPOSE ONLY.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. ki_runs.purpose CHECK — admit 'trajectory_sequence'
-- ---------------------------------------------------------------------------
alter table public.ki_runs
  drop constraint if exists ki_runs_purpose_check;
alter table public.ki_runs
  add constraint ki_runs_purpose_check
  check (purpose = any (array[
    'risks'::text, 'decisions'::text, 'work_items'::text, 'open_items'::text,
    'narrative'::text,
    -- PROJ-65 ε.4.α
    'trajectory_sequence'::text
  ]));

-- ---------------------------------------------------------------------------
-- 2. ki_suggestions.purpose CHECK — admit 'trajectory_sequence'
-- ---------------------------------------------------------------------------
alter table public.ki_suggestions
  drop constraint if exists ki_suggestions_purpose_check;
alter table public.ki_suggestions
  add constraint ki_suggestions_purpose_check
  check (purpose in (
    'risks','decisions','work_items','open_items',
    -- PROJ-65 ε.4.α
    'trajectory_sequence'
  ));

-- ---------------------------------------------------------------------------
-- 3. ki_suggestions accepted-consistency — relax for advisory purposes
-- ---------------------------------------------------------------------------
-- Original constraint: when status='accepted' the suggestion MUST point at a
-- created DB entity (accepted_entity_type + accepted_entity_id NOT NULL).
-- Works for risks/decisions/work_items/open_items (accept creates a row).
--
-- `trajectory_sequence` is advisory: accept means "I acknowledge this
-- suggestion and intend to act on it"; the user then opens the existing
-- Plan-Mutate flow to apply changes. No new entity is created at accept-time.
-- Allow the link to be NULL for this purpose only.
alter table public.ki_suggestions
  drop constraint if exists ki_suggestions_accepted_consistency;
alter table public.ki_suggestions
  add constraint ki_suggestions_accepted_consistency
  check (
    (status = 'accepted' and (
      (accepted_entity_type is not null and accepted_entity_id is not null)
      or
      -- PROJ-65 ε.4.α — advisory purposes: accept without entity link
      purpose = 'trajectory_sequence'
    ))
    or
    (status <> 'accepted' and accepted_entity_type is null and accepted_entity_id is null)
  );

-- ---------------------------------------------------------------------------
-- 4. tenant_ai_cost_caps.purpose CHECK — admit 'trajectory_sequence'
-- ---------------------------------------------------------------------------
alter table public.tenant_ai_cost_caps
  drop constraint if exists tenant_ai_cost_caps_purpose_check;
alter table public.tenant_ai_cost_caps
  add constraint tenant_ai_cost_caps_purpose_check
  check (
    purpose is null or purpose in (
      'risks','decisions','work_items','open_items',
      'narrative','sentiment','coaching',
      -- PROJ-65 ε.4.α
      'trajectory_sequence'
    )
  );


-- =============================================================================
-- Smoke checks (static, no data mutation)
-- =============================================================================
do $smoke$
declare
  v_def text;
begin
  -- 1. ki_runs CHECK accepts trajectory_sequence
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conname = 'ki_runs_purpose_check';
  if v_def is null or v_def not like '%trajectory_sequence%' then
    raise exception 'smoke-fail: ki_runs_purpose_check missing trajectory_sequence (def=%)', v_def;
  end if;

  -- 2. ki_suggestions CHECK accepts trajectory_sequence
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conname = 'ki_suggestions_purpose_check';
  if v_def is null or v_def not like '%trajectory_sequence%' then
    raise exception 'smoke-fail: ki_suggestions_purpose_check missing trajectory_sequence (def=%)', v_def;
  end if;

  -- 3. ki_suggestions accepted-consistency relaxation present
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conname = 'ki_suggestions_accepted_consistency';
  if v_def is null or v_def not like '%trajectory_sequence%' then
    raise exception 'smoke-fail: ki_suggestions_accepted_consistency missing trajectory_sequence relaxation (def=%)', v_def;
  end if;

  -- 4. cost_caps CHECK accepts trajectory_sequence
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conname = 'tenant_ai_cost_caps_purpose_check';
  if v_def is null or v_def not like '%trajectory_sequence%' then
    raise exception 'smoke-fail: tenant_ai_cost_caps_purpose_check missing trajectory_sequence (def=%)', v_def;
  end if;

  raise notice 'PROJ-65 eps4a smoke checks passed';
end
$smoke$;
