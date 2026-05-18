-- =============================================================================
-- PROJ-37..41: Assistant Core, Governance, and Speech Policy
-- =============================================================================
-- Adds the first governed assistant runtime storage:
-- - tenant_settings.assistant_settings for retention/speech policy
-- - assistant_sessions / assistant_turns / assistant_action_events
-- - RLS scoped to tenant membership and owning user
-- - assistant module key enabled for existing tenants
--
-- Raw audio is intentionally not stored.
-- =============================================================================

alter table public.tenant_settings
  add column if not exists assistant_settings jsonb not null default jsonb_build_object(
    'transcript_retention_mode', 'persist_metadata_only',
    'retention_days', 30,
    'stt_provider', 'browser',
    'tts_provider', 'browser',
    'wake_word_enabled', false
  );

alter table public.tenant_settings
  drop constraint if exists tenant_settings_assistant_settings_object;

alter table public.tenant_settings
  add constraint tenant_settings_assistant_settings_object
  check (jsonb_typeof(assistant_settings) = 'object');

alter table public.tenant_settings
  drop constraint if exists tenant_settings_assistant_transcript_retention_mode;

alter table public.tenant_settings
  add constraint tenant_settings_assistant_transcript_retention_mode
  check (
    assistant_settings->>'transcript_retention_mode'
      in ('no_persist','persist_metadata_only','persist_redacted_transcript')
  );

alter table public.tenant_settings
  drop constraint if exists tenant_settings_assistant_retention_days;

alter table public.tenant_settings
  add constraint tenant_settings_assistant_retention_days
  check (
    coalesce((assistant_settings->>'retention_days')::int, 30) between 1 and 3650
  );

alter table public.tenant_settings
  drop constraint if exists tenant_settings_assistant_stt_provider;

alter table public.tenant_settings
  add constraint tenant_settings_assistant_stt_provider
  check (
    assistant_settings->>'stt_provider' in ('browser','external','none')
  );

alter table public.tenant_settings
  drop constraint if exists tenant_settings_assistant_tts_provider;

alter table public.tenant_settings
  add constraint tenant_settings_assistant_tts_provider
  check (
    assistant_settings->>'tts_provider' in ('browser','external','none')
  );

update public.tenant_settings
   set active_modules = active_modules || '["assistant"]'::jsonb
 where not (active_modules @> '["assistant"]'::jsonb);

create table if not exists public.assistant_sessions (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  project_id       uuid references public.projects(id) on delete set null,
  status           text not null default 'active',
  started_at       timestamptz not null default now(),
  last_turn_at     timestamptz,
  closed_at        timestamptz,
  last_intent      text,
  context          jsonb not null default '{}'::jsonb,
  constraint assistant_sessions_status_check
    check (status in ('active','closed','aborted')),
  constraint assistant_sessions_context_object
    check (jsonb_typeof(context) = 'object')
);

create index if not exists assistant_sessions_tenant_user_idx
  on public.assistant_sessions (tenant_id, user_id, started_at desc);

create index if not exists assistant_sessions_project_idx
  on public.assistant_sessions (project_id)
  where project_id is not null;

alter table public.assistant_sessions enable row level security;

drop policy if exists assistant_sessions_select_own on public.assistant_sessions;
create policy assistant_sessions_select_own
  on public.assistant_sessions for select
  using (user_id = auth.uid() and public.is_tenant_member(tenant_id));

drop policy if exists assistant_sessions_insert_own on public.assistant_sessions;
create policy assistant_sessions_insert_own
  on public.assistant_sessions for insert
  with check (user_id = auth.uid() and public.is_tenant_member(tenant_id));

drop policy if exists assistant_sessions_update_own on public.assistant_sessions;
create policy assistant_sessions_update_own
  on public.assistant_sessions for update
  using (user_id = auth.uid() and public.is_tenant_member(tenant_id))
  with check (user_id = auth.uid() and public.is_tenant_member(tenant_id));

create table if not exists public.assistant_turns (
  id                       uuid primary key default gen_random_uuid(),
  session_id               uuid not null references public.assistant_sessions(id) on delete cascade,
  tenant_id                uuid not null references public.tenants(id) on delete cascade,
  user_id                  uuid not null references auth.users(id) on delete cascade,
  project_id               uuid references public.projects(id) on delete set null,
  modality                 text not null,
  input_text               text,
  input_redacted           boolean not null default false,
  recognized_intent        text not null,
  confirmation_state       text not null,
  result_status            text not null,
  tool_calls               jsonb not null default '[]'::jsonb,
  response_text            text,
  route_target             jsonb,
  wizard_draft_id          uuid references public.project_wizard_drafts(id) on delete set null,
  created_at               timestamptz not null default now(),
  constraint assistant_turns_modality_check
    check (modality in ('text','voice')),
  constraint assistant_turns_confirmation_check
    check (confirmation_state in ('not_required','required','confirmed','cancelled')),
  constraint assistant_turns_status_check
    check (result_status in ('success','needs_clarification','blocked','failed')),
  constraint assistant_turns_tool_calls_array
    check (jsonb_typeof(tool_calls) = 'array'),
  constraint assistant_turns_route_target_object
    check (route_target is null or jsonb_typeof(route_target) = 'object')
);

create index if not exists assistant_turns_session_idx
  on public.assistant_turns (session_id, created_at);

create index if not exists assistant_turns_tenant_user_idx
  on public.assistant_turns (tenant_id, user_id, created_at desc);

alter table public.assistant_turns enable row level security;

drop policy if exists assistant_turns_select_own on public.assistant_turns;
create policy assistant_turns_select_own
  on public.assistant_turns for select
  using (user_id = auth.uid() and public.is_tenant_member(tenant_id));

drop policy if exists assistant_turns_insert_own on public.assistant_turns;
create policy assistant_turns_insert_own
  on public.assistant_turns for insert
  with check (user_id = auth.uid() and public.is_tenant_member(tenant_id));

create table if not exists public.assistant_action_events (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  session_id          uuid references public.assistant_sessions(id) on delete cascade,
  turn_id             uuid references public.assistant_turns(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  project_id          uuid references public.projects(id) on delete set null,
  recognized_intent   text not null,
  action_key          text not null,
  confirmation_state  text not null,
  executed_tools      jsonb not null default '[]'::jsonb,
  result_status       text not null,
  created_at          timestamptz not null default now(),
  constraint assistant_action_events_confirmation_check
    check (confirmation_state in ('not_required','required','confirmed','cancelled')),
  constraint assistant_action_events_status_check
    check (result_status in ('success','needs_clarification','blocked','failed')),
  constraint assistant_action_events_tools_array
    check (jsonb_typeof(executed_tools) = 'array')
);

create index if not exists assistant_action_events_tenant_user_idx
  on public.assistant_action_events (tenant_id, user_id, created_at desc);

create index if not exists assistant_action_events_project_idx
  on public.assistant_action_events (project_id, created_at desc)
  where project_id is not null;

alter table public.assistant_action_events enable row level security;

drop policy if exists assistant_action_events_select_own on public.assistant_action_events;
create policy assistant_action_events_select_own
  on public.assistant_action_events for select
  using (user_id = auth.uid() and public.is_tenant_member(tenant_id));

drop policy if exists assistant_action_events_insert_own on public.assistant_action_events;
create policy assistant_action_events_insert_own
  on public.assistant_action_events for insert
  with check (user_id = auth.uid() and public.is_tenant_member(tenant_id));

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
    when 'work_items' then array[
      'title','description','status','priority','responsible_user_id',
      'kind','sprint_id','parent_id','story_points','release_id'
    ]
    when 'phases' then array['name','description','planned_start','planned_end','status','sequence_number']
    when 'milestones' then array['name','description','target_date','actual_date','status','phase_id']
    when 'projects' then array['name','description','project_number','planned_start_date','planned_end_date','responsible_user_id','project_type','project_method','lifecycle_status','type_specific_data']
    when 'risks' then array['title','description','probability','impact','status','mitigation','responsible_user_id']
    when 'decisions' then array['is_revised']
    when 'open_items' then array['title','description','status','contact','contact_stakeholder_id','converted_to_entity_type','converted_to_entity_id']
    when 'tenants' then array['language','branding','holiday_region']
    when 'tenant_settings' then array['active_modules','privacy_defaults','ai_provider_config','retention_overrides','budget_settings','output_rendering_settings','cost_settings','assistant_settings']
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
      'participant_sentiment_model','participant_sentiment_provider',
      'participant_sentiment_confidence',
      'participant_cooperation_signal','participant_cooperation_signal_source'
    ]
    when 'releases' then array[
      'name','description','start_date','end_date','status',
      'target_milestone_id'
    ]
    when 'stakeholder_coaching_recommendations' then array[
      'recommendation_text','modified_text','review_state','deleted_at'
    ]
    else array[]::text[]
  end
$$;

revoke execute on function public._tracked_audit_columns(text) from public;
