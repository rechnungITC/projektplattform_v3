# PROJ-55: Tenant Context, Settings Schema & Audit Hardening

## Status: Planned
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

Noch nicht implementiert. Diese Spec ist aus dem Codebase-Review vom 2026-05-07 abgeleitet.

## QA Test Results

_To be added by /qa_

## Deployment

_To be added by /deploy_
