# PROJ-69 — DB Index Audit (102 unindexed FKs · 73 unused indexes)

## Status: In Progress (Phase 1 triage completed 2026-05-31; alpha/beta/gamma migrations pending)

**Created:** 2026-05-29
**Origin:** Supabase advisor sweep 2026-05-29 post-PROJ-68 — 175 INFO-level performance findings (37 WARN-level all resolved by PROJ-68).
**Related:** PROJ-29 (Hygiene-Slice), PROJ-42 (Schema-Drift), PROJ-68 (RLS-Hygiene).

## Problem Statement

After PROJ-68 cleared 37 WARN-level performance lints, Supabase's database linter still reports **175 INFO** entries in two clusters:

- **102× `unindexed_foreign_keys`** — FK columns without a covering index. Penalizes DELETE/UPDATE on the parent table (the referenced row's deletion has to scan the child table) and JOIN queries that filter on the FK.
- **73× `unused_index`** — indexes that PostgreSQL's stats counters show have never been used since `pg_stat_reset_*` was last called. These are storage + write-cost overhead with zero read-benefit.

Both clusters are **INFO not WARN** for a reason: Supabase can't tell at lint-time whether a missing FK index will hurt our actual workload (depends on DELETE patterns) or whether an "unused" index is just waiting for a feature that hasn't shipped yet. This slice is **workload-driven cleanup**, not mechanical fix.

## Why this is a separate slice

The mechanical PROJ-68 pattern (drop policy / wrap with SELECT / split FOR ALL) doesn't translate here:

| Question | Mechanical fix can't decide |
|---|---|
| Should `decisions.responsible_user_id` get an index? | Depends on how often we DELETE users (rare) vs. how often we filter decisions by user (frequent in audit) |
| Should `projects_parent_project_id_idx` stay? | Used by PROJ-65 ε.4.γ `cross_project_links` for parent/children scans; "unused" stats might predate ε.4.γ deploy |
| Should `audit_log_entries_*_idx` stay? | Used only by admin audit-export which is monthly — never trips daily stats |

The slice produces a **triaged list per finding**, then a small set of follow-up migrations — not one big "drop everything unused" sweep.

## Findings (snapshot 2026-05-30 post-PROJ-68)

**Phase 1 update 2026-05-31:** read-only production catalog triage captured in [`docs/db-index-audit-2026-05-30.md`](../docs/db-index-audit-2026-05-30.md). Current catalog rows: 102 unindexed FKs, 72 non-unique zero-scan indexes, 18 zero-scan unique constraints kept out of the drop set. The original Supabase advisor snapshot reported 73 `unused_index` INFOs; Phase 2/3 must refresh `get_advisors(performance)` immediately before migration authoring.

### 102 unindexed FKs — top tables

| Table | FKs without index |
|---|---|
| `decisions` | 5 |
| `assistant_action_events` | 3 |
| `assistant_turns` | 3 |
| `budget_items` | 3 |
| `budget_postings` | 3 |
| `decision_approval_events` | 3 |
| `open_items` | 3 |
| `resources` | 3 |
| `stakeholder_coaching_recommendations` | 3 |
| `stakeholder_profile_audit_events` | 3 |
| _… 49 more tables, 1–2 each_ | 73 |

### 73 unused indexes — top tables

| Table | Unused indexes | Sample |
|---|---|---|
| `projects` | 4 | `projects_parent_project_id_idx`, `projects_tenant_id_idx` |
| `stakeholders` | 4 | |
| `work_item_links` | 4 | |
| `project_goals` | 4 | |
| `ki_runs` | 3 | |
| `work_items` | 3 | |
| `audit_log_entries` | 3 | |
| `vendor_invoices` | 3 | |
| _… 34 more tables, 1–2 each_ | ~45 |

## Acceptance Criteria

- [x] **AC-1: Workload classification** — every unindexed FK is classified as one of:
  - **(a) Add index** — referenced via JOIN or used in a `WHERE fk_col = ?` filter found in ≥ 1 production route or RPC.
  - **(b) Skip — DELETE rare** — parent table has a `created_at`-only RLS pattern (deletes only happen via tenant offboarding); FK scan acceptable.
  - **(c) Skip — denormalized scan acceptable** — child table small (< 10k rows projected at pilot scale).
- [x] **AC-2: Index classification** — every unused index is classified as one of:
  - **(α) Drop** — no route, no RPC, no test references the indexed column in a filter/JOIN; stats show zero scans across all envs.
  - **(β) Keep — feature-pending** — references a column used by a Planned/Architected feature in INDEX.md.
  - **(γ) Keep — admin/cron only** — used by audit-export / cron jobs that don't hit daily stats.
- [ ] **AC-3: Migration `add_missing_indexes`** — single migration adding the (a)-classified FK indexes, with `CONCURRENTLY` if any table has > 100k rows estimated.
- [ ] **AC-4: Migration `drop_unused_indexes`** — single migration dropping the (α)-classified indexes.
- [ ] **AC-5: Migration `index_audit_notes`** — comment-only migration documenting (b)/(c)/(β)/(γ)-classified findings with the V3-grep evidence (route path + line, or feature ID + spec link) so future audits don't re-flag them.
- [ ] **AC-6: Post-migration `get_advisors(performance)` shows 0 WARN and ≤ 30 INFO** — the remaining INFO entries are documented Keep-decisions, not unclassified leftovers.
- [ ] **AC-7: 1557/1557 vitest still green** — no behavior regression.

## Non-Goals

- ❌ Index-tuning beyond the linter findings (composite indexes, expression indexes, partial indexes for hot paths) — separate optimization slice when pilot load shows hot spots.
- ❌ Index rebuild / REINDEX / VACUUM FULL — Supabase manages autovacuum; manual rebuild only on demonstrated bloat.
- ❌ `ltree extension_in_public` move — that's PROJ-?? extension-hygiene slice with its own migration risk.
- ❌ Materialized views or table partitioning — not lint-driven; out of scope.

## Suggested Implementation Plan

**3 phases over ~1.5 PT:**

### Phase 1 — Classification sweep (0.5 PT)

For each of 175 findings:
1. Pull the column name from `pg_constraint` / `pg_index`
2. Grep `src/` for the column name in: `.from('<table>')... .eq('<column>'`, `.from('<table>')... .filter('<column>'`, and `where <column> =` inside `*.sql`
3. Cross-reference with `features/INDEX.md` for Planned-feature dependencies
4. Tag each finding with (a)/(b)/(c) or (α)/(β)/(γ) + 1-line evidence comment

Output: a `docs/db-index-audit-2026-05-30.md` triage table. **Done 2026-05-31** — 102 FK rows classified (18 add-index, 84 skip/delete-rare); 72 current non-unique zero-scan indexes classified (7 drop, 58 feature-pending keep, 7 admin/cron keep); 18 zero-scan unique constraints excluded from drop candidates.

### Phase 2 — Apply add-index migration (0.5 PT)

```sql
-- 20260601100000_proj69_alpha_add_missing_fk_indexes.sql
-- Pattern: `create index concurrently if not exists <table>_<col>_idx on <table>(<col>);`
-- ~50 expected indexes after Phase-1 triage; CONCURRENTLY to avoid blocking
```

### Phase 3 — Apply drop-unused migration + audit-notes (0.5 PT)

```sql
-- 20260601110000_proj69_beta_drop_unused_indexes.sql
-- Pattern: `drop index concurrently if exists <idx>;`
-- ~30 expected drops after Phase-1 triage

-- 20260601120000_proj69_gamma_index_audit_notes.sql
-- Pattern: `comment on index <idx> is 'PROJ-69 keep: <reason>';`
```

## QA Plan

```bash
# Pre-Phase-1
mcp__supabase__get_advisors --type performance  # 175 INFO

# After Phase 1 (triage doc only, no DB change)
# Review docs/db-index-audit-2026-05-30.md with user

# After Phase 2
mcp__supabase__get_advisors --type performance  # < 102 unindexed_foreign_keys
# Smoke: pg_stat_user_indexes shows new indexes exist

# After Phase 3
mcp__supabase__get_advisors --type performance  # < 30 INFO total
npm test                                         # 1557/1557 still green
```

## Risk

- **Wrong (α) classification → drop an index that's actually used:** Mitigation — Phase 1 cross-references `git grep` + `git log -- supabase/migrations/*.sql` for index creation context (often the original migration's comment block explains *why* the index was created).
- **`CONCURRENTLY` requires the migration to run outside transaction:** Mitigation — split add-index into its own migration file; the apply_migration MCP handles per-statement transaction wrapping correctly.
- **Stats-counter reset hides legitimate "feature pending" indexes:** Mitigation — for any index < 30 days old (post-PROJ-65 ε.4.γ shipped 2026-05-29), default to **Keep** classification.

## Out of scope (already deployed in PROJ-68)

- ✅ `auth_rls_initplan` (12 policies)
- ✅ `multiple_permissive_policies` (5 clusters)
- ✅ `anon_security_definer_function_executable` (3 trigger fns)
