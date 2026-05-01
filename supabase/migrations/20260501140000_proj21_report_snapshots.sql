-- =============================================================================
-- PROJ-21 — Output Rendering: Status-Report & Executive-Summary
-- =============================================================================
-- Adds the immutable `report_snapshots` table that backs the
-- /reports/snapshots/[id] route, the API routes under
-- /api/projects/[id]/snapshots/*, and the synchronous PDF render
-- pipeline. Snapshots are immutable: re-rendering creates a new
-- (project_id, kind, version) row; old rows + their HTML/PDF stay
-- reachable until tenant offboarding cascades them.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1) report_snapshots — the central snapshot table
-- ---------------------------------------------------------------------------
create table public.report_snapshots (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null,
  project_id                  uuid not null,
  kind                        text not null,
  version                     int not null,
  generated_by                uuid not null,
  generated_at                timestamptz not null default now(),
  content                     jsonb not null,
  pdf_storage_key             text,
  pdf_status                  text not null default 'pending',
  ki_summary_classification   int,
  ki_provider                 text,
  constraint report_snapshots_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint report_snapshots_project_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint report_snapshots_generated_by_fkey
    foreign key (generated_by) references auth.users(id) on delete set null,
  constraint report_snapshots_kind_check
    check (kind in ('status_report','executive_summary')),
  constraint report_snapshots_pdf_status_check
    check (pdf_status in ('pending','available','failed')),
  constraint report_snapshots_classification_check
    check (ki_summary_classification is null or ki_summary_classification between 1 and 3),
  constraint report_snapshots_version_positive
    check (version > 0),
  constraint report_snapshots_unique_version
    unique (project_id, kind, version)
);

-- Indexes for the hot paths: per-project list + per-tenant cleanup +
-- per-(project, kind) version sequence lookup.
create index idx_report_snapshots_project_kind
  on public.report_snapshots (project_id, kind, version desc);
create index idx_report_snapshots_tenant
  on public.report_snapshots (tenant_id);
create index idx_report_snapshots_generated_by
  on public.report_snapshots (generated_by);


-- ---------------------------------------------------------------------------
-- 2) RLS — tenant-member SELECT, project-editor/lead/tenant-admin INSERT,
--    no UPDATE / no DELETE (immutability).
-- ---------------------------------------------------------------------------
alter table public.report_snapshots enable row level security;

create policy report_snapshots_tenant_select on public.report_snapshots
  for select to authenticated
  using ( public.is_tenant_member(tenant_id) );

create policy report_snapshots_editor_insert on public.report_snapshots
  for insert to authenticated
  with check (
    public.is_tenant_member(tenant_id)
    and (
      public.has_project_role(project_id, 'editor')
      or public.is_project_lead(project_id)
      or public.is_tenant_admin(tenant_id)
    )
  );

-- Explicit immutability: deny UPDATE + DELETE for non-service-role.
-- Snapshots stay until tenant offboarding cascades them via
-- ON DELETE CASCADE on tenant_id.
revoke update, delete on public.report_snapshots from authenticated;


-- ---------------------------------------------------------------------------
-- 3) Synthetic audit entry on snapshot creation
-- ---------------------------------------------------------------------------
-- Snapshots are immutable so the regular per-column audit trigger
-- never fires. We insert a single synthetic row on INSERT so the
-- creation event is reconstructable from audit_log_entries alone.
create or replace function public.report_snapshots_audit_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_log_entries (
    tenant_id, entity_type, entity_id, field_name,
    old_value, new_value, actor_user_id, change_reason
  ) values (
    NEW.tenant_id,
    'report_snapshots',
    NEW.id,
    'snapshot_created',
    null,
    jsonb_build_object('kind', NEW.kind, 'version', NEW.version),
    NEW.generated_by,
    'snapshot_created'
  );
  return NEW;
end;
$$;

revoke execute on function public.report_snapshots_audit_insert() from public, anon, authenticated;

create trigger report_snapshots_audit_insert_trigger
  after insert on public.report_snapshots
  for each row
  execute function public.report_snapshots_audit_insert();


-- ---------------------------------------------------------------------------
-- 4) Whitelist `report_snapshots` in audit_log_entity_type_check
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
      'vendors','vendor_project_assignments','vendor_evaluations','vendor_documents',
      'compliance_tags','work_item_documents',
      'budget_categories','budget_items','budget_postings','vendor_invoices',
      'report_snapshots'
    )
  );

-- Snapshots are immutable; tracked-columns array stays empty (audit
-- is INSERT-only via the trigger above).
create or replace function public._tracked_audit_columns(p_table text)
returns text[]
language sql
immutable
security definer
set search_path = public, pg_temp
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
    when 'tenant_settings' then array['active_modules','privacy_defaults','ai_provider_config','retention_overrides','budget_settings','output_rendering_settings']
    when 'communication_outbox' then array['status','subject','body','channel','recipient_emails','sent_at','sent_by','provider_message_id']
    when 'resources' then array['name','role_key','default_capacity_hours_per_day','active','external_id','linked_stakeholder_id','linked_user_id','notes']
    when 'work_item_resources' then array['effort_hours','role_key','start_date','end_date']
    when 'tenant_project_type_overrides' then array['display_name','description','rules','active','sort_order']
    when 'tenant_method_overrides' then array['display_name','description','rules','active','sort_order']
    when 'vendors' then array['name','vendor_number','category','status','contact_email','contact_phone','website','notes','tax_id']
    when 'vendor_project_assignments' then array['role','status','signed_at','signed_off_by','removed_at','removed_by']
    when 'vendor_evaluations' then array['rubric_key','score','comment','evaluated_at','evaluated_by']
    when 'vendor_documents' then array['kind','title','file_url','signed_at','signed_off_by','expires_at','metadata']
    when 'compliance_tags' then array['key','label','description','data_classes','required_for_kinds']
    when 'work_item_documents' then array['title','file_url','tag_keys','description']
    when 'budget_categories' then array['name','description','position']
    when 'budget_items' then array['name','description','category_id','planned_amount','planned_currency','position']
    when 'budget_postings' then array['budget_item_id','amount','currency','posted_at','description','source_type','source_ref','reverses_posting_id']
    when 'vendor_invoices' then array['vendor_id','invoice_number','total_amount','currency','invoice_date','due_date','status','document_id','metadata']
    when 'report_snapshots' then array[]::text[]
    else array[]::text[]
  end
$func$;

revoke execute on function public._tracked_audit_columns(text) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 5) Tenant-settings: add `output_rendering_settings` JSONB column +
--    register `output_rendering` as a default-on toggleable module.
-- ---------------------------------------------------------------------------
alter table public.tenant_settings
  add column if not exists output_rendering_settings jsonb not null
    default '{"ki_narrative_enabled": false}'::jsonb;

alter table public.tenant_settings
  drop constraint if exists tenant_settings_output_rendering_settings_object;

alter table public.tenant_settings
  add constraint tenant_settings_output_rendering_settings_object
    check (jsonb_typeof(output_rendering_settings) = 'object');

-- Idempotently backfill `output_rendering` into every existing tenant's
-- active_modules. Skipped per-row when the module is already present.
update public.tenant_settings
   set active_modules = active_modules || '["output_rendering"]'::jsonb
 where not (active_modules @> '["output_rendering"]'::jsonb);

-- New tenants pick it up automatically via the bootstrap trigger
-- (PROJ-17). The default in the column expression is a separate
-- concern — bootstrap copies the constants from tenants_bootstrap_*.
-- Here we only need to extend the canonical constant.
-- (The `tenant_bootstrap_settings` function in PROJ-17 reads from a
--  `default_active_modules` constant; since that constant is a SQL
--  literal it must be patched in this migration too.)
create or replace function public.tenant_bootstrap_settings(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.tenant_settings (tenant_id, active_modules)
  values (
    p_tenant_id,
    '["risks","decisions","ai_proposals","audit_reports","output_rendering"]'::jsonb
  )
  on conflict (tenant_id) do update
    set active_modules = case
      when public.tenant_settings.active_modules @> '["output_rendering"]'::jsonb
        then public.tenant_settings.active_modules
      else public.tenant_settings.active_modules || '["output_rendering"]'::jsonb
    end;
end;
$$;

revoke execute on function public.tenant_bootstrap_settings(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 6) Storage bucket `reports` — private; access only via the API
--    route's signed-URL redirect.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

-- RLS on storage.objects for the bucket: only authenticated users that
-- are tenant members of the matching `report_snapshots` row may SELECT
-- the underlying object. The API route proxies via signed URL, so
-- direct GET requests are also gated.
drop policy if exists report_snapshots_storage_select on storage.objects;
create policy report_snapshots_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'reports'
    and exists (
      select 1
        from public.report_snapshots rs
       where rs.pdf_storage_key = storage.objects.name
         and public.is_tenant_member(rs.tenant_id)
    )
  );

drop policy if exists report_snapshots_storage_insert on storage.objects;
create policy report_snapshots_storage_insert on storage.objects
  for insert to authenticated
  with check (false);
-- INSERT into the reports bucket is service-role-only (the
-- puppeteer-render server-side path uses createAdminClient).
