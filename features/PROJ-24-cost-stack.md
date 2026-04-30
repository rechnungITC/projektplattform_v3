# PROJ-24: Cost-Stack — Tagessätze pro Rolle, Velocity-Modell & Kosten pro Work-Item

## Status: Planned
**Created:** 2026-04-30
**Last Updated:** 2026-04-30

## Summary
Bringt Geld an die Arbeit. Drei Säulen:

1. **Tagessätze pro Rolle** — neue zentrale Tabelle `role_rates` (tenant-scoped, version­iert via `valid_from`). Eine Ressource leitet ihren Tagessatz über `stakeholder.role_key` ab.
2. **Velocity-Modell** für Story-Cost — Tenant-Setting "1 SP = X Personentage" (default 0,5). Bei Stories: Cost = Story-Points × Velocity-Faktor × Σ(allocation × rate).
3. **Generische Cost-Lines** pro Work-Item — neue Tabelle `work_item_cost_lines` mit `source_type` als Diskriminator. MVP implementiert nur `resource_allocation`; LV-Positionen, Stücklisten und Mischkalkulationen kommen später als zusätzliche Source-Types ohne Schema-Änderung dazu.

Live-View aggregiert Cost-Lines pro Work-Item; Performance-Bedarf: ~500 Ressourcen × ~hunderte Work-Items pro Projekt — unkritisch für eine SQL-View.

## Dependencies
- **Requires PROJ-9** (Work Items) — Cost-Lines hängen am Work-Item.
- **Requires PROJ-11** (Resources + work_item_resources allocation_pct).
- **Requires PROJ-7** (Sprints) — für Story-Cost-Berechnung über Sprint-Dauer.
- **Requires PROJ-8** (Stakeholders) — `stakeholder.role_key` ist die Brücke Ressource → Tagessatz.
- **Requires PROJ-6** (Project-Type-Catalog) — die `standard_roles[].key`-Werte sind die kanonischen `role_key`-Werte für `role_rates`.
- **Requires PROJ-22** (Budget-Modul) — Cost-Lines aggregieren später in Budget-Posten ein (`work_item_cost_lines.aggregates_into_budget_item_id` als optionale Verknüpfung).
- **Requires PROJ-17** (Tenant-Settings) — neue `cost_settings`-JSONB-Spalte für `velocity_factor` + `default_currency`.

## V2 Reference Material
- V2 hatte rudimentäre Personentage-Tracking, aber keine Tagessatz-Versionierung und keinen generischen Cost-Line-Ansatz. V3 macht es sauberer.

## User Stories
- **Als Tenant-Admin** möchte ich für jede Rolle (z.B. Senior-Developer, Project-Lead, Key-User) einen Tagessatz hinterlegen, damit Kostenrechnungen automatisch funktionieren.
- **Als Tenant-Admin** möchte ich Tagessätze versionieren — wenn ich heute den Senior-Dev-Satz von 1.200 €/Tag auf 1.300 €/Tag erhöhe, sollen alte Cost-Berechnungen aus 2024 mit dem damaligen Satz stabil bleiben.
- **Als Projektleiter:in** möchte ich beim Anlegen eines Arbeitspakets eine Dauer in Tagen angeben + Ressourcen zuordnen — das System rechnet sofort die Kosten aus.
- **Als Projektleiter:in (Scrum)** möchte ich bei Stories nur Story-Points pflegen (Fibonacci) — das System leitet Kosten ab über die Tenant-Velocity (z.B. 1 SP = 0,5 Personentage) × allokierte Ressourcen × deren Tagessätze.
- **Als Sponsor:in** möchte ich die aggregierten Plan-Kosten eines ganzen Epics + Sprints + Projekts sehen, ohne dass ich manuell rechnen muss.
- **Als Architekt** möchte ich, dass das Schema später um LV-Positionen, Stücklisten und Mischkalkulationen erweiterbar ist — ohne PROJ-24 anzufassen.
- **Als Compliance-Verantwortliche** möchte ich, dass Tagessätze und Velocity-Settings als Class-3-Daten klassifiziert sind (Personalkosten = sensibel) und nicht in externe LLMs leaken.

## Acceptance Criteria

### ST-01 Tabelle `role_rates`
- [ ] Felder: `id, tenant_id, role_key (text), daily_rate numeric(10,2), currency char(3), valid_from date, created_by, created_at, updated_at`. UNIQUE auf `(tenant_id, role_key, valid_from)`.
- [ ] RLS: SELECT für tenant-member; INSERT / DELETE für tenant-admin. **Keine UPDATE-Policy** (Versionierung via `valid_from`, alte Werte bleiben unverändert — Audit-Pattern wie `fx_rates` aus PROJ-22).
- [ ] CHECK: `daily_rate >= 0`, `currency` in der ISO-Whitelist (gleiche wie PROJ-22: EUR/USD/CHF/GBP/JPY).
- [ ] `role_key` darf jeder String sein (kein FK auf catalog) — der Catalog liefert die kanonischen Werte, aber ein Tenant kann auch tenant-eigene Rollen haben.

### ST-02 Tenant-Settings `cost_settings`
- [ ] Neue JSONB-Spalte `tenant_settings.cost_settings` mit Defaults: `{velocity_factor: 0.5, default_currency: "EUR"}`.
- [ ] `velocity_factor` ∈ [0.1, 5.0] (CHECK in der TypeScript-Schicht; nicht als DB-CHECK, weil JSONB).
- [ ] PROJ-17-Tenant-Settings-UI bekommt einen neuen Abschnitt "Kosten" mit beiden Feldern. Admin-only.

### ST-03 Tabelle `work_item_cost_lines`
- [ ] Felder: `id, tenant_id, project_id, work_item_id, source_type, amount numeric(14,2), currency char(3), occurred_on date nullable, source_ref_id uuid nullable, source_metadata jsonb default '{}', created_by, created_at`.
- [ ] CHECK auf `source_type`: `('resource_allocation', 'manual', 'lv_position', 'material', 'stueckliste', 'mischkalkulation')`. MVP implementiert nur `resource_allocation` und `manual`; die anderen sind reserviert für spätere Slices.
- [ ] RLS: SELECT für project-member; INSERT/UPDATE/DELETE für project-editor/lead/admin.
- [ ] Index auf `(work_item_id, source_type)` und `(project_id)`.
- [ ] CHECK auf `currency` (ISO-Whitelist), `amount >= 0` für nicht-storno-Lines.

### ST-04 Cost-Calc-Engine — `resource_allocation`-Pfad
- [ ] Pure-TS-Funktion `calculateWorkItemCosts(item, allocations, role_rates, tenant_velocity)` — unit-tested.
- [ ] **Bei Arbeitspaketen mit Dauer**: `cost = estimated_duration_days × Σ(allocation_pct × daily_rate_at_creation)`.
- [ ] **Bei Stories mit Story-Points**: `cost = story_points × velocity_factor × Σ(allocation_pct × daily_rate_at_creation)`.
- [ ] **Bei Items ohne Dauer + ohne SP**: kein Cost-Line; UI zeigt "—".
- [ ] **Tagessatz-Auflösung**: Allocation → Resource → `source_stakeholder_id` → `stakeholder.role_key` → `role_rates`-Lookup nach jüngstem `valid_from ≤ work_item.created_at`. Wenn keine Rate gefunden: Cost-Line mit Hinweis-Flag in `source_metadata`.

### ST-05 Live-View `work_item_cost_totals`
- [ ] SQL-View mit `security_invoker = true`, aggregiert pro Work-Item: `total_cost`, `currency` (Multi-Currency-Hinweis falls Cost-Lines verschiedene Currencies haben), `cost_lines_count`, `is_estimated` (true wenn nur SP-basiert, false wenn Dauer-basiert).
- [ ] Performance-Ziel: bei einem Projekt mit 500 Ressourcen × 500 Work-Items → Aggregation < 500 ms. Falls Performance-Bedarf entsteht: Materialized-View als PROJ-24b.

### ST-06 Cost-Lines werden automatisch erzeugt
- [ ] Bei Anlegen / Aktualisieren einer `work_item_resources`-Allocation: ein `work_item_cost_lines`-Eintrag mit `source_type='resource_allocation'` wird via API-Route geschrieben (synthetic insert per service-role admin-Client, gleiches Pattern wie PROJ-22-Buchungs-Audit).
- [ ] Bei Änderung der Work-Item-Dauer oder Story-Points: bestehende `resource_allocation`-Cost-Lines werden aktualisiert (oder ersetzt: alte gelöscht, neue eingefügt).
- [ ] Bei Storno einer Allocation (Soft-Delete): zugehörige Cost-Line wird soft-deleted (oder gelöscht — Entscheidung in `/architecture`).

### ST-07 API-Endpunkte
- [ ] `GET /api/tenants/[id]/role-rates` (admin-only via RLS) — versioned list.
- [ ] `POST /api/tenants/[id]/role-rates` — neuer Tagessatz mit valid_from-Datum.
- [ ] `DELETE /api/tenants/[id]/role-rates/[rid]` — Lösch-Action (für Tippfehler-Korrekturen).
- [ ] `GET /api/projects/[id]/cost-summary` — aggregiert Plan-Kosten über das gesamte Projekt mit Aufschlüsselung nach Kategorie (Epic / Phase / Sprint / unsortiert).
- [ ] `GET /api/projects/[id]/work-items/[wid]/cost-lines` — alle Cost-Lines eines Items.
- [ ] `POST /api/projects/[id]/work-items/[wid]/cost-lines` — manuelle Cost-Line (`source_type='manual'`).

### ST-08 UI
- [ ] **Tenant-Admin-Page** `/settings/tenant/role-rates` — Tabelle aller Rollen + ihrer Rates inkl. valid_from-Historie. Admin pflegt manuell.
- [ ] **Work-Item-Detail-Drawer** (existing) bekommt einen neuen Abschnitt "Kosten" mit: aggregiertem Total + Aufschlüsselung pro Cost-Line + manuelle-Cost-Line-Action.
- [ ] **Backlog-Liste**: pro Item-Zeile eine kleine Cost-Anzeige (z.B. "≈ 4.480 €" für SP-basiert mit Tilde-Hinweis "estimated").
- [ ] **Tenant-Settings**-Page bekommt neuen Abschnitt "Kosten-Defaults" mit `velocity_factor` + `default_currency`.

### ST-09 Audit + Datenschutz
- [ ] Audit-Whitelist erweitert um `role_rates`, `work_item_cost_lines`. Tracked Columns: `role_rates.daily_rate/currency/valid_from`; `work_item_cost_lines.amount/currency/source_metadata`.
- [ ] `data-privacy-registry`: `role_rates.daily_rate` → **Class 3** (Personalkosten = sensibel), `role_rates.role_key/valid_from` → Class 2. `work_item_cost_lines.amount/currency` → Class 2; `source_metadata` → Class 3 (kann Notes enthalten).
- [ ] Module-Toggle: kein eigener Toggle. Cost-Stack ist Plattform-Foundation, immer aktiv.

## Edge Cases
- **Allocation existiert, aber keine `role_rates` für die Rolle**: Cost-Line mit `amount=0` + `source_metadata.warning='no_rate_for_role'`. UI zeigt "Tagessatz fehlt — bitte Tenant-Admin fragen".
- **Stakeholder ohne `role_key`** (NULL): keine Cost-Line; UI-Hinweis "Stakeholder hat keine Rolle".
- **Resource ohne `source_stakeholder_id`** (z.B. anonym oder external): keine Cost-Line; UI-Hinweis.
- **Velocity-Faktor in Tenant-Settings auf 0**: alle SP-basierten Cost-Lines haben `amount=0`; UI zeigt explizit "0 € (Velocity = 0)".
- **Story ohne Sprint-Zuordnung**: Velocity-Logik fällt auf "kein Sprint = kein Sprint-Tage-Bezug" — Cost ist trotzdem berechenbar weil Velocity-Faktor pro SP angegeben ist (nicht "pro Sprint").
- **Item-Wechsel zwischen Story und Work-Package**: alte Cost-Lines werden gelöscht, neue nach neuer Logik berechnet (siehe ST-06).
- **Tagessatz-Änderung mid-Projekt**: alte Cost-Lines bleiben mit altem Satz (immutable); neue Allocations bekommen neuen Satz. Audit-Trail via `valid_from`.
- **Multi-Currency**: ein Work-Item kann Cost-Lines in verschiedenen Currencies haben (z.B. Senior-Dev in EUR + externe Beraterin in USD). View zeigt `multi_currency_count`; Aggregations-Endpunkt nutzt PROJ-22 `fx_rates` für Sammelwährungs-Reports.
- **Item soft-deleted**: Cost-Lines werden NICHT mit-soft-deleted; Audit-Trail bleibt erhalten. Aggregations-View filtert soft-deleted Items raus.

## Technical Requirements
- **Stack**: Next.js 16 + Supabase + bestehende Patterns.
- **Multi-tenant**: Standard-RLS, alle Tabellen tenant_id-NOT-NULL + ON DELETE CASCADE.
- **Validation**: Zod für Rate + Cost-Line-Inputs.
- **Performance**: View bei 500×500 < 500 ms; Allokations-Edit triggert ≤ 1 zusätzliche INSERT/UPDATE.
- **Audit**: PROJ-10-Pattern für UPDATE; synthetic-INSERT-Audit für Cost-Lines (gleiches Pattern wie PROJ-22 budget-postings).
- **Privacy**: Class-3 für `daily_rate` und Cost-Line-Metadata.
- **Module-Gate**: keine, immer aktiv.

## Out of Scope (deferred)

### PROJ-24b (next slice, "Mehrere Source-Types")
- LV-Position-Cost-Lines (`source_type='lv_position'`) für Construction-Extension.
- Stücklisten/Wareneinsatz (`source_type='material' / 'stueckliste'`).
- Mischkalkulationen (`source_type='mischkalkulation'`) mit gewichteter Mehrfach-Quelle.

### PROJ-24c (später)
- Zeit-Tracking-Integration (PROJ-11 Stunden × Tagessatz für tatsächliche Personenkosten).
- Genehmigungs-Workflow für Tagessatz-Änderungen.
- Kosten-Forecasting / Burndown.
- Excel-Export von Cost-Reports.

### Explizite Non-Goals
- **Keine Lohnbuchhaltung** — wir berechnen Projektkosten, keine Gehaltsabrechnungen.
- **Keine automatische Sammelwährungs-Konvertierung** in der View — UI nutzt PROJ-22-FX-Rates für aggregierte Reports.
- **Keine Cost-Approvals pro Item** — Plan-Werte werden ohne Freigabe geändert.

## Suggested locked design decisions for `/architecture`

1. **Tagessatz-Versionierung**
   - **A. `valid_from` mit composite UNIQUE** (wie locked diskutiert). Aktuelle Rate = max valid_from ≤ heute. Versionsstabil.
   - B. `created_at`-basierte Latest-Wins. Einfacher, aber kein bewusstes "ab dem 01.01.2026 gilt …" möglich.
   - **A locked** per User-Decision in der Architecture-Pre-Diskussion.

2. **Cost-Line-Lifecycle bei Item-Updates**
   - **A. Replace-on-Update**: alte `resource_allocation`-Cost-Lines werden bei jedem Allocation/Item-Update gelöscht und neu berechnet.
   - B. Diff-and-Patch: nur das Delta wird geändert.
   - **Empfehlung A** — einfacher, immutability-Argument trifft hier nicht (Cost-Lines sind abgeleitet, nicht erfasst).

3. **Velocity-Faktor-Granularität**
   - **A. Tenant-weit** (ein Wert pro Tenant in `tenant_settings.cost_settings`).
   - B. Pro Projekt-Type (im PROJ-6-Catalog) — Software-Projekte könnten anders ticken als ERP.
   - C. Pro Projekt — Override pro Projekt.
   - **Empfehlung A für MVP**, B/C als PROJ-24b falls Bedarf.

4. **`role_key`-Quelle**
   - **A. Frei wählbar** (Tenant kann beliebige `role_key`-Strings pflegen). Catalog liefert nur die Default-Vorschläge.
   - B. Strikt aus dem PROJ-6-Catalog (FK auf eine zentrale Roles-Tabelle).
   - **Empfehlung A** — flexibler, weil Tenants eigene Rollen haben können (z.B. "Sondersachbearbeiter:in Bau-Aufsicht").

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## Implementation Notes
_To be added by /frontend and /backend_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
