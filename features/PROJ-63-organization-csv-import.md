# PROJ-63: Organization CSV Import

## Status: Approved
**Created:** 2026-05-09
**Last Updated:** 2026-05-13
**Priority:** P1
**CIA-reviewed:** 2026-05-09 (papaparse als neue Dep freigegeben; 2 fixe Layouts statt offenes Schema)

## Summary

CSV-Importer für `organization_units` und `locations` aus PROJ-62. Zwei **fixe** Spalten-Layouts werden im MVP unterstützt:

1. **OrgChart-Hierarchy** — eine Zeile pro Organisationseinheit; Hierarchie über `unit_code` + `parent_code`.
2. **Person-Assignment** — eine Zeile pro Person; pflegt nur die FK `organization_unit_id` an `stakeholders`/`resources`/`tenant_memberships` per E-Mail-Match.

Der Importer ist **zweistufig**: Upload → Server-side Parse + Validate → Preview-Page mit Fehler/Warnungs-Liste + Dedup-Bericht → User-Bestätigung → Import-Job mit Audit. Tenant-admin only. `papaparse` (~14 KB gz, MIT) wird als neue Dependency eingeführt.

**Out-of-Scope (PROJ-63b/c):** offenes/dynamisches CSV-Schema, Excel/XLSX-Import, Auto-Sync mit Entra-ID, KI-Erkennung von Strukturen aus Free-Form-CSVs, Vendor-Import (Vendors haben PROJ-15-eigenen Pfad), Inkrementelle Re-Imports mit Diff.

## Dependencies

- **Requires PROJ-62** (Tabellen `organization_units` + `locations` + FK-Spalten existieren).
- **Requires PROJ-1** (Auth + RLS).
- **Requires PROJ-10** (Audit-Log).
- **Requires PROJ-17** (Modul-Toggle `organization`).
- **Compatible with PROJ-44** (Context Ingestion Pipeline) — PROJ-63 nutzt Patterns analog (Upload-Job + Preview + Audit), aber **nicht** das Pipeline-Schema (CSV-Org-Import ist Stammdaten, nicht Context-Source).

## V2 Reference Material

V2 hatte einen Excel-basierten Importer für Org-Strukturen (`apps/api/src/modules/master-data/import-organization.ts`). V3 nutzt CSV statt Excel, weil:
- CSV ist universell (Excel-Export aus jedem System).
- `papaparse` ist klein und stabil; XLSX-Parser sind groß (~500 KB).
- Streaming + Header-Auto-Detect aus papaparse decken die V2-Use-Cases ab.

V2-Lessons-Learned:
- Hierarchie über `parent_code` (string) ist robuster als `parent_id` (UUID, der dem Importer nicht bekannt ist).
- Dedup-Schlüssel **(tenant_id, code)** als UNIQUE-Constraint hat sich bewährt.
- Preview-Step war essentiell (V2: 60 % der ersten Imports hatten ≥ 1 Fehlerzeile).

## User Stories

- **Als Tenant-Admin** möchte ich eine CSV-Datei mit unserer Organisationsstruktur hochladen, damit ich nicht hunderte Knoten manuell anlegen muss.
- **Als Tenant-Admin** möchte ich vor dem eigentlichen Import eine Preview sehen, in der ich Fehler und Warnungen pro Zeile sehe, bevor irgendetwas in die Datenbank geschrieben wird.
- **Als Tenant-Admin** möchte ich, dass das System Duplikate (gleicher `code` oder gleiche `email`) erkennt und mir die Wahl gibt: überspringen, aktualisieren, abbrechen.
- **Als Tenant-Admin** möchte ich eine zweite CSV-Variante hochladen können, in der nur Personen-Zuordnungen gepflegt werden — ohne dass ich die Hierarchie-CSV nochmal hochladen muss.
- **Als Tenant-Admin** möchte ich nach jedem Import einen Bericht (importiert / übersprungen / fehlerhaft) als Download bekommen, um Auditierungs-Anforderungen zu erfüllen.
- **Als Tenant-Admin** möchte ich einen Import auch wieder rückgängig machen können, falls ich versehentlich die falsche CSV hochgeladen habe — mindestens als "alle Knoten dieses Imports löschen" (Rollback per `import_id`).

## Acceptance Criteria

### Datenmodell (ST-01)

- [ ] Neue Tabelle `organization_imports`:
  - `id uuid PK, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
  - `layout text NOT NULL CHECK (layout IN ('orgchart_hierarchy','person_assignment'))`
  - `uploaded_by uuid NOT NULL REFERENCES auth.users(id)`
  - `uploaded_at timestamptz NOT NULL DEFAULT now()`
  - `committed_at timestamptz NULL` — null = preview only, nicht committed
  - `committed_by uuid NULL REFERENCES auth.users(id)`
  - `status text NOT NULL CHECK (status IN ('preview','committed','rolled_back','failed'))`
  - `row_count_total integer NOT NULL`
  - `row_count_imported integer NOT NULL DEFAULT 0`
  - `row_count_skipped integer NOT NULL DEFAULT 0`
  - `row_count_errored integer NOT NULL DEFAULT 0`
  - `report jsonb NOT NULL` — Per-Zeile-Status: `[{ row, status: 'imported'|'skipped'|'errored'|'updated', errors: [...], warnings: [...] }]`
  - `original_filename text NOT NULL`
- [ ] `organization_units.import_id uuid NULL REFERENCES organization_imports(id) ON DELETE SET NULL` — markiert importierte Knoten für Rollback.
- [ ] `locations.import_id uuid NULL REFERENCES organization_imports(id) ON DELETE SET NULL` — analog.
- [ ] UNIQUE-Constraint: `organization_units(tenant_id, code) WHERE code IS NOT NULL` — Dedup-Anker für `parent_code`-Auflösung. (Wenn `code IS NULL`, gilt der Knoten als nicht-importer-relevant.)
- [ ] Audit-Whitelist erweitert: `organization_imports` ist immutable (kein `record_audit_changes` UPDATE-Trigger), aber AFTER INSERT-Trigger schreibt audit-row mit `change_reason='org_import_started'` und AFTER UPDATE auf `status` schreibt mit `change_reason='org_import_committed'`/`'rolled_back'`.

### CSV-Layout 1: OrgChart-Hierarchy (ST-02)

- [ ] Pflichtspalten: `unit_code` (string, eindeutig pro Tenant), `name`, `type` (eines aus `group/company/department/team/project_org/external_org`).
- [ ] Optionale Spalten: `parent_code`, `location_code`, `description`, `is_active` (true/false, default true), `sort_order` (integer).
- [ ] Hierarchie-Auflösung: nach Parse aller Zeilen wird `parent_code` → `parent_id` lookup-aufgelöst (innerhalb des Imports + bestehende DB-Knoten). Vorwärts-Referenzen (Child vor Parent) sind erlaubt.
- [ ] Validierungs-Regeln:
  - Pflichtfeld-Check.
  - `type` muss valider Enum-Wert sein.
  - `parent_code` muss bekannt sein (entweder im Import oder DB).
  - `location_code` muss in `locations(tenant_id, code)` existieren ODER vorab im Layout 1b `locations.csv` (sub-feature, siehe ST-04) angelegt sein.
  - Cycle-Check (siehe PROJ-62 ST-04 Cycle-Detection).
  - Code-Eindeutigkeit innerhalb des Imports.
- [ ] **Beispiel-CSV** wird als statisches Asset unter `/templates/orgchart_hierarchy.csv` ausgeliefert.

### CSV-Layout 2: Person-Assignment (ST-03)

- [ ] Pflichtspalten: `email` (eindeutiger Person-Match-Key), `org_unit_code`.
- [ ] Optionale Spalten: `entity_kind` (`stakeholder|resource|tenant_member`, default = auto-Detection in dieser Reihenfolge: tenant_member → resource → stakeholder).
- [ ] Validierungs-Regeln:
  - Email-Format.
  - `org_unit_code` muss in `organization_units(tenant_id, code)` existieren.
  - Person-Match: `tenant_memberships.user_id` → `auth.users.email` ODER `resources.linked_user_id` → `auth.users.email` ODER `stakeholders.email`. Wenn keine Person matcht: Fehler.
  - Mehrdeutige Matches (Person ist sowohl Stakeholder als auch Resource): wenn `entity_kind` fehlt, Warnung; wenn `entity_kind` gesetzt, Auswahl gemäß Spalte.
- [ ] **Beispiel-CSV** unter `/templates/person_assignment.csv`.

### Import-API (ST-04)

- [ ] `POST /api/organization-imports/upload`
  - Multipart-Form, max 5 MB CSV, max 10000 Zeilen.
  - Body field `layout: 'orgchart_hierarchy' | 'person_assignment'`.
  - Body field `dedup_strategy: 'skip' | 'update' | 'fail'` (default `skip`).
  - Body field `include_locations: boolean` (Layout 1 only — wenn true, erwartet zusätzliches Feld `locations_csv` mit eigener CSV; Pflicht-Spalten `location_code, name`).
  - Server parsed via `papaparse` mit `header: true, skipEmptyLines: true`.
  - Server validiert alle Zeilen, erstellt `organization_imports`-Row mit `status='preview'`, schreibt `report` JSONB.
  - Response: `{ import_id, row_count_total, row_count_errored, preview_url }`.
  - **Kein** Schreiben in `organization_units`/`locations` in dieser Phase.
- [ ] `GET /api/organization-imports/[id]/preview`
  - Liefert vollständige `report`-JSONB + Aggregate.
  - Tenant-admin only.
- [ ] `POST /api/organization-imports/[id]/commit`
  - Body `{ confirm: true, dedup_strategy?: <override> }`.
  - Transaktion: schreibt valide Zeilen in `organization_units`/`locations` mit `import_id=<id>`; Auflösung von `parent_code` → `parent_id` innerhalb der Transaktion.
  - Auf Konflikt (UNIQUE-Verletzung trotz Dedup): 409 mit Liste der Konflikt-Codes.
  - Update `organization_imports`: `status='committed', committed_at, committed_by, row_count_imported, row_count_skipped, row_count_errored`.
  - Audit: 1 row pro Knoten + 1 import-level row.
  - Response: `{ import_id, row_count_imported, row_count_skipped, errors }`.
- [ ] `POST /api/organization-imports/[id]/rollback`
  - Tenant-admin only.
  - Löscht alle `organization_units` + `locations` mit `import_id=<id>` UND `created_at >= committed_at` (Schutz vor versehentlichem Löschen späterer Edits).
  - Knoten mit Children außerhalb des Imports: ON DELETE RESTRICT → 409 + Liste.
  - FK-Spalten an `stakeholders`/`resources`/`tenant_memberships` werden **nicht** zurückgesetzt (Person-Assignment-Import ist non-destructive — Rollback führt nur Org-Knoten zurück, nicht Personen-Zuordnungen).
  - Update `organization_imports.status='rolled_back'`.
- [ ] `GET /api/organization-imports` — Liste aller Imports des Tenants (tenant-admin only).

### Import-UI (ST-05)

- [ ] Neue Sub-Route `/stammdaten/organisation/import`.
- [ ] Step 1 — Upload:
  - Dropzone für CSV.
  - Layout-Auswahl (Radio: "Hierarchie" / "Personen-Zuordnung").
  - Optional: zweites Upload-Feld für Locations-CSV (nur Layout 1).
  - Dedup-Strategie-Auswahl.
  - "Hochladen + Vorschau anzeigen"-Button.
- [ ] Step 2 — Preview:
  - Tabelle mit allen Zeilen, Status-Spalte (✓ valid / ⚠ warning / ✗ error / ↻ duplicate).
  - Filter: nur Fehler / nur Warnungen / nur Duplikate.
  - Aggregate: "X von Y Zeilen sind importbereit. Z Fehler, W Warnungen."
  - Pro Zeile: Klick öffnet Detail (Original-Werte + Fehlerliste).
  - "Importieren"-Button (deaktiviert wenn `row_count_errored > 0` und Dedup-Strategie nicht "skip"; aktiv wenn nur Warnungen).
  - "Abbrechen"-Button (löscht `organization_imports`-Row).
- [ ] Step 3 — Commit-Bestätigung-Modal:
  - "X Zeilen werden in die Org-Struktur geschrieben. Fortfahren?"
  - Bestätigen → POST commit → Toast + Redirect zur Tree-View.
- [ ] Step 4 — Rollback (auf Import-Detail-Page):
  - Liste aller Imports unter `/stammdaten/organisation/import` (Sub-Tab "Historie").
  - Pro committed Import: "Zurücksetzen"-Button mit Bestätigung.
  - Rollback ist destruktiv → erfordert Doppelt-Bestätigung.

### Edge Cases (ST-06)

- [ ] **CSV mit BOM**: papaparse handelt das automatisch.
- [ ] **CSV mit Semikolon-Delimiter** (deutsche Excel-Defaults): papaparse Auto-Detect oder UI-Toggle "Trennzeichen".
- [ ] **Leere Zeilen**: skipEmptyLines.
- [ ] **Zellen mit Umbrüchen**: papaparse handelt RFC 4180 Quoting.
- [ ] **Encoding != UTF-8** (Windows-1252): UI fragt encoding ab oder Auto-Detect via BOM-Sniff; Fallback UTF-8.
- [ ] **Sehr große CSV (>10000 Zeilen)**: 413-Reject mit klarem Fehler "Bitte Datei in Chunks unter 10000 Zeilen aufteilen".
- [ ] **Vorwärts-Referenz** (`parent_code` zeigt auf später kommende Zeile): Validierung erst nach komplettem Parse-Pass; Topological-Sort vor Insert.
- [ ] **Self-Loop in CSV** (`unit_code = parent_code`): Fehler.
- [ ] **Zyklus innerhalb CSV** (A → B → A): Cycle-Detect bei Insert.
- [ ] **Existing-Knoten als Parent**: erlaubt; Validierung sieht Knoten in DB.
- [ ] **Existing-Knoten mit gleichem Code, aber unterschiedlichen Werten**:
  - dedup `skip` → übersprungen, in `report` als `'skipped'`.
  - dedup `update` → UPDATE auf existierenden Knoten, audit-log-getrackt.
  - dedup `fail` → ganzer Import wird abgebrochen.
- [ ] **Person-Assignment für unbekannte Email**: Zeile als errored, nicht den ganzen Import abbrechen.
- [ ] **Person ist gleichzeitig Stakeholder + Resource**: ohne `entity_kind` Warnung + Default-Reihenfolge; mit `entity_kind` deterministisch.
- [ ] **Modul `organization` deaktiviert**: 403 vor Upload-Stage.
- [ ] **Tenant-Admin verlässt Browser zwischen Preview und Commit**: Preview-Row bleibt mit `status='preview'`; nach 24h auto-cleanup via Cron (PROJ-Cron-Pattern, nutzt `CRON_SECRET` aus `.env`).
- [ ] **Concurrent Upload zweier Admins**: jeder bekommt eigenen `import_id`; commit-Reihenfolge entscheidet, wer Konflikte sieht.
- [ ] **Locations-CSV ohne Org-CSV** (Layout 1, nur Locations gepflegt): erlaubt, importiert nur Locations.
- [ ] **Person-Assignment für deaktivierten Org-Unit** (`is_active=false`): Warnung, kein Fehler.

### Audit + Observability (ST-07)

- [ ] Pro Import: 3 audit-rows minimum:
  - `org_import_started` (INSERT auf `organization_imports`).
  - `org_import_committed` oder `org_import_rolled_back` (UPDATE auf `status`).
  - Pro importierten Knoten: ein `record_audit_changes`-INSERT-Trigger-Row (Standard-Pattern).
- [ ] Logging: pro Import eine structured-log-line `[PROJ-63] import committed { import_id, tenant_id, layout, row_counts }`.
- [ ] Sentry breadcrumb auf parse + validate + commit-Pfad.

## Edge Cases (kategorisch)

- **Daten-Privacy**: Person-Assignment-CSV enthält Emails (Class-2). Nicht in Logs ausgeben; Preview-Page nur tenant-admin-sichtbar.
- **Re-Import desselben Files**: zweiter Upload erzeugt zweiten `import_id`; bei dedup `update` werden Knoten mit gleichem Code aktualisiert; bei dedup `skip` ändert sich nichts. Optionale UX-Warnung "Diese Datei wurde bereits importiert" (Hash-Match auf `original_filename` + `row_count`).
- **Cron-Cleanup**: täglich 02:00 Uhr UTC, löscht `organization_imports` mit `status='preview' AND uploaded_at < now() - interval '24 hours'`.

## QA Test Results (2026-05-13)

**Clean-worktree QA on `/tmp/proj63-clean` at commit `0a07faf`:**

- `npm run test -- src/lib/organization/csv-parsers.test.ts src/lib/organization/import-validators.test.ts src/app/api/organization-units/route.test.ts src/lib/organization/tree-walk.test.ts` — PASS, 31 tests.
- `npm run lint` — PASS with 0 errors; 1 existing React Hook Form compiler warning in `src/components/work-items/edit-work-item-dialog.tsx`.
- `npm run build` — PASS; `/stammdaten/organisation/import` and all `/api/organization-imports/*` routes included in the production route manifest.

**Local checkout note:** the primary checkout also contains unrelated in-flight PROJ-34/Claude files. Global lint/build fail there on those unrelated files only; the clean PROJ-63 worktree passes.

**Not run locally:** `npm run check:schema-drift` requires `DATABASE_URL` for a freshly migrated Postgres; local command exits with `DATABASE_URL is not set`. CI runs this check with its configured database.

## Technical Requirements

- **Stack:** Next.js 16 API Route + papaparse (~14 KB gz, MIT, **neue Dependency**, CIA-freigegeben). Postgres-Transaktion für Commit. Supabase RLS.
- **Multi-tenant:** alle Tabellen tenant-scoped; RLS aus PROJ-1.
- **Validation:** Zod-Schemas für `OrgChartHierarchyRow` + `PersonAssignmentRow` in `src/lib/validation/organization-import.ts`.
- **Performance:** 10000 Zeilen Parse + Validate < 5 s; Commit < 10 s.
- **Observability:** structured logs + audit-trail; Sentry breadcrumbs.
- **Security:**
  - File-Upload-Limit 5 MB.
  - papaparse läuft serverseitig (kein Client-side Parsing trustworthy).
  - Tenant-admin-only via RLS auf `organization_imports`.
  - CSV-Inhalt darf keine HTML/JS-Tags ausführen — bei Render in Preview wird alles auto-escaped (React).
- **Privacy:** Class-2 (Geschäftskontext + Emails); Class-3 (PII detail) nicht erwartet, aber `description`-Spalte könnte freie Texte enthalten — kein Send an externe AI-Provider, kein Indexing in Sentry-Logs (`description` redacted).

## Surface-Inventar (geplant, finalisiert in /architecture)

## Tech Design — /architecture Lock (2026-05-13)

**Architektur-Entscheidung A1 — Upload/Preview/Commit bleibt synchron.** PROJ-63 verarbeitet maximal 5 MB und 10000 CSV-Zeilen in der Next.js API Route. Upload schreibt nur `organization_imports.status='preview'` plus JSON-Report; Commit schreibt erst nach Admin-Bestätigung in `locations`, `organization_units` oder die Person-FKs.

**Architektur-Entscheidung A2 — Locations-CSV ist ein zweites Feld im gleichen Upload.** Für `orgchart_hierarchy` akzeptiert `include_locations=true` zusätzlich `locations_csv`. Dadurch bleiben Location-Codes im selben Preview/Commit konsistent und es entsteht kein zweiter Job-Typ.

**Architektur-Entscheidung A3 — Cycle-Detection und Topological Sort im Backend-Service.** Die API validiert `unit_code`/`parent_code` komplett im Speicher gegen Import-Zeilen plus bestehende DB-Knoten. Self-Loops und Import-Zyklen werden vor dem Commit blockiert; Vorwärtsreferenzen bleiben erlaubt.

**Architektur-Entscheidung A4 — additive Schema-Erweiterung.** PROJ-62 bleibt kompatibel. `locations` bekommt `code` und `import_id`, `organization_units` bekommt `import_id`. Bestehende Selects werden additiv erweitert; keine bestehenden Felder, RLS-Policies oder UI-Kontrakte werden umbenannt.

**Architektur-Entscheidung A5 — Audit/Privacy.** `organization_imports` wird tenant-admin-only per RLS. Import-Start/Commit/Rollback erzeugen Import-Level-Audit-Zeilen mit `field_name='status'`; per-row Org-Änderungen laufen über die bestehenden Audit-Trigger. Person-Assignment-CSV enthält E-Mails, deshalb werden keine Roh-E-Mail-Adressen in structured logs geschrieben.

**Architektur-Entscheidung A6 — Rollback bewusst begrenzt.** Rollback löscht nur importierte, seit Commit nicht manuell veränderte Org-Knoten/Locations (`import_id`, `created_at >= committed_at`). Person-Assignment ist non-destructive und wird nicht automatisch zurückgesetzt.

**DB:**
- 1 Migration (`20260510120000_proj63_organization_csv_import.sql`)
- 1 neue Tabelle `organization_imports` + 2 FK-Spalten `import_id` an `organization_units`/`locations` + UNIQUE-Constraint + Audit-Trigger.

**API (5 Routen):**
- `POST /api/organization-imports/upload`
- `GET /api/organization-imports/[id]/preview`
- `POST /api/organization-imports/[id]/commit`
- `POST /api/organization-imports/[id]/rollback`
- `GET /api/organization-imports`

**Frontend:**
- `src/app/(app)/stammdaten/organisation/import/page.tsx` (3-Step-Wizard).
- `src/components/organization/import-upload-step.tsx`, `import-preview-step.tsx`, `import-commit-modal.tsx`, `import-history-list.tsx`.
- `src/lib/organization/csv-parsers.ts` (papaparse-Wrapper, pure für Tests).
- `src/lib/organization/import-validators.ts` (per-row Validators, pure).
- 1 Hook: `use-organization-imports`.

**Cron:**
- Vercel Cron `/api/cron/cleanup-organization-imports-preview` (Bearer `CRON_SECRET`), schedule `0 2 * * *`.

**Statische Assets:**
- `public/templates/orgchart_hierarchy.csv` (Beispiel-CSV).
- `public/templates/person_assignment.csv` (Beispiel-CSV).

## Out of Scope (deferred)

### PROJ-63b (next slice)
- **Excel/XLSX-Import** — falls Pilot-Tenants explizit Excel statt CSV-Export wollen.
- **Inkrementelle Diff-Imports** — "nur die geänderten Zeilen importieren".
- **Asynchroner Import-Job** für CSVs > 10000 Zeilen.

### PROJ-63c (later)
- **Auto-Sync mit Microsoft Entra ID** (gehört in PROJ-14-Connector-Pattern + neuer Slice).
- **Auto-Sync mit HR-Systemen** (gleicher Pfad).
- **KI-Erkennung von Org-Strukturen aus unstrukturierten Dokumenten** (PROJ-12-Erweiterung + neuer Slice).
- **Vendor-Import** — Vendors haben PROJ-15-eigenen UI-Pfad; PROJ-63 importiert keine Vendors.

### Explizit OUT für PROJ-63
- Offenes/dynamisches CSV-Schema mit Spalten-Mapping-UI.
- Multi-Sheet Excel mit verschiedenen Layouts auf einer Datei.
- Auto-Cleanup deaktivierter Knoten beim Re-Import.
- CSV-Upload für andere Stammdaten-Bereiche (Stakeholder/Resource haben eigene Slice falls gewünscht).

## Architektur-Forks für /architecture

Folgende Decisions sind locked durch CIA-Review + User-Bestätigung:

| # | Decision | Locked auf |
|---|---|---|
| 1 | CSV-Parser | `papaparse` (~14 KB, MIT) — neue Dep |
| 2 | Schema-Strategie | **2 fixe Layouts** (Hierarchy + Person-Assignment) statt offenes Spalten-Mapping |
| 3 | Hierarchie-Auflösung | `parent_code` (string) statt `parent_id` (UUID) |
| 4 | Dedup-Schlüssel | `(tenant_id, code)` UNIQUE |
| 5 | Workflow | Upload → Preview (no-write) → Commit (transactional) → optional Rollback |
| 6 | Rollback-Granularität | per `import_id`; nur Org-Knoten, **nicht** Person-Assignments |
| 7 | Async vs Sync | synchroner Import bis 10000 Zeilen; größere CSVs reject |
| 8 | Vendor-Import | nicht Teil dieses Slice |

Folgende **Architektur-Forks bleiben offen** für `/architecture`:

1. **Locations-Sub-CSV vs separate Upload**: zweiter File-Field neben Org-CSV vs eigener Upload-Step. Empfehlung: **zweiter File-Field im selben Upload-Step** (Pflicht: nur wenn `location_code` in Org-CSV referenziert wird, das nicht in DB existiert).
2. **Cycle-Detection beim Import**: in App-Layer mit Topological-Sort vs. DB-RPC. Empfehlung: **App-Layer im Validate-Step** (deterministisch, kein DB-Roundtrip pro Zeile).
3. **Per-Row-Audit beim Commit**: einzelne audit-rows pro Knoten vs. eine Sammel-row. Empfehlung: **einzelne**, weil PROJ-10 field-level audit erwartet.

## Risks

| Risiko | Schwere | Mitigation |
|---|---|---|
| Encoding-Probleme (Windows-1252 vs UTF-8) | MEDIUM | UTF-8 als Default; UI-Hinweis bei Encoding-Fehler |
| Vorwärts-Referenzen in `parent_code` führen zu falschen Insert-Reihenfolgen | MEDIUM | Topological-Sort im Validate-Step |
| Tenant-Admin commit-tet versehentlich falsche CSV | MEDIUM | Doppelt-Bestätigung; Rollback-Pfad |
| 10000-Zeilen-Sync-Limit zu klein für Großkonzern | LOW | PROJ-63b für async; bis dahin Empfehlung "splitten" |
| papaparse-Bug oder Edge-Case in CSV-Parsing | LOW | Wide-Adoption-Library, aber Pflicht-Tests für 5+ Edge-Case-CSVs |
| Person-Assignment matched falsche Person bei mehrfachen Stakeholdern mit selber Email | MEDIUM | `entity_kind`-Spalte deterministisch; Warnung in Preview |
| Concurrent Imports erzeugen Duplicate-Conflicts | LOW | UNIQUE-Constraint + Dedup-Strategie + Transaktion |

## Definition of Ready

- [x] PROJ-62 ist `Planned` (DB-Schema bekannt).
- [x] CSV-Layouts gelockt (2 fixe).
- [x] papaparse als neue Dep CIA-freigegeben.
- [x] Dedup-Schlüssel definiert (`tenant_id`, `code`).
- [ ] Beispiel-CSVs sind erstellt (Bestandteil von `/frontend`).
- [ ] Mengengerüst pro Pilot-Tenant geklärt (Annahme: < 5000 Org-Units, < 1000 Personen-Zuordnungen).

## Definition of Done

- [ ] Migration applied live; UNIQUE-Constraint auf `(tenant_id, code)` aktiv.
- [ ] 5 API-Routen + RLS + tenant-admin-Gate live.
- [ ] 3-Step-Wizard-UI live mit Upload, Preview, Commit, Rollback.
- [ ] Cron-Cleanup für preview-only-Imports aktiv.
- [ ] Beispiel-CSVs unter `/templates/...` ausgeliefert.
- [ ] Vitest grün (Parser + Validators pure-Tests + API-Mock-Tests).
- [ ] Playwright-E2E für Happy-Path: Upload → Preview → Commit (mit logged-in Fixture).
- [ ] Audit-Log schreibt für jeden Import (start, commit/rollback, per-Knoten).
- [ ] Live-Test mit realer Beispiel-CSV ≥ 100 Zeilen erfolgreich.
- [ ] Spec-Hand-off zu PROJ-57-β: Personen-Zuordnung kann nun bulk via CSV.

---

_Use `/architecture` next to lock the 3 open Architektur-Forks._
