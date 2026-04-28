-- =============================================================================
-- PROJ-5: Wizard drafts + type-specific data on projects
-- =============================================================================
-- Applied via Supabase MCP on 2026-04-28. Captured here for repo history.
--
-- New table: project_wizard_drafts — owner-only RLS, tenant-scoped, holds the
-- in-progress wizard answers in a JSONB blob plus three denormalized columns
-- (name, project_type, project_method) for cheap drafts-list rendering.
-- New column: projects.type_specific_data — JSONB sink for Step-4 follow-up
-- answers that don't map to dedicated columns yet (per-type tables, e.g.
-- PROJ-15 ERP details, will later extract data from this column).
-- =============================================================================

-- Section 1: extend projects with type_specific_data (idempotent guard)
alter table public.projects
  add column if not exists type_specific_data jsonb not null default '{}'::jsonb;

-- Section 2: project_wizard_drafts table
create table public.project_wizard_drafts (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  created_by      uuid not null,
  name            text,
  project_type    text,
  project_method  text,
  data            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint pwd_tenant_id_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint pwd_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete cascade,
  constraint pwd_project_type_check check (
    project_type is null
    or project_type in ('erp','construction','software','general')
  ),
  constraint pwd_project_method_check check (
    project_method is null
    or project_method in ('scrum','kanban','safe','waterfall','pmi','prince2','vxt2')
  ),
  constraint pwd_name_length check (name is null or char_length(name) <= 255)
);

create index pwd_tenant_user_idx
  on public.project_wizard_drafts (tenant_id, created_by);
create index pwd_updated_at_idx
  on public.project_wizard_drafts (updated_at desc);

alter table public.project_wizard_drafts enable row level security;

-- Section 3: RLS — owner-only access (creator can read/edit/delete their own
-- drafts; other tenant members never see them, including tenant admins).
-- Spec § "User can list, open, edit, and discard their own drafts".

create policy "wizard_drafts_select_own"
  on public.project_wizard_drafts
  for select
  using (
    created_by = auth.uid()
    and public.is_tenant_member(tenant_id)
  );

create policy "wizard_drafts_insert_own"
  on public.project_wizard_drafts
  for insert
  with check (
    created_by = auth.uid()
    and public.is_tenant_member(tenant_id)
  );

create policy "wizard_drafts_update_own"
  on public.project_wizard_drafts
  for update
  using (
    created_by = auth.uid()
    and public.is_tenant_member(tenant_id)
  )
  with check (
    created_by = auth.uid()
    and public.is_tenant_member(tenant_id)
  );

create policy "wizard_drafts_delete_own"
  on public.project_wizard_drafts
  for delete
  using (
    created_by = auth.uid()
    and public.is_tenant_member(tenant_id)
  );

-- Section 4: moddatetime trigger for updated_at
create trigger pwd_set_updated_at
  before update on public.project_wizard_drafts
  for each row
  execute procedure extensions.moddatetime ('updated_at');
