-- =============================================================================
-- PROJ-32a — Audit-Whitelist Extension + record_tenant_ai_key_audit RPC
-- =============================================================================
-- Fork 5 (CIA-locked): reuse PROJ-10 audit_log_entries instead of a separate
-- audit table. PROJ-10's CHECK constraint is locked to 5 entity_types; we
-- extend it here to add 'tenant_ai_keys' so AI-key admin actions land in
-- the same audit pipeline (DSGVO-redaction, RLS, export already wired).
--
-- Audit entries for tenant_ai_keys are written explicitly via the RPC
-- below (not via UPDATE trigger). Reason: the action surface is INSERT /
-- UPDATE / DELETE — not a single field flip — so we want one audit row
-- per admin action, with fingerprints as old_value / new_value. The PROJ-10
-- trigger machinery only fires on UPDATE.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend the audit_log entity_type whitelist.
-- ---------------------------------------------------------------------------
-- Preserve every entity_type added across PROJ-10 / 12 / 15 / 17 / 18 / 20 /
-- 21 / 24 / 9-R2 — the CHECK is the cumulative whitelist. We append
-- 'tenant_ai_keys' here.
alter table public.audit_log_entries
  drop constraint audit_log_entity_type_check;

alter table public.audit_log_entries
  add constraint audit_log_entity_type_check check (
    entity_type in (
      'stakeholders',
      'work_items',
      'phases',
      'milestones',
      'projects',
      'risks',
      'decisions',
      'open_items',
      'tenants',
      'tenant_settings',
      'communication_outbox',
      'resources',
      'work_item_resources',
      'tenant_project_type_overrides',
      'tenant_method_overrides',
      'vendors',
      'vendor_project_assignments',
      'vendor_evaluations',
      'vendor_documents',
      'compliance_tags',
      'work_item_documents',
      'budget_categories',
      'budget_items',
      'budget_postings',
      'vendor_invoices',
      'report_snapshots',
      'role_rates',
      'work_item_cost_lines',
      'dependencies',
      'tenant_ai_keys'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. record_tenant_ai_key_audit — admin-callable, writes one audit row.
-- ---------------------------------------------------------------------------
-- Why a SECURITY DEFINER RPC and not a direct INSERT?
--   * audit_log_entries has SELECT RLS but no INSERT policy. Trigger inserts
--     work because the trigger function is SECURITY DEFINER. We follow the
--     same pattern: a controlled SECURITY DEFINER RPC that admin-gates the
--     insert, and never lets non-admin clients write arbitrary audit rows.
--   * Centralizes the field_name / change_reason convention so 32b/c can
--     extend it for other providers without rewriting each API route.
--
-- Convention:
--   * entity_type   = 'tenant_ai_keys'
--   * entity_id     = tenant_id (anchor; provider is in field_name)
--   * field_name    = '<provider>_key'  (e.g. 'anthropic_key')
--   * change_reason = 'create' | 'rotate' | 'delete' | 'validate'
--   * old_value     = jsonb { fingerprint?: text } | null
--   * new_value     = jsonb { fingerprint?: text } | null
-- ---------------------------------------------------------------------------
create or replace function public.record_tenant_ai_key_audit(
  p_tenant_id        uuid,
  p_provider         text,
  p_action           text,
  p_old_fingerprint  text,
  p_new_fingerprint  text
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

  if p_action not in ('create','rotate','delete','validate') then
    raise exception 'invalid_action: %', p_action
      using errcode = 'P0001';
  end if;

  if p_provider not in ('anthropic') then
    raise exception 'invalid_provider: %', p_provider
      using errcode = 'P0001';
  end if;

  v_actor := auth.uid();

  insert into public.audit_log_entries (
    tenant_id,
    entity_type,
    entity_id,
    field_name,
    old_value,
    new_value,
    actor_user_id,
    change_reason
  )
  values (
    p_tenant_id,
    'tenant_ai_keys',
    p_tenant_id,
    p_provider || '_key',
    case when p_old_fingerprint is null then null
         else jsonb_build_object('fingerprint', p_old_fingerprint) end,
    case when p_new_fingerprint is null then null
         else jsonb_build_object('fingerprint', p_new_fingerprint) end,
    v_actor,
    p_action
  );
end;
$$;

revoke execute on function public.record_tenant_ai_key_audit(
  uuid, text, text, text, text
) from public, anon;
grant execute on function public.record_tenant_ai_key_audit(
  uuid, text, text, text, text
) to authenticated;

comment on function public.record_tenant_ai_key_audit(
  uuid, text, text, text, text
) is
  'PROJ-32a: write one audit_log_entries row for an AI-key admin action. '
  'Admin-gated. Stores fingerprints (never plaintext keys). Action ∈ '
  '{create, rotate, delete, validate}.';

-- ---------------------------------------------------------------------------
-- 3. can_read_audit_entry must allow tenant admins to read tenant_ai_keys
--    audit entries.
-- ---------------------------------------------------------------------------
-- The existing function falls through to is_tenant_admin for unknown
-- entity_types, but only for entries whose tenant the caller administers.
-- That behavior already covers tenant_ai_keys correctly — no change needed.
-- See section 5 of 20260428190000_proj10_audit_log_entries.sql.
