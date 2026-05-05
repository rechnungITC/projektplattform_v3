-- =============================================================================
-- PROJ-32-b — extend ki_runs CHECKs for new providers + missing narrative
-- =============================================================================
-- 1. ki_runs.provider was hardcoded to ('anthropic','stub','ollama') —
--    extend with 'openai','google' so router.ts inserts succeed.
-- 2. ki_runs.purpose was hardcoded to (risks,decisions,work_items,open_items)
--    — missing 'narrative' which PROJ-30 needs. Pre-existing bug surfaced
--    by 32b QA; including the fix here for atomic ship.
-- =============================================================================

alter table public.ki_runs
  drop constraint if exists ki_runs_provider_check;

-- The original constraint name may vary; this is a defensive-pattern
-- find. We add the new one regardless.
do $$
declare
  v_cname text;
begin
  for v_cname in
    select conname from pg_constraint
    where conrelid = 'public.ki_runs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%anthropic%stub%ollama%'
  loop
    execute format('alter table public.ki_runs drop constraint %I', v_cname);
  end loop;
end;
$$;

alter table public.ki_runs
  add constraint ki_runs_provider_check
    check (provider = any(array['anthropic','stub','ollama','openai','google']));

-- Same defensive find-and-replace for the purpose CHECK
do $$
declare
  v_cname text;
begin
  for v_cname in
    select conname from pg_constraint
    where conrelid = 'public.ki_runs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%risks%decisions%work_items%open_items%'
      and pg_get_constraintdef(oid) not like '%narrative%'
  loop
    execute format('alter table public.ki_runs drop constraint %I', v_cname);
  end loop;
end;
$$;

alter table public.ki_runs
  add constraint ki_runs_purpose_check
    check (purpose = any(array['risks','decisions','work_items','open_items','narrative']));
