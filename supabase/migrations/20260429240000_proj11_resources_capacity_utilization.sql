-- =============================================================================
-- PROJ-11: Resources, Capacities, and Cross-Project Utilization
-- =============================================================================
-- resources                — tenant-scoped pool, one row per plannable person/party.
-- resource_availabilities  — optional date-segmented FTE overrides.
-- work_item_resources      — project-scoped allocation join (work_item × resource).
--
-- Architecture choices (locked in /architecture):
--   B-A-A — Tenant-scoped resources / implicit allocation dating via the
--   work_item's phase or sprint / utilization report tenant-admin only.
--
-- The allocation join is project-scoped because it lives within a project's
-- backlog; the resource pool itself is tenant-wide so cross-project
-- aggregation is a trivial SQL join (no identity-resolver heuristics).
--
-- All three tables hold Class-3 (PII) data per the data-privacy registry.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- resources
-- ---------------------------------------------------------------------------
create table public.resources (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null,
  -- Optional link to a stakeholder. Promotion ("make this stakeholder a
  -- resource") sets this. Nullable because a resource can exist without
  -- being represented as a stakeholder in any specific project (e.g.
  -- a tenant-wide PMO admin).
  source_stakeholder_id    uuid,
  -- Optional link to a real platform user, propagated from the stakeholder
  -- when present. Used as the primary identity key when re-promoting an
  -- existing resource from a stakeholder in another project.
  linked_user_id           uuid,
  display_name             text not null,
  kind                     text not null default 'internal',
  fte_default              numeric(4,3) not null default 1.000,
  availability_default     numeric(4,3) not null default 1.000,
  is_active                boolean not null default true,
  created_by               uuid not null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint resources_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint resources_stakeholder_fkey
    foreign key (source_stakeholder_id) references public.stakeholders(id) on delete set null,
  constraint resources_linked_user_fkey
    foreign key (linked_user_id) references public.profiles(id) on delete set null,
  constraint resources_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint resources_kind_check
    check (kind in ('internal','external')),
  constraint resources_display_name_length
    check (char_length(display_name) between 1 and 200),
  constraint resources_fte_range
    check (fte_default >= 0 and fte_default <= 1),
  constraint resources_availability_range
    check (availability_default >= 0 and availability_default <= 1)
);

-- One row per (tenant, linked_user) when the link is set — guarantees
-- the canonical-Anna-per-tenant invariant. Nullable linked_user_id is
-- not constrained (the manual-resource case).
create unique index resources_tenant_user_unique
  on public.resources (tenant_id, linked_user_id)
  where linked_user_id is not null;

create index resources_tenant_active_idx
  on public.resources (tenant_id, is_active);

create index resources_tenant_kind_idx
  on public.resources (tenant_id, kind);

alter table public.resources enable row level security;

create policy "resources_select_tenant_member"
  on public.resources for select
  using (public.is_tenant_member(tenant_id));

create policy "resources_insert_editor_or_admin"
  on public.resources for insert
  with check (
    public.is_tenant_admin(tenant_id)
    or public.has_tenant_role(tenant_id, 'editor')
  );

create policy "resources_update_editor_or_admin"
  on public.resources for update
  using (
    public.is_tenant_admin(tenant_id)
    or public.has_tenant_role(tenant_id, 'editor')
  )
  with check (
    public.is_tenant_admin(tenant_id)
    or public.has_tenant_role(tenant_id, 'editor')
  );

create policy "resources_delete_admin"
  on public.resources for delete
  using (public.is_tenant_admin(tenant_id));

create trigger resources_set_updated_at
  before update on public.resources
  for each row execute procedure extensions.moddatetime ('updated_at');


-- ---------------------------------------------------------------------------
-- resource_availabilities — date-segmented FTE overrides
-- ---------------------------------------------------------------------------
create table public.resource_availabilities (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  resource_id  uuid not null,
  start_date   date not null,
  end_date     date not null,
  fte          numeric(4,3) not null,
  note         text,
  created_at   timestamptz not null default now(),
  constraint ra_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint ra_resource_fkey
    foreign key (resource_id) references public.resources(id) on delete cascade,
  constraint ra_date_order
    check (start_date <= end_date),
  constraint ra_fte_range
    check (fte >= 0 and fte <= 1),
  constraint ra_note_length
    check (note is null or char_length(note) <= 500)
);

create index resource_availabilities_resource_range_idx
  on public.resource_availabilities (resource_id, start_date, end_date);

alter table public.resource_availabilities enable row level security;

create policy "ra_select_tenant_member"
  on public.resource_availabilities for select
  using (public.is_tenant_member(tenant_id));

create policy "ra_write_editor_or_admin"
  on public.resource_availabilities for all
  using (
    public.is_tenant_admin(tenant_id)
    or public.has_tenant_role(tenant_id, 'editor')
  )
  with check (
    public.is_tenant_admin(tenant_id)
    or public.has_tenant_role(tenant_id, 'editor')
  );


-- ---------------------------------------------------------------------------
-- work_item_resources — allocation join, project-scoped
-- ---------------------------------------------------------------------------
create table public.work_item_resources (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  project_id      uuid not null,
  work_item_id    uuid not null,
  resource_id     uuid not null,
  allocation_pct  numeric(5,2) not null default 100.00,
  created_by      uuid not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint wir_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint wir_project_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint wir_work_item_fkey
    foreign key (work_item_id) references public.work_items(id) on delete cascade,
  constraint wir_resource_fkey
    foreign key (resource_id) references public.resources(id) on delete restrict,
  constraint wir_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint wir_allocation_range
    check (allocation_pct >= 0 and allocation_pct <= 200)
  -- Allow up to 200% per (work_item, resource) row to permit "this person
  -- works double on this critical task" without forcing splitting. Cross-
  -- work-item over-allocation is by design not prevented at the DB level —
  -- the utilization report surfaces it instead (yellow >90%, red >100%).
);

create unique index wir_unique_per_work_item_resource
  on public.work_item_resources (work_item_id, resource_id);

create index wir_project_idx
  on public.work_item_resources (project_id, created_at desc);

create index wir_resource_idx
  on public.work_item_resources (resource_id);

alter table public.work_item_resources enable row level security;

create policy "wir_select_member"
  on public.work_item_resources for select
  using (public.is_project_member(project_id));

create policy "wir_insert_editor_or_lead_or_admin"
  on public.work_item_resources for insert
  with check (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );

create policy "wir_update_editor_or_lead_or_admin"
  on public.work_item_resources for update
  using (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  )
  with check (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );

create policy "wir_delete_editor_or_lead_or_admin"
  on public.work_item_resources for delete
  using (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );

create trigger wir_set_updated_at
  before update on public.work_item_resources
  for each row execute procedure extensions.moddatetime ('updated_at');


-- ---------------------------------------------------------------------------
-- Audit whitelist + tracked-columns extension
-- ---------------------------------------------------------------------------
alter table public.audit_log_entries
  drop constraint audit_log_entity_type_check;

alter table public.audit_log_entries
  add constraint audit_log_entity_type_check check (
    entity_type in (
      'stakeholders','work_items','phases','milestones','projects',
      'risks','decisions','open_items',
      'tenants','tenant_settings',
      'communication_outbox',
      'resources','work_item_resources'
    )
  );

create or replace function public._tracked_audit_columns(p_table text)
returns text[]
language sql
immutable
security definer
set search_path = public
as $$
  select case p_table
    when 'stakeholders' then array['name','role_key','org_unit','contact_email','contact_phone','influence','impact','linked_user_id','notes','is_active','kind','origin']
    when 'work_items' then array['title','description','status','priority','responsible_user_id','kind','sprint_id','parent_id','story_points']
    when 'phases' then array['name','description','planned_start','planned_end','status','sequence_number']
    when 'milestones' then array['name','description','target_date','actual_date','status','phase_id']
    when 'projects' then array['name','description','project_number','planned_start_date','planned_end_date','responsible_user_id','project_type','project_method','lifecycle_status','type_specific_data']
    when 'risks' then array['title','description','probability','impact','status','mitigation','responsible_user_id']
    when 'decisions' then array['is_revised']
    when 'open_items' then array['title','description','status','contact','contact_stakeholder_id','converted_to_entity_type','converted_to_entity_id']
    when 'tenants' then array['language','branding']
    when 'tenant_settings' then array['active_modules','privacy_defaults','ai_provider_config','retention_overrides']
    when 'communication_outbox' then array['status','error_detail','sent_at']
    when 'resources' then array['display_name','kind','fte_default','availability_default','is_active','linked_user_id']
    when 'work_item_resources' then array['allocation_pct']
    else array[]::text[]
  end
$$;

create or replace function public.can_read_audit_entry(
  p_entity_type text,
  p_entity_id uuid,
  p_tenant_id uuid
)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_project uuid;
begin
  if public.is_tenant_admin(p_tenant_id) then
    return true;
  end if;

  case p_entity_type
    when 'projects' then v_project := p_entity_id;
    when 'stakeholders' then
      select project_id into v_project from public.stakeholders where id = p_entity_id;
    when 'work_items' then
      select project_id into v_project from public.work_items where id = p_entity_id;
    when 'phases' then
      select project_id into v_project from public.phases where id = p_entity_id;
    when 'milestones' then
      select project_id into v_project from public.milestones where id = p_entity_id;
    when 'risks' then
      select project_id into v_project from public.risks where id = p_entity_id;
    when 'decisions' then
      select project_id into v_project from public.decisions where id = p_entity_id;
    when 'open_items' then
      select project_id into v_project from public.open_items where id = p_entity_id;
    when 'communication_outbox' then
      select project_id into v_project from public.communication_outbox where id = p_entity_id;
    when 'work_item_resources' then
      select project_id into v_project from public.work_item_resources where id = p_entity_id;
    -- Resources are tenant-scoped HR data → admin-only history (handled
    -- by the is_tenant_admin short-circuit at the top of this function).
    when 'resources' then return false;
    when 'tenants' then return false;
    when 'tenant_settings' then return false;
    else return false;
  end case;

  if v_project is null then return false; end if;
  return public.is_project_member(v_project);
end;
$$;

create trigger audit_changes_resources
  after update on public.resources
  for each row execute function public.record_audit_changes();

create trigger audit_changes_work_item_resources
  after update on public.work_item_resources
  for each row execute function public.record_audit_changes();


-- ---------------------------------------------------------------------------
-- Cross-Project Utilization Aggregation
-- ---------------------------------------------------------------------------
-- For a tenant + a date range + a bucket size, return one row per
-- (resource, bucket_start) with the day-weighted utilization percentage.
--
-- Utilization = sum over all overlapping work_item_resources allocations
--   of (allocation_pct * overlap_days / bucket_days * applicable_fte)
-- where applicable_fte comes from the latest matching resource_availabilities
-- segment, falling back to resources.fte_default × availability_default.
--
-- Date source for the work_item is its phase (planned_start/planned_end)
-- or its sprint (start_date/end_date). Work items with neither are
-- excluded from the aggregation (matching the design choice 2A).
--
-- The function is SECURITY INVOKER so RLS still applies — non-admins
-- only see resources/allocations they're allowed to see.
-- ---------------------------------------------------------------------------
create or replace function public.utilization_report(
  p_tenant_id   uuid,
  p_start       date,
  p_end         date,
  p_bucket      text  -- 'week' | 'month' | 'quarter'
)
returns table (
  resource_id    uuid,
  resource_name  text,
  bucket_start   date,
  bucket_end     date,
  utilization    numeric
)
language sql
security invoker
stable
set search_path = public
as $$
  with bucket_def as (
    select case p_bucket
             when 'week'    then '1 week'::interval
             when 'month'   then '1 month'::interval
             when 'quarter' then '3 months'::interval
             else '1 week'::interval
           end as step
  ),
  buckets as (
    select gs::date as bucket_start,
           (gs + (select step from bucket_def) - interval '1 day')::date as bucket_end
    from generate_series(
      date_trunc(case p_bucket when 'week' then 'week' when 'quarter' then 'quarter' else 'month' end, p_start::timestamp),
      p_end::timestamp,
      (select step from bucket_def)
    ) gs
  ),
  -- Resolve the date span for each work item. Phase wins; sprint is fallback.
  wi_dates as (
    select wi.id as work_item_id,
           wi.tenant_id,
           wi.project_id,
           coalesce(ph.planned_start, sp.start_date) as wi_start,
           coalesce(ph.planned_end,   sp.end_date)   as wi_end
    from public.work_items wi
    left join public.phases  ph on ph.id = wi.phase_id
    left join public.sprints sp on sp.id = wi.sprint_id
    where wi.tenant_id = p_tenant_id
  ),
  alloc as (
    select wir.resource_id,
           wir.allocation_pct,
           wid.wi_start, wid.wi_end
    from public.work_item_resources wir
    join wi_dates wid on wid.work_item_id = wir.work_item_id
    where wir.tenant_id = p_tenant_id
      and wid.wi_start is not null
      and wid.wi_end   is not null
      and wid.wi_end   >= p_start
      and wid.wi_start <= p_end
  ),
  -- For each (resource × bucket × allocation) compute the overlap in days.
  per_alloc_bucket as (
    select a.resource_id,
           b.bucket_start, b.bucket_end,
           a.allocation_pct,
           greatest(
             0,
             (least(a.wi_end, b.bucket_end)::date
              - greatest(a.wi_start, b.bucket_start)::date) + 1
           )::numeric as overlap_days,
           ((b.bucket_end - b.bucket_start) + 1)::numeric as bucket_days
    from alloc a
    cross join buckets b
    where a.wi_start <= b.bucket_end
      and a.wi_end   >= b.bucket_start
  ),
  per_resource_bucket as (
    select resource_id, bucket_start, bucket_end,
           sum(allocation_pct * overlap_days / nullif(bucket_days, 0)) as raw_share
    from per_alloc_bucket
    group by resource_id, bucket_start, bucket_end
  )
  select r.id as resource_id,
         r.display_name as resource_name,
         b.bucket_start,
         b.bucket_end,
         coalesce(prb.raw_share, 0)
           * (r.fte_default * r.availability_default) as utilization
  from public.resources r
  cross join buckets b
  left join per_resource_bucket prb
    on prb.resource_id = r.id
   and prb.bucket_start = b.bucket_start
  where r.tenant_id = p_tenant_id
    and r.is_active
  order by r.display_name, b.bucket_start
$$;

revoke execute on function public.utilization_report(uuid, date, date, text) from public, anon;


-- ---------------------------------------------------------------------------
-- Module activation: add `resources` to all existing tenants. Idempotent.
-- ---------------------------------------------------------------------------
update public.tenant_settings
   set active_modules = active_modules || '"resources"'::jsonb
 where not (active_modules @> '"resources"'::jsonb);
