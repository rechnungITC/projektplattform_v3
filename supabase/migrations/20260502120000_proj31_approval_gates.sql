-- =============================================================================
-- PROJ-31 — Approval-Gates für formale Decisions
-- =============================================================================
-- Adds 3 new tables (decision_approval_state 1:1 with decisions,
-- decision_approvers n:m, decision_approval_events append-only audit),
-- the `is_approver` flag on stakeholders, an RPC `record_approval_response`
-- with pg_advisory_xact_lock for race-condition-free quorum updates,
-- and triggers for cascading state changes (revision, stakeholder withdraw).
--
-- Critical design constraint: NO new columns on `decisions`. The existing
-- immutability trigger on decisions (20260429140000) blocks every UPDATE
-- except the controlled is_revised flip. Approval-state lives in a
-- separate 1:1 table that is freely mutable.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Stakeholder eligibility flag.
-- ---------------------------------------------------------------------------
alter table public.stakeholders
  add column if not exists is_approver boolean not null default false;

comment on column public.stakeholders.is_approver is
  'PROJ-31 — eligible to be nominated as approver on formal Decisions. PM toggle.';

create index if not exists stakeholders_is_approver_idx
  on public.stakeholders (project_id)
  where is_approver = true;

-- ---------------------------------------------------------------------------
-- 2. decision_approval_state — 1:1 mit decisions, hält den Workflow-Status.
-- ---------------------------------------------------------------------------
create table if not exists public.decision_approval_state (
  decision_id uuid primary key references public.decisions(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  status text not null
    check (status in ('draft','pending','approved','rejected','withdrawn'))
    default 'draft',
  quorum_required integer
    check (quorum_required is null or quorum_required >= 1),
  submitted_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.decision_approval_state is
  'PROJ-31 — workflow state for a Decision. Separate from decisions because '
  'the decisions-immutability trigger forbids any UPDATE on decisions.';

create index if not exists decision_approval_state_tenant_status_idx
  on public.decision_approval_state (tenant_id, status);

alter table public.decision_approval_state enable row level security;

create policy "decision_approval_state: tenant members can SELECT"
  on public.decision_approval_state
  for select
  using (public.is_tenant_member(tenant_id));

create policy "decision_approval_state: editors+ can INSERT"
  on public.decision_approval_state
  for insert
  with check (public.is_tenant_member(tenant_id));

create policy "decision_approval_state: editors+ can UPDATE"
  on public.decision_approval_state
  for update
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- DELETE only via cascading from decisions deletion — no direct policy.

-- ---------------------------------------------------------------------------
-- 3. decision_approvers — n:m Approver-Stakeholders pro Decision + Token.
-- ---------------------------------------------------------------------------
create table if not exists public.decision_approvers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  decision_id uuid not null references public.decisions(id) on delete cascade,
  stakeholder_id uuid not null references public.stakeholders(id) on delete cascade,
  -- HMAC-SHA256 token (base64url encoded). Persisted as second validation
  -- layer in addition to the in-payload HMAC check on /api/approve/[token].
  magic_link_token text not null,
  magic_link_expires_at timestamptz not null,
  -- Response is null until the approver clicks; null = still pending.
  response text
    check (response is null or response in ('approve','reject','withdrawn')),
  responded_at timestamptz,
  comment text check (comment is null or length(comment) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (decision_id, stakeholder_id),
  unique (magic_link_token)
);

comment on table public.decision_approvers is
  'PROJ-31 — nominees per Decision. Token persisted as second validation '
  'layer (HMAC validates form, DB lookup validates that the token still '
  'exists and was not revoked).';

create index if not exists decision_approvers_decision_idx
  on public.decision_approvers (decision_id);
create index if not exists decision_approvers_stakeholder_idx
  on public.decision_approvers (stakeholder_id);
create index if not exists decision_approvers_pending_idx
  on public.decision_approvers (stakeholder_id)
  where response is null;

alter table public.decision_approvers enable row level security;

create policy "decision_approvers: tenant members can SELECT"
  on public.decision_approvers
  for select
  using (public.is_tenant_member(tenant_id));

create policy "decision_approvers: editors+ can INSERT"
  on public.decision_approvers
  for insert
  with check (public.is_tenant_member(tenant_id));

create policy "decision_approvers: editors+ can UPDATE"
  on public.decision_approvers
  for update
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- ---------------------------------------------------------------------------
-- 4. decision_approval_events — append-only Audit-Trail.
--    No UPDATE / DELETE allowed at the DB level (trigger).
-- ---------------------------------------------------------------------------
create table if not exists public.decision_approval_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  decision_id uuid not null references public.decisions(id) on delete cascade,
  event_type text not null
    check (event_type in (
      'submitted_for_approval',
      'approver_responded',
      'quorum_reached',
      'quorum_unreachable',
      'withdrawn',
      'revised',
      'token_renewed',
      'approver_withdrawn'
    )),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_stakeholder_id uuid references public.stakeholders(id) on delete set null,
  payload jsonb,
  created_at timestamptz not null default now()
);

comment on table public.decision_approval_events is
  'PROJ-31 — append-only audit-trail. UPDATE and DELETE rejected by trigger.';

create index if not exists decision_approval_events_decision_idx
  on public.decision_approval_events (decision_id, created_at desc);

alter table public.decision_approval_events enable row level security;

create policy "decision_approval_events: tenant members can SELECT"
  on public.decision_approval_events
  for select
  using (public.is_tenant_member(tenant_id));

create policy "decision_approval_events: editors+ can INSERT"
  on public.decision_approval_events
  for insert
  with check (public.is_tenant_member(tenant_id));

-- No UPDATE/DELETE policies → blocked by RLS even if a trigger weren't there.

create or replace function public.enforce_approval_event_immutability()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'decision_approval_events are append-only. UPDATE and DELETE forbidden.'
    using errcode = 'check_violation';
end;
$$;

revoke execute on function public.enforce_approval_event_immutability()
  from public, anon, authenticated;

create trigger decision_approval_events_enforce_immutability_update
  before update on public.decision_approval_events
  for each row execute function public.enforce_approval_event_immutability();

create trigger decision_approval_events_enforce_immutability_delete
  before delete on public.decision_approval_events
  for each row execute function public.enforce_approval_event_immutability();

-- ---------------------------------------------------------------------------
-- 5. RPC `record_approval_response` — atomare Quorum-Berechnung.
--    Acquires pg_advisory_xact_lock(decision_id) so concurrent approver
--    clicks are serialised and quorum stays consistent.
-- ---------------------------------------------------------------------------
create or replace function public.record_approval_response(
  p_decision_id uuid,
  p_approver_id uuid,
  p_response text,           -- 'approve' | 'reject'
  p_comment text,
  p_actor_user_id uuid       -- internal-flow caller (else null = magic-link)
)
returns table (
  status text,                 -- new state.status after the response
  quorum_received_approvals int,
  quorum_received_rejections int,
  total_approvers int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state record;
  v_approver record;
  v_n_approvers int;
  v_n_approves int;
  v_n_rejects int;
  v_quorum_required int;
  v_new_status text;
  v_actor_stakeholder_id uuid;
begin
  if p_response not in ('approve','reject') then
    raise exception 'invalid_response %', p_response using errcode = 'check_violation';
  end if;

  -- Acquire transaction-scoped advisory lock on the decision_id. Concurrent
  -- approver-clicks on the same decision serialize on this lock; the lock
  -- is released automatically at COMMIT/ROLLBACK.
  perform pg_advisory_xact_lock(hashtextextended(p_decision_id::text, 0));

  -- Fetch state with FOR UPDATE so a sibling transaction sees the latest.
  select * into v_state
    from public.decision_approval_state
   where decision_id = p_decision_id
   for update;

  if not found then
    raise exception 'approval_state_not_found' using errcode = 'P0002';
  end if;
  if v_state.status <> 'pending' then
    raise exception 'not_pending: status=%', v_state.status using errcode = 'check_violation';
  end if;

  -- Fetch approver row.
  select * into v_approver
    from public.decision_approvers
   where id = p_approver_id and decision_id = p_decision_id
   for update;

  if not found then
    raise exception 'approver_not_found' using errcode = 'P0002';
  end if;
  if v_approver.response is not null then
    raise exception 'approver_already_responded' using errcode = 'check_violation';
  end if;
  if v_approver.magic_link_expires_at < now() then
    raise exception 'approver_token_expired' using errcode = 'check_violation';
  end if;

  v_actor_stakeholder_id := v_approver.stakeholder_id;
  v_quorum_required := v_state.quorum_required;

  -- Persist the approver response.
  update public.decision_approvers
     set response = p_response,
         responded_at = now(),
         comment = p_comment,
         updated_at = now()
   where id = p_approver_id;

  -- Recount approvals + rejections (after this update).
  select
      count(*) filter (where response = 'approve'),
      count(*) filter (where response = 'reject'),
      count(*)
    into v_n_approves, v_n_rejects, v_n_approvers
    from public.decision_approvers
   where decision_id = p_decision_id;

  -- Append the per-response event.
  insert into public.decision_approval_events
    (tenant_id, decision_id, event_type, actor_user_id, actor_stakeholder_id, payload)
  values (
    v_state.tenant_id, p_decision_id, 'approver_responded',
    p_actor_user_id, v_actor_stakeholder_id,
    jsonb_build_object('response', p_response, 'comment', p_comment, 'approver_id', p_approver_id)
  );

  -- Decide whether the quorum is reached / unreachable.
  if v_n_approves >= v_quorum_required then
    v_new_status := 'approved';
  elsif (v_n_approvers - v_n_rejects) < v_quorum_required then
    -- Even if every remaining approver said yes, quorum can't be reached.
    v_new_status := 'rejected';
  else
    v_new_status := 'pending';
  end if;

  if v_new_status <> v_state.status then
    update public.decision_approval_state
       set status = v_new_status,
           decided_at = case when v_new_status in ('approved','rejected') then now() else null end,
           updated_at = now()
     where decision_id = p_decision_id;

    insert into public.decision_approval_events
      (tenant_id, decision_id, event_type, actor_user_id, actor_stakeholder_id, payload)
    values (
      v_state.tenant_id, p_decision_id,
      case when v_new_status = 'approved' then 'quorum_reached'
           else 'quorum_unreachable' end,
      p_actor_user_id, null,
      jsonb_build_object('approves', v_n_approves, 'rejects', v_n_rejects, 'total', v_n_approvers)
    );
  end if;

  return query
    select v_new_status, v_n_approves::int, v_n_rejects::int, v_n_approvers::int;
end;
$$;

revoke execute on function public.record_approval_response(uuid, uuid, text, text, uuid)
  from public, anon;
grant execute on function public.record_approval_response(uuid, uuid, text, text, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Trigger: cascading-withdraw on stakeholder.is_approver = false.
--    Pending approver-rows for that stakeholder get marked 'withdrawn'.
-- ---------------------------------------------------------------------------
create or replace function public.cascade_stakeholder_approver_revoke()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (TG_OP = 'UPDATE' and NEW.is_approver = false and OLD.is_approver = true)
     or TG_OP = 'DELETE' then
    with updated as (
      update public.decision_approvers
         set response = 'withdrawn',
             responded_at = now(),
             updated_at = now()
       where stakeholder_id = (case when TG_OP = 'DELETE' then OLD.id else NEW.id end)
         and response is null
       returning tenant_id, decision_id
    )
    insert into public.decision_approval_events
      (tenant_id, decision_id, event_type, actor_stakeholder_id, payload)
    select
      u.tenant_id, u.decision_id, 'approver_withdrawn',
      (case when TG_OP = 'DELETE' then OLD.id else NEW.id end),
      jsonb_build_object('reason',
        case when TG_OP = 'DELETE' then 'stakeholder_deleted'
             else 'is_approver_revoked' end)
    from updated u;
  end if;
  return null;
end;
$$;

revoke execute on function public.cascade_stakeholder_approver_revoke()
  from public, anon, authenticated;

create trigger stakeholders_cascade_approver_revoke
  after update of is_approver on public.stakeholders
  for each row execute function public.cascade_stakeholder_approver_revoke();

create trigger stakeholders_cascade_approver_delete
  after delete on public.stakeholders
  for each row execute function public.cascade_stakeholder_approver_revoke();

-- ---------------------------------------------------------------------------
-- 7. Trigger: cascading-revision marks predecessor's pending approval as
--    withdrawn when a new revision lands.
-- ---------------------------------------------------------------------------
create or replace function public.cascade_decision_revision_to_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.supersedes_decision_id is null then
    return NEW;
  end if;

  update public.decision_approval_state
     set status = 'withdrawn',
         decided_at = now(),
         updated_at = now()
   where decision_id = NEW.supersedes_decision_id
     and status = 'pending';

  if found then
    insert into public.decision_approval_events
      (tenant_id, decision_id, event_type, actor_user_id, payload)
    values (
      NEW.tenant_id, NEW.supersedes_decision_id, 'revised', NEW.created_by,
      jsonb_build_object('superseded_by', NEW.id)
    );

    update public.decision_approvers
       set response = 'withdrawn',
           responded_at = now(),
           updated_at = now()
     where decision_id = NEW.supersedes_decision_id
       and response is null;
  end if;

  return NEW;
end;
$$;

revoke execute on function public.cascade_decision_revision_to_approval()
  from public, anon, authenticated;

create trigger decisions_cascade_revision_to_approval
  after insert on public.decisions
  for each row execute function public.cascade_decision_revision_to_approval();

-- ---------------------------------------------------------------------------
-- 8. updated_at maintenance triggers (mirrors what other tables do).
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

drop trigger if exists decision_approval_state_touch_updated on public.decision_approval_state;
create trigger decision_approval_state_touch_updated
  before update on public.decision_approval_state
  for each row execute function public.touch_updated_at();

drop trigger if exists decision_approvers_touch_updated on public.decision_approvers;
create trigger decision_approvers_touch_updated
  before update on public.decision_approvers
  for each row execute function public.touch_updated_at();
