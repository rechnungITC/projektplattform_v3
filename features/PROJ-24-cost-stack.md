# PROJ-24: Cost-Stack — Tagessätze pro Rolle, Velocity-Modell & Kosten pro Work-Item

## Status: In Progress (Phase 24-δ Backend done — Frontend pending)
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

### Phase 24-α — Database foundation (`/backend`, 2026-05-02)

Migration: `supabase/migrations/20260502160000_proj24_cost_stack_alpha.sql` (≈ 320 lines).

**Built:**
- Table `public.role_rates` (id, tenant_id, role_key, daily_rate(10,2), currency, valid_from, created_by, timestamps). UNIQUE on `(tenant_id, role_key, valid_from)`. RLS: SELECT for tenant-member, INSERT/DELETE for tenant-admin, **no UPDATE policy** (append-only versioning, mirrors `fx_rates`). Index `(tenant_id, role_key, valid_from desc)` for the lookup path. CHECKs: `daily_rate >= 0`, `_is_supported_currency(currency)`, `char_length(role_key) between 1 and 100`.
- Table `public.work_item_cost_lines` (id, tenant_id, project_id, work_item_id, source_type, amount(14,2), currency, occurred_on, source_ref_id, source_metadata jsonb default `{}`, created_by, created_at). RLS: SELECT for project-member, INSERT/UPDATE/DELETE for `has_project_role(project_id, 'editor') OR is_project_lead OR is_tenant_admin` — same pattern as `budget_items`. CHECKs: `source_type in ('resource_allocation','manual','lv_position','material','stueckliste','mischkalkulation')`, `amount >= 0`, `_is_supported_currency(currency)`. Indexes: `(work_item_id, source_type)`, `(project_id)`, partial `(source_ref_id) where source_ref_id is not null` for the Replace-on-Update path.
- Column `tenant_settings.cost_settings` (JSONB, default `{"velocity_factor": 0.5, "default_currency": "EUR"}`). Velocity-factor range `[0.1, 5.0]` is Zod-validated in the TS layer (24-γ), not in the DB — consistent with other JSONB settings columns.
- View `public.work_item_cost_totals` with `security_invoker = true`. Columns: `work_item_id, tenant_id, project_id, total_cost numeric(14,2), currency char(3), cost_lines_count int, multi_currency_count int, is_estimated boolean`. Filters soft-deleted work-items (`wi.is_deleted = false`) per locked decision §4 #9. The `currency` column picks the most-frequent currency on the item (deterministic tie-break by `max(currency)`); `total_cost` is a raw sum that is only semantically valid when `multi_currency_count = 1` — UI must surface the multi-currency warning.
- Helper `public._resolve_role_rate(p_tenant_id uuid, p_role_key text, p_as_of_date date) returns role_rates`. SECURITY DEFINER, `set search_path = public, pg_temp` (PROJ-29 hardening). Returns the latest row with `valid_from <= as_of_date` for the given (tenant, role) — NULL if no match. Execute revoked from `public, anon`, granted to `authenticated, service_role`.
- Audit-Whitelist: extended `audit_log_entity_type_check` with `role_rates` and `work_item_cost_lines`. Updated `_tracked_audit_columns(text)` to cover both new tables. `tenant_settings.cost_settings` added to its tracked-columns array so velocity/default-currency edits are auditable.
- Trigger: `audit_changes_work_item_cost_lines` on UPDATE only (manual lines are editable). `role_rates` has no UPDATE-trigger because it is append-only — INSERT/DELETE audit will be wired via API-route synthetic entries in 24-γ (same pattern as PROJ-22 `budget_postings`).

**Privacy registry** (`src/lib/ai/data-privacy-registry.ts`):
- `role_rates.daily_rate` → 3 (Personalkosten, sensibel)
- `role_rates.role_key` / `valid_from` / `currency` → 2
- `work_item_cost_lines.amount` / `currency` / `occurred_on` → 2
- `work_item_cost_lines.source_type` → 1 (Diskriminator-Enum)
- `work_item_cost_lines.source_metadata` → 3 (freier JSONB, kann Notes mit Personenbezug enthalten)

**Deviations from spec:** none.

**Open for next phases:**
- 24-β: pure-TS cost-calc-engine in `src/lib/cost/` (`calculateWorkItemCosts` + `role-rate-lookup` + tests).
- 24-γ: 6 API routes per ST-07 (role-rates CRUD, cost-lines CRUD, project cost-summary). Synthetic-INSERT-Audit entries for `role_rates` and `resource_allocation`-cost-lines (service-role admin client, mirrors PROJ-22 budget-postings).
- 24-δ: hook into the existing PROJ-11 `POST/PUT/DELETE /api/projects/[id]/work-items/[wid]/resources` route to emit Replace-on-Update cost-lines. Fail-open contract: a cost-calc error must not block the allocation write — the cost-line is written with `amount=0` and a `source_metadata.warning` flag (per Tech Design §12).

**Caveats / watch-outs surfaced during DB design:**
- `total_cost` in the view is a raw sum across currencies; consumers MUST gate on `multi_currency_count = 1` before treating the number as authoritative. UI work in 24-frontend will surface a multi-currency banner in the work-item drawer.
- `source_ref_id` partial index supports the 24-δ Replace-on-Update path. If we later reuse `source_ref_id` for cross-source dedup (e.g. LV-Positionen), confirm there is no conflict with the resource_allocation case.
- `role_rates.updated_at + moddatetime trigger` is technically present but unreachable today (no UPDATE policy). Kept for symmetry with the rest of the schema; can be removed if we ever decide append-only-with-no-UPDATE-trigger is the canonical pattern.
- The view filters soft-deleted work-items but **keeps** their cost-lines in the table (per locked decision §4 #9). On work-item un-delete, the cost-lines reappear in the view automatically. This is the desired behavior.

**Migration applied to remote** (Supabase project `iqerihohwabyjzkpcujq`, version `20260502023517_proj24_cost_stack_alpha`) on 2026-05-02 by the orchestrator session via MCP.

### Phase 24-α follow-up — `_resolve_role_rate` lockdown (2026-05-02)

Migration: `supabase/migrations/20260502170000_proj24_resolve_role_rate_lockdown.sql`. Applied as `proj24_resolve_role_rate_lockdown`.

**Trigger:** Supabase security advisor (lint 0029, `authenticated_security_definer_function_executable`) flagged `_resolve_role_rate` as callable by any signed-in user via REST RPC. Because the function is SECURITY DEFINER and returns a `role_rates` row including the Class-3 `daily_rate`, this would let User A (tenant A) query rates of tenant B by passing an arbitrary `p_tenant_id` — RLS does NOT apply to SECURITY DEFINER calls.

**Fix:** `revoke execute on function public._resolve_role_rate(uuid, text, date) from authenticated`. The cost-calc engine (24-β) runs server-side with service_role (admin-client), which already carries implicit execute privilege; no authenticated-user call path exists.

**Why DEFINER + lockdown instead of INVOKER:** DEFINER + revoke signals "internal server-only helper" cleanly. INVOKER would have worked too (RLS on `role_rates` already enforces tenant boundaries on SELECT), but the engine's cost-line synthesis runs under service_role anyway (PROJ-22 budget-postings pattern) — keeping the auth context uniform inside the engine path avoids a bug surface.

**Note:** `decrypt_tenant_secret` (PROJ-14) shows the same advisor pattern but is a separate, pre-existing concern — out of scope for PROJ-24 and tracked elsewhere.

### Phase 24-β — Cost-calc engine + role-rate-lookup (`/backend`, 2026-05-02)

**Built:**
- `src/lib/cost/types.ts` — shared TypeScript types: `RoleRateSnapshot`, `AllocationInput`, `WorkItemCostInput`, `CostLineDraft`, `CostCalcResult`, `CostCalcWarning` (with `kind: 'no_role_key' | 'no_stakeholder' | 'no_rate_for_role' | 'no_basis'`), `RoleRateLookupKey`. Field semantics documented inline — notably that `story_points` and `estimated_duration_days` are pre-extracted from `work_items.attributes` JSONB by the caller (they are NOT native columns; see migration `20260428110000_proj9_…`).
- `src/lib/cost/calculate-work-item-costs.ts` — pure-TS engine, **no Supabase imports**. Routes story-point items (kind in `('story','feature','epic')` AND `story_points > 0`) through `sp × velocity_factor × pct/100 × daily_rate`; routes everything else with `estimated_duration_days > 0` through `days × pct/100 × daily_rate`. Item-level locked tie-break: when both basis values are present, **duration wins** (deterministic, no warning). Per-allocation iteration is sorted by `allocation_id` for byte-identical output across calls. Rounding: `Math.round(x * 100) / 100` once per cost-line, matching `numeric(14,2)`.
- `src/lib/cost/role-rate-lookup.ts` — DB-bound layer that resolves a batch of `(tenant_id, role_key, as_of_date)` keys via the `_resolve_role_rate(...)` RPC. Dedupes identical keys before dispatch. **Fail-open** — per-key RPC errors are logged and surface as `missing[]` (not thrown) so a temporary DB hiccup does not block allocation writes (per Tech Design §12). Documented contract: caller MUST pass a service-role admin client (the lockdown migration revoked EXECUTE from `authenticated`); the layer does not introspect headers to verify this.
- `src/lib/cost/index.ts` — public surface, re-exports `calculateWorkItemCosts`, `resolveRoleRates`, plus all types.

**Tests:** 28 cases, all green (`npx vitest run src/lib/cost/`).
- 19 cases for the engine (`calculate-work-item-costs.test.ts`): SP happy path, duration happy path, multi-allocation, multi-currency within one item, allocation_pct=0/null skipped silently, `no_role_key` warning, `no_stakeholder` warning, `no_rate_for_role` placeholder cost-line + warning, item with no basis emits ONE item-level `no_basis` warning (not per allocation), duration-wins tie-break with no metadata leakage from the SP path, `velocity_factor=0` produces amount=0 cost-lines without warning, `kind='task'` ignores SP and falls back to no-basis when no duration, `kind='task'` with duration uses duration path, two rounding cases (1×0.3333×1000=333.30 and 1×(1/3)×1000=333.33), determinism check via `JSON.stringify` equality + sort-by-allocation_id verification, empty-allocations no-op, empty-allocations + no-basis still emits the item-level `no_basis` warning.
- 9 cases for the lookup (`role-rate-lookup.test.ts`): empty-keys short-circuit (no RPC call), 2-of-2 resolved happy path, mixed resolved+null-data missing, fail-open RPC error → missing (verifies a single `console.error` is logged), dedup of identical keys (1 RPC call for 4 identical inputs), no-dedup across different `as_of_date` (rate may differ over time), stringified-numeric coercion (`"1234.56"` → `1234.56` — PostgREST sometimes serializes `numeric` as string), malformed RPC payload → missing without crashing, exact RPC argument shape verification (`p_tenant_id`, `p_role_key`, `p_as_of_date`).

**Edge cases covered beyond the spec:**
- Determinism is **explicitly** verified via `JSON.stringify(r1) === JSON.stringify(r2)` + a sort-order assertion (engine sorts allocations by `allocation_id` ascending).
- `kind='task'` with `story_points` set but no duration: falls through to no-basis warning (SP_KINDS deliberately excludes task/subtask/bug/work_package).
- Stringified `numeric` from PostgREST is coerced via `Number(...)`; malformed payloads are treated as missing rather than throwing — same fail-open philosophy as RPC errors.
- Duplicate `RoleRateLookupKey` requests dedupe to a single RPC call to keep the lookup cheap when many work-items share the same role.

**Caveats / annotations in the code:**
- `calculate-work-item-costs.ts` documents that the engine is pure-TS and that the SP-vs-duration tie-break is locked to "duration wins" — a comment explains the rationale.
- `role-rate-lookup.ts` carries an explicit JSDoc warning that the supplied client MUST be service-role; supabase-js does not expose a way to verify this at runtime, so the constraint is enforced at the call-site (PROJ-24-γ API routes will use `createAdminClient()` from `@/lib/supabase/admin`).
- `parseRpcRow` defensively handles three response shapes (`null`, single object, single-element array) because supabase-js' composite-return shape varies with PostgREST versions.

**Open for next phases:**
- 24-γ: 6 API routes per ST-07. Routes will compose `resolveRoleRates` (admin client) + `calculateWorkItemCosts` (pure call) + a service-role admin client to insert into `work_item_cost_lines`. Manual cost-lines (`source_type='manual'`) bypass the engine.
- 24-δ: hook into the existing PROJ-11 `POST/PUT/DELETE /api/projects/[id]/work-items/[wid]/resources` route to emit Replace-on-Update cost-lines on every allocation mutation. Fail-open contract: a cost-calc or lookup error must not block the allocation write — a warning-flagged cost-line is written instead.

### Phase 24-γ — API routes (`/backend`, 2026-05-02)

**Built — 6 routes per ST-07:**

| # | Method+Path | Auth | Notes |
|---|---|---|---|
| 1 | `GET /api/tenants/[id]/role-rates` | tenant-member via RLS | versioned list, sorted `role_key ASC, valid_from DESC` |
| 2 | `POST /api/tenants/[id]/role-rates` | tenant-admin (`requireTenantAdmin`) | append-only versioning, `23505` → 409 `rate_exists` |
| 3 | `DELETE /api/tenants/[id]/role-rates/[rid]` | tenant-admin (`requireTenantAdmin`) | read-then-delete to capture snapshot for audit; race → 404 |
| 4 | `GET /api/projects/[id]/cost-summary` | project-member via RLS + project-existence 404 | aggregates per-Epic / per-Phase / per-Sprint / unsorted |
| 5 | `GET /api/projects/[id]/work-items/[wid]/cost-lines` | project-view via `requireProjectAccess` | RLS-scoped list, `created_at DESC`, `limit(500)` |
| 6 | `POST /api/projects/[id]/work-items/[wid]/cost-lines` | project-edit via `requireProjectAccess` | `source_type='manual'` hardcoded; engine path is **not** invoked here |

**Auth strategy:**
- Read paths rely on RLS for tenant/project boundaries. Where existence-leak via empty-list mattered (cost-summary, work-item cost-lines), the route resolves the project up-front and returns 404 on null — same pattern as PROJ-22 budget routes.
- Write paths use the existing `requireTenantAdmin` / `requireProjectAccess` helpers from `_lib/route-helpers.ts` for clean 403s on top of RLS.

**Audit strategy:**
- INSERT and DELETE on `role_rates` and `work_item_cost_lines` go through a new helper `src/app/api/_lib/cost-audit.ts` (`writeCostAuditEntry`). The helper uses `createAdminClient()` because `audit_log_entries` RLS only permits SELECT — service-role is required for writes. Same approach as PROJ-22 `budget_postings` synthetic-audit (Architecture Decision 4 in PROJ-22 spec).
- UPDATE on `work_item_cost_lines` (manual edits) is covered by the PROJ-10 audit trigger added in 24-α — no API-level synthetic audit needed there.
- Audit failures are best-effort: caught and `console.error`-logged, never thrown. The user's primary mutation has already succeeded by then.

**Validation strategy:**
- Currency whitelist reuses `SUPPORTED_CURRENCIES` from `@/types/tenant-settings` (single source of truth, also used by PROJ-22). Did **not** hardcode a duplicate list.
- `source_metadata` is constrained to ≤ 4 KB serialized (`JSON.stringify(v).length <= 4096`) at the Zod layer to defend against JSONB bloat from free-text notes — Class-3 per `data-privacy-registry`.
- `source_type` is **hardcoded** to `'manual'` in the cost-lines POST — never read from the body, even if the client sends it. Engine-derived cost-lines (`source_type='resource_allocation'`) come from the PROJ-11 resources hook in 24-δ via service-role, not this user-facing endpoint.

**Tests — 35 cases, all green (`npx vitest run src/app/api/...`):**
- `role-rates/route.test.ts` (12 cases): GET 401/200/cross-tenant-empty/400; POST 401/403-non-admin/403-no-membership/400-validation×3/409-duplicate/201-happy with audit-write verification.
- `role-rates/[rid]/route.test.ts` (5 cases): DELETE 401/403/404/400-invalid-id/204-happy with audit-snapshot verification.
- `cost-summary/route.test.ts` (5 cases): 401/400-invalid-id/404-cross-project/200-happy with epic transitive-closure rollup, multi-currency-warning=true with re-pull from cost-lines, empty-project no-op.
- `cost-lines/route.test.ts` (13 cases): GET 401/404-cross-project/200-empty/200-happy; POST 401/403-read-only-member/400-negative-amount/400-invalid-currency/400-source_metadata>4KB/404-cross-project/201-happy with audit + source_type-hardcode verification + spoofed-source_type-ignored verification.

**Patterns reused from the repo:**
- Mock-chain pattern from `master-data/stakeholders/route.test.ts` and `tenants/[id]/invite/route.test.ts` — `vi.mock` for `@/lib/supabase/server` + `@/lib/supabase/admin`, chainable `from()` returning per-table mock with `.then()` for list-paths.
- Synthetic-audit pattern from `projects/[id]/budget/postings/route.ts` — service-role admin client write, best-effort, `field_name` as INSERT/DELETE marker, `change_reason` as German human-readable label.
- `requireProjectAccess(...,"edit")` reused for the cost-lines POST path; matches PROJ-11 resources route.
- `apiError(code, message, status, field?)` envelope from `route-helpers.ts` — consistent with all PROJ-1+ routes.

**Caveats documented in code:**
- `cost-lines/route.ts` notes that `source_type='manual'` is hardcoded and the engine path is intentionally separate (will live in the 24-δ resources-route hook).
- `cost-lines/route.ts` documents the 4-KB `source_metadata` cap and the Class-3 sensitivity (PROJ-12 routing).
- `role-rates/route.ts` documents that POST uses `requireTenantAdmin` for clean 403s on top of RLS, and that the synthetic-audit helper uses service-role because `audit_log_entries` SELECT-only RLS.
- `cost-audit.ts` (helper, also from this phase) carries a header comment explaining why the helper is needed (PROJ-10 trigger only fires on UPDATE) and that audit failures are non-fatal.

**Lint cleanup:**
- Removed two unused `eslint-disable-next-line no-console` directives from `cost-audit.ts` — the project does not enable `no-console`, so the directives were dead code.

**Open for next phase:**
- 24-δ: hook into the PROJ-11 `POST/PUT/DELETE /api/projects/[id]/work-items/[wid]/resources` route to emit Replace-on-Update cost-lines via the engine. Will reuse `writeCostAuditEntry` for the INSERT-audit on `resource_allocation` cost-lines. Fail-open: a cost-calc / lookup error writes a `amount=0` cost-line with `source_metadata.warning` flag rather than blocking the allocation write.

### Phase 24-δ — Cost-line synthesizer + route hooks (`/backend`, 2026-05-02)

**Built:**
- `src/lib/cost/synthesize-cost-lines.ts` (~455 lines) — central helper `synthesizeResourceAllocationCostLines({adminClient, tenantId, projectId, workItemId, actorUserId})`. Replace-on-Update strategy per Tech Design §4 #2 + §5 Scenario B:
  - Reads work-item (`is_deleted` filter, attribute extraction for `story_points` / `estimated_duration_days` / `kind`), all current `work_item_resources` allocations, the chain `resource → source_stakeholder_id → stakeholders.role_key`, and tenant-velocity from `tenant_settings.cost_settings`.
  - Pre-resolves the latest applicable rates via `resolveRoleRates()` using `work_item.created_at` as the cutoff (locked decision §12).
  - Runs `calculateWorkItemCosts()` (pure-TS) to compute draft cost-lines.
  - DELETEs all existing `resource_allocation` cost-lines for the item, then INSERTs the new set. Manual cost-lines (`source_type='manual'`) are NEVER touched.
  - Writes one synthetic-DELETE audit per dropped row + one synthetic-INSERT audit per new row via `writeCostAuditEntry`.
- **Fail-open contract:** the helper NEVER throws. DB errors set `hadCostCalcError=true` and surface warnings; the caller's primary mutation has already succeeded by the time this runs.
- Public surface in `src/lib/cost/index.ts` extended: `synthesizeResourceAllocationCostLines` + types `SynthesizeCostLinesInput` / `SynthesizeCostLinesResult`.

**Route hooks — 4 sites, all best-effort fire-and-forget after primary write:**
- `POST /api/projects/[id]/work-items/[wid]/resources` — after a new allocation is inserted.
- `PATCH /api/projects/[id]/work-items/[wid]/resources/[aid]` — after an allocation update.
- `DELETE /api/projects/[id]/work-items/[wid]/resources/[aid]` — after an allocation removal.
- `PATCH /api/projects/[id]/work-items/[wid]` — after a work-item update **only when** a cost-driver attribute changed (`kind`, `attributes.story_points`, `attributes.estimated_duration_days`). Pure-`title` patches skip the synthesizer to keep the cheap path cheap.

Each hook resolves the tenant_id from the project, instantiates a service-role admin client (`createAdminClient`), and calls the synthesizer with `actorUserId = current user`. Synthesizer warnings are returned in the API response payload so the UI can surface them; the response status is unaffected by synthesizer outcomes (fail-open).

**Tests — +59 cases, all green (`npm test --run` 631 → 690):**
- `src/lib/cost/synthesize-cost-lines.test.ts` (16 cases): happy path (new allocation → 1 cost-line + 1 INSERT audit), Replace-on-Update (1 existing → 1 DELETE audit + 1 INSERT audit), soft-deleted work-item (no synthesis), missing role_key warning, missing stakeholder warning, missing rate warning (placeholder cost-line with `source_metadata.warning`), engine error → fail-open, audit-write error swallowed, multi-currency within one item, manual cost-lines untouched by Replace-on-Update, velocity-factor=0 → amount=0 cost-lines, story-points basis, duration basis, mixed-basis tie-break, no-basis no-cost-lines, allocation-pct=0 silently skipped.
- `src/app/api/projects/[id]/work-items/[wid]/resources/route.test.ts` (8 new cases on top of PROJ-11 baseline): synthesizer fired on POST 201, NOT fired on POST 5xx, synthesizer arg shape verified, fail-open on synthesizer error.
- `src/app/api/projects/[id]/work-items/[wid]/resources/[aid]/route.test.ts` (PATCH + DELETE): synthesizer fired with right args, fail-open behavior.
- `src/app/api/projects/[id]/work-items/[wid]/route.test.ts` (5 new cases): cost-driver attribute change fires synthesizer, kind change fires synthesizer, unrelated attribute change does NOT fire, title-only patch does NOT fire, synthesizer rejection still returns 200.

**Verification:**
- `npx tsc --noEmit` exit 0
- `npm run lint` exit 0
- `npm test --run` 690/690 (was 631 — +59 cases for the synthesizer + hooks)
- `npm run build` green; all 4 route surfaces and the new synthesizer module in the manifest

**Phase 24-δ Backend komplett. Open for 24-ε:**
- `/settings/tenant/role-rates` — Tenant-Admin Page (Tabelle + valid_from-Historie + Add/Delete-Aktionen).
- Tenant-Settings-Page: neuer Abschnitt "Kosten-Defaults" (`velocity_factor`, `default_currency`).
- Work-Item-Drawer: neuer Abschnitt "Kosten" (Total + Aufschlüsselung pro Cost-Line + manuelle Cost-Line-Action + Multi-Currency-Banner wenn `multi_currency_count > 0`).
- Backlog-Liste: kleine Cost-Cell pro Item-Zeile mit "≈"-Tilde für SP-basiert (`is_estimated=true`).

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
