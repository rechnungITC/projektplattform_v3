-- =============================================================================
-- PROJ-65 ε.3e — Risk-Link Audit (F-63) + Per-Project Plan-Mutate Gate (F-64)
-- =============================================================================
-- Two concerns, one slice:
--
--   F-63  Audit-tracking for `risk_links` (created by ε.3c.δ, INSERT/DELETE-only,
--         no UPDATE policy). The PROJ-10 `record_audit_changes` pipeline is
--         UPDATE-only, so we mirror the PROJ-9 dependencies pattern
--         (20260505300200): two tiny SECURITY DEFINER trigger functions that
--         write one row-snapshot audit entry per INSERT/DELETE under
--         field_name='__row__'.
--
--   F-64  Per-project Plan-Mutate kill-switch. CIA-locked architecture
--         (2026-05-27):
--           * Hard AND precedence, default-ON:
--               effective = tenant_settings.trajectory_plan_mutate_enabled
--                           AND coalesce(projects.settings->plan_mutate->>'enabled', 'true')
--             The project flag can only RESTRICT, never expand the tenant master
--             switch (closes the escalation risk R-1).
--           * Stored in projects.settings.plan_mutate.enabled (JSONB), consistent
--             with the existing plan_mutate.snap_to_week key.
--           * BOTH RPCs (plan_mutate_atomic + _bulk) gate on it — the RPC is the
--             real security boundary; the aggregator hint is FE-only.
--           * Dedicated setter RPC (lead/admin only) — NOT a generic projects
--             UPDATE, because projects-UPDATE RLS is editor-open and a kill-switch
--             is a governance decision. Setter writes an explicit audit entry.
--           * snap_to_week stays editor-writable (pure UX) via its own setter.
--
-- The RPC gate is injected via pg_get_functiondef + anchor-replace so the LIVE
-- (smoke-test-hardened) production body is preserved verbatim — no re-authoring
-- of the ~13KB/~15KB function bodies, no drift between repo and prod.
-- =============================================================================


-- =============================================================================
-- PART A — F-63: risk_links INSERT/DELETE row-snapshot audit
-- =============================================================================

-- A.1 — Add 'risk_links' to the entity_type CHECK.
-- NOTE: enumerate the FULL production list (PROJ-1..ε.3b = 44 values) + risk_links.
-- A truncated list silently drops live audit rows for omitted entity types.
alter table public.audit_log_entries
  drop constraint audit_log_entity_type_check;

alter table public.audit_log_entries
  add constraint audit_log_entity_type_check check (
    entity_type = any (array[
      'stakeholders'::text, 'work_items'::text, 'phases'::text,
      'milestones'::text, 'projects'::text, 'risks'::text,
      'decisions'::text, 'open_items'::text, 'tenants'::text,
      'tenant_settings'::text, 'communication_outbox'::text,
      'resources'::text, 'work_item_resources'::text,
      'tenant_project_type_overrides'::text, 'tenant_method_overrides'::text,
      'vendors'::text, 'vendor_project_assignments'::text,
      'vendor_evaluations'::text, 'vendor_documents'::text,
      'compliance_tags'::text, 'work_item_documents'::text,
      'budget_categories'::text, 'budget_items'::text, 'budget_postings'::text,
      'vendor_invoices'::text, 'report_snapshots'::text, 'role_rates'::text,
      'work_item_cost_lines'::text, 'dependencies'::text,
      'tenant_ai_keys'::text, 'tenant_ai_providers'::text,
      'tenant_ai_provider_priority'::text, 'tenant_ai_cost_caps'::text,
      'tenant_memberships'::text, 'organization_units'::text,
      'locations'::text, 'stakeholder_interactions'::text,
      'stakeholder_interaction_participants'::text,
      'organization_imports'::text, 'releases'::text,
      'stakeholder_coaching_recommendations'::text, 'project_goals'::text,
      'sprints'::text,
      -- PROJ-65 ε.3e addition:
      'risk_links'::text
    ])
  );

-- A.2 — INSERT trigger function (row-snapshot under field_name='__row__')
create or replace function public.record_risk_link_insert_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_reason text;
begin
  v_actor := auth.uid();
  v_reason := nullif(current_setting('audit.change_reason', true), '');
  insert into public.audit_log_entries (
    tenant_id, entity_type, entity_id, field_name,
    old_value, new_value, actor_user_id, change_reason
  )
  values (
    NEW.tenant_id, 'risk_links', NEW.id, '__row__',
    null, to_jsonb(NEW), v_actor, coalesce(v_reason, 'insert')
  );
  return NEW;
end;
$$;

revoke execute on function public.record_risk_link_insert_audit() from public;

-- A.3 — DELETE trigger function
create or replace function public.record_risk_link_delete_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_reason text;
begin
  v_actor := auth.uid();
  v_reason := nullif(current_setting('audit.change_reason', true), '');
  insert into public.audit_log_entries (
    tenant_id, entity_type, entity_id, field_name,
    old_value, new_value, actor_user_id, change_reason
  )
  values (
    OLD.tenant_id, 'risk_links', OLD.id, '__row__',
    to_jsonb(OLD), null, v_actor, coalesce(v_reason, 'delete')
  );
  return OLD;
end;
$$;

revoke execute on function public.record_risk_link_delete_audit() from public;

-- A.4 — Wire triggers.
-- IMPORTANT: the cleanup triggers on phases (soft-delete) and sprints (hard-delete)
-- DELETE risk_links rows directly. Those deletes fire audit_risk_links_delete too,
-- producing a row-snapshot per cascaded cleanup — which is the desired audit trail.
drop trigger if exists audit_risk_links_insert on public.risk_links;
create trigger audit_risk_links_insert
  after insert on public.risk_links
  for each row execute function public.record_risk_link_insert_audit();

drop trigger if exists audit_risk_links_delete on public.risk_links;
create trigger audit_risk_links_delete
  after delete on public.risk_links
  for each row execute function public.record_risk_link_delete_audit();


-- =============================================================================
-- PART B — F-64: per-project Plan-Mutate gate + setter RPCs
-- =============================================================================

-- B.1 — Inject the per-project gate into both plan-mutate RPCs.
-- Anchor on the (byte-identical across repo + prod variants) line
--   `v_can_edit := public.is_tenant_admin(v_tenant)`
-- which sits immediately AFTER the tenant master-switch gate. Inserting the
-- project gate before it keeps the tenant check first (tenant=off short-circuits
-- with 'feature_disabled', preserving the master-switch precedence), and the
-- project-disabled case returns 'feature_disabled_project'.
do $inject$
declare
  v_fn text;
  v_def text;
  v_anchor constant text := 'v_can_edit := public.is_tenant_admin(v_tenant)';
  v_gate constant text :=
    'if coalesce((select settings->''plan_mutate''->>''enabled'' from public.projects where id = p_project_id), ''true'') = ''false'' then return jsonb_build_object(''ok'', false, ''status'', 403, ''error'', ''feature_disabled_project''); end if;'
    || E'\n  ' || 'v_can_edit := public.is_tenant_admin(v_tenant)';
begin
  foreach v_fn in array array[
    'public.plan_mutate_atomic(uuid,uuid,text,jsonb,jsonb)',
    'public.plan_mutate_atomic_bulk(uuid,jsonb,jsonb,jsonb)'
  ]
  loop
    v_def := pg_get_functiondef(v_fn::regprocedure);
    if position('feature_disabled_project' in v_def) > 0 then
      raise notice 'PROJ-65 ε.3e: project gate already present in %, skipping', v_fn;
      continue;
    end if;
    if position(v_anchor in v_def) = 0 then
      raise exception 'PROJ-65 ε.3e: anchor not found in % — aborting gate injection', v_fn;
    end if;
    v_def := replace(v_def, v_anchor, v_gate);
    execute v_def;
    raise notice 'PROJ-65 ε.3e: injected per-project plan-mutate gate into %', v_fn;
  end loop;
end
$inject$;

-- B.2 — Setter RPC for the per-project Plan-Mutate kill-switch (lead/admin only).
create or replace function public.set_project_plan_mutate_enabled(
  p_project_id uuid,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_actor uuid;
  v_old_raw text;
  v_old boolean;
begin
  v_actor := auth.uid();
  if v_actor is null then
    return jsonb_build_object('ok', false, 'status', 401, 'error', 'unauthorized');
  end if;
  select tenant_id, settings->'plan_mutate'->>'enabled'
    into v_tenant, v_old_raw
    from public.projects where id = p_project_id;
  if v_tenant is null then
    return jsonb_build_object('ok', false, 'status', 404, 'error', 'project_not_found');
  end if;
  -- CIA F-4: kill-switch is a governance decision → lead/admin only, NOT editor.
  if not (public.is_tenant_admin(v_tenant)
          or public.has_project_role(p_project_id, 'lead')) then
    return jsonb_build_object('ok', false, 'status', 403, 'error', 'forbidden');
  end if;

  v_old := coalesce(v_old_raw, 'true') <> 'false';  -- effective old (default ON)

  update public.projects
     set settings = jsonb_set(
           coalesce(settings, '{}'::jsonb)
             || jsonb_build_object('plan_mutate',
                  coalesce(settings -> 'plan_mutate', '{}'::jsonb)),
           '{plan_mutate,enabled}', to_jsonb(p_enabled), true)
   where id = p_project_id;

  -- CIA R-2: explicit audit entry for the governance-relevant config change.
  if v_old is distinct from p_enabled then
    insert into public.audit_log_entries (
      tenant_id, entity_type, entity_id, field_name,
      old_value, new_value, actor_user_id, change_reason
    ) values (
      v_tenant, 'projects', p_project_id, 'plan_mutate.enabled',
      to_jsonb(v_old), to_jsonb(p_enabled), v_actor, 'plan_mutate_enabled_toggle'
    );
  end if;

  return jsonb_build_object('ok', true, 'enabled', p_enabled);
end;
$$;

revoke execute on function public.set_project_plan_mutate_enabled(uuid, boolean) from public, anon;
grant execute on function public.set_project_plan_mutate_enabled(uuid, boolean) to authenticated;

-- B.3 — Setter RPC for snap_to_week (pure UX → editor/lead/admin, no audit).
create or replace function public.set_project_snap_to_week(
  p_project_id uuid,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_actor uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    return jsonb_build_object('ok', false, 'status', 401, 'error', 'unauthorized');
  end if;
  select tenant_id into v_tenant from public.projects where id = p_project_id;
  if v_tenant is null then
    return jsonb_build_object('ok', false, 'status', 404, 'error', 'project_not_found');
  end if;
  if not (public.is_tenant_admin(v_tenant)
          or public.has_project_role(p_project_id, 'lead')
          or public.has_project_role(p_project_id, 'editor')) then
    return jsonb_build_object('ok', false, 'status', 403, 'error', 'forbidden');
  end if;

  update public.projects
     set settings = jsonb_set(
           coalesce(settings, '{}'::jsonb)
             || jsonb_build_object('plan_mutate',
                  coalesce(settings -> 'plan_mutate', '{}'::jsonb)),
           '{plan_mutate,snap_to_week}', to_jsonb(p_enabled), true)
   where id = p_project_id;

  return jsonb_build_object('ok', true, 'snap_to_week', p_enabled);
end;
$$;

revoke execute on function public.set_project_snap_to_week(uuid, boolean) from public, anon;
grant execute on function public.set_project_snap_to_week(uuid, boolean) to authenticated;


-- =============================================================================
-- PART C — static smoke checks (no data mutation; safe for prod apply)
-- =============================================================================
do $smoke$
declare
  v_count int;
begin
  -- C.1 entity_type CHECK accepts 'risk_links'
  perform 1 from pg_constraint
    where conname = 'audit_log_entity_type_check'
      and pg_get_constraintdef(oid) like '%risk_links%';
  if not found then
    raise exception 'smoke-fail: audit_log_entity_type_check does not include risk_links';
  end if;

  -- C.2 risk_links audit triggers present
  select count(*) into v_count from pg_trigger
    where tgrelid = 'public.risk_links'::regclass
      and tgname in ('audit_risk_links_insert', 'audit_risk_links_delete')
      and not tgisinternal;
  if v_count <> 2 then
    raise exception 'smoke-fail: expected 2 risk_links audit triggers, found %', v_count;
  end if;

  -- C.3 per-project gate injected into both RPCs
  perform 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'plan_mutate_atomic'
      and position('feature_disabled_project' in p.prosrc) > 0;
  if not found then
    raise exception 'smoke-fail: plan_mutate_atomic missing per-project gate';
  end if;
  perform 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'plan_mutate_atomic_bulk'
      and position('feature_disabled_project' in p.prosrc) > 0;
  if not found then
    raise exception 'smoke-fail: plan_mutate_atomic_bulk missing per-project gate';
  end if;

  -- C.4 setter RPCs present
  perform 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_project_plan_mutate_enabled';
  if not found then
    raise exception 'smoke-fail: set_project_plan_mutate_enabled missing';
  end if;
  perform 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_project_snap_to_week';
  if not found then
    raise exception 'smoke-fail: set_project_snap_to_week missing';
  end if;

  raise notice 'PROJ-65 ε.3e smoke checks passed';
end
$smoke$;
