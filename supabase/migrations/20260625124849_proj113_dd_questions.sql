-- ---------------------------------------------------------------------------
-- PROJ-113 — DD-Fragenkatalog & Q&A-Prozess (M&A Release 2)
--
-- Implements features/PROJ-113-*.md Tech Design (CIA GO with ADJUST, 2026-06-25).
-- EXTEND on the PROJ-112 DD backbone: dd_questions hangs off dd_streams.id.
-- Follows the 112 recipe (table + status RPC + 100a confidentiality + PROJ-10
-- audit), no new pattern.
--
-- CIA-mandated adjustments:
--   * R-1 FLOOR: per-question confidentiality_level must be >= the parent
--     stream's level (a question may be STRICTER for clean-team, never below —
--     else it would leak the strict stream's existence). Implemented as a
--     BEFORE INSERT/UPDATE trigger that clamps UP via GREATEST (which also gives
--     "default = inherit stream level" for free, since the column default is
--     'standard').
--   * R-3: the 3 RESTRICTIVE can_access_classified policies cover
--     INSERT/UPDATE/DELETE too (not only SELECT) — a low-clearance editor can
--     neither see nor write a strict question. Write-gate (permissive) = `edit`
--     (tenant-admin OR project-lead OR project-editor), Q&A being operational.
--
-- Idempotent; name == repo filename stem (PROJ-134).
-- ---------------------------------------------------------------------------

-- Section 0: extend the audit entity-type CHECK BEFORE any write -------------
-- Recreated verbatim from the live constraint + 'dd_questions'.
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
      'ma_advisor_profiles','ma_ndas','ma_nda_assignments','dd_streams',
      'ma_clearance_grant_requests','ma_clearance_approval_policies',
      'raci_assignments',
      'dd_questions'
    ]::text[])
  );

-- Section 1: dd_questions -----------------------------------------------------
create table if not exists public.dd_questions (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  project_id          uuid not null references public.projects(id) on delete cascade,
  dd_stream_id        uuid not null references public.dd_streams(id) on delete cascade,
  title               text not null,
  detail              text,
  addressee           text,
  priority            text not null default 'medium'
    check (priority in ('low','medium','high')),
  due_date            date,
  responsible_user_id uuid references public.profiles(id) on delete set null,
  status              text not null default 'open'
    check (status in ('open','in_answering','answered','followup','closed')),
  answer_text         text,
  answer_link         text,
  answered_at         timestamptz,
  answered_by         uuid references public.profiles(id) on delete set null,
  answer_round        smallint not null default 1,
  confidentiality_level public.ma_confidentiality_level not null default 'standard',
  created_by          uuid references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists dd_questions_project_idx on public.dd_questions (project_id);
create index if not exists dd_questions_tenant_idx on public.dd_questions (tenant_id);
create index if not exists dd_questions_stream_idx on public.dd_questions (dd_stream_id);
create index if not exists dd_questions_stream_status_idx
  on public.dd_questions (dd_stream_id, status);
create index if not exists dd_questions_owner_idx
  on public.dd_questions (responsible_user_id) where responsible_user_id is not null;

alter table public.dd_questions enable row level security;

-- Section 2: FLOOR trigger (R-1) ---------------------------------------------
-- Clamp confidentiality_level UP to the parent stream's level (never below),
-- and enforce tenant/project consistency with the parent stream. Runs BEFORE
-- the RESTRICTIVE WITH-CHECK, so the gate evaluates the clamped level.
create or replace function public.enforce_dd_question_confidentiality_floor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant  uuid;
  v_project uuid;
  v_level   public.ma_confidentiality_level;
begin
  select tenant_id, project_id, confidentiality_level
    into v_tenant, v_project, v_level
    from public.dd_streams where id = NEW.dd_stream_id;
  if not found then
    raise exception 'dd_stream not found' using errcode = '23503';
  end if;

  -- integrity: a question must live in the same tenant/project as its stream
  if NEW.tenant_id <> v_tenant or NEW.project_id <> v_project then
    raise exception 'dd_question tenant/project must match its stream'
      using errcode = '23514';
  end if;

  -- floor: never below the stream (default 'standard' => inherits stream level)
  NEW.confidentiality_level := greatest(NEW.confidentiality_level, v_level);
  return NEW;
end;
$$;

-- Trigger-only function: revoke from public AND the Supabase anon/authenticated
-- roles (which receive EXECUTE via default privileges), matching the posture of
-- record_audit_changes / enforce_project_responsible_user_in_tenant.
revoke execute on function public.enforce_dd_question_confidentiality_floor() from public, anon, authenticated;

drop trigger if exists dd_questions_confidentiality_floor on public.dd_questions;
create trigger dd_questions_confidentiality_floor
  before insert or update on public.dd_questions
  for each row execute function public.enforce_dd_question_confidentiality_floor();

-- Section 3: RLS — permissive (edit-gate) + RESTRICTIVE need-to-know ---------
-- Permissive: read = project member; write = edit (admin OR lead OR editor).
drop policy if exists dd_questions_select on public.dd_questions;
create policy dd_questions_select on public.dd_questions
  for select to authenticated
  using (public.is_project_member(project_id));

drop policy if exists dd_questions_insert on public.dd_questions;
create policy dd_questions_insert on public.dd_questions
  for insert to authenticated
  with check (
    public.is_tenant_admin(tenant_id)
    or public.is_project_lead(project_id)
    or public.has_project_role(project_id, 'editor')
  );

drop policy if exists dd_questions_update on public.dd_questions;
create policy dd_questions_update on public.dd_questions
  for update to authenticated
  using (
    public.is_tenant_admin(tenant_id)
    or public.is_project_lead(project_id)
    or public.has_project_role(project_id, 'editor')
  )
  with check (
    public.is_tenant_admin(tenant_id)
    or public.is_project_lead(project_id)
    or public.has_project_role(project_id, 'editor')
  );

drop policy if exists dd_questions_delete on public.dd_questions;
create policy dd_questions_delete on public.dd_questions
  for delete to authenticated
  using (
    public.is_tenant_admin(tenant_id)
    or public.is_project_lead(project_id)
    or public.has_project_role(project_id, 'editor')
  );

-- RESTRICTIVE need-to-know gate on ALL axes (R-3), AND-ed with the above.
drop policy if exists dd_questions_confidentiality_gate on public.dd_questions;
create policy dd_questions_confidentiality_gate on public.dd_questions
  as restrictive for select to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));
drop policy if exists dd_questions_confidentiality_gate_insert on public.dd_questions;
create policy dd_questions_confidentiality_gate_insert on public.dd_questions
  as restrictive for insert to authenticated
  with check (public.can_access_classified(project_id, confidentiality_level));
drop policy if exists dd_questions_confidentiality_gate_update on public.dd_questions;
create policy dd_questions_confidentiality_gate_update on public.dd_questions
  as restrictive for update to authenticated
  using (public.can_access_classified(project_id, confidentiality_level))
  with check (public.can_access_classified(project_id, confidentiality_level));
drop policy if exists dd_questions_confidentiality_gate_delete on public.dd_questions;
create policy dd_questions_confidentiality_gate_delete on public.dd_questions
  as restrictive for delete to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));

-- updated_at + field-level audit (PROJ-10, UPDATE-only)
drop trigger if exists dd_questions_set_updated_at on public.dd_questions;
create trigger dd_questions_set_updated_at
  before update on public.dd_questions
  for each row execute function extensions.moddatetime(updated_at);

drop trigger if exists audit_changes_dd_questions on public.dd_questions;
create trigger audit_changes_dd_questions
  after update on public.dd_questions
  for each row execute function public.record_audit_changes();

-- Section 4: status-transition RPC (5-state machine, no actor param) ----------
-- Authority: tenant-admin OR project lead/editor (edit). State machine: linear
-- forward + one-step revert + reopen.
create or replace function public.transition_dd_question_status(
  p_question_id uuid,
  p_to_status   text,
  p_comment     text default null
)
returns public.dd_questions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller      uuid := auth.uid();
  v_tenant      uuid;
  v_project     uuid;
  v_from_status text;
  v_level       public.ma_confidentiality_level;
  v_row         public.dd_questions;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select tenant_id, project_id, status, confidentiality_level
    into v_tenant, v_project, v_from_status, v_level
    from public.dd_questions where id = p_question_id;
  if not found then
    raise exception 'dd_question not found' using errcode = 'P0002';
  end if;

  -- Authority = edit role (admin / lead / editor) ...
  if not (
    public.is_tenant_admin(v_tenant)
    or exists (
      select 1 from public.project_memberships
      where project_id = v_project and user_id = v_caller
        and role in ('lead','editor')
    )
  ) then
    raise exception 'insufficient role for dd_question status transition'
      using errcode = '42501';
  end if;

  -- ... AND need-to-know clearance for the question's level. This RPC is
  -- SECURITY DEFINER and bypasses the RESTRICTIVE RLS gate, so it MUST re-check
  -- the gate itself — otherwise an uncleared editor could blind-transition a
  -- confidential question they cannot even see (live-smoke finding 2026-06-25).
  -- admin + cleared users pass via can_access_classified; 'standard' passes for all.
  if not public.can_access_classified(v_project, v_level) then
    raise exception 'insufficient clearance for dd_question status transition'
      using errcode = '42501';
  end if;

  if p_to_status not in ('open','in_answering','answered','followup','closed') then
    raise exception 'invalid status %', p_to_status using errcode = '22023';
  end if;

  if v_from_status = 'open' and p_to_status not in ('in_answering') then
    raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
  elsif v_from_status = 'in_answering' and p_to_status not in ('answered','open') then
    raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
  elsif v_from_status = 'answered' and p_to_status not in ('followup','closed','in_answering') then
    raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
  elsif v_from_status = 'followup' and p_to_status not in ('in_answering','answered') then
    raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
  elsif v_from_status = 'closed' and p_to_status not in ('followup') then
    raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
  end if;

  update public.dd_questions
     set status = p_to_status,
         updated_at = now()
   where id = p_question_id
   returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.transition_dd_question_status(uuid, text, text) from public;
revoke execute on function public.transition_dd_question_status(uuid, text, text) from anon;
grant execute on function public.transition_dd_question_status(uuid, text, text) to authenticated;

-- Section 5: audit wiring — recreate _tracked_audit_columns + can_read_audit_entry
-- verbatim from the LIVE definitions (which already carry dd_streams / advisor /
-- nda / raci / clearance branches) + a 'dd_questions' branch each.
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
    when 'raci_assignments' then array['role_key','raci_letter']
    when 'dd_questions' then array['title','detail','addressee','priority','due_date','status','responsible_user_id','answer_text','answer_link','answered_by','answer_round','confidentiality_level']
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
declare v_project uuid;
begin
  if public.is_tenant_admin(p_tenant_id) then return true; end if;
  case p_entity_type
    when 'projects' then v_project := p_entity_id;
    when 'stakeholders' then select project_id into v_project from public.stakeholders where id = p_entity_id;
    when 'work_items' then select project_id into v_project from public.work_items where id = p_entity_id;
    when 'phases' then select project_id into v_project from public.phases where id = p_entity_id;
    when 'milestones' then select project_id into v_project from public.milestones where id = p_entity_id;
    when 'releases' then select project_id into v_project from public.releases where id = p_entity_id;
    when 'risks' then select project_id into v_project from public.risks where id = p_entity_id;
    when 'decisions' then select project_id into v_project from public.decisions where id = p_entity_id;
    when 'open_items' then select project_id into v_project from public.open_items where id = p_entity_id;
    when 'communication_outbox' then select project_id into v_project from public.communication_outbox where id = p_entity_id;
    when 'work_item_resources' then select project_id into v_project from public.work_item_resources where id = p_entity_id;
    when 'vendor_project_assignments' then select project_id into v_project from public.vendor_project_assignments where id = p_entity_id;
    when 'work_item_documents' then
      select wi.project_id into v_project from public.work_item_documents wid
      join public.work_items wi on wi.id = wid.work_item_id where wid.id = p_entity_id;
    when 'budget_categories' then select project_id into v_project from public.budget_categories where id = p_entity_id;
    when 'budget_items' then select project_id into v_project from public.budget_items where id = p_entity_id;
    when 'budget_postings' then select project_id into v_project from public.budget_postings where id = p_entity_id;
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
    when 'sprints' then select project_id into v_project from public.sprints where id = p_entity_id;
    when 'ma_project_profiles' then select project_id into v_project from public.ma_project_profiles where id = p_entity_id;
    when 'ma_advisor_profiles' then select project_id into v_project from public.ma_advisor_profiles where id = p_entity_id;
    when 'ma_ndas' then select project_id into v_project from public.ma_ndas where id = p_entity_id;
    when 'dd_streams' then select project_id into v_project from public.dd_streams where id = p_entity_id;
    when 'raci_assignments' then select project_id into v_project from public.raci_assignments where id = p_entity_id;
    when 'dd_questions' then select project_id into v_project from public.dd_questions where id = p_entity_id;
    else return false;
  end case;
  if v_project is null then return false; end if;
  return public.is_project_member(v_project);
end;
$$;

-- Re-grant after the recreate: `create or replace` can drop the `authenticated`
-- EXECUTE grant on can_read_audit_entry, silently breaking the PROJ-10 HistoryTab
-- read path. Re-assert it (idempotent) so a fresh `supabase db push` replay
-- never leaves the function ungranted.
grant execute on function public.can_read_audit_entry(text, uuid, uuid) to authenticated;
