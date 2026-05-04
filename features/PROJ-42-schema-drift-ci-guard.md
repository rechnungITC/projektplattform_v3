# PROJ-42 — Schema-Drift-CI-Guard

## Status: Planned (stub — to be expanded via /requirements)

## Origin

Reaction to the 2026-05-04 production incident (PROJ-36 α-revert / γ-deploy drift). The γ-frontend was deployed with `useWorkItems` selecting columns from a migration that had been reverted before reaching production. PostgREST returned 42703; the hook silently swallowed it; the backlog rendered empty for hours before being noticed. Hotfix `276d384` and PROJ-36-α re-deploy `20260504400000` closed the symptom and the schema gap. **PROJ-42 is the systemic fix**: detect this class of drift before it can ship.

## Problem statement

Frontend hooks and API routes hard-code SELECT column lists against Supabase tables. There is currently no automated check that those columns actually exist in the migrated DB schema. The same is true for `route.ts` Zod-schemas that imply DB columns. A reverted migration, a renamed column, or a mistyped identifier all surface only at runtime — and only loudly if error handling allows it.

## Proposed solution (CIA-suggested)

Pre-merge CI job (Vitest + Supabase CLI) that:

1. Spins up a clean Postgres via `supabase db reset` and applies all migrations in `supabase/migrations/`.
2. Dumps `information_schema.columns` for the `public` schema into a JSON file.
3. Parses every `.from("<table>").select("<columns>")` call in `src/` (TypeScript AST, not regex — handles multi-line strings and nested calls).
4. For each call, verifies that every column name appears in the dump for that table.
5. CI fails on first mismatch with file path + line number + missing column.

Bonus scope (P1, may be split into PROJ-42b):

- Same check for Zod-schemas in `src/app/api/**/route.ts` and `src/app/api/**/_schema.ts` — the zod schema field names should map to existing DB columns when the schema is used as an `.update()` or `.insert()` payload.
- Drift report against the deployed production schema (via `mcp__supabase__list_tables`) — flags when `main` is ahead of prod even when `main` is internally consistent.

## Success criteria

- A CI job that fails on the exact drift class that caused the 2026-05-04 incident.
- Run-time < 60s on the standard CI runner (so it's not skipped).
- Zero false-positives on the current `main` (after PROJ-36 α re-deploy).
- Zero false-negatives on a synthetic drift commit (test fixture).

## Non-goals

- Replacing tsc / eslint type-checks.
- Schema-validation for tenant-runtime data (that's RLS + Zod's job).
- Detecting drift between different tenants' DB states.

## Dependencies

- None blocking. Sits independently on top of the existing migration + Vitest stack.

## Estimated effort

CIA estimate: ~1 PT (P1, P0 blocker für nächsten Schema-Slice).

## Promotion path

Run `/requirements` with this stub as input to expand into a full PROJ-42 spec (acceptance criteria, edge cases, technical requirements, V2 reference material). Then `/architecture` for the AST-walker design.
