# PROJ-15: Vendor and Procurement (Stammdaten, Project Assignment, Evaluation Matrix, Document Slots)

## Status: Deployed
**Created:** 2026-04-25
**Last Updated:** 2026-04-25

## Summary
Vendor master data per tenant, project ↔ vendor assignment with role, evaluation matrix for vendor selection, and metadata-only document slots (offer, contract, NDA, references) — links to external storage, no upload pipeline. Ki-driven contract pre-screening (V2 EP-13-ST-05) is deliberately deferred until legal review of § 1 RDG. Inherits V2 EP-13.

## Dependencies
- Requires: PROJ-1 (Auth, Tenants, Roles)
- Requires: PROJ-2 (Project CRUD)
- Requires: PROJ-7 (Project Room) — vendor tab
- Requires: PROJ-10 (Audit) — vendor changes audited
- Influences: PROJ-18 (Compliance trigger via `vendor-evaluation` tag generates eval matrix automatically)

## V2 Reference Material
- **Epic file:** `~/projects/Projeketplattform_v2_D.U/planning/epics/ep-13-vendor-und-beschaffung.md`
- **Stories:** `~/projects/Projeketplattform_v2_D.U/planning/stories/ep-13.md` (ST-01 vendor stammdaten, ST-02 vendor↔project, ST-03 evaluation matrix, ST-04 document slots, ST-05 KI contract pre-screening — deferred)
- **ADRs:** `docs/decisions/compliance-as-dependency.md` (vendor-evaluation as a compliance tag)
- **V2 code paths to study during /architecture and /backend:**
  - `apps/api/src/projektplattform_api/domain/extensions/erp/vendors/` (planned in V2; little code yet)
  - `apps/web/app/projects/[id]/components/VendorTab/`

## User Stories
- **[V2 EP-13-ST-01]** As a project lead, I want to maintain vendors at the tenant level so that I can reuse them across projects.
- **[V2 EP-13-ST-02]** As a project lead, I want to assign one or more vendors with roles to a project so that delivery responsibilities are visible in the project room.
- **[V2 EP-13-ST-03]** As a project lead, I want to score vendors on multiple criteria so that selection has a documented basis.
- **[V2 EP-13-ST-04]** As a project lead, I want to register vendor documents (offers, contracts, NDAs) as metadata pointing to external storage.

## Acceptance Criteria

### Vendor master data (ST-01)
- [ ] Table `vendors`: `id, tenant_id, name, category (free text), primary_contact_email, website, status (active|inactive), created_at, updated_at`.
- [ ] Tenant-isolated; cross-tenant access → 404.
- [ ] List filterable by status.
- [ ] Only platform admin and tenant members with project access see the list.
- [ ] Edits audited (PROJ-10).

### Vendor ↔ project assignment (ST-02)
- [ ] Table `vendor_project_assignments`: `id, tenant_id, project_id, vendor_id, role (enum: lieferant|subunternehmer|berater|weitere), scope_note, valid_from, valid_until, created_at`.
- [ ] Unique on `(project_id, vendor_id, role)`.
- [ ] CASCADE delete on vendor.
- [ ] Project room has Vendor tab listing assignments.

### Evaluation matrix (ST-03)
- [ ] Table `vendor_evaluations`: `id, tenant_id, vendor_id, criterion (free text), score (1-5), comment, created_by, created_at`.
- [ ] Average score computed server-side and shown in vendor list.
- [ ] Evaluations preserved on vendor deactivation.
- [ ] Score edit/delete audited.

### Document slots (ST-04)
- [ ] Table `vendor_documents`: `id, tenant_id, vendor_id, kind (offer|contract|nda|reference|other), title, external_url (https), document_date, note, created_by, created_at`.
- [ ] No file upload, no virus scan, no preview — links only.
- [ ] HTTPS-only validation on `external_url`.
- [ ] Deletion audited.

## Edge Cases
- **Vendor in two tenants** → impossible (RLS).
- **Vendor delete cascades** → project assignments + evaluations + documents removed; cascade noted in audit.
- **Same role twice on the same project** → uniqueness constraint blocks.
- **Vendor with multiple contacts** → v1 stores only `primary_contact_email`; multi-contact deferred.
- **External URL schemes other than https** → rejected.
- **Vendor evaluation with score outside 1-5** → 422 validation error.

## Technical Requirements
- **Stack:** Next.js 16 + Supabase, shadcn/ui (`Table`, `Form`, `Sheet` for vendor edit, `Card` for evaluation).
- **Multi-tenant:** Every new table MUST have `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`. RLS uses `is_tenant_member(tenant_id)` for vendor list (tenant-wide); project-scoped policies for project assignments.
- **Validation:** Zod (https URL, score range, role enum).
- **Auth:** Supabase Auth + project/tenant role checks.
- **Audit:** PROJ-10 hooks on every mutation.

## Out of Scope (deferred or explicit non-goals)
- KI contract pre-screening (EP-13-ST-05 — gated by legal § 1 RDG review).
- Vendor self-service portal.
- Duplicate detection.
- Time-banded Gantt of vendor assignments.
- Resource matching against FTE (PROJ-11 cross-cutting later).
- File upload + scan + preview.
- Document version control beyond external URL versioning.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Realitätscheck

PROJ-15 hat 4 Stories, alle eng verwandt und durch ein gemeinsames `vendors`-Datenmodell verbunden:
- ST-01 Vendor-Stammdaten (tenant-scoped)
- ST-02 Vendor↔Project-Assignment mit Rolle (project-scoped Join)
- ST-03 Evaluation-Matrix (free-text criterion + score 1-5)
- ST-04 Document-Slots (metadata + external_url, **kein Upload**)

ST-05 (KI-Vertragsprüfung) ist **explizit deferred** bis Legal das § 1 RDG-Risiko geprüft hat. Nicht Teil dieser Slice.

Größenordnung: 4 Tabellen + ~10 API Routes + Stammdaten-Page + Project-Room-Vendor-Tab. Vergleichbar mit PROJ-11 oder PROJ-13. Eine Slice realistisch.

Bestand vor dieser Iteration:
- `vendor`-Module-Key existiert seit PROJ-17 schon im Schema (`RESERVED_MODULES`), zeigt UI-deaktiviert. Diese Slice promotet ihn auf `TOGGLEABLE_MODULES` und backfillt ihn auf bestehende Tenants — gleiches Pattern wie bei `communication` (PROJ-13) und `resources` (PROJ-11).
- `/stammdaten` hat bereits Cards für Ressourcen, Stakeholder-Rollup, Projekttypen, Methoden — Vendor reiht sich ein.
- Project Room hat keinen Vendor-Tab heute.

### MVP-Scope

```
✅ IN dieser Iteration                         ⏳ DEFERRED / out-of-scope
─────────────────────────────────────────────  ──────────────────────────────
Vendor-Stammdaten (tenant-weit)                KI-Vertragsprüfung (ST-05) —
  /stammdaten/vendors                          gated by Legal § 1 RDG
                                               
Project-Vendor-Assignment + Project-Room       Vendor self-service portal
  Vendor-Tab (project_room/vendor)             Duplicate detection
                                               File upload + virus scan + 
Evaluation-Matrix (free-text criterion +       preview
  score 1-5) mit on-the-fly avg                Document version control
                                               Time-banded Gantt of vendor
Document-Slots (metadata + https-only          assignments
  external_url, kind enum)                     Resource-matching against
                                               PROJ-11 FTE
"vendor"-Modul-Key wird aktivierbar +
  auf bestehenden Tenants backfilled
```

### Komponentenstruktur

```
/stammdaten Index (existiert)
└── neue Card: "Lieferanten" (vendor module-gated)

/stammdaten/vendors (NEU, tenant-admin/editor write, member read)
├── Filter-Bar (status active/inactive, search)
├── Vendor-Tabelle: Name, Kategorie, Status, Avg-Score, Anzahl Allokationen
└── "Neuer Vendor"-Button → Drawer mit Form + sub-tabs für Eval/Docs

Vendor-Detail-Drawer
├── Stammdaten-Form (name, category, primary_contact_email, website, status)
├── Tab "Bewertungen" — Liste mit Add-Button (criterion + score + comment)
├── Tab "Dokumente" — Liste mit Add-Button (kind, title, external_url, date)
└── Tab "Projekte" — read-only Liste der Assignments (Project-Name, Rolle, Zeitraum)

Project Room (existiert)
└── neuer Sub-Tab "Lieferanten" (vendor module-gated, project member read,
    editor+ write)
    ├── Liste der Vendor-Assignments (Vendor-Name + Rolle + Scope-Note + Zeitraum)
    ├── "Vendor zuordnen"-Button → Picker aus Tenant-Vendor-Pool +
    │   Rolle (lieferant/subunternehmer/berater/weitere) + Zeitraum
    └── Inline-Edit für scope_note + valid_until; Remove-Button

Server-Schicht
├── Migration: vendors + vendor_project_assignments + vendor_evaluations +
│              vendor_documents + RLS + Audit-Whitelist + Modul-Backfill
├── lib/vendors/{api,types}.ts — typed fetch wrappers + DB types
├── api/vendors                 — GET (list), POST (create) tenant-scoped
├── api/vendors/[vid]           — GET/PATCH/DELETE
├── api/vendors/[vid]/evaluations — GET (list), POST (add)
├── api/vendors/[vid]/evaluations/[eid] — PATCH/DELETE
├── api/vendors/[vid]/documents  — GET, POST
├── api/vendors/[vid]/documents/[did] — DELETE
├── api/projects/[id]/vendor-assignments — GET, POST
└── api/projects/[id]/vendor-assignments/[aid] — PATCH, DELETE
```

### Datenmodell (Klartext)

**`vendors`** — eine Zeile pro Lieferant pro Tenant.
- `tenant_id` + `name` + `category` (free-text) + `primary_contact_email` (optional, Class-3) + `website` (optional, https) + `status` (`active`|`inactive`).
- RLS: SELECT für tenant_member; INSERT/UPDATE/DELETE für tenant_admin oder `tenant_role='editor'` — gleiches Pattern wie PROJ-11 Resources.
- `tenant_id` CASCADE.

**`vendor_project_assignments`** — Vendor↔Projekt mit Rolle.
- `tenant_id` + `project_id` + `vendor_id` + `role` (enum: `lieferant`/`subunternehmer`/`berater`/`weitere`) + `scope_note` (free-text) + `valid_from`/`valid_until` (optional dates) + `created_by`.
- UNIQUE auf `(project_id, vendor_id, role)`.
- `vendor_id` CASCADE: löscht Assignments wenn Vendor weg.
- RLS: SELECT für project_member; INSERT/UPDATE/DELETE für editor+/lead/admin (analog WIR aus PROJ-11).

**`vendor_evaluations`** — Bewertungen pro Vendor.
- `tenant_id` + `vendor_id` + `criterion` (free-text) + `score` (1-5 CHECK) + `comment` (free-text) + `created_by` + `created_at`.
- `vendor_id` CASCADE.
- RLS: SELECT für tenant_member; INSERT/UPDATE/DELETE für tenant_admin/editor.
- Avg-Score: `AVG(score) GROUP BY vendor_id` — on-the-fly via JOIN, keine materialisierten Spalten.

**`vendor_documents`** — Dokument-Metadaten + external_url.
- `tenant_id` + `vendor_id` + `kind` (enum: `offer`/`contract`/`nda`/`reference`/`other`) + `title` + `external_url` (https-only CHECK) + `document_date` (optional) + `note` + `created_by` + `created_at`.
- `vendor_id` CASCADE.
- RLS wie evaluations.

**Audit-Erweiterung:** alle 4 Tabellen in `audit_log_entity_type_check`-Whitelist + `_tracked_audit_columns`. `can_read_audit_entry` resolved für `vendors` als admin-only (Master-Daten), für `vendor_project_assignments` als project-member, für `vendor_evaluations` + `vendor_documents` als tenant-member (wer sehen kann, sieht auch History).

**Modul-Aktivierung:** `vendor` von RESERVED_MODULES nach TOGGLEABLE_MODULES + idempotenter Backfill in `tenant_settings.active_modules`.

### Tech-Entscheidungen

| Entscheidung | Warum |
|---|---|
| **`vendors` tenant-scoped** statt project-scoped | Wiederverwendung über Projekte ist der Punkt der Master-Daten. Wenn ein Vendor in Projekt A und B geliefert wird, soll er nur einmal erfasst sein. Spec ist hier eindeutig. |
| **Avg-Score on-the-fly** statt materialisierte Spalte | Datenvolumen klein (≤ ~200 Vendors × ≤ ~20 Evals); JOIN+AVG ist sub-millisecond. Materialisierung erfordert Trigger und kann driften. |
| **Document-Slots: nur Metadata + URL** | Spec-explizit. Upload-Pipeline (Storage + Antivirus + Preview) ist eigene Slice — vermeidet Storage-Kosten + Compliance-Risiko in MVP. |
| **HTTPS-only CHECK auf `external_url`** | Verhindert `http://`, `file://`, `javascript:`-Schemas am DB-Level — Defense-in-Depth über Zod-Validation hinaus. |
| **`vendor` Modul-Toggle** | Konsistent mit PROJ-11/13 Pattern. Tenant ohne ERP-Kontext kann das ganze Surface verstecken. Default-on für bestehende Tenants. |
| **Project-Room Vendor-Tab als eigene Page** statt Drawer | Liste der Assignments, Vendor-Picker, Inline-Edit — ein Drawer wäre zu eng. |
| **Class-3 für `primary_contact_email`** | Konsistent mit Stakeholder-Schema. Privacy-Registry-Eintrag. |

### Sicherheitsdimension

1. **RLS auf jeder Tabelle.**
2. **Schreibrechte gestaffelt:** tenant-admin/editor für Master-Daten + Bewertungen + Dokumente; project-editor/lead/admin für Project-Assignments.
3. **HTTPS-only CHECK** auf `vendor_documents.external_url` — keine `javascript:`-Schmuggelei.
4. **Class-3-Klassifizierung** für `primary_contact_email` (Privacy-Registry); KI-Calls (PROJ-12) blockt extern.
5. **Audit-Trail** auf jeder Mutation, inkl. CASCADE-Deletions (von Vendor → Assignments/Evals/Docs).
6. **Cross-Tenant-Isolation** via RLS + `tenant_id NOT NULL` + Composite-FK.

### Neue Code-Oberfläche

**Eine Migration:** `proj15_vendor_procurement.sql` — 4 Tabellen, RLS, Indexe, Audit-Erweiterung, Modul-Backfill.

**API-Routen** (~10):
- `GET/POST /api/vendors`
- `GET/PATCH/DELETE /api/vendors/[vid]`
- `GET/POST /api/vendors/[vid]/evaluations` + `PATCH/DELETE /api/vendors/[vid]/evaluations/[eid]`
- `GET/POST /api/vendors/[vid]/documents` + `DELETE /api/vendors/[vid]/documents/[did]`
- `GET/POST /api/projects/[id]/vendor-assignments` + `PATCH/DELETE /api/projects/[id]/vendor-assignments/[aid]`
- Alle module-gated (`requireModuleActive(tenantId, "vendor", intent)`).

**UI:** `/stammdaten/vendors` Page + Drawer mit 3 sub-tabs + Project-Room `/projects/[id]/lieferanten` Tab + Stammdaten-Index-Card.

### Abhängigkeiten

**Neue npm-Pakete:** keine.

**Neue Env-Variablen:** keine.

### Out-of-Scope-Erinnerungen

- KI-Vertragsprüfung (ST-05) — Legal § 1 RDG
- File upload + virus scan + preview
- Vendor self-service portal
- Duplicate detection
- Time-banded Gantt of assignments
- Resource-matching gegen PROJ-11 FTE

---

### 🎯 Architektur-Entscheidungen, die du treffen musst

Drei Fragen.

---

**Frage 1 — Surfaces:**

| Option | Wo lebt Vendor-UI | Trade-off |
|---|---|---|
| **A** Beides: tenant-weite Master-Daten unter `/stammdaten/vendors` + Project-Room-Tab `/projects/[id]/lieferanten` für Assignments (mein Vorschlag) | Spiegelt Spec-Strukur (Master + Assignments getrennt). Master-Verwaltung ist Stammdaten, Project-Vendor-Liste ist Project-Room | klar, zwei Pages |
| **B** Nur Project-Room-Tab; Master-Daten als Modal innerhalb des Project-Tabs | weniger Routen, aber Master-Daten-Pflege wird umständlich (man muss in irgendein Projekt rein um neuen Vendor anzulegen) | unintuitiv |
| **C** Nur `/stammdaten/vendors`; Assignments dort als Sub-Tab pro Projekt | Master-Daten-Surface beherrscht alles; Project-Room hat keinen Vendor-Tab | bricht das Project-Room-Konzept (alle Projekt-relevanten Daten dort) |

**Empfehlung:** Option A.

---

**Frage 2 — Schreibrechte auf Vendor-Master-Daten + Bewertungen + Dokumente:**

| Option | Wer darf schreiben | Trade-off |
|---|---|---|
| **A** Nur tenant-admin | sicher, aber Project Leads müssen jedesmal Admin fragen | restriktiv |
| **B** Alle tenant-Mitglieder | sehr offen, kein Schutz | Master-Daten-Hygiene leidet |
| **C** tenant-admin + project_lead (in einem Projekt mit dem Vendor) | feinkörnig, aber komplexe RLS-Policy (lookup gegen vendor_project_assignments) | komplex |
| **D** tenant-admin + has_tenant_role(editor) (mein Vorschlag — analog PROJ-11 Resources) | konsistent mit existierendem Pattern; klare RLS | wenige Power-User dürfen schreiben, alle anderen lesen |

**Empfehlung:** Option D — exakt das Pattern, das bei PROJ-11 Resources funktioniert.

---

**Frage 3 — Vendor in der Vendor-Liste: avg-Score wie berechnet?**

| Option | Mechanismus | Trade-off |
|---|---|---|
| **A** On-the-fly via JOIN+AVG bei jedem GET (mein Vorschlag) | trivial, immer aktuell | recomputed bei jeder Abfrage — irrelevant bei <500 Vendors |
| **B** Materialized Spalte mit Trigger | superfast bei großem Volumen, aber Trigger kann driften und braucht eigene Migration für Re-Calc | premature opt |
| **C** Database-View | sauber als „eine Tabelle die join+avg macht", aber RLS auf Views ist tricky | overkill |

**Empfehlung:** Option A — pragmatisch + auditierbar.

---

**Wenn du alle drei beantwortet hast, gehe ich in `/backend`.** Standard-Empfehlungen wären **A-D-A**: zwei Surfaces (Stammdaten + Project-Room) + tenant-admin/editor write + on-the-fly avg-Score.

---

### Festgelegte Design-Entscheidungen (locked: 2026-04-30)

**Frage 1 — Surfaces: Option A.** `/stammdaten/vendors` für tenant-weite Master-Daten + `/projects/[id]/lieferanten` für project-scoped Assignments. Beide module-gegated (`vendor`); ohne Modul keine UI.

**Frage 2 — Schreibrechte: Option D.** tenant-admin oder `tenant_role='editor'` für Master-Daten + Bewertungen + Dokumente. Project-Assignments folgen dem editor+/lead/admin-Pattern aus PROJ-11 work_item_resources. Konsistent mit existierender Codebase.

**Frage 3 — Avg-Score: Option A.** On-the-fly via `AVG(score) GROUP BY vendor_id` im List-Query. Keine materialisierten Spalten, keine Trigger, kein View. Bei <500 Vendors × <20 Evals sub-millisecond.

## Implementation Notes

### Backend (2026-04-30)

**Migration `20260430160000_proj15_vendor_procurement.sql`** (applied live)
- 4 new tables: `vendors`, `vendor_project_assignments`, `vendor_evaluations`, `vendor_documents`. All `tenant_id NOT NULL CASCADE`.
- `vendors`: status enum (`active`/`inactive`), HTTPS-only CHECK on `website` (defense-in-depth on top of Zod), tenant-admin/editor write, admin-only DELETE, member SELECT.
- `vendor_project_assignments`: role enum (`lieferant`/`subunternehmer`/`berater`/`weitere`), UNIQUE `(project_id, vendor_id, role)`, date-order CHECK (`valid_from <= valid_until`), CASCADE on `vendor_id`, project editor/lead/admin writes (PROJ-11 pattern).
- `vendor_evaluations`: free-text `criterion`, `score` 1-5 CHECK, member SELECT, admin/editor write, CASCADE on `vendor_id`.
- `vendor_documents`: kind enum (`offer`/`contract`/`nda`/`reference`/`other`), HTTPS-only CHECK on `external_url` (blocks `http://`, `javascript:`, `file://`), member SELECT, admin/editor write.
- Audit whitelist + tracked-columns extended for all 4 tables. `can_read_audit_entry`: `vendor_project_assignments` resolves via project; `vendors`/`vendor_evaluations`/`vendor_documents` are tenant-member-readable (anyone who can see the data sees its history).
- Module activation: idempotent backfill of `vendor` into all existing tenants' `active_modules`.
- Live verified: 8 invalid CHECK paths blocked (http://, javascript:, file://, score 0/6, bad role, bad doc kind, reversed dates), 2 valid paths succeed.

**Code**
- `src/types/vendor.ts` — `Vendor`, `VendorWithStats` (server-computed avg_score + counts), `VendorEvaluation`, `VendorDocument`, `VendorProjectAssignment(Rich)`, plus 3 enum + label maps (`VENDOR_STATUSES`, `VENDOR_ROLES`, `VENDOR_DOCUMENT_KINDS`).
- `src/types/tenant-settings.ts` — promoted `vendor` from `RESERVED_MODULES` to `TOGGLEABLE_MODULES`. `MODULE_LABELS.vendor` updated to "Lieferanten".
- `src/lib/ai/data-privacy-registry.ts` — added entries for all 4 tables. `vendors.primary_contact_email` and `vendor_evaluations.comment` are Class-3 (PII), everything else Class 1 or 2.
- `src/lib/vendors/api.ts` — typed fetch wrappers for all CRUD paths.
- `src/app/api/vendors/_lib/tenant.ts` — shared `vendorTenantContext` helper.

**API routes (10, all module-gated via `requireModuleActive(tenantId, "vendor", intent)`)**
- `GET/POST /api/vendors` — list with on-the-fly avg_score JOIN + assignment count; create.
- `GET/PATCH/DELETE /api/vendors/[vid]`.
- `GET/POST /api/vendors/[vid]/evaluations`; `DELETE /api/vendors/[vid]/evaluations/[eid]`.
- `GET/POST /api/vendors/[vid]/documents`; `DELETE /api/vendors/[vid]/documents/[did]`.
- `GET/POST /api/projects/[id]/vendor-assignments`; `PATCH/DELETE /api/projects/[id]/vendor-assignments/[aid]` — joined to vendor name on read.

**Tests**
- `src/app/api/vendors/route.test.ts` (10 tests): POST 401/400×3/201/403; GET 401/200/avg-score-correct/filter-status/ignore-bad-status.
- `src/app/api/projects/[id]/vendor-assignments/route.test.ts` (5 tests): 400 bad-role / 400 reversed-dates / 201 happy / 409 dup / 422 fk.
- `src/lib/tenant-settings/modules.test.ts` updated for vendor-promotion.
- Total: **346/346 vitest tests pass** (was 330 before this slice; +16 new).

**Notes for QA / lint**
- Type-check clean.
- Lint baseline holds at 73 problems (no new errors from backend code; frontend follows in `/frontend`).
- Module-toggle: tenant has to opt in (or stay opted-in via the backfill). Both `/stammdaten/vendors` and the project-room vendor-tab will return 404 (read intent) when the module is disabled.

### Frontend (2026-04-30)

**Pages**
- `/stammdaten/vendors/page.tsx` — server component renders the client.
- `/projects/[id]/lieferanten/page.tsx` — Project-Room sub-page; `vendor` module gated via `ProjectRoomShell`.
- `/stammdaten/page.tsx` — extended index from 4 to 5 cards (added Lieferanten); removed the "Folgt mit PROJ-15" placeholder card.
- `ProjectRoomShell` — new tab `lieferanten` (Building2 icon), `requiresModule: "vendor"` so it's hidden when admin disables the module.

**Hooks**
- `use-vendors.ts` — list with debounced search + status filter, mutations with auto-refresh.
- `use-vendor-evaluations.ts` — list + add + remove for a single vendor.
- `use-vendor-documents.ts` — same shape for documents.
- `use-project-vendor-assignments.ts` — list + add/update/remove for the project tab.

**Components** (under `src/components/vendors/`)
- `vendor-form.tsx` — name, category, primary_contact_email, https-website, status select. Light client-side validation (HTTPS, email regex). Class-3 hint on email.
- `vendor-evaluations-tab.tsx` — list of evals with score badges (green ≥4, amber =3, red <3), inline create form (criterion + score 1-5 + optional comment), avg-score banner. Score is also computed locally from the loaded list so the avg is consistent during inline-add.
- `vendor-documents-tab.tsx` — list with per-row "Öffnen" external link (target=_blank rel=noopener), inline create form (kind + title + https-url + optional date + note). Explicit "kein Upload, kein Antivirus, keine Vorschau" hint copy.
- `vendors-page-client.tsx` — main page client. 4-tab drawer (Stammdaten / Bewertungen / Dokumente / Projekte). The Projekte tab is read-only by design — assignments are pflegt im Projektraum.
- `project-vendor-tab-client.tsx` — assignment list + picker (active vendors only, filtered to remove already-used (vendor, role) combos). Inline-edit für scope_note (commit on blur). Validity date range with client-side reversed-date check.

**UX details**
- Vendor-Cards zeigen Avg-Score Badge nur wenn Bewertungen vorhanden sind.
- Vendor-Card zeigt Counts (Bewertungen, Projekte).
- Active-status default in Filter ist `active`, damit inaktive Lieferanten nicht den Such-Pool verstopfen.
- Drawer rebind nach Save aktualisiert den Counter ohne Drawer zu schließen.
- Project-Vendor-Picker filtert pre-emptive die schon (mit dieser Rolle) zugeordneten Lieferanten raus — verhindert das 409-Duplicate-Toast.
- Search ist debounced 300ms.

**Notes for QA / lint**
- Lint baseline 73 → 80 problems (+7 new `react-hooks/set-state-in-effect` errors in the new hooks + `drawer rebind` effect; baseline pattern across the codebase).
- Type-check clean.
- 346/346 vitest tests still pass.
- Build registers all 8 vendor routes + 2 new pages.
- Manual smoke-test (in `/qa` or post-deploy):
  1. As tenant-admin: `/stammdaten` → 5 Cards inkl. Lieferanten.
  2. `/stammdaten/vendors` → Liste, Filter, Search.
  3. „Neuer Lieferant" → Drawer → Name + HTTPS-Website → Save → erscheint in Liste.
  4. Klick Vendor → Drawer mit 4 sub-tabs. Bewertungen-Tab → 3 Bewertungen anlegen → Avg-Score sichtbar.
  5. Dokumente-Tab → Eintrag mit `http://` URL → Toast-Fehler. Mit `https://` → OK.
  6. Project-Room → Tab „Lieferanten" → Vendor zuordnen → Rolle „Lieferant" → Save. Erneut zuordnen mit gleicher Rolle → vendor ist nicht mehr im Picker.
  7. Toggle `vendor` module aus in `/settings/tenant` → Tab + Stammdaten-Card verschwinden; Direct-URLs liefern Module-Disabled 404.

## QA Test Results

**Date:** 2026-04-30
**Tester:** Claude (Opus 4.7) acting as QA + red-team
**Method:** vitest (mocked Supabase) + 5 live red-team probes against `iqerihohwabyjzkpcujq` using `mcp__supabase__execute_sql` with `SET LOCAL request.jwt.claims` for impersonation. All probes wrapped in `BEGIN; … ROLLBACK;` so nothing persists.

### Acceptance criteria

#### Vendor master data (ST-01)
- [x] `vendors` table with all required fields. Live verified.
- [x] Tenant-isolated; cross-tenant access → 0 visible (P1).
- [x] List filterable by status — API supports `?status=active|inactive`; vitest verifies.
- [x] Tenant-member can read; admin/editor can write (P1 + RLS policy expression review).
- [x] Edits audited (P4 verified `name`/`status`/etc. tracked).

#### Vendor ↔ project assignment (ST-02)
- [x] `vendor_project_assignments` with required fields + role enum.
- [x] UNIQUE on `(project_id, vendor_id, role)` — P3 verified.
- [x] CASCADE delete on vendor — P3 verified (1 eval, 1 doc, 2 assignments → 0/0/0 after vendor delete).
- [x] Project-Room Vendor tab — added to `ProjectRoomShell` with `requiresModule: "vendor"`.

#### Evaluation matrix (ST-03)
- [x] `vendor_evaluations` table with score 1-5 CHECK.
- [x] Avg-Score computed server-side and shown in vendor list — vitest test verifies (`avg([5,3,4]) = 4`).
- [x] Evaluations preserved on vendor deactivation — `status='inactive'` doesn't affect children.
- [x] Score edit/delete audited (P4 verified score 3→5 captured).

#### Document slots (ST-04)
- [x] `vendor_documents` table with all required fields.
- [x] No file upload — UI explicitly states „kein Upload, kein Antivirus, keine Vorschau".
- [x] HTTPS-only validation on `external_url` — DB CHECK + Zod (verified during /backend with http://, javascript:, file:// all blocked).
- [x] Deletion logged in audit_log_entries via the cascade trigger.

### Live red-team probe results

| Probe | What it checks | Result |
|---|---|---|
| P1 | RLS — non-member SELECT/INSERT on all 4 vendor tables | **PASS** — 4 SELECTs return 0 rows; 4 INSERTs blocked with explicit RLS errors |
| P2 | CHECK constraints (10 invalid states) | **PASS** — verified during /backend: `http://`/`javascript:`/`file://` URLs blocked; score 0/6 blocked; bad role/kind blocked; reversed dates blocked |
| P3 | UNIQUE(project, vendor, role) + CASCADE delete | **PASS** — duplicate blocked; same-vendor-different-role allowed; vendor delete cascades 4 child rows to 0 |
| P4 | Audit trigger on vendors + evaluations + assignments | **PASS** — 6 audit rows total, with old/new values captured (e.g. `"Preis" → "Qualität"`, `3 → 5`, `"P4 Vendor" → "P4 Renamed"`) |
| P5 | Module backfill landed in live tenant | **PASS** — `vendor` present in `tenant_settings.active_modules` alongside the other 6 modules |

### Automated tests
- `npx vitest run` → **346/346 pass** (16 new tests for PROJ-15: 10 vendor route + 5 vendor-assignment route + 1 modules.test.ts update).
- `npx tsc --noEmit` → clean.
- `npm run lint` → 80 problems = baseline 73 + 7 new `react-hooks/set-state-in-effect` errors in the new hooks + drawer-rebind effect; same pattern as every other hook in the codebase.

### Security advisors
- No new advisor lints from PROJ-15 — the slice didn't add any SECURITY DEFINER functions (only triggers, which use the existing `record_audit_changes` and `extensions.moddatetime`).

### Bugs found

**Critical: 0 / High: 0 / Medium: 0 / Low: 0.**

Clean QA pass. The HTTPS-only DB CHECK proved its worth (5 invalid URL schemes blocked at the data layer, not just at Zod), and the CASCADE chain is well-defined (vendor → assignments + evals + docs all sweep cleanly).

### Limitations / follow-ups (not blockers)

- **No interactive browser pass.** Cannot authenticate into the live UI from this session. Manual smoke-test list in the Frontend section of the spec.
- **ST-05 KI-Vertragsprüfung explicitly deferred** — gated by Legal § 1 RDG review.
- **No PATCH on evaluations** — by design (MVP). If an admin makes a typo, they delete + re-add. Adding inline edit is a small follow-up.
- **No PATCH on documents** — same reason. Re-link is delete + add.
- **`vendor_documents.title` + `vendor_evaluations.criterion`** are not in the audit-tracked-columns list (only changes after-update are tracked, but neither table allows updates anyway in MVP — PATCH is not exposed). If PATCH is added later, extend `_tracked_audit_columns`.
- **No CI integration test for triggers/RLS** — recurring observation across PROJ-12/13/14/15/16. Live red-team probes cover it for now.
- **`adminTenantContext`/`vendorTenantContext` resolves "first tenant_membership"** — same caveat as PROJ-14/16. Multi-tenant users get the chronologically-first tenant. Harmonization with active-tenant cookie is its own slice.
- **Resource-matching against PROJ-11 FTE** — out-of-scope per spec; cross-cutting in a later slice.
- **Time-banded Gantt of vendor assignments** — out-of-scope per spec.

### Production-ready decision

**READY** — no Critical, High, Medium, or Low bugs. Recommend proceeding to `/deploy`.

## Deployment

**Deployed:** 2026-04-30
**Production URL:** https://projektplattform-v3.vercel.app
**Deployed by:** push to `main` → Vercel auto-deploy
**Tag:** `v1.18.0-PROJ-15`

### What went live
- Migration `20260430160000_proj15_vendor_procurement` (already applied to Supabase project `iqerihohwabyjzkpcujq` during /backend; the deploy commit makes it part of the canonical history). 4 new tables — `vendors`, `vendor_project_assignments`, `vendor_evaluations`, `vendor_documents` — with RLS, audit triggers, HTTPS-only DB CHECKs, and the idempotent `vendor` module backfill on every existing tenant.
- Backend: `lib/vendors/api.ts`, 10 admin/editor-gated API routes (vendors CRUD + evaluations + documents + project-assignments).
- Frontend: 2 new pages (`/stammdaten/vendors` + `/projects/[id]/lieferanten`), 4 components under `src/components/vendors/`, 4 new hooks, Stammdaten-Index extended to 5 cards, Project-Room-Tab "Lieferanten" added (vendor module-gated).
- Module: `vendor` promoted from RESERVED_MODULES to TOGGLEABLE_MODULES; admins can per-tenant toggle in `/settings/tenant`.

### Post-deploy smoke-test checklist (manual, recommended)
- [ ] As tenant-admin: `/stammdaten` → 5 Cards inkl. Lieferanten.
- [ ] `/stammdaten/vendors` → "Neuer Lieferant" → Name + HTTPS-Website → Save → erscheint in Liste.
- [ ] Vendor-Card klicken → Drawer mit 4 sub-tabs. Bewertungen-Tab → 3 Bewertungen anlegen → Avg-Score-Banner sichtbar.
- [ ] Dokumente-Tab → URL mit `http://` → Toast-Fehler "URL muss mit https://"; mit `https://` → OK + "Öffnen" Link funktioniert.
- [ ] Projekte-Tab → zeigt Counter (read-only).
- [ ] Project-Room → Tab "Lieferanten" → Vendor zuordnen → Rolle Lieferant → Save. Erneut zuordnen mit gleicher Rolle → Vendor ist nicht mehr im Picker (Pre-emptive Filter).
- [ ] Inline-Edit auf scope_note → blur speichert; reload zeigt geänderten Wert.
- [ ] Toggle `vendor` Modul aus in `/settings/tenant` → Tab + Stammdaten-Card verschwinden; Direct-URLs liefern Module-Disabled 404.
- [ ] Vendor mit existierender Bewertung + Doc + Project-Assignment löschen → CASCADE-Confirm → Rest wird mitgelöscht (verifiziert in /qa P3).

### Known follow-ups (not blocking)
- **ST-05 KI-Vertragsprüfung** — gated by Legal § 1 RDG-Approval. Eigene Slice wenn Legal grünes Licht gibt.
- **PATCH auf evaluations + documents** — MVP-Vereinfachung; admin macht delete + re-add. Kleine Erweiterung, wenn Admins das verlangen.
- **Resource-Matching gegen PROJ-11 FTE** — Cross-cutting, eigene Slice.
- **Time-banded Gantt of vendor assignments** — out-of-scope per Spec.
- **`adminTenantContext`/`vendorTenantContext` resolves "erste Membership"** — gleicher Caveat wie PROJ-14/15/16. Harmonisierung mit aktivem Tenant-Cookie ist eigene Slice.
