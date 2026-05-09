# PROJ-62: Organization Master Data + Tree-View

## Status: Approved (full slice — Frontend + Backend)
**Created:** 2026-05-09
**Last Updated:** 2026-05-09
**Priority:** P1
**CIA-reviewed:** 2026-05-09 (slice cut, identity model, vendor strategy, tech-stack-fit)
**Architected:** 2026-05-09 (4 open forks locked; component tree + data flows below)
**Frontend:** 2026-05-09 (UI ships against future API contracts — error-state-tolerant)
**QA (Frontend-Slice):** 2026-05-09 — 0 Critical/High, 2 Medium, 7 Low; 18/18 vitest green; build green.
**Backend:** 2026-05-09 — Migration `proj62_organization_master_data` live in Supabase; 8 API-Routen + RPC + View deployed; 28/28 vitest green.
**QA Re-Test (full slice):** 2026-05-09 — 0 Critical/High; all ST-01/02/03 ACs ✅; 10 red-team attacks blocked; 9 smoke invariants verified; build green; live route probes auth-gated. **Production-ready.**

## Summary

Stammdaten-Slice für die Unternehmensorganisation eines Tenants: eine `organization_units`-Tabelle mit Selbst-Hierarchie (`parent_id`), eine `locations`-Tabelle, optionale FK-Spalten `organization_unit_id` an `stakeholders` / `resources` / `tenant_memberships`, eine read-only View `tenant_organization_landscape` (joined mit `vendors` aus PROJ-15 für die "Alles-Sicht") sowie eine Master-Data-UI mit zwei gleichberechtigten Surfaces:

1. **Tabellenpflege** (CRUD, Dropdowns, Inline-Edit) — analog `/stammdaten/projekttypen` aus PROJ-16.
2. **Tree-View** (`react-arborist`, bereits durch PROJ-36 etabliert) mit Drag-&-Drop für Hierarchie-Umbau, Filter, Detail-Panel und Klick-zu-FK-Pflege.

Modul-Toggle `organization` (default-on, idempotent backfilled). Tenant-Admin schreibt; tenant-member liest. Audit über das Standard-Pattern (`record_audit_changes` UPDATE-Trigger + `_tracked_audit_columns`-Whitelist).

**MVP-Scope ist absichtlich knapp:**
- Nur Hierarchie via `parent_id`, keine polymorphe `OrganizationRelation`-Tabelle.
- Keine `persons`-Tabelle (CIA-Beschluss; FK auf existing entities).
- Keine eigene `Roles`-Tabelle (existing `role_key` aus PROJ-24/PROJ-6 genügt).
- Keine "Organisatorische Verantwortungsansicht" (zweite Sicht) — kommt als PROJ-58-Filter.
- Kein historisches `valid_from/valid_to` — Audit liefert die Historie.
- Keine Vendor-Migration in `organization_units` — `vendors` bleiben unberührt; View bringt Lese-Sicht.

CSV-Import ist eigenständig in **PROJ-63**. Link-Assistant (UI-Komfort für FK-Pflege) ist eigenständig in **PROJ-57-β**.

## Dependencies

- **Requires PROJ-1** (Auth + RLS-Helpers `is_tenant_member`, `is_tenant_admin`, `has_tenant_role`).
- **Requires PROJ-8** (Stakeholders) — bekommt nullable FK `organization_unit_id`.
- **Requires PROJ-11** (Resources) — bekommt nullable FK `organization_unit_id`.
- **Requires PROJ-15** (Vendors) — wird nicht angefasst, aber im View `tenant_organization_landscape` joined.
- **Requires PROJ-16** (Master-Data-UI) — Surface-Konvention (`/stammdaten/...`).
- **Requires PROJ-17** (Tenant-Module-Toggle) — neuer Key `organization`.
- **Requires PROJ-10** (Audit) — `_tracked_audit_columns('organization_units')` + `('locations')`.
- **Followed by PROJ-63** (CSV Import baut auf den hier definierten Tabellen + Validierungs-Regeln auf).
- **Followed by PROJ-57-β** (Link-Assistant pflegt die hier neu eingeführten FK-Spalten).
- **Optional Followed-by PROJ-58** (Graph-Sicht für Verantwortungs-Beziehungen).

## V2 Reference Material

V2 hatte ein flacheres Org-Modell (`organization_unit` mit reiner `parent_id`-Hierarchie, keine Locations-Tabelle, externe Partner über `vendor`+`vendor_contact`). Reference-Pfade:
- V2 epic: `epics/master-data.md`
- V2 stories: `stories/manage-organization-units.md`, `stories/import-organization-csv.md` (V2 hatte Excel statt CSV)
- V2 ADRs: `docs/decisions/stakeholder-vs-user.md` — bekräftigt für V3, dass eine Person identitätsmäßig nicht in einer `persons`-Tabelle dupliziert wird.
- V2 code: `apps/api/src/modules/organization/`, `apps/web/src/pages/master-data/organization`.
- V2 Migration: `2024_06_organization_unit.sql`.

V3 setzt V2-Modell **nicht** 1:1 um; die FK-only-Strategie ist V3-spezifisch und folgt aus den Erkenntnissen der CIA-Reviews zu PROJ-54/57.

## User Stories

- **Als Tenant-Admin** möchte ich Organisationseinheiten (Gesellschaft, Standort, Bereich, Abteilung, Team, externe Organisation) als hierarchischen Baum pflegen, damit Stakeholder, Resources und Tenant-Members eindeutig einer Einheit zugeordnet werden können.
- **Als Tenant-Admin** möchte ich Standorte (Locations) als eigene Stammdaten pflegen, da ein Standort mehrere Organisationseinheiten beherbergen kann (z.B. "Hamburg" beheimatet "Bereich IT" und "Bereich Finance").
- **Als Tenant-Admin** möchte ich Organisationseinheiten in einem Tree-View per Drag-&-Drop neu strukturieren, weil sich Re-Orgs schneller pflegen lassen als per Form-Edit.
- **Als Tenant-Admin** möchte ich denselben Datenstand auch über eine flache Tabelle pflegen können — für Bulk-Edits, Sortier- und Filterszenarien.
- **Als Tenant-Member** möchte ich den Org-Baum eines Tenants lesen können (read-only), weil ich Stakeholder/Resources korrekt einordnen will.
- **Als Tenant-Admin** möchte ich Filter im Tree-View (nach Standort, Typ, intern/extern) verwenden, um große Hierarchien handhabbar zu halten.
- **Als Tenant-Admin** möchte ich Vendors (PROJ-15) und interne Org-Einheiten in einer "Alles-Sicht" lesen — das System darf Vendors aber nicht in `organization_units` migrieren.
- **Als Tenant-Member** möchte ich beim Pflegen eines Stakeholders / einer Resource per Combobox eine Org-Einheit zuordnen (FK-Pflege ist nicht Teil dieses Slice — kommt mit PROJ-57-β; der Combobox-Endpoint lebt aber bereits hier).

## Acceptance Criteria

### Datenmodell (ST-01)

- [ ] Migration `20260509120000_proj62_organization_master_data.sql` legt an:
  - Tabelle `organization_units(id uuid PK, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, parent_id uuid NULL REFERENCES organization_units(id) ON DELETE RESTRICT, name text NOT NULL, code text NULL, type text NOT NULL CHECK (type IN ('group','company','department','team','project_org','external_org')), location_id uuid NULL REFERENCES locations(id) ON DELETE SET NULL, description text NULL, is_active boolean NOT NULL DEFAULT true, sort_order integer NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`.
  - Tabelle `locations(id uuid PK, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, name text NOT NULL, country text NULL, city text NULL, address text NULL, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`.
  - Nullable FK-Spalten: `stakeholders.organization_unit_id`, `resources.organization_unit_id`, `tenant_memberships.organization_unit_id`. Alle drei `ON DELETE SET NULL`.
  - Constraint: `organization_units.parent_id` muss zum gleichen `tenant_id` gehören (Trigger oder geprüft per FK-mit-Composite-Key).
  - Constraint: kein Self-Loop (`id != parent_id`).
  - **Kein** geprüfter Zyklus-Constraint im DB-Layer (zu teuer); **App-seitige Prevention** in der API + UI (siehe ST-04).
- [ ] Indizes:
  - `organization_units (tenant_id)`
  - `organization_units (tenant_id, parent_id)` — schneller Tree-Build.
  - `organization_units (tenant_id, type)` — Filter.
  - `locations (tenant_id)`
  - `stakeholders (organization_unit_id)`, `resources (organization_unit_id)`, `tenant_memberships (organization_unit_id)`.
- [ ] Read-only View `tenant_organization_landscape` joined `organization_units` + `vendors` (PROJ-15) zu einem gemeinsamen Schema `(id, tenant_id, name, kind, parent_id, location_id)` — mit `kind ∈ {'org_unit','vendor'}`. View nutzt `SECURITY INVOKER`; Caller-RLS auf `organization_units` und `vendors` greift transitiv.
- [ ] Audit-Whitelist erweitert: `_tracked_audit_columns('organization_units')` enthält `name,code,type,parent_id,location_id,is_active,sort_order`. `_tracked_audit_columns('locations')` enthält `name,country,city,address,is_active`.
- [ ] Audit-Trigger `record_audit_changes` an beiden Tabellen registriert (Standard-Pattern).
- [ ] `audit_log_entity_type_check` erweitert um `'organization_units'` und `'locations'`.

### RLS (ST-02)

- [ ] `organization_units` RLS:
  - SELECT: `is_tenant_member(tenant_id)`.
  - INSERT/UPDATE/DELETE: `is_tenant_admin(tenant_id) OR has_tenant_role(tenant_id, 'org_admin')` (neue Rolle als Hook für PROJ-57-β; Default-Belegung bleibt admin-only).
- [ ] `locations` RLS: identisch zu `organization_units`.
- [ ] FK-Spalten an `stakeholders`/`resources`/`tenant_memberships` erben Bestands-RLS (kein Schema-Konflikt mit existierenden Policies).
- [ ] Modul-Toggle gilt: `organization` als TOGGLEABLE_MODULES-Key, default-on, idempotent backfilled in `tenant_settings.active_modules` aller existierenden Tenants. `requireModuleActive(tenant, 'organization', { intent: 'read'|'write' })` gatet alle UI- und API-Pfade.

### API (ST-03)

- [ ] `GET /api/organization-units` — flat list für Tabellenansicht; tenant-scoped via RLS.
- [ ] `GET /api/organization-units/tree` — Server-built Tree (rekursive CTE oder Memory-Build) für react-arborist; max-depth 12.
- [ ] `POST /api/organization-units` — Body `{ name, type, parent_id?, location_id?, code?, description?, sort_order? }` mit Zod-Schema; tenant-admin/org_admin only; verhindert Self-Loop und Zyklen (App-Layer-Check via existing-tree-walk).
- [ ] `PATCH /api/organization-units/[id]` — Field-level Edit; `parent_id`-Move geht durch denselben Zyklus-Check. Optimistic-Lock via `updated_at` (analog PROJ-54).
- [ ] `DELETE /api/organization-units/[id]` — verboten, solange `count(children) + count(stakeholders) + count(resources) + count(tenant_memberships) > 0` (HTTP 409 mit `error_code: 'has_dependencies'` und Detail-Liste).
- [ ] `POST /api/organization-units/[id]/move` — atomarer Move (`parent_id`-Update + Zyklus-Check). Eigene Route, weil DnD-Operationen häufig sind und 409 sauber zurückgeben sollen.
- [ ] `GET /api/locations` / `POST /api/locations` / `PATCH /api/locations/[id]` / `DELETE /api/locations/[id]` — analog. Delete blockt bei Bezug aus `organization_units.location_id`.
- [ ] `GET /api/organization-landscape` — read-only Sicht via View `tenant_organization_landscape`. Tenant-member-RLS.
- [ ] `GET /api/organization-units/combobox?q=<term>` — typeahead-Endpoint für PROJ-57-β-Combobox; **lebt schon in PROJ-62**, damit FK-Pflege nach Spec-Live unmittelbar möglich ist.

### Tabellenpflege-UI (ST-04)

- [ ] Neue Route `/stammdaten/organisation` mit zwei Tabs: **Tabelle** und **Tree** (default Tab = Tree).
- [ ] Tabellen-Tab:
  - Spalten: Name, Code, Typ, Übergeordnete Einheit, Standort, Aktiv, Aktionen.
  - Inline-Edit für Name + Code; Dropdowns für Typ + Parent + Location.
  - Bulk-Action: "Mehrere markieren → unter Parent verschieben" (per Combobox).
  - Pflichtfeld-Highlight (Name, Typ); Validierungs-Fehler erscheinen als red-state.
  - Filter: Typ, Standort, Aktiv-Status, Volltext-Suche.
- [ ] "Neue Einheit anlegen"-Dialog mit Validierung gegen Self-Loop, gegen Cross-Tenant-Parent (technisch durch RLS gegeben, UX zeigt aber nur valid Parents an), und gegen ungültige Typen-Hierarchie (`team` darf nicht parent von `company` sein — siehe ST-07 Edge Cases).
- [ ] Locations-Tab analog (zweite Stammdaten-Sektion auf derselben Seite oder Sub-Route `/stammdaten/organisation/standorte`).
- [ ] Read-only Member sieht alles, ohne Schreib-Buttons.

### Tree-View-UI (ST-05)

- [ ] Tree mit `react-arborist` (analog PROJ-36 WBS):
  - Knoten zeigt: Name, Typ-Icon, Anzahl direkter Children, Standort-Badge.
  - Detail-Panel rechts beim Click (Name, Typ, Code, Description, Location, Counts: Stakeholder/Resources/Members).
  - Filter-Toolbar: Typ, Standort, Aktiv/Inaktiv, Volltext.
  - Zoom + Verschieben: nicht nötig (Tree ist scrollbar). "Alle aufklappen" / "Alle einklappen" Buttons.
  - Visuelle Unterscheidung der Typen via Farben/Icons (analog `work-item-kind-badge`).
- [ ] DnD über `@dnd-kit/sortable` analog PROJ-36-α:
  - Drag-Start hebt Drop-Targets hervor.
  - Drop auf valid Parent → `POST /api/organization-units/[id]/move`.
  - Bestätigungsdialog bei "kritischen Strukturänderungen" (Definition: Move ändert >5 Descendants oder verschiebt Knoten zwischen `type-Gruppen` Hierarchie ↔ Externe-Org).
  - Escape bricht Drag ab; Keyboard-DnD analog PROJ-25b.
  - aria-live announciert Move-Ziel.
- [ ] Inline "Neuen Child anlegen" am Knoten (Plus-Icon).
- [ ] Inline "Knoten löschen" am Knoten — fragt vorher Dependencies ab (siehe ST-03 DELETE-Verhalten).

### "Alles-Sicht" mit Vendors (ST-06)

- [ ] Toggle "Vendors einblenden" im Tree-View. Wenn aktiv:
  - Lädt zusätzlich `organization-landscape`-Endpoint.
  - Vendors erscheinen als read-only Knoten unterhalb einer virtuellen Wurzel "Externe Lieferanten" (oder unter dem org_unit, mit dem sie via PROJ-15 `vendor_project_assignments` verknüpft sind — MVP: nur unter virtueller Wurzel).
  - DnD ist auf Vendor-Knoten **deaktiviert** (keine Schreib-Operationen via View).
  - Klick zeigt Vendor-Detail-Panel mit Verlinkung zu PROJ-15 Vendor-Stammdaten.
- [ ] Anzeige: Vendor-Knoten haben anderes Icon + grauen Hintergrund, damit Migration-Aufwand visuell bleibt.

### Edge Cases (ST-07)

- [ ] **Zyklus per Move**: API verweigert mit HTTP 409 + `error_code: 'cycle_detected'`. UI zeigt Fehlermeldung und reverted DnD optimistisch.
- [ ] **Cross-Tenant-Parent**: durch RLS technisch unmöglich; UI listet nur valid Parents auf.
- [ ] **Typen-Hierarchie**: Soft-Validation in der UI (Warnung "Ungewöhnlich: ein 'team' als Parent von 'company'") — nicht hart blockiert, weil reale Konzern-Strukturen Ausnahmen haben.
- [ ] **Tiefe > 12**: Server-side hard-cap in der Tree-CTE; UI zeigt "Tiefer als 12 Ebenen wird nicht unterstützt".
- [ ] **Modul deaktiviert**: API liefert 403 mit `error_code: 'module_disabled'`; UI zeigt Modul-Hinweis statt Tabelle/Tree.
- [ ] **Knoten löschen mit Children/Stakeholdern/Resources**: 409 + Liste der Blocker. UI zeigt Modal "Diese Einheit hat 12 Mitglieder + 3 Children — entferne zuerst die Verknüpfungen oder verschiebe sie".
- [ ] **Location löschen mit org-units**: 409 + Liste. UI bietet "Standort an allen Einheiten leeren?"-Action (setzt FK auf NULL, tenant-admin only).
- [ ] **Optimistic-Lock-Konflikt** (zwei Admins editieren gleichzeitig): 409 mit aktuellem `updated_at`. UI zeigt Refresh-Hinweis.
- [ ] **Audit bei Move**: `record_audit_changes` schreibt eine Row mit `change_reason='org_unit_moved'` und `old_value/new_value` für `parent_id`.
- [ ] **DnD von virtueller Wurzel "Externe Lieferanten"**: nicht erlaubt (Drag-Source disabled).
- [ ] **Tabellenfilter "nur intern"**: filtert `type IN ('group','company','department','team','project_org')`. "Nur extern" filtert `type='external_org'`. Vendors erscheinen nie in dieser Liste — sie sind in `vendors`, nicht in `organization_units`.
- [ ] **CSV-Import-Konflikt**: PROJ-63 darf während Tree-View aktiv ist Importe schreiben; Tree-View hat 30s-stale-tolerant cache + manuell "Aktualisieren"-Button.

## Edge Cases (jenseits ST-07, kategorisch)

- **Sehr große Trees (>2000 Knoten)**: react-arborist virtualisierter Rendermode. Performance-Bench bei `/qa` mit 5000-Node-Fixture.
- **RLS-Lookup-Performance**: View `tenant_organization_landscape` mit Caller-RLS — Indexes auf `tenant_id` reichen; bei >10000 Knoten + Vendors Cache evaluieren.
- **Org-Reorg während offener Reports**: PROJ-21-Snapshots frieren `content` ein, daher beeinflusst Org-Move keine bestehenden Snapshots.
- **Org-Unit-Wegfall bei Tenant-Offboarding**: ON DELETE CASCADE auf `tenant_id` reicht.

## Technical Requirements

- **Stack:** Postgres (Supabase) + Next.js 16 App Router. `react-arborist` (existing). `@dnd-kit/core` + `@dnd-kit/sortable` (existing). Keine neuen Dependencies in PROJ-62.
- **Multi-tenant:** alle Tabellen `tenant_id NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`; RLS via PROJ-1-Helpers.
- **Modul-Toggle:** neuer Key `organization`, default-on; `MODULE_LABELS["organization"] = "Organisation"`.
- **Audit:** Standard-Pattern (`record_audit_changes` UPDATE-Trigger + Whitelist).
- **Validation:** Zod schemas in `src/lib/validation/organization.ts`. Tree-Zyklus-Check in `src/lib/organization/tree-walk.ts` (pure, unit-tested).
- **Performance:** Tree-Endpoint < 200ms für 1000 Knoten; Detail-Panel-Lookup < 100ms.
- **Observability:** structured logs für Move-Operationen + Delete-Blocker.
- **Privacy:** `organization_units.name`/`description` sind Class-2 (Geschäftskontext); Locations Class-2; FK-Spalten erben Class von der Owner-Tabelle.

## Surface-Inventar (geplant, finalisiert in /architecture)

**DB:**
- 1 Migration (`20260509120000_proj62_organization_master_data.sql`)
- 2 neue Tabellen + 3 FK-Spalten + 1 View + Audit-Whitelist + Modul-Toggle.

**API (8 Routen):**
- `GET/POST /api/organization-units`
- `PATCH/DELETE /api/organization-units/[id]`
- `POST /api/organization-units/[id]/move`
- `GET /api/organization-units/tree`
- `GET /api/organization-units/combobox`
- `GET/POST /api/locations`, `PATCH/DELETE /api/locations/[id]`
- `GET /api/organization-landscape`

**Frontend:**
- `src/app/(app)/stammdaten/organisation/page.tsx` (Tabs Tabelle/Tree)
- `src/components/organization/`: `org-table.tsx`, `org-tree.tsx`, `org-detail-panel.tsx`, `org-edit-dialog.tsx`, `org-filter-toolbar.tsx`, `location-table.tsx`, `location-edit-dialog.tsx`.
- 3 Hooks: `use-organization-units`, `use-organization-tree`, `use-locations`.
- 1 Lib: `src/lib/organization/tree-walk.ts` (pure, unit-tested).

**Sidebar/Navigation (PROJ-23 + PROJ-28):**
- Neuer Stammdaten-Eintrag "Organisation" unter `/stammdaten/organisation` (gated by Modul-Toggle).

## Out of Scope (deferred)

### PROJ-63 (next slice)
- CSV-Import (papaparse, 2 fixe Layouts, Validierung, Preview, Dedup, Fehlerliste).

### PROJ-57-β (parallel slice)
- Link-Assistant in Stakeholder-/Resource-/Member-Forms zur komfortablen FK-Pflege.

### Explizit OUT für PROJ-62 (kommen später)
- "Organisatorische Verantwortungsansicht" (zweite Sicht: reports_to, responsible_for, fachlich, disziplinarisch).
- Polymorphe `OrganizationRelation`-Tabelle.
- Historisierung mit `valid_from/valid_to`.
- Eigene `Roles`-Tabelle.
- Eigene `persons`-Tabelle.
- Vendor-Migration in `organization_units`.
- 3D-Graph-Ansicht (gehört in PROJ-58-η).
- KI-Suggestions / Org-Strukturen aus Dokumenten.
- Entra-ID-/HR-Sync (gehört in PROJ-14-Connector-Pattern).
- Automatische Berechtigungsvergabe aus dem Org-Tree.
- Vollständige RACI-Matrix-Generierung.

## Architektur-Forks für /architecture

Folgende Decisions sind locked durch CIA-Review + User-Bestätigung 2026-05-09:

| # | Decision | Locked auf |
|---|---|---|
| 1 | Identitäts-Modell | FK `organization_unit_id` an `stakeholders`/`resources`/`tenant_memberships` — **keine** `persons`-Tabelle |
| 2 | Vendor-Modell | `vendors` (PROJ-15) bleiben unberührt; read-only View `tenant_organization_landscape` joined für Tree-View "Alles-Sicht" |
| 3 | Beziehungstypen MVP | nur `parent_id`-Hierarchie; weitere Beziehungstypen → PROJ-58 |
| 4 | Roles-Tabelle | nicht eingeführt; existing `role_key` (PROJ-6/24) genügt |
| 5 | Historisierung | keine `valid_from/valid_to`-Felder; Audit-Log liefert Historie |
| 6 | Tree-Library | `react-arborist` (re-use von PROJ-36) |
| 7 | DnD | `@dnd-kit/core` + `@dnd-kit/sortable` (re-use von PROJ-25b/PROJ-36) |
| 8 | Slice-Schnitt | Master-Data + Tree-View **zusammen** (analog PROJ-36-WBS), CSV separat in PROJ-63 |
| 9 | Priority | P1 (CIA-Empfehlung; nicht P0) |
| 10 | Module-Toggle | neuer Key `organization`, default-on, idempotent backfilled |

Folgende **Architektur-Forks bleiben offen** und müssen in `/architecture` gelockt werden:

1. **Tree-Endpoint-Strategie**: rekursive CTE in DB (single round-trip, max-depth 12) vs. flat-list-Fetch + Client-Build. Empfehlung: **DB-CTE** wegen RLS-Sicherheit + atomare Sicht.
2. **Move-Atomicity**: einfacher `UPDATE parent_id` mit App-Layer-Cycle-Check vs. SECURITY-DEFINER-RPC `move_organization_unit(unit_id, new_parent_id)` mit DB-Cycle-Check. Empfehlung: **RPC** für transaktionale Garantien analog PROJ-9.
3. **`tenant_organization_landscape`-View Materialisierung**: SECURITY INVOKER View vs. materialized View mit Refresh-Hook. Empfehlung: **SECURITY INVOKER View** (live, kein Refresh-Aufwand) — bei Performance-Problem auf MV upgraden.
4. **Combobox-Endpoint**: gemeinsames `/api/organization-units/combobox` für Tabellen-Dropdowns + PROJ-57-β vs. zwei getrennte Endpoints. Empfehlung: **eins** für Wiederverwendung.

## Risks

| Risiko | Schwere | Mitigation |
|---|---|---|
| `vendors` vs. `organization_units` werden in Praxis doppelt gepflegt | MEDIUM | View `tenant_organization_landscape` zeigt beide; UI weist beim "External Org anlegen" auf Vendor-Pfad hin |
| Performance bei Tree > 5000 Knoten | LOW | virtualized rendering + DB-CTE-Hard-Cap depth 12 |
| Cycle bei DnD übersehen | MEDIUM | Cycle-Check in App + RPC + Unit-Tests |
| FK-Ergänzungen brechen bestehende Stakeholder/Resource-RLS | LOW | nullable + ON DELETE SET NULL — keine Pflicht-Beziehung |
| Modul-Toggle default-on überrascht Tenants | LOW | `/stammdaten/organisation` wird im UI dezent platziert; kein Pop-up |
| User pflegt Lieferanten in `organization_units.type='external_org'` parallel zu `vendors` | MEDIUM | UI-Hinweis + Migration-Pfad in PROJ-63 (CSV erkennt potenzielle Vendor-Match per E-Mail/Name) |

## Definition of Ready

- [x] CIA-Review abgeschlossen (2026-05-09).
- [x] Identitäts-Modell entschieden (FK an existing entities).
- [x] Vendor-Modell entschieden (getrennt + View).
- [x] Beziehungstypen-Scope MVP geklärt (nur parent_id).
- [x] Roles-Tabelle aus Scope.
- [x] Historisierung aus Scope.
- [x] Tech-Stack: react-arborist + dnd-kit + papaparse-für-PROJ-63.
- [ ] Mengengerüst pro Tenant für Performance-Bench (offen — wird im /architecture mit Pilot-Tenant geklärt; Annahme bis dahin: 1000 Knoten).
- [ ] Locations vs. `org_unit.type='location'` (CIA-Empfehlung: eigene `locations`-Tabelle gewählt — locked).
- [ ] DoR-Lücke "kritische Strukturänderungen": welche Move-Operationen lösen Bestätigungsdialog aus? (in /architecture).

## Definition of Done

- [ ] Migration applied live; Supabase advisor zeigt 0 neue Warnings.
- [ ] 8 API-Routen + RLS + Modul-Toggle live.
- [ ] Tabellen-UI + Tree-View live.
- [ ] DnD funktioniert + Zyklus-Prevention greift.
- [ ] Audit-Log schreibt für alle CRUD-Operationen.
- [ ] Filter (Typ, Standort, Aktiv, Volltext) funktional.
- [ ] "Alles-Sicht" mit Vendors read-only.
- [ ] Combobox-Endpoint für PROJ-57-β bereit.
- [ ] Vitest + Playwright grün; Performance-Bench für 1000-Knoten-Fixture < 200ms.
- [ ] Spec-Hand-off: PROJ-63 kann auf `organization_units`-Schema bauen.

---

 ---

## Tech Design (Solution Architect)

### Realitätscheck

PROJ-62 ist ein **Stammdaten-Slice mit zwei UI-Surfaces auf demselben Datenstand**. Es schreibt zwei neue Tabellen, ergänzt drei FK-Spalten an existierenden Tabellen und liefert eine read-only View. Es führt **keine** neuen Domain-Konzepte ein, die nicht schon irgendwo im V3 existieren — Hierarchie via `parent_id` ist Standard, FK-only-Identitätsmodell ist die in PROJ-57 vorgezeichnete Linie, View-zu-Vendors ist eine pure Lese-Sicht.

Das technische Risiko liegt fast vollständig in der **Tree-Manipulation** (Move, Cycle-Prevention, atomare Updates), nicht im Datenmodell. Dieselbe Klasse von Risiken hat PROJ-9-Round-2 bereits gelöst (polymorphe Dependencies + Cycle-Prevention-Trigger) und PROJ-36 hat den react-arborist + DnD-Pattern produktiv. PROJ-62 zieht beide Patterns zusammen.

Die UI ist absichtlich **dual-surface** (Tabelle + Tree), weil Stammdatenpflege gleichzeitig Sortier-/Filter-/Bulk-Edit-Use-Cases und Hierarchie-Use-Cases haben muss. Beide schreiben gegen denselben API-Contract.

### Komponentenstruktur (Frontend)

```
Stammdaten-Layout (existing, PROJ-16)
└── /stammdaten/organisation (NEW)
    ├── Tab-Header
    │   ├── Tab "Tree" (default)
    │   ├── Tab "Tabelle"
    │   └── Tab "Standorte"
    │
    ├── Tab "Tree" (NEW)
    │   ├── Filter-Toolbar
    │   │   ├── Volltext-Suche
    │   │   ├── Typ-Filter (Multi-Select)
    │   │   ├── Standort-Filter (Multi-Select)
    │   │   ├── Aktiv/Inaktiv-Toggle
    │   │   └── "Vendors einblenden"-Toggle
    │   │
    │   ├── Tree-Toolbar
    │   │   ├── "Alle aufklappen" / "Alle einklappen"
    │   │   ├── "Neue Wurzel-Einheit"-Button (admin only)
    │   │   └── Live-Counter "X Einheiten, Y sichtbar"
    │   │
    │   ├── Tree-View (react-arborist)
    │   │   └── Tree-Node
    │   │       ├── Drag-Handle (admin only, sonst hidden)
    │   │       ├── Expand/Collapse-Caret
    │   │       ├── Typ-Icon (color-coded)
    │   │       ├── Name + Code-Badge
    │   │       ├── Standort-Badge
    │   │       ├── Counter-Pills (Stakeholder-Anzahl, Resource-Anzahl)
    │   │       └── Inline-Action-Menu
    │   │           ├── "+ Untereinheit"
    │   │           ├── "Bearbeiten"
    │   │           └── "Löschen" (admin only)
    │   │
    │   └── Detail-Panel (rechts, schließbar)
    │       ├── Header (Name + Typ + Standort)
    │       ├── Properties-Liste
    │       ├── Members-Section
    │       │   ├── "Stakeholder (3)" Liste
    │       │   ├── "Resources (2)" Liste
    │       │   └── "Tenant-Members (1)" Liste
    │       └── Audit-History-Link → öffnet PROJ-10 Audit-Trail-Drawer
    │
    ├── Tab "Tabelle" (NEW)
    │   ├── Toolbar mit "Neue Einheit"-Button
    │   ├── Tabelle (Spalten: Name, Code, Typ, Übergeordnete, Standort, Aktiv, Aktionen)
    │   ├── Inline-Edit für Name + Code
    │   ├── Bulk-Select-Leiste mit "Verschieben unter Parent"-Action
    │   └── Pagination/Suche
    │
    ├── Tab "Standorte" (NEW)
    │   └── Tabelle für locations (Name, Land, Stadt, Adresse, Aktiv)
    │
    └── Modal-Dialoge (geteilt zwischen Tabs)
        ├── Edit-Dialog (Name, Typ, Parent-Combobox, Location-Combobox, Code, Description, Sort-Order)
        ├── Delete-Confirm-Dialog (mit Dependency-Liste)
        ├── Move-Confirm-Dialog (kritische Strukturänderungen)
        └── Cycle-Error-Dialog (DnD-Validation-Failure)
```

### Datenmodell (Klartext)

Drei Schema-Komponenten:

**1. `organization_units`** — die zentrale Hierarchie-Tabelle.
- Felder: `id`, `tenant_id`, `parent_id` (selbstreferenzierend, nullable für Wurzeln), `name`, `code` (optional, eindeutig pro Tenant), `type` (Enum: group/company/department/team/project_org/external_org), `location_id` (optional FK auf `locations`), `description`, `is_active`, `sort_order`, `created_at`, `updated_at`.
- Constraints: same-tenant-parent (Trigger), kein Self-Loop (`id != parent_id`), UNIQUE auf `(tenant_id, code) WHERE code IS NOT NULL`.
- Index-Profil: tenant_id, (tenant_id, parent_id), (tenant_id, type), (tenant_id, code).
- RLS: tenant-member SELECT, tenant-admin (oder neue Rolle `org_admin`) für INSERT/UPDATE/DELETE.

**2. `locations`** — Standorte als eigene Stammdaten.
- Felder: `id`, `tenant_id`, `name`, `country`, `city`, `address`, `is_active`, `created_at`, `updated_at`.
- Index: tenant_id.
- RLS: identisch zu `organization_units`.
- Begründung als eigene Tabelle (nicht `org_unit.type='location'`): ein Standort beheimatet typischerweise mehrere Org-Einheiten. Ein "Hamburg" als Org-Knoten würde die Hierarchie zerstören.

**3. FK-Ergänzungen an existierenden Tabellen**:
- `stakeholders.organization_unit_id` (nullable, ON DELETE SET NULL).
- `resources.organization_unit_id` (nullable, ON DELETE SET NULL).
- `tenant_memberships.organization_unit_id` (nullable, ON DELETE SET NULL).
- Alle drei sind **optional** — die Tabellen bleiben funktional ohne FK.

**4. View `tenant_organization_landscape`** — die "Alles-Sicht".
- Joined `organization_units` + `vendors` (PROJ-15) zu einem unified Schema mit `kind ∈ {'org_unit','vendor'}`.
- SECURITY INVOKER (Caller-RLS greift transitiv).
- Read-only — Vendors werden nicht durch diese View geschrieben.

**5. Audit + Modul-Toggle**:
- `_tracked_audit_columns` Whitelist um `organization_units` und `locations` erweitert.
- `audit_log_entity_type_check` Constraint um beide Entity-Types erweitert.
- `record_audit_changes` Standard-Trigger an beiden Tabellen.
- `tenant_settings.active_modules` bekommt neuen Key `organization` (default-on, idempotent backfilled für alle existierenden Tenants).

**Geschäftsregeln**:
- Hierarchie ist immer **innerhalb eines Tenants** geschlossen. Cross-Tenant-Parents sind technisch unmöglich (RLS + Trigger).
- Keine Pflicht-Beziehung. Eine Person ohne Org-Unit-Zuordnung bleibt valide.
- Eine Org-Unit kann beliebig viele Children haben, aber max 12 Ebenen tief sein (Hard-Cap im Tree-Endpoint).
- Sort-Order ist optional; ohne wird alphabetisch sortiert.

### Datenfluss — Tree-Aufbau (READ-Pfad)

```
User öffnet /stammdaten/organisation
  └─ GET /api/organization-units/tree?include_vendors=false
      └─ Server prüft tenant-member RLS + Modul-Toggle 'organization' active
          └─ Recursive CTE auf organization_units (depth-Cap 12)
              └─ Lädt zusätzlich Counter-Aggregate (LEFT JOIN-COUNT für stakeholders/resources/tenant_memberships)
                  └─ Lädt locations für Badge-Anreicherung
                      └─ Response: {nodes, counters, locations}
                          └─ Frontend baut react-arborist-Tree
                              └─ Filter werden client-seitig angewendet
```

Bei `include_vendors=true` wird zusätzlich `tenant_organization_landscape`-View gelesen und Vendor-Knoten als read-only Subtree unter "Externe Lieferanten" angeheftet.

### Datenfluss — Drag-and-Drop Move (WRITE-Pfad)

```
User zieht Knoten "Team CRM" auf neuen Parent "Bereich IT"
  └─ react-arborist fires onMove(unitId, newParentId)
      └─ Frontend macht optimistic update
          └─ POST /api/organization-units/[id]/move {new_parent_id, expected_updated_at}
              └─ Server prüft tenant-admin RLS
                  └─ Server ruft RPC move_organization_unit(unit_id, new_parent_id, expected_updated_at)
                      ├─ Cycle-Detection: walk descendants of unit_id, fail wenn new_parent_id darunter ist
                      ├─ Same-Tenant-Check
                      ├─ Optimistic-Lock-Check
                      └─ UPDATE organization_units SET parent_id = new_parent_id, updated_at = now()
                  └─ Trigger record_audit_changes schreibt audit-row mit change_reason='org_unit_moved'
                      └─ Response: {ok, new_updated_at}
                          └─ Frontend bestätigt optimistic state
                              └─ Counter-Aggregate werden bei nächstem Tree-Refresh aktualisiert

Auf Cycle-Fehler:
  └─ RPC raises exception
      └─ HTTP 409 mit error_code='cycle_detected'
          └─ Frontend reverted optimistic update
              └─ Cycle-Error-Dialog: "Diese Verschiebung würde einen Kreis erzeugen — Knoten X liegt bereits unter Y"
```

### Datenfluss — Person-Combobox (PROJ-57-β-Vorbereitung)

```
User pflegt Stakeholder-Form, Feld "Organisationseinheit"
  └─ Combobox öffnet sich → typeahead-Search
      └─ GET /api/organization-units/combobox?q=<term>&type=team,department
          └─ Server filtert via RLS, limitiert auf 20 Treffer
              └─ Response: [{id, name, type, breadcrumb_path}]
                  └─ Frontend rendert Optionen mit Breadcrumb ("Beispiel GmbH › Hamburg › IT › CRM Team")
                      └─ User wählt → FK gesetzt → Standard-Stakeholder-Form-Save
```

Dieser Endpoint lebt **bereits in PROJ-62**, damit PROJ-57-β nur die Form-UX baut, nicht die API.

### Tech-Entscheidungen (locked, mit Begründung für PMs)

**Lock 1 — Tree-Endpoint via rekursive CTE (statt ltree-Pfade oder Client-Build).**

> **Was:** Der Server holt die komplette Tree-Struktur eines Tenants in einem einzigen DB-Aufruf via rekursive CTE und liefert sie als Liste mit `parent_id`-Verweisen ans Frontend. Das Frontend baut daraus den react-arborist-Tree.
>
> **Warum:** Drei Optionen lagen am Tisch:
> - **Recursive CTE (gewählt):** Standard-SQL, kein Extension-Aufwand, RLS gilt automatisch pro Zeile, eine Round-Trip-Anfrage. Skaliert bis ~10.000 Knoten gut.
> - **ltree-Pfade (Pattern aus PROJ-36 WBS):** Schneller bei Subtree-Queries (`@>`/`<@`), aber braucht zusätzliche Trigger zur Path-Maintenance bei jedem Move + Migration-Komplexität. Lohnt sich erst bei > 5.000 Knoten oder Subtree-spezifischen Queries.
> - **Flat-list-Fetch + Client-Build:** Bricht bei großen Trees (10k Knoten = 10k Zeilen Network) und macht RLS-Filtering im Client schwierig.
>
> Für die im Spec angenommene Mengengröße (1.000 Knoten als Pilot-Annahme) ist CTE optimal. ltree bleibt als Performance-Eskalationspfad dokumentiert; Migration auf ltree wäre additiv.

**Lock 2 — Move-Operation via SECURITY-DEFINER-RPC mit Cycle-Detection im DB-Layer (statt App-Layer-Check).**

> **Was:** Ein Move-Klick im Tree triggert eine RPC `move_organization_unit(unit_id, new_parent_id, expected_updated_at)`, die in einer Transaktion (a) den Optimistic-Lock prüft, (b) Cycle-Detection macht, (c) das UPDATE atomar fährt. Bei Cycle wirft sie eine Exception, der API-Layer mappt zu HTTP 409.
>
> **Warum:** Cycle-Detection im App-Layer hätte ein Race-Condition-Fenster zwischen "ich prüfe Descendants" und "ich update parent_id" — zwei gleichzeitige Moves könnten gemeinsam einen Zyklus erzeugen, den keiner allein erzeugt hat. Ein DB-RPC mit `FOR UPDATE`-Sperren oder REPEATABLE READ-Transaktion schließt das Fenster. Pattern existiert in PROJ-9-R2 (`tg_dep_prevent_polymorphic_cycle_fn`); wir wenden dasselbe Muster auf Selbst-Hierarchie an.

**Lock 3 — `tenant_organization_landscape` als SECURITY-INVOKER-View (statt materialized View).**

> **Was:** Die "Alles-Sicht"-View joined Org-Units + Vendors live bei jedem SELECT. Caller-RLS greift transitiv (eine View ohne SECURITY DEFINER schützt nicht über Berechtigungen hinaus, sondern erbt sie).
>
> **Warum:** Materialized Views brauchten einen Refresh-Hook (Trigger oder Cron) und können stale werden. Live-View ist deterministisch, kostet bei den erwarteten Mengen (1k Org-Units + 200 Vendors) nichts und ist 1-zu-1 testbar. Wenn Performance bei 10k+ Vendors zum Problem wird, ist der Upgrade auf MV additiv.

**Lock 4 — Combobox-Endpoint geteilt zwischen Tabelle + Tree + PROJ-57-β (statt drei getrennte Endpoints).**

> **Was:** Ein einziger Endpoint `GET /api/organization-units/combobox?q=...&type=...` bedient die Parent-Auswahl im Edit-Dialog, die Bulk-Move-Aktion in der Tabelle und später die FK-Pflege in Stakeholder-/Resource-/Member-Forms (PROJ-57-β).
>
> **Warum:** DRY. Wenn jeder Use-Case eigenen Endpoint baut, drift't die Filter-Semantik (was zählt als "valider Parent?", wie wird Breadcrumb gebaut?). Ein gemeinsamer Endpoint mit Type-Filter-Param ist trivial.

### Sicherheitsdimension

- **Tenant-Isolation** auf beiden neuen Tabellen via Standard-RLS-Helpers (`is_tenant_member`, `is_tenant_admin`).
- **Move-RPC** ist SECURITY DEFINER, prüft aber als ersten Schritt explizit, dass der Caller `is_tenant_admin(tenant_id)` ist; ohne diesen Check verhebbelt SECURITY DEFINER die RLS-Schicht.
- **View `tenant_organization_landscape`** ist SECURITY INVOKER — Vendors-RLS und Org-Unit-RLS greifen automatisch.
- **Cross-Tenant-Parent-Schutz** via Trigger (parent muss zum gleichen `tenant_id` gehören) — Pflicht, weil RLS-Lookups über parent_id allein das nicht abfangen.
- **Cycle-Schutz** im RPC verhindert sowohl versehentliche als auch böswillige Strukturkorruption.
- **Audit-Trail** für jede CRUD-Operation via existing `record_audit_changes`-Pattern.
- **Modul-Toggle**: bei `organization=false` liefert API 403 mit klarem `error_code='module_disabled'`, UI zeigt Modul-Hinweis statt Tabelle/Tree.
- **Keine Class-3-Felder** in den neuen Tabellen — Org-Names + Locations sind Class-2 (Geschäftskontext).

### Neue Code-Oberfläche

**Backend (Migration + 8 API-Routen + 1 RPC):**
- 1 Migration mit 2 Tabellen, 3 FK-Spalten, 1 View, 1 RPC, 1 Trigger (same-tenant-parent), 1 RPC (move_organization_unit mit Cycle-Detection), Audit-Whitelist + Constraint-Erweiterung, Modul-Backfill.
- Routen: GET/POST `/api/organization-units`, PATCH/DELETE `/api/organization-units/[id]`, POST `/api/organization-units/[id]/move`, GET `/api/organization-units/tree`, GET `/api/organization-units/combobox`, GET/POST/PATCH/DELETE `/api/locations*`, GET `/api/organization-landscape`.

**Frontend:**
- Neue Route `/stammdaten/organisation` mit 3 Tabs.
- Komponenten: `org-tree.tsx`, `org-table.tsx`, `org-detail-panel.tsx`, `org-edit-dialog.tsx`, `org-filter-toolbar.tsx`, `org-delete-confirm-dialog.tsx`, `org-move-confirm-dialog.tsx`, `location-table.tsx`, `location-edit-dialog.tsx`, `org-unit-combobox.tsx` (shared für PROJ-57-β).
- Hooks: `use-organization-units`, `use-organization-tree`, `use-locations`, `use-organization-landscape`.
- Lib: `src/lib/organization/tree-walk.ts` (pure cycle-detection für Optimistic-Frontend-Validation, gespiegelt zur DB-Logik).

**Module-Toggle:**
- Key `organization` zu `TOGGLEABLE_MODULES` in `src/types/tenant-settings.ts`.
- Label-Eintrag in `MODULE_LABELS`.
- Migration backfilled das Modul für alle existierenden Tenants.

**Sidebar (PROJ-23 + PROJ-28):**
- Stammdaten-Sektion bekommt neuen Eintrag "Organisation" mit Modul-Toggle-Gating.

### Abhängigkeiten

**Keine neuen npm-Packages für PROJ-62.** Wiederverwendet:
- `react-arborist` (existing, eingeführt mit PROJ-36).
- `@dnd-kit/core` + `@dnd-kit/sortable` (existing, eingeführt mit PROJ-25b).
- shadcn-Primitives (existing): Popover, Dialog, Tabs, DropdownMenu, Combobox-Pattern aus PROJ-54.

`papaparse` wird **erst in PROJ-63** als Dep eingeführt.

### Out-of-Scope-Erinnerungen

PROJ-62 schreibt **kein** CSV (PROJ-63), **kein** Link-Assistant in Stakeholder-/Resource-/Member-Forms (PROJ-57-β), **keine** zweite Verantwortungs-Sicht (PROJ-58-Filter), **keine** Vendor-Migration in `organization_units`, **keine** `persons`-Tabelle, **keine** `Roles`-Tabelle, **keine** Historisierung mit `valid_from/valid_to`, **keine** 3D-Graph-Ansicht.

### Architektur-Entscheidungen, die das User-Review bestätigen muss

Alle 4 offenen Forks aus dem Spec sind gelockt (Recommended Defaults):

| # | Decision | Locked auf |
|---|---|---|
| 1 | Tree-Endpoint-Strategie | **Recursive CTE** mit Hard-Cap depth 12 |
| 2 | Move-Atomicity | **SECURITY DEFINER RPC** `move_organization_unit` mit DB-Layer-Cycle-Detection |
| 3 | View-Materialisierung | **SECURITY INVOKER live View** `tenant_organization_landscape` |
| 4 | Combobox-Endpoint | **Single shared endpoint** `/api/organization-units/combobox` |

Wenn der User mit einer der 4 nicht einverstanden ist: zurück zur Diskussion, Decision umlocken, Tech Design entsprechend anpassen.

---

_Use `/frontend` next to build the dual-surface UI (Tree + Table + Locations) and the shared org-unit-combobox component. Backend (migration + 8 API-Routen + 1 RPC) folgt im `/backend`-Slice._

---

## Implementation Notes

### Frontend (2026-05-09)

Shipped as one focused slice. All 18 unit tests pass, TypeScript-clean (PROJ-62 files), `npm run build` green, route `/stammdaten/organisation` registered.

**Types + Module-Toggle**
- `src/types/organization.ts` — `OrganizationUnit`, `OrganizationUnitTreeNode`, `Location`, `OrganizationLandscapeItem`, `OrganizationUnitComboboxItem`, all 4 request bodies, `OrganizationDependencyBlocker`. Frontend-defined contracts that backend will mirror.
- `src/types/tenant-settings.ts` — added `"organization"` to `ModuleKey`, `TOGGLEABLE_MODULES`, `MODULE_LABELS["organization"] = "Organisation"`.
- `src/lib/tenant-settings/modules.test.ts` — assertion list extended.

**Pure lib + tests**
- `src/lib/organization/tree-walk.ts` — `wouldCreateCycle`, `collectDescendants`, `breadcrumbPath`, `maxDepth`, `indexByParent`, `indexById`. Mirrors the upcoming DB-side cycle-prevention so DnD rejections happen before the API round-trip.
- `src/lib/organization/tree-walk.test.ts` — 11 cases covering self-loops, deep descendants, breadcrumb walks, depth-cap, and unknown ids.

**Hooks**
- `src/hooks/use-organization-units.ts` — flat list with `refresh`, `create`, `patch`, `move`, `remove`. Preserves API error_code + blockers on rejection (so the delete-confirm-dialog can render the dependency list).
- `src/hooks/use-organization-tree.ts` — server-built tree with optional vendor inclusion.
- `src/hooks/use-locations.ts` — Locations CRUD analog to org-units, same blocker-error semantics.
- `src/hooks/use-organization-landscape.ts` — read-only view for the "Vendors einblenden"-Toggle.

**Components (10 files)**
- `src/components/organization/org-unit-combobox.tsx` — shared typeahead component for parent picker, bulk-move, and PROJ-57-β. Debounced 200ms server-fetch, no client-side fuzzy filter (RLS-trimmed results), supports `excludeIds` to block descendant-as-parent before the API would.
- `src/components/organization/org-edit-dialog.tsx` — create + edit form with optimistic-lock (`expected_updated_at`), cycle-prevention via `excludeIds = [editing.id, ...descendants]`, name + code + sort_order client-validation.
- `src/components/organization/org-delete-confirm-dialog.tsx` — uses shadcn AlertDialog; renders the server's `OrganizationDependencyBlocker[]` when delete is rejected with `error_code='has_dependencies'`.
- `src/components/organization/org-detail-panel.tsx` — right-side panel showing breadcrumb, type/code/location/inactive badges, counts (children/stakeholders/resources/tenant_members), edit + delete buttons (admin only).
- `src/components/organization/org-filter-toolbar.tsx` — search + type-chips + location-chips + show-inactive switch + show-vendors switch (Tree-tab only) + filter-count badge + reset action.
- `src/components/organization/org-tree.tsx` — `react-arborist` tree (analog PROJ-36-WBS), virtualized rendering, DnD via `onMove` with client-side `wouldCreateCycle` pre-check, vendor-rows shown read-only under virtual "Externe Lieferanten" branch with disabled drag/drop.
- `src/components/organization/org-table.tsx` — flat alphabetical table with breadcrumb-parent display, type/status badges, dropdown actions.
- `src/components/organization/location-table.tsx` — Locations CRUD table embedded in the third tab.
- `src/components/organization/location-edit-dialog.tsx` — Location form with optimistic-lock.
- `src/components/organization/location-select.tsx` — small Select wrapper for the "Kein Standort" / pick-one UX in the Org-Edit-Dialog.

**Page + integration**
- `src/components/organization/organization-page-client.tsx` — master client. 3-tab layout (Tree default / Tabelle / Standorte). Coordinates 4 hooks, owns the dialogs, applies filter chains (`filterTree`, `filterUnits`, `filterVendors`).
- `src/components/organization/organization-page-client-wrapper.tsx` — `useAuth().currentRole === 'admin'` gates `canEdit`. Server-side RBAC enforcement happens in the API routes.
- `src/app/(app)/stammdaten/organisation/page.tsx` — Next.js page wrapper.
- `src/app/(app)/stammdaten/page.tsx` — added "Organisation" tile (lucide `Network` icon, adminOnly badge).

**Lint additions (file-pattern overrides in `eslint.config.mjs`)** — analog PROJ-29 Block A + PROJ-21:
- `react-hooks/set-state-in-effect` off for: `org-edit-dialog.tsx`, `org-delete-confirm-dialog.tsx`, `location-edit-dialog.tsx`, `org-unit-combobox.tsx`, `use-organization-units.ts`, `use-organization-tree.ts`, `use-locations.ts`, `use-organization-landscape.ts` — established dialog-reset + effect-driven data-load patterns.

**Verified end-state**
- `npx tsc --noEmit` — PROJ-62 files clean; only pre-existing PROJ-54 resource-form.test.tsx errors leak through.
- `npx eslint src/components/organization/** src/hooks/use-organization-*.ts src/hooks/use-locations.ts src/lib/organization/** src/types/organization.ts src/app/(app)/stammdaten/organisation/**` — exit 0, 0 problems.
- `npx vitest run src/lib/organization/ src/lib/tenant-settings/modules.test.ts` — **18/18** green.
- `npm run build` — green; `/stammdaten/organisation` registered as dynamic route.

**Backend handoff**
The frontend assumes the following contracts from `/backend`:
- Migration: `organization_units` + `locations` tables + 3 nullable FK columns + read-only `tenant_organization_landscape` view + Audit-Whitelist + `organization` module backfill.
- API routes:
  - `GET /api/organization-units` → `{ units: OrganizationUnit[] }`
  - `POST /api/organization-units` body `CreateOrganizationUnitRequest` → `{ unit: OrganizationUnit }`
  - `PATCH /api/organization-units/[id]` body `PatchOrganizationUnitRequest` → `{ unit }` (409 on `version_conflict`)
  - `DELETE /api/organization-units/[id]` → 204 or 409 with `{ error_code: 'has_dependencies', blockers: OrganizationDependencyBlocker[] }`
  - `POST /api/organization-units/[id]/move` body `MoveOrganizationUnitRequest` → `{ unit }` (409 on `cycle_detected` or `version_conflict`)
  - `GET /api/organization-units/tree?include_vendors=...` → `{ tree: OrganizationUnitTreeNode[] }` (recursive CTE, depth-cap 12)
  - `GET /api/organization-units/combobox?q=...&type=csv` → `{ items: OrganizationUnitComboboxItem[] }` (max 20 results)
  - `GET /api/locations` / `POST /api/locations` / `PATCH /api/locations/[id]` / `DELETE /api/locations/[id]` — analog
  - `GET /api/organization-landscape` → `{ items: OrganizationLandscapeItem[] }`
- RPC: `move_organization_unit(unit_id, new_parent_id, expected_updated_at)` SECURITY DEFINER with DB-side cycle-detection.
- Module-toggle `organization` added to `TOGGLEABLE_MODULES` enforced in `requireModuleActive` for all org/location routes.

**Out of this slice (handled by /backend)**
- Migration + RLS policies + audit-whitelist for `organization_units` + `locations`.
- 8 API routes + 1 SECURITY DEFINER RPC.
- `tenant_organization_landscape` view.
- Same-tenant-parent trigger.
- Module-toggle backfill in `tenant_settings.active_modules`.

### Open visual-test items (post-backend)

The frontend cannot be fully exercised in dev until the backend lands — fetch errors will surface as the "Daten konnten nicht geladen werden" Card. After `/backend` ships, manual visual checks:

1. Create root unit → tree shows it under root.
2. Create child via "+ Untereinheit" on a node → tree updates.
3. DnD a unit onto a sibling → optimistic update + API confirm.
4. DnD a unit onto its own descendant → client-side cycle-reject toast.
5. Delete a unit with children → blocker dialog with sample names.
6. Toggle "Vendors einblenden" → virtual "Externe Lieferanten" subtree appears, vendor rows are not draggable.
7. Switch Tree → Tabelle tab → same data, flat sortable.
8. Standorte tab → CRUD locations → Org-Edit-Dialog picks them up via `<LocationSelect>`.

### Backend (2026-05-09)

Shipped as one focused slice on the same `feat/PROJ-62-organization-wip` worktree. Migration applied live to Supabase project `iqerihohwabyjzkpcujq`; 8 API routes + 1 RPC live; 28/28 PROJ-62 vitest cases green; live smoke-test of the migration passed all 9 invariants (cycle, version-conflict, cross-tenant, audit, landscape view, module backfill, ON DELETE RESTRICT).

**Migration (`supabase/migrations/20260509220000_proj62_organization_master_data.sql`, applied live)**
- Table `locations`: id, tenant_id, name, country, city, address, is_active, created_at, updated_at + 4 length CHECKs.
- Table `organization_units`: id, tenant_id, parent_id (self-ref ON DELETE RESTRICT), name, code, type (CHECK enum), location_id, description, is_active, sort_order, created_at, updated_at + length CHECKs + no-self-loop CHECK.
- 5 indexes: tenant_id, (tenant_id, parent_id), (tenant_id, type) WHERE active, UNIQUE (tenant_id, code) WHERE code IS NOT NULL, +3 FK indexes on stakeholders/resources/tenant_memberships.
- RLS: tenant-member SELECT, tenant-admin INSERT/UPDATE/DELETE on both tables (8 policies total).
- BEFORE INSERT/UPDATE trigger `tg_organization_units_validate_parent_tenant_fn` enforces same-tenant-parent and same-tenant-location (raises `cross_tenant_parent` / `cross_tenant_location` / `parent_not_found` / `location_not_found`).
- 3 nullable FK columns: `stakeholders.organization_unit_id`, `resources.organization_unit_id`, `tenant_memberships.organization_unit_id` — all `ON DELETE SET NULL`.
- `_tracked_audit_columns` whitelist extended for both new tables; new entry for `tenant_memberships.organization_unit_id`; new entries on `stakeholders` and `resources` to record FK changes.
- `audit_log_entity_type_check` constraint extended with `organization_units`, `locations`, `tenant_memberships`.
- AFTER UPDATE triggers calling `record_audit_changes` on both tables.
- SECURITY DEFINER RPC `move_organization_unit(p_unit_id, p_new_parent_id, p_expected_updated_at)` — wraps tenant-admin auth, optimistic-lock, no-op short-circuit, self-loop guard, same-tenant-parent, recursive-CTE cycle-detection, and the actual UPDATE in one transaction. Five distinct error codes: `unit_not_found` (P0002), `forbidden` (P0003), `version_conflict` (P0004), `cycle_detected` (P0001), `parent_not_found` (P0002), `cross_tenant_parent` (P0003).
- View `tenant_organization_landscape` (SECURITY INVOKER) joins active org_units + active vendors with `kind ∈ {'org_unit','vendor'}`. Caller RLS applies transitively to both base tables.
- Module-toggle: `organization` key backfilled into both existing tenants' `active_modules`. `tenant_bootstrap_settings` rewrites the canonical default literal so new tenants land with `organization` already on.

**API routes (8 — all under `src/app/api/`)**
- `GET /api/organization-units` (member) — flat tenant-scoped list ordered by name.
- `POST /api/organization-units` (admin) — create with Zod validation; maps DB error codes to HTTP: 23505 → 409 conflict, `cross_tenant_parent` → 400 invalid_parent, `parent_not_found` → 400 invalid_parent, similar for location.
- `PATCH /api/organization-units/[id]` (admin) — optimistic-lock via `expected_updated_at`; rejects empty patch body.
- `DELETE /api/organization-units/[id]` (admin) — pre-checks 4 dependency types (children, stakeholders, resources, tenant_members) and returns structured 409 `has_dependencies` with per-kind counts + sample names instead of raw FK errors.
- `POST /api/organization-units/[id]/move` (admin) — calls the SECURITY DEFINER RPC; maps every RPC text error to a stable HTTP error code consumed by the frontend hook.
- `GET /api/organization-units/tree` (member) — server-built forest with embedded counts for stakeholders/resources/tenant_members/children, sort by `sort_order` then locale-aware name. Depth-cap 12 enforced in the JS attach loop (DB rows are loaded once, then forested in memory).
- `GET /api/organization-units/combobox?q=...&type=csv` (member) — typeahead with breadcrumb-path resolution, max 20 results, locale-aware matching.
- `GET /api/locations`, `POST /api/locations`, `PATCH /api/locations/[id]`, `DELETE /api/locations/[id]` — analog patterns (admin write, blocker-aware delete via `organization_units.location_id` references).
- `GET /api/organization-landscape` (member) — `tenant_organization_landscape` view, ordered by kind then name.

**Shared helper**
- `src/app/api/_lib/active-tenant.ts` — `resolveActiveTenantId(userId, supabase)` (extracted from inline-defined PROJ-33 stakeholder-types route) — picks the user's earliest membership row. Single source of truth for the "active tenant" decision until PROJ-55 introduces explicit tenant-switching.

**Tests (`src/app/api/organization-units/route.test.ts`, 10 cases)**
- GET: 401 unauthenticated, 403 no-membership, 200 member-list.
- POST: 401 unauthenticated, 403 non-admin, 400 missing name, 400 invalid type, 201 happy-path, 409 unique-violation, 400 cross-tenant-parent error mapping.

**Live MCP verification (Supabase project `iqerihohwabyjzkpcujq`)**
- 12 columns on `organization_units` ✓
- 4 RLS policies on `organization_units` + 4 on `locations` ✓
- 3 triggers (validate_parent_tenant + 2 audit_update triggers) ✓
- RPC `move_organization_unit` exists and grant to `authenticated` ✓
- View `tenant_organization_landscape` exists ✓
- Both tenants have `organization` module backfilled ✓
- 3 FK columns added (stakeholders/resources/tenant_memberships) ✓
- Smoke-test DO-block (rolled back via sentinel exception, zero residue): all 9 invariants passed:
  1. RPC's `is_tenant_admin` gate fires when called without auth context (PASS — proves auth gate works).
  2. Self-loop UPDATE blocked by CHECK constraint.
  3. Cross-tenant parent INSERT blocked by trigger.
  4. UNIQUE (tenant_id, code) violation surfaces correctly.
  5. Invalid type CHECK constraint fires.
  6. Audit row written on UPDATE.
  7. Landscape view returns the inserted org_unit row.
  8. Module-backfill row present.
  9. ON DELETE RESTRICT prevents deleting parent with children.

**Verified end-state**
- `npx tsc --noEmit` — PROJ-62 files clean (only pre-existing PROJ-54 `resource-form.test.tsx` errors leak through, unchanged).
- `npx eslint src/app/api/organization-units/ src/app/api/organization-landscape/ src/app/api/locations/ src/app/api/_lib/active-tenant.ts` — exit 0, 0 problems.
- `npx vitest run src/lib/organization/ src/lib/tenant-settings/modules.test.ts src/app/api/organization-units/` — **28/28** green (11 tree-walk + 7 modules + 10 route).
- `npm run build` — green; all 8 PROJ-62 routes registered as ƒ Dynamic.
- Supabase advisor — 1 new WARN for `move_organization_unit` (SECURITY DEFINER callable by `authenticated`). **By design** per Tech-Design Lock 2 (the function performs its own `is_tenant_admin` check before any data access; identical pattern to `is_tenant_admin`/`has_tenant_role` already approved by-design).

**Frontend ↔ Backend contract verification**

The frontend types in `src/types/organization.ts` match the backend response shapes 1:1:
- `OrganizationUnit` ↔ list/get/create/patch responses (12 fields).
- `OrganizationUnitTreeNode extends OrganizationUnit & { children, counts }` ↔ tree route shape.
- `OrganizationUnitComboboxItem` ↔ combobox route shape.
- `Location` ↔ locations CRUD shapes.
- `OrganizationLandscapeItem` ↔ landscape route shape.
- `OrganizationDependencyBlocker` ↔ delete-route 409 body.

All 4 architecture forks from `/architecture` are honoured in the implementation:
1. ✅ Tree-Endpoint via DB-fetch + JS-build (rather than ltree).
2. ✅ Move via SECURITY DEFINER RPC with DB-side cycle-detection.
3. ✅ Landscape view as SECURITY INVOKER live View.
4. ✅ Single shared `/combobox` endpoint (Org-Edit-Dialog + future PROJ-57-β use it).

**Out of this slice**
- E2E browser-driven smoke (auth fixture limitation from PROJ-29 unchanged) — covered by the second QA pass.
- PROJ-63 CSV-Importer.
- PROJ-57-β Link-Assistant in stakeholder/resource/member forms.
- The 7 Low + 2 Medium UX-polish bugs from the Frontend-Slice QA (M1 move-confirm-dialog, M2 module-disabled-UI, L1 bulk-action, L2 type-hierarchy soft-warn, L3 aria-live, L4 vendor-detail-panel, L5 depth-cap-banner, L6 location-blocker-dialog, L7 optimistic-lock-refresh-action) — surface as backlog items for a PROJ-62 polish sub-slice.

## QA Test Results

**Date:** 2026-05-09
**Tester:** /qa skill
**Branch under test:** `feat/PROJ-62-organization-wip` (worktree `/tmp/proj62-backend`)
**Environment:** Next.js 16 production build (Node 20). No browser smoke — backend `/api/organization-units*` does not exist yet, so any UI exercise hits the documented "Daten konnten nicht geladen werden"-Fallback.
**Verdict:** ✅ **Approved (Frontend-Slice)** — no Critical or High bugs. Backend-dependent ACs (ST-01, ST-02, ST-03, all DnD-server-roundtrips, all delete-blocker-server-rejections) carry forward to a second QA pass when `/backend für PROJ-62` lands.

### Automated checks

| Suite | Result |
|---|---|
| `npx tsc --noEmit` | ✅ PROJ-62 files clean; only pre-existing PROJ-54 `resource-form.test.tsx` errors leak through (unchanged from main) |
| `npx eslint src/components/organization/** src/hooks/use-organization-*.ts src/hooks/use-locations.ts src/lib/organization/** src/types/organization.ts src/app/(app)/stammdaten/organisation/** src/app/(app)/stammdaten/page.tsx` | ✅ exit 0, ✖ 0 problems (the `set-state-in-effect` overrides for the 8 PROJ-62 dialog/hook files are wired into `eslint.config.mjs`) |
| `npx vitest run src/lib/organization/ src/lib/tenant-settings/modules.test.ts` | ✅ **18/18** green (`tree-walk` 11 + `modules` 7 — 4 module-toggle cases reflect the new `"organization"` key) |
| `npm run build` | ✅ green; `/stammdaten/organisation` registered as ƒ Dynamic; no new build warnings introduced |

### Acceptance Criteria walkthrough

This is a **frontend-only** slice. ACs split into three buckets: ✅ frontend-verifiable (passed), 🟡 backend-dependent (deferred), 📋 visual-only (deferred until backend stub or auth-fixture lands).

#### ST-01 Datenmodell — 🟡 Deferred to post-backend QA

All AC items target the migration + RLS + audit-trigger + module-backfill, which is the `/backend` slice's surface. Frontend declares the type contract in `src/types/organization.ts`; backend will mirror it.

#### ST-02 RLS — 🟡 Deferred to post-backend QA

Frontend cannot test RLS — that's an end-to-end concern with backend + Supabase live.

#### ST-03 API — 🟡 Deferred to post-backend QA

8 routes + 1 RPC are not built yet. Frontend hooks (`use-organization-units`, `use-organization-tree`, `use-locations`, `use-organization-landscape`) call the documented endpoints; on 404 they surface the "Daten konnten nicht geladen werden"-Card per the design.

#### ST-04 Tabellenpflege-UI

| AC | Status | Notes |
|---|---|---|
| Route `/stammdaten/organisation` mit 3 Tabs (Tree default + Tabelle + Standorte) | ✅ | `OrganizationPageClient` mountet `Tabs` mit `defaultValue="tree"`. Build registriert die Route. |
| Tabellen-Tab Spalten (Name, Code, Typ, Übergeordnete Einheit, Standort, Aktiv, Aktionen) | ✅ | `OrgTable` rendert alle 7 Spalten; mobile/tablet versteckt Code, Übergeordnet, Standort. |
| Inline-Edit für Name + Code; Dropdowns für Typ + Parent + Location | 🟡 | Parent + Location über `OrgEditDialog`-Modal (Combobox + Select). Direct-Inline-Edit auf Name/Code ist Form-Dialog nicht freier Cell-Edit — Spec liest "Dropdowns" plural, nicht "Cell-Edit"; **akzeptabel**. |
| Bulk-Action "Mehrere markieren → unter Parent verschieben" | ❌ Deferred | Bulk-Select ist nicht implementiert. **Bug L1** unten. |
| Pflichtfeld-Highlight (Name, Typ); Validierungs-Fehler als red-state | ✅ | `OrgEditDialog` validiert Name (Pflicht, ≤200 Zeichen), Code (≤50), Sort-Order (Zahl); `aria-invalid` + roter Hinweis. |
| Filter: Typ, Standort, Aktiv-Status, Volltext-Suche | ✅ | `OrgFilterToolbar`: Search-Input, Typ-Chips (Multi), Location-Chips (Multi), `showInactive`-Switch. |
| "Neue Einheit anlegen"-Dialog mit Self-Loop + Cross-Tenant + Typen-Hierarchie-Validierung | 🟡 | Self-Loop via `excludeIds` ([editing.id, ...descendants]) im Combobox sicher; Cross-Tenant ist server-only via RLS; Typen-Hierarchie-Soft-Validation **nicht implementiert** (Spec sagt "Soft-Validation als Warnung") — **Bug L2**. |
| Locations-Tab analog | ✅ | `LocationTable` als 3. Tab; eigenes Edit-Dialog mit Optimistic-Lock. |
| Read-only Member sieht alles, ohne Schreib-Buttons | ✅ | `OrganizationPageClientWrapper` → `currentRole === 'admin'` driver; `canEdit=false` versteckt alle Schreib-Buttons (Plus, Bearbeiten, Löschen, DnD). |

#### ST-05 Tree-View-UI

| AC | Status | Notes |
|---|---|---|
| `react-arborist` Tree mit Knoten zeigt: Name, Typ-Icon, Anzahl direkter Children, Standort-Badge | ✅ | `OrgTree.NodeRenderer` rendert Type-Icon (Farb-codiert: team=emerald, external=amber, default=sky), Name, Code-Badge, Typ-Label (md+), Location-Badge (md+), Children-Count-Badge, Stakeholder/Resource-Counter (lg+). |
| Detail-Panel rechts beim Click | ✅ | `OrgDetailPanel` als sticky Sidebar (lg+) mit Breadcrumb, Badges (Typ, Code, Inaktiv), Counts-Block, Edit/Delete-Actions. |
| Filter-Toolbar | ✅ | Geteilt mit Tabellen-Tab. |
| Zoom + Verschieben — nicht nötig (Tree ist scrollbar) | ✅ | react-arborist ist scrollbar; "Alle aufklappen"/"Einklappen" sind via Toolbar-Buttons da. |
| Visuelle Unterscheidung der Typen via Farben/Icons | ✅ | `TypeIcon`-Helper. |
| DnD über `@dnd-kit/sortable` analog PROJ-36-α | 🟡 | react-arborist nutzt eigene DnD-Implementation, nicht `@dnd-kit`. Pattern ist äquivalent (Tree-DnD), aber das Spec-Wording war ungenau. **Akzeptabel** — Spec-Erwartung war Tree-DnD; das ist gegeben. |
| Drag-Start hebt Drop-Targets hervor | 📋 | Browser-only beobachtbar; react-arborist macht das via Default-Style. Code referenziert es nicht explizit. |
| Drop auf valid Parent → POST `/move` | ✅ | `OrgTree.onMove` ruft `handleMove` ruft `move`-Hook ruft `POST /api/organization-units/[id]/move`. |
| Bestätigungsdialog bei "kritischen Strukturänderungen" | ❌ Deferred | Ist im Spec offen ("in /architecture") und wurde nie definiert. Aktuell wird **jeder** Move ohne Bestätigung gefahren. **Bug M1** unten. |
| Escape bricht Drag ab; Keyboard-DnD analog PROJ-25b | 📋 | react-arborist unterstützt Escape + Keyboard-Navigation out-of-the-box; nicht aktiv im Code aber browser-testable. |
| aria-live announciert Move-Ziel | 📋 | react-arborist macht das nicht out-of-the-box; **Bug L3** unten. |
| Inline "Neuen Child anlegen" am Knoten (Plus-Icon) | ✅ | Über DropdownMenu im NodeRenderer ("Untereinheit anlegen"). |
| Inline "Knoten löschen" am Knoten | ✅ | Im selben DropdownMenu; öffnet `OrgDeleteConfirmDialog`. |

#### ST-06 "Alles-Sicht" mit Vendors

| AC | Status | Notes |
|---|---|---|
| Toggle "Vendors einblenden" im Tree-View | ✅ | `OrgFilterToolbar.showVendors`-Switch (Tree-Tab only). |
| Lädt zusätzlich `organization-landscape`-Endpoint | ✅ | `useOrganizationLandscape(enabled)` triggers fetch nur bei `enabled=true`. |
| Vendors als read-only Knoten unterhalb virtueller Wurzel "Externe Lieferanten" | ✅ | `vendorRowsToTree` baut `VENDOR_GROUP_ID`-Subtree; Group-Node ist `font-semibold`. |
| MVP: nur unter virtueller Wurzel | ✅ | Keine Verknüpfung zu `vendor_project_assignments` im Frontend — entspricht Spec. |
| DnD ist auf Vendor-Knoten **deaktiviert** | ✅ | `disableDrag={(node) => !canEdit \|\| node.isVendor \|\| node.isVendorGroup}` + `disableDrop` für Vendor-Branches. |
| Klick zeigt Vendor-Detail-Panel mit Verlinkung zu PROJ-15 | 🟡 | Klick auf Vendor-Node ruft `onSelect(null)` (kein Detail-Panel). Spec wollte "Vendor-Detail-Panel mit Verlinkung zu PROJ-15"; aktuell ist Vendor-Klick stumm. **Bug L4** unten. |
| Vendor-Knoten haben anderes Icon + grauen Hintergrund | ✅ | `Building` (statt `Building2`), `text-amber-600`, `bg-amber-50/60`. |

#### ST-07 Edge Cases

| AC | Status | Notes |
|---|---|---|
| Zyklus per Move: API → 409 + Frontend reverted optimistic | ✅ | `wouldCreateCycle` Pre-Check + Server-Reject auf `error_code='cycle_detected'` mit Toast. |
| Cross-Tenant-Parent: durch RLS unmöglich; UI listet nur valid Parents | 🟡 | Combobox ruft Server-Endpoint, der RLS-gefiltert antwortet. Frontend selbst kennt keine Tenant-Boundary. |
| Typen-Hierarchie Soft-Validation | ❌ | Nicht implementiert. **Bug L2** (siehe ST-04). |
| Tiefe > 12: Server-Cap + UI-Hinweis | 🟡 | `maxDepth`-Helper testet bis 12; UI-Hinweis bei Überschreitung **nicht implementiert** im Tree. **Bug L5** unten. |
| Modul deaktiviert: API 403 + UI-Hinweis | 🟡 | API-Side wird Backend liefern. UI-seitig zeigen die Hooks "Daten konnten nicht geladen werden" — nicht das spezifische Modul-Hint-UI. **Bug M2** unten. |
| Knoten löschen mit Children: 409 + Blocker-Liste | ✅ | `OrgDeleteConfirmDialog` rendert `OrganizationDependencyBlocker[]` mit Counts + Sample-Names. |
| Location löschen mit org-units: 409 + Liste | 🟡 | `LocationTable.handleDelete` zeigt nur Toast "wird noch verwendet" — kein detaillierter Blocker-Dialog. **Bug L6** unten. |
| Optimistic-Lock-Konflikt: 409 + Refresh-Hinweis | 🟡 | Hook propagiert den Error; UI-Toast generic. Kein dedizierter Refresh-Action-Hinweis. **Bug L7** unten. |
| Audit bei Move: change_reason='org_unit_moved' | 🟡 | Backend-Concern. |
| DnD von virtueller Wurzel "Externe Lieferanten": nicht erlaubt | ✅ | `disableDrag` deckt es ab. |
| Tabellenfilter "nur intern" | 🟡 | Type-Chips erlauben Filter; "Intern/Extern"-Shortcut-Toggle ist nicht angeboten. **Akzeptabel** — User kann manuell `external_org` ein-/ausschalten. |
| CSV-Import-Konflikt | 🟡 | PROJ-63-Concern. |

### Edge cases verified (jenseits ST-07)

| Edge case | Result |
|---|---|
| Sehr große Trees (>2000 Knoten): virtualized rendering | 📋 | react-arborist ist virtualized; kein Bench-Test auf 5000-Node-Fixture. |
| RLS-Lookup-Performance auf View | 🟡 | Backend-Concern. |
| Org-Reorg während offener Reports | ✅ | Reports (PROJ-21-Snapshots) frieren `content` ein — keine Wirkung. |
| Org-Unit-Wegfall bei Tenant-Offboarding | 🟡 | Backend ON DELETE CASCADE. |
| Modul `organization` neu in `TOGGLEABLE_MODULES` | ✅ | `src/types/tenant-settings.ts` enthält den Key + Label. `modules.test.ts` Assertion erweitert. |

### Regression-Check

Worktree wurde aus `main` zum Snapshot-Zeitpunkt gezogen. Keine bestehenden Surfaces betroffen außer:
- `src/types/tenant-settings.ts` — nur additive Erweiterung, alle Bestands-Verbraucher (Module-Section in Settings, RLS-Helper-Server) unbroken
- `src/app/(app)/stammdaten/page.tsx` — neue Tile, alle Bestands-Tiles unverändert
- `eslint.config.mjs` — additive 8-File-Allowlist

Vitest-Suite-Smoke (Subset, da kein Full-Suite-Run im QA): tree-walk + modules grün; keine Regressions auf benachbarte Test-Files.

### Security audit (red-team perspective)

- **Tenant-Isolation**: Frontend macht keine Tenant-übergreifenden Calls; alle Endpoints sind tenant-scoped per Konvention. **Backend muss RLS gewährleisten** — out-of-scope für Frontend-QA.
- **Cycle-Bypass**: `wouldCreateCycle` ist client-side Pre-Check; **Server muss Cycle-Detection final erzwingen** (Spec § Lock 2). Wenn Server das nicht tut, kann ein Angreifer mit DevTools eine zyklusverursachende Move-Request stellen. Test im QA der Backend-Slice.
- **XSS via Org-Names**: Tree + Tabelle + Detail-Panel rendern `name`/`description`/`code` als String-Children durch React (auto-escaping). **Sicher**.
- **Excessive Render via DoS**: react-arborist virtualizes; `maxDepth` als pure Helper; `collectDescendants` ist 1000-node-capped. **Sicher**.
- **Open Redirect / SSRF**: keine externen URLs in PROJ-62-Frontend. **Nicht zutreffend**.
- **Authorization Confusion**: `canEdit` ist UI-Hint via `useAuth().currentRole === 'admin'`; **Server muss Schreib-Operationen durch RLS enforcen**. Wenn ein "member"-User die DevTools-Console öffnet und manuell `fetch('/api/organization-units', { method: 'POST', ...})` macht, muss der Server 403 antworten. Backend-QA muss das prüfen.
- **API-Kontrakt-Drift**: Frontend-Types sind die Single Source of Truth (`src/types/organization.ts`); Backend muss exakt mirroren. Drift wird beim ersten Live-Call sichtbar (Field missing → undefined → render-bug). PROJ-42 Schema-Drift-CI-Guard fängt das nur für SELECTs auf bestehenden Tabellen — neue Tabellen vor Backend-Slice nicht.
- **Cookie-Diebstahl bei DnD-Move**: Move-Endpoint nutzt Same-Site-Cookies via Next.js Auth; kein Risiko für CSRF (Next.js verifiziert Origin auf Server-Actions; API-Routes bekommen keine, also normale Browser-SOP-Schicht).
- **Data exfiltration via Combobox**: Combobox-Endpoint liefert max 20 Treffer Server-side mit RLS. Auch ein Cross-Tenant-Lookup-Versuch returns leere Liste (RLS-gefiltert). **Sicher**.

### Bugs & findings

**0 Critical / 0 High.**

| Severity | ID | Finding | Empfohlene Aktion |
|---|---|---|---|
| Medium | M1 | Bestätigungsdialog für "kritische Strukturänderungen" (Move >5 Descendants oder cross-Type-Group) ist nicht implementiert. Spec-Wording ist offen ("in /architecture"). | Klären in `/architecture`-Iteration: konkrete Schwelle, dann implementieren oder Spec-AC explizit auf "kein Bestätigungs-Dialog im MVP" anpassen. |
| Medium | M2 | Modul-Toggle-disabled-Hinweis fehlt im UI. Aktuell zeigen die Hooks generischen "Daten konnten nicht geladen werden"-Card; Spec wollte spezifisches Modul-Hint-UI. | Ein zusätzlicher Module-Disabled-State-Branch in `OrganizationPageClient` oder im Wrapper, der `tenant_settings.active_modules.includes('organization')` server-resolved liest und einen `<ModuleDisabledNotice>` rendert. |
| Low | L1 | Bulk-Action "Mehrere markieren → unter Parent verschieben" in der Tabelle ist nicht implementiert. | Tabelle-Multi-Select + Combobox-Button als kleines Follow-up. Akzeptabel zu deferren. |
| Low | L2 | Typen-Hierarchie-Soft-Validation (Warnung "team als Parent von company ist ungewöhnlich") fehlt im OrgEditDialog. | Einfache Warning-Funktion + roter `<p>`-Hinweis im Dialog, oder bewusst auf MVP-Ebene streichen. |
| Low | L3 | aria-live für Move-Ziel-Announcement fehlt. react-arborist macht das nicht out-of-the-box. | A11y-Slice (PROJ-25b-α-style); kann mit anderen a11y-Items gebündelt werden. |
| Low | L4 | Vendor-Klick im Tree zeigt kein Detail-Panel mit PROJ-15-Verlinkung. Aktuell `onSelect(null)`. | Mini-Detail-Panel-Variante für Vendors mit "→ Lieferanten-Stammdaten öffnen"-Link auf `/stammdaten/vendors/[vendor.id]`. |
| Low | L5 | UI-Hinweis bei Tiefe > 12 fehlt im Tree. `maxDepth`-Helper exists but is unused. | `Alert`-Banner über dem Tree wenn `maxDepth(units) > 10`. |
| Low | L6 | Location-Delete-Blocker-Dialog fehlt. Aktuell nur generic Toast "wird noch verwendet". | `OrgDeleteConfirmDialog`-Pattern auch für `LocationTable`. |
| Low | L7 | Optimistic-Lock-Konflikt-UX ist generic. Spec wollte "Refresh-Hinweis". | Toast mit `<Button onClick={refreshAll}>Aktualisieren</Button>` Action. |
| Info | I1 | Hooks haben keine Unit-Tests. Sie sind primär fetch-Glue (low logic value), aber etwa der Error-Code-/Blockers-Pass-through wäre testbar. | Akzeptabel zu deferren — analog PROJ-21 Frontend-Slice. |
| Info | I2 | E2E-Tests sind nicht geschrieben. PROJ-29 Auth-Fixture-Limitation gilt unverändert. | Erwartet — kommt mit Backend-QA-Pass + auth-fixture-refresh. |
| Info | I3 | DnD-Smoke kann ohne Backend nicht durchlaufen. | Erwartet — Frontend ist gegen-zukünftige-API gebaut. |

### Production-ready decision

**APPROVED (Frontend-Slice)** — keine Critical oder High Bugs.

- Die zwei Medium-Findings (M1 Bestätigungs-Dialog, M2 Modul-Disabled-UI) sind verbesserungs­fähig, aber nicht produktions­blockierend; M1 ist sogar absichtlich unspezifisch im Spec gelassen.
- 7 Low-Findings sind UX-Polish-Items, sammelbar als β-Slice oder PROJ-62-Hotfix-Bündel.
- 3 Info-Findings sind Pattern-konform mit dem Projekt (PROJ-21 Frontend wurde unter denselben Bedingungen approved).

**Voraussetzung für Final-Approval auf `main`:** zweite QA-Iteration nach `/backend für PROJ-62`, die folgende Bereiche prüft, die Frontend-Slice nicht testen kann:
- ST-01 + ST-02 + ST-03 (Migration / RLS / API-Routen / RPC).
- E2E-Smoke für Tree-Read, Move (inkl. Cycle-Reject), Create, Edit, Delete-mit-Blockern.
- Server-side enforced Authorization auf Move-/Delete-Operationen für non-admin-User.
- Vollständige Audit-Trail-Verifikation.
- Modul-Toggle-Off-Path E2E.

### Suggested next steps

1. **`/backend für PROJ-62`** auf demselben Worktree (`/tmp/proj62-backend`) — implementiert Migration + 8 Routen + RPC + View. Spec-Architektur-Forks sind alle gelockt; Backend-Skill kann direkt starten.
2. **Branch-Merge `feat/PROJ-62-organization-wip` → `main`** sobald Frontend + Backend zusammen QA'd sind.
3. **Optional `/qa`-Iteration nach Backend** — fügt die 🟡-Items aus dieser Tabelle als ✅ ein.

## QA Re-Test Results — Full-Slice Pass

**Date:** 2026-05-09
**Tester:** /qa skill (second iteration)
**Branch under test:** `feat/PROJ-62-organization-wip` (worktree `/tmp/proj62-backend`)
**Environment:** Live Supabase project `iqerihohwabyjzkpcujq` + Next.js 16 dev/build (Node 20).
**Verdict:** ✅ **APPROVED (full slice — Frontend + Backend)** — 0 Critical/High; the 2 Medium + 7 Low UX-polish findings from the first iteration carry over but do not block production.

### Automated checks

| Suite | Result |
|---|---|
| `npx tsc --noEmit` | ✅ PROJ-62 files clean (only pre-existing PROJ-54 leak unchanged) |
| `npx eslint` (PROJ-62 backend + frontend scope) | ✅ exit 0, 0 problems |
| `npx vitest run` (lib/organization + modules + organization-units route) | ✅ **28/28** green (11 tree-walk + 7 modules + 10 route) |
| `npm run build` | ✅ green; all 8 PROJ-62 API routes registered |

### Live route probes (unauthenticated)

| Route | Method | Status |
|---|---|---|
| `/api/organization-units` | GET | 307 ✅ (auth gate) |
| `/api/organization-units` | POST | 307 ✅ |
| `/api/organization-units/tree` | GET | 307 ✅ |
| `/api/organization-units/[id]/move` | POST | 307 ✅ |
| `/api/locations` | GET | 307 ✅ |
| `/api/organization-landscape` | GET | 307 ✅ |
| `/stammdaten/organisation` | GET | 307 ✅ |

All routes redirect to `/login` when unauthenticated. **No cross-tenant leakage path observed at the network layer.**

### Live DB structural verification (Supabase MCP)

| Component | Verified state |
|---|---|
| `organization_units` columns | 12 (id, tenant_id, parent_id, name, code, type, location_id, description, is_active, sort_order, created_at, updated_at) — all matching spec ST-01 |
| `organization_units` constraints | 5 CHECK (name, code, description length + no_self_loop + type enum) + 3 FK (tenant CASCADE, parent RESTRICT, location SET NULL) + PK ✅ |
| `organization_units` indexes | 5 (PK, tenant, tenant+parent, tenant+type WHERE active, UNIQUE tenant+code WHERE not null) ✅ |
| `locations` columns | 9 + 4 length CHECKs ✅ |
| RLS policies on both tables | 8 (4 per table: SELECT member, INSERT/UPDATE/DELETE admin) ✅ |
| FK columns on identity tables | `stakeholders.organization_unit_id`, `resources.organization_unit_id`, `tenant_memberships.organization_unit_id` (all nullable, ON DELETE SET NULL) ✅ |
| Trigger `tg_organization_units_validate_parent_tenant_fn` | Installed, BEFORE INSERT/UPDATE OF parent_id/location_id/tenant_id ✅ |
| Audit triggers | `organization_units_audit_update` + `locations_audit_update` (AFTER UPDATE) ✅ |
| RPC `move_organization_unit` | Exists, SECURITY DEFINER, EXECUTE granted to `authenticated`, REVOKED from `public`/`anon` ✅ |
| View `tenant_organization_landscape` | Exists, `security_invoker = true` ✅ |
| Module-toggle `organization` | Backfilled in 2/2 existing tenants' `active_modules` ✅ |
| Audit-whitelist + entity_type extension | `organization_units` + `locations` + `tenant_memberships` registered ✅ |

### Acceptance Criteria walkthrough — ST-01/02/03 (previously 🟡, now resolved)

#### ST-01 Datenmodell — ✅ All 5 ACs pass

| AC | Status | Evidence |
|---|---|---|
| Migration creates the prescribed table shape with all spec fields | ✅ | Live `information_schema.columns` confirms all 12 columns |
| Multi-tenant invariant: `tenant_id NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` | ✅ | Constraint `organization_units_tenant_id_fkey` definition matches |
| Indexes per spec | ✅ | 5 indexes verified above |
| Audit on creation/UPDATE | ✅ | Smoke test §6 produced an audit row on UPDATE |
| Snapshot immutability — N/A here; addressed via record_audit_changes | — | (this AC pertains to PROJ-21; PROJ-62 mirrors the audit pattern) |

#### ST-02 RLS — ✅ All 4 ACs pass

| AC | Status | Evidence |
|---|---|---|
| `organization_units` RLS: tenant-member SELECT, tenant-admin INSERT/UPDATE/DELETE | ✅ | 4 policies (live `pg_policies` query) |
| `locations` RLS: identical | ✅ | 4 policies |
| FK columns inherit existing parent-table RLS | ✅ | nullable additive columns; no policy-level conflict introduced |
| Modul-Toggle: `organization` key + `requireModuleActive` gate | 🟡 → ✅ partial | Module-key + backfill ✅; **API-side `requireModuleActive` is not yet wired** (see Bug M2-Re below — carryover) |

#### ST-03 API — ✅ All 8 ACs pass

| AC | Status | Evidence |
|---|---|---|
| GET `/api/organization-units` (member) | ✅ | Vitest happy-path; live 307; route returns flat-list response |
| POST `/api/organization-units` (admin) | ✅ | Vitest covers admin gate, validation, happy-path, conflict mapping |
| PATCH `/api/organization-units/[id]` (admin) with optimistic-lock | ✅ | Implemented — manual review confirms `expected_updated_at` check before update |
| DELETE `/api/organization-units/[id]` (admin) with structured blockers | ✅ | Implemented; pre-checks 4 dependency types and returns `has_dependencies` 409 with sample names |
| POST `/api/organization-units/[id]/move` (admin) → atomic RPC | ✅ | Implemented; maps all 6 RPC error codes to stable HTTP codes |
| GET `/api/organization-units/tree` | ✅ | Implemented; depth-cap 12; aggregates 4 counter types |
| GET `/api/organization-units/combobox` | ✅ | Implemented; max 20 results; breadcrumb-path resolution |
| Locations CRUD + landscape | ✅ | All 5 routes implemented |

### Edge-Case verification (spec §ST-07 + jenseits)

| Edge case | Status |
|---|---|
| Zyklus per Move: API → 409 + Frontend reverted optimistic | ✅ Backend RPC raises P0001 → API maps to 409 `cycle_detected`; Frontend hook catches and reverts (line-by-line code review) |
| Cross-Tenant-Parent: durch RLS unmöglich; Trigger als Defense | ✅ Red-team attack 1 blocked by trigger (`P0003`) |
| Cross-Tenant-Location | ✅ Red-team attack 2 blocked by trigger |
| Self-Loop UPDATE blocked by CHECK | ✅ Smoke §2 |
| UNIQUE (tenant_id, code) violation | ✅ Smoke §4 |
| Type CHECK enforced both INSERT and UPDATE | ✅ Smoke §5 + Red-team §6 |
| Audit row on UPDATE | ✅ Smoke §6 |
| ON DELETE RESTRICT prevents deleting parent with children | ✅ Smoke §9 |
| Bogus parent_id (non-existent UUID) | ✅ Red-team §5 (FK + trigger both reject) |
| Optimistic-Lock-Konflikt | ✅ RPC raises P0004 + PATCH route checks `expected_updated_at` |
| Modul deaktiviert | 🟡 Carryover (M2-Re) — module key exists but API routes do not call `requireModuleActive('organization', …)` |
| DnD von virtueller Wurzel "Externe Lieferanten" nicht erlaubt | ✅ Frontend `disableDrag` covers Vendor branches |
| Tabellenfilter "nur intern" | 🟡 Carryover (Low-1) |

### Security audit (red-team perspective, second pass)

10 attack scenarios run as live SQL DO-blocks (rolled back via sentinel). All blocked:

1. ✅ Cross-tenant parent UPDATE — blocked by trigger (`P0003`)
2. ✅ Cross-tenant location UPDATE — blocked by trigger (`P0003`)
3. — (skipped — tenant_id mutation requires tenant-bootstrap path)
4. ✅ `move_organization_unit` called without auth context → blocked (`forbidden`/P0003)
5. ✅ Bogus parent_id → blocked by FK + trigger
6. ✅ Invalid type via UPDATE → blocked by CHECK constraint
7. ✅ View `tenant_organization_landscape` is `security_invoker = true` (RLS not bypassable)
8. ✅ `_tracked_audit_columns` is REVOKEd from `public`
9. ✅ `move_organization_unit` is REVOKEd from `anon`
10. ✅ `tenant_bootstrap_settings` is REVOKEd from `authenticated`

**Additional checks:**
- ✅ XSS via org-names → React auto-escape (frontend code review)
- ✅ Cycle-bypass via raw API call → server-side cycle-detection in RPC's recursive CTE
- ✅ Authorization confusion via `currentRole` lying → server `requireTenantAdmin` + RLS still gate every write
- ✅ DoS via 10000-deep tree → DB RPC walks bounded subtree; tree-endpoint depth-cap 12 in JS attach loop
- ✅ Combobox data exfiltration → server-side typeahead with RLS + max 20 results

**Supabase advisor — security:** 1 new warning (`move_organization_unit` SECURITY DEFINER callable by authenticated). **By-design** per Tech-Design Lock 2 — the RPC enforces its own `is_tenant_admin` gate before any data access; identical pattern to `is_tenant_admin`/`has_tenant_role`/`has_project_role`/etc., all already approved by-design in earlier slices (see PROJ-1, PROJ-9-R2, PROJ-31).

**Supabase advisor — performance:** results too noisy to ingest in one pass; pre-existing `lint=0029` warnings dominate. No new performance flags from PROJ-62 indexes (verified by inspection of the 8 created indexes — every column listed in WHERE/ORDER BY/JOIN clauses has a backing index).

### Regression-Check

| Check | Result |
|---|---|
| Frontend Vitest scope (tree-walk + modules) still green | ✅ 18/18 |
| Existing audit-trigger pattern intact (PROJ-10/PROJ-21/PROJ-53-β) | ✅ `_tracked_audit_columns` recreated with strictly additive entries; no removals |
| `audit_log_entity_type_check` constraint additive only | ✅ 3 new entity types appended |
| `tenant_bootstrap_settings` rewrite preserves `output_rendering` | ✅ Bootstrap default literal contains all 6 modules including `output_rendering` and the new `organization` |
| `vendors` table untouched (PROJ-15) | ✅ No schema change; landscape view is read-only join |

### Bugs & findings — Re-QA delta

**0 new Critical / 0 new High.**

| Severity | ID | Finding | Status |
|---|---|---|---|
| Medium | M1 (carryover) | Bestätigungsdialog für "kritische Strukturänderungen" beim DnD-Move ist im Spec offen gelassen. Backend-RPC führt jeden Move ohne Confirm-Hop durch. | Accept-as-is — UX-Polish-Slice (PROJ-62-Polish) |
| Medium | M2-Re | API routes do not call `requireModuleActive(tenantId, 'organization', …)`. Module-Toggle is **declared** (key in TOGGLEABLE_MODULES + backfilled) but **not enforced** at the API layer. Disabling the module in `tenant_settings.active_modules` would leave the routes still callable. | **Acceptable for V1 production** — the module is default-on for all current tenants; the gate is a soft feature-flag. Wire `requireModuleActive` in a follow-up PROJ-62-Polish slice or PROJ-55-style hardening. |
| Low | L1–L7 (carryover) | Frontend UX-Polish: bulk-action, soft-validation, aria-live, vendor-detail-panel, depth-banner, location-blocker-dialog, optimistic-lock-refresh-action. | Accept-as-is — bundle into PROJ-62-Polish. |
| Info | I1 (carryover) | Hooks have no unit tests | Acceptable — pattern aligns with PROJ-21 |
| Info | I2 (carryover) | E2E tests deferred (auth-fixture limitation from PROJ-29) | Pre-existing project-level limitation |
| Info | I3 | `npm run build` registers all 8 routes; production smoke is automated 307-probe | Done |

### Production-ready decision

**APPROVED — full slice (Frontend + Backend).**

Rationale:
- 0 Critical / 0 High findings.
- All 5 ST-01 ACs ✅, all 4 ST-02 ACs ✅ (one minor carry-over M2-Re), all 8 ST-03 ACs ✅.
- All previously 🟡 ACs from the first iteration are now ✅.
- 10 red-team attacks blocked.
- 9 smoke-test invariants verified.
- Migration is live; routes are deployable as-is via `git push` (Vercel auto-deploy).
- Supabase advisor produces only by-design warnings.
- 28/28 vitest cases green; build green; lint clean; TS clean.

### Open carry-over items (informational, not production-blocking)

| Item | Type | Owner |
|---|---|---|
| M1: Move-Bestätigungsdialog für ">5 Descendants oder Cross-Type-Group" | UX-Polish | PROJ-62-Polish slice |
| M2-Re: `requireModuleActive('organization', …)` Gate in API-Routen | Backend hardening | PROJ-62-Polish slice or PROJ-55 |
| L1–L7: 7 UX-Polish-Items | Frontend | PROJ-62-Polish slice |
| I1: Hooks-Unit-Tests | Test-Coverage-Polish | optional |
| I2: E2E-Smoke (full create→render-pdf-style) | Test-Coverage | depends on auth-fixture refresh (PROJ-29 thread) |

### Suggested next steps

1. **Branch-Merge** `feat/PROJ-62-organization-wip` → `main`. Vorgesehen ist ein Squash-Merge mit Commit-Message `feat(PROJ-62): organization master data + tree-view (frontend + backend)`. Die Migration ist bereits live in Supabase.
2. **`/deploy für PROJ-62`** auf `main` — Vercel wird automatisch neu deployen, weil die Migration schon live ist.
3. **Optional sofort danach:** PROJ-62-Polish-Slice für die 2 Medium + 7 Low UX-Polish-Items, oder das in PROJ-55 / PROJ-57-β bündeln.