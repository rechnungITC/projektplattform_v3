-- ---------------------------------------------------------------------------
-- PROJ-112 — Due-Diligence-Streams backbone (M&A Release 2)
--
-- Implements features/PROJ-112-*.md Tech Design (CIA GO with ADJUST, 2026-06-24).
-- EXTEND-Foundation per docs/decisions/ma-domain-architecture.md (Reuse-Matrix
-- row 112): the DD backbone that PROJ-113 (Q&A), PROJ-114 (Findings),
-- PROJ-108 (Red-Flags) and PROJ-110 (Gate 5) hang off of.
--
-- Two tables:
--   * dd_stream_templates — tenant-wide admin catalog (6 standards lazy-seeded,
--     copy-on-create). Tenant config; NO need-to-know level, NO PROJ-10 audit
--     trigger (no project anchor for can_read_audit_entry).
--   * dd_streams — per-project DD stream instance (the backbone). Adopts the
--     PROJ-100a need-to-know recipe (confidentiality_level + 3 RESTRICTIVE
--     policies) so the PROJ-99/128 advisor/NDA gate wraps it for free.
--     Field-level audited (PROJ-10) incl. a can_read_audit_entry branch.
--
-- Status via transition_dd_stream_status RPC (state-machine pattern, no direct
-- status UPDATE). No actor param (PROJ-94 impersonation lesson): auth.uid()
-- only, execute revoked from public/anon.
--
-- Idempotent (create ... if not exists / create or replace / drop policy if
-- exists) so `supabase db push` re-runs cleanly (PROJ-50/69 lesson).
-- ---------------------------------------------------------------------------

-- Section 0: extend the audit entity-type CHECK BEFORE any write -------------
-- (PROJ-100a-H-1 lesson: the CHECK must already allow 'dd_streams' before the
-- record_audit_changes trigger fires the first UPDATE.) Recreated verbatim from
-- the live constraint + 'dd_streams'. dd_stream_templates is intentionally NOT
-- added (no audit trigger on the tenant catalog).
alter table public.audit_log_entries
  drop constraint if exists audit_log_entity_type_check;
alter table public.audit_log_entries
  add constraint audit_log_entity_type_check check (
    entity_type = any (array[
      'stakeholders','work_items','phases','milestones','projects','risks',
      'decisions','open_items','tenants','tenant_settings','communication_outbox',
      'resources','work_item_resources','tenant_project_type_overrides',
      'tenant_method_overrides','vendors','vendor_project_assignments',
      'vendor_evaluations','vendor_documents','compliance_tags',
      'work_item_documents','budget_categories','budget_items','budget_postings',
      'vendor_invoices','report_snapshots','role_rates','work_item_cost_lines',
      'dependencies','tenant_ai_keys','tenant_ai_providers',
      'tenant_ai_provider_priority','tenant_ai_cost_caps','tenant_memberships',
      'organization_units','locations','stakeholder_interactions',
      'stakeholder_interaction_participants','organization_imports','releases',
      'stakeholder_coaching_recommendations','project_goals','sprints','risk_links',
      'ma_confidentiality_clearances','ma_clearance_profiles',
      'ma_advisor_profiles','ma_ndas','ma_nda_assignments',
      'dd_streams'
    ]::text[])
  );

-- Section 1: dd_stream_templates — tenant catalog ----------------------------
-- Mirrors the ma_clearance_profiles / stakeholder-types admin-CRUD catalog.
create table if not exists public.dd_stream_templates (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  stream_key  text not null,
  label       text not null,
  description text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint dd_stream_templates_stream_key_format
    check (stream_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  unique (tenant_id, stream_key)
);

create index if not exists dd_stream_templates_tenant_idx
  on public.dd_stream_templates (tenant_id);

alter table public.dd_stream_templates enable row level security;

-- Read: any tenant member (catalog is shared tenant config). Write: admin only.
drop policy if exists dd_stream_templates_select on public.dd_stream_templates;
create policy dd_stream_templates_select on public.dd_stream_templates
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

drop policy if exists dd_stream_templates_insert on public.dd_stream_templates;
create policy dd_stream_templates_insert on public.dd_stream_templates
  for insert to authenticated
  with check (public.is_tenant_admin(tenant_id));

drop policy if exists dd_stream_templates_update on public.dd_stream_templates;
create policy dd_stream_templates_update on public.dd_stream_templates
  for update to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

drop policy if exists dd_stream_templates_delete on public.dd_stream_templates;
create policy dd_stream_templates_delete on public.dd_stream_templates
  for delete to authenticated
  using (public.is_tenant_admin(tenant_id));

drop trigger if exists dd_stream_templates_set_updated_at on public.dd_stream_templates;
create trigger dd_stream_templates_set_updated_at
  before update on public.dd_stream_templates
  for each row execute function extensions.moddatetime(updated_at);

-- Section 2: dd_streams — per-project DD stream instance ----------------------
create table if not exists public.dd_streams (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  project_id          uuid not null references public.projects(id) on delete cascade,
  stream_key          text not null,
  label               text not null,
  stream_lead_user_id uuid references public.profiles(id) on delete set null,
  status              text not null default 'not_started'
    check (status in ('not_started','started','in_review','findings_consolidated','completed')),
  planned_start       date,
  planned_end         date,
  scope               text,
  notes               text,
  confidentiality_level public.ma_confidentiality_level not null default 'standard',
  phase_id            uuid references public.phases(id) on delete set null,
  sort_order          integer not null default 0,
  created_by          uuid references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint dd_streams_stream_key_format
    check (stream_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  unique (project_id, stream_key)
);

create index if not exists dd_streams_project_idx on public.dd_streams (project_id);
create index if not exists dd_streams_tenant_idx on public.dd_streams (tenant_id);
create index if not exists dd_streams_lead_idx
  on public.dd_streams (stream_lead_user_id) where stream_lead_user_id is not null;
create index if not exists dd_streams_phase_idx
  on public.dd_streams (phase_id) where phase_id is not null;

alter table public.dd_streams enable row level security;

-- Permissive tenant/project policies (PROJ-4 pattern).
-- Read: project members. Write: manage_members (tenant-admin OR project-lead).
drop policy if exists dd_streams_select on public.dd_streams;
create policy dd_streams_select on public.dd_streams
  for select to authenticated
  using (public.is_project_member(project_id));

drop policy if exists dd_streams_insert on public.dd_streams;
create policy dd_streams_insert on public.dd_streams
  for insert to authenticated
  with check (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id));

drop policy if exists dd_streams_update on public.dd_streams;
create policy dd_streams_update on public.dd_streams
  for update to authenticated
  using (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id))
  with check (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id));

drop policy if exists dd_streams_delete on public.dd_streams;
create policy dd_streams_delete on public.dd_streams
  for delete to authenticated
  using (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id));

-- RESTRICTIVE need-to-know gate (PROJ-100a recipe, AND-ed with the above; the
-- advisor/NDA gate of PROJ-99/128 wraps inside can_access_classified for free).
drop policy if exists dd_streams_confidentiality_gate on public.dd_streams;
create policy dd_streams_confidentiality_gate on public.dd_streams
  as restrictive for select to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));
drop policy if exists dd_streams_confidentiality_gate_write on public.dd_streams;
create policy dd_streams_confidentiality_gate_write on public.dd_streams
  as restrictive for update to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));
drop policy if exists dd_streams_confidentiality_gate_delete on public.dd_streams;
create policy dd_streams_confidentiality_gate_delete on public.dd_streams
  as restrictive for delete to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));

drop trigger if exists dd_streams_set_updated_at on public.dd_streams;
create trigger dd_streams_set_updated_at
  before update on public.dd_streams
  for each row execute function extensions.moddatetime(updated_at);

-- Field-level audit (PROJ-10): UPDATE-only trigger.
drop trigger if exists audit_changes_dd_streams on public.dd_streams;
create trigger audit_changes_dd_streams
  after update on public.dd_streams
  for each row execute function public.record_audit_changes();

-- Section 3: status-transition RPC (state-machine, no actor param) -----------
-- Forward path + single-step revert; reopen completed -> findings_consolidated.
-- Authority: tenant-admin OR project-lead (manage_members), mirroring the
-- activation gate. No p_actor_user_id (PROJ-94 impersonation lesson).
create or replace function public.transition_dd_stream_status(
  p_stream_id uuid,
  p_to_status text,
  p_comment   text default null
)
returns public.dd_streams
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller      uuid := auth.uid();
  v_tenant      uuid;
  v_project     uuid;
  v_from_status text;
  v_row         public.dd_streams;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select tenant_id, project_id, status
    into v_tenant, v_project, v_from_status
    from public.dd_streams where id = p_stream_id;
  if not found then
    raise exception 'dd_stream not found' using errcode = 'P0002';
  end if;

  if not (public.is_tenant_admin(v_tenant) or public.is_project_lead(v_project)) then
    raise exception 'insufficient role for dd_stream status transition'
      using errcode = '42501';
  end if;

  if p_to_status not in ('not_started','started','in_review','findings_consolidated','completed') then
    raise exception 'invalid status %', p_to_status using errcode = '22023';
  end if;

  -- State machine: linear forward + one-step revert + reopen.
  if v_from_status = 'not_started' and p_to_status not in ('started') then
    raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
  elsif v_from_status = 'started' and p_to_status not in ('in_review','not_started') then
    raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
  elsif v_from_status = 'in_review' and p_to_status not in ('findings_consolidated','started') then
    raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
  elsif v_from_status = 'findings_consolidated' and p_to_status not in ('completed','in_review') then
    raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
  elsif v_from_status = 'completed' and p_to_status not in ('findings_consolidated') then
    raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
  end if;

  update public.dd_streams
     set status = p_to_status,
         updated_at = now()
   where id = p_stream_id
   returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.transition_dd_stream_status(uuid, text, text) from public;
revoke execute on function public.transition_dd_stream_status(uuid, text, text) from anon;
grant execute on function public.transition_dd_stream_status(uuid, text, text) to authenticated;

-- Section 4: race-safe lazy seed of the 6 standard templates -----------------
-- SECURITY DEFINER so any tenant member can trigger the first-access seed
-- (write policy is admin-only); ON CONFLICT DO NOTHING makes it idempotent and
-- safe under concurrent first access. No global cross-tenant seed.
create or replace function public.ensure_default_dd_stream_templates(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_tenant_member(p_tenant_id) then
    raise exception 'not a member of this tenant' using errcode = '42501';
  end if;

  insert into public.dd_stream_templates (tenant_id, stream_key, label, sort_order)
  values
    (p_tenant_id, 'commercial', 'Commercial', 1),
    (p_tenant_id, 'financial',  'Financial',  2),
    (p_tenant_id, 'tax',        'Tax',        3),
    (p_tenant_id, 'legal',      'Legal',      4),
    (p_tenant_id, 'hr',         'HR',         5),
    (p_tenant_id, 'it',         'IT',         6)
  on conflict (tenant_id, stream_key) do nothing;
end;
$$;

revoke execute on function public.ensure_default_dd_stream_templates(uuid) from public;
revoke execute on function public.ensure_default_dd_stream_templates(uuid) from anon;
grant execute on function public.ensure_default_dd_stream_templates(uuid) to authenticated;

-- Section 5: audit wiring — recreate _tracked_audit_columns + can_read_audit_entry
-- verbatim from the live definitions + a 'dd_streams' branch each. (Templates
-- get no branch: no audit trigger, tenant config.) Reproduced from prod via
-- pg_get_functiondef on 2026-06-24.
create or replace function public._tracked_audit_columns(p_table text)
returns text[]
language sql
immutable
security definer
set search_path = 'public', 'pg_temp'
as $$
  select case p_table
    when 'stakeholders' then array['name','role_key','org_unit','contact_email','contact_phone','influence','impact','linked_user_id','notes','is_active','kind','origin','is_approver','reasoning','stakeholder_type_key','management_level','decision_authority','attitude','conflict_potential','communication_need','preferred_channel','organization_unit_id']
    when 'work_items' then array['title','description','status','priority','responsible_user_id','kind','sprint_id','parent_id','story_points','confidentiality_level']
    when 'phases' then array['name','description','planned_start','planned_end','status','sequence_number','confidentiality_level']
    when 'milestones' then array['name','description','target_date','actual_date','status','phase_id']
    when 'projects' then array['name','description','project_number','planned_start_date','planned_end_date','responsible_user_id','project_type','project_method','lifecycle_status','type_specific_data','confidentiality_level']
    when 'risks' then array['title','description','probability','impact','status','mitigation','responsible_user_id']
    when 'decisions' then array['is_revised']
    when 'open_items' then array['title','description','status','contact','contact_stakeholder_id','converted_to_entity_type','converted_to_entity_id']
    when 'tenants' then array['language','branding','holiday_region']
    when 'tenant_settings' then array['active_modules','privacy_defaults','ai_provider_config','retention_overrides','budget_settings','output_rendering_settings','cost_settings']
    when 'communication_outbox' then array['status','subject','body','channel','recipient_emails','sent_at','sent_by','provider_message_id']
    when 'resources' then array['name','role_key','default_capacity_hours_per_day','active','external_id','linked_stakeholder_id','linked_user_id','notes','daily_rate_override','daily_rate_override_currency','organization_unit_id']
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
    when 'organization_units' then array['name','code','type','parent_id','location_id','description','is_active','sort_order','import_id']
    when 'locations' then array['name','code','country','city','address','is_active','import_id']
    when 'stakeholder_interactions' then array['summary','channel','direction','interaction_date','awaiting_response','response_due_date','response_received_date','replies_to_interaction_id','deleted_at']
    when 'stakeholder_interaction_participants' then array['participant_sentiment','participant_sentiment_source','participant_sentiment_model','participant_sentiment_provider','participant_sentiment_confidence','participant_cooperation_signal','participant_cooperation_signal_source']
    when 'ma_clearance_profiles' then array['name','description','granted_level','is_active']
    when 'ma_advisor_profiles' then array['organization','advisor_type','mandate_start','mandate_end','mandate_status','responsible_user_id','scope']
    when 'ma_ndas' then array['counterparty','responsible_user_id','status','signed_date','valid_from','valid_until','scope_kind','scope_ref','covered_level','document_link','reminder_date']
    when 'ma_nda_assignments' then array['user_id','contact_name','contact_org']
    when 'dd_streams' then array['stream_key','label','stream_lead_user_id','status','planned_start','planned_end','scope','notes','confidentiality_level','phase_id','sort_order']
    else array[]::text[]
  end
$$;

revoke execute on function public._tracked_audit_columns(text) from public;

create or replace function public.can_read_audit_entry(
  p_entity_type text,
  p_entity_id uuid,
  p_tenant_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
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
    when 'releases' then
      select project_id into v_project from public.releases where id = p_entity_id;
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
    when 'work_item_documents' then
      select wi.project_id into v_project
      from public.work_item_documents wid
      join public.work_items wi on wi.id = wid.work_item_id
      where wid.id = p_entity_id;
    when 'budget_categories' then
      select project_id into v_project from public.budget_categories where id = p_entity_id;
    when 'budget_items' then
      select project_id into v_project from public.budget_items where id = p_entity_id;
    when 'budget_postings' then
      select project_id into v_project from public.budget_postings where id = p_entity_id;
    when 'vendor_invoices' then
      select project_id into v_project from public.vendor_invoices where id = p_entity_id;
      if v_project is null then return false; end if;
    when 'resources' then return false;
    when 'tenant_project_type_overrides' then return false;
    when 'tenant_method_overrides' then return false;
    when 'tenants' then return false;
    when 'tenant_settings' then return false;
    when 'vendors' then return public.is_tenant_member(p_tenant_id);
    when 'vendor_evaluations' then return public.is_tenant_member(p_tenant_id);
    when 'vendor_documents' then return public.is_tenant_member(p_tenant_id);
    when 'compliance_tags' then return public.is_tenant_member(p_tenant_id);
    when 'sprints' then
      select project_id into v_project from public.sprints where id = p_entity_id;
    when 'ma_project_profiles' then
      select project_id into v_project from public.ma_project_profiles where id = p_entity_id;
    when 'ma_advisor_profiles' then
      select project_id into v_project from public.ma_advisor_profiles where id = p_entity_id;
    when 'ma_ndas' then
      select project_id into v_project from public.ma_ndas where id = p_entity_id;
    when 'dd_streams' then
      select project_id into v_project from public.dd_streams where id = p_entity_id;
    else return false;
  end case;

  if v_project is null then return false; end if;
  return public.is_project_member(v_project);
end;
$$;
