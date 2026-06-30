-- =============================================================================
-- PROJ-53 Phase 53-β: Tenant Holiday-Region (Foundation)
-- =============================================================================
--
-- Purpose
--   Add tenant-level configuration for holiday-region so the Gantt-view can
--   render regional public holidays (DE-NW, DE-BY, AT, CH-ZH, ...) on top of
--   the weekend bands shipped in PROJ-53-α.
--
-- What this migration does
--   1. Adds a single nullable TEXT column `holiday_region` to `public.tenants`.
--   2. Adds a CHECK constraint enforcing ISO-3166 country code + optional
--      subdivision suffix (e.g. "DE-NW", "AT", "CH-ZH"). NULL means
--      "no holidays" — the Gantt falls back to weekend-only behaviour (α).
--   3. Adds the new column to the `_tracked_audit_columns` whitelist for
--      `tenants` so changes are recorded in the audit log (PROJ-10 pattern).
--
-- What this migration does NOT do
--   - Per-project override (`projects.holiday_region`) → deferred to PROJ-53-γ.
--   - Custom tenant-defined holidays (Werksferien) → deferred to PROJ-53-γ.
--   - Tenant locale (`tenants.locale`) → deferred to PROJ-53-γ.
--
-- RLS
--   No new policies. The existing `tenants` SELECT/UPDATE policies (PROJ-1 +
--   PROJ-17) cover the new column automatically:
--   - SELECT: members of the tenant
--   - UPDATE: tenant admins (`is_tenant_admin(id)`)
--
-- Reversibility
--   Pure additive — drop column to roll back. NULL default keeps existing
--   tenants behaviourally unchanged.
-- =============================================================================

-- 1) Schema -------------------------------------------------------------------

alter table public.tenants
  add column if not exists holiday_region text null;

comment on column public.tenants.holiday_region is
  'PROJ-53-β. ISO-3166 country code with optional subdivision (e.g. "DE-NW", "AT", "CH-ZH"). NULL = no public-holiday rendering in the Gantt-view.';

-- 2) CHECK constraint ---------------------------------------------------------
-- Enforce shape: 2 uppercase letters + optional dash + 1-3 alphanumeric uppercase.
-- Covers: DE, DE-NW, US-CA, JP-13, CH-ZH, AT, etc.

alter table public.tenants
  add constraint tenants_holiday_region_format_check
  check (
    holiday_region is null
    or holiday_region ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$'
  );

-- 3) Audit-tracked columns ----------------------------------------------------
-- Recreate the function from the latest canonical version (PROJ-54α at
-- 20260506111756_proj54a_resource_rate_overrides.sql), preserving every
-- existing entity-type and adding `holiday_region` to the `tenants` array.

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
      'communication_need','preferred_channel'
    ]
    when 'work_items' then array['title','description','status','priority','responsible_user_id','kind','sprint_id','parent_id','story_points']
    when 'phases' then array['name','description','planned_start','planned_end','status','sequence_number']
    when 'milestones' then array['name','description','target_date','actual_date','status','phase_id']
    when 'projects' then array['name','description','project_number','planned_start_date','planned_end_date','responsible_user_id','project_type','project_method','lifecycle_status','type_specific_data']
    when 'risks' then array['title','description','probability','impact','status','mitigation','responsible_user_id']
    when 'decisions' then array['is_revised']
    when 'open_items' then array['title','description','status','contact','contact_stakeholder_id','converted_to_entity_type','converted_to_entity_id']
    -- PROJ-53-β: holiday_region added to tracked columns.
    when 'tenants' then array['language','branding','holiday_region']
    when 'tenant_settings' then array['active_modules','privacy_defaults','ai_provider_config','retention_overrides','budget_settings','output_rendering_settings','cost_settings']
    when 'communication_outbox' then array['status','subject','body','channel','recipient_emails','sent_at','sent_by','provider_message_id']
    when 'resources' then array[
      'name','role_key','default_capacity_hours_per_day','active','external_id',
      'linked_stakeholder_id','linked_user_id','notes',
      'daily_rate_override','daily_rate_override_currency'
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
    else array[]::text[]
  end
$$;

revoke execute on function public._tracked_audit_columns(text) from public;
