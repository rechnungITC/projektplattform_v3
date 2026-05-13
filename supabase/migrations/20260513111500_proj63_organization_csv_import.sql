-- =============================================================================
-- PROJ-63: Organization CSV Import
-- =============================================================================
-- Adds the import job table used by the CSV preview/commit workflow and the
-- additive metadata columns needed for rollback by import_id.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Import job table
-- ---------------------------------------------------------------------------
create table if not exists public.organization_imports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  layout text not null,
  dedup_strategy text not null default 'skip',
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  committed_at timestamptz,
  committed_by uuid references public.profiles(id) on delete set null,
  status text not null default 'preview',
  row_count_total integer not null default 0,
  row_count_imported integer not null default 0,
  row_count_skipped integer not null default 0,
  row_count_errored integer not null default 0,
  report jsonb not null default '{}'::jsonb,
  original_filename text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_imports_layout_check check (
    layout in ('orgchart_hierarchy', 'person_assignment')
  ),
  constraint organization_imports_dedup_strategy_check check (
    dedup_strategy in ('skip', 'update', 'fail')
  ),
  constraint organization_imports_status_check check (
    status in ('preview', 'committed', 'rolled_back', 'failed')
  ),
  constraint organization_imports_original_filename_length check (
    char_length(original_filename) between 1 and 255
  ),
  constraint organization_imports_counts_nonnegative check (
    row_count_total >= 0
    and row_count_imported >= 0
    and row_count_skipped >= 0
    and row_count_errored >= 0
  )
);

create index if not exists organization_imports_tenant_uploaded_idx
  on public.organization_imports (tenant_id, uploaded_at desc);
create index if not exists organization_imports_tenant_status_idx
  on public.organization_imports (tenant_id, status, uploaded_at desc);

alter table public.organization_imports enable row level security;

drop policy if exists "organization_imports_select_admin"
  on public.organization_imports;
create policy "organization_imports_select_admin"
  on public.organization_imports
  for select
  to authenticated
  using (public.is_tenant_admin(tenant_id));

drop policy if exists "organization_imports_insert_admin"
  on public.organization_imports;
create policy "organization_imports_insert_admin"
  on public.organization_imports
  for insert
  to authenticated
  with check (public.is_tenant_admin(tenant_id));

drop policy if exists "organization_imports_update_admin"
  on public.organization_imports;
create policy "organization_imports_update_admin"
  on public.organization_imports
  for update
  to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

drop policy if exists "organization_imports_delete_admin"
  on public.organization_imports;
create policy "organization_imports_delete_admin"
  on public.organization_imports
  for delete
  to authenticated
  using (public.is_tenant_admin(tenant_id));

drop trigger if exists organization_imports_touch_updated_at
  on public.organization_imports;
create trigger organization_imports_touch_updated_at
  before update on public.organization_imports
  for each row execute function extensions.moddatetime(updated_at);


-- ---------------------------------------------------------------------------
-- 2. Additive metadata on PROJ-62 tables
-- ---------------------------------------------------------------------------
alter table public.locations
  add column if not exists code text;

alter table public.locations
  add column if not exists import_id uuid
    references public.organization_imports(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'locations_code_length'
      and conrelid = 'public.locations'::regclass
  ) then
    alter table public.locations
      add constraint locations_code_length
      check (code is null or char_length(code) <= 50);
  end if;
end
$$;

create unique index if not exists locations_tenant_code_unique
  on public.locations (tenant_id, code)
  where code is not null;

create index if not exists locations_import_id_idx
  on public.locations (import_id)
  where import_id is not null;

alter table public.organization_units
  add column if not exists import_id uuid
    references public.organization_imports(id) on delete set null;

create index if not exists organization_units_import_id_idx
  on public.organization_units (import_id)
  where import_id is not null;


-- ---------------------------------------------------------------------------
-- 3. Audit whitelist: preserve latest known list and add PROJ-63 columns
-- ---------------------------------------------------------------------------
create or replace function public._tracked_audit_columns(p_table text)
returns text[]
language sql
immutable
security definer
set search_path = 'public', 'pg_temp'
as $$
  select case p_table
    when 'stakeholders' then array[
      'name','role_key','org_unit','contact_email','contact_phone',
      'influence','impact','linked_user_id','notes','is_active',
      'kind','origin',
      'is_approver',
      'reasoning','stakeholder_type_key','management_level',
      'decision_authority','attitude','conflict_potential',
      'communication_need','preferred_channel',
      'organization_unit_id'
    ]
    when 'work_items' then array['title','description','status','priority','responsible_user_id','kind','sprint_id','parent_id','story_points']
    when 'phases' then array['name','description','planned_start','planned_end','status','sequence_number']
    when 'milestones' then array['name','description','target_date','actual_date','status','phase_id']
    when 'projects' then array['name','description','project_number','planned_start_date','planned_end_date','responsible_user_id','project_type','project_method','lifecycle_status','type_specific_data']
    when 'risks' then array['title','description','probability','impact','status','mitigation','responsible_user_id']
    when 'decisions' then array['is_revised']
    when 'open_items' then array['title','description','status','contact','contact_stakeholder_id','converted_to_entity_type','converted_to_entity_id']
    when 'tenants' then array['language','branding','holiday_region']
    when 'tenant_settings' then array['active_modules','privacy_defaults','ai_provider_config','retention_overrides','budget_settings','output_rendering_settings','cost_settings']
    when 'communication_outbox' then array['status','subject','body','channel','recipient_emails','sent_at','sent_by','provider_message_id']
    when 'resources' then array[
      'name','role_key','default_capacity_hours_per_day','active','external_id',
      'linked_stakeholder_id','linked_user_id','notes',
      'daily_rate_override','daily_rate_override_currency',
      'organization_unit_id'
    ]
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
    when 'role_rates' then array['daily_rate','currency','valid_from','role_key']
    when 'work_item_cost_lines' then array['amount','currency','source_type','source_metadata','occurred_on']
    when 'tenant_memberships' then array['role','organization_unit_id']
    when 'organization_units' then array[
      'name','code','type','parent_id','location_id','description',
      'is_active','sort_order','import_id'
    ]
    when 'locations' then array[
      'name','code','country','city','address','is_active','import_id'
    ]
    when 'stakeholder_interactions' then array[
      'summary','channel','direction','interaction_date',
      'awaiting_response','response_due_date','response_received_date',
      'replies_to_interaction_id','deleted_at'
    ]
    when 'stakeholder_interaction_participants' then array[
      'participant_sentiment','participant_sentiment_source',
      'participant_cooperation_signal','participant_cooperation_signal_source'
    ]
    else array[]::text[]
  end
$$;

revoke execute on function public._tracked_audit_columns(text) from public;


-- ---------------------------------------------------------------------------
-- 4. Extend audit_log_entries entity whitelist
-- ---------------------------------------------------------------------------
alter table public.audit_log_entries
  drop constraint audit_log_entity_type_check;

alter table public.audit_log_entries
  add constraint audit_log_entity_type_check check (
    entity_type in (
      'stakeholders','work_items','phases','milestones','projects',
      'risks','decisions','open_items','tenants','tenant_settings',
      'communication_outbox','resources','work_item_resources',
      'tenant_project_type_overrides','tenant_method_overrides',
      'vendors','vendor_project_assignments','vendor_evaluations',
      'vendor_documents','compliance_tags','work_item_documents',
      'budget_categories','budget_items','budget_postings',
      'vendor_invoices','report_snapshots','role_rates',
      'work_item_cost_lines','dependencies',
      'tenant_ai_keys','tenant_ai_providers','tenant_ai_provider_priority',
      'tenant_ai_cost_caps',
      'tenant_memberships',
      'organization_units','locations',
      'stakeholder_interactions',
      'stakeholder_interaction_participants',
      'organization_imports'
    )
  );


-- ---------------------------------------------------------------------------
-- 5. Import-level audit rows
-- ---------------------------------------------------------------------------
create or replace function public.tg_organization_imports_audit_fn()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_reason text;
begin
  if TG_OP = 'INSERT' then
    insert into public.audit_log_entries (
      tenant_id, entity_type, entity_id, field_name,
      old_value, new_value, actor_user_id, change_reason
    ) values (
      NEW.tenant_id, 'organization_imports', NEW.id, 'status',
      null, to_jsonb(NEW.status), auth.uid(), 'org_import_started'
    );
    return NEW;
  end if;

  if TG_OP = 'UPDATE' and OLD.status is distinct from NEW.status then
    v_reason := case NEW.status
      when 'committed' then 'org_import_committed'
      when 'rolled_back' then 'org_import_rolled_back'
      when 'failed' then 'org_import_failed'
      else 'org_import_status_changed'
    end;

    insert into public.audit_log_entries (
      tenant_id, entity_type, entity_id, field_name,
      old_value, new_value, actor_user_id, change_reason
    ) values (
      NEW.tenant_id, 'organization_imports', NEW.id, 'status',
      to_jsonb(OLD.status), to_jsonb(NEW.status), auth.uid(), v_reason
    );
  end if;

  return NEW;
end;
$$;

revoke execute on function public.tg_organization_imports_audit_fn()
  from public, anon, authenticated;

drop trigger if exists organization_imports_audit_insert
  on public.organization_imports;
create trigger organization_imports_audit_insert
  after insert on public.organization_imports
  for each row execute function public.tg_organization_imports_audit_fn();

drop trigger if exists organization_imports_audit_status_update
  on public.organization_imports;
create trigger organization_imports_audit_status_update
  after update of status on public.organization_imports
  for each row execute function public.tg_organization_imports_audit_fn();
