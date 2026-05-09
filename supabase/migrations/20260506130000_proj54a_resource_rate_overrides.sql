-- =============================================================================
-- PROJ-54 Phase 54-α: Resource-Level Tagessatz-Override (Foundation)
-- =============================================================================
-- Adds the persistence layer for per-resource Tagessatz-Overrides:
--
--   1. resources.daily_rate_override + .._currency  — two new nullable columns
--      with a CHECK that keeps them either both NULL or both set + valid.
--   2. _resolve_resource_rate(...)                  — SECURITY-DEFINER helper
--      that resolves the effective daily-rate per resource at a given date,
--      following the canonical order:
--        Override (resources.daily_rate_override)
--          → falls back to: stakeholder-role (resources.source_stakeholder_id
--            → stakeholders.role_key → role_rates@valid_from)
--          → falls back to: NULL (caller emits "no_rate_resolved" warning).
--   3. _tracked_audit_columns('resources') extended  — the two new columns
--      become field-level audit-tracked. The `audit_changes_resources` UPDATE
--      trigger is already wired and unchanged.
--
-- Out of scope (later phases):
--   - Resource-Form Combobox UX                                  → Phase 54-β
--   - Auto-Recompute via Next.js after()-Hook + Failed-Marker    → Phase 54-γ
--   - Versioned `resource_rate_overrides` history table          → Phase 54-δ (deferred)
--
-- Locked design decisions (see features/PROJ-54 §Tech Design):
--   - Latest-only on resources columns (no separate versioned table in α).
--     Audit-Log carries the change history.
--   - Override-write-permission is enforced at the **API layer** (PATCH-handler
--     whitelist) — kept out of RLS to avoid complex column-conditional WITH
--     CHECK predicates. RLS-Update for editors+admins on `resources` stays as-is.
--   - SQL helper is SECURITY DEFINER + search_path hardened (PROJ-29 pattern);
--     EXECUTE granted only to service_role (analog _resolve_role_rate lockdown).
--
-- Note on the `resources` audit-tracked-columns list:
--   The pre-PROJ-54 list contains V2-era column names (`name`, `role_key`,
--   `default_capacity_hours_per_day`, `active`, `external_id`, `linked_stakeholder_id`,
--   `notes`) that no longer exist on the `resources` table. The `record_audit_changes`
--   trigger silently no-ops on missing columns (uses `to_jsonb(NEW) -> v_col`),
--   so this is not a data-integrity bug — but it means almost no resource edits
--   currently produce audit entries. Cleaning that up is out of scope for
--   PROJ-54-α (separate hygiene-Slice candidate). For α we ONLY APPEND the two
--   new override columns; the stale entries continue to silently no-op.
--
-- Multi-tenant invariant: no new tables (only column additions).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1) resources.daily_rate_override + currency
-- ---------------------------------------------------------------------------
-- Pattern mirrors role_rates.daily_rate / .currency for type consistency:
--   numeric(10,2), char(3), and the same _is_supported_currency() guard.
-- ---------------------------------------------------------------------------
alter table public.resources
  add column if not exists daily_rate_override numeric(10,2) null;

alter table public.resources
  add column if not exists daily_rate_override_currency char(3) null;

comment on column public.resources.daily_rate_override is
  'PROJ-54-α — Per-resource Tagessatz-Override. NULL means "no override; '
  'fall back to role-rate resolution via stakeholder.role_key". '
  'Class-3 PII per data-privacy-registry (Personalkosten).';

comment on column public.resources.daily_rate_override_currency is
  'PROJ-54-α — ISO 4217 currency for daily_rate_override. NULL iff '
  'daily_rate_override is NULL.';

-- Both-or-neither + positive + supported-currency. Keeps the column pair
-- consistent and refuses €0 / negative overrides at the DB layer.
alter table public.resources
  drop constraint if exists resources_override_consistency;
alter table public.resources
  add constraint resources_override_consistency check (
    (daily_rate_override is null and daily_rate_override_currency is null)
    or (
      daily_rate_override is not null
      and daily_rate_override > 0
      and daily_rate_override_currency is not null
      and public._is_supported_currency(daily_rate_override_currency)
    )
  );


-- ---------------------------------------------------------------------------
-- 2) _resolve_resource_rate — SQL helper for the cost-calc-engine resolve path
-- ---------------------------------------------------------------------------
-- Returns at most one row with (tenant_id, source, role_key, resource_id,
-- daily_rate, currency, valid_from), or no rows when neither override nor a
-- role-rate matches. Caller treats "no row" as the "no_rate_resolved" warning
-- branch (cost-line with amount=0, source_metadata.warning='no_rate_resolved').
--
-- SECURITY: SECURITY DEFINER + search_path hardened (PROJ-29). EXECUTE granted
-- only to service_role — exposing this RPC to authenticated users would let
-- anyone resolve another tenant's Class-3 daily-rate via crafted parameters
-- (RLS does not gate SECURITY DEFINER calls — same finding as 0029-advisor on
-- _resolve_role_rate, fixed by 20260503110000-lockdown migration).
-- ---------------------------------------------------------------------------
create or replace function public._resolve_resource_rate(
  p_tenant_id uuid,
  p_resource_id uuid,
  p_as_of_date date
)
returns table (
  tenant_id    uuid,
  source       text,
  role_key     text,
  resource_id  uuid,
  daily_rate   numeric,
  currency     char(3),
  valid_from   date
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $func$
declare
  v_has_override boolean := false;
begin
  -- Short-circuit: override wins if set.
  return query
    select
      r.tenant_id,
      'override'::text                          as source,
      null::text                                as role_key,
      r.id                                      as resource_id,
      r.daily_rate_override                     as daily_rate,
      r.daily_rate_override_currency::char(3)   as currency,
      null::date                                as valid_from
    from public.resources r
    where r.id = p_resource_id
      and r.tenant_id = p_tenant_id
      and r.daily_rate_override is not null;

  if found then
    return;
  end if;

  -- Fall back to stakeholder-role resolution.
  return query
    select
      rr.tenant_id,
      'role'::text  as source,
      rr.role_key,
      null::uuid    as resource_id,
      rr.daily_rate,
      rr.currency,
      rr.valid_from
    from public.resources r
    inner join public.stakeholders sh
      on sh.id = r.source_stakeholder_id
      and sh.tenant_id = r.tenant_id
    inner join public.role_rates rr
      on rr.role_key = sh.role_key
      and rr.tenant_id = r.tenant_id
    where r.id = p_resource_id
      and r.tenant_id = p_tenant_id
      and rr.valid_from <= p_as_of_date
    order by rr.valid_from desc
    limit 1;
end;
$func$;

revoke execute on function public._resolve_resource_rate(uuid, uuid, date)
  from public, anon, authenticated;
grant execute on function public._resolve_resource_rate(uuid, uuid, date)
  to service_role;

comment on function public._resolve_resource_rate(uuid, uuid, date) is
  'PROJ-54-α — Resolve the effective daily-rate for a resource at a given '
  'date. Order: override on resources.daily_rate_override → stakeholder-role '
  'via role_rates.valid_from <= as_of_date → no row. SECURITY DEFINER with '
  'hardened search_path (PROJ-29). EXECUTE limited to service_role; the '
  'cost-calc engine path uses createAdminClient().';


-- ---------------------------------------------------------------------------
-- 3) _tracked_audit_columns — append override columns to `resources`
-- ---------------------------------------------------------------------------
-- Append-only edit: we keep all existing entity-types and column lists
-- byte-identical and add only the two new override columns to `resources`.
-- The pre-existing V2-stale entries (`name`, `role_key`, `default_capacity_*`,
-- `active`, `external_id`, `linked_stakeholder_id`, `notes`) are kept as-is —
-- they silently no-op in `record_audit_changes` because the columns do not
-- exist on the table; cleaning them up is out of scope for PROJ-54-α.
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
      -- PROJ-8 base
      'name','role_key','org_unit','contact_email','contact_phone',
      'influence','impact','linked_user_id','notes','is_active',
      'kind','origin',
      -- PROJ-31
      'is_approver',
      -- PROJ-33 qualitative fields
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
    when 'tenants' then array['language','branding']
    when 'tenant_settings' then array['active_modules','privacy_defaults','ai_provider_config','retention_overrides','budget_settings','output_rendering_settings','cost_settings']
    when 'communication_outbox' then array['status','subject','body','channel','recipient_emails','sent_at','sent_by','provider_message_id']
    -- resources: V2-stale entries kept (silent no-op); PROJ-54-α appends
    -- daily_rate_override + daily_rate_override_currency.
    when 'resources' then array[
      'name','role_key','default_capacity_hours_per_day','active','external_id',
      'linked_stakeholder_id','linked_user_id','notes',
      -- PROJ-54-α
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


-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
-- Phase 54-α DB-side complete. TS changes (54-α §lib/cost):
--   - Add ResolvedRate type
--   - Add resolveResourceRates() lookup layer calling _resolve_resource_rate
--   - calculateWorkItemCosts: new optional `resolved_rates` input that
--     takes precedence over `role_rates` (additive, backwards-compatible).
--   - synthesizeResourceAllocationCostLines: switch lookup path to
--     resolveResourceRates (override-aware).
-- ---------------------------------------------------------------------------
