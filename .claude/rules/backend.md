---
paths:
  - "src/app/api/**"
  - "src/lib/supabase*"
  - "supabase/**"
---

# Backend Development Rules

## Database (Supabase)
- ALWAYS enable Row Level Security on every table
- Create RLS policies for SELECT, INSERT, UPDATE, DELETE
- Add indexes on columns used in WHERE, ORDER BY, and JOIN clauses
- Use foreign keys with ON DELETE CASCADE where appropriate
- Never skip RLS - security first

## Migration naming (MANDATORY — PROJ-134)
Migrations are applied to prod via the Supabase MCP tool `apply_migration(name, query)`
(no `supabase db push` in the standard flow). `apply_migration` writes the given
`name` verbatim as the `version` in `schema_migrations`.

- **First create the file** under `supabase/migrations/` as
  `YYYYMMDDHHMMSS_proj<N>_<snake_case_slug>.sql`, **then** call `apply_migration`
  with `name` = that exact filename stem (without `.sql`). If you let the tool
  pick its own timestamp, the registered version drifts from the repo filename
  and `supabase db push` / `supabase migration list` mis-match (PROJ-69/89/50).
- **Never reuse a 14-digit version prefix** across two files — duplicate prefixes
  break `supabase db push` (hard for non-idempotent `create table`). The
  `migration-naming` Required-Check (`npm run check:migration-naming`) hard-fails
  on collisions + malformed names and warns on seconds-precise timestamps +
  `create table` without `if not exists`.
- Prefer **minute-rastered** timestamps (`…HHMM00`) and **idempotent** DDL
  (`create table if not exists`, `create or replace function`, `drop … if exists`).
- If a registered prod version already differs from the repo filename, rename the
  **repo file to the prod version** (not the reverse) — see
  `docs/production/migration-naming.md`.

## API Routes
- Validate all inputs using Zod schemas before processing
- Always check authentication: verify user session exists
- Return meaningful error messages with appropriate HTTP status codes
- Use `.limit()` on all list queries

## Query Patterns
- Use Supabase joins instead of N+1 query loops
- Use `unstable_cache` from Next.js for rarely-changing data
- Always handle errors from Supabase responses

## Security
- Never hardcode secrets in source code
- Use environment variables for all credentials
- Validate and sanitize all user input
- Use parameterized queries (Supabase handles this)
