-- =============================================================================
-- PROJ-25 Stage 4 — Critical-Path computation for phase chains.
-- =============================================================================
-- Returns the phase IDs that lie on the longest chain of FS-type phase-to-
-- phase dependencies for a given project. The chain is ranked by total
-- cumulative duration (sum of planned_end - planned_start), which matches
-- the standard Critical-Path-Method (CPM) definition for FS edges with
-- zero lag.
--
-- Edge cases handled:
--   - No phase-phase deps in the project → returns the single longest
--     phase (by duration). Avoids returning an empty array so the UI
--     always has something to highlight.
--   - All phases without dates → returns an empty array.
--   - Cycles → recursive CTE bounded by NOT (id = ANY(path)) prevents
--     infinite recursion (the polymorphic-deps trigger blocks cycle
--     INSERTs, but defensive in case stale data exists).
--
-- This is the MVP slice. SS / FF / SF semantics + total-float math will
-- come in a follow-up if the team wants per-phase float numbers visible.
-- =============================================================================

create or replace function public.compute_critical_path_phases(
  p_project_id uuid
)
returns uuid[]
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_path uuid[];
begin
  -- Step 1: longest FS chain by cumulative duration.
  with recursive
    -- Sources: phases with NO incoming phase-phase FS edge (within project).
    sources as (
      select
        p.id,
        coalesce(p.planned_end - p.planned_start, 0)::int as duration_days,
        array[p.id] as path,
        coalesce(p.planned_end - p.planned_start, 0)::int as total_duration
      from public.phases p
      where p.project_id = p_project_id
        and p.planned_start is not null
        and p.planned_end is not null
        and not exists (
          select 1 from public.dependencies d
          where d.to_type = 'phase' and d.to_id = p.id
            and d.from_type = 'phase' and d.constraint_type = 'FS'
        )
    ),
    chain as (
      select id, duration_days, path, total_duration from sources
      union all
      select
        s.id,
        coalesce(s.planned_end - s.planned_start, 0)::int as duration_days,
        c.path || s.id as path,
        c.total_duration + coalesce(s.planned_end - s.planned_start, 0)::int as total_duration
      from chain c
      join public.dependencies d
        on d.from_type = 'phase' and d.from_id = c.id
       and d.to_type = 'phase' and d.constraint_type = 'FS'
      join public.phases s on s.id = d.to_id
      where s.project_id = p_project_id
        and s.planned_start is not null
        and s.planned_end is not null
        and not (s.id = any(c.path))
    )
  select path into v_path
  from chain
  order by total_duration desc, array_length(path, 1) desc
  limit 1;

  if v_path is null or array_length(v_path, 1) = 0 then
    -- Fallback: single phase with longest duration in the project.
    select array[id] into v_path
    from public.phases
    where project_id = p_project_id
      and planned_start is not null
      and planned_end is not null
    order by (planned_end - planned_start) desc nulls last, planned_start asc
    limit 1;
  end if;

  return coalesce(v_path, array[]::uuid[]);
end;
$$;

revoke execute on function public.compute_critical_path_phases(uuid) from public, anon;
grant execute on function public.compute_critical_path_phases(uuid) to authenticated;

comment on function public.compute_critical_path_phases(uuid) is
  'PROJ-25 Stage 4 — returns the phase IDs on the critical path (longest cumulative-duration FS-chain) of a project. Falls back to the single longest-duration phase if no phase-phase FS deps exist. Returns empty array if no phases have date data.';
