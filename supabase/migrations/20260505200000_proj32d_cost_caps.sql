-- =============================================================================
-- PROJ-32 Phase 32-d — Cost-Caps + Token-Logging + Cost-Dashboard
-- =============================================================================
-- Adds per-tenant monthly token caps + dashboard support.
-- Token logging uses the existing ki_runs.input_tokens / output_tokens
-- (no new logging path — we just aggregate from there).
--
-- Locked decisions (/requirements 2026-05-05):
--   * Monthly Token-Budget pro Tenant (input + output separately)
--   * Pro ki_runs Row token logging (already in place since PROJ-12)
--   * Dashboard: current month + 6-month trend per provider
--   * Pre-call SELECT-Aggregat (with pre_call_cost_check helper)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. tenant_ai_cost_caps — one row per tenant
-- ---------------------------------------------------------------------------
create table public.tenant_ai_cost_caps (
  tenant_id                uuid primary key
                           references public.tenants(id) on delete cascade,
  -- NULL = unlimited. Counts are cumulative across the calendar month
  -- across all providers (not per-provider for v1; per-provider caps
  -- can be a future slice).
  monthly_input_token_cap  bigint,
  monthly_output_token_cap bigint,
  -- 'block': pre-call check throws 429 once cap is exceeded.
  -- 'warn_only': cap not enforced, dashboard shows status only.
  cap_action               text not null default 'block',
  updated_by               uuid references public.profiles(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint tenant_ai_cost_caps_action_check
    check (cap_action in ('block', 'warn_only')),
  constraint tenant_ai_cost_caps_input_nonneg
    check (monthly_input_token_cap is null or monthly_input_token_cap >= 0),
  constraint tenant_ai_cost_caps_output_nonneg
    check (monthly_output_token_cap is null or monthly_output_token_cap >= 0)
);

create trigger tenant_ai_cost_caps_set_updated_at
  before update on public.tenant_ai_cost_caps
  for each row execute procedure extensions.moddatetime ('updated_at');

alter table public.tenant_ai_cost_caps enable row level security;

-- Member-readable so the AI router can do the pre-call check from any
-- authenticated session. The cap configuration itself is admin-only
-- write (the table contains no plaintext secrets — just integer
-- thresholds and a string action).
create policy "tenant_ai_cost_caps_member_select"
  on public.tenant_ai_cost_caps for select
  using (public.is_tenant_member(tenant_id));

create policy "tenant_ai_cost_caps_admin_insert"
  on public.tenant_ai_cost_caps for insert
  with check (public.is_tenant_admin(tenant_id));

create policy "tenant_ai_cost_caps_admin_update"
  on public.tenant_ai_cost_caps for update
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy "tenant_ai_cost_caps_admin_delete"
  on public.tenant_ai_cost_caps for delete
  using (public.is_tenant_admin(tenant_id));

-- ---------------------------------------------------------------------------
-- 2. Index on ki_runs(tenant_id, created_at, status) for the aggregate
-- ---------------------------------------------------------------------------
-- The pre-call cost check + the dashboard query both filter on
-- tenant_id + created_at. Existing indexes are project-id and
-- actor-id keyed; nothing on tenant. With expected ~hundreds of
-- ki_runs per tenant per month this index keeps the aggregate
-- query under 5ms.
create index ki_runs_tenant_billing_idx
  on public.ki_runs (tenant_id, created_at desc)
  where status in ('success', 'error');

-- ---------------------------------------------------------------------------
-- 3. Audit-log entity_type whitelist extension
-- ---------------------------------------------------------------------------
-- Cap config changes are admin actions worth auditing.
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
      'tenant_ai_keys',
      'tenant_ai_providers',
      'tenant_ai_provider_priority',
      'tenant_ai_cost_caps'
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Audit RPC for cost-cap config changes
-- ---------------------------------------------------------------------------
create or replace function public.record_tenant_ai_cost_cap_audit(
  p_tenant_id        uuid,
  p_field_name       text,
  p_old_value        jsonb,
  p_new_value        jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  if not public.is_tenant_admin(p_tenant_id) then
    raise exception 'forbidden: caller is not tenant admin'
      using errcode = 'P0003';
  end if;
  if length(p_field_name) > 100 then
    raise exception 'field_name too long' using errcode = 'P0001';
  end if;

  v_actor := auth.uid();
  insert into public.audit_log_entries (
    tenant_id, entity_type, entity_id, field_name,
    old_value, new_value, actor_user_id, change_reason
  )
  values (
    p_tenant_id, 'tenant_ai_cost_caps', p_tenant_id, p_field_name,
    p_old_value, p_new_value, v_actor, 'cost_cap_update'
  );
end;
$$;

revoke execute on function public.record_tenant_ai_cost_cap_audit(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.record_tenant_ai_cost_cap_audit(uuid, text, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. tenant_ai_monthly_usage(p_tenant_id, p_year, p_month) — aggregate helper
-- ---------------------------------------------------------------------------
-- Returns input/output token totals for the given calendar month. Member-
-- callable: the AI router uses this for the pre-call check; the dashboard
-- uses this for the per-month trend.
create or replace function public.tenant_ai_monthly_usage(
  p_tenant_id uuid,
  p_year      integer,
  p_month     integer
)
returns table (
  provider      text,
  input_tokens  bigint,
  output_tokens bigint,
  call_count    bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce(provider, 'unknown') as provider,
    coalesce(sum(input_tokens), 0)::bigint as input_tokens,
    coalesce(sum(output_tokens), 0)::bigint as output_tokens,
    count(*)::bigint as call_count
  from public.ki_runs
  where tenant_id = p_tenant_id
    and status in ('success', 'error')
    and date_trunc('month', created_at)
        = make_date(p_year, p_month, 1)::timestamptz
  group by provider
$$;

revoke execute on function public.tenant_ai_monthly_usage(uuid, integer, integer) from public, anon;
grant execute on function public.tenant_ai_monthly_usage(uuid, integer, integer) to authenticated;

comment on function public.tenant_ai_monthly_usage(uuid, integer, integer) is
  'PROJ-32-d: aggregate ki_runs token counts for a tenant for a given '
  'calendar month, grouped by provider. Used by the pre-call cap check '
  'and the cost dashboard.';
