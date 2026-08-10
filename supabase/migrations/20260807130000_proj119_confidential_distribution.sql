-- PROJ-119 — Vertraulichkeitsgesteuerte Verteilung von Kommunikation.
-- EXTEND on PROJ-118 (communication_matrix_entries). CIA-reviewed, 5 forks locked.
--
-- Delivers what PROJ-118 does NOT have yet:
--   * Inner Circle  — a named person list that OVERRIDES the tenant-admin bypass
--     (Fork 1). Opt-in per entry; without the flag behaviour is byte-identical
--     to today. Break-glass for admins is `dissolve_inner_circle` — a LOUD
--     (audited + access-logged) dissolve, never a silent read.
--   * Embargo       — `embargo_at timestamptz` (NOT date: signing embargoes are
--     hour-precise and cross-timezone). Hard block in mark_communication_sent,
--     deliberately NO override path (the legitimate route is changing the
--     embargo, which is field-level audit-tracked).
--   * Access log    — append-only `communication_access_log`. RLS SELECT policies
--     must be side-effect free, so read access cannot be trigger-logged; the log
--     is written by an explicit SECURITY DEFINER RPC from the app layer.
--
-- Fork 2: the inner-circle gate is a SECOND, ADDITIVE RESTRICTIVE SELECT policy
-- on communication_matrix_entries ONLY. `can_access_classified` is NOT touched
-- (product-wide, 15+ tables) — PROJ-100a/100b/118 pentests must stay byte-
-- identically green, which is a blocking acceptance criterion (H6).
--
-- Also closes two pre-existing PROJ-118 defects found during architecture and
-- confirmed live in production:
--   B1  the write path checked authority against 'standard' instead of the
--       entry's STORED confidentiality level (delete_/mark_sent hardcoded,
--       update_ coalesced, submit_/respond_ checked no clearance at all), so a
--       project lead WITHOUT clearance could mutate and dispatch a `strict`
--       entry. Closed by the new `_comm_entry_guard`.
--   B2  handled in the API layer (list response no longer ships `message` for
--       inner-circle rows) — see communication-entries/_schema.ts.
--
-- Audit: `_tracked_audit_columns` is patched by ANCHOR-REPLACE from the LIVE
-- definition (never a hardcoded full body) so branches added by parallel slices
-- survive, followed by a mandatory re-GRANT. `can_read_audit_entry` and
-- `audit_log_entity_type_check` are deliberately NOT touched —
-- `communication_matrix_entries` is already registered in both, and recreating
-- them risks dropping the authenticated grant (PROJ-114 incident).
-- No new dependency. moddatetime is schema-qualified (extensions.moddatetime).

-- ==========================================================================
-- 1) New columns on the existing entries table
-- ==========================================================================
alter table public.communication_matrix_entries
  add column if not exists is_inner_circle boolean not null default false;
alter table public.communication_matrix_entries
  add column if not exists embargo_at timestamptz;

comment on column public.communication_matrix_entries.is_inner_circle is
  'PROJ-119 AC3 — when true, visibility is restricted to the explicitly named '
  'users in communication_entry_inner_circle, independent of project role and '
  'INCLUDING tenant admins. Opt-in; false keeps PROJ-118 behaviour.';
comment on column public.communication_matrix_entries.embargo_at is
  'PROJ-119 AC4 — timestamptz embargo. approved -> sent is hard-blocked until '
  'now() >= embargo_at. No override path by design.';

-- ==========================================================================
-- 2) Inner-circle membership
-- ==========================================================================
create table if not exists public.communication_entry_inner_circle (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  entry_id    uuid not null references public.communication_matrix_entries(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  added_by    uuid,
  created_at  timestamptz not null default now(),
  unique (entry_id, user_id)
);
create index if not exists idx_comm_inner_circle_entry
  on public.communication_entry_inner_circle (entry_id, user_id);
alter table public.communication_entry_inner_circle enable row level security;

-- ==========================================================================
-- 3) Access log (append-only; also carries inner-circle governance events so
--    that the shared audit_log_entity_type_check does NOT have to be widened)
-- ==========================================================================
create table if not exists public.communication_access_log (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  -- Deliberately NO foreign key: a forensic log must survive deletion of the
  -- entry it describes. Mirrors audit_log_entries.entity_id.
  entry_id    uuid not null,
  user_id     uuid not null,
  action      text not null check (action in (
                'view_content','export','print_view','dissolve',
                'circle_enabled','circle_disabled','member_added','member_removed',
                'embargo_blocked')),
  outcome     text not null check (outcome in ('granted','denied')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_comm_access_log_entry
  on public.communication_access_log (entry_id, created_at desc);
create index if not exists idx_comm_access_log_project
  on public.communication_access_log (project_id, created_at desc);
alter table public.communication_access_log enable row level security;

comment on table public.communication_access_log is
  'PROJ-119 AC2/DoD — append-only access + inner-circle governance log. Written '
  'ONLY via log_communication_access (SECURITY DEFINER). No INSERT/UPDATE/DELETE '
  'policy exists, so direct DML by authenticated users is denied by RLS.';

-- ==========================================================================
-- 4) Helpers
--    Both are SECURITY DEFINER so that the policies below do not recurse into
--    the RLS of the tables they inspect.
-- ==========================================================================

-- Used by the RESTRICTIVE policy on the entries table. Must NOT read the
-- entries table (that would recurse).
create or replace function public._comm_in_inner_circle(p_entry_id uuid)
 returns boolean language sql stable security definer set search_path to 'public','pg_temp'
as $function$
  select exists (
    select 1 from public.communication_entry_inner_circle m
    where m.entry_id = p_entry_id and m.user_id = (select auth.uid())
  );
$function$;
revoke all on function public._comm_in_inner_circle(uuid) from public;
revoke all on function public._comm_in_inner_circle(uuid) from anon;
grant execute on function public._comm_in_inner_circle(uuid) to authenticated;

-- Full visibility predicate for an entry, re-implementing exactly what the
-- three SELECT policies on communication_matrix_entries decide (project
-- membership AND need-to-know AND inner circle). Used to gate the two NEW
-- tables so they cannot become a side channel that leaks the existence of an
-- entry the caller may not see (H2 aggregate-leak).
create or replace function public._comm_entry_visible(p_entry_id uuid)
 returns boolean language plpgsql stable security definer set search_path to 'public','pg_temp'
as $function$
declare
  v_project uuid; v_level public.ma_confidentiality_level; v_inner boolean;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return false; end if;
  select project_id, confidentiality_level, is_inner_circle
    into v_project, v_level, v_inner
    from public.communication_matrix_entries where id = p_entry_id;
  if v_project is null then return false; end if;
  if not public.is_project_member(v_project) then return false; end if;
  if not public.can_access_classified(v_project, v_level) then return false; end if;
  if v_inner and not exists (
       select 1 from public.communication_entry_inner_circle m
       where m.entry_id = p_entry_id and m.user_id = v_uid) then
    return false;
  end if;
  return true;
end;
$function$;
revoke all on function public._comm_entry_visible(uuid) from public;
revoke all on function public._comm_entry_visible(uuid) from anon;
grant execute on function public._comm_entry_visible(uuid) to authenticated;

-- ==========================================================================
-- 5) Policies
-- ==========================================================================

-- Second RESTRICTIVE gate on the entries table. Postgres ANDs restrictive
-- policies, so this is strictly an ADDITIONAL hurdle on top of the PROJ-118
-- need-to-know gate. NOTE the deliberate absence of an is_tenant_admin branch:
-- the inner circle overrides the admin bypass (Fork 1).
drop policy if exists comm_entries_inner_circle_gate on public.communication_matrix_entries;
create policy comm_entries_inner_circle_gate on public.communication_matrix_entries
  as restrictive for select
  using (not is_inner_circle or public._comm_in_inner_circle(id));

drop policy if exists comm_inner_circle_select on public.communication_entry_inner_circle;
create policy comm_inner_circle_select on public.communication_entry_inner_circle
  for select using (public._comm_entry_visible(entry_id));

drop policy if exists comm_access_log_select on public.communication_access_log;
create policy comm_access_log_select on public.communication_access_log
  for select using (public._comm_entry_visible(entry_id));

-- ==========================================================================
-- 6) Audit wiring — ANCHOR-REPLACE from the LIVE definition + mandatory
--    re-GRANT. Fails loudly if the anchor is missing rather than silently
--    leaving the new columns untracked.
-- ==========================================================================
do $patch$
declare
  v_def  text;
  v_from text := 'when ''communication_matrix_entries'' then array[''target_group_key'',''channel'',''planned_date'',''actual_date'',''responsible_user_id'',''approver_user_id'',''approval_status'',''approved_at'',''confidentiality_level'',''phase_id'',''stage_gate_id'',''work_item_id'',''sort_order'']';
  v_to   text := 'when ''communication_matrix_entries'' then array[''target_group_key'',''channel'',''planned_date'',''actual_date'',''responsible_user_id'',''approver_user_id'',''approval_status'',''approved_at'',''confidentiality_level'',''phase_id'',''stage_gate_id'',''work_item_id'',''sort_order'',''is_inner_circle'',''embargo_at'']';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = '_tracked_audit_columns';

  if v_def is null then
    raise exception 'PROJ-119: _tracked_audit_columns not found';
  end if;

  -- Idempotent: skip when a previous run already patched this branch.
  if position('''is_inner_circle''' in v_def) = 0 then
    if position(v_from in v_def) = 0 then
      raise exception 'PROJ-119: anchor for communication_matrix_entries not found in live _tracked_audit_columns — refusing to guess';
    end if;
    execute replace(v_def, v_from, v_to);
  end if;

  -- A recreate drops grants; restoring them is mandatory (PROJ-114 incident:
  -- losing this silently breaks the PROJ-10 history tab).
  execute 'grant execute on function public._tracked_audit_columns(text) to authenticated';
end
$patch$;

-- ==========================================================================
-- 7) B1 fix — one guard, used by every entry-scoped write RPC.
--    Checks against the entry's STORED confidentiality level and the inner
--    circle. SECURITY DEFINER (so it can read the row past RLS) which is
--    exactly why the predicate has to be re-stated here explicitly.
-- ==========================================================================
create or replace function public._comm_entry_guard(
  p_entry_id uuid,
  p_require_manager boolean default true,
  out o_tenant uuid, out o_project uuid, out o_level public.ma_confidentiality_level,
  out o_inner boolean, out o_status text, out o_responsible uuid, out o_approver uuid,
  out o_embargo_at timestamptz)
 language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_caller uuid := auth.uid();
begin
  if v_caller is null then raise exception 'authentication required' using errcode='42501'; end if;

  select tenant_id, project_id, confidentiality_level, is_inner_circle,
         approval_status, responsible_user_id, approver_user_id, embargo_at
    into o_tenant, o_project, o_level, o_inner, o_status, o_responsible, o_approver, o_embargo_at
    from public.communication_matrix_entries where id = p_entry_id;
  if o_project is null then raise exception 'entry not found' using errcode='P0002'; end if;

  if p_require_manager
     and not (public.is_tenant_admin(o_tenant) or public.is_project_lead(o_project)) then
    raise exception 'insufficient role for communication matrix' using errcode='42501';
  end if;

  -- B1: against the STORED level, never a hardcoded 'standard'.
  if not public.can_access_classified(o_project, o_level) then
    raise exception 'insufficient clearance' using errcode='42501';
  end if;

  -- AC3: applies to EVERYONE, tenant admins included.
  if o_inner and not exists (
       select 1 from public.communication_entry_inner_circle m
       where m.entry_id = p_entry_id and m.user_id = v_caller) then
    raise exception 'entry is restricted to its inner circle' using errcode='42501';
  end if;
end;
$function$;
revoke all on function public._comm_entry_guard(uuid, boolean) from public;
revoke all on function public._comm_entry_guard(uuid, boolean) from anon;
-- Supabase default privileges grant EXECUTE on every new public function to
-- `authenticated`, so revoking PUBLIC/anon alone would still leave this
-- INTERNAL helper callable on /rest/v1/rpc/ — and its `p_require_manager`
-- argument is caller-controlled. Every caller is a SECURITY DEFINER function
-- owned by postgres, so this revoke is safe.
revoke execute on function public._comm_entry_guard(uuid, boolean) from authenticated;

-- ---- recreate the five entry-scoped RPCs on top of the guard --------------
-- Signatures are unchanged (create or replace), so no overload ambiguity and
-- no API contract change.

create or replace function public.update_communication_entry(
  p_entry_id uuid, p_target_group_key text default null, p_message text default null, p_channel text default null,
  p_planned_date date default null, p_responsible_user_id uuid default null, p_approver_user_id uuid default null,
  p_confidentiality_level public.ma_confidentiality_level default null, p_target_group_label text default null,
  p_phase_id uuid default null, p_stage_gate_id uuid default null, p_work_item_id uuid default null)
 returns public.communication_matrix_entries language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare g record; v_row public.communication_matrix_entries;
begin
  select * into g from public._comm_entry_guard(p_entry_id, true);
  if g.o_status = 'sent' then raise exception 'sent entries are immutable' using errcode='23514'; end if;
  -- Raising the level also requires clearance for the TARGET level.
  if p_confidentiality_level is not null
     and not public.can_access_classified(g.o_project, p_confidentiality_level) then
    raise exception 'insufficient clearance for the target confidentiality level' using errcode='42501';
  end if;
  perform public._comm_validate_links(g.o_project, p_phase_id, p_stage_gate_id, p_work_item_id, null, g.o_tenant);
  update public.communication_matrix_entries set
    target_group_key = coalesce(nullif(btrim(p_target_group_key),''), target_group_key),
    target_group_label = coalesce(p_target_group_label, target_group_label),
    message = coalesce(p_message, message),
    channel = coalesce(p_channel, channel),
    planned_date = coalesce(p_planned_date, planned_date),
    responsible_user_id = coalesce(p_responsible_user_id, responsible_user_id),
    approver_user_id = coalesce(p_approver_user_id, approver_user_id),
    confidentiality_level = coalesce(p_confidentiality_level, confidentiality_level),
    phase_id = coalesce(p_phase_id, phase_id),
    stage_gate_id = coalesce(p_stage_gate_id, stage_gate_id),
    work_item_id = coalesce(p_work_item_id, work_item_id)
  where id = p_entry_id returning * into v_row;
  return v_row;
end;
$function$;

create or replace function public.delete_communication_entry(p_entry_id uuid)
 returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare g record;
begin
  select * into g from public._comm_entry_guard(p_entry_id, true);
  delete from public.communication_matrix_entries where id = p_entry_id;
end;
$function$;

create or replace function public.submit_communication_entry(p_entry_id uuid)
 returns public.communication_matrix_entries language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_caller uuid := auth.uid(); g record; v_row public.communication_matrix_entries;
begin
  -- Clearance + inner circle apply to everyone; the ROLE check is wider here
  -- (the responsible person may submit their own entry), so ask the guard for
  -- the data-level checks only and enforce the role locally.
  select * into g from public._comm_entry_guard(p_entry_id, false);
  if not (public.is_tenant_admin(g.o_tenant) or public.is_project_lead(g.o_project) or v_caller = g.o_responsible) then
    raise exception 'only the responsible person or a manager can submit' using errcode='42501';
  end if;
  if g.o_status not in ('draft','rejected') then raise exception 'can only submit a draft/rejected entry' using errcode='23514'; end if;
  if g.o_approver is null then raise exception 'an approver must be assigned before submitting' using errcode='22023'; end if;
  update public.communication_matrix_entries set approval_status='pending_approval', rejection_reason=null
    where id = p_entry_id returning * into v_row;
  return v_row;
end;
$function$;

create or replace function public.respond_communication_approval(p_entry_id uuid, p_approved boolean, p_reason text default null)
 returns public.communication_matrix_entries language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_caller uuid := auth.uid(); g record; v_row public.communication_matrix_entries;
begin
  -- The approver is typically NOT a manager, so no manager requirement — but
  -- clearance and inner circle still apply (an approver who may not see the
  -- entry must not be able to approve it).
  select * into g from public._comm_entry_guard(p_entry_id, false);
  if g.o_status <> 'pending_approval' then raise exception 'entry is not pending approval' using errcode='23514'; end if;
  if v_caller <> g.o_approver then raise exception 'only the assigned approver can respond' using errcode='42501'; end if;
  if g.o_approver = g.o_responsible then raise exception 'approver must differ from the responsible person (SoD)' using errcode='42501'; end if;
  if p_approved then
    update public.communication_matrix_entries set approval_status='approved', approved_at=now(), rejection_reason=null
      where id = p_entry_id returning * into v_row;
  else
    update public.communication_matrix_entries set approval_status='rejected', rejection_reason=nullif(btrim(p_reason),''), approved_at=null
      where id = p_entry_id returning * into v_row;
  end if;
  return v_row;
end;
$function$;

create or replace function public.mark_communication_sent(p_entry_id uuid)
 returns public.communication_matrix_entries language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare g record; v_row public.communication_matrix_entries;
begin
  select * into g from public._comm_entry_guard(p_entry_id, true);
  if g.o_status <> 'approved' then raise exception 'only an approved entry can be marked sent' using errcode='23514'; end if;
  -- AC4 — embargo. Hard block, no override (change the embargo instead; that
  -- change is field-level audit-tracked).
  --
  -- NOTE: no log INSERT here on purpose. The raise below aborts the statement,
  -- which would roll the row straight back again (Postgres has no autonomous
  -- transactions). A dedicated SQLSTATE lets the route detect the embargo case
  -- reliably — without string matching — and log it in a separate transaction.
  --
  -- SQLSTATE 'EM001' uses a deliberately NON-standard class. Do NOT use P0004
  -- here: that is plpgsql's assert_failure, which `WHEN OTHERS` refuses to
  -- catch, so every generic error handler would leak it.
  if g.o_embargo_at is not null and now() < g.o_embargo_at then
    raise exception 'embargo until % has not been reached', g.o_embargo_at using errcode='EM001';
  end if;
  update public.communication_matrix_entries set approval_status='sent', actual_date=coalesce(actual_date, current_date)
    where id = p_entry_id returning * into v_row;
  return v_row;
end;
$function$;

-- ==========================================================================
-- 8) Inner-circle + embargo governance RPCs
--    Deliberately separate RPCs rather than widening create_/update_
--    signatures: adding defaulted parameters to the deployed functions would
--    create overload ambiguity for existing 12/13-argument callers.
-- ==========================================================================

create or replace function public.set_communication_inner_circle(p_entry_id uuid, p_enabled boolean)
 returns public.communication_matrix_entries language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare g record; v_row public.communication_matrix_entries; v_caller uuid := auth.uid();
begin
  select * into g from public._comm_entry_guard(p_entry_id, true);
  if g.o_inner = p_enabled then
    select * into v_row from public.communication_matrix_entries where id = p_entry_id;
    return v_row;
  end if;

  update public.communication_matrix_entries set is_inner_circle = p_enabled
    where id = p_entry_id returning * into v_row;

  if p_enabled then
    -- Lockout protection: the actor and the responsible person always get in.
    insert into public.communication_entry_inner_circle (tenant_id, project_id, entry_id, user_id, added_by)
      values (g.o_tenant, g.o_project, p_entry_id, v_caller, v_caller)
      on conflict (entry_id, user_id) do nothing;
    if g.o_responsible is not null then
      insert into public.communication_entry_inner_circle (tenant_id, project_id, entry_id, user_id, added_by)
        values (g.o_tenant, g.o_project, p_entry_id, g.o_responsible, v_caller)
        on conflict (entry_id, user_id) do nothing;
    end if;
  else
    delete from public.communication_entry_inner_circle where entry_id = p_entry_id;
  end if;

  insert into public.communication_access_log (tenant_id, project_id, entry_id, user_id, action, outcome)
    values (g.o_tenant, g.o_project, p_entry_id, v_caller,
            case when p_enabled then 'circle_enabled' else 'circle_disabled' end, 'granted');
  return v_row;
end;
$function$;
revoke all on function public.set_communication_inner_circle(uuid, boolean) from public;
revoke all on function public.set_communication_inner_circle(uuid, boolean) from anon;
grant execute on function public.set_communication_inner_circle(uuid, boolean) to authenticated;

create or replace function public.add_communication_inner_circle_member(p_entry_id uuid, p_user_id uuid)
 returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare g record;
begin
  select * into g from public._comm_entry_guard(p_entry_id, true);
  if not g.o_inner then raise exception 'entry is not marked as inner circle' using errcode='23514'; end if;
  -- Only project members can be added (no cross-project / cross-tenant smuggling).
  if not exists (select 1 from public.project_memberships pm
                 where pm.project_id = g.o_project and pm.user_id = p_user_id) then
    raise exception 'user is not a member of this project' using errcode='23503';
  end if;
  insert into public.communication_entry_inner_circle (tenant_id, project_id, entry_id, user_id, added_by)
    values (g.o_tenant, g.o_project, p_entry_id, p_user_id, auth.uid())
    on conflict (entry_id, user_id) do nothing;
  insert into public.communication_access_log (tenant_id, project_id, entry_id, user_id, action, outcome)
    values (g.o_tenant, g.o_project, p_entry_id, auth.uid(), 'member_added', 'granted');
end;
$function$;
revoke all on function public.add_communication_inner_circle_member(uuid, uuid) from public;
revoke all on function public.add_communication_inner_circle_member(uuid, uuid) from anon;
grant execute on function public.add_communication_inner_circle_member(uuid, uuid) to authenticated;

create or replace function public.remove_communication_inner_circle_member(p_entry_id uuid, p_user_id uuid)
 returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare g record; v_left int;
begin
  select * into g from public._comm_entry_guard(p_entry_id, true);
  select count(*) into v_left from public.communication_entry_inner_circle where entry_id = p_entry_id;
  if v_left <= 1 then
    raise exception 'the last inner-circle member cannot be removed' using errcode='23514';
  end if;
  delete from public.communication_entry_inner_circle where entry_id = p_entry_id and user_id = p_user_id;
  insert into public.communication_access_log (tenant_id, project_id, entry_id, user_id, action, outcome)
    values (g.o_tenant, g.o_project, p_entry_id, auth.uid(), 'member_removed', 'granted');
end;
$function$;
revoke all on function public.remove_communication_inner_circle_member(uuid, uuid) from public;
revoke all on function public.remove_communication_inner_circle_member(uuid, uuid) from anon;
grant execute on function public.remove_communication_inner_circle_member(uuid, uuid) to authenticated;

-- Break-glass: a tenant admin OUTSIDE the circle may DISSOLVE it (loudly),
-- never silently read it. Deliberately does not use _comm_entry_guard, whose
-- inner-circle check would block exactly this caller.
create or replace function public.dissolve_inner_circle(p_entry_id uuid, p_reason text)
 returns public.communication_matrix_entries language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_caller uuid := auth.uid(); v_tenant uuid; v_project uuid; v_row public.communication_matrix_entries;
begin
  if v_caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  select tenant_id, project_id into v_tenant, v_project
    from public.communication_matrix_entries where id = p_entry_id;
  if v_project is null then raise exception 'entry not found' using errcode='P0002'; end if;
  if not public.is_tenant_admin(v_tenant) then
    raise exception 'only a tenant admin can dissolve an inner circle' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_reason,''))) = 0 then
    raise exception 'a reason is required to dissolve an inner circle' using errcode='22023';
  end if;

  -- change_reason feeds the PROJ-10 field-level audit entry for is_inner_circle.
  perform set_config('audit.change_reason', left(btrim(p_reason), 100), true);
  update public.communication_matrix_entries set is_inner_circle = false
    where id = p_entry_id returning * into v_row;
  delete from public.communication_entry_inner_circle where entry_id = p_entry_id;

  insert into public.communication_access_log (tenant_id, project_id, entry_id, user_id, action, outcome)
    values (v_tenant, v_project, p_entry_id, v_caller, 'dissolve', 'granted');
  return v_row;
end;
$function$;
revoke all on function public.dissolve_inner_circle(uuid, text) from public;
revoke all on function public.dissolve_inner_circle(uuid, text) from anon;
grant execute on function public.dissolve_inner_circle(uuid, text) to authenticated;

create or replace function public.set_communication_embargo(p_entry_id uuid, p_embargo_at timestamptz)
 returns public.communication_matrix_entries language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare g record; v_row public.communication_matrix_entries;
begin
  select * into g from public._comm_entry_guard(p_entry_id, true);
  if g.o_status = 'sent' then raise exception 'sent entries are immutable' using errcode='23514'; end if;
  update public.communication_matrix_entries set embargo_at = p_embargo_at
    where id = p_entry_id returning * into v_row;
  return v_row;
end;
$function$;
revoke all on function public.set_communication_embargo(uuid, timestamptz) from public;
revoke all on function public.set_communication_embargo(uuid, timestamptz) from anon;
grant execute on function public.set_communication_embargo(uuid, timestamptz) to authenticated;

-- ==========================================================================
-- 9) Access logging RPC
--    Must be callable for outcome='denied' too, i.e. by a caller who may NOT
--    see the entry — so it cannot require visibility. Project membership is
--    required to stop unrelated users from writing forged rows, and user_id is
--    always auth.uid() (never a parameter) so it cannot be impersonated.
-- ==========================================================================
create or replace function public.log_communication_access(
  p_entry_id uuid, p_action text, p_outcome text)
 returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_caller uuid := auth.uid(); v_tenant uuid; v_project uuid;
begin
  if v_caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_action not in ('view_content','export','print_view','embargo_blocked') then
    raise exception 'unsupported action' using errcode='22023';
  end if;
  if p_outcome not in ('granted','denied') then
    raise exception 'unsupported outcome' using errcode='22023';
  end if;
  select tenant_id, project_id into v_tenant, v_project
    from public.communication_matrix_entries where id = p_entry_id;
  if v_project is null then raise exception 'entry not found' using errcode='P0002'; end if;
  if not public.is_project_member(v_project) then
    raise exception 'not a project member' using errcode='42501';
  end if;
  insert into public.communication_access_log (tenant_id, project_id, entry_id, user_id, action, outcome)
    values (v_tenant, v_project, p_entry_id, v_caller, p_action, p_outcome);
end;
$function$;
revoke all on function public.log_communication_access(uuid, text, text) from public;
revoke all on function public.log_communication_access(uuid, text, text) from anon;
grant execute on function public.log_communication_access(uuid, text, text) to authenticated;

-- Reading an inner-circle entry's content is a single gated+logged operation.
-- Returns the message ONLY when the caller passes the very same predicate the
-- SELECT policies enforce, and writes exactly one log row either way.
create or replace function public.read_communication_content(p_entry_id uuid)
 returns table (message text, allowed boolean) language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_caller uuid := auth.uid(); v_tenant uuid; v_project uuid; v_visible boolean; v_msg text;
begin
  if v_caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  select tenant_id, project_id, e.message into v_tenant, v_project, v_msg
    from public.communication_matrix_entries e where e.id = p_entry_id;
  if v_project is null then raise exception 'entry not found' using errcode='P0002'; end if;
  if not public.is_project_member(v_project) then
    raise exception 'not a project member' using errcode='42501';
  end if;

  v_visible := public._comm_entry_visible(p_entry_id);
  insert into public.communication_access_log (tenant_id, project_id, entry_id, user_id, action, outcome)
    values (v_tenant, v_project, p_entry_id, v_caller, 'view_content',
            case when v_visible then 'granted' else 'denied' end);

  if not v_visible then
    return query select null::text, false;
  end if;
  return query select v_msg, true;
end;
$function$;
revoke all on function public.read_communication_content(uuid) from public;
revoke all on function public.read_communication_content(uuid) from anon;
grant execute on function public.read_communication_content(uuid) to authenticated;
