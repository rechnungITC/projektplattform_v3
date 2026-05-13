-- ===========================================================================
-- PROJ-34 ε.α — Coaching Recommendations table
-- ===========================================================================
-- AI-generated coaching recommendations for stakeholders. Sources locked
-- in the requirements pass 2026-05-13 (Q1 Profile / Q2 Last-N-Interactions
-- / Q3 PROJ-35 Risk-Score / Q4 PROJ-35 Tonality-Lookup as read-only input
-- / Q5 Response-Stats). Each call produces 0..n rows; max 1 per kind.
--
-- Lifecycle (locked 2026-05-13):
--   * Re-trigger soft-deletes existing drafts (clean single-draft surface)
--   * Modify-path writes to separate `modified_text` column — original AI
--     output stays intact for "did the AI really say that?" audit
--   * DSGVO Art. 17 cascade-delete via FK on stakeholder_id
-- ===========================================================================

create table public.stakeholder_coaching_recommendations (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null
                           references public.tenants(id) on delete cascade,
  project_id               uuid not null
                           references public.projects(id) on delete cascade,
  stakeholder_id           uuid not null
                           references public.stakeholders(id) on delete cascade,
  recommendation_kind      text not null,
  -- Original AI output, never overwritten on modify-path. Audit trail
  -- preserves the AI's verbatim suggestion across the review lifecycle.
  recommendation_text      text not null,
  -- User-overridden text when review_state = 'modified'.
  modified_text            text,
  review_state             text not null default 'draft',
  -- Citations as plain arrays (max ~10 per recommendation; orphaned IDs
  -- are filtered on read rather than maintained via bridge tables).
  cited_interaction_ids    uuid[] not null default '{}'::uuid[],
  cited_profile_fields     text[] not null default '{}'::text[],
  provider                 text,
  model_id                 text,
  confidence               numeric(4, 3),
  ki_run_id                uuid references public.ki_runs(id) on delete set null,
  -- Captures the audit-relevant slice of what the AI saw at trigger time
  -- (tonality_hint, risk_score_snapshot, interaction_count_used,
  -- prompt_token_count). Class-3 freetext is NOT stored here.
  prompt_context_meta      jsonb not null default '{}'::jsonb,
  created_by               uuid references public.profiles(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  -- Soft-delete marker. Used both by re-trigger overwrite (old drafts
  -- soft-deleted) and by tenant-admin manual cleanup.
  deleted_at               timestamptz,
  constraint scr_kind_check
    check (recommendation_kind in (
      'outreach','tonality','escalation','celebration'
    )),
  constraint scr_review_state_check
    check (review_state in (
      'draft','accepted','rejected','modified'
    )),
  constraint scr_text_length_check
    check (length(recommendation_text) <= 1000),
  constraint scr_modified_length_check
    check (modified_text is null or length(modified_text) <= 1000),
  constraint scr_confidence_range
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  -- A modify-state requires modified_text, others must leave it NULL.
  constraint scr_modified_text_state_consistency
    check (
      (review_state = 'modified' and modified_text is not null)
      or (review_state <> 'modified' and modified_text is null)
    )
);

create index scr_tenant_project_idx
  on public.stakeholder_coaching_recommendations (tenant_id, project_id);

create index scr_stakeholder_state_idx
  on public.stakeholder_coaching_recommendations (stakeholder_id, review_state)
  where deleted_at is null;

create index scr_created_idx
  on public.stakeholder_coaching_recommendations (stakeholder_id, created_at desc)
  where deleted_at is null;

alter table public.stakeholder_coaching_recommendations
  enable row level security;

create policy "scr_select_project_member"
  on public.stakeholder_coaching_recommendations
  for select using (public.is_project_member(project_id));

create policy "scr_insert_project_member"
  on public.stakeholder_coaching_recommendations
  for insert with check (public.is_project_member(project_id));

create policy "scr_update_project_member"
  on public.stakeholder_coaching_recommendations
  for update using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

create policy "scr_delete_project_member"
  on public.stakeholder_coaching_recommendations
  for delete using (public.is_project_member(project_id));

-- ---------------------------------------------------------------------------
-- 2. Touch-updated_at trigger
-- ---------------------------------------------------------------------------
create trigger scr_set_updated_at
  before update on public.stakeholder_coaching_recommendations
  for each row execute procedure extensions.moddatetime ('updated_at');

-- ---------------------------------------------------------------------------
-- 3. Extend _tracked_audit_columns whitelist
-- ---------------------------------------------------------------------------
-- Rewrites the existing whitelist function with the same content as
-- 20260513140000_proj34_gamma2_audit_columns_extension.sql plus the new
-- coaching-recommendations entry. Only `recommendation_text`,
-- `modified_text`, `review_state` and `deleted_at` carry user-visible
-- state changes worth auditing.

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
      'participant_sentiment_model','participant_sentiment_provider',
      'participant_sentiment_confidence',
      'participant_cooperation_signal','participant_cooperation_signal_source'
    ]
    when 'stakeholder_coaching_recommendations' then array[
      'recommendation_text','modified_text','review_state','deleted_at'
    ]
    else array[]::text[]
  end
$$;

revoke execute on function public._tracked_audit_columns(text) from public;

-- ---------------------------------------------------------------------------
-- 4. Extend audit_log_entries.entity_type whitelist
-- ---------------------------------------------------------------------------
alter table public.audit_log_entries
  drop constraint audit_log_entity_type_check;
alter table public.audit_log_entries
  add constraint audit_log_entity_type_check
  check (entity_type in (
    'stakeholders','work_items','phases','milestones','projects','risks',
    'decisions','open_items','tenants','tenant_settings',
    'communication_outbox','resources','work_item_resources',
    'tenant_project_type_overrides','tenant_method_overrides',
    'vendors','vendor_project_assignments','vendor_evaluations','vendor_documents',
    'compliance_tags','work_item_documents','budget_categories','budget_items',
    'budget_postings','vendor_invoices','report_snapshots',
    'role_rates','work_item_cost_lines','dependencies',
    'tenant_ai_keys','tenant_ai_providers','tenant_ai_provider_priority',
    'tenant_ai_cost_caps','tenant_memberships',
    'organization_units','locations',
    'stakeholder_interactions','stakeholder_interaction_participants',
    'organization_imports',
    'stakeholder_coaching_recommendations'
  ));

-- ---------------------------------------------------------------------------
-- 5. Audit trigger
-- ---------------------------------------------------------------------------
drop trigger if exists scr_audit_update
  on public.stakeholder_coaching_recommendations;
create trigger scr_audit_update
  after update on public.stakeholder_coaching_recommendations
  for each row execute procedure public.record_audit_changes();
