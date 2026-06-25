-- PROJ-100c — 4-Augen-Prinzip für sensible Vertraulichkeits-Freischaltungen.
-- CIA-Fork B: parallele, muster-spiegelnde Genehmigungs-Tabellen + Primitiven-
-- Sharing mit PROJ-31; KEINE Generalisierung der live decision_*-Engine.
-- Gate sitzt am Kopf der deployten grant_confidentiality_clearance-RPC:
-- Policy aus/fehlt → byte-identischer Bestandspfad (AC-C1); Policy an & Stufe
-- hat enabled-Policy → pending-Request statt Clearance (Tor unverändert, AC-C8).

-- ── 1. Audit entity types (add BEFORE any audit row is written — PROJ-100a-H-1 Lehre) ──
-- Robust apply-time injection: append the two new entity types to whatever the
-- current CHECK list is (survives concurrent additions like dd_streams). Idempotent.
do $$
declare v_def text; v_new text;
begin
  select pg_get_constraintdef(oid) into v_def
  from pg_constraint where conname = 'audit_log_entity_type_check';
  if v_def is null then
    raise exception 'audit_log_entity_type_check not found';
  end if;
  if v_def like '%ma_clearance_grant_requests%' then
    return; -- already applied
  end if;
  -- inject before the ARRAY/ANY/CHECK closing parens
  v_new := replace(
    v_def, '])))',
    ', ''ma_clearance_grant_requests''::text, ''ma_clearance_approval_policies''::text])))'
  );
  if v_new = v_def then
    raise exception 'unexpected audit_log_entity_type_check format: %', v_def;
  end if;
  execute 'alter table public.audit_log_entries drop constraint audit_log_entity_type_check';
  execute 'alter table public.audit_log_entries add constraint audit_log_entity_type_check ' || v_new;
end $$;

-- ── 2. Policy table — one row per (tenant, level). Empty table ⇒ gate off (AC-C3). ──
create table if not exists public.ma_clearance_approval_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  level public.ma_confidentiality_level not null,
  enabled boolean not null default false,
  persons_required integer not null default 1 check (persons_required >= 1 and persons_required <= 10),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, level)
);
alter table public.ma_clearance_approval_policies enable row level security;

-- ── 3. Approver pool — tenant-wide named approvers, optionally per level (null = all). ──
create table if not exists public.ma_clearance_approvers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  level public.ma_confidentiality_level,                 -- null = eligible for all gated levels
  approver_user_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.ma_clearance_approvers enable row level security;
create unique index if not exists ma_clearance_approvers_unique
  on public.ma_clearance_approvers (tenant_id, coalesce(level, 'standard'::public.ma_confidentiality_level), approver_user_id);
create index if not exists ma_clearance_approvers_tenant_idx
  on public.ma_clearance_approvers (tenant_id);

-- ── 4. Grant requests (pending workflow). ──
create table if not exists public.ma_clearance_grant_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,         -- target
  requested_level public.ma_confidentiality_level not null,
  applied_profile_id uuid references public.ma_clearance_profiles(id) on delete set null,
  valid_until timestamptz,
  requested_by uuid not null references public.profiles(id),
  quorum_required integer not null check (quorum_required >= 1),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  granted_clearance_id uuid references public.ma_confidentiality_clearances(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
alter table public.ma_clearance_grant_requests enable row level security;
-- at most one OPEN (pending) request per (project, target, level)
create unique index if not exists ma_clearance_requests_one_pending
  on public.ma_clearance_grant_requests (project_id, user_id, requested_level)
  where status = 'pending';
create index if not exists ma_clearance_requests_project_idx
  on public.ma_clearance_grant_requests (project_id);

-- ── 5. Request approvers (snapshot of eligible approvers per request; SoD enforced). ──
create table if not exists public.ma_clearance_request_approvers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  request_id uuid not null references public.ma_clearance_grant_requests(id) on delete cascade,
  approver_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (request_id, approver_user_id)
);
alter table public.ma_clearance_request_approvers enable row level security;

-- ── 6. Append-only vote/event log (immutable, PROJ-31 pattern). ──
create table if not exists public.ma_clearance_request_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  request_id uuid not null references public.ma_clearance_grant_requests(id) on delete cascade,
  approver_user_id uuid not null references public.profiles(id),
  action text not null check (action in ('approve','reject')),
  created_at timestamptz not null default now(),
  unique (request_id, approver_user_id)                  -- one vote per approver
);
alter table public.ma_clearance_request_events enable row level security;
create index if not exists ma_clearance_events_request_idx
  on public.ma_clearance_request_events (request_id);

create or replace function public.enforce_clearance_event_immutability()
returns trigger language plpgsql as $$
begin
  raise exception 'clearance request events are append-only' using errcode = '42501';
end $$;

drop trigger if exists ma_clearance_event_no_update on public.ma_clearance_request_events;
create trigger ma_clearance_event_no_update
  before update or delete on public.ma_clearance_request_events
  for each row execute function public.enforce_clearance_event_immutability();

-- ── 7. RLS policies ──
-- Policy catalog: tenant members read; tenant admins manage.
drop policy if exists ma_clearance_policies_select on public.ma_clearance_approval_policies;
create policy ma_clearance_policies_select on public.ma_clearance_approval_policies
  for select to authenticated using (public.is_tenant_member(tenant_id));
drop policy if exists ma_clearance_policies_ins on public.ma_clearance_approval_policies;
create policy ma_clearance_policies_ins on public.ma_clearance_approval_policies
  for insert to authenticated with check (public.is_tenant_admin(tenant_id));
drop policy if exists ma_clearance_policies_upd on public.ma_clearance_approval_policies;
create policy ma_clearance_policies_upd on public.ma_clearance_approval_policies
  for update to authenticated using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id));
drop policy if exists ma_clearance_policies_del on public.ma_clearance_approval_policies;
create policy ma_clearance_policies_del on public.ma_clearance_approval_policies
  for delete to authenticated using (public.is_tenant_admin(tenant_id));

-- Approver pool: tenant members read; tenant admins manage.
drop policy if exists ma_clearance_approvers_select on public.ma_clearance_approvers;
create policy ma_clearance_approvers_select on public.ma_clearance_approvers
  for select to authenticated using (public.is_tenant_member(tenant_id));
drop policy if exists ma_clearance_approvers_ins on public.ma_clearance_approvers;
create policy ma_clearance_approvers_ins on public.ma_clearance_approvers
  for insert to authenticated with check (public.is_tenant_admin(tenant_id));
drop policy if exists ma_clearance_approvers_del on public.ma_clearance_approvers;
create policy ma_clearance_approvers_del on public.ma_clearance_approvers
  for delete to authenticated using (public.is_tenant_admin(tenant_id));

-- Requests + approvers + events: project members read (governance transparency);
-- writes happen only via SECURITY DEFINER RPCs (no direct INSERT/UPDATE policy).
drop policy if exists ma_clearance_requests_select on public.ma_clearance_grant_requests;
create policy ma_clearance_requests_select on public.ma_clearance_grant_requests
  for select to authenticated using (public.is_project_member(project_id));
drop policy if exists ma_clearance_req_approvers_select on public.ma_clearance_request_approvers;
create policy ma_clearance_req_approvers_select on public.ma_clearance_request_approvers
  for select to authenticated using (
    exists (select 1 from public.ma_clearance_grant_requests r
            where r.id = request_id and public.is_project_member(r.project_id)));
drop policy if exists ma_clearance_events_select on public.ma_clearance_request_events;
create policy ma_clearance_events_select on public.ma_clearance_request_events
  for select to authenticated using (
    exists (select 1 from public.ma_clearance_grant_requests r
            where r.id = request_id and public.is_project_member(r.project_id)));

-- ── 8. Internal helper: create a pending request + snapshot approvers (SoD). ──
create or replace function public._create_clearance_grant_request(
  p_tenant_id uuid, p_project_id uuid, p_user_id uuid,
  p_level public.ma_confidentiality_level, p_valid_until timestamptz,
  p_profile_id uuid, p_requested_by uuid
) returns uuid
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_quorum integer;
  v_request uuid;
begin
  -- idempotent: reuse an existing open request for the same (project,user,level)
  select id into v_request from public.ma_clearance_grant_requests
   where project_id = p_project_id and user_id = p_user_id
     and requested_level = p_level and status = 'pending';
  if v_request is not null then
    return v_request;
  end if;

  select persons_required into v_quorum
  from public.ma_clearance_approval_policies
  where tenant_id = p_tenant_id and level = p_level and enabled;
  v_quorum := coalesce(v_quorum, 1);

  insert into public.ma_clearance_grant_requests
    (tenant_id, project_id, user_id, requested_level, applied_profile_id, valid_until, requested_by, quorum_required)
  values
    (p_tenant_id, p_project_id, p_user_id, p_level, p_profile_id, p_valid_until, p_requested_by, v_quorum)
  returning id into v_request;

  -- snapshot eligible approvers: tenant pool for this level (or all-levels),
  -- EXCLUDING the requester (separation of duty — AC-C2).
  insert into public.ma_clearance_request_approvers (tenant_id, request_id, approver_user_id)
  select distinct a.tenant_id, v_request, a.approver_user_id
  from public.ma_clearance_approvers a
  where a.tenant_id = p_tenant_id
    and (a.level = p_level or a.level is null)
    and a.approver_user_id <> p_requested_by;

  -- audit: request opened
  insert into public.audit_log_entries
    (tenant_id, entity_type, entity_id, field_name, old_value, new_value, actor_user_id, change_reason)
  values
    (p_tenant_id, 'ma_clearance_grant_requests', v_request, 'status',
     null, to_jsonb('pending'::text), p_requested_by, 'four_eyes_requested');

  return v_request;
end $$;
revoke execute on function public._create_clearance_grant_request(uuid,uuid,uuid,public.ma_confidentiality_level,timestamptz,uuid,uuid) from public, anon, authenticated;

-- ── 9. Internal system-grant: writes the clearance + audit WITHOUT authority check ──
-- (system completing an approved request; final approver need not be admin/lead — AC-C7).
create or replace function public._system_grant_clearance(
  p_tenant_id uuid, p_project_id uuid, p_user_id uuid,
  p_level public.ma_confidentiality_level, p_valid_until timestamptz,
  p_profile_id uuid, p_granted_by uuid
) returns uuid
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare v_row public.ma_confidentiality_clearances;
begin
  insert into public.ma_confidentiality_clearances
    (tenant_id, project_id, user_id, max_level, valid_until, granted_by, applied_profile_id)
  values (p_tenant_id, p_project_id, p_user_id, p_level, p_valid_until, p_granted_by, p_profile_id)
  on conflict (tenant_id, project_id, user_id)
  do update set max_level = excluded.max_level,
                valid_until = excluded.valid_until,
                granted_by = excluded.granted_by,
                applied_profile_id = excluded.applied_profile_id,
                granted_at = now()
  returning * into v_row;

  insert into public.audit_log_entries
    (tenant_id, entity_type, entity_id, field_name, old_value, new_value, actor_user_id, change_reason)
  values
    (p_tenant_id, 'ma_confidentiality_clearances', v_row.id, 'max_level',
     null, to_jsonb(p_level::text), p_granted_by, 'four_eyes_approved');

  return v_row.id;
end $$;
revoke execute on function public._system_grant_clearance(uuid,uuid,uuid,public.ma_confidentiality_level,timestamptz,uuid,uuid) from public, anon, authenticated;

-- ── 10. Public RPC: an approver records approve/reject; quorum → system grant. ──
create or replace function public.record_clearance_approval_response(
  p_request_id uuid, p_action text
) returns public.ma_clearance_grant_requests
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_actor uuid := auth.uid();
  v_req public.ma_clearance_grant_requests;
  v_approves integer;
begin
  if p_action not in ('approve','reject') then
    raise exception 'invalid action' using errcode = '22023';
  end if;

  select * into v_req from public.ma_clearance_grant_requests where id = p_request_id;
  if v_req.id is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'request is not pending' using errcode = '22023';
  end if;

  -- SoD double-guard (AC-C2): the requester can never approve their own request
  if v_actor = v_req.requested_by then
    raise exception 'requester cannot approve own request' using errcode = '42501';
  end if;

  -- authorization: caller must be a named approver on this request
  if not exists (
    select 1 from public.ma_clearance_request_approvers ra
    where ra.request_id = p_request_id and ra.approver_user_id = v_actor
  ) then
    raise exception 'not an eligible approver for this request' using errcode = '42501';
  end if;

  -- record the vote (append-only; unique per approver)
  insert into public.ma_clearance_request_events (tenant_id, request_id, approver_user_id, action)
  values (v_req.tenant_id, p_request_id, v_actor, p_action);

  if p_action = 'reject' then
    update public.ma_clearance_grant_requests
      set status = 'rejected', decided_at = now()
      where id = p_request_id
      returning * into v_req;
    insert into public.audit_log_entries
      (tenant_id, entity_type, entity_id, field_name, old_value, new_value, actor_user_id, change_reason)
    values (v_req.tenant_id, 'ma_clearance_grant_requests', p_request_id, 'status',
            to_jsonb('pending'::text), to_jsonb('rejected'::text), v_actor, 'four_eyes_rejected');
    return v_req;
  end if;

  -- approve: count distinct approvals; on quorum → system grant
  select count(*) into v_approves
  from public.ma_clearance_request_events
  where request_id = p_request_id and action = 'approve';

  if v_approves >= v_req.quorum_required then
    update public.ma_clearance_grant_requests
      set status = 'approved', decided_at = now(),
          granted_clearance_id = public._system_grant_clearance(
            v_req.tenant_id, v_req.project_id, v_req.user_id, v_req.requested_level,
            v_req.valid_until, v_req.applied_profile_id, v_req.requested_by)
      where id = p_request_id
      returning * into v_req;
    insert into public.audit_log_entries
      (tenant_id, entity_type, entity_id, field_name, old_value, new_value, actor_user_id, change_reason)
    values (v_req.tenant_id, 'ma_clearance_grant_requests', p_request_id, 'status',
            to_jsonb('pending'::text), to_jsonb('approved'::text), v_actor, 'four_eyes_approved');
  end if;

  return v_req;
end $$;
revoke execute on function public.record_clearance_approval_response(uuid, text) from public, anon;
grant execute on function public.record_clearance_approval_response(uuid, text) to authenticated;

-- ── 11. Cancel a pending request (requester or tenant-admin/project-lead). ──
create or replace function public.cancel_clearance_grant_request(p_request_id uuid)
returns public.ma_clearance_grant_requests
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare v_actor uuid := auth.uid(); v_req public.ma_clearance_grant_requests;
begin
  select * into v_req from public.ma_clearance_grant_requests where id = p_request_id;
  if v_req.id is null then raise exception 'request not found' using errcode = 'P0002'; end if;
  if v_req.status <> 'pending' then raise exception 'request is not pending' using errcode = '22023'; end if;
  if not (v_actor = v_req.requested_by or public.is_tenant_admin(v_req.tenant_id) or public.is_project_lead(v_req.project_id)) then
    raise exception 'not authorized to cancel' using errcode = '42501';
  end if;
  update public.ma_clearance_grant_requests set status = 'cancelled', decided_at = now()
    where id = p_request_id returning * into v_req;
  insert into public.audit_log_entries
    (tenant_id, entity_type, entity_id, field_name, old_value, new_value, actor_user_id, change_reason)
  values (v_req.tenant_id, 'ma_clearance_grant_requests', p_request_id, 'status',
          to_jsonb('pending'::text), to_jsonb('cancelled'::text), v_actor, 'four_eyes_cancelled');
  return v_req;
end $$;
revoke execute on function public.cancel_clearance_grant_request(uuid) from public, anon;
grant execute on function public.cancel_clearance_grant_request(uuid) to authenticated;

-- ── 12. Gate patch: head of grant_confidentiality_clearance (5-arg). ──
-- Policy aus/fehlt → unveränderter Bestandspfad (AC-C1, byte-identical). Policy an
-- für diese Stufe → pending-Request statt Clearance, return null (AC-C8).
create or replace function public.grant_confidentiality_clearance(
  p_project_id uuid, p_user_id uuid, p_max_level public.ma_confidentiality_level,
  p_valid_until timestamp with time zone default null, p_applied_profile_id uuid default null
) returns public.ma_confidentiality_clearances
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tenant uuid;
  v_row public.ma_confidentiality_clearances;
  v_actor uuid := auth.uid();
begin
  select tenant_id into v_tenant from public.projects where id = p_project_id;
  if v_tenant is null then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  if not (public.is_tenant_admin(v_tenant) or public.is_project_lead(p_project_id)) then
    raise exception 'not authorized to grant clearances' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = v_tenant and m.user_id = p_user_id
  ) then
    raise exception 'target user is not a member of this tenant' using errcode = '42501';
  end if;

  -- PROJ-100c 4-eyes gate: if an enabled approval policy exists for this tenant+level,
  -- route to an approval request instead of granting directly. No enabled policy ⇒
  -- this branch is skipped entirely and the path below is byte-identical to before.
  if exists (
    select 1 from public.ma_clearance_approval_policies pol
    where pol.tenant_id = v_tenant and pol.level = p_max_level and pol.enabled
  ) then
    perform public._create_clearance_grant_request(
      v_tenant, p_project_id, p_user_id, p_max_level, p_valid_until, p_applied_profile_id, v_actor);
    return null;
  end if;

  insert into public.ma_confidentiality_clearances
    (tenant_id, project_id, user_id, max_level, valid_until, granted_by, applied_profile_id)
  values (v_tenant, p_project_id, p_user_id, p_max_level, p_valid_until, v_actor, p_applied_profile_id)
  on conflict (tenant_id, project_id, user_id)
  do update set max_level = excluded.max_level,
                valid_until = excluded.valid_until,
                granted_by = excluded.granted_by,
                applied_profile_id = excluded.applied_profile_id,
                granted_at = now()
  returning * into v_row;

  insert into public.audit_log_entries
    (tenant_id, entity_type, entity_id, field_name, old_value, new_value, actor_user_id, change_reason)
  values
    (v_tenant, 'ma_confidentiality_clearances', v_row.id, 'max_level',
     null, to_jsonb(p_max_level::text), v_actor,
     nullif(current_setting('audit.change_reason', true), ''));

  return v_row;
end;
$function$;
