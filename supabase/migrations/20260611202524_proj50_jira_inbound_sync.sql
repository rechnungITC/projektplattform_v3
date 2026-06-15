-- =============================================================================
-- PROJ-50: Bidirectional Jira Sync — inbound persistence
-- =============================================================================
-- Extends the PROJ-47 outbound connector with the inbound direction. Two
-- tables, no new queue technology — the in-table-job + Vercel-cron pattern
-- (mirror jira_export_jobs + /api/cron/*) drains events asynchronously.
--
--   1. jira_inbound_events — append-only inbound webhook queue. The webhook
--      receiver verifies a per-tenant secret token, then inserts one row per
--      delivery. UNIQUE (tenant_id, delivery_id) makes replays no-ops
--      (idempotency, ST-01). A cron drains 'received' rows.
--   2. jira_sync_conflicts — when both V3 and Jira changed the same field
--      since the last sync, the drain raises a reviewable conflict instead of
--      silently overwriting (ST-03 + architecture invariant #2). Resolution is
--      audited.
--
-- Inbound apply scope (α, Tech Design): the drain auto-applies only a clean
-- fast-forward (V3 side unchanged since last sync) on a safe field whitelist
-- (status/title/description), through the same DB CHECK constraints native
-- mutations hit. kind/parent reparenting inbound is deferred.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. jira_inbound_events — inbound webhook queue (append-only)
-- ---------------------------------------------------------------------------
create table public.jira_inbound_events (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  provider           text not null default 'jira',
  jira_issue_key     text not null,
  delivery_id        text not null,
  event_type         text,
  raw_payload_digest jsonb not null default '{}'::jsonb,
  status             text not null default 'received',
  attempt            integer not null default 0,
  sanitized_error    text,
  received_at        timestamptz not null default now(),
  processed_at       timestamptz,

  constraint jira_inbound_events_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint jira_inbound_events_provider_check
    check (provider in ('jira')),
  constraint jira_inbound_events_issue_key_check
    check (length(jira_issue_key) > 0),
  constraint jira_inbound_events_status_check
    check (status in ('received','processed','ignored','quarantined','failed')),
  constraint jira_inbound_events_attempt_check
    check (attempt >= 0),
  constraint jira_inbound_events_digest_shape_check
    check (jsonb_typeof(raw_payload_digest) = 'object')
);

-- Idempotency: a re-delivered webhook (same Atlassian delivery id) is a no-op.
create unique index jira_inbound_events_delivery_unique
  on public.jira_inbound_events (tenant_id, delivery_id);

-- Drain query: pending events oldest-first.
create index jira_inbound_events_drain_idx
  on public.jira_inbound_events (status, received_at)
  where status = 'received';

create index jira_inbound_events_tenant_issue_idx
  on public.jira_inbound_events (tenant_id, jira_issue_key, received_at desc);

-- ---------------------------------------------------------------------------
-- 2. jira_sync_conflicts — reviewable field-level conflicts
-- ---------------------------------------------------------------------------
create table public.jira_sync_conflicts (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  project_id      uuid not null,
  work_item_id    uuid not null,
  external_ref_id uuid,
  field           text not null,
  v3_value        text,
  jira_value      text,
  resolution      text not null default 'pending',
  detected_at     timestamptz not null default now(),
  resolved_by     uuid,
  resolved_at     timestamptz,

  constraint jira_sync_conflicts_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint jira_sync_conflicts_project_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint jira_sync_conflicts_work_item_fkey
    foreign key (work_item_id) references public.work_items(id) on delete cascade,
  constraint jira_sync_conflicts_external_ref_fkey
    foreign key (external_ref_id) references public.external_refs(id) on delete set null,
  constraint jira_sync_conflicts_resolved_by_fkey
    foreign key (resolved_by) references public.profiles(id) on delete set null,
  constraint jira_sync_conflicts_field_check
    check (length(field) > 0),
  constraint jira_sync_conflicts_resolution_check
    check (resolution in ('pending','v3_wins','jira_wins','manual')),
  constraint jira_sync_conflicts_resolved_shape_check
    check (
      (resolution = 'pending' and resolved_by is null and resolved_at is null)
      or (resolution <> 'pending' and resolved_at is not null)
    )
);

create index jira_sync_conflicts_project_pending_idx
  on public.jira_sync_conflicts (project_id, detected_at desc)
  where resolution = 'pending';

create index jira_sync_conflicts_work_item_idx
  on public.jira_sync_conflicts (work_item_id, detected_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.jira_inbound_events enable row level security;
alter table public.jira_sync_conflicts enable row level security;

-- jira_inbound_events: tenant-admins may read (ops visibility). Writes happen
-- exclusively through the service-role client (webhook receiver + drain cron),
-- which bypasses RLS — so no authenticated INSERT/UPDATE policy is granted.
create policy jira_inbound_events_select
  on public.jira_inbound_events for select to authenticated
  using (public.is_tenant_admin(tenant_id));

-- jira_sync_conflicts: project members read; lead/editor/admin resolve.
create policy jira_sync_conflicts_select
  on public.jira_sync_conflicts for select to authenticated
  using (public.is_project_member(project_id));

create policy jira_sync_conflicts_update
  on public.jira_sync_conflicts for update to authenticated
  using (
    public.is_tenant_admin(tenant_id)
    or public.has_project_role(project_id, 'lead')
    or public.has_project_role(project_id, 'editor')
  )
  with check (
    public.is_tenant_admin(tenant_id)
    or public.has_project_role(project_id, 'lead')
    or public.has_project_role(project_id, 'editor')
  );

-- ---------------------------------------------------------------------------
-- Smoke checks (static, no data mutation)
-- ---------------------------------------------------------------------------
do $smoke$
begin
  if to_regclass('public.jira_inbound_events') is null then
    raise exception 'smoke-fail: jira_inbound_events missing';
  end if;
  if to_regclass('public.jira_sync_conflicts') is null then
    raise exception 'smoke-fail: jira_sync_conflicts missing';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'jira_inbound_events_delivery_unique'
  ) then
    raise exception 'smoke-fail: idempotency unique index missing';
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'jira_sync_conflicts_resolution_check'
  ) then
    raise exception 'smoke-fail: conflict resolution check missing';
  end if;
  if not (
    select relrowsecurity from pg_class where oid = 'public.jira_inbound_events'::regclass
  ) then
    raise exception 'smoke-fail: RLS not enabled on jira_inbound_events';
  end if;
  if not (
    select relrowsecurity from pg_class where oid = 'public.jira_sync_conflicts'::regclass
  ) then
    raise exception 'smoke-fail: RLS not enabled on jira_sync_conflicts';
  end if;

  raise notice 'PROJ-50 inbound sync smoke checks passed';
end
$smoke$;
