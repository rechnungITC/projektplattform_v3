-- =============================================================================
-- PROJ-65 ε.4.γ — `cross_project_links` AI purpose (Class-2, advisory)
-- =============================================================================
-- Third (and final) of three AI purposes in PROJ-65 ε.4. Class-2 (Cloud OK):
-- AI proposes useful semantic links between work items across related
-- projects in the tenant portfolio — `relates`, `blocks`, `requires`,
-- `duplicates`, `delivers`, `precedes`, `includes`. The user reviews each
-- suggestion and (advisory-)accepts to acknowledge; the actual link is
-- created via the existing PROJ-27 create-link dialog with its own audit
-- trail.
--
-- Persistence reuses the PROJ-12 `ki_runs` + `ki_suggestions` tables. Same
-- pattern as ε.4.α `trajectory_sequence` and ε.4.β `resource_swap`:
--   * ki_runs_purpose_check expands to admit 'cross_project_links'
--   * ki_suggestions_purpose_check expands too
--   * ki_suggestions_accepted_consistency relaxes for advisory acceptance
--     (no downstream `accepted_entity_*` link required at accept-time)
--   * tenant_ai_cost_caps_purpose_check expands
--
-- Class-2 hard floor lives in the router via
-- `classifyCrossProjectLinksAutoContext` (whitelist-based, defense-in-depth
-- over the auto-context allowlist). NO `responsible_user_id`, NO
-- `description`, NO stakeholder joins anywhere in the payload — strictly
-- structural metadata + project/work-item titles.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. ki_runs.purpose CHECK — admit 'cross_project_links'
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
    -- PROJ-65 ε.4.γ
    'cross_project_links'::text
  ]));

-- ---------------------------------------------------------------------------
-- 2. ki_suggestions.purpose CHECK — admit 'cross_project_links'
-- ---------------------------------------------------------------------------
alter table public.ki_suggestions
  drop constraint if exists ki_suggestions_purpose_check;
alter table public.ki_suggestions
  add constraint ki_suggestions_purpose_check
  check (purpose in (
    'risks','decisions','work_items','open_items',
    'trajectory_sequence',
    'resource_swap',
    -- PROJ-65 ε.4.γ
    'cross_project_links'
  ));

-- ---------------------------------------------------------------------------
-- 3. ki_suggestions accepted-consistency — relax for advisory purposes
-- ---------------------------------------------------------------------------
-- trajectory_sequence + resource_swap + cross_project_links are all advisory:
-- accept flips the status without creating a downstream DB entity. The user
-- applies the actual change via the corresponding operational flow
-- (Plan-Mutate, Swap-Preview, or PROJ-27 link-create dialog).
alter table public.ki_suggestions
  drop constraint if exists ki_suggestions_accepted_consistency;
alter table public.ki_suggestions
  add constraint ki_suggestions_accepted_consistency
  check (
    (status = 'accepted' and (
      (accepted_entity_type is not null and accepted_entity_id is not null)
      or
      purpose in ('trajectory_sequence', 'resource_swap', 'cross_project_links')
    ))
    or
    (status <> 'accepted' and accepted_entity_type is null and accepted_entity_id is null)
  );

-- ---------------------------------------------------------------------------
-- 4. tenant_ai_cost_caps.purpose CHECK — admit 'cross_project_links'
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
      -- PROJ-65 ε.4.γ
      'cross_project_links'
    )
  );


-- =============================================================================
-- Smoke checks (static, no data mutation)
-- =============================================================================
do $smoke$
declare
  v_def text;
begin
  -- 1. ki_runs CHECK accepts cross_project_links
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conname = 'ki_runs_purpose_check';
  if v_def is null or v_def not like '%cross_project_links%' then
    raise exception 'smoke-fail: ki_runs_purpose_check missing cross_project_links (def=%)', v_def;
  end if;

  -- 2. ki_suggestions CHECK accepts cross_project_links
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conname = 'ki_suggestions_purpose_check';
  if v_def is null or v_def not like '%cross_project_links%' then
    raise exception 'smoke-fail: ki_suggestions_purpose_check missing cross_project_links (def=%)', v_def;
  end if;

  -- 3. ki_suggestions accepted-consistency relaxation present
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conname = 'ki_suggestions_accepted_consistency';
  if v_def is null or v_def not like '%cross_project_links%' then
    raise exception 'smoke-fail: ki_suggestions_accepted_consistency missing cross_project_links relaxation (def=%)', v_def;
  end if;

  -- 4. cost_caps CHECK accepts cross_project_links
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conname = 'tenant_ai_cost_caps_purpose_check';
  if v_def is null or v_def not like '%cross_project_links%' then
    raise exception 'smoke-fail: tenant_ai_cost_caps_purpose_check missing cross_project_links (def=%)', v_def;
  end if;

  raise notice 'PROJ-65 eps4c smoke checks passed';
end
$smoke$;
