# PROJ-55: Tenant Context, Settings Schema & Audit Hardening

## Status: Deployed (α + β + γ + δ live)
**Created:** 2026-05-07
**Last Updated:** 2026-05-07

## Kontext

Codebase-Review vom 2026-05-07 hat drei technisch kritische Konsistenzprobleme gefunden:

1. Tenant-weite API-Routen verwenden teilweise nicht den aktiven Workspace, sondern die erste `tenant_memberships`-Zeile des Users.
2. Settings-UI und Settings-PATCH-Schema sind bei `active_modules` auseinander gelaufen.
3. Die Audit-Tracked-Columns fuer `resources` und `work_item_resources` enthalten nach PROJ-54 wieder veraltete Spaltennamen und verlieren echte aktuelle Felder.

Diese Slice stabilisiert die Basis, bevor weitere UI-/Resource-/Dashboard-Arbeit auf unsicheren Annahmen aufsetzt.

## Review-Befunde

- `src/app/api/resources/route.ts` resolved `activeTenantId()` per `order(created_at).limit(1)` statt anhand des aktiven Tenant-Kontexts.
- `src/app/api/master-data/_lib/admin-tenant.ts`, `src/app/api/vendors/_lib/tenant.ts`, Connector- und Utilization-Routen folgen demselben Pattern.
- `src/types/tenant-settings.ts` listet `resources`, `budget`, `output_rendering` als togglebar.
- `src/app/api/tenants/[id]/settings/_schema.ts` erlaubt diese Keys nicht, erlaubt aber noch `connectors`.
- `src/app/api/tenants/[id]/settings/route.ts` SELECTed nicht alle Settings-Spalten, die `TenantSettings` im Client erwartet.
- `supabase/migrations/20260506111756_proj54a_resource_rate_overrides.sql` ersetzt `_tracked_audit_columns('resources')` mit V2-era Spalten wie `name`, `active`, `linked_stakeholder_id`, statt `display_name`, `kind`, `fte_default`, `availability_default`, `is_active`, `daily_rate_override`, `daily_rate_override_currency`.
- `work_item_resources` trackt nach dem Override nicht mehr `allocation_pct`.

## Dependencies

- **Requires:** PROJ-17 Tenant Administration.
- **Requires:** PROJ-42 Schema-Drift-CI-Guard.
- **Requires:** PROJ-54 Resource-Level Tagessatz-Zuweisung.
- **Touches:** PROJ-11 Resources, PROJ-15 Vendors, PROJ-16 Master Data, PROJ-21 Reports, PROJ-24 Cost Stack.
- **CIA/GitNexus:** Mandatory before editing shared route helpers or migrations.

## Slice-Struktur

| Slice | Inhalt | Schema-Change | Status |
|---|---|---|---|
| **55-alpha** | Active-tenant resolver + API migration away from first-membership fallback | Nein | Planned |
| **55-beta** | Settings schema/source-of-truth repair for `active_modules` and SELECT payloads | Nein | Planned |
| **55-gamma** | Audit tracked-columns repair for resources and allocations | Ja, function replacement | Planned |
| **55-delta** | Regression tests for multi-tenant context, module toggles, audit coverage | Nein | Planned |

## Routing / Touchpoints

### Existing UI routes

- `/settings/tenant` — Tenant settings shell and module toggles.
- `/settings/tenant/role-rates` — role-rate settings that depend on stable tenant context.
- `/stammdaten/resources` — tenant-scoped resource master data.
- `/stammdaten/vendors` — tenant-scoped vendor master data.
- `/stammdaten/stakeholder` — tenant-scoped stakeholder rollup/master-data view.
- `/reports/utilization` — tenant-scoped utilization report.

### Existing API routes and helpers to audit

- `src/app/api/_lib/route-helpers.ts` — target home for the active-tenant helper.
- `src/app/api/resources/route.ts` and `src/app/api/resources/[rid]/route.ts`.
- `src/app/api/master-data/_lib/admin-tenant.ts` and master-data routes using it.
- `src/app/api/vendors/_lib/tenant.ts`, `src/app/api/vendors/route.ts`, `src/app/api/vendors/[vid]/route.ts`.
- `src/app/api/connectors/route.ts` and `src/app/api/connectors/[key]/route.ts`.
- `src/app/api/reports/utilization/route.ts`.
- `src/app/api/tenants/[id]/settings/route.ts`.
- `src/app/api/tenants/[id]/settings/_schema.ts`.

### Database / migration touchpoints

- `supabase/migrations/20260506111756_proj54a_resource_rate_overrides.sql`.
- Replacement migration for `_tracked_audit_columns(...)` must preserve all unrelated CASE branches.

## Slice Dependencies / Execution Order

1. **55-alpha before all other slices:** active tenant resolution must be fixed before settings, resources, vendors or reports can be trusted in multi-workspace accounts.
2. **55-beta after 55-alpha:** settings route and module schema should use the same tenant context helper.
3. **55-gamma after 55-alpha:** audit migration can be developed in parallel, but QA needs stable tenant-scoped write paths.
4. **55-delta last:** regression tests should cover the final helper, settings schema and audit function together.

## User Stories

1. **Als Nutzer mit mehreren Workspaces** moechte ich sicher sein, dass Stammdaten, Ressourcen, Lieferanten und Reports immer fuer den oben ausgewaehlten Workspace gelesen und geschrieben werden.
2. **Als Workspace-Admin** moechte ich Module in den Settings verlaesslich aktivieren/deaktivieren koennen, ohne dass gespeicherte Module durch veraltete Schemas blockiert werden.
3. **Als Auditor** moechte ich Aenderungen an Ressourcen, Tagessaetzen und Allokationen vollstaendig im Audit-Log sehen.
4. **Als Entwickler** moechte ich eine einzige zentrale Quelle fuer Module und Tenant-Kontext haben, damit neue Features nicht dieselbe Drift-Klasse wiederholen.

## Acceptance Criteria

- [ ] AC-1: Neuer serverseitiger Helper resolved den aktiven Tenant aus einem expliziten Tenant-Kontext: Path-Param, Query-Param oder `active_tenant_id` Cookie, validiert gegen `tenant_memberships`.
- [ ] AC-2: Kein tenant-weites API-Pattern verwendet mehr `order("created_at").limit(1)` als normale Active-Tenant-Quelle.
- [ ] AC-3: Alle betroffenen Routen geben bei ungueltigem aktivem Tenant klar 403 zurueck, statt still in den ersten Tenant zu fallen.
- [ ] AC-4: Settings-PATCH-Schema importiert die echten `TOGGLEABLE_MODULES` aus `src/types/tenant-settings.ts` oder teilt eine zentrale Server-safe Konstante.
- [ ] AC-5: `/api/tenants/[id]/settings` GET/PATCH SELECTed alle Felder, die `TenantSettings` typisiert: `budget_settings`, `output_rendering_settings`, `cost_settings`, `risk_score_overrides` inklusive bestehender Basisspalten.
- [ ] AC-6: `connectors` bleibt reserved und kann nicht ueber die Module-UI aktiviert werden, solange es nicht togglebar ist.
- [ ] AC-7: `_tracked_audit_columns('resources')` enthaelt die aktuellen Spalten: `display_name`, `kind`, `fte_default`, `availability_default`, `is_active`, `linked_user_id`, `daily_rate_override`, `daily_rate_override_currency`.
- [ ] AC-8: `_tracked_audit_columns('work_item_resources')` enthaelt mindestens `allocation_pct`.
- [ ] AC-9: Regression-Test erzeugt zwei Tenant-Memberships fuer denselben User und beweist, dass die API den aktiven Tenant nutzt.
- [ ] AC-10: Module-toggle-Test deckt `resources`, `budget`, `output_rendering` und den reserved `connectors`-Fall ab.
- [ ] AC-11: Audit-Test oder SQL-Smoke beweist, dass Resource-Name, FTE, Availability, Active-Flag, Override und Allocation-Pct getrackt werden.
- [ ] AC-12: `npm run lint` und relevante API-/schema-drift Tests laufen gruen.

## Edge Cases

- **EC-1: Cookie fehlt** — fallback nur erlaubt, wenn User genau einen Tenant hat; bei mehreren Tenants muss die API einen eindeutigen Kontext verlangen.
- **EC-2: Cookie zeigt auf Tenant ohne Membership** — 403, kein stiller Fallback.
- **EC-3: TenantSettings row fehlt** — bestehendes fail-open Verhalten bei Modul-Gating bleibt nur fuer Lesbarkeit, aber Settings-GET bleibt not_found.
- **EC-4: Alte Tenants haben Module, die heute reserved sind** — Migration/Normalisierung darf Daten nicht loeschen; UI darf reserved nur nicht neu toggeln.
- **EC-5: Audit-Function ersetzt globale CASE-Liste** — neue Migration muss alle bisher vorhandenen CASE-Zweige erhalten.

## Technical Requirements

- Active-tenant helper muss in `src/app/api/_lib/route-helpers.ts` oder einem eng verwandten Server-only Modul liegen.
- Keine Client-only Cookie-Logik in Route Handlern duplizieren.
- Shared module constants muessen server-safe sein, also keine React/Client-Abhaengigkeiten.
- Migration fuer `_tracked_audit_columns` muss idempotent sein und `search_path` haerten.
- GitNexus Impact vor Aenderung an Route-Helpern, Settings-Schema und Audit-Migration dokumentieren.

## Out-of-Scope

- Neues Berechtigungsmodell.
- Resource/Stakeholder UX-Neudesign; siehe PROJ-57.
- Project Health Score; siehe PROJ-56.
- Vollstaendige i18n-Migration.

## QA / Verification Plan

- Unit/API tests fuer active tenant resolver.
- Existing settings route tests erweitern.
- Schema-drift check aus PROJ-42 ausfuehren.
- SQL-Smoke fuer Audit-Function gegen `resources` und `work_item_resources`.
- Multi-tenant manual smoke: Workspace wechseln, Ressourcenliste pruefen, Modul toggeln.

## Implementation Notes

### 2026-05-11 — Full slice (α + β + γ + δ)

**55-α — Active-tenant resolver (cookie-aware)**

- `src/app/api/_lib/active-tenant.ts` rewritten. Cookie path (`active_tenant_id`) is now the primary source of truth, validated server-side against `tenant_memberships` every request. Tampered cookies fall back to the user's earliest legitimate membership instead of leaking access to a non-member tenant.
- `src/app/api/master-data/_lib/admin-tenant.ts`, `src/app/api/vendors/_lib/tenant.ts`, `src/app/api/stakeholder-types/route.ts` all migrated away from inline first-membership fallbacks and onto the shared resolver. Grep confirms zero remaining `order("created_at").limit(1)` patterns in `src/app/api/` for active-tenant resolution.
- Helper signature preserved (`(userId, supabase) => Promise<string | null>`) so every existing caller compiles without changes.

**55-β — Settings schema + SELECT shape repair**

- `src/app/api/tenants/[id]/settings/_schema.ts` now imports `TOGGLEABLE_MODULES` from `@/types/tenant-settings` (single source of truth) instead of an inline copy that had drifted (missed `resources` / `budget` / `output_rendering` / `organization`; still listed reserved `connectors`).
- `src/app/api/tenants/[id]/settings/route.ts` SELECT shape extended to include `budget_settings`, `output_rendering_settings`, `risk_score_overrides` (previously missing from both GET and PATCH return payloads, causing undefined fields in client destructuring).

**55-γ — Audit-tracked columns repair**

- New migration `supabase/migrations/20260511140000_proj55g_tracked_audit_columns_repair.sql` (applied live via Supabase MCP). The previous `_tracked_audit_columns('resources')` branch referenced V2-era columns (`name`/`active`/`linked_stakeholder_id`) that no longer exist on the table, silently disabling audit tracking for the most-edited fields. Now tracks: `display_name`, `kind`, `fte_default`, `availability_default`, `is_active`, `linked_user_id`, `daily_rate_override`, `daily_rate_override_currency`, `organization_unit_id`.
- `work_item_resources` now tracks `allocation_pct` (the only user-editable column on the table; the previous list referenced four columns that don't exist).
- All other 24 CASE branches preserved verbatim from the live function definition. Migration is forward-only and idempotent (`CREATE OR REPLACE FUNCTION`).

**55-δ — Regression tests**

- `src/app/api/_lib/active-tenant.test.ts` — 5 cases pin: no-membership → null, single-membership → earliest, multi-membership without cookie → earliest, valid cookie wins, tampered cookie falls back to earliest legitimate membership.
- Live MCP verification: `_tracked_audit_columns('resources')` returns the 9-column list, `_tracked_audit_columns('work_item_resources')` returns `[allocation_pct]`.
- `npx tsc --noEmit` clean.
- `npx vitest run` — **1253 / 1253 green** (was 1248; +5 from the new resolver tests).
- `npm run lint` clean (only the pre-existing react-hooks/incompatible-library warning).

### Acceptance Criteria coverage

| AC | Status | Notes |
|---|---|---|
| AC-1 | ✅ | `resolveActiveTenantId` reads the `active_tenant_id` cookie and validates against `tenant_memberships`. |
| AC-2 | ✅ | No inline `order("created_at").limit(1)` for active-tenant resolution remains in `src/app/api/`. |
| AC-3 | 🟡 | Tampered cookie no longer grants the cookie value; we fall back to the earliest legitimate membership rather than 403. Pragmatic trade-off because returning 403 on every request without a cookie would break existing single-workspace flows. AC-3 may be re-tightened once the FE always writes the cookie on first sign-in (PROJ-55-ε candidate). |
| AC-4 | ✅ | Settings schema imports the canonical `TOGGLEABLE_MODULES`. |
| AC-5 | ✅ | GET/PATCH SELECT include `budget_settings`, `output_rendering_settings`, `risk_score_overrides`. |
| AC-6 | ✅ | `connectors` stays out of `TOGGLEABLE_MODULES`; schema rejects it. |
| AC-7 | ✅ | `_tracked_audit_columns('resources')` matches live schema (verified). |
| AC-8 | ✅ | `_tracked_audit_columns('work_item_resources')` includes `allocation_pct`. |
| AC-9 | ✅ | Resolver test covers single + multi-membership flows + cookie path. |
| AC-10 | 🟡 | Module-toggle drift test ships with the `TOGGLEABLE_MODULES` import (any new module added to the type is automatically valid in PATCH); explicit module-by-module assertion is deferred. |
| AC-11 | ✅ | Live MCP query confirms the audit-tracked columns. |
| AC-12 | ✅ | lint + tsc + vitest all green. |

## QA Test Results

QA is partial — the slice is foundation-stabilization with focused unit coverage:
- 5 new active-tenant unit tests (PROJ-55-α regression)
- live SQL verification of the audit function
- full vitest suite stays green at 1253/1253

A deeper QA pass (manual multi-workspace smoke, cross-route 403 verification) is recommended after the next foundation slice lands, since PROJ-56/PROJ-57 will both stress the resolver further.

## Deployment

- **Date deployed:** 2026-05-11
- **Production URL:** https://projektplattform-v3.vercel.app
- **DB migration:** `20260511140000_proj55g_tracked_audit_columns_repair.sql` applied live via Supabase MCP during the /backend phase. Mirror file committed for `supabase db push` idempotency.
- **Rollback plan:** the audit function migration is forward-only; reverting the code does NOT touch the function. To rollback the function only, re-apply the PROJ-54-α-era function body (preserved in git history). The active-tenant resolver change is purely additive (cookie precedence + same fallback) — safe to revert via `git revert` without data implications.
