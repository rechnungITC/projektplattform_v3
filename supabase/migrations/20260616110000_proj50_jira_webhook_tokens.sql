-- =============================================================================
-- PROJ-50: Bidirectional Jira Sync — webhook token → tenant resolution
-- =============================================================================
-- The inbound webhook (POST /api/connectors/jira/webhook/{token}) is PUBLIC:
-- Jira calls it without a Supabase session, so it cannot decrypt the
-- pgcrypto-backed tenant_secrets (that needs the per-request encryption-key
-- GUC). It therefore resolves the tenant by hashing the URL token and looking
-- it up here via the service-role client — the PROJ-48 mcp_access_tokens
-- pattern (store only the hash; show the raw token once at issue time).
-- =============================================================================

create table public.jira_webhook_tokens (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  token_hash  text not null,
  label       text,
  created_by  uuid not null,
  created_at  timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at  timestamptz,

  constraint jira_webhook_tokens_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint jira_webhook_tokens_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint jira_webhook_tokens_hash_check
    check (length(token_hash) = 64) -- sha256 hex
);

-- The receiver looks up by hash; the raw token is never stored.
create unique index jira_webhook_tokens_hash_unique
  on public.jira_webhook_tokens (token_hash);

create index jira_webhook_tokens_tenant_idx
  on public.jira_webhook_tokens (tenant_id, created_at desc);

alter table public.jira_webhook_tokens enable row level security;

-- Tenant-admins manage their own webhook tokens. The public receiver reads
-- via the service-role client (bypasses RLS) — so no anon policy is granted.
create policy jira_webhook_tokens_select
  on public.jira_webhook_tokens for select to authenticated
  using (public.is_tenant_admin(tenant_id));

create policy jira_webhook_tokens_insert
  on public.jira_webhook_tokens for insert to authenticated
  with check (public.is_tenant_admin(tenant_id));

create policy jira_webhook_tokens_update
  on public.jira_webhook_tokens for update to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy jira_webhook_tokens_delete
  on public.jira_webhook_tokens for delete to authenticated
  using (public.is_tenant_admin(tenant_id));

do $smoke$
begin
  if to_regclass('public.jira_webhook_tokens') is null then
    raise exception 'smoke-fail: jira_webhook_tokens missing';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'jira_webhook_tokens_hash_unique'
  ) then
    raise exception 'smoke-fail: token hash unique index missing';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.jira_webhook_tokens'::regclass) then
    raise exception 'smoke-fail: RLS not enabled on jira_webhook_tokens';
  end if;
  raise notice 'PROJ-50 webhook-tokens smoke checks passed';
end
$smoke$;
