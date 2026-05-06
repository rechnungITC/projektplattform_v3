# PROJ-54: Resource-Level Tagessatz-Zuweisung mit intuitiver Auswahl + Pflicht-Gate

## Status: In Progress (54-α Backend implemented; Frontend β + Recompute γ pending)
**Created:** 2026-05-06
**Last Updated:** 2026-05-06

## Kontext

PROJ-24 (Cost-Stack, deployed) löst Tagessätze heute ausschließlich über die Rolle auf:

```
Allocation → Resource → source_stakeholder_id → stakeholder.role_key → role_rates
```

Drei Lücken sind in der Praxis schmerzhaft:

1. **Externe / Freelancer mit individuellem Vertragssatz** — kein sinnvoller Eintrag im role_rates-Katalog möglich, ohne den Katalog zu verwässern.
2. **Resources ohne `role_key`** (linked_user_id-only-Resourcen aus dem Promote-to-Resource-Pfad) erzeugen €0-Cost-Lines mit Warning-Flag — der Anwender kann das aber nirgends im UI fixen.
3. **Anlage-Flow ist nicht intuitiv** — kein direkter Tagessatz-Eingabepunkt beim Anlegen einer Resource.

PROJ-54 schließt diese Lücken durch eine **Resource-Level-Override-Spalte plus intuitive Auswahl-UX plus Pflicht-Gate**. User-Wunsch (2026-05-06): „Tagessätze müssen den Ressourcen zugewiesen werden, wirken auf Projektkosten / Arbeitspakete; Auswahl muss intuitiv beim Anlegen einer Resource möglich sein."

## Dependencies

- **Requires:** PROJ-24 (Cost-Stack, deployed) — `role_rates`, `_resolve_role_rate`, Cost-Engine, `work_item_cost_lines`.
- **Requires:** PROJ-11 (Resources, deployed) — `resources`-Tabelle, Resource-Form, Resource-API.
- **Requires:** PROJ-8 (Stakeholders, deployed) — `stakeholders.role_key` als Fallback-Auflösung.
- **Requires:** PROJ-29 (Hygiene-Slice, deployed) — `set search_path = public, pg_temp` Pattern für neue SQL-Helper.
- **Requires:** PROJ-42 (Schema-Drift-CI-Guard, deployed) — additive Spalten-Erweiterung.
- **CIA-Review zwingend** — größeres Refactoring touchiert deployed PROJ-24-Auflösungsmodell.

## Slice-Struktur

| Slice | Inhalt | Schema-Change | Status |
|---|---|---|---|
| **54-α** | Override-Spalten + SQL-Helper + Cost-Engine + Lookup-Layer + Audit-Whitelist + Tests | Ja (2 Spalten + 1 Helper) | **In Progress (Backend implemented; awaiting /qa)** |
| **54-β** | Resource-Form Combobox + Stammdaten-Listen-Spalte + Bestand-Banner + Optimistic-Lock | Nein | Architected |
| **54-γ** | `after()`-Recompute + Failed-Marker + UI-Banner + Bench | Ja (1 Spalte `recompute_status`) | Architected |
| **54-δ** | Versionierte `resource_rate_overrides`-Tabelle | Ja | Deferred |

## User Stories

1. **Als Tenant-Admin** möchte ich beim Anlegen oder Bearbeiten einer Resource einen Tagessatz **intuitiv auswählen oder direkt eingeben** können — entweder über die hinterlegte Rolle oder als **individuellen Override** — damit ich nicht erst den Stakeholder-Katalog oder die role_rates-Tabelle bemühen muss.
2. **Als Tenant-Admin** möchte ich, dass eine Resource **nicht gespeichert werden kann**, solange kein gültiger Tagessatz auflösbar ist — damit keine €0-Kostenlinien mehr entstehen.
3. **Als PM** möchte ich beim Bearbeiten einer Bestands-Resource ohne Tagessatz **klar im UI sehen**, dass die Tagessatz-Eingabe fehlt (Banner + Pflicht-Feld), damit ich beim ersten Edit gezwungen bin, das Defizit zu beheben.
4. **Als Tenant-Admin** möchte ich, dass eine **Korrektur eines Override-Tagessatzes** automatisch die Cost-Lines aller offenen Allocations dieser Resource **neu berechnet** und auditiert.
5. **Als PM** möchte ich, dass die **Auflösungsreihenfolge eindeutig** ist: zuerst Resource-Override, dann Rolle, dann „Tagessatz fehlt"-Fehler.
6. **Als Steering-Committee-Mitglied** möchte ich, dass Override-Tagessätze **wie role_rates auditiert** werden.

## Acceptance Criteria — 54-α (Backend Foundation)

### Datenmodell und Persistenz

- [x] AC-1: Override-Spalten auf `resources` (`daily_rate_override numeric(10,2) NULL` + `daily_rate_override_currency char(3) NULL`) + CHECK-Constraint `resources_override_consistency` (beide NULL oder beide gesetzt + > 0 + supported currency).
- [x] AC-2: Override darf **nur von Tenant-Admins** gesetzt werden — wird im API-Layer (PATCH-Whitelist) durchgesetzt (Tech-Design Fork 1c-Default). RLS auf `resources` bleibt unverändert. **(Wiring im 54-β-Slice mit der UI-Anbindung.)**
- [x] AC-3: Override-Spalten in `_tracked_audit_columns('resources')` ergänzt; bestehender `audit_changes_resources` UPDATE-Trigger erfasst Änderungen automatisch.
- [x] AC-4: Class-3-PII-Klassifikation für `daily_rate_override` analog `role_rates.daily_rate`; Currency Class 2.
- [x] AC-5: Schema-Drift-CI grün — additiver Diff (2 Spalten + neuer Helper, keine entfernten SELECTs).

### Auflösungsreihenfolge

- [x] AC-6: Auflösung folgt strikt: **(1) Resource-Override** → **(2) `stakeholder.role_key` via `role_rates`** → **(3) keine Auflösung → Warning**.
- [x] AC-7: Neuer SQL-Helper `_resolve_resource_rate(p_tenant_id, p_resource_id, p_as_of_date)` — `SECURITY DEFINER`, `set search_path = public, pg_temp` (PROJ-29-Pattern), EXECUTE nur für `service_role`.
- [x] AC-8: Cost-Engine-Aufrufer (`synthesizeResourceAllocationCostLines`) nutzt neuen Helper via `resolveResourceRates()`. Pure-TS-Engine `calculateWorkItemCosts` erhält neues optionales Feld `resolved_rates?: ResolvedRate[]`, das per `resource_id` indexiert wird und Vorrang vor `role_rates` hat. Backwards-kompatibel.

### Tests

- [x] AC-20: Vitest-Coverage in `resource-rate-lookup.test.ts` mit 5 Szenarien T1-T5 (Override-only, Role-only, Override-wins-server-side, Neither-fails, RPC-error-fail-open) + Bonus-Cases (Dedup, Parallel-cross-branch-id, malformed RPC, empty short-circuit).

### Out-of-Scope für α (in 54-β/γ/δ)

- AC-9 bis AC-14: UI (Combobox, Banner, Listen-Spalte, Optimistic-Lock) → 54-β
- AC-15 bis AC-18: Auto-Recompute via `after()`-Hook + Failed-Marker → 54-γ
- AC-19: Performance-Live-Bench → 54-γ post-deploy
- AC-21: Frontend-Vitest → 54-β
- AC-22: Playwright-E2E → optional, 54-β

## Edge Cases (verifiziert in 54-α)

- **EC-1**: Resource hat Override AND verknüpften Stakeholder mit role_key + aktiver role_rate → Override gewinnt (server-side im SQL-Helper short-circuit).
- **EC-5**: role_rates-Eintrag fehlt für Stakeholder-role_key UND kein Override → Helper liefert keine Zeile, Caller emittiert Warning.
- **EC-6**: Override-Tagessatz negativ oder 0 → CHECK-Constraint feuert (live verifiziert).
- **EC-10**: Tenant ohne role_rates UND ohne Override-Daten → Helper liefert keine Zeile (graceful).

## Technical Requirements

- **Class-3-PII:** Override-`daily_rate` sensitiv wie `role_rates.daily_rate`. API-Response für Non-Admins muss filtern (54-β).
- **Audit:** Field-Level via bestehenden `audit_changes_resources` UPDATE-Trigger.
- **Schema-Drift-CI (PROJ-42):** additiv → trivially clean.
- **Performance:** `_resolve_resource_rate` ist 1 RPC pro Resource × as_of_date. Bei ≤ 50 Allocations parallel ~100ms p95 erwartet. Live-Bench in 54-γ.
- **Backwards-Kompatibilität:** `calculateWorkItemCosts` API additiv (`resolved_rates?` optional).

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect) — 2026-05-06

> Locked CIA-Empfehlungen: Forks **1c (Spalten auf resources, Latest-only)**, **2a (separater `_resolve_resource_rate`-Helper)**, **3b (`ResolvedRate`-Type mit `source`-Discriminator)**, **4b (async Recompute via Next.js `after()`)**. Concurrency: **Optimistic Lock via `If-Unmodified-Since`**. AC-17 abgeschwächt: **Failed-Marker** statt Atomic-Rollback.

### Architektur-Entscheidungen

| Fork | Entscheidung | Begründung |
|---|---|---|
| Override-Storage | 2 Spalten auf `resources` (Latest-only) | Erbt RLS + Audit; eigene Tabelle würde Aufwand ohne MVP-Nutzen erzeugen; δ-Slice deferred bis Pilot Versionierung fordert |
| SQL-Helper | Neuer `_resolve_resource_rate(tenant_id, resource_id, as_of_date)` | 1 Roundtrip statt 2; bestehender `_resolve_role_rate` bleibt unangetastet (Single Responsibility) |
| Cost-Engine | `RoleRateSnapshot` ergänzt um optionales `resolved_rates` mit `source: 'override'\|'role'` | Auflösung im SQL-Helper, Engine sieht fertige Rate; Audit-Trace via `cost_lines.source_metadata.rate_source` |
| Recompute (γ) | Async via `after()` + Failed-Marker | UX: PATCH-Response sofort; bei Fehler `recompute_status='failed'` + Banner |
| Concurrency | Optimistic Lock via `If-Unmodified-Since` | 409 statt stilles Überschreiben — wichtig bei Personalkosten |

### Komponentenstruktur

```
54-α (Backend Foundation) — IMPLEMENTED
├── Migration         supabase/migrations/20260506111756_proj54a_resource_rate_overrides.sql
│   ├── resources.daily_rate_override + .._currency + CHECK-Constraint
│   ├── _resolve_resource_rate(tenant_id, resource_id, as_of_date) helper
│   └── _tracked_audit_columns('resources') extended
├── Lookup-Layer      src/lib/cost/resource-rate-lookup.ts
│   ├── resolveResourceRates(supabase, keys) → { resolved, missing }
│   └── Normalisiert resource_id auch für Role-Branch
├── Engine            src/lib/cost/calculate-work-item-costs.ts
│   └── Optionales resolved_rates parameter; resource_id-Lookup vor role_key-Fallback
├── Synthesize        src/lib/cost/synthesize-cost-lines.ts
│   └── Wechsel von resolveRoleRates auf resolveResourceRates
├── Types             src/lib/cost/types.ts
│   ├── ResolvedRate { source: 'override'|'role', resource_id, daily_rate, currency, ... }
│   └── ResourceRateLookupKey { tenant_id, resource_id, as_of_date }
└── Tests             src/lib/cost/resource-rate-lookup.test.ts (T1–T5 + 4 Bonus)
```

## Implementation Notes — 54-α (2026-05-06)

**Migration:** `supabase/migrations/20260506111756_proj54a_resource_rate_overrides.sql`
- Zwei Override-Spalten auf `resources` + Consistency-CHECK + neuer `_resolve_resource_rate`-Helper + Audit-Whitelist-Erweiterung.
- Live appliziert per `mcp__supabase__apply_migration` auf Projekt `iqerihohwabyjzkpcujq`.
- Smoke-Tests: Schema-Verify ✓ / `0 + EUR` löst `check_violation` aus ✓ / Helper EXISTS ✓ / EXECUTE only `postgres`+`service_role` ✓.

**TS Code:**
- `src/lib/cost/types.ts` — neue Typen `ResolvedRate` und `ResourceRateLookupKey`.
- `src/lib/cost/resource-rate-lookup.ts` — `resolveResourceRates()` mit FAIL-OPEN, Dedup, parallel RPCs, resource_id-Normalisierung über beide Branches.
- `src/lib/cost/calculate-work-item-costs.ts` — additives optionales `resolved_rates?: ResolvedRate[]`-Feld; resource_id-Lookup hat Vorrang vor role_key-Lookup; `source_metadata.rate_source = 'override'|'role'` für Audit-Trace.
- `src/lib/cost/synthesize-cost-lines.ts` — Lookup-Wechsel: jetzt `resolveResourceRates(distinctResourceIds)`. Engine bekommt `resolved_rates`, `role_rates: []`.
- `src/lib/cost/index.ts` — Exports für `resolveResourceRates`, `ResolvedRate`, `ResourceRateLookupKey`.

**Tests:**
- Neu: `src/lib/cost/resource-rate-lookup.test.ts` mit 9 Cases (5 AC-20-Szenarien + 4 Bonus).
- Update: `src/lib/cost/synthesize-cost-lines.test.ts` — RPC-Mock-Shape angepasst auf `_resolve_resource_rate` (TABLE-Shape mit `source`-Feld); 1 Test (`stakeholder without role_key`) explizit auf empty-array-Mock umgestellt.

**Bewusst NICHT angefasst:**
- `_resolve_role_rate` und `resolveRoleRates` bleiben für Backwards-Compat exportiert. Bestehender PROJ-24-α-γ-Pfad ist unverändert nutzbar.
- V2-Stale-Einträge in `_tracked_audit_columns('resources')` (z.B. `name`, `role_key`, `linked_stakeholder_id`) NICHT bereinigt. Hygiene-Slice-Kandidat.
- API-Layer-Whitelist (Override schreibbar nur für Tenant-Admin) folgt im 54-β-Slice.

**Verifikation:**
- `npx vitest run src/lib/cost/` → **47/47 grün** (4 Test-Files, +9 neue Cases).
- `npx vitest run` (volle Suite) → **1130/1130 grün**.
- `npm run build` → ✓ 51 Pages.
- `npm run lint` → 0 errors.

**Commits:**
- `20a714c` — Migration source committed (already-applied via MCP).
- `33df1d7` — `ResolvedRate` + `ResourceRateLookupKey` types.
- `ee285d5` — `resolveResourceRates` lookup module.
- `b4be5ef` — Engine + synthesize wiring + index exports + synthesize-test mock-shape update.
- `dba8cfa` — 9 new lookup test cases (AC-20).

**Open für /qa:**
- Live-Smoke gegen Pilot-Tenant: Override setzen, Cost-Line erscheint mit `rate_source='override'` in source_metadata.
- 54-β UI-Slice (Combobox, Banner, Listen-Spalte) als Folge.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
