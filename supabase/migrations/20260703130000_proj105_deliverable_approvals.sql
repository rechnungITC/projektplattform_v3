-- ---------------------------------------------------------------------------
-- PROJ-105 — Freigabe-Workflow für Deliverables (M&A Epic D), Sub-Slice α.
-- CIA-Fork B (analog PROJ-100c): parallele, muster-spiegelnde deliverable_approval_*
-- Tabellen; die live decision_*-Engine (PROJ-31) wird NICHT generalisiert.
--
-- Sequenziell, ein-/mehrstufig, genau EIN Freigeber pro Stufe (kein paralleles
-- Quorum → Followup). Reject → Deliverable zurück auf in_progress (keine neue
-- Version → PROJ-106). `approved` (von PROJ-104 in der public transition-RPC
-- gesperrt) wird ausschließlich vom definer-internen _system-Helfer gesetzt,
-- wenn die letzte Stufe freigibt.
--
-- Hardening (CIA A1–A7):
--  * H2  kein actor-Param; Handelnder = auth.uid().
--  * H3  Freigabe-Historie lebt in eigener events-Tabelle mit eigener RLS →
--        weder audit_log_entity_type_check noch can_read_audit_entry-Trio
--        werden angefasst (kein Re-Grant-Risiko). Der status→approved-Audit
--        auf deliverables läuft über den bestehenden Update-Trigger; wir setzen
--        vorher audit.change_reason.
--  * H4  Schreib-RPCs revoke public,anon → grant authenticated; _system-Helfer
--        von ALLEN Rollen revoked.
--  * H5  Immutability-Trigger auf events.
--  * A1  kein audit-CHECK-Change nötig (keine generische Audit-Zeile für die
--        Approval-Tabellen) → weder recreate noch injection.
-- Idempotente DDL.
-- ---------------------------------------------------------------------------

-- ── 1. deliverable_approvals — laufender Freigabe-Vorgang (max 1 pending je Deliverable) ──
create table if not exists public.deliverable_approvals (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  project_id          uuid not null references public.projects(id) on delete cascade,
  deliverable_id      uuid not null references public.deliverables(id) on delete cascade,
  status              text not null default 'pending'
    check (status in ('pending','approved','rejected','withdrawn')),
  current_stage_order integer not null default 1,
  submitted_by        uuid not null references public.profiles(id),
  submitted_at        timestamptz not null default now(),
  decided_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists deliverable_approvals_deliverable_idx on public.deliverable_approvals (deliverable_id);
create index if not exists deliverable_approvals_project_idx on public.deliverable_approvals (project_id);
create index if not exists deliverable_approvals_tenant_idx on public.deliverable_approvals (tenant_id);
-- at most one OPEN (pending) workflow per deliverable
create unique index if not exists deliverable_approvals_one_pending
  on public.deliverable_approvals (deliverable_id) where status = 'pending';

alter table public.deliverable_approvals enable row level security;

drop trigger if exists deliverable_approvals_set_updated_at on public.deliverable_approvals;
create trigger deliverable_approvals_set_updated_at before update on public.deliverable_approvals
  for each row execute function extensions.moddatetime(updated_at);

-- ── 2. deliverable_approval_stages — sequenzielle Stufen, je Stufe 1 Approver ──
create table if not exists public.deliverable_approval_stages (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants(id) on delete cascade,
  approval_id            uuid not null references public.deliverable_approvals(id) on delete cascade,
  stage_order            integer not null,
  approver_stakeholder_id uuid not null references public.stakeholders(id) on delete cascade,
  response               text check (response is null or response in ('approve','reject')),
  responded_at           timestamptz,
  comment                text,
  magic_link_token       text,               -- β: HMAC token for external approver (null in α)
  magic_link_expires_at  timestamptz,        -- β
  created_at             timestamptz not null default now(),
  unique (approval_id, stage_order)
);
create index if not exists deliverable_approval_stages_approval_idx on public.deliverable_approval_stages (approval_id);
create index if not exists deliverable_approval_stages_approver_idx on public.deliverable_approval_stages (approver_stakeholder_id);
create unique index if not exists deliverable_approval_stages_token_uk
  on public.deliverable_approval_stages (magic_link_token) where magic_link_token is not null;

alter table public.deliverable_approval_stages enable row level security;

-- ── 3. deliverable_approval_events — lückenloses, unveränderliches Protokoll (AC5) ──
create table if not exists public.deliverable_approval_events (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  approval_id   uuid not null references public.deliverable_approvals(id) on delete cascade,
  stage_id      uuid references public.deliverable_approval_stages(id) on delete set null,
  event_type    text not null
    check (event_type in ('submitted','approver_responded','approved','rejected','withdrawn')),
  actor_user_id uuid references public.profiles(id),
  comment       text,
  created_at    timestamptz not null default now()
);
create index if not exists deliverable_approval_events_approval_idx on public.deliverable_approval_events (approval_id);

alter table public.deliverable_approval_events enable row level security;

create or replace function public.enforce_deliverable_approval_event_immutability()
returns trigger language plpgsql as $$
begin
  raise exception 'deliverable approval events are append-only' using errcode = '42501';
end $$;

drop trigger if exists deliverable_approval_event_no_update on public.deliverable_approval_events;
create trigger deliverable_approval_event_no_update
  before update or delete on public.deliverable_approval_events
  for each row execute function public.enforce_deliverable_approval_event_immutability();

-- ── 4. RLS — SELECT for project members through the deliverable's need-to-know gate.
-- Writes happen ONLY via SECURITY DEFINER RPCs (no INSERT/UPDATE/DELETE policy → default deny). --
drop policy if exists deliverable_approvals_select on public.deliverable_approvals;
create policy deliverable_approvals_select on public.deliverable_approvals
  for select to authenticated using (exists (
    select 1 from public.deliverables d
    where d.id = deliverable_id
      and public.is_project_member(d.project_id)
      and public.can_access_classified(d.project_id, d.confidentiality_level)));

drop policy if exists deliverable_approval_stages_select on public.deliverable_approval_stages;
create policy deliverable_approval_stages_select on public.deliverable_approval_stages
  for select to authenticated using (exists (
    select 1 from public.deliverable_approvals a
    join public.deliverables d on d.id = a.deliverable_id
    where a.id = approval_id
      and public.is_project_member(d.project_id)
      and public.can_access_classified(d.project_id, d.confidentiality_level)));

drop policy if exists deliverable_approval_events_select on public.deliverable_approval_events;
create policy deliverable_approval_events_select on public.deliverable_approval_events
  for select to authenticated using (exists (
    select 1 from public.deliverable_approvals a
    join public.deliverables d on d.id = a.deliverable_id
    where a.id = approval_id
      and public.is_project_member(d.project_id)
      and public.can_access_classified(d.project_id, d.confidentiality_level)));

-- ── 5. Internal system helper: performs the status write that the public
-- transition RPC forbids (approved / reject→in_progress). Revoked from all roles;
-- callable only from the definer RPCs below (they run as owner). Sets a meaningful
-- audit.change_reason so the existing deliverables update-trigger records it. ──
create or replace function public._system_set_deliverable_status(
  p_deliverable_id uuid, p_status text
) returns void
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
begin
  perform set_config(
    'audit.change_reason',
    case when p_status = 'approved' then 'proj105_approved' else 'proj105_rejected' end,
    true);
  update public.deliverables
    set status = p_status, updated_at = now()
    where id = p_deliverable_id;
end $$;
revoke execute on function public._system_set_deliverable_status(uuid, text) from public, anon, authenticated;

-- ── 6. submit_deliverable_for_approval — Lead/Admin reicht ein (Precondition in_review).
-- SoD: Einreicher darf nicht Approver sein. α: jeder Approver braucht linked_user_id
-- und Projektmitgliedschaft (interner My-Work-Pfad). ──
create or replace function public.submit_deliverable_for_approval(
  p_deliverable_id uuid, p_approver_stakeholder_ids uuid[]
) returns public.deliverable_approvals
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_caller uuid := auth.uid();
  v_tenant uuid; v_project uuid; v_status text; v_level public.ma_confidentiality_level;
  v_approval public.deliverable_approvals;
begin
  if v_caller is null then raise exception 'authentication required' using errcode = '42501'; end if;

  select tenant_id, project_id, status, confidentiality_level
    into v_tenant, v_project, v_status, v_level
    from public.deliverables where id = p_deliverable_id;
  if not found then raise exception 'deliverable not found' using errcode = 'P0002'; end if;

  if not (public.is_tenant_admin(v_tenant) or public.is_project_lead(v_project)) then
    raise exception 'insufficient role to submit deliverable for approval' using errcode = '42501';
  end if;
  -- need-to-know: submitter must be able to access the deliverable
  if not public.can_access_classified(v_project, v_level) then
    raise exception 'not authorized for this deliverable' using errcode = '42501';
  end if;

  if v_status <> 'in_review' then
    raise exception 'deliverable must be in_review to submit for approval (current: %)', v_status using errcode = '23514';
  end if;

  if p_approver_stakeholder_ids is null or array_length(p_approver_stakeholder_ids, 1) is null then
    raise exception 'at least one approver stage is required' using errcode = '22023';
  end if;

  if exists (select 1 from public.deliverable_approvals
             where deliverable_id = p_deliverable_id and status = 'pending') then
    raise exception 'a pending approval workflow already exists for this deliverable' using errcode = '23505';
  end if;

  -- validate every approver (α): same-project stakeholder, has a linked user account,
  -- and that user is a project member (so the internal My-Work path + RLS works).
  if exists (
    select 1 from unnest(p_approver_stakeholder_ids) aid
    left join public.stakeholders s on s.id = aid
    where s.id is null
       or s.project_id <> v_project
       or s.linked_user_id is null
       or not exists (
         select 1 from public.project_memberships pm
         where pm.project_id = v_project and pm.user_id = s.linked_user_id)
  ) then
    raise exception 'every approver must be a project stakeholder with a linked, project-member user account' using errcode = '22023';
  end if;

  -- SoD (hard block): the submitter cannot also be an approver
  if exists (
    select 1 from public.stakeholders s
    where s.id = any(p_approver_stakeholder_ids) and s.linked_user_id = v_caller
  ) then
    raise exception 'submitter cannot be an approver (separation of duties)' using errcode = '42501';
  end if;

  insert into public.deliverable_approvals
    (tenant_id, project_id, deliverable_id, status, current_stage_order, submitted_by)
  values (v_tenant, v_project, p_deliverable_id, 'pending', 1, v_caller)
  returning * into v_approval;

  insert into public.deliverable_approval_stages
    (tenant_id, approval_id, stage_order, approver_stakeholder_id)
  select v_tenant, v_approval.id, ord::int, aid
  from unnest(p_approver_stakeholder_ids) with ordinality as t(aid, ord);

  insert into public.deliverable_approval_events
    (tenant_id, approval_id, event_type, actor_user_id)
  values (v_tenant, v_approval.id, 'submitted', v_caller);

  return v_approval;
end $$;
revoke execute on function public.submit_deliverable_for_approval(uuid, uuid[]) from public, anon;
grant execute on function public.submit_deliverable_for_approval(uuid, uuid[]) to authenticated;

-- ── 7. record_deliverable_approval_response — der aktive Freigeber reagiert.
-- H2: kein actor-Param; Handelnder = auth.uid(). Advisory-Lock je Vorgang. ──
create or replace function public.record_deliverable_approval_response(
  p_stage_id uuid, p_response text, p_comment text default null
) returns public.deliverable_approvals
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_caller uuid := auth.uid();
  v_stage public.deliverable_approval_stages;
  v_approval public.deliverable_approvals;
  v_level public.ma_confidentiality_level;
  v_approver_user uuid;
  v_max_stage integer;
begin
  if v_caller is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_response not in ('approve','reject') then
    raise exception 'response must be approve or reject' using errcode = '22023';
  end if;

  select * into v_stage from public.deliverable_approval_stages where id = p_stage_id;
  if v_stage.id is null then raise exception 'stage not found' using errcode = 'P0002'; end if;

  -- serialize concurrent responses on the same workflow
  perform pg_advisory_xact_lock(hashtextextended(v_stage.approval_id::text, 0));

  select * into v_approval from public.deliverable_approvals where id = v_stage.approval_id for update;
  if v_approval.id is null then raise exception 'approval not found' using errcode = 'P0002'; end if;
  if v_approval.status <> 'pending' then
    raise exception 'approval workflow is not pending' using errcode = '22023';
  end if;
  if v_stage.response is not null then
    raise exception 'this stage has already been answered' using errcode = '22023';
  end if;
  if v_stage.stage_order <> v_approval.current_stage_order then
    raise exception 'this is not the active stage' using errcode = '42501';
  end if;

  -- authorization: caller must be the active stage's approver (via linked user account)
  select s.linked_user_id into v_approver_user
    from public.stakeholders s where s.id = v_stage.approver_stakeholder_id;
  if v_approver_user is null or v_approver_user <> v_caller then
    raise exception 'only the active approver may respond' using errcode = '42501';
  end if;

  -- need-to-know: the approver must be able to access the deliverable
  select d.confidentiality_level into v_level
    from public.deliverables d where d.id = v_approval.deliverable_id;
  if not public.can_access_classified(v_approval.project_id, v_level) then
    raise exception 'not authorized for this deliverable' using errcode = '42501';
  end if;

  update public.deliverable_approval_stages
    set response = p_response, responded_at = now(), comment = p_comment
    where id = p_stage_id;

  insert into public.deliverable_approval_events
    (tenant_id, approval_id, stage_id, event_type, actor_user_id, comment)
  values (v_approval.tenant_id, v_approval.id, p_stage_id, 'approver_responded', v_caller, p_comment);

  if p_response = 'reject' then
    update public.deliverable_approvals
      set status = 'rejected', decided_at = now()
      where id = v_approval.id returning * into v_approval;
    perform public._system_set_deliverable_status(v_approval.deliverable_id, 'in_progress');
    insert into public.deliverable_approval_events
      (tenant_id, approval_id, stage_id, event_type, actor_user_id)
    values (v_approval.tenant_id, v_approval.id, p_stage_id, 'rejected', v_caller);
    return v_approval;
  end if;

  -- approve: last stage → approve the deliverable; otherwise open the next stage
  select max(stage_order) into v_max_stage
    from public.deliverable_approval_stages where approval_id = v_approval.id;

  if v_approval.current_stage_order >= v_max_stage then
    update public.deliverable_approvals
      set status = 'approved', decided_at = now()
      where id = v_approval.id returning * into v_approval;
    perform public._system_set_deliverable_status(v_approval.deliverable_id, 'approved');
    insert into public.deliverable_approval_events
      (tenant_id, approval_id, stage_id, event_type, actor_user_id)
    values (v_approval.tenant_id, v_approval.id, p_stage_id, 'approved', v_caller);
  else
    update public.deliverable_approvals
      set current_stage_order = current_stage_order + 1
      where id = v_approval.id returning * into v_approval;
  end if;

  return v_approval;
end $$;
revoke execute on function public.record_deliverable_approval_response(uuid, text, text) from public, anon;
grant execute on function public.record_deliverable_approval_response(uuid, text, text) to authenticated;

-- ── 8. withdraw_deliverable_approval — Einreicher/Lead/Admin zieht laufenden Vorgang zurück ──
create or replace function public.withdraw_deliverable_approval(
  p_approval_id uuid
) returns public.deliverable_approvals
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_caller uuid := auth.uid();
  v_approval public.deliverable_approvals;
begin
  if v_caller is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into v_approval from public.deliverable_approvals where id = p_approval_id;
  if v_approval.id is null then raise exception 'approval not found' using errcode = 'P0002'; end if;
  if v_approval.status <> 'pending' then
    raise exception 'approval workflow is not pending' using errcode = '22023';
  end if;
  if not (v_caller = v_approval.submitted_by
          or public.is_tenant_admin(v_approval.tenant_id)
          or public.is_project_lead(v_approval.project_id)) then
    raise exception 'not authorized to withdraw this approval' using errcode = '42501';
  end if;

  update public.deliverable_approvals
    set status = 'withdrawn', decided_at = now()
    where id = p_approval_id returning * into v_approval;
  insert into public.deliverable_approval_events
    (tenant_id, approval_id, event_type, actor_user_id)
  values (v_approval.tenant_id, v_approval.id, 'withdrawn', v_caller);
  -- deliverable stays in_review; no status change
  return v_approval;
end $$;
revoke execute on function public.withdraw_deliverable_approval(uuid) from public, anon;
grant execute on function public.withdraw_deliverable_approval(uuid) to authenticated;

-- ── 9. Gate patch: pending-freeze on transition_deliverable_status.
-- Byte-identical to the PROJ-104 definition EXCEPT the added pending-approval guard
-- (H7: only fires when a pending approval exists — a state impossible before PROJ-105,
-- so all existing PROJ-104 transitions behave identically). ──
create or replace function public.transition_deliverable_status(
  p_deliverable_id uuid,
  p_to_status text
)
returns public.deliverables
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_tenant uuid; v_project uuid; v_from text; v_row public.deliverables;
begin
  if v_caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  select tenant_id, project_id, status into v_tenant, v_project, v_from
    from public.deliverables where id = p_deliverable_id;
  if not found then raise exception 'deliverable not found' using errcode='P0002'; end if;
  if not (public.is_tenant_admin(v_tenant) or public.is_project_lead(v_project)) then
    raise exception 'insufficient role for deliverable status transition' using errcode='42501';
  end if;
  -- PROJ-105 pending-freeze: no manual status change while an approval workflow runs.
  if exists (select 1 from public.deliverable_approvals
             where deliverable_id = p_deliverable_id and status = 'pending') then
    raise exception 'deliverable has a running approval workflow; withdraw it first' using errcode='42501';
  end if;
  if p_to_status not in ('planned','in_progress','in_review','approved','suspended') then
    raise exception 'invalid status %', p_to_status using errcode='22023';
  end if;
  -- 'approved' transition is owned by PROJ-105 (formal Freigabe-Workflow / gate).
  if p_to_status = 'approved' then
    raise exception 'approved is set by the PROJ-105 approval workflow, not here' using errcode='42501';
  end if;
  if v_from = 'planned' and p_to_status not in ('in_progress','suspended') then
    raise exception 'cannot transition from % to %', v_from, p_to_status using errcode='23514';
  elsif v_from = 'in_progress' and p_to_status not in ('in_review','planned','suspended') then
    raise exception 'cannot transition from % to %', v_from, p_to_status using errcode='23514';
  elsif v_from = 'in_review' and p_to_status not in ('in_progress','suspended') then
    raise exception 'cannot transition from % to %', v_from, p_to_status using errcode='23514';
  elsif v_from = 'suspended' and p_to_status not in ('planned') then
    raise exception 'cannot transition from % to %', v_from, p_to_status using errcode='23514';
  elsif v_from = 'approved' then
    raise exception 'approved is terminal in PROJ-104 (PROJ-105 owns further transitions)' using errcode='23514';
  end if;
  update public.deliverables set status = p_to_status, updated_at = now()
    where id = p_deliverable_id returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.transition_deliverable_status(uuid, text) from public;
revoke execute on function public.transition_deliverable_status(uuid, text) from anon;
grant execute on function public.transition_deliverable_status(uuid, text) to authenticated;
