-- =============================================================================
-- PROJ-27: Cross-Project Work-Item Links + Sub-Project Bridge
-- =============================================================================
-- Adds semantic work-item links alongside the scheduling `dependencies` graph.
-- `dependencies` stays the schedule engine; `work_item_links` is the richer
-- relation layer for relates/blocks/includes/requires/delivers and cross-
-- project bridge links.
-- =============================================================================

create table public.work_item_links (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  from_work_item_id  uuid not null,
  to_work_item_id    uuid,
  from_project_id    uuid not null,
  to_project_id      uuid not null,
  link_type          text not null,
  lag_days           integer,
  approval_state     text not null default 'approved',
  approval_project_id uuid,
  approved_by        uuid,
  approved_at        timestamptz,
  created_by         uuid not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint work_item_links_tenant_id_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint work_item_links_from_work_item_id_fkey
    foreign key (from_work_item_id) references public.work_items(id) on delete cascade,
  constraint work_item_links_to_work_item_id_fkey
    foreign key (to_work_item_id) references public.work_items(id) on delete cascade,
  constraint work_item_links_from_project_id_fkey
    foreign key (from_project_id) references public.projects(id) on delete cascade,
  constraint work_item_links_to_project_id_fkey
    foreign key (to_project_id) references public.projects(id) on delete cascade,
  constraint work_item_links_approved_by_fkey
    foreign key (approved_by) references public.profiles(id) on delete set null,
  constraint work_item_links_approval_project_id_fkey
    foreign key (approval_project_id) references public.projects(id) on delete set null,
  constraint work_item_links_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint work_item_links_type_check
    check (link_type in (
      'relates',
      'precedes', 'follows',
      'blocks', 'blocked',
      'duplicates', 'duplicated',
      'includes', 'partof',
      'requires', 'required',
      'delivers', 'delivered_by'
    )),
  constraint work_item_links_approval_state_check
    check (approval_state in ('approved', 'pending', 'rejected')),
  constraint work_item_links_pending_has_approval_project
    check (approval_state <> 'pending' or approval_project_id is not null),
  constraint work_item_links_lag_days_check
    check (lag_days is null or lag_days between -2000 and 2000),
  constraint work_item_links_no_self_item
    check (to_work_item_id is null or from_work_item_id <> to_work_item_id),
  constraint work_item_links_whole_project_only_delivers
    check (to_work_item_id is not null or link_type = 'delivers')
);

comment on table public.work_item_links is
  'PROJ-27 semantic work-item links. Cross-project allowed within one tenant; '
  'whole-project targets are represented by to_work_item_id IS NULL + to_project_id.';

create index work_item_links_from_item_idx
  on public.work_item_links (from_work_item_id, approval_state);
create index work_item_links_to_item_idx
  on public.work_item_links (to_work_item_id, approval_state)
  where to_work_item_id is not null;
create index work_item_links_from_project_idx
  on public.work_item_links (from_project_id, approval_state);
create index work_item_links_to_project_idx
  on public.work_item_links (to_project_id, approval_state);
create index work_item_links_approval_project_idx
  on public.work_item_links (approval_project_id, approval_state)
  where approval_project_id is not null;
create index work_item_links_tenant_idx
  on public.work_item_links (tenant_id);

create unique index work_item_links_unique_item_edge
  on public.work_item_links (from_work_item_id, to_work_item_id, link_type)
  where to_work_item_id is not null;

create unique index work_item_links_unique_project_edge
  on public.work_item_links (from_work_item_id, to_project_id, link_type)
  where to_work_item_id is null;

-- -----------------------------------------------------------------------------
-- Trigger A: canonical link storage.
-- -----------------------------------------------------------------------------
-- Reverse tokens are stored as the canonical relation with endpoints swapped,
-- mirroring OpenProject's `reverse_if_needed` behavior and the TS registry in
-- `src/lib/work-items/link-types.ts`.
create or replace function public.canonicalize_work_item_link_type()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tmp_item uuid;
  v_tmp_project uuid;
begin
  if new.link_type in (
    'follows', 'blocked', 'duplicated', 'partof', 'required', 'delivered_by'
  ) then
    if new.to_work_item_id is null then
      raise exception 'whole-project links must use canonical link_type delivers'
        using errcode = '22023';
    end if;

    v_tmp_item := new.from_work_item_id;
    new.from_work_item_id := new.to_work_item_id;
    new.to_work_item_id := v_tmp_item;

    v_tmp_project := new.from_project_id;
    new.from_project_id := new.to_project_id;
    new.to_project_id := v_tmp_project;

    new.link_type := case new.link_type
      when 'follows' then 'precedes'
      when 'blocked' then 'blocks'
      when 'duplicated' then 'duplicates'
      when 'partof' then 'includes'
      when 'required' then 'requires'
      when 'delivered_by' then 'delivers'
      else new.link_type
    end;
  end if;

  return new;
end;
$$;

revoke execute on function public.canonicalize_work_item_link_type()
  from public, anon, authenticated;

create trigger work_item_links_canonicalize
  before insert or update of link_type, from_work_item_id, to_work_item_id,
    from_project_id, to_project_id
  on public.work_item_links
  for each row execute function public.canonicalize_work_item_link_type();

-- -----------------------------------------------------------------------------
-- Trigger B: endpoint integrity + tenant boundary.
-- -----------------------------------------------------------------------------
create or replace function public.validate_work_item_link_endpoints()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_from_tenant uuid;
  v_from_project uuid;
  v_to_tenant uuid;
  v_to_project uuid;
begin
  select tenant_id, project_id
    into v_from_tenant, v_from_project
    from public.work_items
    where id = new.from_work_item_id;

  if v_from_tenant is null then
    raise exception 'from_work_item_id does not exist' using errcode = '23503';
  end if;

  if new.to_work_item_id is not null then
    select tenant_id, project_id
      into v_to_tenant, v_to_project
      from public.work_items
      where id = new.to_work_item_id;
    if v_to_tenant is null then
      raise exception 'to_work_item_id does not exist' using errcode = '23503';
    end if;
  else
    select tenant_id, id
      into v_to_tenant, v_to_project
      from public.projects
      where id = new.to_project_id
        and is_deleted = false;
    if v_to_tenant is null then
      raise exception 'to_project_id does not exist' using errcode = '23503';
    end if;
  end if;

  if v_from_tenant <> new.tenant_id or v_to_tenant <> new.tenant_id then
    raise exception 'cross-tenant work-item links are not allowed'
      using errcode = '22023';
  end if;
  if v_from_tenant <> v_to_tenant then
    raise exception 'cross-tenant work-item links are not allowed'
      using errcode = '22023';
  end if;
  if new.from_project_id <> v_from_project then
    raise exception 'from_project_id must match from_work_item_id.project_id'
      using errcode = '22023';
  end if;
  if new.to_project_id <> v_to_project then
    raise exception 'to_project_id must match the target project'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke execute on function public.validate_work_item_link_endpoints()
  from public, anon, authenticated;

create trigger work_item_links_validate_endpoints
  before insert or update of tenant_id, from_work_item_id, to_work_item_id,
    from_project_id, to_project_id
  on public.work_item_links
  for each row execute function public.validate_work_item_link_endpoints();

-- -----------------------------------------------------------------------------
-- Trigger C: cycle prevention across directional links + work_item parent chain.
-- -----------------------------------------------------------------------------
create or replace function public.prevent_work_item_link_cycle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hit boolean;
begin
  if new.to_work_item_id is null then
    return new;
  end if;

  if new.link_type not in ('precedes', 'blocks', 'includes', 'requires', 'delivers') then
    return new;
  end if;

  with recursive edges as (
    select from_work_item_id as from_id, to_work_item_id as to_id
    from public.work_item_links
    where to_work_item_id is not null
      and id <> new.id
      and approval_state <> 'rejected'
      and link_type in ('precedes', 'blocks', 'includes', 'requires', 'delivers')
    union all
    select parent_id as from_id, id as to_id
    from public.work_items
    where parent_id is not null
  ),
  walk as (
    select new.to_work_item_id as id, 1 as depth
    union all
    select e.to_id, w.depth + 1
    from edges e
    join walk w on e.from_id = w.id
    where w.depth < 10000
  )
  select exists(
    select 1 from walk where id = new.from_work_item_id
  ) into v_hit;

  if v_hit then
    raise exception 'work_item_link cycle detected' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function public.prevent_work_item_link_cycle()
  from public, anon, authenticated;

create trigger work_item_links_no_cycle
  before insert or update of from_work_item_id, to_work_item_id, link_type,
    approval_state
  on public.work_item_links
  for each row execute function public.prevent_work_item_link_cycle();

create trigger work_item_links_set_updated_at
  before update on public.work_item_links
  for each row execute procedure extensions.moddatetime(updated_at);

-- -----------------------------------------------------------------------------
-- RLS.
-- -----------------------------------------------------------------------------
alter table public.work_item_links enable row level security;

create policy work_item_links_select
  on public.work_item_links
  for select to authenticated
  using (
    public.is_project_member(from_project_id)
    or public.is_project_member(to_project_id)
  );

create policy work_item_links_insert
  on public.work_item_links
  for insert to authenticated
  with check (
    public.is_tenant_admin(tenant_id)
    or public.has_project_role(from_project_id, 'lead')
    or public.has_project_role(from_project_id, 'editor')
    or public.has_project_role(to_project_id, 'lead')
    or public.has_project_role(to_project_id, 'editor')
  );

create policy work_item_links_update
  on public.work_item_links
  for update to authenticated
  using (
    public.is_tenant_admin(tenant_id)
    or public.is_project_lead(from_project_id)
    or public.is_project_lead(to_project_id)
  )
  with check (
    public.is_tenant_admin(tenant_id)
    or public.is_project_lead(from_project_id)
    or public.is_project_lead(to_project_id)
  );

create policy work_item_links_delete
  on public.work_item_links
  for delete to authenticated
  using (
    public.is_tenant_admin(tenant_id)
    or public.has_project_role(from_project_id, 'lead')
    or public.has_project_role(from_project_id, 'editor')
    or public.has_project_role(to_project_id, 'lead')
    or public.has_project_role(to_project_id, 'editor')
  );

revoke select on public.work_item_links from anon;
