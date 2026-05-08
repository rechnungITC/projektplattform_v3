# PROJ-54: Resource-Level Tagessatz-Zuweisung mit intuitiver Auswahl + Pflicht-Gate

## Status: In Progress (54-β BUG-1 hotfixed; awaiting re-QA before γ)
**Created:** 2026-05-06
**Last Updated:** 2026-05-08
**Hotfix landed 2026-05-08 (commits 0005ba0 + 075fdda):** the silent-data-loss path is closed by (1) a `userTouchedTagessatz` gate on submit and (2) `key={drawer.resource.id}` on the form so resource-switch within the open drawer reinitializes state. Regression test pins the no-touch-save → no-override-fields contract.

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
| **54-β** | Resource-Form Combobox + Stammdaten-Listen-Spalte + Bestand-Banner + Optimistic-Lock | Nein | **Implemented (2026-05-08)** |
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

## Implementation Notes — 54-β (2026-05-08)

### Done in this slice

1. **TagessatzCombobox component** (`src/components/resources/tagessatz-combobox.tsx`, commit `99fed86` 2026-05-06)
   - shadcn `Popover` + `Command` composition. Single input switches between role-from-catalog and inline-override (`<amount> <currency>`).
   - Currency parsing accepts ISO codes (case-insensitive) + €/$/£/¥ symbols + comma/dot decimals; rejects negatives, zero, unsupported codes, free-form text.
   - Exports `__parseInlineOverrideForTest` so the parser is unit-testable in isolation.

2. **ResourceForm Tagessatz integration** (`src/components/resources/resource-form.tsx`, commit `204d4cb` 2026-05-06)
   - Combobox wired with `roleRates` + `isTenantAdmin`. Non-admins see role-only UX (`rolesOnly`).
   - **Bestand-Banner** shows when an existing resource has no override AND the combobox is empty (forces the first edit to set a rate).
   - β.1 simplification: role-selection translates to an override on submit (the resource itself doesn't carry `role_key`; that comes from the linked stakeholder).

3. **ResourcesPageClient wiring** (`src/components/resources/resources-page-client.tsx`, commit `237c969` 2026-05-06)
   - Pulls `useRoleRates` + `useAuth.currentRole` and passes them to the form.
   - **Stammdaten-Listen-Spalte** (commit `271728d` 2026-05-08): each card carries a Tagessatz badge — `Sparkles + 1500 EUR/Tag` for override-set resources, `AlertCircle + Kein Override` (destructive tone) for those without. Tenant-admins spot rate-gaps at a glance.

4. **Backend admin-gate** (`src/app/api/resources/route.ts` + `[rid]/route.ts`, commit `a366ad0` 2026-05-06)
   - POST + PATCH check `tenant_memberships.role === 'admin'` whenever the override pair is in the payload (incl. explicit nulls to clear).
   - Override columns added to the SELECT response so the form can rehydrate.

5. **Optimistic-Lock via `If-Unmodified-Since`** (commits `c21eb78` + `271728d` 2026-05-08)
   - Backend PATCH parses the header, compares against `existing.updated_at`, returns **409 `stale_record`** when the DB row is newer. Missing header keeps "last write wins" (backwards-compat for callers without a token).
   - Frontend `updateResource` accepts an `ifUnmodifiedSince` option; `useResources.update` forwards it; `ResourcesPageClient.onUpdate` passes `resource.updated_at`.
   - 409 surfaces as a distinct toast ("Konflikt: Ressource wurde inzwischen geändert"); the drawer closes so the next open re-pulls the fresh row.

6. **Tests (AC-21)** — total **21 cases** in three files:
   - `tagessatz-combobox.test.ts` (commit `ed57bd4`) — 12 parser cases.
   - `resources/api.test.ts` (commit `271728d`) — 3 cases: header sent when token is given, header omitted when not, error message propagated on 409.
   - `[rid]/route.test.ts` (commit `c21eb78`) — 3 new optimistic-lock cases (stale-rejection, fresh-token accept, missing-header backwards-compat) + the existing kitchen-sink drift test stays green.

### Verification

- `npx vitest run` (PROJ-54-β scope) → **21/21 grün** in 1.29s across 5 files.
- `npm run build` → ✓ Compiled successfully in 8.7s (full Next.js production build).
- Auto-deployed to production on push to `main`.

### Auflagen / deferred

- **AC-22 Playwright-E2E** — explicitly listed as "optional, 54-β" in the spec; deferred (no E2E coverage today).
- **54-γ Auto-Recompute** — `after()`-Hook + Failed-Marker + UI-Banner remain pending. The optimistic-lock token is already in place to make the γ-write race-safe.
- **Class-3-PII masking for non-admins** — currently the override is returned in the SELECT response to all tenant members so the Stammdaten-Listen-Spalte can render it. A future hardening slice can introduce a separate response shape (or column-level RLS) for non-admins. Out of 54-β scope per spec ("future hardening Slice").

## QA Test Results — 2026-05-08

### Production-Ready Decision: **NOT READY** (1 Critical bug: silent data loss)

### Critical Bug — `PROJ-54-β-BUG-1` — Silent override null-out on save

**Severity:** Critical (silent data loss; affects every Tenant-Admin who saves an existing override-bearing resource).

**Live Reproduction (verified against production):**
- Resource `34bf1d5c-1966-4e7c-9bc4-e02950438af0` ("Einer der s Kann"), tenant `329f25e5-…`.
- Audit-log entries (`audit_log_entries`):
  - `2026-05-08 12:28:35.481806+00`: `daily_rate_override: 1200 → 1000` ✓ correct save (legitimate user edit).
  - `2026-05-08 13:37:13.175719+00`: `daily_rate_override: 1000 → null` AND `daily_rate_override_currency: 'EUR' → null` ✗ silent data loss (user reports they did NOT clear the field).
- Vercel runtime logs confirm a PATCH around the same window; the user reports the toast said "Ressource gespeichert" — i.e. the destructive write surfaced as success.

**API/DB layers are NOT the cause:**
- Supabase-js shape probe (`scripts test`): `typeof daily_rate_override === 'number'` (1200) and `typeof daily_rate_override_currency === 'string'` ("EUR"). No string/number coercion bug in transit.
- Migration + DB columns intact; Zod schemas accept the override pair; admin-gate works.

**Root cause (95% confidence — `src/components/resources/resource-form.tsx:79-149`):**
1. `initialTagessatz` is computed via `useMemo([initial])`.
2. `tagessatz` state is `useState(initialTagessatz)` — **React reads the initial value only at first mount**. Subsequent `initial`-prop changes recompute `initialTagessatz`, but the `tagessatz` state does NOT re-sync.
3. The submit flow has an `else if (initialHadOverride)` branch (line 145) that sends explicit `null`s when `effectiveOverride` is null but `initial.daily_rate_override` was not null.
4. Combination: when the in-memory `tagessatz` ends up null (e.g. user opens a different resource without closing the drawer; the Sheet keeps the form mounted; `initial`-prop changes but `tagessatz` stays from the previous resource), `effectiveOverride` is null, `initialHadOverride` reads the LATEST initial-prop and is true → null-clear PATCH fires.
5. Same symptom can hit the simple "open one resource and just hit Save" flow if the user interacted with the combobox (e.g. clicked "Auswahl entfernen") and the page-client re-rendered the form with a fresh `updated`, since the `tagessatz` `useState` keeps the manually-cleared state across the prop change.

**Why the test suite missed it:** the existing 21 PROJ-54-β tests assert (a) backend admin-gate, (b) optimistic-lock header wiring, (c) parser. There is no test of the form's null-clear branch — that's the gap that needs closing during the fix.

**User reports the three UI symptoms together:**
1. ResourceCard badge shows "Kein Override" after save (because the GET re-fetch returns null — DB now null).
2. Combobox is empty when reopening the drawer (because `initial.daily_rate_override` is now null).
3. Bestand-Banner reappears (same reason).

All three are downstream of the single bug: the PATCH cleared the override.

**Recommended fix paths (for /frontend):**
- **Replace** `useState(initialTagessatz)` with a controlled pattern that re-syncs on `initial.id` change (drawer-open semantics). Preferred: derive `tagessatz` directly from `initial` on the render path and only persist a "user touched it" flag in state.
- **Tighten** the null-clear branch: only send explicit nulls when the user *actively* cleared via the combobox's "Auswahl entfernen" path (a `userExplicitlyCleared` flag), not when `effectiveOverride` is null for any reason.
- **Add** a vitest case: open drawer with `initial.daily_rate_override = 1000`, click Save without touching the combobox, expect the PATCH body to either NOT contain `daily_rate_override` at all, or to contain `1000` — never `null`.
- **Optional defense-in-depth:** the route's PATCH could refuse to null both override fields unless the request explicitly carries `clear_override: true` (a deliberate user action).

### Other / Lower-Severity Findings

- **Medium:** the existing route.test.ts kitchen-sink test sends `daily_rate_override: null` and asserts the insert payload contains it — masking the issue above. After the fix lands, this test should be split into an "explicit clear" case and a "no-touch" case.
- **Low:** `If-Unmodified-Since` header round-trip works (verified via the new tests + the production 409 trace), but the runtime log also shows a 412 status on one of the user's PATCH attempts — almost certainly Vercel/Next.js applying RFC-7232 precondition semantics differently than my server-side 409. Not data-affecting; cosmetic mismatch with the spec text. Worth verifying after the fix.

### Tests Run (2026-05-08, against `92bfbba` deployed)
- `npx vitest run` PROJ-54-β scope → 21/21 green (parser, optimistic-lock backend, api-lib header wiring).
- `npx vitest run src/lib/cost/` → 47/47 green (unchanged from 54-α).
- Live MCP probe of supabase-js return shape → number / string typing OK.
- Audit-log live cross-check → confirms the silent null-out happened.

### Recommendation
**STOP** further PROJ-54 work (γ-Recompute is now blocked) and **HOTFIX the form** before any tenant-admin loses more override values. The fix is small (resource-form.tsx only), the test coverage gap is one new vitest case.

After the fix:
1. Re-run /qa with focus on the new test + manual reproduction (open existing override-resource, save without changes, verify DB unchanged).
2. Optionally walk audit-log to find any other resources that already lost their override silently and propose a recovery list to the tenant-admin.

## Hotfix Notes — BUG-1 (2026-05-08)

### Diagnosis-driven fix (commits 0005ba0 + 075fdda)

Two compounding causes, both addressed:

1. **No-touch null-clear** (`src/components/resources/resource-form.tsx`)
   - **Before:** the submit path's `else if (initialHadOverride)` branch sent explicit `{daily_rate_override: null, daily_rate_override_currency: null}` whenever `effectiveOverride` ended up null — including untouched saves where the combobox state had simply never been set or had been reset by a prop-only re-render.
   - **After:** a `userTouchedTagessatz` flag is set ONLY when the wrapping `setTagessatz` callback fires (i.e. user picked a role, typed an inline override, or clicked "Auswahl entfernen"). The submit path skips both override fields entirely when the flag is false. Existing override values stay untouched on a no-touch save; admin-driven clears still flow through normally.

2. **Resource-switch within an open drawer** (`src/components/resources/resources-page-client.tsx`)
   - **Before:** the Sheet stayed open across drawer transitions, so React reused the same `ResourceForm` instance with new `initial` props. `useState(initialTagessatz)` ignored the prop change → state stuck on the previous resource → fix #1 alone wouldn't catch the cross-resource scenario.
   - **After:** `key={drawer.resource.id}` on the form (and `key="create"` on the create variant) makes React unmount + remount on resource-switch. Fresh mount → fresh `useState(initialTagessatz)` → state re-derives from the new `initial` prop.

### Test coverage closed

`src/components/resources/resource-form.test.tsx` (3 cases) pins:
- Existing override + no-touch save → onSubmit payload omits both override fields.
- Override-less resource + no-touch save → same.
- Create flow + name only → same.

Pre-fix all three failed (payload contained `daily_rate_override: null`); post-fix all three pass.

### Verification

- `npx vitest run src/components/resources/ src/lib/resources/ src/app/api/resources/ src/lib/cost/` → **42 files, 352/352 green** (5.51s).
- `npm run build` → ✓ Compiled successfully (9.3s).
- Auto-deploy on push of 075fdda triggered.

### Audit-log recovery (optional)

`audit_log_entries` carries the silent null-out trail. Recovery query:

```sql
SELECT entity_id, old_value, changed_at
FROM audit_log_entries
WHERE entity_type = 'resources'
  AND field_name = 'daily_rate_override'
  AND new_value IS NULL
  AND old_value IS NOT NULL
  AND changed_at >= '2026-05-06';
```

Tenant-admin can review, decide which override values to restore, and PATCH them back via the now-safe form.

### Open follow-up for re-QA

- Manual: open existing override-resource → press Save without touching → verify DB row unchanged via SQL.
- Manual: open R1 (override) → click R2 in list (no override) → press Save → verify R2 stays without override.
- Manual: clear override via "Auswahl entfernen" → save → verify nulls applied.

## Deployment
_To be added by /deploy_
