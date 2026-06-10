-- PROJ-88 (ollama-robustness follow-up) — restore 'sentiment' + 'coaching'
-- in ki_runs_purpose_check
--
-- Root cause: PROJ-34-γ.1 (sentiment) and PROJ-34-ε (coaching) added their
-- purposes to `tenant_ai_cost_caps_purpose_check` (20260513161000) but never
-- to `ki_runs_purpose_check`. Every subsequent lockstep re-enumeration
-- (ε.4a/ε.4b/ε.4c, PROJ-70-α, PROJ-88) copied the incomplete list forward.
-- Result: `insertKiRun(purpose='coaching'|'sentiment')` violates the CHECK,
-- so invokeCoachingGeneration / invokeSentimentGeneration 5xx in prod
-- (0 rows with these purposes exist in ki_runs — masked by mocked tests).
--
-- ki_suggestions_purpose_check is intentionally NOT touched: sentiment and
-- coaching never write ki_suggestions (sentiment persists on
-- stakeholder_interactions, coaching on stakeholder_coaching_recommendations;
-- the suggestions PATCH route 422s purpose='coaching' by design).

alter table public.ki_runs
  drop constraint if exists ki_runs_purpose_check;
alter table public.ki_runs
  add constraint ki_runs_purpose_check
  check (purpose = any (array[
    'risks'::text, 'decisions'::text, 'work_items'::text, 'open_items'::text,
    'narrative'::text,
    -- PROJ-34 — restored (see header)
    'sentiment'::text,
    'coaching'::text,
    'trajectory_sequence'::text,
    'resource_swap'::text,
    'cross_project_links'::text,
    'proposal_from_context'::text,
    'proposal_stakeholders_from_context'::text
  ]));

-- =============================================================================
-- Smoke checks (static, no data mutation)
-- =============================================================================
do $smoke$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conname = 'ki_runs_purpose_check';

  if v_def is null then
    raise exception 'SMOKE FAIL: ki_runs_purpose_check missing entirely';
  end if;

  -- The restored purposes…
  if v_def not like '%sentiment%' or v_def not like '%coaching%' then
    raise exception 'SMOKE FAIL: ki_runs_purpose_check still missing sentiment/coaching (def=%)', v_def;
  end if;

  -- …and no regression on any previously admitted purpose.
  if v_def not like '%narrative%'
     or v_def not like '%trajectory_sequence%'
     or v_def not like '%resource_swap%'
     or v_def not like '%cross_project_links%'
     or v_def not like '%proposal_from_context%'
     or v_def not like '%proposal_stakeholders_from_context%' then
    raise exception 'SMOKE FAIL: ki_runs_purpose_check dropped an existing purpose (def=%)', v_def;
  end if;

  raise notice 'PROJ-88 ki_runs purpose-check restore smoke passed.';
end
$smoke$;
