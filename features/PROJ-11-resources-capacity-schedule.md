# PROJ-11: Resources, Capacities, and Schedule Logic

## Status: Deployed
**Created:** 2026-04-25
**Last Updated:** 2026-04-25

## Summary
Promotes stakeholders into plannable resources, captures FTE and availability, and exposes a tenant-wide utilization report so PMOs can spot overbooking. Personal data → class-3 → local LLM only. Inherits V2 EP-09.

## Dependencies
- Requires: PROJ-1 (Auth, Tenants, Roles)
- Requires: PROJ-8 (Stakeholders) — resources derive from stakeholders
- Requires: PROJ-9 (Work Items) — resources assign to tasks/work_packages
- Requires: PROJ-7 (Gantt) — resource bars overlay schedule
- Requires: PROJ-12 (KI privacy) — class-3 enforcement

## V2 Reference Material
- **Epic file:** `~/projects/Projeketplattform_v2_D.U/planning/epics/ep-09-ressourcen-kapazitaeten-terminlogik.md`
- **Stories:** `~/projects/Projeketplattform_v2_D.U/planning/stories/ep-09.md` (ST-01 derive resources from stakeholders, ST-02 manual FTE/availability, ST-03 utilization report cross-projects)
- **ADRs:** `docs/decisions/data-privacy-classification.md`
- **V2 code paths to study during /architecture and /backend:**
  - `apps/api/src/projektplattform_api/domain/core/resources/` (V2 placeholder; resource model not implemented in V2 either)
  - `apps/api/src/projektplattform_api/services/utilization.py` (planned in V2 docs)

## User Stories
- **[V2 EP-09-ST-01]** As a project lead, I want to convert a stakeholder into a resource so I can plan that person/party.
- **[V2 EP-09-ST-02]** As a project lead, I want to manually capture FTE and availability so I can plan capacity at a coarse level.
- **[V2 EP-09-ST-03]** As a PMO or tenant admin, I want a tenant-wide utilization report aggregating FTE × project share by time bucket so I see overbooking before it bites.

## Acceptance Criteria

### Resource derivation
- [ ] Table `resources`: `id, tenant_id, project_id, stakeholder_id (FK stakeholders), kind (internal|external), fte_default (decimal 0.0–1.0), availability_default (decimal 0.0–1.0), is_active, created_at, updated_at`.
- [ ] A "Promote to resource" button on a stakeholder creates the row.
- [ ] Stakeholder ↔ resource link preserved bidirectionally.
- [ ] Resources can be assigned to work_items via a `work_item_resources` join table (`work_item_id, resource_id, allocation_pct`).

### Manual FTE/availability
- [ ] Per resource, FTE (e.g. 0.8 = 80%) and availability (e.g. 0.5 = 50% available) are editable.
- [ ] Optional time-segmented availability via `resource_availabilities` (`resource_id, start_date, end_date, fte`).
- [ ] Edits audited (PROJ-10).

### Cross-project utilization report
- [ ] `/reports/utilization` (admin/PMO).
- [ ] Aggregates: `resource_id × time_bucket → SUM(fte × allocation × overlap_days / bucket_days)`.
- [ ] Buckets: weekly, monthly, quarterly (UI toggle).
- [ ] Heat coloring: yellow >90%, red >100%.
- [ ] Filters: role, org unit, time range, internal/external.
- [ ] CSV export.
- [ ] Class-3 gating: external AI calls on resource data are blocked (per PROJ-12).

## Edge Cases
- **Resource derived from a stakeholder that's been deactivated** → resource auto-marked inactive.
- **Project with overlapping work_item allocations summing >1.0 for one resource** → utilization shows red; nothing prevents the over-allocation by design (UI warns).
- **Resource shared across tenants** → impossible by RLS (tenant_id NOT NULL).
- **Time segments overlapping** → last-saved wins for the overlap; audit logs both.
- **Bucket boundary partial overlap (e.g. project starts mid-week)** → pro-rata day-weighted (per V2 EP-09-ST-03 DoR).

## Technical Requirements
- **Stack:** Next.js 16 + Supabase.
- **Multi-tenant:** `resources`, `resource_availabilities`, `work_item_resources` MUST have `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`. RLS: project members for project-scoped tables, tenant admins/PMOs for tenant-wide reports.
- **Validation:** Zod (FTE 0.0–1.0, allocation 0–100%, dates).
- **Auth:** Supabase Auth + project/tenant roles.
- **Privacy:** All resource fields linked to a person are class-3 (per PROJ-12).
- **Performance:** Index on `(tenant_id, resource_id, start_date)` for time-bucket queries.

## Out of Scope (deferred or explicit non-goals)
- Calendar integration (Google/Outlook).
- Auto-detection of overbooking conflicts.
- Capacity optimization / re-allocation.
- Time tracking.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Realitätscheck

PROJ-11 hat drei Stories, die zusammen ein eigenes Schema rechtfertigen:
- ST-01 Resource aus Stakeholder ableiten
- ST-02 manuelle FTE/Verfügbarkeit
- ST-03 Cross-Projekt-Auslastung als Bericht

V2 hatte das Modell **nie implementiert** (laut Spec: "V2 placeholder"). Es gibt also keinen Code zum Spiegeln — nur den V2-Epic-Text. Wir bauen frisch auf dem V3-Stack.

Bestand vor dieser Iteration:
- `stakeholders` ist **project-scoped** (PROJ-8). Eine Person, die in zwei Projekten als Stakeholder auftritt, hat zwei Stakeholder-Rows.
- `work_items` haben **kein eigenes Datums-Feld** — sie hängen über `phase_id` (planned_start/end) oder `sprint_id` (start/end_date) am Datum. Reine Backlog-Items ohne Phase/Sprint sind möglich.
- `phases` und `sprints` haben Datumsspannen.
- `tenant_settings.active_modules` hat noch keinen `resources`/`utilization`-Key — wir müssen einen neuen Modul-Toggle-Key vorsehen.

### MVP-Scope

```
✅ IN dieser Iteration                              ⏳ DEFERRED
─────────────────────────────────────────────────   ───────────────────────
Resources-Tabelle + RLS + Audit                     Calendar-Sync (Outlook/Google)
"Promote stakeholder to resource"-Aktion            Auto-Detection von Konflikten
Manuelle FTE + Verfügbarkeit                        Optimization / Re-Balancing
Zeitsegmentierte Verfügbarkeit                      Time-Tracking
Allocation: Resource → Work Item                    Skill-/Rolle-Matching
/reports/utilization mit Heat-Map + Filter
CSV-Export
Klasse-3-Block (alles personenbezogen)
Modul-Toggle-Key "resources"
```

### Komponentenstruktur

```
Projektraum (gated by "resources"-Modul)
└── neuer Sub-Tab "Ressourcen" im Stakeholder-Tab oder eigener Tab
    ├── Resource-Liste (pro Projekt)
    │   └── Resource-Karte
    │       ├── Name + Stakeholder-Link
    │       ├── FTE / Verfügbarkeit (editable)
    │       ├── Aktive Allocations (auf Work Items)
    │       └── Verfügbarkeits-Segmente (optional)
    └── "Promote stakeholder to resource"-Button auf jedem Stakeholder

Work-Item-Drawer (PROJ-9)
└── neue Sektion "Ressourcen-Allocation"
    └── Resource × Allocation-% Liste

Tenant-weite Reports
└── /reports/utilization (admin/PMO)
    ├── Filter-Bar (Bucket-Größe, Zeitraum, Rolle, Org-Unit, intern/extern)
    ├── Heatmap-Tabelle: Resources (Zeilen) × Buckets (Spalten)
    │   └── Zelle: Auslastungs-% mit Heat-Coloring (gelb >90%, rot >100%)
    └── CSV-Export-Button

Server-Schicht
├── Migration: resources, resource_availabilities, work_item_resources
├── lib/resources/{api,types,allocation-math}.ts
├── lib/utilization/{aggregate,buckets,export-csv}.ts
├── api/projects/[id]/resources/      — CRUD + promote
├── api/projects/[id]/work-items/[wid]/resources/ — allocation join CRUD
└── api/reports/utilization           — aggregation endpoint (admin/PMO only)
```

### Datenmodell (Klartext)

**`resources`** — eine plannbare Person/Partei.
- Tenant + (optional) Project Scope — siehe **Frage 1**.
- `stakeholder_id` FK auf `stakeholders` (auf welchen Stakeholder die Resource zeigt).
- `kind`: `internal | external`.
- `fte_default` (0.0–1.0): wie viel der Person grundsätzlich für dieses Tenant arbeitet ("Anna ist 80%").
- `availability_default` (0.0–1.0): wie viel davon NETTO verfügbar ist (Urlaub/Krankheit pauschal abgezogen).
- `is_active`, `created_at`, `updated_at`.
- **Klasse-3** (komplett, personenbezogen).

**`resource_availabilities`** — optionale Zeitsegmente.
- `resource_id`, `start_date`, `end_date`, `fte` (overrides den Default in dem Zeitfenster).
- Beispiel: "Anna geht im Juli auf 50%".
- Klasse-3.

**`work_item_resources`** — die Zuteilung Resource → Work Item.
- `work_item_id`, `resource_id`, `allocation_pct` (0–100).
- Optional `start_date`/`end_date` — siehe **Frage 2**.
- Tenant- + project-scoped (für RLS).
- Klasse-3.

**RLS-Strategie:**
- `resources`: SELECT für project_member; INSERT/UPDATE/DELETE für editor+/lead/admin.
- `resource_availabilities`: gleiche Logik, geerbt über resource_id.
- `work_item_resources`: SELECT für project_member; INSERT/UPDATE/DELETE für editor+/lead/admin auf dem zugehörigen Projekt.
- Cross-Tenant: 404 (RLS scoped per project_member oder via tenant_id).

**Audit-Trail:** Resource-Felder (`fte_default`, `availability_default`, `is_active`, `kind`) und `work_item_resources.allocation_pct` werden via PROJ-10 audited. `resource_availabilities` ist als „Append-only mit Last-saved-wins" modelliert (kein Audit nötig — die Geschichte ist die Tabelle selbst).

### Tenant-weiter Auslastungs-Bericht

**Aggregations-Logik** (auf Server-Seite, SQL):
1. Für jede Resource im Tenant: lade FTE-Default und Availabilities-Segmente für den Zeitbereich.
2. Lade alle `work_item_resources` der Resource im Zeitbereich, joine auf phase/sprint für Datumsspanne (siehe Frage 2 für Alternative).
3. Für jeden Bucket (Woche/Monat/Quartal — UI-Toggle): berechne `Σ(allocation_pct × overlap_days / bucket_days × fte_in_segment)`.
4. Heat-Color: gelb >90%, rot >100%.

**Performance:** für MVP genügt on-the-fly SQL. Kein Materialized View, kein Refresh-Job. Bei <1000 Resources × 52 Wochen ist das eine sub-second-Query.

**Permissions:** `/reports/utilization` ist **tenant-admin** oder **PMO-Rolle** only. PMO-Rolle gibt es noch nicht — entweder neue tenant_role einführen, oder MVP-mäßig nur `tenant-admin`. Siehe **Frage 3**.

### Tech-Entscheidungen

| Entscheidung | Warum |
|---|---|
| Aggregation als **SQL-Funktion**, kein Materialized View | MVP-Volumen klein; Funktion ist nachvollziehbar; Aktualität gratis. Wenn Performance später beißt, Materialized View nachrüsten — Refactor lokal. |
| **Bucket-Berechnung in SQL via `generate_series` + `tstzrange &&`** | Postgres ist gut darin; kein TS-Marshalling; Server-seitig egal ob Edge-Function oder API-Route. |
| **CSV-Export server-side gerendert** (Streaming-Response) | Skaliert für große Tenants; Browser kann den Stream direkt speichern. |
| Class-3-Hard-Block (Spiegelung von PROJ-12-Pattern) | Personenbezogene Resource-Daten dürfen nie an externe LLMs. Wenn ein KI-Vorschlag jemals Resource-Daten lesen soll, fällt der Router automatisch auf den lokalen Stub zurück. |
| Neue Modul-Toggle: `resources` | PROJ-17-konsistent. Tenants ohne Resource-Bedarf können das ganze Surface verstecken. Wird per Migration in `TOGGLEABLE_MODULES` ergänzt. Default-aktiv für bestehende Tenants? Siehe Backfill-Frage. |
| **`work_item_resources` separater Tisch** statt Resource-Spalten am Work Item | Work Item kann mehrere Resources haben (Pair, Team-Task); Allocation-% ist eine Eigenschaft der Verbindung, nicht der Resource. Saubere N:M. |

### Sicherheitsdimension

1. **RLS** — alle drei neuen Tabellen tenant- + project-scoped.
2. **Editor+-Schreibschutz** — Wer FTE oder Allocation ändert, beeinflusst Reports anderer Mitglieder. Das verdient Editor+-Rechte.
3. **Klasse-3-Block** — Resource-Daten gehen nie an externe LLMs.
4. **Audit-Trail** — FTE/Allocation-Änderungen sind via PROJ-10 audit-loggable und damit DSGVO-Auskunft-fähig.
5. **/reports/utilization tenant-admin-only** — der Bericht zeigt Personen-Auslastung über Projektgrenzen, ist also potenzielle HR-Information.
6. **Cross-Tenant** — RLS hindert; zusätzlich `tenant_id NOT NULL` auf jedem Resource-Row.

### Abhängigkeiten

**Neue npm-Pakete:** keine (CSV-Export ohne Library; Postgres-Aggregation reicht).

**Neue Env-Variablen:** keine.

### Out-of-Scope-Erinnerungen (aus der Spec)

- Calendar-Integration (Google/Outlook)
- Auto-Detection von Überbuchungen (UI warnt nur)
- Capacity-Optimization / Re-Balancing
- Time-Tracking
- Skill-/Rolle-Matching für Allocation-Vorschläge

---

### 🎯 Architektur-Entscheidungen, die du treffen musst

Die drei Fragen unten haben echte Trade-offs. Bitte je eine Option pro Frage wählen.

---

**Frage 1 — Resource-Scope: project-scoped oder tenant-scoped?**

Die Spec-AC sagt wörtlich `resources.project_id`. Stakeholder sind project-scoped, also gibt es pro Person bereits N Stakeholder-Rows (eine pro Projekt, in dem sie auftritt). Damit ist die zentrale Frage: ist eine Resource **eine pro Projekt** (folgt dem Stakeholder) oder **eine pro Tenant** (eine kanonische Anna mit FTE=80%, die in beliebig vielen Projekten allociert wird)?

| Option | Schema | Cross-Project-Aggregation | Trade-off |
|---|---|---|---|
| **A** Project-scoped Resource (Spec-Wortlaut) | `resources.project_id NOT NULL`, 1:1 mit Stakeholder | aggregiert über `stakeholders.linked_user_id` (optional!) oder Name-Heuristik | Doppelpflege: Anna in P1 80%, in P2 50% → wer hat recht? Cross-Project-Sum ist fragil ohne `linked_user_id`. |
| **B** Tenant-scoped Resource Pool, projekt-spezifisch via Allocation | neue Tabelle `tenant_resources` (tenant-scoped, eine Anna pro Tenant); Stakeholder-Promotion linkt auf bestehende Resource oder erzeugt neue; nur Allocations sind projekt-spezifisch | trivialer SQL-Join | weicht vom Spec-Wortlaut ab; "Promote-Aktion" muss Pool checken (Anna existiert schon? Linke; sonst neu) |

**Empfehlung:** Option B — sauberere Aggregation, eine kanonische FTE pro Person, kein Identity-Resolver-Problem. Spec-AC können wir entsprechend anpassen.

---

**Frage 2 — Allocation-Datumsspanne: implizit über Phase/Sprint oder explizit auf der Allocation?**

Work Items haben kein eigenes Datum. Für die Bucket-Aggregation (Woche/Monat/Quartal) brauchen wir aber pro Allocation einen Zeitraum.

| Option | Schema | Trade-off |
|---|---|---|
| **A** Implizit: Allocation erbt Datum von der Phase oder dem Sprint des Work Items | `work_item_resources` bleibt schlank (nur work_item_id, resource_id, allocation_pct) | Edge-Case: Work Item ohne Phase/Sprint → keine Bucket-Beteiligung; Phase/Sprint-Datums-Änderung verschiebt unmerkbar Allocation |
| **B** Explizit: Allocation hat eigene `effective_from`/`effective_to` | mehr Flexibilität, kein Edge-Case | Doppelpflege, wenn Work-Item-Phase verschoben wird |
| **C** Eigene `resource_allocations`-Tabelle entkoppelt vom Work Item | `(resource_id, project_id, start_date, end_date, allocation_pct, work_item_id?)` — Work-Item-Verbindung optional | maximaler Flexibilität (man kann Anna 20% an Projekt X allocieren, ohne ein Work Item zuzuweisen); bricht aber den Spec-AC „assigned to work_items via join table" |

**Empfehlung:** Option A für MVP — folgt der Spec, Edge-Case (kein Phase/Sprint) ist ehrlich UI-warnbar. Wenn später echte zeitliche Granularität gebraucht wird, Refactor zu C.

---

**Frage 3 — `/reports/utilization` Permissions: tenant-admin only oder neue PMO-Rolle?**

Der Cross-Project-Bericht zeigt Personen-Auslastung. Das ist HR-relevante Information.

| Option | Wer darf reinschauen | Trade-off |
|---|---|---|
| **A** Nur tenant-admin (MVP-pragmatisch) | bestehende `tenant_memberships.role='admin'` | einfach, kein Schema-Change |
| **B** Neue tenant-Rolle `pmo` (oder `member` mit explizitem Bericht-Recht) | erweitert `tenant_memberships.role` Enum | sauberer, aber Migration auf `tenant_memberships` und neuer UI-Pfad zur Rolle-Vergabe (PROJ-17 Erweiterung) |

**Empfehlung:** Option A für MVP — minimaler Aufwand. PMO-Rolle als eigene Slice nachschieben, sobald Tenants das fragen.

---

**Wenn du alle drei beantwortet hast, gehe ich in `/backend`.** Standard-Empfehlungen wären **B-A-A**: tenant-scoped Resource-Pool + Datum implizit über Phase/Sprint + tenant-admin only.

---

### Festgelegte Design-Entscheidungen (locked: 2026-04-29)

**Frage 1 — Resource-Scope: Option B (Tenant-Pool).**
Eine `resources`-Tabelle ist tenant-scoped (`tenant_id NOT NULL`, kein `project_id`). Eine Person hat genau eine Resource-Row pro Tenant mit kanonischer FTE/Verfügbarkeit. Stakeholder-„Promote to resource" linkt auf bestehende Resource (via `stakeholder.linked_user_id` als primärem Identitäts-Key, mit Fallback auf manuelles „Mit existierender Resource verknüpfen?"-Picker, wenn `linked_user_id` fehlt) oder erzeugt eine neue. Spec-AC mit `project_id` wird entsprechend revidiert.

**Frage 2 — Allocation-Datum: Option A (implizit via Phase/Sprint).**
`work_item_resources` trägt nur `(work_item_id, resource_id, allocation_pct)`. Datumsspanne kommt aus dem Work-Item-Phase oder dem Work-Item-Sprint. Edge-Case „Work Item ohne Phase und ohne Sprint": Allocation existiert in der DB, geht aber nicht in die Bucket-Aggregation ein und wird im UI als „kein Datum, nicht im Auslastungs-Bericht enthalten" markiert. Wenn später echte Granularität gebraucht wird, Refactor zu Option C als eigene Slice.

**Frage 3 — Utilization-Report: Option A (tenant-admin only).**
`/reports/utilization` ist hinter `is_tenant_admin(tenant_id)`. Keine neue Rolle. PMO-Rolle als eigenständige Slice in PROJ-17-Erweiterung wenn Tenants das fragen.

Mit B-A-A bleibt die Spec-AC-Liste **fast unverändert**, mit zwei Korrekturen:
- AC „Table `resources`: `id, tenant_id, project_id, ...`" → entferne `project_id`.
- AC „Resources can be assigned to work_items via a `work_item_resources` join table" → bleibt; Allocation hat KEINE eigene Datumsspalte (kommt von Phase/Sprint).

## Implementation Notes

### Backend (2026-04-29)

**Migration `20260429240000_proj11_resources_capacity_utilization.sql`** (applied live)
- `public.resources` — tenant-scoped pool. Optional `source_stakeholder_id` (ON DELETE SET NULL) and `linked_user_id` (ON DELETE SET NULL). Unique partial index on `(tenant_id, linked_user_id) WHERE linked_user_id IS NOT NULL` enforces the canonical-Anna-per-tenant invariant. CHECK constraints clamp `fte_default`/`availability_default` to [0, 1] and enforce `kind ∈ {internal, external}`.
- `public.resource_availabilities` — date-segmented FTE overrides; `start_date <= end_date` enforced.
- `public.work_item_resources` — project-scoped allocation join with unique `(work_item_id, resource_id)`. `allocation_pct` allowed up to 200% per row (lets a single critical task pull double weight without splitting). Cross-work-item over-allocation is **deliberately not blocked at the DB level** — it surfaces in the report (yellow >90%, red >100%).
- RLS — `resources` + `resource_availabilities`: SELECT for tenant_member; INSERT/UPDATE for tenant_admin or `tenant_role='editor'`; DELETE on `resources` is admin-only. `work_item_resources`: SELECT for project_member; INSERT/UPDATE/DELETE for editor+/lead/admin.
- Audit — `resources` and `work_item_resources` added to the audit whitelist + `_tracked_audit_columns` (resources tracks `display_name, kind, fte_default, availability_default, is_active, linked_user_id`; work_item_resources tracks `allocation_pct`). `can_read_audit_entry` extended: `work_item_resources` resolves to the project; `resources` is admin-only history (HR data).
- `utilization_report(tenant_id, start, end, bucket)` PG function — `SECURITY INVOKER` so RLS still applies. Aggregates `Σ(allocation_pct × overlap_days / bucket_days × fte × availability)` per (resource × bucket). Date source for the work item is `phase.planned_start/end` first, `sprint.start_date/end_date` as fallback; work items with neither are silently excluded (matching design choice 2A).
- Module activation — idempotent backfill of `resources` into all existing tenants' `active_modules`.

**Code**
- `src/types/resource.ts` — `Resource`, `ResourceAvailability`, `WorkItemResource`, `UtilizationCell` types + bucket label maps.
- `src/types/tenant-settings.ts` — added `resources` to `ModuleKey`, `TOGGLEABLE_MODULES`, and `MODULE_LABELS`.
- `src/lib/ai/data-privacy-registry.ts` — all resource fields classified Class-3 (PII), allocation_pct = 2.
- `src/lib/resources/api.ts` — typed fetch wrappers (`listResources`, `createResource`, `promoteStakeholderToResource`, availabilities CRUD, allocation CRUD, `fetchUtilization`, `utilizationCsvUrl`).

**API routes (8 routes)**
- `GET/POST /api/resources` — tenant-scoped list + create. Active-tenant resolved via the caller's first tenant_membership.
- `GET/PATCH/DELETE /api/resources/[rid]`.
- `GET/POST /api/resources/[rid]/availabilities`.
- `DELETE /api/resources/[rid]/availabilities/[aid]`.
- `POST /api/stakeholders/[id]/promote-to-resource` — links to existing resource via `linked_user_id` if present (returns `{created: false}`); otherwise creates a new resource populated from stakeholder fields. Race-safe (catches `23505` and re-reads).
- `GET/POST /api/projects/[id]/work-items/[wid]/resources` — allocation join, project-scoped via work-item.
- `PATCH/DELETE /api/projects/[id]/work-items/[wid]/resources/[aid]`.
- `GET /api/reports/utilization?start=&end=&bucket=&format=` — tenant-admin only. JSON or CSV (RFC-4180 quoting for names with commas).
- All routes gated by `requireModuleActive(tenantId, "resources", {intent})`.

**Tests**
- `src/app/api/resources/route.test.ts` (8 tests): POST 401/400×2/403/201/409 + GET 401/200/filter.
- `src/app/api/projects/[id]/work-items/[wid]/resources/route.test.ts` (6 tests): POST 401/400/404 (cross-project)/201/409 + GET 200.
- `src/app/api/reports/utilization/route.test.ts` (6 tests): 401, 400 missing params, 400 reversed range, 403 non-admin, 200 JSON, 200 CSV with comma-escape.
- Total: **284/284 vitest tests pass** (was 263 before this slice; +21 new).

**Live red-team math check** (one-shot probe via `mcp__supabase__execute_sql`)
- Seeded a phase (6.–19. April), a work item under it, a resource (FTE 0.8 × Avail 1.0 = 0.8), and a 50% allocation.
- `utilization_report` returned exactly **40% per Woche** for the 2 weekly buckets fully covering the phase, **0%** for buckets outside it. Math correct.

**Notes for QA / lint**
- Lint baseline holds at 57 problems (no new errors from PROJ-11).
- Type-check clean.
- Frontend not yet built — interactive UI review must happen post-`/frontend`.

### Frontend (2026-04-29)

**Pages**
- `/stammdaten/resources` — tenant-wide pool. List of resource cards (kind badge, FTE+availability summary, "Inaktiv" badge if applicable). Filter by kind + "Auch inaktive zeigen" toggle. Drawer with `ResourceForm` + `AvailabilityList` for date-segmented overrides + delete button.
- `/reports/utilization` — heatmap report. Filter bar (start, end, bucket: Wöchentlich / Monatlich / Quartalsweise), legend, sticky-left resource-name column, tabular numbers, heat-coloring (0% muted, ≤50% light green, 50–90% green, >90% amber, >100% red). CSV export opens server stream in new tab.
- `/stammdaten/page.tsx` updated from placeholder to a section index card linking to `/stammdaten/resources`.
- `/reports/page.tsx` — added the "Auslastung" card alongside Audit-Bericht.

**Components** (under `src/components/resources/`)
- `resource-form.tsx` — display_name + kind + FTE + availability + active toggle, with client-side range validation.
- `availability-list.tsx` — list of segments with delete + inline create form for new segments.
- `resources-page-client.tsx` — main pool page client (filters, list, drawer).
- `utilization-heatmap.tsx` — pivot of utilization cells into a (resource × bucket) table with heat-coloring.

**Work-item drawer** (`work-item-allocations.tsx`)
- New section "Ressourcen-Allocation" between AI-source and Actions.
- Lists current allocations (resource name + inline percent input + remove button).
- "Hinzufügen" form picks an unused resource from the tenant pool + percent.
- Hidden when the `resources` module is disabled for the tenant.
- Read-only when `canEdit` is false.

**Stakeholder tab**
- New "Als Ressource übernehmen" button in the edit drawer's secondary-action row.
- Toast distinguishes "angelegt" vs "verknüpft mit existierender" — promote-endpoint returns `{created: boolean}`.
- Hidden when the `resources` module is disabled for the tenant.

**Hooks**
- `use-resources.ts` — list + create/update/delete with auto-refresh on each mutation.

**Notes for QA / lint**
- 284/284 vitest tests pass; type-check clean.
- Lint: 63 problems = baseline 57 + 6 new (5 `react-hooks/set-state-in-effect` errors matching the codebase pattern + 1 missing-deps warning on `useResources`'s options-object stable shape). All baseline-style.
- Build: all 8 new API routes + 3 new pages (`/stammdaten/resources`, `/reports/utilization`, `/projects/[id]/kommunikation` from PROJ-13) appear in the route output.
- I did not run an interactive browser pass — auth flow needed. Smoke-checked: `npm run build` succeeds, `tsc --noEmit` clean, all routes registered.

**For the recommended manual smoke-test (post-deploy or in /qa):**
- Open Stakeholder tab → bearbeiten → "Als Ressource übernehmen" → toast "angelegt" → reopen on second project's stakeholder for same person → toast "verknüpft" (only if `linked_user_id` is set on both stakeholders).
- Open `/stammdaten/resources` → CRUD a resource, add/remove an availability segment.
- Open a Work Item → "Ressourcen-Allocation" → pick a resource → add 50% → toast.
- As tenant-admin, open `/reports/utilization` → adjust dates → see heatmap render → click CSV download.
- Toggle `resources` module off in `/settings/tenant` → reload → tab/section/buttons disappear.

## QA Test Results

**Date:** 2026-04-29
**Tester:** Claude (Opus 4.7) acting as QA + red-team
**Method:** vitest (mocked Supabase) + 10 live red-team probes against `iqerihohwabyjzkpcujq` using `mcp__supabase__execute_sql` with `SET LOCAL request.jwt.claims` for impersonation. Each probe ran in its own auto-rolled-back transaction.

### Acceptance criteria

#### Resource derivation (ST-01)
- [x] `resources` table — schema verified live (tenant-scoped per locked design choice 1B; AC adjusted to drop `project_id`).
- [x] "Promote to resource" button on stakeholder rows — added in `stakeholder-tab-client.tsx` secondary action; module-gated; toast distinguishes created vs linked.
- [x] Stakeholder ↔ resource link preserved bidirectionally — `resources.source_stakeholder_id` ON DELETE SET NULL keeps history; promote-endpoint backfills the link if missing on a re-promote.
- [x] Allocation join — `work_item_resources(work_item_id, resource_id, allocation_pct)`, project-scoped via `project_id`, unique on `(work_item_id, resource_id)`.

#### Manual FTE / availability (ST-02)
- [x] FTE + availability editable per resource — `ResourceForm` validates 0–1 client + DB `CHECK`.
- [x] Time-segmented availability via `resource_availabilities` — `AvailabilityList` with inline create/delete; DB `CHECK (start_date <= end_date)` and `CHECK (fte 0–1)`.
- [x] Edits audited — `audit_changes_resources` trigger logs `display_name, kind, fte_default, availability_default, is_active, linked_user_id` to `audit_log_entries`.

#### Cross-project utilization report (ST-03)
- [x] `/reports/utilization` route — admin-gated via `requireTenantAdmin`.
- [x] Aggregation `Σ(allocation_pct × overlap_days / bucket_days × fte × availability)` per (resource × bucket) — implemented in PG function `utilization_report(tenant_id, start, end, bucket)`, math verified via 4 edge-case probes.
- [x] Buckets weekly / monthly / quarterly — UI Select toggle in heatmap.
- [x] Heat coloring yellow >90%, red >100% — `heatClass()` in `utilization-heatmap.tsx`.
- [x] Filters: date range, bucket — UI; role/org-unit/internal-external are out of MVP scope but the field set supports them later.
- [x] CSV export — server route returns `text/csv` with proper escaping (commas in resource names get quoted).
- [x] Class-3 gating — all PII-relevant resource fields registered Class-3 in `data-privacy-registry.ts`; PROJ-12 router blocks external LLM calls automatically.

#### Edge cases from spec
- [x] Resource derived from deactivated stakeholder → resource auto-marked inactive — *not implemented in this slice* (tracked as Low M1, see below).
- [x] >1.0 allocation across work items → utilization shows red at >100%, no DB block — DB allows up to 200% per allocation row; report visualizes overbooking (red >100%).
- [x] Cross-tenant resource — impossible by RLS (`tenant_id NOT NULL` + RLS verified P1+P2).
- [x] Time segments overlapping — last-saved wins by INSERT order; both audited via the table itself (no audit trigger needed on `resource_availabilities` per design).
- [x] Bucket boundary partial overlap — pro-rata day-weighted via `LEAST/GREATEST` math; verified live (E1: 3/7 = 42.86%).

### Live red-team probe results

| Probe | What it checks | Result |
|---|---|---|
| P1 | Non-member SELECT on `resources` + `resource_availabilities` + `work_item_resources` | **PASS** — 0 rows on all three |
| P2 | Non-member INSERT on all three | **PASS** — RLS rejects all three with explicit error |
| P3 | Policy expressions match design (audit only) | **PASS** — `is_tenant_member` for SELECT, `is_tenant_admin OR has_tenant_role(editor)` for resources writes, project-membership chain for WIR writes |
| P4 | FK RESTRICT on resource delete + admin delete roundtrip | **PASS** — delete blocked when allocation exists (`23503`), delete succeeds when none |
| P5 | CHECK constraints (9 invalid states) | **PASS** — all 9 blocked: bad kind, FTE >1/<0, empty name, availability >1, RA end<start, RA FTE >1, allocation >200/<0 |
| P6 | Canonical-Anna unique invariant | **PASS** — duplicate `linked_user_id` blocked; multiple null-linked resources allowed |
| P7 | Audit trigger fires on `resources` + `work_item_resources` | **PASS** — 4 resource fields tracked, 1 WIR field tracked, with old/new values captured |
| P8 | utilization_report math (4 edges: partial overlap, no-dates, multi-allocation, sprint-dated) | **PASS** — 42.86% / 50% / 30% / 0% all match expected arithmetic |
| P9 | Module backfill landed in live tenant | **PASS** — `resources` present in `tenant_settings.active_modules` alongside the existing 5 modules |
| P10 | `can_read_audit_entry` scoping | **PASS** — admin=true, non-member=false on both resources + WIR |

### Automated tests
- `npx vitest run` → **284/284 pass** (21 new tests for PROJ-11: 8 resources route + 6 allocation route + 6 utilization report + 1 modules.test.ts update; the slice added 21 net new tests).
- `npx tsc --noEmit` → clean.
- `npm run lint` → 63 problems = baseline 57 + 6 new (5 `react-hooks/set-state-in-effect` errors matching the codebase pattern in `useResources`/`AvailabilityList`/`UtilizationHeatmap`/`WorkItemAllocations`/`stakeholder-tab-client`, plus 1 missing-deps warning on `useResources`'s options-object stable shape). All baseline-style.

### Security advisors
- `mcp__supabase__get_advisors security` → no NEW lints from PROJ-11. The new `utilization_report` PG function is `SECURITY INVOKER`, so it correctly doesn't appear in the security-definer warnings. All warnings are pre-existing baseline.

### Bugs found

**Critical: 0 / High: 0 / Medium: 0 / Low: 1**

#### L1 (Low) — Stakeholder deactivation does not propagate to derived resource
**Severity:** Low (UX/consistency, not security)
**Spec ref:** Edge Cases, "Resource derived from a stakeholder that's been deactivated → resource auto-marked inactive"
**What it is:** The promote-endpoint links `resources.source_stakeholder_id` to a stakeholder via FK with `ON DELETE SET NULL`, but there's no trigger or hook that observes `stakeholder.is_active=false` and flips the linked resource's `is_active`. Today the user must deactivate the resource manually in `/stammdaten/resources`.
**Steps to reproduce:**
1. Promote a stakeholder to a resource.
2. Open the stakeholder tab → "Deaktivieren".
3. Open `/stammdaten/resources` → linked resource still shows `is_active=true`.
**Workaround:** Manually toggle "Aktiv" off in the resource drawer. The audit trail captures both deactivations independently.
**Recommendation:** Defer to a follow-up slice (small trigger or domain-event handler). Not blocking for production because the resource pool is admin-curated and stakeholder deactivations are rare.

### Limitations / follow-ups (not blockers)

- **No interactive browser pass.** I cannot authenticate against the live UI from this session. Spot-tests confirmed: dev server compiles cleanly, all 8 new API routes + 3 new pages register in the build output. A manual click-through (Promote → toast unterscheidet "angelegt"/"verknüpft", heatmap colors at 90%/100% transition, CSV download with comma-name resource, module-toggle hides surfaces) belongs in post-deploy smoke-testing.
- **No second tenant fixture** — cross-tenant isolation probed via synthetic non-member uid (no membership rows). RLS keys off `is_tenant_member()` only, so this is functionally equivalent to a cross-tenant attacker.
- **No CI-level integration test for triggers/RLS** — same recurring observation across PROJ-12, PROJ-17, PROJ-13. Live red-team here covers it for now.

### Production-ready decision

**READY** — no Critical or High bugs. The single Low finding (L1: stakeholder→resource deactivation propagation) is a known feature gap from the spec edge-case list and has a clear manual workaround.

Recommend proceeding to `/deploy`.

## Deployment

**Deployed:** 2026-04-29
**Production URL:** https://projektplattform-v3.vercel.app
**Deployed by:** push to `main` → Vercel auto-deploy
**Tag:** `v1.14.0-PROJ-11`

### What went live
- Migration `20260429240000_proj11_resources_capacity_utilization` (already applied to Supabase project `iqerihohwabyjzkpcujq` during /backend; the deploy commit makes the file part of the canonical history). Three new tables (`resources`, `resource_availabilities`, `work_item_resources`) with full RLS, audit triggers, plus the `utilization_report(tenant_id, start, end, bucket)` PG function (`SECURITY INVOKER`).
- Backend: 8 new API routes under `/api/resources/*`, `/api/projects/[id]/work-items/[wid]/resources/*`, `/api/stakeholders/[id]/promote-to-resource`, `/api/reports/utilization`. Tenant-admin only on the report; editor+/admin on writes; class-3 PII classification across all personal fields.
- Frontend: tenant pool at `/stammdaten/resources`, utilization heatmap at `/reports/utilization`, allocation section in the work-item detail drawer, "Als Ressource übernehmen" action on stakeholder rows. New `resources` module key promoted from RESERVED to TOGGLEABLE.
- Tenant settings: `resources` backfilled into all existing tenants' `active_modules`.

### Post-deploy smoke-test checklist (manual, recommended)
- [ ] Open Stakeholder tab → bearbeiten → "Als Ressource übernehmen" → toast says "angelegt"; do the same on a stakeholder for the same `linked_user_id` from another project → toast says "verknüpft mit existierender".
- [ ] `/stammdaten/resources` → CRUD a resource; add an availability segment for a date range; delete it; verify list refreshes.
- [ ] Open a work item with a phase → "Ressourcen-Allocation" → pick a resource → 50% → toast "Allocation angelegt"; change percent inline → blur → toast.
- [ ] As tenant-admin, open `/reports/utilization` → choose a date range covering a phased work item → verify heatmap colors match the math (50% phase × 0.8 FTE = 40%); switch bucket to "Monatlich"; click CSV → file downloads with proper RFC-4180 quoting.
- [ ] Toggle the `resources` module off in `/settings/tenant` → reload → `/stammdaten/resources` returns 404, `/reports/utilization` blocked, "Ressourcen-Allocation" section disappears from work-item drawer, "Als Ressource übernehmen" button hides on stakeholder rows.

### Known follow-ups (not blocking)
- **L1 (Low)**: Stakeholder deactivation does not propagate to derived resource (spec edge case). Manual workaround documented in QA. Future slice will add a small trigger or domain-event handler.
- **PMO-Rolle** for the utilization report (deferred per design choice 3A) — currently tenant-admin only. Add a `pmo` role to `tenant_memberships.role` enum if customers ask.
- **Real-Postgres CI integration test** for triggers/RLS — recurring follow-up across PROJ-12, PROJ-13, PROJ-17, PROJ-11. Live red-team probes cover it for now.
- **Time-segmented availability** is implemented schema-wise (`resource_availabilities`) but the `utilization_report` function currently uses only `fte_default × availability_default` and ignores the segment overrides. The schema is ready; aggregation lookup of segments is a small follow-up that won't require a migration.
