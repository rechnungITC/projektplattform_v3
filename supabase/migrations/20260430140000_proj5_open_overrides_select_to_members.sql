-- =============================================================================
-- PROJ-5 Extensions — open override SELECT to tenant_member
-- =============================================================================
-- The wizard (PROJ-5) needs to know:
--   * which methods are enabled for the tenant (tenant_method_overrides)
--   * which project-type overrides apply (tenant_project_type_overrides)
--
-- Today both tables are admin-only on every operation (PROJ-16). That
-- means non-admin users running the wizard would hit 403 on the GET
-- routes. The right policy split is: WRITES stay admin-only (config
-- changes are an admin concern), READS open to tenant_member (the
-- override is part of the tenant's effective configuration that every
-- member needs to see).
-- =============================================================================

drop policy if exists "tpto_admin_select" on public.tenant_project_type_overrides;
create policy "tpto_member_select"
  on public.tenant_project_type_overrides for select
  using (public.is_tenant_member(tenant_id));

drop policy if exists "tmo_admin_select" on public.tenant_method_overrides;
create policy "tmo_member_select"
  on public.tenant_method_overrides for select
  using (public.is_tenant_member(tenant_id));

-- Note: INSERT, UPDATE, DELETE policies remain admin-only — only the
-- read path was widened.
