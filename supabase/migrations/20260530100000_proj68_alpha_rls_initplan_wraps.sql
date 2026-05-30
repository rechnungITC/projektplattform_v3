-- =============================================================================
-- PROJ-68 α — RLS auth_rls_initplan wraps (12 policies, 5 tables)
-- =============================================================================
-- Each policy below uses `auth.uid()` directly in USING / WITH CHECK. Per
-- Supabase's database-linter rule `auth_rls_initplan`, that re-evaluates
-- the function per-row for every query that hits the policy. Wrapping it
-- in a SELECT subquery (`(select auth.uid())`) makes PostgreSQL evaluate
-- it once per query via the init-plan instead.
--
-- Drop + recreate each policy with **identical USING / WITH CHECK** logic,
-- only swapping `auth.uid()` for `(select auth.uid())`. Behaviour is
-- byte-for-byte the same; this is a pure performance fix.
--
-- Originals captured 2026-05-30 via pg_policies; see PROJ-68 spec for the
-- captured-USING/WITH-CHECK table.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. project_wizard_drafts (4 policies)
-- ---------------------------------------------------------------------------
drop policy if exists wizard_drafts_select_own on public.project_wizard_drafts;
create policy wizard_drafts_select_own on public.project_wizard_drafts
  for select
  using (((created_by = (select auth.uid())) and is_tenant_member(tenant_id)));

drop policy if exists wizard_drafts_insert_own on public.project_wizard_drafts;
create policy wizard_drafts_insert_own on public.project_wizard_drafts
  for insert
  with check (((created_by = (select auth.uid())) and is_tenant_member(tenant_id)));

drop policy if exists wizard_drafts_update_own on public.project_wizard_drafts;
create policy wizard_drafts_update_own on public.project_wizard_drafts
  for update
  using (((created_by = (select auth.uid())) and is_tenant_member(tenant_id)))
  with check (((created_by = (select auth.uid())) and is_tenant_member(tenant_id)));

drop policy if exists wizard_drafts_delete_own on public.project_wizard_drafts;
create policy wizard_drafts_delete_own on public.project_wizard_drafts
  for delete
  using (((created_by = (select auth.uid())) and is_tenant_member(tenant_id)));


-- ---------------------------------------------------------------------------
-- 2. assistant_action_events (2 policies)
-- ---------------------------------------------------------------------------
drop policy if exists assistant_action_events_select_own on public.assistant_action_events;
create policy assistant_action_events_select_own on public.assistant_action_events
  for select
  using (((user_id = (select auth.uid())) and is_tenant_member(tenant_id)));

drop policy if exists assistant_action_events_insert_own on public.assistant_action_events;
create policy assistant_action_events_insert_own on public.assistant_action_events
  for insert
  with check (((user_id = (select auth.uid())) and is_tenant_member(tenant_id)));


-- ---------------------------------------------------------------------------
-- 3. context_sources (1 policy)
-- ---------------------------------------------------------------------------
drop policy if exists context_sources_insert_member on public.context_sources;
create policy context_sources_insert_member on public.context_sources
  for insert
  with check ((is_tenant_member(tenant_id) and (created_by = (select auth.uid()))));


-- ---------------------------------------------------------------------------
-- 4. assistant_sessions (3 policies)
-- ---------------------------------------------------------------------------
drop policy if exists assistant_sessions_select_own on public.assistant_sessions;
create policy assistant_sessions_select_own on public.assistant_sessions
  for select
  using (((user_id = (select auth.uid())) and is_tenant_member(tenant_id)));

drop policy if exists assistant_sessions_insert_own on public.assistant_sessions;
create policy assistant_sessions_insert_own on public.assistant_sessions
  for insert
  with check (((user_id = (select auth.uid())) and is_tenant_member(tenant_id)));

drop policy if exists assistant_sessions_update_own on public.assistant_sessions;
create policy assistant_sessions_update_own on public.assistant_sessions
  for update
  using (((user_id = (select auth.uid())) and is_tenant_member(tenant_id)))
  with check (((user_id = (select auth.uid())) and is_tenant_member(tenant_id)));


-- ---------------------------------------------------------------------------
-- 5. assistant_turns (2 policies)
-- ---------------------------------------------------------------------------
drop policy if exists assistant_turns_select_own on public.assistant_turns;
create policy assistant_turns_select_own on public.assistant_turns
  for select
  using (((user_id = (select auth.uid())) and is_tenant_member(tenant_id)));

drop policy if exists assistant_turns_insert_own on public.assistant_turns;
create policy assistant_turns_insert_own on public.assistant_turns
  for insert
  with check (((user_id = (select auth.uid())) and is_tenant_member(tenant_id)));


-- =============================================================================
-- Smoke checks (static — assert all 12 policies still exist after recreate)
-- =============================================================================
do $smoke$
declare
  v_count int;
begin
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public'
    and (
      (tablename = 'project_wizard_drafts' and policyname in (
        'wizard_drafts_delete_own','wizard_drafts_insert_own',
        'wizard_drafts_select_own','wizard_drafts_update_own'))
      or (tablename = 'assistant_action_events' and policyname in (
        'assistant_action_events_insert_own','assistant_action_events_select_own'))
      or (tablename = 'context_sources' and policyname = 'context_sources_insert_member')
      or (tablename = 'assistant_sessions' and policyname in (
        'assistant_sessions_insert_own','assistant_sessions_select_own',
        'assistant_sessions_update_own'))
      or (tablename = 'assistant_turns' and policyname in (
        'assistant_turns_insert_own','assistant_turns_select_own'))
    );
  if v_count <> 12 then
    raise exception 'smoke-fail: expected 12 wrapped policies, found %', v_count;
  end if;
  raise notice 'PROJ-68 alpha smoke checks passed (12 policies wrapped)';
end
$smoke$;
