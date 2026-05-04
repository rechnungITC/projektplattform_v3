-- =============================================================================
-- PROJ-36 Phase 36-α Rollback (Manual Runbook — DO NOT COMMIT AS MIGRATION)
-- =============================================================================
-- Use only if the α re-deploy (20260504400000_proj36a_wbs_hierarchy_rollup_redeploy)
-- needs to be reverted in production. Run in order, inside a transaction. Verify
-- pre-conditions before each step.
--
-- CRITICAL — DO NOT include the `_tracked_audit_columns()` rollback. The
-- PROJ-9-R2 migration (deployed 20260503200000) already contains
-- wbs_code / wbs_code_is_custom in the work_items audit whitelist. Reverting
-- the function definition here would break R2's audit-trail expectations.
-- The whitelist entries are harmless when the columns don't exist
-- (`to_jsonb(NEW)` simply has no key for them, audit diff stays empty).
-- =============================================================================

begin;

-- 1. Drop the 4 PROJ-36-α triggers on work_items.
drop trigger if exists tg_work_items_36a_rollup_recompute on public.work_items;
drop trigger if exists tg_work_items_36a_wbs_code_autogen on public.work_items;
drop trigger if exists tg_work_items_36a_outline_path_cascade on public.work_items;
drop trigger if exists tg_work_items_36a_outline_path_self on public.work_items;

-- 2. Drop the 4 trigger functions.
drop function if exists public.tg_work_items_36a_rollup_recompute_fn() cascade;
drop function if exists public.tg_work_items_36a_wbs_code_autogen_fn() cascade;
drop function if exists public.tg_work_items_36a_outline_path_cascade_fn() cascade;
drop function if exists public.tg_work_items_36a_outline_path_self_fn() cascade;

-- 3. Drop the indexes.
drop index if exists public.work_items_wbs_code_unique_per_sibling;
drop index if exists public.work_items_outline_path_btree;
drop index if exists public.work_items_outline_path_gist;

-- 4. Drop the format constraint.
alter table public.work_items
  drop constraint if exists work_items_wbs_code_format;

-- 5. Drop the 6 columns. Order matches the ALTER ADD order in reverse.
alter table public.work_items
  drop column if exists derived_estimate_hours,
  drop column if exists derived_planned_end,
  drop column if exists derived_planned_start,
  drop column if exists wbs_code_is_custom,
  drop column if exists wbs_code,
  drop column if exists outline_path;

-- 6. ltree extension: leave installed. Only drop if no other consumer.
-- drop extension if exists ltree;

-- 7. Verify state before commit.
do $$
declare
  v_remaining int;
begin
  select count(*) into v_remaining
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'work_items'
     and column_name in ('outline_path','wbs_code','wbs_code_is_custom',
                         'derived_planned_start','derived_planned_end',
                         'derived_estimate_hours');
  if v_remaining > 0 then
    raise exception 'PROJ-36-α rollback incomplete: % α-columns still present', v_remaining;
  end if;
  raise notice 'PROJ-36-α rollback verified: 0/6 columns remaining.';
end $$;

commit;

-- =============================================================================
-- Post-rollback follow-up (manual, NOT in this transaction):
-- - Revert the frontend re-activation (`use-work-items.ts` SELECT, route.ts
--   503-mapper) to the hotfix-baseline state (commit 276d384).
-- - Revert features/INDEX.md PROJ-36 status to reflect the rollback.
-- =============================================================================
