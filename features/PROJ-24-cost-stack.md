# PROJ-24: Cost-Stack — Tagessätze pro Rolle, Velocity-Modell & Kosten pro Work-Item

## Status: Architected
**Created:** 2026-04-30
**Last Updated:** 2026-05-02

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

**Architect:** Claude (architecture skill) · **Date:** 2026-05-02 · **CIA-Konsultation:** nicht erforderlich (alle 4 Architektur-Forks bereits in der Spec gelockt; keine neue Technologie, kein neues Pattern — Wiederverwendung von PROJ-22 fx_rates + budget-postings).

### 1. Architectural Approach

PROJ-24 ist ein "Compose, don't invent"-Slice. Drei Bausteine, alle drei sitzen auf bereits in Production erprobten Patterns:

1. **Versionierte Rate-Tabelle** — exakt das Pattern von `fx_rates` aus PROJ-22: append-only, RLS-locked auf Tenant-Admin, keine UPDATE-Policy, composite UNIQUE auf `(tenant_id, role_key, valid_from)`. Eine Tagessatz-Erhöhung ist ein neuer Datensatz, kein Overwrite.
2. **Generische Cost-Line-Tabelle mit `source_type`-Diskriminator** — gleiches Shape wie `budget_postings` aus PROJ-22. Cost-Lines werden nicht in source-spezifische Tabellen verteilt, sondern in eine Tabelle mit Diskriminator-Spalte. LV-Positionen, Stücklisten und Mischkalkulationen sind später nur ein neuer enum-Wert — keine Migration.
3. **Pure-TS Cost-Calc-Engine** — kleines, unit-testbares Modul unter `src/lib/cost/`. Kennt zwei Formeln (Dauer-basiert für Arbeitspakete, Story-Points × Velocity für Stories). Engine läuft im Server inside einer API-Route; **keine** DB-Trigger.

Kein neues Pattern wird erfunden. Alles, was hier neu ist, ist die Anwendung bewährter Bausteine auf einen neuen Domain-Bereich.

### 2. Component Structure

```
Tenant-Settings-Page (existing)
└── New "Kosten"-Section (admin-only)
    ├── Velocity-Factor-Input (numeric, [0.1 .. 5.0])
    └── Default-Currency-Select (ISO-Whitelist EUR/USD/CHF/GBP/JPY)

/settings/tenant/role-rates (NEW page)
├── Header — "+ Neuer Tagessatz"-Button (admin-only)
├── Table — eine Zeile pro Rolle, aktueller Tagessatz + valid_from
└── Per-Row History-Drawer
    └── Vollständige valid_from-Kette (chronologisch)

Work-Item-Detail-Drawer (existing)
└── New "Kosten"-Section
    ├── Aggregated Total + Multi-Currency-Hinweis
    ├── Cost-Line-Liste (eine Zeile pro Source)
    │   └── pro resource_allocation-Line: Resource-Name + Tagessatz + Berechnung
    │   └── pro manual-Line: editierbar (admin/lead/editor)
    └── "+ Manuelle Kostenposition"-Action

Backlog-List (existing)
└── New per-Item-Cost-Cell
    └── Total in Item-Currency, Tilde-Präfix bei SP-basiert ("≈ 4.480 €")
```

### 3. Data Model (in plain language)

**`role_rates`** — eine Zeile pro `(Tenant × Rolle × Gültigkeits­datum)`
- Pflicht: `tenant_id`, `role_key` (freier Text, max 100 Zeichen), `daily_rate`, `currency` (ISO-Whitelist), `valid_from` (date), `created_by`
- Versionierung: append-only, keine UPDATEs erlaubt. Aktueller Satz = jüngstes `valid_from ≤ heute`.
- RLS: Tenant-Mitglieder lesen, nur Admins schreiben/löschen.

**`work_item_cost_lines`** — eine Zeile pro Cost-Source auf einem Work-Item
- Pflicht: `tenant_id`, `project_id`, `work_item_id`, `source_type`, `amount`, `currency`
- Optional: `occurred_on`, `source_ref_id` (z.B. allocation_id), `source_metadata` (JSONB für Notes / Warning-Flags)
- `source_type`-Werte: `resource_allocation` (system-erzeugt, Replace-on-Update), `manual` (User-erfasst, frei editierbar), plus 4 reservierte Werte für PROJ-24b (`lv_position`, `material`, `stueckliste`, `mischkalkulation`).
- RLS: Project-Members lesen; Project-Editor/Lead/Admin schreiben.

**`tenant_settings.cost_settings`** — neue JSONB-Spalte, Default `{velocity_factor: 0.5, default_currency: "EUR"}`. `velocity_factor` wird in der TS-Schicht via Zod auf `[0.1, 5.0]` validiert.

**`work_item_cost_totals`** — read-only View (`security_invoker = true`), aggregiert pro Work-Item: `total_cost`, `cost_lines_count`, `multi_currency_count`, `is_estimated` (true ⇔ nur SP-basiert).

### 4. Locked Design Decisions

| # | Decision | Choice | Why |
|---|----------|--------|-----|
| 1 | Tagessatz-Versionierung | A — `valid_from` + composite UNIQUE | Spec-locked. Audit-stabil. Identisches Pattern zu `fx_rates`. |
| 2 | Cost-Line-Lifecycle bei Item-Update | A — Replace-on-Update | Cost-Lines sind abgeleitete Daten, kein User-Erfassungs-Record. Immutability-Argument greift hier nicht. |
| 3 | Velocity-Faktor-Granularität | A — Tenant-weit | MVP. Per-Projekt-Type / Per-Projekt verschoben auf PROJ-24b. |
| 4 | `role_key`-Quelle | A — Frei wählbar | Catalog liefert Default-Vorschläge, aber Tenants haben eigene Rollen ("Bau-Aufsicht", "Sondersachbearbeiter:in"). |
| 5 | Cost-Line-Erzeugung | API-Route-Hook (synthetic INSERT via service-role admin-client) | Identisches Pattern zu PROJ-22 budget-postings. Einfacher zu unit-testen, klare `actor_user_id` im Audit, lesbarer Stack-Trace bei Fehlern. |
| 6 | Aggregation: View vs Materialized View | Regular SQL-View (zuerst) | Performance-Ziel 500 ms @ 500 × 500 wird mit Standard-Aggregation eingehalten. Materialized-View ist PROJ-24b falls sich das Skalierungs-Profil ändert. |
| 7 | Cost-Calc-Engine-Lokalisierung | `src/lib/cost/` (neuer Modul-Ordner) | Parallel zu `src/lib/budget/` und `src/lib/ai/`. Pure TS, deterministisch, ohne Supabase-Imports → 100% unit-testbar. |
| 8 | Cost-Line-Cleanup bei Allocation-Soft-Delete | Hard-Delete der `resource_allocation`-Cost-Line | Cost-Lines sind abgeleitete Daten. Audit-Trail in `audit_log_entries` deckt Historie ab. Keine "soft-deleted Cost-Line"-Komplexität. |
| 9 | Cost-Line-Cleanup bei Item-Soft-Delete | Cost-Lines bleiben, View filtert sie raus | Audit-Trail bleibt erhalten. Bei Item-Wieder­herstellung sind die Cost-Lines noch da. |

### 5. Data Flow — Wie Cost-Lines entstehen

**Szenario A — User legt eine Resource-Allocation auf einem Work-Item an**

1. UI → bestehende PROJ-11-Route `POST /api/projects/[id]/work-items/[wid]/resources`
2. Route legt Allocation an (existing behavior)
3. **NEU:** Route ruft Cost-Calc-Engine auf
4. Engine löst auf: Allocation → Resource → `stakeholder.role_key` → jüngster `role_rate` mit `valid_from ≤ work_item.created_at`
5. Engine liefert `{amount, currency, warning_flag?}`
6. Route schreibt `work_item_cost_lines`-Eintrag mit `source_type='resource_allocation'`, `source_ref_id = allocation.id`
7. Bei Engine-Fehler oder fehlender Rate: Allocation wird **trotzdem** persistiert; Cost-Line wird mit `amount=0` und `source_metadata.warning='no_rate_for_role'` geschrieben → UI zeigt Warnung

**Szenario B — User ändert Item-Dauer oder Story-Points**

- Route updated work_item, dann **delete + insert** aller `resource_allocation`-Cost-Lines des Items über aktuelle Allocations (Replace-on-Update). Manuelle Cost-Lines werden nicht angefasst.

**Szenario C — User legt manuelle Cost-Position an**

- POST `/api/projects/[id]/work-items/[wid]/cost-lines` mit `source_type='manual'` + `amount` + `currency` + freier `source_metadata`. Wird gespeichert. Cost-Calc-Engine ignoriert manuelle Lines vollständig.

**Szenario D — Allocation wird soft-deleted (PROJ-11-Pattern)**

- Bei Allocation-Soft-Delete: zugehörige `resource_allocation`-Cost-Line wird **hard-deleted** (Audit-Trail in `audit_log_entries` bleibt). Manuelle Cost-Lines unberührt.

### 6. Tech Decisions — Warum so

- **Wiederverwendung des `fx_rates`-Patterns:** schon in Produktion (PROJ-22 deployed, RLS + Audit + Privacy-Registry alles wired). Risiko nahe null.
- **Generische Cost-Line-Tabelle statt Source-spezifischer Tabellen:** zukünftige Source-Types (LV / Stückliste / Mischkalkulation) brauchen keine Migration, nur einen neuen Enum-Wert.
- **API-Route-Hook statt DB-Trigger:** drei Gründe. (1) `actor_user_id` im Audit-Log ist korrekt befüllt — bei Triggers würde service-role im Audit erscheinen. (2) Engine ist Pure-TS, ohne DB-Roundtrip einfach testbar. (3) Stack-Trace bei Fehlern landet in den Logs, nicht in Postgres-Notices.
- **Pure-TS-Engine:** Cost-Berechnung hat null Seiteneffekte, deterministisch über `(item, allocations, role_rates_snapshot, velocity_factor)`. Stakeholder-Fragen wie "wie ändert sich der Plan bei Velocity 0,3?" werden im Test beantwortet, nicht gegen die DB.
- **Kein Inline-Edit für Tagessätze im Work-Item:** Tagessätze sind Tenant-Governance. Project-Leads dürfen sie nicht implizit ändern.

### 7. Multi-Tenant + Privacy

- Jede neue Tabelle hat `tenant_id NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`. Multi-Tenant-Invariante eingehalten.
- RLS nutzt die in PROJ-1 etablierten Helpers: `is_tenant_member`, `is_tenant_admin`.
- Privacy-Registry-Erweiterungen (in `src/lib/ai/data-privacy-registry.ts`):
  - `role_rates.daily_rate` → **Class 3** (Personalkosten = sensibel)
  - `role_rates.role_key` / `valid_from` / `currency` → Class 2
  - `work_item_cost_lines.amount` / `currency` → Class 2
  - `work_item_cost_lines.source_metadata` → **Class 3** (kann Notes enthalten)
- Class-3-Felder werden durch das bestehende PROJ-12-Routing automatisch auf den lokalen LLM-Pfad gezwungen — kein Extra-Code in PROJ-24.

### 8. Performance

- View-Aggregation-Ziel: **< 500 ms bei 500 Ressourcen × 500 Work-Items**. Plain-View reicht; kein Materialized-View in v1.
- Hot Indexes:
  - `role_rates`: `(tenant_id, role_key, valid_from desc)` für die Lookup-Funktion
  - `work_item_cost_lines`: `(work_item_id, source_type)` und `(project_id)`
- Wenn Performance kippt (bei z.B. 5k Work-Items pro Projekt): Upgrade zu Materialized-View mit Trigger-Refresh wird **PROJ-24b**.

### 9. Dependencies (Packages)

**Keine neuen npm-Packages.** Alles aus dem bestehenden Stack:

- `@supabase/supabase-js` (existing)
- `zod` (existing — für Rate- + Cost-Line-Inputs)
- shadcn/ui (existing — für Pages, Dialoge, Drawer-Sections)
- bestehender Audit-Trigger + Privacy-Registry — werden erweitert, nicht ersetzt

### 10. Affected Files Summary (für /backend und /frontend)

**Database (eine neue Migration):**
- 2 neue Tabellen: `role_rates`, `work_item_cost_lines`
- 1 neue JSONB-Spalte: `tenant_settings.cost_settings`
- 1 neue View: `work_item_cost_totals` mit `security_invoker = true`
- 1 neue SQL-Helper-Funktion: `_resolve_role_rate(tenant_id, role_key, as_of_date)` für Lookup
- Audit-Whitelist erweitert um `role_rates`, `work_item_cost_lines`
- Audit-Tracked-Columns für die zwei neuen Tabellen

**Backend (TypeScript):**
- `src/lib/cost/calculate-work-item-costs.ts` + Test-Datei (Pure-TS-Engine)
- `src/lib/cost/role-rate-lookup.ts` + Test-Datei (DB-Layer)
- 6 neue API-Routen gemäß Spec ST-07
- Erweiterung der bestehenden PROJ-11 work-item-resources-Route um Cost-Calc-Hook
- Privacy-Registry-Eintragungen in `src/lib/ai/data-privacy-registry.ts`

**Frontend:**
- Neue Page `/settings/tenant/role-rates` (Page + Client-Component + Dialog für Neuer-Satz)
- Neue Section "Kosten" in `tenant-settings-sections.tsx`
- Neue Section "Kosten" im work-item-detail-drawer (existing Component erweitern)
- Neue Cost-Cell in `backlog-list.tsx` Row-Renderer
- Alle Komponenten nutzen shadcn/ui — kein neues UI-Lib

### 11. Out of /architecture Scope (explizit)

- **Keine Approval-Gates für Tagessatz-Änderungen** — Admin-RLS ist das einzige Gate. Approval-Workflow → PROJ-24c.
- **Keine automatische Sammelwährungs-Konvertierung in der View** — UI nutzt PROJ-22-`fx_rates` für aggregierte Reports, View liefert nur den Multi-Currency-Hinweis.
- **Kein Excel-Export** — PROJ-24c.

### 12. Risks / Watch-outs für /backend

- **PROJ-11-Route ist invasiv zu erweitern:** die bestehende work-item-resources-Route hat bereits Audit + RLS-Checks. Cost-Line-Side-Effect MUSS so eingebaut werden, dass ein Cost-Calc-Fehler die Allocation **nicht** blockiert (Fail-Open mit Warning-Flag).
- **Tagessatz-Resolution-Cutoff:** Spec sagt "jüngstes `valid_from ≤ work_item.created_at`". /backend muss explizit verifizieren, dass das semantisch richtig ist — Alternative wäre `now() at allocation creation`. Argument für `created_at`: lockt den Satz für die Item-Lifecycle, neue Allocations am selben Item nutzen denselben Satz → vorhersagbar. Argument gegen: bei sehr alten Items mit später hinzugefügten Allocations bekommt man veraltete Sätze. **Empfehlung: `work_item.created_at` für v1**, Re-Evaluation in PROJ-24b mit Tenant-Setting "rate_lock_strategy".
- **Multi-Currency innerhalb eines Items:** Cost-Calc kann auf einem Item EUR + USD Cost-Lines erzeugen (Senior-Dev EUR + externe Beraterin USD). View darf NIE silently summieren — `multi_currency_count > 0` führt zu separater Anzeige.
- **work_item_resources hat bereits ein audit-tracked-columns-Set** (`effort_hours, role_key, start_date, end_date`). Cost-Line-Side-Effect ist eine **separate** Audit-Aktion auf `work_item_cost_lines` und überschneidet sich nicht.

### 13. Handoff-Empfehlung

Reihenfolge der nächsten Skills:

1. **`/backend` zuerst** — Migration + Cost-Calc-Engine + API-Routen + Hook in PROJ-11-Route. Das ist der Daten- und Engine-Kern.
2. **`/frontend` danach** — Settings-Page + Drawer-Section + Backlog-Cell, nutzt die fertigen API-Routen.
3. **`/qa` zuletzt** — Acceptance-Criteria-Sweep, Performance-Test der View bei 500×500, Edge-Cases-Sweep (kein Rate, NULL role_key, Multi-Currency, Velocity=0).

Begründung: Die UI ist relativ simpel; die Komplexität liegt im Versioning + Pure-TS-Engine + dem invasiven Hook in der PROJ-11-Route. Backend-First erlaubt es, die Engine isoliert zu testen, bevor UI darauf aufsetzt.

## Implementation Notes
_To be added by /frontend and /backend_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
