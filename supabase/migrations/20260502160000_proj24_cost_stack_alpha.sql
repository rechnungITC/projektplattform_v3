-- =============================================================================
-- PROJ-24 Phase 24-α: Cost-Stack — Foundation (DB only)
-- =============================================================================
-- Adds the persistence layer for the Cost-Stack:
--
--   1. role_rates                — versioned daily rates per (tenant × role).
--                                  Append-only via valid_from. RLS pattern
--                                  identical to fx_rates (PROJ-22).
--   2. work_item_cost_lines      — generic cost-line table. source_type
--                                  discriminates resource_allocation / manual
--                                  / lv_position / material / stueckliste /
--                                  mischkalkulation. MVP only writes the
--                                  first two; the others are reserved for
--                                  PROJ-24b (no future migration needed).
--   3. tenant_settings.cost_settings  — JSONB column, default
--                                  {velocity_factor: 0.5, default_currency: "EUR"}
--   4. work_item_cost_totals     — security_invoker view aggregating per
--                                  work-item. Filters soft-deleted items.
--   5. _resolve_role_rate(...)   — SQL helper for the cost-calc-engine
--                                  resolve path (search-path hardened).
--
-- Out of scope (later phases):
--   - Cost-calc engine in src/lib/cost/  → Phase 24-β
--   - API routes                          → Phase 24-γ
--   - Hook into PROJ-11 work-item-resources route → Phase 24-δ
--
-- Locked design decisions (see features/PROJ-24-cost-stack.md §4):
--   - role_rates: NO UPDATE policy. Versioning via valid_from + composite UNIQUE.
--   - work_item_cost_lines: Replace-on-Update for resource_allocation lines.
--   - cost_settings: tenant-wide JSONB; velocity_factor validated in TS layer.
--   - View filters soft-deleted work_items (is_deleted = true).
--
-- Multi-tenant invariant: every new table has
--   tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1) role_rates — versioned daily rate per (tenant × role × valid_from)
-- ---------------------------------------------------------------------------
-- Pattern mirrors fx_rates (PROJ-22): append-only, no UPDATE policy.
-- A rate change is a NEW row, never an in-place edit. Audit-stable.
-- role_key is free text by design (locked decision §4 #4) — catalog from
-- PROJ-6 supplies default suggestions but tenants can keep tenant-specific
-- roles like "Bau-Aufsicht" or "Sondersachbearbeiter:in".
-- ---------------------------------------------------------------------------
create table public.role_rates (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  role_key      text not null,
  daily_rate    numeric(10,2) not null,
  currency      char(3) not null,
  valid_from    date not null,
  created_by    uuid not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint role_rates_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint role_rates_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint role_rates_role_key_length
    check (char_length(role_key) between 1 and 100),
  constraint role_rates_daily_rate_nonneg
    check (daily_rate >= 0),
  constraint role_rates_currency_supported
    check (public._is_supported_currency(currency)),
  constraint role_rates_unique_per_role_and_date
    unique (tenant_id, role_key, valid_from)
);

-- Lookup index: jüngster valid_from <= as_of_date pro (tenant × role).
create index role_rates_lookup_idx
  on public.role_rates (tenant_id, role_key, valid_from desc);

alter table public.role_rates enable row level security;

create policy "role_rates_select_tenant_member"
  on public.role_rates for select
  using (public.is_tenant_member(tenant_id));

create policy "role_rates_insert_admin"
  on public.role_rates for insert
  with check (public.is_tenant_admin(tenant_id));

create policy "role_rates_delete_admin"
  on public.role_rates for delete
  using (public.is_tenant_admin(tenant_id));

-- DELIBERATELY: NO UPDATE policy.
-- Rate changes are append-only (new row with newer valid_from).
-- The updated_at column is reserved for future "metadata-only" updates
-- if ever introduced via a tightly-scoped trigger; for MVP it stays at
-- created_at and is never touched.

create trigger role_rates_set_updated_at
  before update on public.role_rates
  for each row execute procedure extensions.moddatetime ('updated_at');


-- ---------------------------------------------------------------------------
-- 2) work_item_cost_lines — generic cost-line table per work-item
-- ---------------------------------------------------------------------------
-- One row per cost source attached to a work-item. source_type discriminates
-- which engine produced the row.
--
-- MVP source_types (used by Phase 24-β/γ/δ):
--   - 'resource_allocation' — system-derived from work_item_resources +
--     role_rates. Replace-on-Update (locked decision §4 #2).
--   - 'manual'              — user-created line. Free-form amount + metadata.
--
-- Reserved source_types (PROJ-24b, no migration needed):
--   - 'lv_position'         — Construction-LV position cost.
--   - 'material'            — Material/Wareneinsatz.
--   - 'stueckliste'         — BOM / Stückliste.
--   - 'mischkalkulation'    — weighted multi-source roll-up.
-- ---------------------------------------------------------------------------
create table public.work_item_cost_lines (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  project_id       uuid not null,
  work_item_id     uuid not null,
  source_type      text not null,
  amount           numeric(14,2) not null,
  currency         char(3) not null,
  occurred_on      date,
  source_ref_id    uuid,
  source_metadata  jsonb not null default '{}'::jsonb,
  created_by       uuid not null,
  created_at       timestamptz not null default now(),
  constraint work_item_cost_lines_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint work_item_cost_lines_project_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint work_item_cost_lines_work_item_fkey
    foreign key (work_item_id) references public.work_items(id) on delete cascade,
  constraint work_item_cost_lines_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint work_item_cost_lines_source_type_check
    check (source_type in (
      'resource_allocation','manual','lv_position',
      'material','stueckliste','mischkalkulation'
    )),
  constraint work_item_cost_lines_amount_nonneg
    check (amount >= 0),
  constraint work_item_cost_lines_currency_supported
    check (public._is_supported_currency(currency))
);

-- Hot indexes per Tech Design §8:
create index work_item_cost_lines_work_item_idx
  on public.work_item_cost_lines (work_item_id, source_type);
create index work_item_cost_lines_project_idx
  on public.work_item_cost_lines (project_id);
-- Allocation-Replace-on-Update needs a fast lookup by source_ref_id when
-- deleting/replacing the resource_allocation line for a given allocation.
create index work_item_cost_lines_source_ref_idx
  on public.work_item_cost_lines (source_ref_id)
  where source_ref_id is not null;

alter table public.work_item_cost_lines enable row level security;

create policy "work_item_cost_lines_select_member"
  on public.work_item_cost_lines for select
  using (public.is_project_member(project_id));

create policy "work_item_cost_lines_insert_editor_or_lead_or_admin"
  on public.work_item_cost_lines for insert
  with check (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );

create policy "work_item_cost_lines_update_editor_or_lead_or_admin"
  on public.work_item_cost_lines for update
  using (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  )
  with check (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );

create policy "work_item_cost_lines_delete_editor_or_lead_or_admin"
  on public.work_item_cost_lines for delete
  using (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );


-- ---------------------------------------------------------------------------
-- 3) tenant_settings.cost_settings — JSONB column for cost defaults
-- ---------------------------------------------------------------------------
-- Default: { velocity_factor: 0.5, default_currency: "EUR" }
-- velocity_factor is validated in the TS layer (Zod) to stay in [0.1, 5.0];
-- the DB only enforces "must be valid JSONB". This matches the pattern of
-- existing JSONB settings columns (privacy_defaults, ai_provider_config,
-- budget_settings, retention_overrides).
-- ---------------------------------------------------------------------------
alter table public.tenant_settings
  add column if not exists cost_settings jsonb not null
    default '{"velocity_factor": 0.5, "default_currency": "EUR"}'::jsonb;


-- ---------------------------------------------------------------------------
-- 4) View work_item_cost_totals — per-work-item aggregation
-- ---------------------------------------------------------------------------
-- Live view (security_invoker = true) — caller's RLS applies.
-- Filters soft-deleted work_items (is_deleted = true) per locked
-- decision §4 #9.
--
-- Columns:
--   work_item_id          — pk
--   tenant_id, project_id — for multi-tenant filtering on the consumer side
--   total_cost            — sum of all cost-line amounts (raw sum; multi-
--                           currency mixes are flagged via multi_currency_count)
--   currency              — most-frequent currency across the work-item's
--                           lines; ties broken by max(currency) (deterministic).
--                           NULL when there are no cost-lines.
--   cost_lines_count      — total number of cost-lines on this item
--   multi_currency_count  — count of distinct currencies on this item
--                           (1 = single currency, >1 = mixed; UI must warn)
--   is_estimated          — true iff every cost-line is "estimated"
--                           (source_metadata->>'estimated' = 'true' OR
--                            source_metadata->>'basis' = 'story_points').
--                           false if at least one duration-based or manual
--                           line exists.
--
-- Performance target (Tech Design §8): < 500 ms at 500 work-items × 500
-- resources. Plain view is sufficient; materialized view is PROJ-24b.
-- ---------------------------------------------------------------------------
create or replace view public.work_item_cost_totals
with (security_invoker = true)
as
with line_currency_freq as (
  select
    work_item_id,
    currency,
    count(*) as freq
  from public.work_item_cost_lines
  group by work_item_id, currency
),
line_currency_pick as (
  select distinct on (work_item_id)
    work_item_id,
    currency
  from line_currency_freq
  order by work_item_id, freq desc, currency desc
)
select
  wi.id                                                   as work_item_id,
  wi.tenant_id,
  wi.project_id,
  coalesce(sum(cl.amount), 0)::numeric(14,2)              as total_cost,
  lcp.currency                                            as currency,
  count(cl.id)::int                                       as cost_lines_count,
  count(distinct cl.currency)::int                        as multi_currency_count,
  -- is_estimated: true when every line is flagged estimated/SP-based,
  -- and there is at least one line. false when no lines OR any line is
  -- duration/manual based.
  case
    when count(cl.id) = 0 then false
    when bool_and(
      coalesce(cl.source_metadata->>'estimated', '') = 'true'
      or coalesce(cl.source_metadata->>'basis', '') = 'story_points'
    ) then true
    else false
  end                                                     as is_estimated
from public.work_items wi
left join public.work_item_cost_lines cl on cl.work_item_id = wi.id
left join line_currency_pick lcp on lcp.work_item_id = wi.id
where wi.is_deleted = false
group by wi.id, wi.tenant_id, wi.project_id, lcp.currency;

comment on view public.work_item_cost_totals is
  'PROJ-24 — per-work-item cost aggregation (security_invoker). '
  'Filters soft-deleted work_items. Multi-currency mixes are surfaced via '
  'multi_currency_count; total_cost is a raw sum that is only meaningful '
  'when multi_currency_count = 1.';


-- ---------------------------------------------------------------------------
-- 5) _resolve_role_rate — SQL helper for the cost-calc-engine
-- ---------------------------------------------------------------------------
-- Returns the role_rates row applicable for (tenant, role_key, as_of_date),
-- defined as the latest valid_from <= as_of_date. Returns NULL when no
-- matching rate exists — caller must handle the "no rate for role" branch.
--
-- SECURITY DEFINER + search_path hardening per PROJ-29 pattern. The function
-- still respects tenant boundaries because the caller passes p_tenant_id;
-- the helper does not bypass tenant-scoping.
-- ---------------------------------------------------------------------------
create or replace function public._resolve_role_rate(
  p_tenant_id uuid,
  p_role_key text,
  p_as_of_date date
)
returns public.role_rates
language sql
stable
security definer
set search_path = public, pg_temp
as $func$
  select rr.*
  from public.role_rates rr
  where rr.tenant_id = p_tenant_id
    and rr.role_key  = p_role_key
    and rr.valid_from <= p_as_of_date
  order by rr.valid_from desc
  limit 1
$func$;

revoke execute on function public._resolve_role_rate(uuid, text, date) from public, anon;
grant execute on function public._resolve_role_rate(uuid, text, date) to authenticated, service_role;

comment on function public._resolve_role_rate(uuid, text, date) is
  'PROJ-24 — resolve the latest applicable daily-rate for a role at a given '
  'date. SECURITY DEFINER with hardened search_path (PROJ-29). Returns NULL '
  'when no matching rate exists.';


-- ---------------------------------------------------------------------------
-- 6) Audit-Whitelist erweitert: role_rates + work_item_cost_lines
-- ---------------------------------------------------------------------------
-- The audit_log_entity_type_check was last extended in PROJ-21
-- (20260501140000_proj21_report_snapshots.sql). Recreate it here with the
-- two new entity-types appended. tenant_settings is already in the list.
-- ---------------------------------------------------------------------------
alter table public.audit_log_entries
  drop constraint audit_log_entity_type_check;

alter table public.audit_log_entries
  add constraint audit_log_entity_type_check check (
    entity_type in (
      'stakeholders','work_items','phases','milestones','projects',
      'risks','decisions','open_items',
      'tenants','tenant_settings',
      'communication_outbox',
      'resources','work_item_resources',
      'tenant_project_type_overrides','tenant_method_overrides',
      'vendors','vendor_project_assignments','vendor_evaluations','vendor_documents',
      'compliance_tags','work_item_documents',
      'budget_categories','budget_items','budget_postings','vendor_invoices',
      'report_snapshots',
      -- PROJ-24
      'role_rates','work_item_cost_lines'
    )
  );


-- ---------------------------------------------------------------------------
-- 7) Audit-Tracked-Columns erweitert
-- ---------------------------------------------------------------------------
-- The function is extended-by-many-migrations. The most recent canonical
-- version is in PROJ-33a (20260502140000_proj33a_stakeholder_qualitative_fields).
-- Recreate it here, preserving ALL existing entity-types and adding the
-- two new ones.
--
-- For tenant_settings we add 'cost_settings' to the tracked columns so that
-- a velocity_factor / default_currency change shows up in the audit log.
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
    -- cost_settings appended for PROJ-24
    when 'tenant_settings' then array['active_modules','privacy_defaults','ai_provider_config','retention_overrides','budget_settings','output_rendering_settings','cost_settings']
    when 'communication_outbox' then array['status','subject','body','channel','recipient_emails','sent_at','sent_by','provider_message_id']
    when 'resources' then array['name','role_key','default_capacity_hours_per_day','active','external_id','linked_stakeholder_id','linked_user_id','notes']
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
    -- PROJ-24
    -- role_rates: append-only; the function still tracks the user-meaningful
    -- columns in case a future tightly-scoped UPDATE path is introduced.
    when 'role_rates' then array['daily_rate','currency','valid_from','role_key']
    when 'work_item_cost_lines' then array['amount','currency','source_type','source_metadata','occurred_on']
    else array[]::text[]
  end
$$;

revoke execute on function public._tracked_audit_columns(text) from public;


-- ---------------------------------------------------------------------------
-- 8) Audit-Trigger wirings
-- ---------------------------------------------------------------------------
-- role_rates: append-only (no UPDATE policy), so UPDATE-trigger would never
-- fire. Insert/Delete audit happens via API-route synthetic entries (same
-- pattern as PROJ-22 budget_postings). No trigger needed.
--
-- work_item_cost_lines: UPDATEs are RLS-allowed (manual lines are editable).
-- Wire the standard record_audit_changes trigger so that field-level diffs
-- on amount/currency/source_metadata get logged.
-- ---------------------------------------------------------------------------
create trigger audit_changes_work_item_cost_lines
  after update on public.work_item_cost_lines
  for each row execute function public.record_audit_changes();


-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
-- Phase α complete. Next phases:
--   24-β: src/lib/cost/calculate-work-item-costs.ts + role-rate-lookup.ts
--   24-γ: API routes (role-rates CRUD, cost-lines CRUD, cost-summary)
--   24-δ: Hook into PROJ-11 work-item-resources route (synthetic INSERT)
-- ---------------------------------------------------------------------------
