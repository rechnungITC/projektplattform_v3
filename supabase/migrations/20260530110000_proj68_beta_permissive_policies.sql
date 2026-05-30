-- =============================================================================
-- PROJ-68 β — multiple_permissive_policies consolidation (5 tables, 5 clusters)
-- =============================================================================
-- Each table had two permissive SELECT policies overlapping. For
-- `resource_availabilities`, `vendor_documents`, `vendor_evaluations`,
-- `work_item_documents` the cause is the same: a `_write_*` policy
-- declared as `FOR ALL` instead of `FOR INSERT, UPDATE, DELETE`, which
-- makes PostgreSQL evaluate it on SELECT too (OR-merged with the
-- `_select_*` policy). Splitting it into three command-specific policies
-- with identical USING / WITH CHECK removes the SELECT overlap.
--
-- For `tenant_ai_provider_priority` the cause is different: two
-- intentionally separate SELECT policies (`*_admin_select` +
-- `*_member_select`). Consolidate into one policy with an OR clause.
--
-- Originals captured 2026-05-30 via pg_policies; see PROJ-68 spec § β.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. resource_availabilities — split FOR ALL into 3 command-specific policies
-- ---------------------------------------------------------------------------
drop policy if exists ra_write_editor_or_admin on public.resource_availabilities;

create policy ra_write_editor_or_admin_insert on public.resource_availabilities
  for insert
  with check ((is_tenant_admin(tenant_id) or has_tenant_role(tenant_id, 'editor'::text)));

create policy ra_write_editor_or_admin_update on public.resource_availabilities
  for update
  using ((is_tenant_admin(tenant_id) or has_tenant_role(tenant_id, 'editor'::text)))
  with check ((is_tenant_admin(tenant_id) or has_tenant_role(tenant_id, 'editor'::text)));

create policy ra_write_editor_or_admin_delete on public.resource_availabilities
  for delete
  using ((is_tenant_admin(tenant_id) or has_tenant_role(tenant_id, 'editor'::text)));


-- ---------------------------------------------------------------------------
-- 2. vendor_documents — split FOR ALL into 3 command-specific policies
-- ---------------------------------------------------------------------------
drop policy if exists vd_write_admin_or_editor on public.vendor_documents;

create policy vd_write_admin_or_editor_insert on public.vendor_documents
  for insert
  with check ((is_tenant_admin(tenant_id) or has_tenant_role(tenant_id, 'editor'::text)));

create policy vd_write_admin_or_editor_update on public.vendor_documents
  for update
  using ((is_tenant_admin(tenant_id) or has_tenant_role(tenant_id, 'editor'::text)))
  with check ((is_tenant_admin(tenant_id) or has_tenant_role(tenant_id, 'editor'::text)));

create policy vd_write_admin_or_editor_delete on public.vendor_documents
  for delete
  using ((is_tenant_admin(tenant_id) or has_tenant_role(tenant_id, 'editor'::text)));


-- ---------------------------------------------------------------------------
-- 3. vendor_evaluations — split FOR ALL into 3 command-specific policies
-- ---------------------------------------------------------------------------
drop policy if exists ve_write_admin_or_editor on public.vendor_evaluations;

create policy ve_write_admin_or_editor_insert on public.vendor_evaluations
  for insert
  with check ((is_tenant_admin(tenant_id) or has_tenant_role(tenant_id, 'editor'::text)));

create policy ve_write_admin_or_editor_update on public.vendor_evaluations
  for update
  using ((is_tenant_admin(tenant_id) or has_tenant_role(tenant_id, 'editor'::text)))
  with check ((is_tenant_admin(tenant_id) or has_tenant_role(tenant_id, 'editor'::text)));

create policy ve_write_admin_or_editor_delete on public.vendor_evaluations
  for delete
  using ((is_tenant_admin(tenant_id) or has_tenant_role(tenant_id, 'editor'::text)));


-- ---------------------------------------------------------------------------
-- 4. work_item_documents — split FOR ALL into 3 command-specific policies
-- ---------------------------------------------------------------------------
drop policy if exists wid_write_project_editor_or_lead_or_admin on public.work_item_documents;

create policy wid_write_project_editor_or_lead_or_admin_insert on public.work_item_documents
  for insert
  with check ((exists (
    select 1 from public.work_items wi
    where wi.id = work_item_documents.work_item_id
      and (has_project_role(wi.project_id, 'editor'::text)
        or is_project_lead(wi.project_id)
        or is_tenant_admin(work_item_documents.tenant_id))
  )));

create policy wid_write_project_editor_or_lead_or_admin_update on public.work_item_documents
  for update
  using ((exists (
    select 1 from public.work_items wi
    where wi.id = work_item_documents.work_item_id
      and (has_project_role(wi.project_id, 'editor'::text)
        or is_project_lead(wi.project_id)
        or is_tenant_admin(work_item_documents.tenant_id))
  )))
  with check ((exists (
    select 1 from public.work_items wi
    where wi.id = work_item_documents.work_item_id
      and (has_project_role(wi.project_id, 'editor'::text)
        or is_project_lead(wi.project_id)
        or is_tenant_admin(work_item_documents.tenant_id))
  )));

create policy wid_write_project_editor_or_lead_or_admin_delete on public.work_item_documents
  for delete
  using ((exists (
    select 1 from public.work_items wi
    where wi.id = work_item_documents.work_item_id
      and (has_project_role(wi.project_id, 'editor'::text)
        or is_project_lead(wi.project_id)
        or is_tenant_admin(work_item_documents.tenant_id))
  )));


-- ---------------------------------------------------------------------------
-- 5. tenant_ai_provider_priority — consolidate two SELECT policies into one
-- ---------------------------------------------------------------------------
-- Admin OR Member is logically `is_tenant_member` (admin ∈ member) — but
-- the original kept them separate for readability. Consolidate explicitly
-- with an OR so the lint clears and the behaviour stays identical.
drop policy if exists tenant_ai_provider_priority_admin_select on public.tenant_ai_provider_priority;
drop policy if exists tenant_ai_provider_priority_member_select on public.tenant_ai_provider_priority;

create policy tenant_ai_provider_priority_select on public.tenant_ai_provider_priority
  for select
  using ((is_tenant_admin(tenant_id) or is_tenant_member(tenant_id)));


-- =============================================================================
-- Smoke checks
-- =============================================================================
do $smoke$
declare
  v_overlap int;
  v_split int;
begin
  -- 1. Verify the 4 FOR-ALL policies are gone
  select count(*) into v_overlap
  from pg_policies
  where schemaname = 'public' and cmd = 'ALL'
    and policyname in (
      'ra_write_editor_or_admin',
      'vd_write_admin_or_editor',
      've_write_admin_or_editor',
      'wid_write_project_editor_or_lead_or_admin'
    );
  if v_overlap <> 0 then
    raise exception 'smoke-fail: % FOR-ALL policies still present, expected 0', v_overlap;
  end if;

  -- 2. Verify the new split policies exist (4 tables × 3 commands = 12)
  select count(*) into v_split
  from pg_policies
  where schemaname = 'public'
    and policyname in (
      'ra_write_editor_or_admin_insert','ra_write_editor_or_admin_update','ra_write_editor_or_admin_delete',
      'vd_write_admin_or_editor_insert','vd_write_admin_or_editor_update','vd_write_admin_or_editor_delete',
      've_write_admin_or_editor_insert','ve_write_admin_or_editor_update','ve_write_admin_or_editor_delete',
      'wid_write_project_editor_or_lead_or_admin_insert',
      'wid_write_project_editor_or_lead_or_admin_update',
      'wid_write_project_editor_or_lead_or_admin_delete'
    );
  if v_split <> 12 then
    raise exception 'smoke-fail: expected 12 split policies, found %', v_split;
  end if;

  -- 3. Verify tenant_ai_provider_priority consolidation
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tenant_ai_provider_priority'
      and policyname = 'tenant_ai_provider_priority_select'
  ) then
    raise exception 'smoke-fail: consolidated tenant_ai_provider_priority_select policy missing';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tenant_ai_provider_priority'
      and policyname in (
        'tenant_ai_provider_priority_admin_select',
        'tenant_ai_provider_priority_member_select'
      )
  ) then
    raise exception 'smoke-fail: old split tenant_ai_provider_priority SELECT policies still present';
  end if;

  raise notice 'PROJ-68 beta smoke checks passed (FOR-ALL split + 1 consolidation)';
end
$smoke$;
