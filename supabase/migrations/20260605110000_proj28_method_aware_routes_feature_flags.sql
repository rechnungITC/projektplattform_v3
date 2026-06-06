-- =============================================================================
-- PROJ-28 follow-up — tenant feature flag for method-aware routing
-- =============================================================================
-- PROJ-28 shipped method-aware labels/slugs/308 redirects before the tenant
-- kill-switch. This migration adds the PROJ-17-style JSONB flag surface:
--   tenant_settings.feature_flags.method_aware_routes
--
-- Retrofit default is TRUE to preserve already-deployed production behavior.
-- Tenant admins can set the key to false to disable method-aware redirects.
-- =============================================================================

alter table public.tenant_settings
  add column if not exists feature_flags jsonb;

update public.tenant_settings
   set feature_flags =
     coalesce(feature_flags, '{}'::jsonb)
     || '{"method_aware_routes": true}'::jsonb
 where feature_flags is null
    or not (feature_flags ? 'method_aware_routes');

alter table public.tenant_settings
  alter column feature_flags set default '{"method_aware_routes": true}'::jsonb,
  alter column feature_flags set not null;

alter table public.tenant_settings
  drop constraint if exists tenant_settings_feature_flags_object;

alter table public.tenant_settings
  add constraint tenant_settings_feature_flags_object
  check (jsonb_typeof(feature_flags) = 'object');

alter table public.tenant_settings
  drop constraint if exists tenant_settings_method_aware_routes_bool;

alter table public.tenant_settings
  add constraint tenant_settings_method_aware_routes_bool
  check (
    not (feature_flags ? 'method_aware_routes')
    or jsonb_typeof(feature_flags->'method_aware_routes') = 'boolean'
  );

comment on column public.tenant_settings.feature_flags is
  'Tenant-scoped feature flags. PROJ-28 uses method_aware_routes as the per-tenant kill-switch for method-aware project-room redirects.';

-- Keep tenant_settings flag changes field-level audited. Re-state the full
-- current production body (PROJ-65 ε.3b baseline) and append feature_flags.
create or replace function public._tracked_audit_columns(p_table text)
returns text[]
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select case p_table
    when 'stakeholders' then array['name','role_key','org_unit','contact_email','contact_phone','influence','impact','linked_user_id','notes','is_active','kind','origin','is_approver','reasoning','stakeholder_type_key','management_level','decision_authority','attitude','conflict_potential','communication_need','preferred_channel','organization_unit_id']
    when 'work_items' then array['title','description','status','priority','responsible_user_id','kind','sprint_id','parent_id','story_points','release_id']
    when 'phases' then array['name','description','planned_start','planned_end','status','sequence_number']
    when 'milestones' then array['name','description','target_date','actual_date','status','phase_id']
    when 'projects' then array['name','description','project_number','planned_start_date','planned_end_date','responsible_user_id','project_type','project_method','lifecycle_status','type_specific_data']
    when 'risks' then array['title','description','probability','impact','status','mitigation','responsible_user_id']
    when 'decisions' then array['is_revised']
    when 'open_items' then array['title','description','status','contact','contact_stakeholder_id','converted_to_entity_type','converted_to_entity_id']
    when 'tenants' then array['language','branding','holiday_region']
    when 'tenant_settings' then array['active_modules','privacy_defaults','ai_provider_config','retention_overrides','feature_flags','budget_settings','output_rendering_settings','cost_settings','assistant_settings','trajectory_plan_mutate_enabled']
    when 'communication_outbox' then array['status','subject','body','channel','recipient_emails','sent_at','sent_by','provider_message_id']
    when 'resources' then array['name','role_key','default_capacity_hours_per_day','active','external_id','linked_stakeholder_id','linked_user_id','notes','daily_rate_override','daily_rate_override_currency','organization_unit_id']
    when 'work_item_resources' then array['effort_hours','role_key','start_date','end_date']
    when 'tenant_project_type_overrides' then array['display_name','description','rules','active','sort_order']
    when 'tenant_method_overrides' then array['display_name','description','rules','active','sort_order']
    when 'vendors' then array['name','vendor_number','category','status','contact_email','contact_phone','website','notes','tax_id']
    when 'vendor_project_assignments' then array['role','status','signed_at','signed_off_by','removed_at','removed_by']
    when 'vendor_evaluations' then array['rubric_key','score','comment','evaluated_at','evaluated_by']
    when 'vendor_documents' then array['kind','title','file_url','signed_at','signed_off_by','expires_at','metadata']
    when 'compliance_tags' then array['display_name','description','is_active']
    when 'work_item_documents' then array['title','body','checklist','version']
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
    when 'releases' then array['name','description','start_date','end_date','status','target_milestone_id']
    when 'stakeholder_coaching_recommendations' then array['recommendation_text','modified_text','review_state','deleted_at']
    when 'project_goals' then array['title','description','success_criteria','target_date','status','parent_goal_id','source_phase_id','source_milestone_id','sort_order','deleted_at']
    when 'sprints' then array['start_date','end_date']
    else array[]::text[]
  end
$$;

revoke execute on function public._tracked_audit_columns(text) from public;
