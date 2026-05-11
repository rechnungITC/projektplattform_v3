-- PROJ-55-γ — repair _tracked_audit_columns for resources and
-- work_item_resources. The previous version (from PROJ-54-α)
-- referenced V2-era column names (name/active) on `resources` and
-- removed `allocation_pct` from `work_item_resources` audit
-- tracking entirely. Both tables had their actual columns drift
-- so the audit log was silently NOT recording the most-edited
-- fields (display_name, kind, fte_default, availability_default,
-- is_active, allocation_pct).
--
-- Applied live via Supabase MCP on 2026-05-11; this file mirrors
-- the change so `supabase db push` stays idempotent. All other
-- CASE branches are preserved verbatim from the live function
-- definition fetched on the same day.

CREATE OR REPLACE FUNCTION public._tracked_audit_columns(p_table text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    -- PROJ-55-γ: align with current public.resources columns.
    when 'resources' then array[
      'display_name','kind','fte_default','availability_default',
      'is_active','linked_user_id',
      'daily_rate_override','daily_rate_override_currency',
      'organization_unit_id'
    ]
    -- PROJ-55-γ: work_item_resources' only user-editable column.
    when 'work_item_resources' then array['allocation_pct']
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
    else array[]::text[]
  end
$function$;
