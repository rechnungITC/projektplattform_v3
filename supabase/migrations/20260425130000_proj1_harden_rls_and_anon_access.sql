-- =============================================================================
-- PROJ-1 hardening: revoke anon access + optimize RLS auth.uid() calls
-- =============================================================================
-- Follow-up to 20260425120000_proj1_auth_tenants_roles.sql.
-- Triggered by Supabase advisors:
--   * SECURITY: pg_graphql_anon_table_exposed (3x) — anon could see schema
--     names via /graphql/v1 introspection. We use REST (postgrest), not GraphQL.
--   * PERFORMANCE: auth_rls_initplan (3x) — auth.uid() was re-evaluated per row
--     instead of once per query.
-- =============================================================================

-- Section 1: Revoke anon SELECT to remove pg_graphql introspection surface.
revoke select on public.profiles            from anon;
revoke select on public.tenants             from anon;
revoke select on public.tenant_memberships  from anon;

-- Section 2: Re-create profiles policies with `(select auth.uid())` so the
-- planner caches the result once per query.
drop policy if exists profiles_select_self_or_shared_tenant on public.profiles;
drop policy if exists profiles_insert_self                  on public.profiles;
drop policy if exists profiles_update_self                  on public.profiles;

create policy profiles_select_self_or_shared_tenant
  on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.tenant_memberships m1
      join public.tenant_memberships m2
        on m1.tenant_id = m2.tenant_id
      where m1.user_id = (select auth.uid())
        and m2.user_id = profiles.id
    )
  );

create policy profiles_insert_self
  on public.profiles
  for insert
  to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update_self
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
