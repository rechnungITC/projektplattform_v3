#!/usr/bin/env bash
#
# PROJ-67 F6 / AC-6: local schema-drift check against a fresh Docker shadow DB.
# Mirrors .github/workflows/schema-drift.yml (provisioning SQL and migration
# tolerance are duplicated there — keep both in sync when editing).
#
# Usage:
#   ./scripts/check-schema-drift/local-shadow.sh           # full run + teardown
#   KEEP_SHADOW=1 ./scripts/check-schema-drift/local-shadow.sh   # leave container running
#
# Requirements: Docker (on WSL2: Docker Desktop with WSL integration enabled),
# npm dependencies installed (npm ci). See docs/production/schema-drift-local.md.

set -euo pipefail

CONTAINER=pv3-shadow-db
PORT="${SHADOW_DB_PORT:-54329}"
export PGPASSWORD=test

# `command -v docker` is not enough on WSL2: Docker Desktop installs a Windows
# shim that is on PATH but only prints an enable-integration hint. `docker info`
# proves there is a reachable daemon.
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: no working docker daemon. On WSL2, enable Docker Desktop > Settings >" >&2
  echo "Resources > WSL Integration for this distro. Alternatively run the" >&2
  echo "manual DATABASE_URL path from docs/production/schema-drift-local.md." >&2
  exit 1
fi

cleanup() {
  if [ "${KEEP_SHADOW:-0}" != "1" ]; then
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  else
    echo "KEEP_SHADOW=1 — container '$CONTAINER' left running on port $PORT."
  fi
}
trap cleanup EXIT

echo "==> Starting fresh postgres:17 shadow DB on port $PORT"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
# Bind to loopback only — this throwaway DB uses a trivial password; never
# expose it on 0.0.0.0 where it would be reachable from the LAN during the run.
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=test -p "127.0.0.1:$PORT:5432" postgres:17 >/dev/null

echo "==> Waiting for postgres to accept connections"
for _ in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$CONTAINER" pg_isready -U postgres >/dev/null

psql_shadow() {
  docker exec -i -e PGPASSWORD=test "$CONTAINER" psql -U postgres -d postgres "$@"
}

echo "==> Provisioning Supabase stubs (roles, auth/storage/extensions schemas)"
psql_shadow -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz default now()
);
create or replace function auth.uid() returns uuid
  language sql stable
  as $$ select null::uuid $$;
create or replace function auth.jwt() returns jsonb
  language sql stable
  as $$ select '{}'::jsonb $$;
create or replace function auth.role() returns text
  language sql stable
  as $$ select 'service_role'::text $$;

create schema if not exists extensions;
create extension if not exists moddatetime schema extensions;

create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text,
  public boolean default false,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table storage.objects enable row level security;
SQL

echo "==> Applying migrations (REVOKE/GRANT-on-missing-function tolerated, like CI)"
count=0; warnings=0; failures=0
mkdir -p /tmp/drift-apply-local
for f in supabase/migrations/*.sql; do
  base=$(basename "$f")
  log=/tmp/drift-apply-local/${base}.log
  if psql_shadow -v ON_ERROR_STOP=1 < "$f" > "$log" 2>&1; then
    count=$((count + 1))
  else
    if grep -qE "ERROR:.*function.*does not exist" "$log"; then
      echo "WARN  $base: REVOKE/GRANT on missing function (pre-existing drift, tolerated)"
      warnings=$((warnings + 1))
    else
      echo "FAIL  $base:"
      tail -10 "$log"
      failures=$((failures + 1))
    fi
  fi
done
echo "Applied $count migration(s); $warnings tolerated warnings; $failures structural failures."
if [ "$failures" -gt 0 ]; then
  exit 1
fi

echo "==> Running schema-drift check"
DATABASE_URL="postgresql://postgres:test@localhost:$PORT/postgres" npm run check:schema-drift
