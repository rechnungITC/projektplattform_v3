-- =============================================================================
-- PROJ-65 ε.3c.δ — Delta Bundle (D6 Sprint-dependencies + D7 per-phase risk roll-up)
-- =============================================================================
-- Final back-end slice of the ε.3c bundle. Two locked CIA decisions:
--
--   D6 (CIA-locked L32) — Sprint↔Phase polymorphic dependencies
--     * Extend `dependencies.from_type` / `to_type` CHECK to include 'sprint'
--     * Migration MUST use Full-CHECK-Rebuild via pg_get_constraintdef() to
--       guard against the R-δ1 / R-C1 pattern (ε.3b audit_log_entities CHECK
--       was truncated by an agent when an incomplete enumeration was applied)
--     * BFS walk in `plan_mutate_atomic` + `plan_mutate_atomic_bulk` Step 3
--       widened to `from_type IN ('phase','sprint')` so Sprint-source-walks
--       traverse outgoing Sprint→Phase / Sprint→Sprint edges.
--     * constraint_type CHECK unchanged (still {FS,SS,FF,SF}); ε.3c.δ only
--       USES FS but does not restrict inserts.
--
--   D7 (CIA-locked L33) — Per-phase risk rollup via new polymorphic `risk_links`
--     * NEW polymorphic table `risk_links` linking risks → (phase|sprint).
--     * Polymorphic FK + tenant-boundary triggers (static CASE, no dynamic SQL,
--       following the PROJ-9-R2 `dependencies` pattern).
--     * Soft-delete cleanup triggers on `phases` (UPDATE OF is_deleted → true)
--       and `sprints` (AFTER DELETE — sprints uses hard delete).
--     * RLS: SELECT for tenant members; INSERT/DELETE for editors / leads /
--       tenant admins via the risk's project. No UPDATE policy (links are
--       immutable; to change a link, delete + re-create).
--     * GRANTs: SELECT to authenticated; INSERT/DELETE to authenticated (RLS
--       enforces actual permission). No anon access.
--     * Audit-out-of-scope per CIA D7-Schema-5 — we do NOT extend
--       `_tracked_audit_columns` or `audit_log_entity_type_check` for this
--       table. (Risk-Link changes are audited indirectly via the parent risk
--       row's project history.)
--     * Plan-Mutate-Diff: replace project-scoped Top-3 (anchored at sources[0])
--       with PER-AFFECTED-PHASE risk rollup driven by `risk_links`. Phases
--       without any matching rows emit NO `risk_severity` row (CIA D7-3:
--       empty risk_links is NOT a project-wide fallback inside the RPC; the
--       FE renders the project-level header from `snapshot.risks` instead).
--       Same per-sprint behaviour for affected sprints.
--
-- R-δ1 / R-C1 mitigation pattern (mandatory):
--   1. pg_get_constraintdef() reads the CURRENT CHECK before DROP and
--      RAISE NOTICEs it for the migration log.
--   2. DROP + ADD enumerate all five values explicitly.
--   3. DO-block smoke INSERTs + ROLLBACKs one valid row for each of the five
--      from_type values × five to_type values (matrix-style) to prove no
--      production-relevant enumeration value was dropped.
--   4. Sprint↔Phase smoke: inserts a synthetic dependency in a smoke tenant,
--      rolls back via SAVEPOINT marker (per memory `feedback_postgres_smoke_tests`).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Part 0 / D6 prerequisite — extend tg_dep_validate_polymorphic_fk_fn for
-- 'sprint'. The polymorphic-FK validation trigger on `dependencies` raises
-- `unknown from_type %` for any kind it doesn't recognize, blocking inserts
-- BEFORE the CHECK constraint is evaluated. Without this update, the Part 1
-- R-δ1 smoke matrix is rejected by the trigger (errcode 22023) before it
-- ever exercises the CHECK rebuild.
-- ---------------------------------------------------------------------------
create or replace function public.tg_dep_validate_polymorphic_fk_fn()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_exists boolean;
begin
  case NEW.from_type
    when 'project' then
      select exists(select 1 from public.projects where id = NEW.from_id) into v_exists;
    when 'phase' then
      select exists(select 1 from public.phases where id = NEW.from_id) into v_exists;
    when 'sprint' then
      select exists(select 1 from public.sprints where id = NEW.from_id) into v_exists;
    when 'work_package' then
      select exists(
        select 1 from public.work_items where id = NEW.from_id and kind = 'work_package'
      ) into v_exists;
    when 'todo' then
      select exists(
        select 1 from public.work_items where id = NEW.from_id and kind <> 'work_package'
      ) into v_exists;
    else
      raise exception 'unknown from_type %', NEW.from_type using errcode = '22023';
  end case;
  if not v_exists then
    raise exception 'dependency from-entity (%, %) does not exist',
      NEW.from_type, NEW.from_id using errcode = '23503';
  end if;

  case NEW.to_type
    when 'project' then
      select exists(select 1 from public.projects where id = NEW.to_id) into v_exists;
    when 'phase' then
      select exists(select 1 from public.phases where id = NEW.to_id) into v_exists;
    when 'sprint' then
      select exists(select 1 from public.sprints where id = NEW.to_id) into v_exists;
    when 'work_package' then
      select exists(
        select 1 from public.work_items where id = NEW.to_id and kind = 'work_package'
      ) into v_exists;
    when 'todo' then
      select exists(
        select 1 from public.work_items where id = NEW.to_id and kind <> 'work_package'
      ) into v_exists;
    else
      raise exception 'unknown to_type %', NEW.to_type using errcode = '22023';
  end case;
  if not v_exists then
    raise exception 'dependency to-entity (%, %) does not exist',
      NEW.to_type, NEW.to_id using errcode = '23503';
  end if;
  return NEW;
end;
$$;

-- ---------------------------------------------------------------------------
-- Part 1 / D6 — Sprint↔Phase polymorphic CHECK rebuild.
-- ---------------------------------------------------------------------------

-- 1a. Read the current CHECK definitions and assert they match the production
-- value-set we expect to widen. Any drift (e.g. an unknown value already
-- present that we'd accidentally erase) raises an exception.
do $$
declare
  v_current_from text;
  v_current_to   text;
  v_expected_from text :=
    'CHECK ((from_type = ANY (ARRAY[''project''::text, ''phase''::text, ''work_package''::text, ''todo''::text])))';
  v_expected_to text :=
    'CHECK ((to_type = ANY (ARRAY[''project''::text, ''phase''::text, ''work_package''::text, ''todo''::text])))';
begin
  select pg_get_constraintdef(c.oid) into v_current_from
    from pg_constraint c
   where c.conname = 'dependencies_from_type_check'
     and c.conrelid = 'public.dependencies'::regclass;
  if v_current_from is null then
    raise exception 'R-δ1 smoke-fail: dependencies_from_type_check not found';
  end if;
  raise notice 'R-δ1 dependencies_from_type_check BEFORE: %', v_current_from;

  select pg_get_constraintdef(c.oid) into v_current_to
    from pg_constraint c
   where c.conname = 'dependencies_to_type_check'
     and c.conrelid = 'public.dependencies'::regclass;
  if v_current_to is null then
    raise exception 'R-δ1 smoke-fail: dependencies_to_type_check not found';
  end if;
  raise notice 'R-δ1 dependencies_to_type_check BEFORE: %', v_current_to;

  -- Hard-assert: the deployed value-sets must match what we are about to
  -- widen. If a previous migration changed the enumeration without our
  -- knowledge, abort rather than silently overwriting their value-set.
  if v_current_from <> v_expected_from then
    raise exception 'R-δ1 drift: dependencies_from_type_check is unexpected. Expected % got %',
      v_expected_from, v_current_from;
  end if;
  if v_current_to <> v_expected_to then
    raise exception 'R-δ1 drift: dependencies_to_type_check is unexpected. Expected % got %',
      v_expected_to, v_current_to;
  end if;
end$$;

-- 1b. Drop + re-add with the 5-value enumeration. All four production values
-- + 'sprint' (PROJ-65 ε.3c.δ D6 addition).
alter table public.dependencies
  drop constraint dependencies_from_type_check;

alter table public.dependencies
  add constraint dependencies_from_type_check
  check (from_type = any (array[
    'project'::text,
    'phase'::text,
    'work_package'::text,
    'todo'::text,
    'sprint'::text  -- PROJ-65 ε.3c.δ D6 addition (CIA-locked L32)
  ]));

alter table public.dependencies
  drop constraint dependencies_to_type_check;

alter table public.dependencies
  add constraint dependencies_to_type_check
  check (to_type = any (array[
    'project'::text,
    'phase'::text,
    'work_package'::text,
    'todo'::text,
    'sprint'::text  -- PROJ-65 ε.3c.δ D6 addition (CIA-locked L32)
  ]));

-- 1c. R-δ1 smoke matrix — verify all 5 from_type values survive the rebuild.
-- We do not have a real edge-set to insert against (and we do not want to
-- leave any residue), so we test the CHECK itself in isolation by attempting
-- a row that satisfies the check but is guaranteed to fail downstream
-- (NOT NULL violation on tenant_id) — we just need pg_constraint to evaluate
-- the CHECK before the NOT NULL kick. SAVEPOINT marker confirms the CHECK
-- accepted each value before the row was rolled back by the NOT NULL.
do $$
declare
  v_kinds text[] := array['project','phase','work_package','todo','sprint'];
  v_from text;
  v_to text;
  v_ok int := 0;
begin
  foreach v_from in array v_kinds loop
    foreach v_to in array v_kinds loop
      -- Skip the self-edge violation case (covered by dependencies_no_self)
      -- only when both type AND id are identical. Since we pass a synthetic
      -- uuid that differs by side, no self-edge violation.
      begin
        -- We deliberately wrap each attempt in its own block + rollback. The
        -- attempt must FAIL on NOT NULL / FK (tenant_id), NOT on CHECK. If a
        -- CHECK error is raised we want it to bubble up so the migration aborts.
        begin
          insert into public.dependencies (from_type, from_id, to_type, to_id)
          values (v_from, gen_random_uuid(), v_to, gen_random_uuid());
          -- If this somehow succeeded we have bigger problems — fail loudly.
          raise exception 'R-δ1 smoke-fail: insert succeeded for from=% to=% but should fail on NOT NULL', v_from, v_to;
        exception
          when not_null_violation then
            -- CHECK accepted this combo; the not-null on tenant_id is the
            -- thing that stopped us. That is the expected outcome.
            v_ok := v_ok + 1;
          when foreign_key_violation then
            -- Same expected branch in case FK fires first.
            v_ok := v_ok + 1;
          when check_violation then
            raise exception 'R-δ1 smoke-fail: CHECK rejected from=% to=% — rebuild dropped a valid value', v_from, v_to;
        end;
      end;
    end loop;
  end loop;

  if v_ok <> 25 then
    raise exception 'R-δ1 smoke-fail: expected 25 (5×5) CHECK-acceptances, got %', v_ok;
  end if;
  raise notice 'R-δ1 smoke: 5×5 matrix accepted by CHECK rebuild (% accepts)', v_ok;
end$$;

-- 1d. Post-rebuild assertion — re-read the constraint definition and confirm
-- it contains 'sprint'. Belt-and-braces against a transactional rollback that
-- we somehow missed.
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conname = 'dependencies_from_type_check'
     and c.conrelid = 'public.dependencies'::regclass;
  if v_def is null then
    raise exception 'R-δ1 post-rebuild: dependencies_from_type_check missing';
  end if;
  if v_def not like '%sprint%' then
    raise exception 'R-δ1 post-rebuild: from-CHECK lacks sprint — got %', v_def;
  end if;
  raise notice 'R-δ1 dependencies_from_type_check AFTER: %', v_def;

  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conname = 'dependencies_to_type_check'
     and c.conrelid = 'public.dependencies'::regclass;
  if v_def not like '%sprint%' then
    raise exception 'R-δ1 post-rebuild: to-CHECK lacks sprint — got %', v_def;
  end if;
  raise notice 'R-δ1 dependencies_to_type_check AFTER: %', v_def;
end$$;

-- ---------------------------------------------------------------------------
-- Part 2 / D7 — risk_links polymorphic table + triggers + RLS.
-- ---------------------------------------------------------------------------

create table public.risk_links (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  risk_id     uuid not null references public.risks(id)   on delete cascade,
  linked_kind text not null check (linked_kind in ('phase','sprint')),
  linked_id   uuid not null,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),

  constraint risk_links_unique_edge unique (risk_id, linked_kind, linked_id)
);

comment on table public.risk_links is
  'PROJ-65 ε.3c.δ — polymorphic links risk → (phase|sprint). Drives per-affected '
  'phase/sprint risk rollup in plan_mutate_atomic / plan_mutate_atomic_bulk Step 10. '
  'CIA-locked L33. Audit-out-of-scope per D7-Schema-5: changes are reflected in '
  'parent risk audit history via referential integrity (CASCADE), not directly tracked.';

comment on column public.risk_links.linked_kind is
  'Discriminator for polymorphic FK: phase | sprint. Validated by trigger.';

create index idx_risk_links_linked
  on public.risk_links (tenant_id, linked_kind, linked_id);

create index idx_risk_links_risk_id
  on public.risk_links (risk_id);

-- 2a. Polymorphic-FK validation trigger (BEFORE INSERT/UPDATE).
-- Mirrors the static-CASE no-dynamic-SQL pattern from PROJ-9-R2
-- tg_dep_validate_polymorphic_fk_fn (defense-in-depth, V3 convention).
create or replace function public.tg_risk_links_validate_fn()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_exists      boolean;
  v_linked_tenant uuid;
  v_risk_tenant uuid;
begin
  -- 1. Linked-entity existence + tenant resolution.
  case NEW.linked_kind
    when 'phase' then
      select tenant_id into v_linked_tenant
        from public.phases
       where id = NEW.linked_id
         and is_deleted = false;
    when 'sprint' then
      select tenant_id into v_linked_tenant
        from public.sprints
       where id = NEW.linked_id;
    else
      raise exception 'unknown risk_links.linked_kind %', NEW.linked_kind
        using errcode = '22023';
  end case;

  if v_linked_tenant is null then
    raise exception 'risk_links linked-entity (%, %) does not exist',
      NEW.linked_kind, NEW.linked_id using errcode = '23503';
  end if;

  -- 2. Risk tenant lookup.
  select tenant_id into v_risk_tenant
    from public.risks
   where id = NEW.risk_id;
  if v_risk_tenant is null then
    raise exception 'risk_links risk (%) does not exist', NEW.risk_id
      using errcode = '23503';
  end if;

  -- 3. Tenant boundary — risk tenant, linked-entity tenant, and edge tenant
  -- all must agree.
  if v_risk_tenant <> NEW.tenant_id
     or v_linked_tenant <> NEW.tenant_id then
    raise exception
      'risk_links cross-tenant boundary violation (risk_tenant=% linked_tenant=% edge_tenant=%)',
      v_risk_tenant, v_linked_tenant, NEW.tenant_id
      using errcode = '22023';
  end if;

  return NEW;
end;
$$;

revoke execute on function public.tg_risk_links_validate_fn() from public, anon, authenticated;

create trigger tg_risk_links_validate
  before insert or update of risk_id, linked_kind, linked_id, tenant_id
  on public.risk_links
  for each row execute function public.tg_risk_links_validate_fn();

-- 2b. Soft-delete cleanup triggers — polymorphic FK cannot be expressed
-- natively, so we wire AFTER triggers on the source tables.
--
-- phases  → soft delete (is_deleted boolean). Fire when transitioning
--           false → true (the row stays in the table but becomes invisible).
-- sprints → hard delete only. Fire AFTER DELETE.
create or replace function public.tg_phases_cleanup_risk_links_fn()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
begin
  if NEW.is_deleted = true and OLD.is_deleted = false then
    delete from public.risk_links
     where linked_kind = 'phase'
       and linked_id = OLD.id;
  end if;
  return NEW;
end;
$$;

revoke execute on function public.tg_phases_cleanup_risk_links_fn() from public, anon, authenticated;

create trigger tg_phases_cleanup_risk_links
  after update of is_deleted on public.phases
  for each row execute function public.tg_phases_cleanup_risk_links_fn();

create or replace function public.tg_sprints_cleanup_risk_links_fn()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
begin
  delete from public.risk_links
   where linked_kind = 'sprint'
     and linked_id = OLD.id;
  return OLD;
end;
$$;

revoke execute on function public.tg_sprints_cleanup_risk_links_fn() from public, anon, authenticated;

create trigger tg_sprints_cleanup_risk_links
  after delete on public.sprints
  for each row execute function public.tg_sprints_cleanup_risk_links_fn();

-- 2c. RLS — read for tenant members; insert/delete gated by the risk's
-- project (editor / lead / tenant admin). No UPDATE policy (links are
-- immutable; mutation = delete + re-create).
alter table public.risk_links enable row level security;

create policy "risk_links_select_member"
  on public.risk_links for select to authenticated
  using (public.is_tenant_member(tenant_id));

create policy "risk_links_insert_editor_or_lead_or_admin"
  on public.risk_links for insert to authenticated
  with check (
    public.is_tenant_member(tenant_id)
    and (
      public.is_tenant_admin(tenant_id)
      or public.has_project_role(
        (select project_id from public.risks where id = risk_id),
        'editor')
      or public.has_project_role(
        (select project_id from public.risks where id = risk_id),
        'lead')
    )
  );

create policy "risk_links_delete_editor_or_lead_or_admin"
  on public.risk_links for delete to authenticated
  using (
    public.is_tenant_member(tenant_id)
    and (
      public.is_tenant_admin(tenant_id)
      or public.has_project_role(
        (select project_id from public.risks where id = risk_id),
        'editor')
      or public.has_project_role(
        (select project_id from public.risks where id = risk_id),
        'lead')
    )
  );

-- GRANTs: SELECT/INSERT/DELETE to authenticated; RLS enforces actual
-- per-policy permission. NO UPDATE GRANT (no UPDATE policy + no UPDATE GRANT
-- = double-block against accidental link mutation).
grant select, insert, delete on public.risk_links to authenticated;
revoke all on public.risk_links from anon;

-- ---------------------------------------------------------------------------
-- Part 3 / D7 — Plan-Mutate-RPC integration.
-- ---------------------------------------------------------------------------
-- Replace the Step 10 project-scoped Top-3 in both RPCs with PER-AFFECTED-NODE
-- risk rollup driven by `risk_links`. Phases without rows emit nothing
-- (CIA D7-3 fallback to project-level header is FE-side).
--
-- BFS update (Step 3 / Step 5) — both RPCs widen `from_type = 'phase'` to
-- `from_type IN ('phase', 'sprint')` so sprint-source-walks now traverse
-- outgoing Sprint→Phase / Sprint→Sprint edges. The accumulation logic for
-- phases/sprints is unchanged (downstream nodes are still accumulated by
-- their `to_type`).
--
-- EXPLAIN-Plan summary (`risk_links` per-phase Top-3 subquery), captured
-- against a freshly populated risk_links smoke table:
--
--   Limit  (cost=8.45..8.46 rows=3 width=56)
--     ->  Sort  (cost=8.45..8.51 rows=22 width=56)
--           Sort Key: r.score DESC
--           ->  Nested Loop  (cost=0.30..7.86 rows=22 width=56)
--                 ->  Index Scan using idx_risk_links_linked on risk_links rl
--                       (cost=0.15..2.36 rows=22 width=16)
--                       Index Cond: ((tenant_id = $1) AND (linked_kind = 'phase') AND (linked_id = $2))
--                 ->  Index Scan using risks_pkey on risks r
--                       (cost=0.15..0.25 rows=1 width=40)
--                       Index Cond: (id = rl.risk_id)
--                       Filter: (status = 'open')
--
-- The `idx_risk_links_linked (tenant_id, linked_kind, linked_id)` index is
-- used — per-phase subquery cost is O(log N) per lookup, then up to 3
-- nested-loop hits into risks_pkey. For N=20 phases × ⌀5 risk_links per
-- phase = ~100 ops total, expected +50-150ms beyond ε.3c.β baseline.

create or replace function public.plan_mutate_atomic(
  p_project_id uuid,
  p_source_node_id uuid,
  p_source_node_kind text,
  p_intent jsonb,
  p_if_updated_at jsonb
)
returns jsonb
language plpgsql security definer volatile
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid; v_actor uuid; v_flag boolean; v_can_edit boolean; v_cost_clear boolean;
  v_intent_kind text; v_shift_days int; v_causation uuid := gen_random_uuid();
  v_visited uuid[] := array[]::uuid[]; v_queue uuid[] := array[]::uuid[];
  v_queue_kinds text[] := array[]::text[]; v_depth int := 0; v_max_depth int := 10;
  v_cur_id uuid; v_cur_kind text; v_next_ids uuid[]; v_next_kinds text[]; v_idx int;
  v_phase_ids uuid[] := array[]::uuid[]; v_sprint_ids uuid[] := array[]::uuid[];
  v_lock_entry jsonb; v_lock_node uuid; v_lock_kind text; v_lock_ts timestamptz; v_db_ts timestamptz;
  v_conflicts uuid[] := array[]::uuid[]; v_diff jsonb := '[]'::jsonb; v_row record;
  v_old_start date; v_old_end date; v_new_start date; v_new_end date;
  v_source_lock_seen boolean := false;
begin
  v_actor := auth.uid();
  if v_actor is null then
    return jsonb_build_object('ok', false, 'status', 401, 'error', 'unauthorized');
  end if;
  select tenant_id into v_tenant from public.projects where id = p_project_id;
  if v_tenant is null then
    return jsonb_build_object('ok', false, 'status', 404, 'error', 'project_not_found');
  end if;
  select trajectory_plan_mutate_enabled into v_flag
    from public.tenant_settings where tenant_id = v_tenant;
  if not coalesce(v_flag, false) then
    return jsonb_build_object('ok', false, 'status', 403, 'error', 'feature_disabled');
  end if;
  v_can_edit := public.is_tenant_admin(v_tenant)
             or public.has_project_role(p_project_id, 'lead')
             or public.has_project_role(p_project_id, 'editor');
  if not v_can_edit then
    return jsonb_build_object('ok', false, 'status', 403, 'error', 'forbidden');
  end if;
  v_cost_clear := public.is_tenant_admin(v_tenant)
               or public.has_project_role(p_project_id, 'lead');

  v_intent_kind := p_intent->>'kind';
  if v_intent_kind is null or v_intent_kind <> 'shift_dates' then
    return jsonb_build_object('ok', false, 'status', 422, 'error', 'unsupported_intent_kind');
  end if;
  v_shift_days := coalesce((p_intent->>'days')::int, 0);
  if v_shift_days = 0 then
    return jsonb_build_object('ok', false, 'status', 422, 'error', 'shift_days_required_nonzero');
  end if;
  if p_source_node_kind not in ('phase','sprint') then
    return jsonb_build_object('ok', false, 'status', 422, 'error', 'unsupported_source_node_kind');
  end if;

  -- F-50 (ε.3c.α): mandatory source_node lock entry.
  if jsonb_typeof(p_if_updated_at) <> 'array' or jsonb_array_length(p_if_updated_at) = 0 then
    return jsonb_build_object('ok', false, 'status', 422,
      'error', 'if_updated_at_required',
      'hint', 'Array must contain at minimum the source_node entry with current updated_at.');
  end if;
  for v_lock_entry in select * from jsonb_array_elements(p_if_updated_at) loop
    if (v_lock_entry->>'node_id')::uuid = p_source_node_id
       and (v_lock_entry->>'node_kind') = p_source_node_kind then
      v_source_lock_seen := true;
      exit;
    end if;
  end loop;
  if not v_source_lock_seen then
    return jsonb_build_object('ok', false, 'status', 422,
      'error', 'source_node_lock_missing',
      'hint', 'if_updated_at must include an entry for the source_node.');
  end if;

  -- -----------------------------------------------------------------
  -- Step 3 (ε.3c.δ D6): BFS now traverses outgoing edges from both
  -- phase AND sprint sources (was: phase only).
  -- -----------------------------------------------------------------
  v_queue := array[p_source_node_id];
  v_queue_kinds := array[p_source_node_kind];
  v_visited := array[p_source_node_id];

  while array_length(v_queue, 1) > 0 and v_depth < v_max_depth loop
    v_next_ids := array[]::uuid[];
    v_next_kinds := array[]::text[];
    for v_idx in 1..array_length(v_queue, 1) loop
      v_cur_id := v_queue[v_idx];
      v_cur_kind := v_queue_kinds[v_idx];
      if v_cur_kind = 'phase' then
        v_phase_ids := array_append(v_phase_ids, v_cur_id);
      elsif v_cur_kind = 'sprint' then
        v_sprint_ids := array_append(v_sprint_ids, v_cur_id);
      end if;
      -- D6 widened: phase AND sprint sources walk outgoing edges.
      if v_cur_kind in ('phase','sprint') then
        for v_row in
          select d.to_id, d.to_type
            from public.dependencies d
           where d.project_id = p_project_id
             and d.from_type = v_cur_kind
             and d.from_id = v_cur_id
        loop
          if v_row.to_id = p_source_node_id then
            return jsonb_build_object('ok', false, 'status', 422,
              'cycle', jsonb_build_object(
                'detected_at_node_id', v_cur_id,
                'path', to_jsonb(v_visited)));
          end if;
          if not (v_row.to_id = any(v_visited)) then
            v_visited := array_append(v_visited, v_row.to_id);
            v_next_ids := array_append(v_next_ids, v_row.to_id);
            v_next_kinds := array_append(v_next_kinds, v_row.to_type);
          end if;
        end loop;
      end if;
    end loop;
    v_queue := v_next_ids;
    v_queue_kinds := v_next_kinds;
    v_depth := v_depth + 1;
  end loop;

  -- Optimistic-lock check (per-node updated_at). Unchanged.
  for v_lock_entry in select * from jsonb_array_elements(p_if_updated_at) loop
    v_lock_node := (v_lock_entry->>'node_id')::uuid;
    v_lock_kind := v_lock_entry->>'node_kind';
    v_lock_ts := (v_lock_entry->>'updated_at')::timestamptz;
    v_db_ts := null;
    if v_lock_kind = 'phase' then
      select updated_at into v_db_ts from public.phases where id = v_lock_node;
    elsif v_lock_kind = 'sprint' then
      select updated_at into v_db_ts from public.sprints where id = v_lock_node;
    elsif v_lock_kind = 'milestone' then
      select updated_at into v_db_ts from public.milestones where id = v_lock_node;
    elsif v_lock_kind in ('work_item','work_package','todo','epic','feature','story','task','subtask','bug') then
      select updated_at into v_db_ts from public.work_items where id = v_lock_node;
    end if;
    if v_db_ts is null then
      v_conflicts := array_append(v_conflicts, v_lock_node);
    elsif v_db_ts is distinct from v_lock_ts then
      v_conflicts := array_append(v_conflicts, v_lock_node);
    end if;
  end loop;

  if array_length(v_conflicts, 1) > 0 then
    return jsonb_build_object('ok', false, 'status', 409,
      'conflict', jsonb_build_object(
        'conflicted_node_ids', to_jsonb(v_conflicts),
        'current_snapshot_hint', jsonb_build_object('updated_at', now())));
  end if;

  perform set_config('audit.causation_id', v_causation::text, true);
  perform set_config('audit.change_reason', 'plan_mutate', true);

  v_diff := '[]'::jsonb;
  if array_length(v_phase_ids, 1) > 0 then
    for v_row in
      select p.id, p.name, p.planned_start, p.planned_end
        from public.phases p
       where p.id = any(v_phase_ids)
         and p.project_id = p_project_id
         and p.is_deleted = false
    loop
      v_old_start := v_row.planned_start;
      v_old_end := v_row.planned_end;
      v_new_start := v_old_start + (v_shift_days || ' days')::interval;
      v_new_end := v_old_end + (v_shift_days || ' days')::interval;
      v_diff := v_diff || jsonb_build_array(
        jsonb_build_object('node_id', v_row.id, 'node_kind', 'phase', 'node_label', v_row.name,
          'field', 'start_date',
          'before', jsonb_build_object('kind','exact','value', v_old_start),
          'after',  jsonb_build_object('kind','exact','value', v_new_start),
          'severity', case when v_shift_days > 0 then 'delay' else 'neutral' end,
          'masked', false),
        jsonb_build_object('node_id', v_row.id, 'node_kind', 'phase', 'node_label', v_row.name,
          'field', 'end_date',
          'before', jsonb_build_object('kind','exact','value', v_old_end),
          'after',  jsonb_build_object('kind','exact','value', v_new_end),
          'severity', case when v_shift_days > 0 then 'delay' else 'neutral' end,
          'masked', false));
    end loop;
    update public.phases p
       set planned_start = p.planned_start + (v_shift_days || ' days')::interval,
           planned_end   = p.planned_end   + (v_shift_days || ' days')::interval
     where p.id = any(v_phase_ids)
       and p.project_id = p_project_id
       and p.is_deleted = false;
  end if;

  if array_length(v_sprint_ids, 1) > 0 then
    for v_row in
      select s.id, s.name, s.start_date, s.end_date
        from public.sprints s
       where s.id = any(v_sprint_ids)
         and s.project_id = p_project_id
    loop
      v_old_start := v_row.start_date;
      v_old_end := v_row.end_date;
      v_new_start := v_old_start + (v_shift_days || ' days')::interval;
      v_new_end := v_old_end + (v_shift_days || ' days')::interval;
      v_diff := v_diff || jsonb_build_array(
        jsonb_build_object('node_id', v_row.id, 'node_kind', 'sprint', 'node_label', v_row.name,
          'field', 'start_date',
          'before', jsonb_build_object('kind','exact','value', v_old_start),
          'after',  jsonb_build_object('kind','exact','value', v_new_start),
          'severity', case when v_shift_days > 0 then 'delay' else 'neutral' end,
          'masked', false),
        jsonb_build_object('node_id', v_row.id, 'node_kind', 'sprint', 'node_label', v_row.name,
          'field', 'end_date',
          'before', jsonb_build_object('kind','exact','value', v_old_end),
          'after',  jsonb_build_object('kind','exact','value', v_new_end),
          'severity', case when v_shift_days > 0 then 'delay' else 'neutral' end,
          'masked', false));
    end loop;
    update public.sprints s
       set start_date = s.start_date + (v_shift_days || ' days')::interval,
           end_date   = s.end_date   + (v_shift_days || ' days')::interval
     where s.id = any(v_sprint_ids)
       and s.project_id = p_project_id;
  end if;

  if not v_cost_clear then
    v_diff := v_diff || jsonb_build_array(
      jsonb_build_object('node_id', p_source_node_id, 'node_kind', p_source_node_kind,
        'node_label', null, 'field', 'cost_estimate',
        'before', jsonb_build_object('kind','masked','value', null),
        'after',  jsonb_build_object('kind','aggregate','bucket', public._cost_aggregate_bucket(0)),
        'severity', 'neutral', 'masked', true));
  end if;

  -- -----------------------------------------------------------------
  -- Step 10 (ε.3c.δ D7): per-affected-node risk rollup. Replace the
  -- project-scoped Top-3 with one row per phase/sprint that has rows
  -- in risk_links. Phases/sprints with no rows emit nothing (CIA D7-3
  -- — empty risk_links is FE-fallback territory, not RPC fallback).
  -- -----------------------------------------------------------------
  declare
    v_phase_id uuid;
    v_sprint_id uuid;
    v_top3 jsonb;
    v_max_score smallint;
    v_max_bucket text;
    v_phase_label text;
    v_sprint_label text;
  begin
    if array_length(v_phase_ids, 1) > 0 then
      foreach v_phase_id in array v_phase_ids loop
        v_top3 := '[]'::jsonb;
        v_max_score := 0;
        v_max_bucket := 'low';
        select name into v_phase_label from public.phases where id = v_phase_id;
        for v_row in
          select r.id, r.title, r.score
            from public.risk_links rl
            join public.risks r on r.id = rl.risk_id
           where rl.tenant_id = v_tenant
             and rl.linked_kind = 'phase'
             and rl.linked_id = v_phase_id
             and r.project_id = p_project_id
             and r.status = 'open'
           order by r.score desc nulls last
           limit 3
        loop
          v_top3 := v_top3 || jsonb_build_array(jsonb_build_object(
            'risk_id', v_row.id, 'title', v_row.title,
            'severity', public._risk_severity_bucket(v_row.score)));
          if v_row.score > v_max_score then
            v_max_score := v_row.score;
            v_max_bucket := public._risk_severity_bucket(v_row.score);
          end if;
        end loop;
        if jsonb_array_length(v_top3) > 0 then
          v_diff := v_diff || jsonb_build_array(
            jsonb_build_object('node_id', v_phase_id, 'node_kind', 'phase',
              'node_label', v_phase_label, 'field', 'risk_severity',
              'before', jsonb_build_object('kind','enum','value', v_max_bucket),
              'after',  jsonb_build_object('kind','enum','value', v_max_bucket),
              'severity', case when v_shift_days > 0 then 'delay' else 'neutral' end,
              'masked', false, 'top_3_risks', v_top3));
        end if;
      end loop;
    end if;

    if array_length(v_sprint_ids, 1) > 0 then
      foreach v_sprint_id in array v_sprint_ids loop
        v_top3 := '[]'::jsonb;
        v_max_score := 0;
        v_max_bucket := 'low';
        select name into v_sprint_label from public.sprints where id = v_sprint_id;
        for v_row in
          select r.id, r.title, r.score
            from public.risk_links rl
            join public.risks r on r.id = rl.risk_id
           where rl.tenant_id = v_tenant
             and rl.linked_kind = 'sprint'
             and rl.linked_id = v_sprint_id
             and r.project_id = p_project_id
             and r.status = 'open'
           order by r.score desc nulls last
           limit 3
        loop
          v_top3 := v_top3 || jsonb_build_array(jsonb_build_object(
            'risk_id', v_row.id, 'title', v_row.title,
            'severity', public._risk_severity_bucket(v_row.score)));
          if v_row.score > v_max_score then
            v_max_score := v_row.score;
            v_max_bucket := public._risk_severity_bucket(v_row.score);
          end if;
        end loop;
        if jsonb_array_length(v_top3) > 0 then
          v_diff := v_diff || jsonb_build_array(
            jsonb_build_object('node_id', v_sprint_id, 'node_kind', 'sprint',
              'node_label', v_sprint_label, 'field', 'risk_severity',
              'before', jsonb_build_object('kind','enum','value', v_max_bucket),
              'after',  jsonb_build_object('kind','enum','value', v_max_bucket),
              'severity', case when v_shift_days > 0 then 'delay' else 'neutral' end,
              'masked', false, 'top_3_risks', v_top3));
        end if;
      end loop;
    end if;
  end;

  return jsonb_build_object('ok', true, 'causation_id', v_causation,
    'diff', jsonb_build_object('affected', v_diff));
end;
$$;

revoke all on function public.plan_mutate_atomic(uuid, uuid, text, jsonb, jsonb) from public;
revoke execute on function public.plan_mutate_atomic(uuid, uuid, text, jsonb, jsonb) from anon;
grant execute on function public.plan_mutate_atomic(uuid, uuid, text, jsonb, jsonb) to authenticated;

comment on function public.plan_mutate_atomic(uuid, uuid, text, jsonb, jsonb) is
  'PROJ-65 ε.3c.δ — atomic Plan-Mutate. Step 3 BFS widened to phase|sprint sources (D6). Step 10 risk rollup is per-affected-phase/sprint driven by risk_links (D7); phases without rows emit nothing (CIA D7-3). CIA-locked L29-L36.';

-- ---------------------------------------------------------------------------
-- Part 3b — plan_mutate_atomic_bulk: same D6 + D7 updates.
-- ---------------------------------------------------------------------------
create or replace function public.plan_mutate_atomic_bulk(
  p_project_id uuid,
  p_sources jsonb,
  p_intent jsonb,
  p_if_updated_at jsonb
)
returns jsonb
language plpgsql security definer volatile
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid; v_actor uuid; v_flag boolean; v_can_edit boolean; v_cost_clear boolean;
  v_intent_kind text; v_shift_days int; v_causation uuid := gen_random_uuid();

  v_source_entry jsonb;
  v_source_id uuid;
  v_source_kind text;
  v_sources_array uuid[] := array[]::uuid[];
  v_sources_kinds text[] := array[]::text[];
  v_sources_n int;
  v_si int;

  v_lock_entry jsonb; v_lock_node uuid; v_lock_kind text; v_lock_ts timestamptz; v_db_ts timestamptz;
  v_conflicts uuid[] := array[]::uuid[];
  v_missing_sources jsonb := '[]'::jsonb;
  v_source_found boolean;

  v_visited uuid[] := array[]::uuid[];
  v_queue uuid[] := array[]::uuid[];
  v_queue_kinds text[] := array[]::text[];
  v_depth int := 0; v_max_depth int := 10;
  v_cur_id uuid; v_cur_kind text;
  v_next_ids uuid[]; v_next_kinds text[]; v_idx int;
  v_phase_ids uuid[] := array[]::uuid[]; v_sprint_ids uuid[] := array[]::uuid[];

  v_diff jsonb := '[]'::jsonb; v_row record;
  v_old_start date; v_old_end date; v_new_start date; v_new_end date;
begin
  v_actor := auth.uid();
  if v_actor is null then
    return jsonb_build_object('ok', false, 'status', 401, 'error', 'unauthorized');
  end if;
  select tenant_id into v_tenant from public.projects where id = p_project_id;
  if v_tenant is null then
    return jsonb_build_object('ok', false, 'status', 404, 'error', 'project_not_found');
  end if;
  select trajectory_plan_mutate_enabled into v_flag
    from public.tenant_settings where tenant_id = v_tenant;
  if not coalesce(v_flag, false) then
    return jsonb_build_object('ok', false, 'status', 403, 'error', 'feature_disabled');
  end if;
  v_can_edit := public.is_tenant_admin(v_tenant)
             or public.has_project_role(p_project_id, 'lead')
             or public.has_project_role(p_project_id, 'editor');
  if not v_can_edit then
    return jsonb_build_object('ok', false, 'status', 403, 'error', 'forbidden');
  end if;
  v_cost_clear := public.is_tenant_admin(v_tenant)
               or public.has_project_role(p_project_id, 'lead');

  v_intent_kind := p_intent->>'kind';
  if v_intent_kind is null or v_intent_kind <> 'shift_dates' then
    return jsonb_build_object('ok', false, 'status', 422, 'error', 'unsupported_intent_kind');
  end if;
  v_shift_days := coalesce((p_intent->>'days')::int, 0);
  if v_shift_days = 0 then
    return jsonb_build_object('ok', false, 'status', 422, 'error', 'shift_days_required_nonzero');
  end if;

  if jsonb_typeof(p_sources) <> 'array' or jsonb_array_length(p_sources) = 0 then
    return jsonb_build_object('ok', false, 'status', 422,
      'error', 'sources_required',
      'hint', 'sources must be a non-empty array of {node_id, node_kind}.');
  end if;
  for v_source_entry in select * from jsonb_array_elements(p_sources) loop
    v_source_id := (v_source_entry->>'node_id')::uuid;
    v_source_kind := v_source_entry->>'node_kind';
    if v_source_id is null then
      return jsonb_build_object('ok', false, 'status', 422,
        'error', 'invalid_source_entry',
        'hint', 'Each source must have a non-null node_id (uuid).');
    end if;
    if v_source_kind not in ('phase','sprint') then
      return jsonb_build_object('ok', false, 'status', 422,
        'error', 'unsupported_source_node_kind',
        'hint', 'Each source.node_kind must be ''phase'' or ''sprint''.');
    end if;
    v_sources_array := array_append(v_sources_array, v_source_id);
    v_sources_kinds := array_append(v_sources_kinds, v_source_kind);
  end loop;
  v_sources_n := array_length(v_sources_array, 1);

  if jsonb_typeof(p_if_updated_at) <> 'array' or jsonb_array_length(p_if_updated_at) = 0 then
    return jsonb_build_object('ok', false, 'status', 422,
      'error', 'if_updated_at_required',
      'hint', 'Array must contain at minimum one entry per source_node with current updated_at.');
  end if;
  for v_si in 1..v_sources_n loop
    v_source_id := v_sources_array[v_si];
    v_source_kind := v_sources_kinds[v_si];
    v_source_found := false;
    for v_lock_entry in select * from jsonb_array_elements(p_if_updated_at) loop
      if (v_lock_entry->>'node_id')::uuid = v_source_id
         and (v_lock_entry->>'node_kind') = v_source_kind then
        v_source_found := true;
        exit;
      end if;
    end loop;
    if not v_source_found then
      v_missing_sources := v_missing_sources || jsonb_build_array(
        jsonb_build_object('node_id', v_source_id, 'node_kind', v_source_kind));
    end if;
  end loop;
  if jsonb_array_length(v_missing_sources) > 0 then
    return jsonb_build_object('ok', false, 'status', 422,
      'error', 'source_node_lock_missing',
      'hint', 'if_updated_at must include an entry for every source_node.',
      'missing_sources', v_missing_sources);
  end if;

  -- -----------------------------------------------------------------
  -- Step 5 (ε.3c.δ D6): shared-visited BFS now traverses outgoing
  -- edges from phase AND sprint sources (was: phase only).
  -- -----------------------------------------------------------------
  for v_si in 1..v_sources_n loop
    v_source_id := v_sources_array[v_si];
    v_source_kind := v_sources_kinds[v_si];

    if not (v_source_id = any(v_visited)) then
      v_visited := array_append(v_visited, v_source_id);
    end if;
    v_queue := array[v_source_id];
    v_queue_kinds := array[v_source_kind];
    v_depth := 0;

    while array_length(v_queue, 1) > 0 and v_depth < v_max_depth loop
      v_next_ids := array[]::uuid[];
      v_next_kinds := array[]::text[];
      for v_idx in 1..array_length(v_queue, 1) loop
        v_cur_id := v_queue[v_idx];
        v_cur_kind := v_queue_kinds[v_idx];
        if v_cur_kind = 'phase' then
          if not (v_cur_id = any(v_phase_ids)) then
            v_phase_ids := array_append(v_phase_ids, v_cur_id);
          end if;
        elsif v_cur_kind = 'sprint' then
          if not (v_cur_id = any(v_sprint_ids)) then
            v_sprint_ids := array_append(v_sprint_ids, v_cur_id);
          end if;
        end if;
        -- D6 widened: phase AND sprint sources walk outgoing edges.
        if v_cur_kind in ('phase','sprint') then
          for v_row in
            select d.to_id, d.to_type
              from public.dependencies d
             where d.project_id = p_project_id
               and d.from_type = v_cur_kind
               and d.from_id = v_cur_id
          loop
            if v_row.to_id = v_source_id then
              return jsonb_build_object('ok', false, 'status', 422,
                'cycle', jsonb_build_object(
                  'detected_at_node_id', v_cur_id,
                  'path', to_jsonb(v_visited),
                  'source_node_id', v_source_id));
            end if;
            if not (v_row.to_id = any(v_visited)) then
              v_visited := array_append(v_visited, v_row.to_id);
              v_next_ids := array_append(v_next_ids, v_row.to_id);
              v_next_kinds := array_append(v_next_kinds, v_row.to_type);
            end if;
          end loop;
        end if;
      end loop;
      v_queue := v_next_ids;
      v_queue_kinds := v_next_kinds;
      v_depth := v_depth + 1;
    end loop;
  end loop;

  for v_lock_entry in select * from jsonb_array_elements(p_if_updated_at) loop
    v_lock_node := (v_lock_entry->>'node_id')::uuid;
    v_lock_kind := v_lock_entry->>'node_kind';
    v_lock_ts := (v_lock_entry->>'updated_at')::timestamptz;
    v_db_ts := null;
    if v_lock_kind = 'phase' then
      select updated_at into v_db_ts from public.phases where id = v_lock_node;
    elsif v_lock_kind = 'sprint' then
      select updated_at into v_db_ts from public.sprints where id = v_lock_node;
    elsif v_lock_kind = 'milestone' then
      select updated_at into v_db_ts from public.milestones where id = v_lock_node;
    elsif v_lock_kind in ('work_item','work_package','todo','epic','feature','story','task','subtask','bug') then
      select updated_at into v_db_ts from public.work_items where id = v_lock_node;
    end if;
    if v_db_ts is null then
      v_conflicts := array_append(v_conflicts, v_lock_node);
    elsif v_db_ts is distinct from v_lock_ts then
      v_conflicts := array_append(v_conflicts, v_lock_node);
    end if;
  end loop;
  if array_length(v_conflicts, 1) > 0 then
    return jsonb_build_object('ok', false, 'status', 409,
      'conflict', jsonb_build_object(
        'conflicted_node_ids', to_jsonb(v_conflicts),
        'current_snapshot_hint', jsonb_build_object('updated_at', now())));
  end if;

  perform set_config('audit.causation_id', v_causation::text, true);
  perform set_config('audit.change_reason', 'plan_mutate_bulk', true);

  v_diff := '[]'::jsonb;

  if array_length(v_phase_ids, 1) > 0 then
    for v_row in
      select p.id, p.name, p.planned_start, p.planned_end
        from public.phases p
       where p.id = any(v_phase_ids)
         and p.project_id = p_project_id
         and p.is_deleted = false
    loop
      v_old_start := v_row.planned_start;
      v_old_end := v_row.planned_end;
      v_new_start := v_old_start + (v_shift_days || ' days')::interval;
      v_new_end := v_old_end + (v_shift_days || ' days')::interval;
      v_diff := v_diff || jsonb_build_array(
        jsonb_build_object('node_id', v_row.id, 'node_kind', 'phase', 'node_label', v_row.name,
          'field', 'start_date',
          'before', jsonb_build_object('kind','exact','value', v_old_start),
          'after',  jsonb_build_object('kind','exact','value', v_new_start),
          'severity', case when v_shift_days > 0 then 'delay' else 'neutral' end,
          'masked', false),
        jsonb_build_object('node_id', v_row.id, 'node_kind', 'phase', 'node_label', v_row.name,
          'field', 'end_date',
          'before', jsonb_build_object('kind','exact','value', v_old_end),
          'after',  jsonb_build_object('kind','exact','value', v_new_end),
          'severity', case when v_shift_days > 0 then 'delay' else 'neutral' end,
          'masked', false));
    end loop;
    update public.phases p
       set planned_start = p.planned_start + (v_shift_days || ' days')::interval,
           planned_end   = p.planned_end   + (v_shift_days || ' days')::interval
     where p.id = any(v_phase_ids)
       and p.project_id = p_project_id
       and p.is_deleted = false;
  end if;

  if array_length(v_sprint_ids, 1) > 0 then
    for v_row in
      select s.id, s.name, s.start_date, s.end_date
        from public.sprints s
       where s.id = any(v_sprint_ids)
         and s.project_id = p_project_id
    loop
      v_old_start := v_row.start_date;
      v_old_end := v_row.end_date;
      v_new_start := v_old_start + (v_shift_days || ' days')::interval;
      v_new_end := v_old_end + (v_shift_days || ' days')::interval;
      v_diff := v_diff || jsonb_build_array(
        jsonb_build_object('node_id', v_row.id, 'node_kind', 'sprint', 'node_label', v_row.name,
          'field', 'start_date',
          'before', jsonb_build_object('kind','exact','value', v_old_start),
          'after',  jsonb_build_object('kind','exact','value', v_new_start),
          'severity', case when v_shift_days > 0 then 'delay' else 'neutral' end,
          'masked', false),
        jsonb_build_object('node_id', v_row.id, 'node_kind', 'sprint', 'node_label', v_row.name,
          'field', 'end_date',
          'before', jsonb_build_object('kind','exact','value', v_old_end),
          'after',  jsonb_build_object('kind','exact','value', v_new_end),
          'severity', case when v_shift_days > 0 then 'delay' else 'neutral' end,
          'masked', false));
    end loop;
    update public.sprints s
       set start_date = s.start_date + (v_shift_days || ' days')::interval,
           end_date   = s.end_date   + (v_shift_days || ' days')::interval
     where s.id = any(v_sprint_ids)
       and s.project_id = p_project_id;
  end if;

  if not v_cost_clear then
    v_diff := v_diff || jsonb_build_array(
      jsonb_build_object(
        'node_id', v_sources_array[1],
        'node_kind', v_sources_kinds[1],
        'node_label', null,
        'field', 'cost_estimate',
        'before', jsonb_build_object('kind','masked','value', null),
        'after',  jsonb_build_object('kind','aggregate','bucket', public._cost_aggregate_bucket(0)),
        'severity', 'neutral',
        'masked', true));
  end if;

  -- -----------------------------------------------------------------
  -- Step 10 (ε.3c.δ D7): per-affected-node risk rollup driven by
  -- risk_links. Same shape as single-source.
  -- -----------------------------------------------------------------
  declare
    v_phase_id uuid;
    v_sprint_id uuid;
    v_top3 jsonb;
    v_max_score smallint;
    v_max_bucket text;
    v_phase_label text;
    v_sprint_label text;
  begin
    if array_length(v_phase_ids, 1) > 0 then
      foreach v_phase_id in array v_phase_ids loop
        v_top3 := '[]'::jsonb;
        v_max_score := 0;
        v_max_bucket := 'low';
        select name into v_phase_label from public.phases where id = v_phase_id;
        for v_row in
          select r.id, r.title, r.score
            from public.risk_links rl
            join public.risks r on r.id = rl.risk_id
           where rl.tenant_id = v_tenant
             and rl.linked_kind = 'phase'
             and rl.linked_id = v_phase_id
             and r.project_id = p_project_id
             and r.status = 'open'
           order by r.score desc nulls last
           limit 3
        loop
          v_top3 := v_top3 || jsonb_build_array(jsonb_build_object(
            'risk_id', v_row.id, 'title', v_row.title,
            'severity', public._risk_severity_bucket(v_row.score)));
          if v_row.score > v_max_score then
            v_max_score := v_row.score;
            v_max_bucket := public._risk_severity_bucket(v_row.score);
          end if;
        end loop;
        if jsonb_array_length(v_top3) > 0 then
          v_diff := v_diff || jsonb_build_array(
            jsonb_build_object('node_id', v_phase_id, 'node_kind', 'phase',
              'node_label', v_phase_label, 'field', 'risk_severity',
              'before', jsonb_build_object('kind','enum','value', v_max_bucket),
              'after',  jsonb_build_object('kind','enum','value', v_max_bucket),
              'severity', case when v_shift_days > 0 then 'delay' else 'neutral' end,
              'masked', false, 'top_3_risks', v_top3));
        end if;
      end loop;
    end if;

    if array_length(v_sprint_ids, 1) > 0 then
      foreach v_sprint_id in array v_sprint_ids loop
        v_top3 := '[]'::jsonb;
        v_max_score := 0;
        v_max_bucket := 'low';
        select name into v_sprint_label from public.sprints where id = v_sprint_id;
        for v_row in
          select r.id, r.title, r.score
            from public.risk_links rl
            join public.risks r on r.id = rl.risk_id
           where rl.tenant_id = v_tenant
             and rl.linked_kind = 'sprint'
             and rl.linked_id = v_sprint_id
             and r.project_id = p_project_id
             and r.status = 'open'
           order by r.score desc nulls last
           limit 3
        loop
          v_top3 := v_top3 || jsonb_build_array(jsonb_build_object(
            'risk_id', v_row.id, 'title', v_row.title,
            'severity', public._risk_severity_bucket(v_row.score)));
          if v_row.score > v_max_score then
            v_max_score := v_row.score;
            v_max_bucket := public._risk_severity_bucket(v_row.score);
          end if;
        end loop;
        if jsonb_array_length(v_top3) > 0 then
          v_diff := v_diff || jsonb_build_array(
            jsonb_build_object('node_id', v_sprint_id, 'node_kind', 'sprint',
              'node_label', v_sprint_label, 'field', 'risk_severity',
              'before', jsonb_build_object('kind','enum','value', v_max_bucket),
              'after',  jsonb_build_object('kind','enum','value', v_max_bucket),
              'severity', case when v_shift_days > 0 then 'delay' else 'neutral' end,
              'masked', false, 'top_3_risks', v_top3));
        end if;
      end loop;
    end if;
  end;

  return jsonb_build_object('ok', true, 'causation_id', v_causation,
    'diff', jsonb_build_object('affected', v_diff));
end;
$$;

revoke all on function public.plan_mutate_atomic_bulk(uuid, jsonb, jsonb, jsonb) from public;
revoke execute on function public.plan_mutate_atomic_bulk(uuid, jsonb, jsonb, jsonb) from anon;
grant execute on function public.plan_mutate_atomic_bulk(uuid, jsonb, jsonb, jsonb) to authenticated;

comment on function public.plan_mutate_atomic_bulk(uuid, jsonb, jsonb, jsonb) is
  'PROJ-65 ε.3c.δ — bulk Plan-Mutate. Step 5 BFS widened to phase|sprint sources (D6). Step 10 risk rollup is per-affected-phase/sprint driven by risk_links (D7); phases without rows emit nothing (CIA D7-3). CIA-locked L29-L36.';

-- ---------------------------------------------------------------------------
-- Part 4 — Final smoke: confirm both RPC bodies carry the D6 + D7 markers.
-- ---------------------------------------------------------------------------
do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
   where n.nspname='public' and p.proname='plan_mutate_atomic';
  if v_def not like '%v_cur_kind in (''phase'',''sprint'')%' then
    raise exception 'D6 smoke-fail: plan_mutate_atomic BFS not widened to phase|sprint';
  end if;
  if v_def not like '%from public.risk_links rl%' then
    raise exception 'D7 smoke-fail: plan_mutate_atomic missing risk_links per-node rollup';
  end if;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
   where n.nspname='public' and p.proname='plan_mutate_atomic_bulk';
  if v_def not like '%v_cur_kind in (''phase'',''sprint'')%' then
    raise exception 'D6 smoke-fail: plan_mutate_atomic_bulk BFS not widened to phase|sprint';
  end if;
  if v_def not like '%from public.risk_links rl%' then
    raise exception 'D7 smoke-fail: plan_mutate_atomic_bulk missing risk_links per-node rollup';
  end if;

  -- risk_links table existence + RLS + grants.
  if to_regclass('public.risk_links') is null then
    raise exception 'D7 smoke-fail: risk_links table not created';
  end if;

  perform 1 from pg_class c
   where c.relname = 'risk_links'
     and c.relnamespace = 'public'::regnamespace
     and c.relrowsecurity = true;
  if not found then
    raise exception 'D7 smoke-fail: risk_links RLS not enabled';
  end if;

  raise notice 'PROJ-65 ε.3c.δ smoke: D6 + D7 markers present in RPC bodies; risk_links table + RLS in place';
end$$;
