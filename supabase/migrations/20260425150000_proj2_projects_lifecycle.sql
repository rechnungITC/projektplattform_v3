-- =============================================================================
-- PROJ-2: Project CRUD and Lifecycle State Machine
-- =============================================================================
-- Adds the foundational `projects` entity plus an append-only audit table
-- `project_lifecycle_events`. Builds on PROJ-1 (profiles, tenants,
-- tenant_memberships) and reuses its helper functions for RLS:
--   * is_tenant_member(tenant_id)
--   * has_tenant_role(tenant_id, role)
--   * is_tenant_admin(tenant_id)
--
-- Sequenced after 20260425140000_proj1_fix_handle_new_user_ambiguous.sql.
-- No backfill needed — empty tables on top of an empty schema.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Section 1: Tables
-- -----------------------------------------------------------------------------

-- projects: one row per project, tenant-scoped, with lifecycle status and
-- audit fields. Soft-delete via is_deleted (admins can hard-delete via the
-- DELETE policy below).
create table public.projects (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null,
  name                  text not null,
  description           text,
  project_number        text,
  planned_start_date    date,
  planned_end_date      date,
  responsible_user_id   uuid not null,
  lifecycle_status      text not null default 'draft',
  project_type          text not null default 'general',
  created_by            uuid not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  is_deleted            boolean not null default false,

  -- Named foreign keys: the frontend uses Supabase named-FK shorthand
  -- (`profiles!projects_responsible_user_id_fkey`, etc.) so the constraint
  -- names below are part of the public contract — do not rename.
  constraint projects_tenant_id_fkey
    foreign key (tenant_id)
    references public.tenants(id)
    on delete cascade,

  constraint projects_responsible_user_id_fkey
    foreign key (responsible_user_id)
    references public.profiles(id)
    on delete restrict,

  constraint projects_created_by_fkey
    foreign key (created_by)
    references public.profiles(id)
    on delete restrict,

  -- Enum-as-text + CHECK (per Tech Design G; easier to extend than a
  -- Postgres ENUM, same DB-level safety).
  constraint projects_lifecycle_status_check
    check (lifecycle_status in ('draft', 'active', 'paused', 'completed', 'canceled')),

  constraint projects_project_type_check
    check (project_type in ('erp', 'construction', 'software', 'general'))
);

comment on table public.projects is
  'Tenant-scoped project entity. Soft-delete via is_deleted; hard-delete admin-only.';


-- project_lifecycle_events: append-only audit of every state change. Written
-- exclusively by the SECURITY DEFINER function `transition_project_status`
-- (no INSERT policy for authenticated -> direct INSERTs are denied).
create table public.project_lifecycle_events (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null,
  from_status  text not null,
  to_status    text not null,
  comment      text,
  changed_by   uuid not null,
  changed_at   timestamptz not null default now(),

  constraint project_lifecycle_events_project_id_fkey
    foreign key (project_id)
    references public.projects(id)
    on delete cascade,

  constraint project_lifecycle_events_changed_by_fkey
    foreign key (changed_by)
    references public.profiles(id)
    on delete restrict
);

comment on table public.project_lifecycle_events is
  'Append-only audit log of project lifecycle_status transitions.';


-- -----------------------------------------------------------------------------
-- Section 2: Indexes
-- -----------------------------------------------------------------------------
-- RLS always filters by tenant_id first, so leading the compound indexes with
-- it keeps filtered list pages fast.

create index projects_tenant_id_idx
  on public.projects (tenant_id);

create index projects_tenant_id_lifecycle_status_idx
  on public.projects (tenant_id, lifecycle_status);

create index projects_tenant_id_project_type_idx
  on public.projects (tenant_id, project_type);

create index projects_responsible_user_id_idx
  on public.projects (responsible_user_id);

create index project_lifecycle_events_project_id_changed_at_idx
  on public.project_lifecycle_events (project_id, changed_at desc);


-- -----------------------------------------------------------------------------
-- Section 3: Cross-tenant guard trigger
-- -----------------------------------------------------------------------------
-- responsible_user_id MUST be a member of NEW.tenant_id. Without this, a
-- malicious member could point a project at a profile from another tenant.
-- RLS already prevents writes to projects in other tenants, but it does not
-- constrain the responsible_user_id value itself.

create or replace function public.enforce_project_responsible_user_in_tenant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.tenant_memberships m
    where m.tenant_id = new.tenant_id
      and m.user_id = new.responsible_user_id
  ) then
    raise exception
      'responsible_user_id must be a member of the project tenant'
      using errcode = '22023'; -- invalid_parameter_value
  end if;
  return new;
end;
$$;

comment on function public.enforce_project_responsible_user_in_tenant() is
  'BEFORE INSERT/UPDATE guard: responsible_user_id must belong to the project tenant.';

create trigger projects_responsible_user_in_tenant
  before insert or update of responsible_user_id, tenant_id
  on public.projects
  for each row
  execute function public.enforce_project_responsible_user_in_tenant();


-- -----------------------------------------------------------------------------
-- Section 4: Row Level Security
-- -----------------------------------------------------------------------------
-- Helper functions wrapped in `(select auth.uid())` style is irrelevant here
-- because the helpers are SECURITY DEFINER STABLE — Postgres caches the
-- result per query already. We still wrap raw `auth.uid()` references in
-- `(select auth.uid())` per PROJ-1's hardening pattern; PROJ-2 doesn't use
-- raw auth.uid() in policies (everything goes through helpers).

alter table public.projects                  enable row level security;
alter table public.project_lifecycle_events  enable row level security;

-- ----- projects ----------------------------------------------------------

-- SELECT: any tenant member (admin/member/viewer).
create policy projects_select_members
  on public.projects
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

-- INSERT: admin or member. Viewers blocked.
create policy projects_insert_writers
  on public.projects
  for insert
  to authenticated
  with check (
    public.is_tenant_admin(tenant_id)
    or public.has_tenant_role(tenant_id, 'member')
  );

-- UPDATE: admin or member. Viewers blocked. Tenant pinning is handled by
-- the cross-tenant guard trigger above (UPDATEs that change tenant_id will
-- re-run the membership check against the NEW tenant).
create policy projects_update_writers
  on public.projects
  for update
  to authenticated
  using (
    public.is_tenant_admin(tenant_id)
    or public.has_tenant_role(tenant_id, 'member')
  )
  with check (
    public.is_tenant_admin(tenant_id)
    or public.has_tenant_role(tenant_id, 'member')
  );

-- DELETE: admin only (hard-delete; rare).
create policy projects_delete_admin
  on public.projects
  for delete
  to authenticated
  using (public.is_tenant_admin(tenant_id));


-- ----- project_lifecycle_events ------------------------------------------

-- SELECT: any tenant member of the parent project's tenant.
create policy events_select_members
  on public.project_lifecycle_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.projects p
      where p.id = project_lifecycle_events.project_id
        and public.is_tenant_member(p.tenant_id)
    )
  );

-- No INSERT/UPDATE/DELETE policies => denied for authenticated. Service
-- role bypasses RLS, and the SECURITY DEFINER function below runs as its
-- owner (postgres) which also bypasses RLS — that is the only path that
-- writes events.


-- -----------------------------------------------------------------------------
-- Section 5: transition_project_status
-- -----------------------------------------------------------------------------
-- State-machine + atomic write of the lifecycle event audit row.
-- Returns jsonb (avoids the RETURNS-TABLE shadow bug from PROJ-1's first cut).
--
-- Allowed edges (per Tech Design D):
--   draft     -> active, canceled
--   active    -> paused, completed, canceled
--   paused    -> active, canceled
--   canceled  -> draft, active   (reactivation)
--   completed -> (none — terminal)

create or replace function public.transition_project_status(
  p_project_id uuid,
  p_to_status  text,
  p_comment    text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller       uuid;
  v_tenant       uuid;
  v_from_status  text;
  v_is_deleted   boolean;
begin
  -- 1. Authn
  v_caller := auth.uid();
  if v_caller is null then
    raise exception 'authentication required'
      using errcode = '42501'; -- insufficient_privilege
  end if;

  -- 2. Read current state (use into; raise if not found).
  select tenant_id, lifecycle_status, is_deleted
    into v_tenant, v_from_status, v_is_deleted
  from public.projects
  where id = p_project_id;

  if not found then
    raise exception 'project not found'
      using errcode = '02000'; -- no_data
  end if;

  -- 3. Soft-delete guard.
  if v_is_deleted then
    raise exception 'cannot transition a deleted project; restore first'
      using errcode = '22023'; -- invalid_parameter_value
  end if;

  -- 4. Authz: caller must be admin or member of the project's tenant.
  if not (
    public.has_tenant_role(v_tenant, 'admin')
    or public.has_tenant_role(v_tenant, 'member')
  ) then
    raise exception 'insufficient role to transition project status'
      using errcode = '42501'; -- insufficient_privilege
  end if;

  -- 5. Validate transition against the allowed-edge set.
  case v_from_status
    when 'draft' then
      if p_to_status not in ('active', 'canceled') then
        raise exception 'cannot transition from % to %', v_from_status, p_to_status
          using errcode = '23514'; -- check_violation
      end if;
    when 'active' then
      if p_to_status not in ('paused', 'completed', 'canceled') then
        raise exception 'cannot transition from % to %', v_from_status, p_to_status
          using errcode = '23514';
      end if;
    when 'paused' then
      if p_to_status not in ('active', 'canceled') then
        raise exception 'cannot transition from % to %', v_from_status, p_to_status
          using errcode = '23514';
      end if;
    when 'canceled' then
      if p_to_status not in ('draft', 'active') then
        raise exception 'cannot transition from % to %', v_from_status, p_to_status
          using errcode = '23514';
      end if;
    when 'completed' then
      raise exception 'cannot transition from % to %', v_from_status, p_to_status
        using errcode = '23514';
    else
      raise exception 'unknown lifecycle_status: %', v_from_status
        using errcode = '23514';
  end case;

  -- 6. Atomic update + audit insert (single function = single transaction).
  update public.projects
     set lifecycle_status = p_to_status,
         updated_at       = now()
   where id = p_project_id;

  insert into public.project_lifecycle_events
    (project_id, from_status, to_status, comment, changed_by)
  values
    (p_project_id, v_from_status, p_to_status, p_comment, v_caller);

  return jsonb_build_object(
    'id',               p_project_id,
    'lifecycle_status', p_to_status,
    'from_status',      v_from_status
  );
end;
$$;

comment on function public.transition_project_status(uuid, text, text) is
  'Atomic lifecycle transition: validates edge, updates project, writes audit row.';

-- Normal user operation (not admin setup) — granted to authenticated.
revoke all on function public.transition_project_status(uuid, text, text) from public;
revoke all on function public.transition_project_status(uuid, text, text) from anon;
grant execute on function public.transition_project_status(uuid, text, text) to authenticated;


-- -----------------------------------------------------------------------------
-- Section 6: updated_at maintenance
-- -----------------------------------------------------------------------------
-- moddatetime extension was already created in PROJ-1's migration.

create trigger projects_set_updated_at
  before update on public.projects
  for each row
  execute procedure extensions.moddatetime (updated_at);


-- -----------------------------------------------------------------------------
-- Section 7: anon hardening
-- -----------------------------------------------------------------------------
-- Consistent with PROJ-1's hardening migration: revoke anon SELECT so the
-- pg_graphql introspection endpoint cannot expose schema names. App access
-- is REST + RLS (postgrest), not GraphQL.

revoke select on public.projects                  from anon;
revoke select on public.project_lifecycle_events  from anon;
