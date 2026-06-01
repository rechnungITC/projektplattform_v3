-- =============================================================================
-- PROJ-47: Jira Export Connector backend foundation
-- =============================================================================
-- Outbound-only Jira export. PROJ-50 owns inbound webhooks and conflict
-- resolution. This migration adds only the persistence needed for:
--   * field mapping
--   * export jobs
--   * per-item export logs
--   * minimal external references for idempotent re-export
-- =============================================================================

create table public.jira_field_mappings (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  project_id       uuid,
  jira_project_key text not null,
  issue_type_map   jsonb not null default '{}'::jsonb,
  status_map       jsonb not null default '{}'::jsonb,
  priority_map     jsonb not null default '{}'::jsonb,
  labels           jsonb not null default '[]'::jsonb,
  assignee_mode    text not null default 'none',
  created_by       uuid not null,
  updated_by       uuid not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint jira_field_mappings_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint jira_field_mappings_project_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint jira_field_mappings_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint jira_field_mappings_updated_by_fkey
    foreign key (updated_by) references public.profiles(id) on delete restrict,
  constraint jira_field_mappings_project_key_check
    check (jira_project_key ~ '^[A-Z][A-Z0-9_]{0,31}$'),
  constraint jira_field_mappings_json_shape_check
    check (
      jsonb_typeof(issue_type_map) = 'object'
      and jsonb_typeof(status_map) = 'object'
      and jsonb_typeof(priority_map) = 'object'
      and jsonb_typeof(labels) = 'array'
    ),
  constraint jira_field_mappings_assignee_mode_check
    check (assignee_mode in ('none', 'responsible_user_email'))
);

create unique index jira_field_mappings_project_unique
  on public.jira_field_mappings (tenant_id, project_id)
  where project_id is not null;

create unique index jira_field_mappings_tenant_default_unique
  on public.jira_field_mappings (tenant_id)
  where project_id is null;

create index jira_field_mappings_project_idx
  on public.jira_field_mappings (project_id)
  where project_id is not null;

create trigger jira_field_mappings_set_updated_at
  before update on public.jira_field_mappings
  for each row execute procedure extensions.moddatetime ('updated_at');


create table public.jira_export_jobs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  project_id      uuid not null,
  actor_user_id   uuid not null,
  status          text not null default 'pending',
  scope           jsonb not null default '{}'::jsonb,
  total_count     integer not null default 0,
  created_count   integer not null default 0,
  updated_count   integer not null default 0,
  skipped_count   integer not null default 0,
  failed_count    integer not null default 0,
  sanitized_error text,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint jira_export_jobs_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint jira_export_jobs_project_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint jira_export_jobs_actor_fkey
    foreign key (actor_user_id) references auth.users(id) on delete restrict,
  constraint jira_export_jobs_status_check
    check (status in ('pending','running','succeeded','partial_failed','failed','cancelled')),
  constraint jira_export_jobs_counts_check
    check (
      total_count >= 0
      and created_count >= 0
      and updated_count >= 0
      and skipped_count >= 0
      and failed_count >= 0
    )
);

create index jira_export_jobs_project_created_idx
  on public.jira_export_jobs (project_id, created_at desc);

create index jira_export_jobs_tenant_status_idx
  on public.jira_export_jobs (tenant_id, status, created_at desc);

create trigger jira_export_jobs_set_updated_at
  before update on public.jira_export_jobs
  for each row execute procedure extensions.moddatetime ('updated_at');


create table public.jira_export_log (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  job_id          uuid not null,
  project_id      uuid not null,
  work_item_id    uuid not null,
  result          text not null,
  jira_issue_key  text,
  jira_issue_url  text,
  attempt         integer not null default 0,
  sanitized_error text,
  created_at      timestamptz not null default now(),

  constraint jira_export_log_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint jira_export_log_job_fkey
    foreign key (job_id) references public.jira_export_jobs(id) on delete cascade,
  constraint jira_export_log_project_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint jira_export_log_work_item_fkey
    foreign key (work_item_id) references public.work_items(id) on delete cascade,
  constraint jira_export_log_result_check
    check (result in ('created','updated','skipped','failed')),
  constraint jira_export_log_attempt_check
    check (attempt >= 0)
);

create index jira_export_log_job_idx
  on public.jira_export_log (job_id, created_at);

create index jira_export_log_work_item_idx
  on public.jira_export_log (work_item_id, created_at desc);


create table public.external_refs (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  project_id       uuid not null,
  entity_type      text not null,
  entity_id        uuid not null,
  provider         text not null,
  external_key     text not null,
  external_url     text,
  metadata         jsonb not null default '{}'::jsonb,
  last_exported_at timestamptz,
  created_by       uuid not null,
  updated_by       uuid not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint external_refs_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint external_refs_project_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint external_refs_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete restrict,
  constraint external_refs_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete restrict,
  constraint external_refs_entity_type_check
    check (entity_type in ('work_item')),
  constraint external_refs_provider_check
    check (provider in ('jira')),
  constraint external_refs_external_key_check
    check (length(external_key) > 0),
  constraint external_refs_metadata_shape_check
    check (jsonb_typeof(metadata) = 'object')
);

create unique index external_refs_entity_unique
  on public.external_refs (tenant_id, provider, entity_type, entity_id);

create unique index external_refs_external_key_unique
  on public.external_refs (tenant_id, provider, external_key);

create index external_refs_project_idx
  on public.external_refs (project_id, provider);

create trigger external_refs_set_updated_at
  before update on public.external_refs
  for each row execute procedure extensions.moddatetime ('updated_at');


alter table public.jira_field_mappings enable row level security;
alter table public.jira_export_jobs enable row level security;
alter table public.jira_export_log enable row level security;
alter table public.external_refs enable row level security;

create policy jira_field_mappings_select
  on public.jira_field_mappings for select to authenticated
  using (
    (project_id is null and public.is_tenant_admin(tenant_id))
    or (project_id is not null and public.is_project_member(project_id))
  );

create policy jira_field_mappings_insert
  on public.jira_field_mappings for insert to authenticated
  with check (
    public.is_tenant_admin(tenant_id)
    or (
      project_id is not null
      and (
        public.has_project_role(project_id, 'lead')
        or public.has_project_role(project_id, 'editor')
      )
    )
  );

create policy jira_field_mappings_update
  on public.jira_field_mappings for update to authenticated
  using (
    public.is_tenant_admin(tenant_id)
    or (
      project_id is not null
      and (
        public.has_project_role(project_id, 'lead')
        or public.has_project_role(project_id, 'editor')
      )
    )
  )
  with check (
    public.is_tenant_admin(tenant_id)
    or (
      project_id is not null
      and (
        public.has_project_role(project_id, 'lead')
        or public.has_project_role(project_id, 'editor')
      )
    )
  );

create policy jira_field_mappings_delete
  on public.jira_field_mappings for delete to authenticated
  using (
    public.is_tenant_admin(tenant_id)
    or (
      project_id is not null
      and public.has_project_role(project_id, 'lead')
    )
  );

create policy jira_export_jobs_select
  on public.jira_export_jobs for select to authenticated
  using (public.is_project_member(project_id));

create policy jira_export_jobs_insert
  on public.jira_export_jobs for insert to authenticated
  with check (
    public.is_tenant_admin(tenant_id)
    or public.has_project_role(project_id, 'lead')
    or public.has_project_role(project_id, 'editor')
  );

create policy jira_export_jobs_update
  on public.jira_export_jobs for update to authenticated
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

create policy jira_export_log_select
  on public.jira_export_log for select to authenticated
  using (public.is_project_member(project_id));

create policy jira_export_log_insert
  on public.jira_export_log for insert to authenticated
  with check (
    public.is_tenant_admin(tenant_id)
    or public.has_project_role(project_id, 'lead')
    or public.has_project_role(project_id, 'editor')
  );

create policy external_refs_select
  on public.external_refs for select to authenticated
  using (public.is_project_member(project_id));

create policy external_refs_insert
  on public.external_refs for insert to authenticated
  with check (
    public.is_tenant_admin(tenant_id)
    or public.has_project_role(project_id, 'lead')
    or public.has_project_role(project_id, 'editor')
  );

create policy external_refs_update
  on public.external_refs for update to authenticated
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

create policy external_refs_delete
  on public.external_refs for delete to authenticated
  using (
    public.is_tenant_admin(tenant_id)
    or public.has_project_role(project_id, 'lead')
  );


do $smoke$
begin
  if to_regclass('public.jira_field_mappings') is null then
    raise exception 'smoke-fail: jira_field_mappings missing';
  end if;
  if to_regclass('public.jira_export_jobs') is null then
    raise exception 'smoke-fail: jira_export_jobs missing';
  end if;
  if to_regclass('public.jira_export_log') is null then
    raise exception 'smoke-fail: jira_export_log missing';
  end if;
  if to_regclass('public.external_refs') is null then
    raise exception 'smoke-fail: external_refs missing';
  end if;

  raise notice 'PROJ-47 Jira export backend smoke checks passed';
end
$smoke$;
