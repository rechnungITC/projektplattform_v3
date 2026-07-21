-- PROJ-110 (+ PROJ-111 backend) — Stage-Gate workflow + Decision-Log extension.
-- Bundled DUP->REUSE slice (CIA ADJUST->GO 2026-06-26).
--
-- Part 1 (PROJ-111): thin INSERT-only extension of PROJ-20 `decisions`
--   (context_finding_id / decision_body / options). Immutability trigger
--   updated so the flip path also forbids mutating the new columns.
-- Part 2 (PROJ-110): `ma_stage_gates` (the only new node) + 9-gate preset
--   lazy-seed + decide_stage_gate RPC (writes a neutral PROJ-20 decision,
--   activates the next phase on Freigabe/Auflage, cancels the project on
--   Abbruch; the confidential reason/conditions live RLS-gated on the gate,
--   the decision row carries only outcome) + INVOKER pre-read RPC + a
--   gate-visibility helper for the 111 log/export need-to-know filter.
-- Audit: entity_type CHECK + _tracked_audit_columns + can_read_audit_entry
--   extended for ma_stage_gates; authenticated EXECUTE re-granted (PROJ-114
--   lesson). Confidential columns (decision_reason/conditions) are NOT audit-
--   tracked (audit_log RLS is member-level, not need-to-know) -> no leak.
-- Writes are RPC-only (SECURITY DEFINER) -> ma_stage_gates has SELECT policies
--   only (mirror dd_findings); direct INSERT/UPDATE/DELETE default-deny.
-- Impersonation-safe: RPCs use auth.uid() only, no actor param, anon revoked.

-- ==========================================================================
-- Part 1 — PROJ-111 decisions INSERT-only extension
-- ==========================================================================
alter table public.decisions
  add column if not exists context_finding_id uuid references public.dd_findings(id) on delete set null,
  add column if not exists decision_body text,
  add column if not exists options text;

create index if not exists idx_decisions_context_finding_id
  on public.decisions (context_finding_id)
  where context_finding_id is not null;

-- Immutability: recreate the trigger fn so the is_revised flip path also
-- forbids mutating the new columns. (INSERT is unaffected — the new fields
-- are set at creation only, per HIGH-1.)
create or replace function public.enforce_decision_immutability()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_flip_token text;
begin
  v_flip_token := nullif(current_setting('decisions.allow_revise_flip', true), '');
  if v_flip_token = '1' then
    perform set_config('decisions.allow_revise_flip', '', true);

    if NEW.is_revised <> true or OLD.is_revised <> false then
      raise exception
        'enforce_decision_immutability: flip path may only set is_revised true (was %, now %)',
        OLD.is_revised, NEW.is_revised
        using errcode = 'check_violation';
    end if;
    if NEW.title                  is distinct from OLD.title
       or NEW.decision_text          is distinct from OLD.decision_text
       or NEW.rationale              is distinct from OLD.rationale
       or NEW.decided_at             is distinct from OLD.decided_at
       or NEW.decider_stakeholder_id is distinct from OLD.decider_stakeholder_id
       or NEW.context_phase_id       is distinct from OLD.context_phase_id
       or NEW.context_risk_id        is distinct from OLD.context_risk_id
       or NEW.context_finding_id     is distinct from OLD.context_finding_id
       or NEW.decision_body          is distinct from OLD.decision_body
       or NEW.options                is distinct from OLD.options
       or NEW.supersedes_decision_id is distinct from OLD.supersedes_decision_id
       or NEW.tenant_id              is distinct from OLD.tenant_id
       or NEW.project_id             is distinct from OLD.project_id
       or NEW.created_by             is distinct from OLD.created_by
       or NEW.created_at             is distinct from OLD.created_at
    then
      raise exception
        'enforce_decision_immutability: flip path may only change is_revised'
        using errcode = 'check_violation';
    end if;
    return NEW;
  end if;

  raise exception
    'decisions are immutable. Create a revision via POST /api/projects/[id]/decisions with supersedes_decision_id.'
    using errcode = 'check_violation';
end;
$function$;

-- ==========================================================================
-- Part 2 — PROJ-110 ma_stage_gates
-- ==========================================================================
create table if not exists public.ma_stage_gates (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  project_id            uuid not null references public.projects(id) on delete cascade,
  gate_key              text not null,
  label                 text not null,
  sequence_number       integer not null,
  target_phase_id       uuid references public.phases(id) on delete set null,
  status                text not null default 'pending'
                          check (status in ('pending','passed','conditional','aborted')),
  decision              text check (decision in ('freigabe','auflage','abbruch')),
  conditions            text,
  decision_reason       text,
  decision_id           uuid references public.decisions(id) on delete set null,
  decided_by            uuid references auth.users(id),
  decided_at            timestamptz,
  confidentiality_level public.ma_confidentiality_level not null default 'standard',
  created_by            uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (project_id, gate_key)
);

create index if not exists idx_ma_stage_gates_project on public.ma_stage_gates (project_id, sequence_number);
create index if not exists idx_ma_stage_gates_decision on public.ma_stage_gates (decision_id) where decision_id is not null;
create index if not exists idx_ma_stage_gates_target_phase on public.ma_stage_gates (target_phase_id) where target_phase_id is not null;

alter table public.ma_stage_gates enable row level security;

-- Reads: project members see gates; the confidentiality tor is an additive
-- RESTRICTIVE gate (mirror dd_findings). Writes go through SECURITY DEFINER
-- RPCs only, so there are intentionally no INSERT/UPDATE/DELETE policies.
drop policy if exists ma_stage_gates_select on public.ma_stage_gates;
create policy ma_stage_gates_select on public.ma_stage_gates
  for select using (public.is_project_member(project_id));

drop policy if exists ma_stage_gates_confidentiality_gate on public.ma_stage_gates;
create policy ma_stage_gates_confidentiality_gate on public.ma_stage_gates
  as restrictive for select
  using (public.can_access_classified(project_id, confidentiality_level));

drop trigger if exists ma_stage_gates_set_updated_at on public.ma_stage_gates;
create trigger ma_stage_gates_set_updated_at
  before update on public.ma_stage_gates
  for each row execute function moddatetime('updated_at');

drop trigger if exists audit_changes_ma_stage_gates on public.ma_stage_gates;
create trigger audit_changes_ma_stage_gates
  after update on public.ma_stage_gates
  for each row execute function record_audit_changes();

-- ==========================================================================
-- Audit wiring for ma_stage_gates
-- ==========================================================================
alter table public.audit_log_entries drop constraint if exists audit_log_entity_type_check;
alter table public.audit_log_entries add constraint audit_log_entity_type_check
  check (entity_type = any (array[
    'stakeholders','work_items','phases','milestones','projects','risks','decisions','open_items',
    'tenants','tenant_settings','communication_outbox','resources','work_item_resources',
    'tenant_project_type_overrides','tenant_method_overrides','vendors','vendor_project_assignments',
    'vendor_evaluations','vendor_documents','compliance_tags','work_item_documents','budget_categories',
    'budget_items','budget_postings','vendor_invoices','report_snapshots','role_rates','work_item_cost_lines',
    'dependencies','tenant_ai_keys','tenant_ai_providers','tenant_ai_provider_priority','tenant_ai_cost_caps',
    'tenant_memberships','organization_units','locations','stakeholder_interactions',
    'stakeholder_interaction_participants','organization_imports','releases',
    'stakeholder_coaching_recommendations','project_goals','sprints','risk_links',
    'ma_confidentiality_clearances','ma_clearance_profiles','ma_advisor_profiles','ma_ndas',
    'ma_nda_assignments','dd_streams','ma_clearance_grant_requests','ma_clearance_approval_policies',
    'raci_assignments','dd_questions','dd_findings','committees','committee_members','workstreams',
    'workstream_phases','deliverables','deliverable_documents','risk_categories',
    'ma_stage_gates'
  ]::text[]));

-- Extend _tracked_audit_columns for ma_stage_gates. Only neutral facts are
-- tracked (status/decision/who/when + decision link) — NOT decision_reason
-- or conditions (audit_log RLS is member-level, so confidential text there
-- would bypass the need-to-know gate).
create or replace function public._tracked_audit_columns(p_table text)
 returns text[]
 language sql
 immutable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select case p_table
    when 'stakeholders' then array['name','role_key','org_unit','contact_email','contact_phone','influence','impact','linked_user_id','notes','is_active','kind','origin','is_approver','reasoning','stakeholder_type_key','management_level','decision_authority','attitude','conflict_potential','communication_need','preferred_channel','organization_unit_id']
    when 'work_items' then array['title','description','status','priority','responsible_user_id','kind','sprint_id','parent_id','story_points','confidentiality_level']
    when 'phases' then array['name','description','planned_start','planned_end','status','sequence_number','confidentiality_level']
    when 'milestones' then array['name','description','target_date','actual_date','status','phase_id']
    when 'projects' then array['name','description','project_number','planned_start_date','planned_end_date','responsible_user_id','project_type','project_method','lifecycle_status','type_specific_data','confidentiality_level']
    when 'risks' then array['title','description','probability','impact','status','mitigation','responsible_user_id','category_id','confidentiality_level','workstream_id']
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
    when 'dd_findings' then array['title','description','severity','economic_impact_eur','probability','recommended_treatment','status','linked_risk_id','responsible_user_id','confidentiality_level']
    when 'committees' then array['name','purpose','cadence','decision_scope','value_threshold_eur','value_threshold_currency','escalation_scope','confidentiality_level','sort_order']
    when 'committee_members' then array['stakeholder_id','role_in_committee','is_voting']
    when 'workstreams' then array['workstream_key','label','goal','lead_user_id','rag_status','scope','notes','confidentiality_level','sort_order']
    when 'deliverables' then array['name','description','phase_id','workstream_id','responsible_user_id','due_date','status','confidentiality_level','sort_order']
    when 'deliverable_documents' then array['title','url','tag_keys']
    when 'risk_categories' then array['key','label','applies_to_project_type','sort_order','is_active']
    when 'ma_stage_gates' then array['status','decision','decision_id','decided_by','decided_at','confidentiality_level']
    else array[]::text[]
  end
$function$;

-- Extend can_read_audit_entry for ma_stage_gates. Recreating drops the
-- authenticated EXECUTE grant (PROJ-114 lesson) -> re-granted below.
create or replace function public.can_read_audit_entry(p_entity_type text, p_entity_id uuid, p_tenant_id uuid)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
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
    when 'risk_categories' then return public.is_tenant_member(p_tenant_id);
    when 'sprints' then select project_id into v_project from public.sprints where id = p_entity_id;
    when 'ma_project_profiles' then select project_id into v_project from public.ma_project_profiles where id = p_entity_id;
    when 'ma_advisor_profiles' then select project_id into v_project from public.ma_advisor_profiles where id = p_entity_id;
    when 'ma_ndas' then select project_id into v_project from public.ma_ndas where id = p_entity_id;
    when 'dd_streams' then select project_id into v_project from public.dd_streams where id = p_entity_id;
    when 'raci_assignments' then select project_id into v_project from public.raci_assignments where id = p_entity_id;
    when 'dd_questions' then select project_id into v_project from public.dd_questions where id = p_entity_id;
    when 'dd_findings' then select project_id into v_project from public.dd_findings where id = p_entity_id;
    when 'committees' then select project_id into v_project from public.committees where id = p_entity_id;
    when 'committee_members' then
      select c.project_id into v_project from public.committee_members m
      join public.committees c on c.id = m.committee_id where m.id = p_entity_id;
    when 'workstreams' then select project_id into v_project from public.workstreams where id = p_entity_id;
    when 'deliverables' then select project_id into v_project from public.deliverables where id = p_entity_id;
    when 'deliverable_documents' then
      select d.project_id into v_project from public.deliverable_documents dd
      join public.deliverables d on d.id = dd.deliverable_id where dd.id = p_entity_id;
    when 'ma_stage_gates' then select project_id into v_project from public.ma_stage_gates where id = p_entity_id;
    else return false;
  end case;
  if v_project is null then return false; end if;
  return public.is_project_member(v_project);
end;
$function$;

grant execute on function public.can_read_audit_entry(text, uuid, uuid) to authenticated;
grant execute on function public._tracked_audit_columns(text) to authenticated;

-- ==========================================================================
-- seed_stage_gates(p_project_id) — lazy-seed the 9-gate preset. Mirror of
-- activate_ma_phase_model: idempotent (dedupe by gate_key), M&A-only,
-- manager-gated (admin OR project lead), auth.uid() only, anon revoked.
-- Gate N unlocks phase with sequence_number = N+1 (resolved at seed time;
-- backfilled on re-run if the phase was seeded later).
-- ==========================================================================
create or replace function public.seed_stage_gates(p_project_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_caller   uuid := auth.uid();
  v_tenant   uuid;
  v_type     text;
  v_is_admin boolean;
  v_is_lead  boolean;
  v_seeded   integer := 0;
  v_fixed    integer := 0;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select p.tenant_id, p.project_type into v_tenant, v_type
    from public.projects p where p.id = p_project_id;
  if not found then
    raise exception 'project not found' using errcode = '02000';
  end if;
  if v_type is distinct from 'ma' then
    raise exception 'stage gates are only available for M&A projects'
      using errcode = '22023';
  end if;

  v_is_admin := exists (
    select 1 from public.tenant_memberships
    where tenant_id = v_tenant and user_id = v_caller and role = 'admin');
  v_is_lead := exists (
    select 1 from public.project_memberships
    where project_id = p_project_id and user_id = v_caller and role = 'lead');
  if not (v_is_admin or v_is_lead) then
    raise exception 'insufficient role to seed stage gates'
      using errcode = '42501';
  end if;

  with preset(seq, gkey, lbl) as (
    values
      (1, 'gate_1', 'Gate 1: M&A-Strategie freigeben'),
      (2, 'gate_2', 'Gate 2: Target-Auswahl freigeben'),
      (3, 'gate_3', 'Gate 3: Erstansprache & NDA freigeben'),
      (4, 'gate_4', 'Gate 4: Indikatives Angebot / LOI freigeben'),
      (5, 'gate_5', 'Gate 5: Due-Diligence-Eintritt freigeben'),
      (6, 'gate_6', 'Gate 6: Bewertung & verbindliches Angebot freigeben'),
      (7, 'gate_7', 'Gate 7: SPA / Vertragsverhandlung freigeben'),
      (8, 'gate_8', 'Gate 8: Signing freigeben'),
      (9, 'gate_9', 'Gate 9: Closing & Value Realization freigeben')
  ),
  ins as (
    insert into public.ma_stage_gates
      (tenant_id, project_id, gate_key, label, sequence_number, target_phase_id, status, created_by)
    select v_tenant, p_project_id, pr.gkey, pr.lbl, pr.seq,
      (select ph.id from public.phases ph
        where ph.project_id = p_project_id
          and ph.sequence_number = pr.seq + 1
          and ph.is_deleted = false
        order by ph.sequence_number limit 1),
      'pending', v_caller
    from preset pr
    where not exists (
      select 1 from public.ma_stage_gates g
      where g.project_id = p_project_id and g.gate_key = pr.gkey)
    returning 1
  )
  select count(*) into v_seeded from ins;

  -- Backfill target_phase_id for gates seeded before their phase existed.
  with preset(seq, gkey) as (
    values (1,'gate_1'),(2,'gate_2'),(3,'gate_3'),(4,'gate_4'),(5,'gate_5'),
           (6,'gate_6'),(7,'gate_7'),(8,'gate_8'),(9,'gate_9')
  ),
  upd as (
    update public.ma_stage_gates g
       set target_phase_id = ph.id
      from preset pr
      join public.phases ph
        on ph.project_id = p_project_id
       and ph.sequence_number = pr.seq + 1
       and ph.is_deleted = false
     where g.project_id = p_project_id
       and g.gate_key = pr.gkey
       and g.target_phase_id is null
    returning 1
  )
  select count(*) into v_fixed from upd;

  return jsonb_build_object('seeded', v_seeded, 'target_phase_backfilled', v_fixed);
end;
$function$;

revoke all on function public.seed_stage_gates(uuid) from public;
revoke all on function public.seed_stage_gates(uuid) from anon;
grant execute on function public.seed_stage_gates(uuid) to authenticated;

-- ==========================================================================
-- decide_stage_gate — the core RPC. Atomic: writes a neutral PROJ-20 decision
-- (the log entry), stores the confidential reason/conditions on the gate,
-- then Freigabe/Auflage -> activate target phase, Abbruch -> cancel project.
-- SECURITY DEFINER, auth.uid() only, manager-gated (admin OR lead) +
-- clearance re-check against the (effective) gate confidentiality, pending
-- guard for idempotency. Quorum is a later PROJ-Y ('pending' stays the anchor).
-- ==========================================================================
create or replace function public.decide_stage_gate(
  p_gate_id uuid,
  p_decision text,
  p_reason text default null,
  p_conditions text default null,
  p_confidentiality_level public.ma_confidentiality_level default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_caller     uuid := auth.uid();
  v_tenant     uuid;
  v_project    uuid;
  v_status     text;
  v_target     uuid;
  v_label      text;
  v_seq        integer;
  v_level      public.ma_confidentiality_level;
  v_is_admin   boolean;
  v_is_lead    boolean;
  v_new_status text;
  v_decision_id uuid;
  v_proj_status text;
  v_phase_status text;
  v_dlabel     text;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_decision not in ('freigabe','auflage','abbruch') then
    raise exception 'invalid decision: %', p_decision using errcode = '22023';
  end if;

  select g.tenant_id, g.project_id, g.status, g.target_phase_id, g.label,
         g.sequence_number, g.confidentiality_level
    into v_tenant, v_project, v_status, v_target, v_label, v_seq, v_level
    from public.ma_stage_gates g where g.id = p_gate_id;
  if not found then
    raise exception 'stage gate not found' using errcode = '02000';
  end if;
  if v_status <> 'pending' then
    raise exception 'gate already decided (status=%)', v_status using errcode = '23514';
  end if;

  v_is_admin := exists (
    select 1 from public.tenant_memberships
    where tenant_id = v_tenant and user_id = v_caller and role = 'admin');
  v_is_lead := exists (
    select 1 from public.project_memberships
    where project_id = v_project and user_id = v_caller and role = 'lead');
  if not (v_is_admin or v_is_lead) then
    raise exception 'insufficient role to decide stage gate' using errcode = '42501';
  end if;

  -- Effective confidentiality: caller-supplied override else current gate level.
  v_level := coalesce(p_confidentiality_level, v_level);
  if not public.can_access_classified(v_project, v_level) then
    raise exception 'insufficient clearance for this gate' using errcode = '42501';
  end if;

  v_new_status := case p_decision
    when 'freigabe' then 'passed'
    when 'auflage'  then 'conditional'
    when 'abbruch'  then 'aborted' end;
  v_dlabel := case p_decision
    when 'freigabe' then 'Freigabe'
    when 'auflage'  then 'Auflage (bedingte Freigabe)'
    when 'abbruch'  then 'Abbruch' end;

  if p_decision = 'abbruch' and coalesce(btrim(p_reason), '') = '' then
    raise exception 'abort requires a reason' using errcode = '22023';
  end if;

  -- (1) neutral PROJ-20 decision row = the immutable log entry. Confidential
  --     reason/conditions are NOT written here (they live on the gate).
  insert into public.decisions
    (tenant_id, project_id, title, decision_text, rationale, decided_at,
     context_phase_id, created_by)
  values
    (v_tenant, v_project,
     format('Stage-Gate %s: %s', v_seq, v_label),
     format('Gate-Entscheidung: %s', v_dlabel),
     null, now(), v_target, v_caller)
  returning id into v_decision_id;

  -- (2) update the gate: outcome + confidential reason/conditions (RLS-gated).
  update public.ma_stage_gates
     set status = v_new_status,
         decision = p_decision,
         conditions = nullif(btrim(p_conditions), ''),
         decision_reason = nullif(btrim(p_reason), ''),
         decision_id = v_decision_id,
         decided_by = v_caller,
         decided_at = now(),
         confidentiality_level = v_level
   where id = p_gate_id;

  -- (3) side effects. Neutral comments only (no confidential text leaks into
  --     project_lifecycle_events / phase notify).
  if p_decision in ('freigabe','auflage') and v_target is not null then
    select status into v_phase_status from public.phases where id = v_target;
    if v_phase_status = 'planned' then
      perform public.transition_phase_status(
        v_target, 'in_progress',
        format('Aktiviert durch Stage-Gate %s', v_seq));
    end if;
  elsif p_decision = 'abbruch' then
    select lifecycle_status into v_proj_status from public.projects where id = v_project;
    if v_proj_status in ('draft','active','paused') then
      perform public.transition_project_status(
        v_project, 'canceled',
        format('Projekt beendet durch Stage-Gate %s (Abbruch)', v_seq));
    end if;
  end if;

  return jsonb_build_object(
    'gate_id', p_gate_id,
    'status', v_new_status,
    'decision', p_decision,
    'decision_id', v_decision_id,
    'target_phase_id', v_target
  );
end;
$function$;

revoke all on function public.decide_stage_gate(uuid, text, text, text, public.ma_confidentiality_level) from public;
revoke all on function public.decide_stage_gate(uuid, text, text, text, public.ma_confidentiality_level) from anon;
grant execute on function public.decide_stage_gate(uuid, text, text, text, public.ma_confidentiality_level) to authenticated;

-- ==========================================================================
-- stage_gate_prereadiness(p_gate_id) — read-only pre-read counts. SECURITY
-- INVOKER so need-to-know RLS applies to the caller (a finding the caller
-- can't see is not counted). Deliverables are a placeholder until PROJ-104.
-- ==========================================================================
create or replace function public.stage_gate_prereadiness(p_gate_id uuid)
 returns jsonb
 language plpgsql
 stable security invoker
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_project uuid;
  v_target  uuid;
  v_open_tasks integer := 0;
  v_risks_no_measure integer := 0;
  v_open_red_flags integer := 0;
begin
  select project_id, target_phase_id into v_project, v_target
    from public.ma_stage_gates where id = p_gate_id;
  if v_project is null then
    return null;  -- not found or not visible to caller
  end if;

  -- open tasks of the target phase (or whole project if no target phase)
  select count(*) into v_open_tasks
    from public.work_items wi
   where wi.project_id = v_project
     and wi.is_deleted = false
     and wi.status in ('todo','in_progress','blocked')
     and (v_target is null or wi.phase_id = v_target);

  -- active risks without a mitigation
  select count(*) into v_risks_no_measure
    from public.risks r
   where r.project_id = v_project
     and r.status = 'open'
     and coalesce(btrim(r.mitigation), '') = '';

  -- open red flags = high / deal-breaker findings that are not resolved/dismissed
  select count(*) into v_open_red_flags
    from public.dd_findings f
   where f.project_id = v_project
     and f.severity in ('hoch','deal_breaker')
     and f.status in ('open','in_review');

  return jsonb_build_object(
    'open_tasks', v_open_tasks,
    'risks_without_measure', v_risks_no_measure,
    'open_red_flags', v_open_red_flags,
    'mandatory_deliverables', null,
    'has_blocking_readiness', (v_risks_no_measure > 0 or v_open_red_flags > 0)
  );
end;
$function$;

grant execute on function public.stage_gate_prereadiness(uuid) to authenticated;

-- ==========================================================================
-- hidden_stage_gate_decision_ids(p_project_id) — helper for the PROJ-111
-- decision-log/CSV need-to-know filter (HIGH-2: don't reveal that a
-- confidential gate was decided). Returns the decision_ids of this project's
-- gate decisions whose linked gate the CALLER may NOT access. The 111 log
-- view / CSV export subtracts this small set from the (member-visible)
-- decisions list. One round-trip, set-based. SECURITY DEFINER (sees all
-- gates) but applies can_access_classified for the caller via auth.uid().
-- ==========================================================================
create or replace function public.hidden_stage_gate_decision_ids(p_project_id uuid)
 returns setof uuid
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select g.decision_id
    from public.ma_stage_gates g
   where g.project_id = p_project_id
     and g.decision_id is not null
     and not public.can_access_classified(g.project_id, g.confidentiality_level)
$function$;

revoke all on function public.hidden_stage_gate_decision_ids(uuid) from public;
revoke all on function public.hidden_stage_gate_decision_ids(uuid) from anon;
grant execute on function public.hidden_stage_gate_decision_ids(uuid) to authenticated;
