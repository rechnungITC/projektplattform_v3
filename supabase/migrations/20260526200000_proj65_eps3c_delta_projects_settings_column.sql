-- =============================================================================
-- PROJ-65 ε.3c.δ hotfix — add projects.settings JSONB column
-- =============================================================================
-- D9 reads projects.settings.plan_mutate.snap_to_week via the trajectory
-- aggregator (`src/lib/project-graph/aggregate.ts`). The base column was
-- missing from production (older schemas never declared it). Without this
-- column the aggregator SELECT returns an error. Defaults to empty JSONB
-- so existing projects fall through to snap_to_week = false.
--
-- Discovered after 20260526190000_proj65_eps3c_delta_bundle.sql applied
-- and FE D9-exposure was wired: aggregator query against `projects.settings`
-- failed because the column didn't exist. Pure additive ALTER, safe hot-fix.
-- =============================================================================

alter table public.projects
  add column if not exists settings jsonb not null default '{}'::jsonb;

comment on column public.projects.settings is
  'Project-level JSONB settings. PROJ-65 ε.3c.δ stores plan_mutate.snap_to_week here.';

do $$
declare v_count int;
begin
  select count(*) into v_count
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'projects'
     and column_name = 'settings';
  if v_count <> 1 then
    raise exception 'smoke-fail: projects.settings column missing post-migration';
  end if;
  raise notice 'projects.settings column present';
end$$;
