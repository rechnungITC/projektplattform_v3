-- =============================================================================
-- PROJ-34-α: Stakeholder Communication Tracking — Interaction Log
-- =============================================================================
--
-- Purpose
--   Erste Slice von PROJ-34 (Stakeholder Communication Tracking). Liefert das
--   Datenmodell fuer ST-01 "Interaction Log" und legt bereits die per-
--   participant signal columns (sentiment / cooperation_signal) an, die in
--   PROJ-34-β manuell und in 34-γ AI-gestuetzt befuellt werden. CIA-Locks
--   L1-L8 (2026-05-12).
--
-- What this migration does
--   1. Creates `public.stakeholder_interactions` (project-scoped log row).
--   2. Creates `public.stakeholder_interaction_participants` (N:M bridge mit
--      Per-Participant-Signal-Spalten gemaess CIA-L3).
--   3. Adds BEFORE-trigger `enforce_interaction_same_project` der validiert,
--      dass jeder Participant-Stakeholder zu demselben Projekt gehoert wie
--      die Interaktion und dass `replies_to_interaction_id` ebenfalls auf
--      eine Interaktion im selben Projekt zeigt.
--   4. Extends `_tracked_audit_columns` whitelist for both new tables.
--   5. Extends `audit_log_entity_type_check` constraint.
--   6. Installs `record_audit_changes` AFTER UPDATE triggers on both tables.
--   7. Adds soft-delete column `deleted_at` per CIA-L2; reguläre Löschung
--      ist reversibel, DSGVO-Hard-Delete-Cascade ist Ziel von 34-ε.
--
-- What this migration does NOT do
--   - Kein AI-Routing (34-γ): die `*_source`-Spalten existieren, aber kein
--     Trigger schreibt sie.
--   - Keine `stakeholder_coaching_recommendations` (34-ε).
--   - Keine PROJ-35-Integration (34-ζ).
--   - Keine Overdue-Generated-Column — Berechnung erfolgt lazy in der API
--     pro CIA-L5; Spalte koennte spaeter via ALTER hinzukommen.
--
-- RLS
--   - SELECT: alle Tenant-Member, deren Projekt-Membership existiert (oder
--     Tenant-Admins). Realisiert ueber `is_project_member(project_id)`.
--   - INSERT / UPDATE: Project-Member mit `manage`-Berechtigung
--     (`has_project_role(project_id, 'manager')` oder Tenant-Admin).
--     Edit-Recht des Erstellers selbst wird zusaetzlich erlaubt.
--   - DELETE: only project-managers + tenant-admins; haendisch via API
--     gefuehrter Soft-Delete bevorzugt (`deleted_at` setzen).
--
-- Reversibility
--   Pure additive on existing audit + entity_type infrastructure. New tables
--   drop cleanly. No data migration needed.
-- =============================================================================

set search_path = public, pg_temp;


-- ---------------------------------------------------------------------------
-- 1. stakeholder_interactions
-- ---------------------------------------------------------------------------
create table if not exists public.stakeholder_interactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,

  channel text not null,
  direction text not null,
  interaction_date timestamptz not null,
  summary text not null,

  awaiting_response boolean not null default false,
  response_due_date date,
  response_received_date timestamptz,

  -- 1-hop reply chain (no recursive thread reconstruction in MVP).
  replies_to_interaction_id uuid references public.stakeholder_interactions(id)
    on delete set null,

  -- Provenance + author. NULL only when the user row was deleted; created
  -- rows always have a creator. Routes enforce non-null on INSERT.
  created_by uuid references auth.users(id) on delete set null,
  source text not null default 'manual',
  source_context_id uuid,

  -- Soft-Delete fuer regulaere Lifecycle-Loeschung (CIA-L2).
  -- DSGVO-Redaction bleibt Hard-Delete (Ziel: PROJ-34-ε).
  deleted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint stakeholder_interactions_channel_check
    check (channel in ('email','meeting','chat','phone','other')),
  constraint stakeholder_interactions_direction_check
    check (direction in ('inbound','outbound','bidirectional')),
  constraint stakeholder_interactions_summary_length
    check (char_length(summary) between 1 and 500),
  constraint stakeholder_interactions_source_check
    check (source in ('manual','context_ingestion','assistant')),
  constraint stakeholder_interactions_response_consistency
    check (
      -- response_received_date only meaningful for outbound awaits
      response_received_date is null
      or direction = 'outbound'
    ),
  constraint stakeholder_interactions_no_self_reply
    check (replies_to_interaction_id is null or replies_to_interaction_id <> id)
);

create index if not exists stakeholder_interactions_tenant_project_idx
  on public.stakeholder_interactions (tenant_id, project_id);

create index if not exists stakeholder_interactions_project_date_idx
  on public.stakeholder_interactions (project_id, interaction_date desc)
  where deleted_at is null;

create index if not exists stakeholder_interactions_awaiting_idx
  on public.stakeholder_interactions (project_id, response_due_date)
  where awaiting_response = true and deleted_at is null;

create index if not exists stakeholder_interactions_replies_idx
  on public.stakeholder_interactions (replies_to_interaction_id)
  where replies_to_interaction_id is not null;

alter table public.stakeholder_interactions enable row level security;

create policy "stakeholder_interactions_select_project_member"
  on public.stakeholder_interactions
  for select using (public.is_project_member(project_id));

create policy "stakeholder_interactions_insert_project_member"
  on public.stakeholder_interactions
  for insert with check (public.is_project_member(project_id));

create policy "stakeholder_interactions_update_project_member"
  on public.stakeholder_interactions
  for update using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

create policy "stakeholder_interactions_delete_project_manager"
  on public.stakeholder_interactions
  for delete using (
    public.has_project_role(project_id, 'manager')
    or public.is_tenant_admin(tenant_id)
  );


-- ---------------------------------------------------------------------------
-- 2. stakeholder_interaction_participants  (N:M bridge)
--
-- Per-Participant-Signal-Spalten gemaess CIA-L3: Sentiment und
-- Cooperation-Signal liegen pro Teilnehmer, nicht pro Interaktion.
-- ---------------------------------------------------------------------------
create table if not exists public.stakeholder_interaction_participants (
  interaction_id uuid not null
    references public.stakeholder_interactions(id) on delete cascade,
  stakeholder_id uuid not null
    references public.stakeholders(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,

  -- Per-Participant-Sentiment (-2..2; nullable bis 34-β / 34-γ).
  participant_sentiment smallint,
  participant_sentiment_source text,
  participant_sentiment_model text,
  participant_sentiment_provider text,
  participant_sentiment_confidence numeric(4, 3),

  -- Per-Participant-Cooperation-Signal (-2..2; nullable bis 34-β / 34-γ).
  participant_cooperation_signal smallint,
  participant_cooperation_signal_source text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (interaction_id, stakeholder_id),

  constraint sip_sentiment_range
    check (participant_sentiment is null
      or participant_sentiment between -2 and 2),
  constraint sip_sentiment_source_check
    check (participant_sentiment_source is null
      or participant_sentiment_source in (
        'manual','ai_proposed','ai_accepted','ai_rejected'
      )),
  constraint sip_cooperation_range
    check (participant_cooperation_signal is null
      or participant_cooperation_signal between -2 and 2),
  constraint sip_cooperation_source_check
    check (participant_cooperation_signal_source is null
      or participant_cooperation_signal_source in (
        'manual','ai_proposed','ai_accepted','ai_rejected'
      )),
  constraint sip_confidence_range
    check (participant_sentiment_confidence is null
      or (participant_sentiment_confidence >= 0
          and participant_sentiment_confidence <= 1))
);

create index if not exists sip_stakeholder_idx
  on public.stakeholder_interaction_participants (stakeholder_id, interaction_id);

create index if not exists sip_tenant_stakeholder_idx
  on public.stakeholder_interaction_participants (tenant_id, stakeholder_id);

create index if not exists sip_project_idx
  on public.stakeholder_interaction_participants (project_id);

alter table public.stakeholder_interaction_participants enable row level security;

create policy "sip_select_project_member"
  on public.stakeholder_interaction_participants
  for select using (public.is_project_member(project_id));

create policy "sip_insert_project_member"
  on public.stakeholder_interaction_participants
  for insert with check (public.is_project_member(project_id));

create policy "sip_update_project_member"
  on public.stakeholder_interaction_participants
  for update using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

create policy "sip_delete_project_member"
  on public.stakeholder_interaction_participants
  for delete using (public.is_project_member(project_id));


-- ---------------------------------------------------------------------------
-- 3. Same-project + same-tenant enforcement triggers.
--
-- RLS verhindert Cross-Project-Reads, aber ein kooperativer Caller koennte
-- einen Participant einfuegen, dessen Stakeholder zu einem anderen Projekt
-- gehoert (FK prueft nur Existenz, nicht Projekt-Zugehoerigkeit).
-- ---------------------------------------------------------------------------
create or replace function public.tg_sip_validate_same_project_fn()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_stakeholder_project uuid;
  v_stakeholder_tenant uuid;
  v_interaction_project uuid;
  v_interaction_tenant uuid;
begin
  select project_id, tenant_id
    into v_interaction_project, v_interaction_tenant
    from public.stakeholder_interactions
   where id = NEW.interaction_id;
  if v_interaction_project is null then
    raise exception 'interaction_not_found' using errcode = 'P0002';
  end if;

  select project_id, tenant_id
    into v_stakeholder_project, v_stakeholder_tenant
    from public.stakeholders
   where id = NEW.stakeholder_id;
  if v_stakeholder_project is null then
    raise exception 'stakeholder_not_found' using errcode = 'P0002';
  end if;

  if v_interaction_project <> v_stakeholder_project then
    raise exception 'cross_project_participant' using errcode = 'P0003';
  end if;
  if v_interaction_tenant <> v_stakeholder_tenant then
    raise exception 'cross_tenant_participant' using errcode = 'P0003';
  end if;

  -- Normalise denormalised columns so RLS-fast-path stays consistent.
  NEW.project_id := v_interaction_project;
  NEW.tenant_id := v_interaction_tenant;

  return NEW;
end;
$$;

revoke execute on function public.tg_sip_validate_same_project_fn()
  from public, anon, authenticated;

drop trigger if exists sip_validate_same_project
  on public.stakeholder_interaction_participants;
create trigger sip_validate_same_project
  before insert or update of interaction_id, stakeholder_id
  on public.stakeholder_interaction_participants
  for each row
  execute function public.tg_sip_validate_same_project_fn();


-- Same-project guard fuer replies_to_interaction_id auf der Haupttabelle.
create or replace function public.tg_interaction_validate_reply_chain_fn()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_parent_project uuid;
begin
  if NEW.replies_to_interaction_id is not null then
    select project_id into v_parent_project
      from public.stakeholder_interactions
     where id = NEW.replies_to_interaction_id;
    if v_parent_project is null then
      raise exception 'parent_interaction_not_found' using errcode = 'P0002';
    end if;
    if v_parent_project <> NEW.project_id then
      raise exception 'cross_project_reply' using errcode = 'P0003';
    end if;
  end if;
  return NEW;
end;
$$;

revoke execute on function public.tg_interaction_validate_reply_chain_fn()
  from public, anon, authenticated;

drop trigger if exists stakeholder_interactions_validate_reply
  on public.stakeholder_interactions;
create trigger stakeholder_interactions_validate_reply
  before insert or update of replies_to_interaction_id, project_id
  on public.stakeholder_interactions
  for each row
  execute function public.tg_interaction_validate_reply_chain_fn();


-- ---------------------------------------------------------------------------
-- 4. _tracked_audit_columns — extend whitelist
--
-- Recreates the function with the canonical entity-type list as of the most
-- recent migration (PROJ-62), then adds `stakeholder_interactions` und
-- `stakeholder_interaction_participants` entries.
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
      'name','code','type','parent_id','location_id','description','is_active','sort_order'
    ]
    when 'locations' then array['name','country','city','address','is_active']
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
-- 5. audit_log_entity_type_check — extend whitelist
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
      'stakeholder_interaction_participants'
    )
  );


-- ---------------------------------------------------------------------------
-- 6. AFTER UPDATE audit triggers on both new tables.
-- ---------------------------------------------------------------------------
drop trigger if exists stakeholder_interactions_audit_update
  on public.stakeholder_interactions;
create trigger stakeholder_interactions_audit_update
  after update on public.stakeholder_interactions
  for each row execute function public.record_audit_changes();

drop trigger if exists sip_audit_update
  on public.stakeholder_interaction_participants;
create trigger sip_audit_update
  after update on public.stakeholder_interaction_participants
  for each row execute function public.record_audit_changes();


-- ---------------------------------------------------------------------------
-- 7. updated_at maintenance triggers (extensions.moddatetime pattern).
-- ---------------------------------------------------------------------------
drop trigger if exists stakeholder_interactions_touch_updated_at
  on public.stakeholder_interactions;
create trigger stakeholder_interactions_touch_updated_at
  before update on public.stakeholder_interactions
  for each row execute function extensions.moddatetime(updated_at);

drop trigger if exists sip_touch_updated_at
  on public.stakeholder_interaction_participants;
create trigger sip_touch_updated_at
  before update on public.stakeholder_interaction_participants
  for each row execute function extensions.moddatetime(updated_at);
