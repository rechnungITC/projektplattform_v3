# Migration Naming & Version-Drift Guard (PROJ-134)

Keeps MCP `apply_migration`-applied versions in sync with the repo filenames and
prevents the duplicate-version-prefix collisions that break `supabase db push`
(PROJ-69 / PROJ-89 / PROJ-50 incidents).

## The rule (also in `.claude/rules/backend.md`)

1. **Create the migration file first** under `supabase/migrations/` named
   `YYYYMMDDHHMMSS_proj<N>_<snake_case_slug>.sql`.
2. **Apply it** with `apply_migration(name = "<that filename stem, no .sql>", query = …)`.
   The `name` you pass becomes the `version` in `schema_migrations`, so it must
   equal the filename stem exactly — otherwise the tool stamps its own timestamp
   and the repo filename ↔ prod version drift apart.
3. Prefer **minute-rastered** timestamps (`…HHMM00`) and **idempotent** DDL.
4. **Never** reuse a 14-digit version prefix across two files.

## Local check (no DB / Docker)

```bash
npm run check:migration-naming
```

Pure file analysis of `supabase/migrations/*.sql`:

| Severity | Condition | AC |
|---|---|---|
| **error** (exit 1) | two files share the same 14-digit version prefix | AC-134.2 |
| **error** (exit 1) | filename ≠ `^\d{14}_[a-z0-9_]+\.sql$` | AC-134.3 |
| warning | seconds-precise timestamp (`SS != 00`) | AC-134.3 |
| warning | version prefixes not strictly ascending | AC-134.3 |
| warning | `create table` without `if not exists` | AC-134.4 |

Warnings never fail the build; only errors (collisions / malformed names) do.

## CI

`.github/workflows/migration-naming.yml` runs the same check on every PR to
`main` (and on push to `main`) as the **Required-Check `migration-naming`**.
No database — it is pure filename/content analysis, so it is fast and needs no
secrets (consistent with the "never check against prod in CI" rule from
`schema-drift-local.md`).

## Fixing drift (repo filename ≠ prod version)

If a migration's repo filename prefix does not match its registered
`schema_migrations.version`, **rename the repo file to the prod version**
(keep the slug). Renaming prod to match the repo would re-register/re-run the
migration. Verify with a read-only query:

```sql
select version, name from supabase_migrations.schema_migrations
where name ilike '%<slug>%' order by version;
```

Then `git mv 2026…_<slug>.sql <prod_version>_<slug>.sql` and re-run the check.

> **Do not** cosmetically rename a migration whose filename already matches its
> prod version (e.g. just to minute-raster a seconds-precise timestamp) — that
> would re-introduce repo↔prod drift. Seconds-precise existing migrations are a
> warning only.

## Deferred (β, PROJ-134 AC-134.7)

A read-only prod-audit script (`schema_migrations.version` vs all repo filenames,
run manually/cron with a prod read token) — **not** a Required-Check, to avoid
prod credentials in CI.
