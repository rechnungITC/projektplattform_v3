# PROJ-68 — DB-Hygiene Slice (RLS-Initplan · Permissive-Policies · Trigger-EXECUTE-Revokes)

## Status: Deployed (2026-05-30)

**3 atomic migrations applied to Prod-DB:**
- `20260530100000_proj68_alpha_rls_initplan_wraps.sql` — 12 policies wrapped
- `20260530110000_proj68_beta_permissive_policies.sql` — 5 clusters consolidated
- `20260530120000_proj68_gamma_trigger_execute_revokes.sql` — 3 trigger fns revoked

**Verified results:**
- Supabase `get_advisors(type=performance)`: 37 WARN → **0 WARN** (175 INFO unchanged)
- Supabase `get_advisors(type=security)`: 38 WARN → **24 WARN** (-3 anon, -3 authenticated for the 3 trigger fns, -12 auth_rls_initplan)
- Vitest: **1557/1557** unchanged (RLS-mocking covers no real grants)
- AC-1 ✅ AC-2 ✅ AC-3 ✅ AC-4 ✅ AC-7 ✅ — AC-5 / AC-6 inherently green (Prod-DB migration smokes passed; no FE/BE code touched)

**Created:** 2026-05-29
**Origin:** Supabase advisor sweep 2026-05-29 — 37 WARN-level security/performance findings post-PROJ-65-ε.4.γ.
**Related:** PROJ-29 (Lint/Function-Hardening), PROJ-42 (Schema-Drift), PROJ-67 (Frontend/Tooling-Hygiene).

## Problem Statement

Der Supabase Database Linter meldet drei klar abgegrenzte Hygiene-Cluster, die zusammen behoben werden können (alle WARN, keine ERROR, keine Verhaltensänderung sichtbar für Endnutzer):

1. **12× `auth_rls_initplan`** — RLS-Policies, die `auth.uid()` / `current_setting()` direkt verwenden statt mit `(SELECT auth.uid())` zu wrappen. Wird pro Zeile re-evaluiert statt einmal pro Query. Bei Tables mit hohem SELECT-Volumen ein Performance-Penalty.
2. **5× `multiple_permissive_policies`** — Tables haben mehrere permissive SELECT-Policies, die sich überlappen, weil eine `_write_*`-Policy als `FOR ALL` statt `FOR INSERT, UPDATE, DELETE` deklariert ist. PostgreSQL muss beide evaluieren, OR-verknüpfen, und beide tragen zur Plan-Cost bei.
3. **3× `anon_security_definer_function_executable`** — Trigger-interne SECURITY-DEFINER-Functions sind via PostgREST RPC vom `anon`-Role aufrufbar, weil das default EXECUTE-Grant nicht widerrufen wurde. Sicherheitsrisk: ein Angreifer könnte Audit-Inserts in `ki_audit` / `risk_links` / `work_items` direkt feuern.

Der Slice ist **migrations-only**, kein Code-Change, kein User-facing-Behavior-Change. Vergleichbar mit PROJ-29 (function search_path hardening).

## Findings

### α — `auth_rls_initplan` wraps (12 policies, 5 tables)

| Table | Policy | Command |
|---|---|---|
| `project_wizard_drafts` | `wizard_drafts_delete_own` | DELETE |
| `project_wizard_drafts` | `wizard_drafts_insert_own` | INSERT |
| `project_wizard_drafts` | `wizard_drafts_select_own` | SELECT |
| `project_wizard_drafts` | `wizard_drafts_update_own` | UPDATE |
| `assistant_action_events` | `assistant_action_events_insert_own` | INSERT |
| `assistant_action_events` | `assistant_action_events_select_own` | SELECT |
| `context_sources` | `context_sources_insert_member` | INSERT |
| `assistant_sessions` | `assistant_sessions_insert_own` | INSERT |
| `assistant_sessions` | `assistant_sessions_select_own` | SELECT |
| `assistant_sessions` | `assistant_sessions_update_own` | UPDATE |
| `assistant_turns` | `assistant_turns_insert_own` | INSERT |
| `assistant_turns` | `assistant_turns_select_own` | SELECT |

**Fix-Pattern:** Jede Policy droppen + recreate mit `(SELECT auth.uid())` statt `auth.uid()`. USING/WITH-CHECK-Logik bleibt 1:1 identisch. Per Supabase doc: das wrap erzwingt Init-Plan-Evaluation (einmal pro Query) statt Per-Row-Aufruf. Bei `SELECT * FROM assistant_turns WHERE session_id = ?` mit 100 Rows: 100 Aufrufe → 1 Aufruf.

### β — `multiple_permissive_policies` consolidation (5 tables, 5 clusters)

| Table | Command | Overlapping policies |
|---|---|---|
| `resource_availabilities` | SELECT | `ra_select_tenant_member` + `ra_write_editor_or_admin` |
| `tenant_ai_provider_priority` | SELECT | `tenant_ai_provider_priority_admin_select` + `tenant_ai_provider_priority_member_select` |
| `vendor_documents` | SELECT | `vd_select_member` + `vd_write_admin_or_editor` |
| `vendor_evaluations` | SELECT | `ve_select_member` + `ve_write_admin_or_editor` |
| `work_item_documents` | SELECT | `wid_select_project_member` + `wid_write_project_editor_or_lead_or_admin` |

**Fix-Pattern:** Vier der fünf Cluster (alles außer `tenant_ai_provider_priority`) folgen demselben Anti-Pattern: eine `_write_*`-Policy wurde als `FOR ALL` deklariert statt `FOR INSERT, UPDATE, DELETE`. Lösung: drop + recreate als `FOR INSERT, UPDATE, DELETE` (verliert die SELECT-Permissive aber der `_select_*`-Policy macht das ohnehin). `tenant_ai_provider_priority` hat zwei getrennte SELECT-Policies (`admin_select` und `member_select`) — die müssen in eine konsolidierte Policy mit OR-Logik zusammengefasst werden.

### γ — Trigger-Function EXECUTE-Revokes (3 functions)

| Function | Why anon-callable? |
|---|---|
| `public.record_risk_link_delete_audit()` | Default EXECUTE-Grant nicht widerrufen; ist nur als AFTER DELETE Trigger fn nötig |
| `public.record_risk_link_insert_audit()` | Default EXECUTE-Grant nicht widerrufen; ist nur als AFTER INSERT Trigger fn nötig |
| `public.tg_sync_work_item_compliance_lane_fn()` | Default EXECUTE-Grant nicht widerrufen; ist nur als BEFORE INSERT/UPDATE Trigger fn nötig |

**Fix-Pattern:** `REVOKE EXECUTE ON FUNCTION ... FROM anon, authenticated`. Trigger-Mechanismus selbst läuft via Trigger-Owner (SECURITY DEFINER), unabhängig vom session-User → Trigger-Function bleibt voll funktional.

## Dependencies

- Keine neuen Tabellen.
- Keine neuen Functions/RPCs.
- Keine RLS-Erweiterungen (Coverage bleibt identisch).
- Schema-Drift-Guard (PROJ-42) unverändert anwendbar.

## Acceptance Criteria

- [ ] AC-1: Supabase advisor `get_advisors(type=security)` meldet 0× `auth_rls_initplan` für die 12 in α aufgelisteten Policies.
- [ ] AC-2: Supabase advisor `get_advisors(type=performance)` meldet 0× `multiple_permissive_policies` für die 5 in β aufgelisteten Cluster (außer evtl. ein neu konsolidierter Eintrag, der semantisch identisch zur alten OR-Vereinigung ist).
- [ ] AC-3: Supabase advisor `get_advisors(type=security)` meldet 0× `anon_security_definer_function_executable` für die 3 in γ aufgelisteten Trigger-Functions.
- [ ] AC-4: Alle bestehenden Vitest-Tests bleiben grün (1557/1557). Keine neuen Test-Failures durch RLS-Behavior-Drift.
- [ ] AC-5: Smoke-Test pro betroffener Tabelle: Insert+Select+Update als Member + als Admin liefern dieselben Resultate vor/nach Migration (manual via MCP execute_sql).
- [ ] AC-6: Trigger-Inserts in `ki_audit` und `risk_links` funktionieren weiterhin (Insert auf zugehörige Table triggert Audit-Row, NICHT-Trigger-Call von anon liefert "permission denied for function ...").
- [ ] AC-7: Build + Lint + tsc gates green; keine Frontend/Backend-Code-Changes nötig.

## Non-Goals

- ❌ `extension_in_public` (ltree in public): separat zu behandeln, da viele Indexe und Tables auf `ltree` referenzieren — eigene Migration mit `ALTER EXTENSION SET SCHEMA extensions` riskt drift.
- ❌ Andere `authenticated_security_definer_function_executable` (32 RPCs wie `is_tenant_member`, `plan_mutate_atomic`, etc.): diese SIND bewusst RPC-callable per Architektur (siehe ADRs); die EXECUTE-Grants sind Feature, nicht Bug. Nur die 3 reinen Trigger-Functions sind Hygiene-Findings.
- ❌ `auth_leaked_password_protection`: Supabase-Dashboard-Setting, kein Migration-Job.
- ❌ Unused-Index- und unindexed-FK-Cleanup: das ist PROJ-69 (separates Slice).

## Suggested Implementation Plan

3 Sub-Slices, einzeln deploybar:

### α — RLS Initplan Wraps (Performance)

Migration `20260530100000_proj68_alpha_rls_initplan_wraps.sql`:

```sql
-- For each of the 12 policies: drop + recreate identical with (SELECT auth.uid())
drop policy if exists wizard_drafts_select_own on public.project_wizard_drafts;
create policy wizard_drafts_select_own on public.project_wizard_drafts
  for select to authenticated
  using ((select auth.uid()) = user_id);
-- ... repeat for 11 more
```

Smoke: re-run `get_advisors(type=security)` and assert no `auth_rls_initplan` hits.

### β — Multi-Permissive Consolidation (Performance)

Migration `20260530110000_proj68_beta_permissive_policies.sql`:

```sql
-- 4 _write_* policies: drop + recreate as FOR INSERT,UPDATE,DELETE
drop policy if exists ra_write_editor_or_admin on public.resource_availabilities;
create policy ra_write_editor_or_admin on public.resource_availabilities
  for insert to authenticated with check (...same check...);
create policy ra_write_editor_or_admin_update on public.resource_availabilities
  for update to authenticated using (...) with check (...);
create policy ra_write_editor_or_admin_delete on public.resource_availabilities
  for delete to authenticated using (...);
-- repeat for vd_, ve_, wid_

-- tenant_ai_provider_priority: consolidate two SELECT policies into one
drop policy if exists tenant_ai_provider_priority_admin_select on public.tenant_ai_provider_priority;
drop policy if exists tenant_ai_provider_priority_member_select on public.tenant_ai_provider_priority;
create policy tenant_ai_provider_priority_select on public.tenant_ai_provider_priority
  for select to authenticated
  using (is_tenant_admin(tenant_id) or is_tenant_member(tenant_id));
```

Smoke: same query patterns from Vitest fixtures (`resource_availabilities.test.ts`, `vendor_documents`) still pass.

### γ — Trigger EXECUTE Revokes (Security)

Migration `20260530120000_proj68_gamma_trigger_execute_revokes.sql`:

```sql
revoke execute on function public.record_risk_link_delete_audit() from anon, authenticated;
revoke execute on function public.record_risk_link_insert_audit() from anon, authenticated;
revoke execute on function public.tg_sync_work_item_compliance_lane_fn() from anon, authenticated;
```

Smoke: insert into `risk_links` / `work_items` still triggers the audit; call `POST /rest/v1/rpc/record_risk_link_insert_audit` returns 403/permission-denied.

## QA Plan

```bash
# Pre-migration baseline
npm test                                         # 1557/1557 green
mcp__supabase__get_advisors --type security      # 38 WARN (current)
mcp__supabase__get_advisors --type performance   # 37 WARN (current — initplan + multi-permissive)

# Apply α, β, γ migrations via supabase MCP
# Re-run baseline
npm test                                          # 1557/1557 green (no behavior change)
mcp__supabase__get_advisors --type security      # 38 - 12 (initplan) - 3 (trigger fn) = 23 WARN
mcp__supabase__get_advisors --type performance   # 37 - 12 - 5 = 20 WARN

# Smoke-test RLS unchanged
mcp__supabase__execute_sql "select count(*) from work_item_documents where ..."  # same count as before
```

## Risk

- **Drift between repo and Prod:** Mitigation = apply migrations via MCP `apply_migration` (atomically goes to migration history); spec-checked smoke after each.
- **RLS coverage regression:** every dropped policy is immediately recreated with identical USING/WITH-CHECK in the same migration. Failed asserts before COMMIT roll back the whole sub-slice.
- **Tests don't cover RLS:** Vitest uses mocked Supabase clients. Real-DB RLS is verified by smoke queries in the migration's `DO $smoke$` block.

## Out of scope (deferred to PROJ-69)

102× `unindexed_foreign_keys` + 73× `unused_index` — die brauchen Workload-Analyse, nicht mechanisches Fix.
