-- =============================================================================
-- PROJ-26: Method-Gating für Schedule-Constructs (Sprints, Phasen, Milestones)
-- -----------------------------------------------------------------------------
-- Mirrors the work-item visibility hardening from PROJ-9 onto the three
-- schedule tables. Three BEFORE INSERT triggers reject INSERTs whose target
-- project's `project_method` is not in the construct's whitelist.
--
-- Defense in depth: the API layer (src/lib/work-items/schedule-method-
-- visibility.ts) returns a clean 422 with German copy, and these triggers
-- are the runtime guarantee for any code path that bypasses the API.
--
-- The triggers fire on INSERT only. UPDATE of `project_id` is not a real
-- code path (RLS scopes writes to the originating project) and existing rows
-- in mismatched methods are intentionally preserved — the cleanup is the job
-- of the future PROJ-6 method-migration RPC, not this migration.
--
-- Method = NULL ("not yet chosen") accepts every construct, matching the
-- null-method behaviour established by PROJ-9.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Central pure validation function (single source of truth in SQL).
--
-- Mirrors `SCHEDULE_CONSTRUCT_METHOD_VISIBILITY` from
-- `src/lib/work-items/schedule-method-visibility.ts`. When this map is
-- changed, both files must be edited in the same migration.
-- -----------------------------------------------------------------------------
create or replace function public.validate_schedule_construct_method(
  p_construct text,
  p_method text
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = public, pg_temp
as $$
begin
  -- Method = NULL: project still in setup, every construct is allowed.
  if p_method is null then
    return true;
  end if;

  -- Whitelist per construct — keep in sync with the TypeScript registry.
  if p_construct = 'sprints' then
    return p_method in ('scrum', 'safe');
  elsif p_construct = 'phases' then
    return p_method in ('waterfall', 'pmi', 'prince2', 'vxt2');
  elsif p_construct = 'milestones' then
    return p_method in ('waterfall', 'pmi', 'prince2', 'vxt2');
  end if;

  -- Unknown construct → fail closed.
  return false;
end;
$$;

comment on function public.validate_schedule_construct_method(text, text) is
  'PROJ-26: pure validator mirroring SCHEDULE_CONSTRUCT_METHOD_VISIBILITY in TypeScript. NULL method allows every construct (setup phase). Used by enforce_<construct>_method_visibility trigger fns.';

-- -----------------------------------------------------------------------------
-- 2. Trigger function: enforce_sprint_method_visibility
-- -----------------------------------------------------------------------------
create or replace function public.enforce_sprint_method_visibility()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_method text;
begin
  select project_method into v_method
    from public.projects
   where id = new.project_id;

  if not public.validate_schedule_construct_method('sprints', v_method) then
    raise exception 'Sprints sind in einem %-Projekt nicht erlaubt. Lege ein Sub-Projekt mit Methode Scrum oder SAFe an, um die agile Umsetzung dort zu führen.', upper(v_method)
      using errcode = '22023',
            hint    = 'schedule_construct_not_allowed_in_method';
  end if;

  return new;
end;
$$;

create trigger sprints_method_visibility
  before insert on public.sprints
  for each row execute function public.enforce_sprint_method_visibility();

-- -----------------------------------------------------------------------------
-- 3. Trigger function: enforce_phase_method_visibility
-- -----------------------------------------------------------------------------
create or replace function public.enforce_phase_method_visibility()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_method text;
begin
  select project_method into v_method
    from public.projects
   where id = new.project_id;

  if not public.validate_schedule_construct_method('phases', v_method) then
    raise exception 'Phasen sind in einem %-Projekt nicht erlaubt. Phasen leben in Wasserfall-, PMI-, PRINCE2- oder VXT 2.0-Projekten.', upper(v_method)
      using errcode = '22023',
            hint    = 'schedule_construct_not_allowed_in_method';
  end if;

  return new;
end;
$$;

create trigger phases_method_visibility
  before insert on public.phases
  for each row execute function public.enforce_phase_method_visibility();

-- -----------------------------------------------------------------------------
-- 4. Trigger function: enforce_milestone_method_visibility
-- -----------------------------------------------------------------------------
create or replace function public.enforce_milestone_method_visibility()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_method text;
begin
  select project_method into v_method
    from public.projects
   where id = new.project_id;

  if not public.validate_schedule_construct_method('milestones', v_method) then
    raise exception 'Meilensteine sind in einem %-Projekt nicht erlaubt. Meilensteine leben in Wasserfall-, PMI-, PRINCE2- oder VXT 2.0-Projekten.', upper(v_method)
      using errcode = '22023',
            hint    = 'schedule_construct_not_allowed_in_method';
  end if;

  return new;
end;
$$;

create trigger milestones_method_visibility
  before insert on public.milestones
  for each row execute function public.enforce_milestone_method_visibility();

-- -----------------------------------------------------------------------------
-- 5. ACL hardening
--
-- The four functions are trigger-only / internal helpers. Revoke EXECUTE
-- from every role that PostgREST exposes (public, anon, authenticated) so
-- they cannot be called via RPC. Pattern matches PROJ-9's
-- `harden_trigger_only_functions` migration.
-- -----------------------------------------------------------------------------
revoke execute on function public.validate_schedule_construct_method(text, text)
  from public, anon, authenticated;
revoke execute on function public.enforce_sprint_method_visibility()
  from public, anon, authenticated;
revoke execute on function public.enforce_phase_method_visibility()
  from public, anon, authenticated;
revoke execute on function public.enforce_milestone_method_visibility()
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Documentation / migration provenance
--
-- Pre-migration counts of mismatched legacy rows are deliberately NOT
-- captured here — the BEFORE INSERT triggers do not look at existing rows.
-- Existing data in mismatched methods stays visible and editable; cleanup
-- is the job of the future PROJ-6 method-migration RPC.
-- -----------------------------------------------------------------------------
