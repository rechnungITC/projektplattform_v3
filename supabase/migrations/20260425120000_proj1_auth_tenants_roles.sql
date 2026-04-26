-- =============================================================================
-- PROJ-1: Authentication, Tenants, and Role-Based Membership
-- =============================================================================
-- Foundational identity, tenancy, and authorization layer.
-- Creates: profiles, tenants, tenant_memberships
-- Enforces: RLS on every table, last-admin invariant trigger,
--           SECURITY DEFINER helpers for membership checks,
--           handle_new_user() Postgres function (called by Edge Function).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Section 0: Extensions
-- -----------------------------------------------------------------------------
-- pgcrypto for gen_random_uuid(), moddatetime for updated_at triggers.
create extension if not exists pgcrypto;
create extension if not exists moddatetime schema extensions;


-- -----------------------------------------------------------------------------
-- Section 1: Tables
-- -----------------------------------------------------------------------------

-- profiles: app-side mirror of auth.users. Cascades on user delete.
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  display_name  text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is
  'Application-side user profile. Mirrors auth.users so app tables can FK reference it.';

-- tenants: one row per organization. domain is unique when set (partial index below).
create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  domain      text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.tenants is
  'Organization / workspace. Optional claimed email domain auto-routes future signups.';

-- Partial unique index: enforce uniqueness only when domain is set.
-- Allows multiple tenants with NULL domain (the common case).
create unique index tenants_domain_unique
  on public.tenants (domain)
  where domain is not null;

create index tenants_created_by_idx on public.tenants (created_by);

-- tenant_memberships: links users to tenants with a role.
create table public.tenant_memberships (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null check (role in ('admin', 'member', 'viewer')),
  created_at  timestamptz not null default now(),
  unique (tenant_id, user_id)
);

comment on table public.tenant_memberships is
  'Join table. A user can be in multiple tenants. role enforced via CHECK (extensible).';

create index tenant_memberships_user_id_idx
  on public.tenant_memberships (user_id);
create index tenant_memberships_tenant_id_idx
  on public.tenant_memberships (tenant_id);


-- -----------------------------------------------------------------------------
-- Section 2: Helper functions for RLS policies
-- -----------------------------------------------------------------------------
-- All SECURITY DEFINER + SET search_path so they cannot be hijacked by a
-- malicious search_path. STABLE so the planner can cache within a query.
-- These functions read tenant_memberships directly (bypassing the table's
-- RLS as the function owner) which is what makes them usable inside RLS
-- without recursion.

create or replace function public.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tenant_memberships m
    where m.tenant_id = p_tenant_id
      and m.user_id = auth.uid()
  );
$$;

comment on function public.is_tenant_member(uuid) is
  'True if auth.uid() has any membership in the given tenant.';

create or replace function public.has_tenant_role(p_tenant_id uuid, p_role text)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tenant_memberships m
    where m.tenant_id = p_tenant_id
      and m.user_id = auth.uid()
      and m.role = p_role
  );
$$;

comment on function public.has_tenant_role(uuid, text) is
  'True if auth.uid() has the given role in the given tenant.';

create or replace function public.is_tenant_admin(p_tenant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select public.has_tenant_role(p_tenant_id, 'admin');
$$;

comment on function public.is_tenant_admin(uuid) is
  'Convenience wrapper for has_tenant_role(t, ''admin'').';

-- Authenticated users may invoke these in their own RLS policies.
grant execute on function public.is_tenant_member(uuid) to authenticated;
grant execute on function public.has_tenant_role(uuid, text) to authenticated;
grant execute on function public.is_tenant_admin(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- Section 3: Row Level Security
-- -----------------------------------------------------------------------------

alter table public.profiles            enable row level security;
alter table public.tenants             enable row level security;
alter table public.tenant_memberships  enable row level security;

-- ----- profiles ----------------------------------------------------------
-- SELECT: self OR users you share a tenant with (so member lists work).
create policy profiles_select_self_or_shared_tenant
  on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.tenant_memberships m1
      join public.tenant_memberships m2
        on m1.tenant_id = m2.tenant_id
      where m1.user_id = auth.uid()
        and m2.user_id = profiles.id
    )
  );

-- INSERT: only your own profile row (defense in depth; normally created by
-- handle_new_user via service role).
create policy profiles_insert_self
  on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

-- UPDATE: only your own profile.
create policy profiles_update_self
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- DELETE: no policy => denied. Profiles disappear via auth.users cascade.

-- ----- tenants -----------------------------------------------------------
-- SELECT: members can read.
create policy tenants_select_members
  on public.tenants
  for select
  to authenticated
  using (public.is_tenant_member(id));

-- UPDATE: admins only (rename, claim/clear domain).
create policy tenants_update_admin
  on public.tenants
  for update
  to authenticated
  using (public.is_tenant_admin(id))
  with check (public.is_tenant_admin(id));

-- INSERT and DELETE: no policy => denied. Tenants are only created via
-- handle_new_user (service role) and only deleted via direct DB ops.

-- ----- tenant_memberships ------------------------------------------------
-- SELECT: any member of the same tenant can see the membership list.
create policy tenant_memberships_select_members
  on public.tenant_memberships
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

-- INSERT: admins only (handle_new_user uses service role and bypasses RLS).
create policy tenant_memberships_insert_admin
  on public.tenant_memberships
  for insert
  to authenticated
  with check (public.is_tenant_admin(tenant_id));

-- UPDATE: admins only.
create policy tenant_memberships_update_admin
  on public.tenant_memberships
  for update
  to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

-- DELETE: admins only.
create policy tenant_memberships_delete_admin
  on public.tenant_memberships
  for delete
  to authenticated
  using (public.is_tenant_admin(tenant_id));


-- -----------------------------------------------------------------------------
-- Section 4: Last-admin invariant trigger
-- -----------------------------------------------------------------------------
-- Hard guarantee: a tenant must always have >= 1 admin. Defense in depth
-- alongside the API-layer check (which provides nicer error messages).

create or replace function public.enforce_admin_invariant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  remaining_admins integer;
begin
  if (tg_op = 'UPDATE') then
    -- Only care about UPDATEs that demote an existing admin.
    if old.role = 'admin' and new.role <> 'admin' then
      select count(*)
        into remaining_admins
        from public.tenant_memberships
        where tenant_id = old.tenant_id
          and role = 'admin'
          and id <> old.id;

      if remaining_admins = 0 then
        raise exception 'Tenant must have at least one admin'
          using errcode = 'check_violation';
      end if;
    end if;
    return new;

  elsif (tg_op = 'DELETE') then
    if old.role = 'admin' then
      select count(*)
        into remaining_admins
        from public.tenant_memberships
        where tenant_id = old.tenant_id
          and role = 'admin'
          and id <> old.id;

      if remaining_admins = 0 then
        raise exception 'Tenant must have at least one admin'
          using errcode = 'check_violation';
      end if;
    end if;
    return old;
  end if;

  return null;
end;
$$;

comment on function public.enforce_admin_invariant() is
  'Blocks demoting/deleting the last admin of a tenant. Raises check_violation.';

create trigger tenant_memberships_admin_invariant_update
  before update of role on public.tenant_memberships
  for each row execute function public.enforce_admin_invariant();

create trigger tenant_memberships_admin_invariant_delete
  before delete on public.tenant_memberships
  for each row execute function public.enforce_admin_invariant();


-- -----------------------------------------------------------------------------
-- Section 5: handle_new_user — atomic tenant routing on signup
-- -----------------------------------------------------------------------------
-- Called by the setup-tenant-on-signup Edge Function (which authenticates
-- via the user's JWT and then invokes this RPC with the service role).
-- Performs profile upsert + tenant routing in a single statement context.

create or replace function public.handle_new_user(
  p_user_id            uuid,
  p_email              text,
  p_display_name       text,
  p_invited_to_tenant  uuid,
  p_invited_role       text
)
returns table (tenant_id uuid, role text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id  uuid;
  v_role       text;
  v_domain     text;
begin
  -- 1. Upsert profile. display_name falls back to email's local-part if blank.
  insert into public.profiles (id, email, display_name)
  values (
    p_user_id,
    p_email,
    coalesce(nullif(trim(p_display_name), ''), split_part(p_email, '@', 1))
  )
  on conflict (id) do update
    set email        = excluded.email,
        display_name = coalesce(
          nullif(trim(excluded.display_name), ''),
          public.profiles.display_name
        ),
        updated_at   = now();

  -- 2. Routing
  if p_invited_to_tenant is not null then
    -- Invited path: explicit invite always wins over domain logic.
    if p_invited_role is null
       or p_invited_role not in ('admin', 'member', 'viewer') then
      raise exception 'invalid invited_role: %', p_invited_role
        using errcode = 'invalid_parameter_value';
    end if;

    v_tenant_id := p_invited_to_tenant;
    v_role := p_invited_role;
  else
    -- Self-service path: route by email domain.
    v_domain := lower(split_part(p_email, '@', 2));
    if v_domain = '' then
      raise exception 'cannot derive domain from email: %', p_email
        using errcode = 'invalid_parameter_value';
    end if;

    select t.id into v_tenant_id
    from public.tenants t
    where t.domain = v_domain
    limit 1;

    if v_tenant_id is null then
      -- No claimant: create fresh tenant with this user as admin.
      insert into public.tenants (name, domain, created_by)
      values (v_domain, null, p_user_id)
      returning id into v_tenant_id;

      v_role := 'admin';
    else
      v_role := 'member';
    end if;
  end if;

  -- 3. Insert membership (idempotent: ignore if already there).
  insert into public.tenant_memberships (tenant_id, user_id, role)
  values (v_tenant_id, p_user_id, v_role)
  on conflict (tenant_id, user_id) do nothing;

  -- 4. Return the resolved tenant + role for the caller.
  return query
    select m.tenant_id, m.role
    from public.tenant_memberships m
    where m.tenant_id = v_tenant_id
      and m.user_id = p_user_id;
end;
$$;

comment on function public.handle_new_user(uuid, text, text, uuid, text) is
  'Atomic post-signup setup: upsert profile, route to tenant by invite or domain, create membership.';

-- Only the Edge Function (service role) may call this. Authenticated users
-- must NOT call it directly — it bypasses RLS by design.
revoke all on function public.handle_new_user(uuid, text, text, uuid, text) from public;
revoke all on function public.handle_new_user(uuid, text, text, uuid, text) from authenticated;
revoke all on function public.handle_new_user(uuid, text, text, uuid, text) from anon;
grant execute on function public.handle_new_user(uuid, text, text, uuid, text) to service_role;


-- -----------------------------------------------------------------------------
-- Section 6: updated_at maintenance
-- -----------------------------------------------------------------------------

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute procedure extensions.moddatetime (updated_at);

create trigger tenants_set_updated_at
  before update on public.tenants
  for each row
  execute procedure extensions.moddatetime (updated_at);
