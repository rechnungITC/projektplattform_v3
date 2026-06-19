-- =============================================================================
-- PROJ-48: MCP Bridge — tenant-scoped, read-only Model Context Protocol surface
-- =============================================================================
-- Two tables + one authorization RPC back the MCP route (/api/mcp):
--   * mcp_access_tokens — admin-issued bearer tokens (only the sha256 hash is
--     stored; raw token shown once at issue time, mirrors PROJ-50
--     jira_webhook_tokens).
--   * mcp_tool_calls — append-only audit of every tool invocation (hashed
--     arguments_digest, never raw Class-3 values).
--   * mcp_authorize_call() — SECURITY DEFINER: validates a token by hash,
--     enforces a per-token sliding-window rate limit (counts recent
--     mcp_tool_calls), bumps last_used_at. The public-ish MCP route runs under
--     the service-role client (no Supabase session), so it resolves the tenant
--     here by hash — RLS on the tables themselves stays admin-only.
-- =============================================================================

-- ─── mcp_access_tokens ───────────────────────────────────────────────────────
create table public.mcp_access_tokens (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  token_hash   text not null,
  label        text,
  created_by   uuid not null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz,
  expires_at   timestamptz,

  constraint mcp_access_tokens_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint mcp_access_tokens_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint mcp_access_tokens_hash_check
    check (length(token_hash) = 64) -- sha256 hex
);

create unique index mcp_access_tokens_hash_unique
  on public.mcp_access_tokens (token_hash);

create index mcp_access_tokens_tenant_idx
  on public.mcp_access_tokens (tenant_id, created_at desc);

alter table public.mcp_access_tokens enable row level security;

-- Tenant-admins manage their own tokens. The MCP route reads via the
-- service-role client (bypasses RLS) — so no anon/authenticated read path.
create policy mcp_access_tokens_select
  on public.mcp_access_tokens for select to authenticated
  using (public.is_tenant_admin(tenant_id));

create policy mcp_access_tokens_insert
  on public.mcp_access_tokens for insert to authenticated
  with check (public.is_tenant_admin(tenant_id));

create policy mcp_access_tokens_update
  on public.mcp_access_tokens for update to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy mcp_access_tokens_delete
  on public.mcp_access_tokens for delete to authenticated
  using (public.is_tenant_admin(tenant_id));

-- ─── mcp_tool_calls (audit) ───────────────────────────────────────────────────
create table public.mcp_tool_calls (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  token_id         uuid,
  tool_name        text not null,
  arguments_digest text,
  result_row_count integer,
  redaction_count  integer,
  status           text not null,
  latency_ms       integer,
  created_at       timestamptz not null default now(),

  constraint mcp_tool_calls_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint mcp_tool_calls_token_fkey
    foreign key (token_id) references public.mcp_access_tokens(id) on delete set null,
  constraint mcp_tool_calls_status_check
    check (status in ('ok', 'error', 'rate_limited', 'unauthorized'))
);

create index mcp_tool_calls_tenant_idx
  on public.mcp_tool_calls (tenant_id, created_at desc);

-- Drives the rate-limit count in mcp_authorize_call().
create index mcp_tool_calls_token_idx
  on public.mcp_tool_calls (token_id, created_at desc);

alter table public.mcp_tool_calls enable row level security;

-- Admin-readable audit. Writes happen exclusively via the service-role
-- client in the MCP route — so there is deliberately no insert/update policy.
create policy mcp_tool_calls_select
  on public.mcp_tool_calls for select to authenticated
  using (public.is_tenant_admin(tenant_id));

-- ─── mcp_authorize_call() — validate token + sliding-window rate limit ─────────
create or replace function public.mcp_authorize_call(
  p_token_hash    text,
  p_window_seconds integer default 60,
  p_max_calls     integer default 60
)
returns table (tenant_id uuid, token_id uuid, allowed boolean, reason text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id         uuid;
  v_tenant     uuid;
  v_revoked_at timestamptz;
  v_expires_at timestamptz;
  v_count      integer;
begin
  select t.id, t.tenant_id, t.revoked_at, t.expires_at
    into v_id, v_tenant, v_revoked_at, v_expires_at
  from public.mcp_access_tokens t
  where t.token_hash = p_token_hash;

  if not found then
    return query select null::uuid, null::uuid, false, 'invalid_token'::text;
    return;
  end if;

  if v_revoked_at is not null then
    return query select null::uuid, null::uuid, false, 'revoked_token'::text;
    return;
  end if;

  if v_expires_at is not null and v_expires_at <= now() then
    return query select null::uuid, null::uuid, false, 'expired_token'::text;
    return;
  end if;

  select count(*) into v_count
  from public.mcp_tool_calls c
  where c.token_id = v_id
    and c.created_at > now() - make_interval(secs => greatest(p_window_seconds, 1));

  if v_count >= greatest(p_max_calls, 1) then
    return query select v_tenant, v_id, false, 'rate_limited'::text;
    return;
  end if;

  update public.mcp_access_tokens set last_used_at = now() where id = v_id;

  return query select v_tenant, v_id, true, 'ok'::text;
end;
$$;

-- Only the service-role MCP route may authorize tokens.
revoke execute on function public.mcp_authorize_call(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.mcp_authorize_call(text, integer, integer)
  to service_role;

-- ─── smoke ─────────────────────────────────────────────────────────────────
do $smoke$
begin
  if to_regclass('public.mcp_access_tokens') is null then
    raise exception 'smoke-fail: mcp_access_tokens missing';
  end if;
  if to_regclass('public.mcp_tool_calls') is null then
    raise exception 'smoke-fail: mcp_tool_calls missing';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'mcp_access_tokens_hash_unique'
  ) then
    raise exception 'smoke-fail: token hash unique index missing';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.mcp_access_tokens'::regclass) then
    raise exception 'smoke-fail: RLS not enabled on mcp_access_tokens';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.mcp_tool_calls'::regclass) then
    raise exception 'smoke-fail: RLS not enabled on mcp_tool_calls';
  end if;
  if to_regprocedure('public.mcp_authorize_call(text, integer, integer)') is null then
    raise exception 'smoke-fail: mcp_authorize_call missing';
  end if;
  raise notice 'PROJ-48 mcp-bridge smoke checks passed';
end
$smoke$;
