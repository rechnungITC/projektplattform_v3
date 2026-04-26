-- =============================================================================
-- PROJ-4: project_memberships table + project-level RLS helpers + last-lead
-- trigger + cross-tenant guard. Tightens PROJ-2's projects.UPDATE policy and
-- transition_project_status to require admin OR project_lead/editor.
-- =============================================================================

-- Section 1: Table
create table public.project_memberships (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null,
  user_id     uuid not null,
  role        text not null,
  created_by  uuid not null,
  created_at  timestamptz not null default now(),
  constraint project_memberships_project_id_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint project_memberships_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete restrict,
  constraint project_memberships_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint project_memberships_role_check
    check (role in ('lead', 'editor', 'viewer')),
  constraint project_memberships_unique_member
    unique (project_id, user_id)
);

create index project_memberships_project_id_idx on public.project_memberships (project_id);
create index project_memberships_user_id_idx on public.project_memberships (user_id);

-- Section 2: Helpers (admin-equivalence baked in — tenant_admin ≡ project_lead)
create or replace function public.is_project_member(p_project_id uuid)
returns boolean language sql security definer stable
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.projects p
    where p.id = p_project_id and public.is_tenant_admin(p.tenant_id))
  or exists (select 1 from public.project_memberships m
    where m.project_id = p_project_id and m.user_id = (select auth.uid()));
$$;

create or replace function public.has_project_role(p_project_id uuid, p_role text)
returns boolean language sql security definer stable
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.projects p
    where p.id = p_project_id and public.is_tenant_admin(p.tenant_id))
  or exists (select 1 from public.project_memberships m
    where m.project_id = p_project_id and m.user_id = (select auth.uid()) and m.role = p_role);
$$;

create or replace function public.is_project_lead(p_project_id uuid)
returns boolean language sql security definer stable
set search_path = public, pg_temp
as $$ select public.has_project_role(p_project_id, 'lead'); $$;

grant execute on function public.is_project_member(uuid) to authenticated;
grant execute on function public.has_project_role(uuid, text) to authenticated;
grant execute on function public.is_project_lead(uuid) to authenticated;

-- Section 3 + 4: cross-tenant guard + last-lead invariant triggers
-- (see migration applied to project iqerihohwabyjzkpcujq for full bodies)

-- Section 5: RLS policies on project_memberships
alter table public.project_memberships enable row level security;

create policy project_memberships_select_members on public.project_memberships for select to authenticated
  using (exists (select 1 from public.projects p
    where p.id = project_memberships.project_id and public.is_tenant_member(p.tenant_id)));

create policy project_memberships_insert_admin_or_lead on public.project_memberships for insert to authenticated
  with check (exists (select 1 from public.projects p
    where p.id = project_memberships.project_id
      and (public.is_tenant_admin(p.tenant_id) or public.is_project_lead(p.id))));

create policy project_memberships_update_admin_or_lead on public.project_memberships for update to authenticated
  using (exists (select 1 from public.projects p
    where p.id = project_memberships.project_id
      and (public.is_tenant_admin(p.tenant_id) or public.is_project_lead(p.id))))
  with check (exists (select 1 from public.projects p
    where p.id = project_memberships.project_id
      and (public.is_tenant_admin(p.tenant_id) or public.is_project_lead(p.id))));

create policy project_memberships_delete_admin_or_lead on public.project_memberships for delete to authenticated
  using (exists (select 1 from public.projects p
    where p.id = project_memberships.project_id
      and (public.is_tenant_admin(p.tenant_id) or public.is_project_lead(p.id))));

-- Section 6: anon hardening
revoke select on public.project_memberships from anon;

-- Section 7: Backfill — every existing project gets responsible_user as lead
insert into public.project_memberships (project_id, user_id, role, created_by)
select id, responsible_user_id, 'lead', responsible_user_id from public.projects;

-- Section 8: PROJ-2 RLS update — admin OR project_lead OR project_editor for UPDATE
drop policy if exists projects_update_writers on public.projects;
create policy projects_update_writers on public.projects for update to authenticated
  using (public.is_tenant_admin(tenant_id) or public.has_project_role(id, 'lead') or public.has_project_role(id, 'editor'))
  with check (public.is_tenant_admin(tenant_id) or public.has_project_role(id, 'lead') or public.has_project_role(id, 'editor'));

-- Section 9: transition_project_status tightened — admin OR project_lead only
-- (full function body re-applied; see migration in DB for verbatim source)
