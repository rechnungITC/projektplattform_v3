-- =============================================================================
-- PROJ-9: work_items STI + sprints + dependencies + cycle prevention
-- =============================================================================
-- Implements Tech Design § C/E/F/G of features/PROJ-9-work-item-metamodel-backlog.md.
-- Order matters: sprints must exist before work_items (FK reference); phases +
-- milestones already exist (PROJ-19 migration 20260428090000).
--
-- Defense-in-depth model:
--   1. Zod at the API boundary (nice errors)
--   2. CHECK constraints on enum-style columns
--   3. BEFORE INSERT/UPDATE triggers for cycle + cross-project guards
--   4. RLS policies using PROJ-4 helpers (is_project_member, has_project_role,
--      is_project_lead, is_tenant_admin)

-- -----------------------------------------------------------------------------
-- Section 1: sprints (must come BEFORE work_items because of FK)
-- -----------------------------------------------------------------------------
create table public.sprints (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  project_id  uuid not null,
  name        text not null,
  goal        text,
  start_date  date,
  end_date    date,
  state       text not null default 'planned',
  created_by  uuid not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint sprints_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint sprints_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade,
  constraint sprints_created_by_fkey foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint sprints_state_check check (state in ('planned','active','closed')),
  constraint sprints_dates_order check (end_date is null or start_date is null or end_date >= start_date)
);

create index sprints_project_state_idx on public.sprints (project_id, state);
create index sprints_project_start_date_idx on public.sprints (project_id, start_date desc);

-- -----------------------------------------------------------------------------
-- Section 2: work_items (Single-Table-Inheritance)
-- -----------------------------------------------------------------------------
create table public.work_items (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null,
  project_id               uuid not null,
  kind                     text not null,
  parent_id                uuid,
  phase_id                 uuid,
  milestone_id             uuid,
  sprint_id                uuid,
  title                    text not null,
  description              text,
  status                   text not null default 'todo',
  priority                 text not null default 'medium',
  responsible_user_id      uuid,
  attributes               jsonb not null default '{}'::jsonb,
  position                 double precision,
  created_from_proposal_id uuid,
  created_by               uuid not null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  is_deleted               boolean not null default false,

  constraint work_items_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint work_items_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade,
  constraint work_items_parent_id_fkey foreign key (parent_id) references public.work_items(id) on delete set null,
  constraint work_items_phase_id_fkey foreign key (phase_id) references public.phases(id) on delete set null,
  constraint work_items_milestone_id_fkey foreign key (milestone_id) references public.milestones(id) on delete set null,
  constraint work_items_sprint_id_fkey foreign key (sprint_id) references public.sprints(id) on delete set null,
  constraint work_items_responsible_user_id_fkey foreign key (responsible_user_id) references public.profiles(id) on delete restrict,
  constraint work_items_created_by_fkey foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint work_items_kind_check check (kind in ('epic','feature','story','task','subtask','bug','work_package')),
  constraint work_items_status_check check (status in ('todo','in_progress','blocked','done','cancelled')),
  constraint work_items_priority_check check (priority in ('low','medium','high','critical')),
  constraint work_items_no_self_parent check (parent_id is null or parent_id <> id)
);

create index work_items_project_kind_status_idx on public.work_items (project_id, kind, status);
create index work_items_project_parent_idx on public.work_items (project_id, parent_id);
create index work_items_project_sprint_idx on public.work_items (project_id, sprint_id);
create index work_items_parent_id_idx on public.work_items (parent_id);
create index work_items_responsible_user_idx on public.work_items (responsible_user_id);
create index work_items_bug_filter_idx on public.work_items (project_id) where kind = 'bug' and is_deleted = false;
create index work_items_active_idx on public.work_items (project_id) where is_deleted = false;

-- -----------------------------------------------------------------------------
-- Section 3: dependencies (predecessor/successor edges between work_items)
-- -----------------------------------------------------------------------------
create table public.dependencies (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  project_id      uuid not null,
  predecessor_id  uuid not null,
  successor_id    uuid not null,
  type            text not null,
  lag_days        integer not null default 0,
  created_by      uuid not null,
  created_at      timestamptz not null default now(),

  constraint dependencies_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint dependencies_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade,
  constraint dependencies_predecessor_id_fkey foreign key (predecessor_id) references public.work_items(id) on delete cascade,
  constraint dependencies_successor_id_fkey foreign key (successor_id) references public.work_items(id) on delete cascade,
  constraint dependencies_created_by_fkey foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint dependencies_type_check check (type in ('FS','SS','FF','SF')),
  constraint dependencies_no_self check (predecessor_id <> successor_id),
  constraint dependencies_unique unique (predecessor_id, successor_id, type)
);

create index dependencies_project_idx on public.dependencies (project_id);
create index dependencies_predecessor_idx on public.dependencies (predecessor_id);
create index dependencies_successor_idx on public.dependencies (successor_id);

-- -----------------------------------------------------------------------------
-- Section 4: Cycle prevention triggers
-- -----------------------------------------------------------------------------

-- Parent-chain cycle prevention for work_items.
create or replace function public.prevent_work_item_parent_cycle()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_ancestor uuid; v_visited uuid[] := array[new.id];
begin
  if new.parent_id is null then return new; end if;
  v_ancestor := new.parent_id;
  while v_ancestor is not null loop
    if v_ancestor = any(v_visited) then
      raise exception 'cycle in parent chain' using errcode = 'check_violation';
    end if;
    v_visited := v_visited || v_ancestor;
    select parent_id into v_ancestor from public.work_items where id = v_ancestor;
  end loop;
  return new;
end;
$$;

create trigger work_items_no_parent_cycle
  before insert or update of parent_id on public.work_items
  for each row execute function public.prevent_work_item_parent_cycle();

-- Same-project guard for dependencies.
create or replace function public.enforce_dependency_same_project()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_pred_proj uuid; v_succ_proj uuid;
begin
  select project_id into v_pred_proj from public.work_items where id = new.predecessor_id;
  select project_id into v_succ_proj from public.work_items where id = new.successor_id;
  if v_pred_proj is null or v_succ_proj is null or v_pred_proj <> v_succ_proj then
    raise exception 'predecessor and successor must belong to the same project'
      using errcode = '22023';
  end if;
  if new.project_id <> v_pred_proj then
    raise exception 'dependency project_id must match work_items project_id'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger dependencies_same_project
  before insert or update of predecessor_id, successor_id, project_id on public.dependencies
  for each row execute function public.enforce_dependency_same_project();

-- Cycle prevention for dependencies.
create or replace function public.prevent_dependency_cycle()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_visited uuid[]; v_current uuid; v_next uuid[];
begin
  -- Walk the successor side: if we can reach predecessor_id from successor_id,
  -- adding the new edge would close a cycle.
  v_visited := array[new.successor_id];
  v_current := new.successor_id;
  while v_current is not null loop
    select array_agg(d.successor_id) into v_next
      from public.dependencies d
      where d.predecessor_id = v_current;
    if v_next is null then
      v_current := null;
    else
      if new.predecessor_id = any(v_next) then
        raise exception 'dependency cycle detected' using errcode = 'check_violation';
      end if;
      v_current := null;
      for i in 1..array_length(v_next, 1) loop
        if not (v_next[i] = any(v_visited)) then
          v_visited := v_visited || v_next[i];
          v_current := v_next[i];
          exit;
        end if;
      end loop;
    end if;
  end loop;
  return new;
end;
$$;

create trigger dependencies_no_cycle
  before insert on public.dependencies
  for each row execute function public.prevent_dependency_cycle();

-- -----------------------------------------------------------------------------
-- Section 5: Sprint state machine (single-active per project)
-- -----------------------------------------------------------------------------
create or replace function public.set_sprint_state(p_sprint_id uuid, p_to_state text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid; v_tenant uuid; v_project uuid; v_from_state text;
begin
  v_caller := auth.uid();
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select tenant_id, project_id, state into v_tenant, v_project, v_from_state
    from public.sprints where id = p_sprint_id;
  if not found then
    raise exception 'sprint not found' using errcode = '02000';
  end if;

  if not (
    public.is_tenant_admin(v_tenant)
    or public.has_project_role(v_project, 'lead')
    or public.has_project_role(v_project, 'editor')
  ) then
    raise exception 'insufficient role for sprint state transition' using errcode = '42501';
  end if;

  -- Allowed: planned -> active, active -> closed. Closed is terminal.
  if v_from_state = 'planned' and p_to_state <> 'active' then
    raise exception 'cannot transition from planned to %', p_to_state using errcode = '23514';
  elsif v_from_state = 'active' and p_to_state <> 'closed' then
    raise exception 'cannot transition from active to %', p_to_state using errcode = '23514';
  elsif v_from_state = 'closed' then
    raise exception 'closed sprints are terminal' using errcode = '23514';
  end if;

  -- When activating: ensure no other active sprint in the same project.
  if p_to_state = 'active' and exists (
    select 1 from public.sprints
    where project_id = v_project and state = 'active' and id <> p_sprint_id
  ) then
    raise exception 'another sprint in this project is already active' using errcode = '23514';
  end if;

  update public.sprints set state = p_to_state, updated_at = now() where id = p_sprint_id;

  return jsonb_build_object('id', p_sprint_id, 'state', p_to_state, 'from_state', v_from_state);
end;
$$;

revoke all on function public.set_sprint_state(uuid, text) from public, anon;
grant execute on function public.set_sprint_state(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Section 6: RLS
-- -----------------------------------------------------------------------------
alter table public.sprints enable row level security;
alter table public.work_items enable row level security;
alter table public.dependencies enable row level security;

-- sprints
create policy sprints_select on public.sprints for select to authenticated
  using (public.is_project_member(project_id));
create policy sprints_insert on public.sprints for insert to authenticated
  with check (
    public.is_tenant_admin(tenant_id)
    or public.has_project_role(project_id, 'lead')
    or public.has_project_role(project_id, 'editor')
  );
create policy sprints_update on public.sprints for update to authenticated
  using (
    public.is_tenant_admin(tenant_id)
    or public.has_project_role(project_id, 'lead')
    or public.has_project_role(project_id, 'editor')
  )
  with check (
    public.is_tenant_admin(tenant_id)
    or public.has_project_role(project_id, 'lead')
    or public.has_project_role(project_id, 'editor')
  );
create policy sprints_delete on public.sprints for delete to authenticated
  using (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id));

-- work_items
create policy work_items_select on public.work_items for select to authenticated
  using (public.is_project_member(project_id));
create policy work_items_insert on public.work_items for insert to authenticated
  with check (
    public.is_tenant_admin(tenant_id)
    or public.has_project_role(project_id, 'lead')
    or public.has_project_role(project_id, 'editor')
  );
create policy work_items_update on public.work_items for update to authenticated
  using (
    public.is_tenant_admin(tenant_id)
    or public.has_project_role(project_id, 'lead')
    or public.has_project_role(project_id, 'editor')
  )
  with check (
    public.is_tenant_admin(tenant_id)
    or public.has_project_role(project_id, 'lead')
    or public.has_project_role(project_id, 'editor')
  );
create policy work_items_delete on public.work_items for delete to authenticated
  using (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id));

-- dependencies (immutable: no UPDATE policy → delete + recreate)
create policy dependencies_select on public.dependencies for select to authenticated
  using (public.is_project_member(project_id));
create policy dependencies_insert on public.dependencies for insert to authenticated
  with check (
    public.is_tenant_admin(tenant_id)
    or public.has_project_role(project_id, 'lead')
    or public.has_project_role(project_id, 'editor')
  );
create policy dependencies_delete on public.dependencies for delete to authenticated
  using (
    public.is_tenant_admin(tenant_id)
    or public.has_project_role(project_id, 'lead')
    or public.has_project_role(project_id, 'editor')
  );

-- -----------------------------------------------------------------------------
-- Section 7: updated_at moddatetime triggers
-- -----------------------------------------------------------------------------
create trigger sprints_set_updated_at
  before update on public.sprints
  for each row execute procedure extensions.moddatetime (updated_at);

create trigger work_items_set_updated_at
  before update on public.work_items
  for each row execute procedure extensions.moddatetime (updated_at);

-- -----------------------------------------------------------------------------
-- Section 8: anon hardening (consistent with PROJ-1 / PROJ-2)
-- -----------------------------------------------------------------------------
revoke select on public.sprints from anon;
revoke select on public.work_items from anon;
revoke select on public.dependencies from anon;
