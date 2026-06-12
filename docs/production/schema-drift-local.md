# Schema-Drift Check — Local Runbook (PROJ-67 F6)

`npm run check:schema-drift` (PROJ-42) compares the `.from(...).select(...)` calls in
`src/` against `information_schema.columns` of a **freshly migrated** Postgres.
In CI this runs as the required check "Verify SELECT columns vs migration schema"
against a Docker service container. Locally it fails fast with
`schema-drift: DATABASE_URL is not set` — this runbook documents the two local paths.

## Path A — automated Docker shadow DB (recommended)

```bash
./scripts/check-schema-drift/local-shadow.sh
```

The script mirrors the CI workflow:

1. starts a throwaway `postgres:17` container (`pv3-shadow-db`, port `54329`),
2. provisions the Supabase stubs (roles `anon`/`authenticated`/`service_role`,
   `auth`/`storage`/`extensions` schemas, `auth.uid()/jwt()/role()` helpers),
3. applies all `supabase/migrations/*.sql` with the same tolerance as CI
   (REVOKE/GRANT on a missing function is a warning, anything else fails),
4. runs `npm run check:schema-drift` with `DATABASE_URL` pointing at the container,
5. removes the container (keep it with `KEEP_SHADOW=1`, change port with `SHADOW_DB_PORT`).

**WSL2 prerequisite:** Docker Desktop must have WSL integration enabled for this
distro (Docker Desktop → Settings → Resources → WSL Integration). Without it,
`docker` is not on PATH inside WSL and the script aborts with a pointer here.

## Path B — manual `DATABASE_URL` against any fresh Postgres

If you have a local Postgres 17 (or any reachable instance you may freely write to):

```bash
# 1. provision stubs + apply migrations (see local-shadow.sh for the exact SQL), then:
export DATABASE_URL="postgresql://<user>:<pass>@<host>:<port>/<db>"
npm run check:schema-drift
```

The target DB **must** be freshly migrated from `supabase/migrations/` — pointing
`DATABASE_URL` at the production Supabase instance is wrong twice: it can contain
hotfix drift the repo doesn't have yet (false negatives), and the check is meant
to validate the *repo's* migration chain, not prod.

## Sync warning

The provisioning SQL and the migration-tolerance logic exist twice:
`.github/workflows/schema-drift.yml` (CI) and `scripts/check-schema-drift/local-shadow.sh`
(local). When you change one, change the other.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `schema-drift: DATABASE_URL is not set` | You ran the npm script directly — use Path A, or export `DATABASE_URL` (Path B). |
| `docker: command not found` (WSL2) | Enable Docker Desktop WSL integration, or use Path B. |
| Port conflict on 54329 | `SHADOW_DB_PORT=55555 ./scripts/check-schema-drift/local-shadow.sh` |
| Migration fails with `function ... does not exist` | Tolerated (pre-existing REVOKE/GRANT drift, same as CI). Any other migration error is a real structural problem — fix the migration. |
