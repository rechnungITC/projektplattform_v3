-- =============================================================================
-- PROJ-15: Vendor and Procurement
-- =============================================================================
-- Architecture decisions locked in /architecture as A-D-A:
--   * Two surfaces: /stammdaten/vendors + /projects/[id]/lieferanten
--   * Write rights: tenant-admin or tenant_role='editor' for master data;
--     project editor/lead/admin for assignments (PROJ-11 pattern)
--   * Avg-Score on-the-fly via JOIN+AVG (no materialized column)
--
-- Four new tables: vendors, vendor_project_assignments, vendor_evaluations,
-- vendor_documents. All tenant-scoped via tenant_id NOT NULL CASCADE.
-- ST-05 KI contract pre-screening explicitly out of scope (Legal § 1 RDG).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- vendors — tenant-scoped master data
-- ---------------------------------------------------------------------------
create table public.vendors (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null,
  name                     text not null,
  category                 text,
  primary_contact_email    text,
  website                  text,
  status                   text not null default 'active',
  created_by               uuid not null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint vendors_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint vendors_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint vendors_status_check
    check (status in ('active','inactive')),
  constraint vendors_name_length
    check (char_length(name) between 1 and 255),
  constraint vendors_category_length
    check (category is null or char_length(category) <= 120),
  constraint vendors_email_length
    check (primary_contact_email is null or char_length(primary_contact_email) <= 320),
  -- HTTPS-only at the DB level — defense-in-depth on top of Zod validation.
  constraint vendors_website_https
    check (website is null or website ~ '^https://')
);

create index vendors_tenant_status_idx
  on public.vendors (tenant_id, status, name);

alter table public.vendors enable row level security;

create policy "vendors_select_member"
  on public.vendors for select
  using (public.is_tenant_member(tenant_id));

create policy "vendors_insert_admin_or_editor"
  on public.vendors for insert
  with check (
    public.is_tenant_admin(tenant_id)
    or public.has_tenant_role(tenant_id, 'editor')
  );

create policy "vendors_update_admin_or_editor"
  on public.vendors for update
  using (
    public.is_tenant_admin(tenant_id)
    or public.has_tenant_role(tenant_id, 'editor')
  )
  with check (
    public.is_tenant_admin(tenant_id)
    or public.has_tenant_role(tenant_id, 'editor')
  );

create policy "vendors_delete_admin"
  on public.vendors for delete
  using (public.is_tenant_admin(tenant_id));

create trigger vendors_set_updated_at
  before update on public.vendors
  for each row execute procedure extensions.moddatetime ('updated_at');


-- ---------------------------------------------------------------------------
-- vendor_project_assignments — Vendor↔Project with role
-- ---------------------------------------------------------------------------
create table public.vendor_project_assignments (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  project_id      uuid not null,
  vendor_id       uuid not null,
  role            text not null,
  scope_note      text,
  valid_from      date,
  valid_until     date,
  created_by      uuid not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint vpa_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint vpa_project_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint vpa_vendor_fkey
    foreign key (vendor_id) references public.vendors(id) on delete cascade,
  constraint vpa_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint vpa_role_check
    check (role in ('lieferant','subunternehmer','berater','weitere')),
  constraint vpa_scope_note_length
    check (scope_note is null or char_length(scope_note) <= 2000),
  constraint vpa_date_order
    check (valid_until is null or valid_from is null or valid_from <= valid_until)
);

create unique index vpa_unique_per_role
  on public.vendor_project_assignments (project_id, vendor_id, role);

create index vpa_project_idx
  on public.vendor_project_assignments (project_id, created_at desc);

create index vpa_vendor_idx
  on public.vendor_project_assignments (vendor_id);

alter table public.vendor_project_assignments enable row level security;

create policy "vpa_select_member"
  on public.vendor_project_assignments for select
  using (public.is_project_member(project_id));

create policy "vpa_insert_editor_or_lead_or_admin"
  on public.vendor_project_assignments for insert
  with check (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );

create policy "vpa_update_editor_or_lead_or_admin"
  on public.vendor_project_assignments for update
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

create policy "vpa_delete_editor_or_lead_or_admin"
  on public.vendor_project_assignments for delete
  using (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );

create trigger vpa_set_updated_at
  before update on public.vendor_project_assignments
  for each row execute procedure extensions.moddatetime ('updated_at');


-- ---------------------------------------------------------------------------
-- vendor_evaluations — free-text criterion + score 1-5
-- ---------------------------------------------------------------------------
create table public.vendor_evaluations (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  vendor_id       uuid not null,
  criterion       text not null,
  score           smallint not null,
  comment         text,
  created_by      uuid not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint ve_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint ve_vendor_fkey
    foreign key (vendor_id) references public.vendors(id) on delete cascade,
  constraint ve_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint ve_score_range
    check (score between 1 and 5),
  constraint ve_criterion_length
    check (char_length(criterion) between 1 and 200),
  constraint ve_comment_length
    check (comment is null or char_length(comment) <= 2000)
);

create index ve_vendor_idx
  on public.vendor_evaluations (vendor_id, created_at desc);

alter table public.vendor_evaluations enable row level security;

create policy "ve_select_member"
  on public.vendor_evaluations for select
  using (public.is_tenant_member(tenant_id));

create policy "ve_write_admin_or_editor"
  on public.vendor_evaluations for all
  using (
    public.is_tenant_admin(tenant_id)
    or public.has_tenant_role(tenant_id, 'editor')
  )
  with check (
    public.is_tenant_admin(tenant_id)
    or public.has_tenant_role(tenant_id, 'editor')
  );

create trigger ve_set_updated_at
  before update on public.vendor_evaluations
  for each row execute procedure extensions.moddatetime ('updated_at');


-- ---------------------------------------------------------------------------
-- vendor_documents — metadata + external URL (no upload pipeline)
-- ---------------------------------------------------------------------------
create table public.vendor_documents (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  vendor_id       uuid not null,
  kind            text not null,
  title           text not null,
  external_url    text not null,
  document_date   date,
  note            text,
  created_by      uuid not null,
  created_at      timestamptz not null default now(),
  constraint vd_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint vd_vendor_fkey
    foreign key (vendor_id) references public.vendors(id) on delete cascade,
  constraint vd_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint vd_kind_check
    check (kind in ('offer','contract','nda','reference','other')),
  constraint vd_title_length
    check (char_length(title) between 1 and 200),
  -- HTTPS-only at the DB level — no http://, no javascript:, no file://.
  constraint vd_https_only
    check (external_url ~ '^https://'),
  constraint vd_url_length
    check (char_length(external_url) <= 2000),
  constraint vd_note_length
    check (note is null or char_length(note) <= 2000)
);

create index vd_vendor_idx
  on public.vendor_documents (vendor_id, created_at desc);

alter table public.vendor_documents enable row level security;

create policy "vd_select_member"
  on public.vendor_documents for select
  using (public.is_tenant_member(tenant_id));

create policy "vd_write_admin_or_editor"
  on public.vendor_documents for all
  using (
    public.is_tenant_admin(tenant_id)
    or public.has_tenant_role(tenant_id, 'editor')
  )
  with check (
    public.is_tenant_admin(tenant_id)
    or public.has_tenant_role(tenant_id, 'editor')
  );


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
      'resources','work_item_resources',
      'tenant_project_type_overrides','tenant_method_overrides',
      'vendors','vendor_project_assignments','vendor_evaluations','vendor_documents'
    )
  );

create or replace function public._tracked_audit_columns(p_table text)
returns text[]
language sql
immutable
security definer
set search_path = public
as $func$
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
    when 'tenant_project_type_overrides' then array['overrides']
    when 'tenant_method_overrides' then array['enabled']
    when 'vendors' then array['name','category','primary_contact_email','website','status']
    when 'vendor_project_assignments' then array['role','scope_note','valid_from','valid_until']
    when 'vendor_evaluations' then array['criterion','score','comment']
    when 'vendor_documents' then array['kind','title','external_url','document_date','note']
    else array[]::text[]
  end
$func$;

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
as $func$
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
    when 'vendor_project_assignments' then
      select project_id into v_project from public.vendor_project_assignments where id = p_entity_id;
    -- Tenant-wide entities → admin-only history (handled by short-circuit above)
    when 'resources' then return false;
    when 'tenant_project_type_overrides' then return false;
    when 'tenant_method_overrides' then return false;
    when 'tenants' then return false;
    when 'tenant_settings' then return false;
    -- Vendor master data, evaluations, documents are tenant-wide; allow
    -- any tenant_member to see history (they can already see the data).
    when 'vendors' then return public.is_tenant_member(p_tenant_id);
    when 'vendor_evaluations' then return public.is_tenant_member(p_tenant_id);
    when 'vendor_documents' then return public.is_tenant_member(p_tenant_id);
    else return false;
  end case;

  if v_project is null then return false; end if;
  return public.is_project_member(v_project);
end;
$func$;

create trigger audit_changes_vendors
  after update on public.vendors
  for each row execute function public.record_audit_changes();

create trigger audit_changes_vendor_project_assignments
  after update on public.vendor_project_assignments
  for each row execute function public.record_audit_changes();

create trigger audit_changes_vendor_evaluations
  after update on public.vendor_evaluations
  for each row execute function public.record_audit_changes();


-- ---------------------------------------------------------------------------
-- Module activation: promote 'vendor' to active for all existing tenants
-- ---------------------------------------------------------------------------
update public.tenant_settings
   set active_modules = active_modules || '"vendor"'::jsonb
 where not (active_modules @> '"vendor"'::jsonb);
