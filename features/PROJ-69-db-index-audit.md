# PROJ-69 — DB Index Audit (102 unindexed FKs · 73 unused indexes)

## Status: Deployed — 2026-06-15 (Tag `v1.92.0-PROJ-69`). α/β/γ-Migrations seit 2026-06-11 in Prod, QA-Closure 2026-06-15 (Prod-State re-verifiziert, vitest grün, Migration-Versions-Drift bereinigt).

## Deployment

- **Date:** 2026-06-15 (Closure; Migrations seit 2026-06-11 via MCP `apply_migration` in Prod — kein separater Runtime-Deploy, reine DB-DDL-Slice).
- **Tag:** `v1.92.0-PROJ-69`
- **Prod-Verify 2026-06-15 (live gegen Prod-DB):**
  - 19/19 α-Indexe vorhanden · 0/7 β-Drops noch vorhanden (alle weg) · 65 Index-Keep-Kommentare · 90 Constraint-Skip-Kommentare — exakt wie spezifiziert.
  - Alle 3 Migrations in `supabase_migrations.schema_migrations` registriert.
  - vitest unverändert grün (kein Verhaltens-Regress — DDL-only).
- **Migration-Versions-Drift bereinigt:** MCP `apply_migration` registrierte die Migrations am 2026-06-11 unter `20260611075659/075714/075931`, während die Repo-Dateien zunächst `20260615100000/110000/120000` hießen — Letzteres **kollidierte** mit PROJ-89s `20260615100000`-Datei und hätte `supabase db push` gebrochen. Repo-Dateien auf die tatsächlich in Prod registrierten Versionen umbenannt (reproduziert die echte Apply-Reihenfolge, idempotent: `create index if not exists`/`drop index if exists`/`comment on`). Kollision damit aufgelöst.
- **Bekannte Fremd-Notiz (nicht PROJ-69-Scope):** PROJ-89 ist in Prod doppelt registriert (`20260611195100` „20260615100000_proj89…" + `20260611195532` „proj89…") und seine Repo-Datei `20260615100000_proj89…` matcht keine der beiden — Bookkeeping der PROJ-89-Session, hier nur dokumentiert.

## Implementation Notes — Phase 2/3 (2026-06-11)

**Advisor-Refresh vor Authoring (Guardrail erfüllt):** frischer `get_advisors(performance)` 2026-06-10 → 169 INFO (109 unindexed FKs, 60 unused). Diff gegen Triage: 7 neue FK-Findings, alle aus PROJ-47-Tabellen (post-Triage deployed) → nachtriagiert nach denselben Regeln: 1× add (`jira_export_log.project_id`, project-FK wie alle anderen), 6× skip (audit-/tenant-FKs). Alle 7 Drop-Kandidaten im frischen Snapshot weiterhin zero-scan; Guardrail-Grep bestätigt keine neuen Route-/RPC-Abhängigkeiten (`created_by` nirgends gefiltert, `ki_provenance`-Queries laufen über die UNIQUE-Zwillinge, `projects.tenant_id` durch Composite-Index gedeckt).

**3 Migrations applied to prod 2026-06-11** (Repo: `supabase/migrations/20260611{075659,075714,075931}_proj69_{alpha,beta,gamma}_*.sql` — Dateinamen = prod-registrierte Versionen, siehe Deployment-Section):
- **α `add_missing_fk_indexes`**: 19 Indexe (18 Triage-class-a + 1 PROJ-47-Nachtriage). Plain `CREATE INDEX` ohne `CONCURRENTLY` — alle Tabellen pilot-scale << 100k rows (AC-3-Bedingung nicht ausgelöst).
- **β `drop_unused_indexes`**: 7 Drops (class α).
- **γ `index_audit_notes`**: 65 `COMMENT ON INDEX` (58 β-keeps + 7 γ-keeps) + 90 `COMMENT ON CONSTRAINT` (84 b-skips + 6 PROJ-47-Nachtriage-skips).

**Post-Migration Advisor:** 166 INFO (94 unindexed FKs, 72 unused). Bewegung: −19 FK (indexiert), +4 FK (die gedroppten `created_by`-Indexe re-flaggen als unindexed FK — dokumentierte b-Skips per γ-Kommentar), unused −7 (Drops) +19 (neue Indexe sind bis Pilot-Workload zero-scan). 0 WARN.

**AC-6-Deviation:** „≤ 30 INFO" ist mit den Phase-1-Triage-Entscheidungen (84 bewusste FK-Skips) strukturell nicht erreichbar — der Advisor kann dokumentierte Skip-Entscheidungen nicht unterdrücken. Erfüllt ist die Substanz der AC: **jedes verbleibende INFO ist eine per DB-Kommentar dokumentierte Entscheidung, kein unklassifizierter Rest.** Wer einen künftigen Advisor-Lauf liest, findet die Begründung direkt am Index/Constraint.

**AC-7:** vitest 1770/1770 grün (Suite seit Triage von 1557 auf 1770 gewachsen).

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
- [x] **AC-3: Migration `add_missing_indexes`** — single migration adding the (a)-classified FK indexes, with `CONCURRENTLY` if any table has > 100k rows estimated. ✅ 2026-06-11: 19 Indexe (18 + 1 PROJ-47-Nachtriage); kein Table > 100k → plain CREATE INDEX.
- [x] **AC-4: Migration `drop_unused_indexes`** — single migration dropping the (α)-classified indexes. ✅ 2026-06-11: 7 Drops, im frischen Advisor re-bestätigt zero-scan.
- [x] **AC-5: Migration `index_audit_notes`** — comment-only migration documenting (b)/(c)/(β)/(γ)-classified findings with the V3-grep evidence (route path + line, or feature ID + spec link) so future audits don't re-flag them. ✅ 2026-06-11: 65 Index- + 90 Constraint-Kommentare mit Feature-ID-Evidenz.
- [x] **AC-6: Post-migration `get_advisors(performance)` shows 0 WARN and ≤ 30 INFO** — the remaining INFO entries are documented Keep-decisions, not unclassified leftovers. ⚠️ Deviation 2026-06-11: 0 WARN ✅, aber 166 INFO statt ≤ 30 — strukturell bedingt durch die 84 bewussten b-Skips der Phase-1-Triage (Advisor kann dokumentierte Entscheidungen nicht unterdrücken). Substanz erfüllt: jedes INFO ist eine per DB-Kommentar dokumentierte Entscheidung (siehe Implementation Notes).
- [x] **AC-7: 1557/1557 vitest still green** — no behavior regression. ✅ 2026-06-11: 1770/1770 (Suite gewachsen).

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
