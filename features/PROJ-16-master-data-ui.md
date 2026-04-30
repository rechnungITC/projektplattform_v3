# PROJ-16: Master Data UI — Users, Stakeholder Rollup, Project Type & Method Catalog Overrides

## Status: Deployed
**Created:** 2026-04-25
**Last Updated:** 2026-04-25

## Summary
Tenant-admin UI for editing master data without shell access: invite/manage users + memberships, tenant-wide read-only stakeholder rollup, project-type catalog overrides (additive deltas to code defaults), and method catalog enable/disable toggles. Inherits V2 EP-14.

## Dependencies
- Requires: PROJ-1 (Auth, Tenants, Roles)
- Requires: PROJ-4 (Platform Foundation: RBAC + project memberships)
- Requires: PROJ-6 (Project Type / Method catalog) — overrides target this
- Requires: PROJ-8 (Stakeholders) — rollup view aggregates these
- Requires: PROJ-13 (Email send for invites)

## V2 Reference Material
- **Epic file:** `~/projects/Projeketplattform_v2_D.U/planning/epics/ep-14-stammdaten-pflege.md`
- **Stories:** `~/projects/Projeketplattform_v2_D.U/planning/stories/ep-14.md` (ST-01 user UI, ST-02 stakeholder rollup, ST-03 project-type override, ST-04 method override)
- **V2 code paths to study during /architecture and /backend:**
  - `apps/web/app/stammdaten/benutzer/`, `stakeholder/`, `projekttypen/`, `methoden/`
  - `apps/api/src/projektplattform_api/routers/tenant_members.py`

## User Stories
- **[V2 EP-14-ST-01]** As a tenant admin, I want to invite users, set their tenant role, and deactivate users without DB access.
- **[V2 EP-14-ST-02]** As a tenant admin or PMO, I want a tenant-wide read-only stakeholder list with project participation so I see who is involved where.
- **[V2 EP-14-ST-03]** As a tenant admin, I want to extend or override project-type defaults (standard roles, required info, document templates) per tenant.
- **[V2 EP-14-ST-04]** As a tenant admin, I want to enable/disable methods for the tenant so my "no SAFe here" policy is enforced platform-wide.

## Acceptance Criteria

### User UI (ST-01)
- [ ] Page `/stammdaten/benutzer` (admin only).
- [ ] Invite a user (email + initial role) creates the auth user (Supabase Auth admin invite) and the tenant_membership row.
- [ ] List shows current tenant members: email, role, status, last login (if available), created_at.
- [ ] Inline role change.
- [ ] Deactivate a member: soft-delete the tenant_membership row, log to audit.
- [ ] Last admin protection (mirrors PROJ-1 invariant).
- [ ] Invite goes via PROJ-13 outbox channel.

### Stakeholder rollup (ST-02)
- [ ] Page `/stammdaten/stakeholder` (admin/PMO only).
- [ ] Tenant-wide list of all stakeholders, joined to their project list (one row per stakeholder, list of projects).
- [ ] Group/sort by role, org unit, influence.
- [ ] Filter active/inactive, role, org unit.
- [ ] **Read-only** — no edits at this scope (per V2 ADR `stakeholder-vs-user.md`); edits stay project-scoped (PROJ-8).
- [ ] CSV export.

### Project-type override (ST-03)
- [ ] Page `/stammdaten/projekttypen` (admin only).
- [ ] List shows code-defined types (read-only base) with editable override layer.
- [ ] New table `tenant_project_type_overrides`: `tenant_id, type_key, overrides (JSONB), updated_by, updated_at`.
- [ ] Allowed override fields whitelisted: `standard_roles`, `required_info`, `document_templates`. NOT `type_key` or structural metadata.
- [ ] "Inherited" badges on fields not overridden.
- [ ] "Reset to default" button per field.
- [ ] Audit on all changes.

### Method override (ST-04)
- [ ] Page `/stammdaten/methoden` (admin only).
- [ ] List shows methods with `enabled` toggles per tenant.
- [ ] Override stored in `tenant_method_overrides` (`tenant_id, method_key, enabled`).
- [ ] Disabled methods hidden in wizard (PROJ-5).
- [ ] Existing projects on a now-disabled method continue working untouched.
- [ ] At least one method must remain enabled.
- [ ] Audit on changes.

## Edge Cases
- **Self-demotion of the last tenant_admin** → blocked (DB trigger + API check).
- **Override added then default code value changes** → if user explicitly overrode, override stays; if "inherited", new default applies.
- **Disabling all methods** → blocked (422).
- **Cross-tenant view of stakeholder rollup** → RLS blocks.
- **Member with multiple memberships across tenants** → each tenant's UI shows only its own row.
- **Invite to an email that already has an auth.users row** → uses existing user, just adds the membership.
- **Override deleted while a project uses it** → project keeps its current state; future references resolve to base default.

## Technical Requirements
- **Stack:** Next.js 16 + Supabase, shadcn/ui (`Table`, `Sheet`, `Form`, `Switch`, `DropdownMenu`).
- **Multi-tenant:** All override tables MUST have `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`. RLS: tenant_admin only.
- **Validation:** Zod schemas; whitelist enforcement on override JSONB.
- **Auth:** Supabase Auth + tenant_admin role check.
- **Audit:** PROJ-10 hooks for every change.

## Out of Scope (deferred or explicit non-goals)
- Free creation of brand-new project types via UI (still code-delivery only).
- Free method definition.
- Tenant-wide stakeholder edit (stays per-project per ADR).
- SSO/OIDC.
- Self-service signup.
- Free role definition (roles are still enum-fixed in PROJ-1/PROJ-4).

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Realitätscheck

PROJ-16 hat 4 Stories. Wichtigster Befund vor dem Design:

**ST-01 (User-UI) ist fast komplett von PROJ-1 abgedeckt.** Existierend in `/settings/members`:
- Invite (`/api/tenants/[id]/invite/route.ts` mit Supabase Auth Admin API)
- Member-Liste mit Rolle, Status
- Inline role change
- Deactivate via revoke-member-dialog
- Last-admin protection (DB trigger `enforce_admin_invariant`)

Lücken zur Spec-AC:
- `last_login` Anzeige fehlt (auth.users.last_sign_in_at lesen)
- Spec sagt „Invite goes via PROJ-13 outbox channel". Heute schickt Supabase Auth die Email direkt; ein Outbox-Audit-Eintrag wäre sinnvoll als Audit-Spur.

**ST-02 (Stakeholder-Rollup) ist neu** — heute ist Stakeholder-View streng project-scoped. Tenant-weite Read-only Sicht für Admin/PMO existiert nicht.

**ST-03 (Project-Type-Override) und ST-04 (Method-Toggle) sind neu.** Beide Catalogs (`PROJECT_TYPE_CATALOG`, `METHOD_TEMPLATES`) sind code-only — Overrides müssen sich per `key` darauf beziehen.

Dazu: Top-Nav hat zwar `/stammdaten` (Resources-Card aus PROJ-11), aber keine Sub-Pages für Benutzer/Stakeholder/Projekttypen/Methoden. Spec-Routen sind alle neu (außer `/settings/members`, das bleibt wo's ist).

### MVP-Scope

```
✅ IN dieser Iteration                          ⏳ DEFERRED / out-of-scope
─────────────────────────────────────────────  ──────────────────────────────
Stakeholder-Rollup tenant-weit                 Free creation of project types
  /stammdaten/stakeholder + CSV-Export         Free method definition
                                               Tenant-wide Stakeholder-Edit
Project-Type-Override                          (bleibt project-scoped)
  /stammdaten/projekttypen +                   SSO/OIDC + self-service signup
  tenant_project_type_overrides Tabelle        Free role definition
  + JSONB-Whitelist
                                               Project-Type-Override-Anwendung
Method-Toggle                                  in Wizard PROJ-5: implementiert,
  /stammdaten/methoden +                       aber Wizard-Filtering durch
  tenant_method_overrides Tabelle              method-toggle ist eine separate
  + "min ein aktives Method" CHECK             Wizard-Slice (kein migrationsweg)

ST-01 Lücken:
  + last_login Anzeige (auth.users.last_sign_in_at)
  + optional: Outbox-Audit-Eintrag bei Invite
```

### Komponentenstruktur

```
Top-Nav „Stammdaten" (existiert, admin-only)
└── /stammdaten (Index — bekommt 3 neue Section-Cards plus die existierende Resources-Card)
    ├── Ressourcen (PROJ-11)
    ├── Stakeholder Rollup (NEU)
    ├── Projekttypen (NEU, admin-only)
    └── Methoden (NEU, admin-only)

/stammdaten/stakeholder (NEU, admin/PMO)
  ├── Filter-Bar (active, role, org_unit, search)
  ├── Tabelle: Stakeholder (Zeilen) × Spalten (Name, Rolle, Org-Unit, Influence,
  │   Active, Projekt-Liste mit Anzahl + Tooltip)
  ├── Sort-Header (Name / Rolle / Org-Unit / Influence)
  └── CSV-Export-Button

/stammdaten/projekttypen (NEU, admin)
  ├── Liste pro Project-Type-Key
  ├── Pro Type: Karte mit Read-only-Defaults + 3 editable Felder
  │   (standard_roles, required_info, document_templates)
  ├── „Inherited"-Badges auf Feldern ohne Override
  └── „Reset to default"-Button pro Feld

/stammdaten/methoden (NEU, admin)
  ├── Liste pro Method-Key (7 heute: scrum, kanban, safe, waterfall, pmi,
  │   prince2, vxt2)
  ├── Switch „enabled" pro Methode
  └── 422-Fehler wenn alle deaktiviert würden („min ein aktives Method")

/settings/members (existiert, kleine Ergänzungen)
  └── neue Spalte „Letzter Login" + optionale Outbox-Audit-Eintrag bei Invite

Server-Schicht
├── Migration: tenant_project_type_overrides + tenant_method_overrides
│              + DB-Trigger für „min ein aktives Method"
├── lib/project-types/overrides.ts — read+write helper
├── lib/method-templates/overrides.ts — read+write helper
├── lib/master-data/api.ts — typed fetch wrappers für die UI
├── api/master-data/project-type-overrides/[key]/route.ts — GET/PUT/DELETE
├── api/master-data/method-overrides/[key]/route.ts — GET/PUT
├── api/master-data/stakeholders/route.ts — tenant-weiter Rollup mit JOIN
└── api/master-data/stakeholders/export/route.ts — CSV-Export
```

### Datenmodell (Klartext)

**`tenant_project_type_overrides`**
- `tenant_id` + `type_key` (composite unique)
- `overrides` JSONB — strikt whitelisted: `standard_roles`, `required_info`, `document_templates`
- `updated_by`, `updated_at`
- RLS: tenant_admin only
- Audit: PROJ-10-getrackt (Whitelist erweitert um `tenant_project_type_overrides`)

**`tenant_method_overrides`**
- `tenant_id` + `method_key` (composite unique)
- `enabled` boolean
- `updated_by`, `updated_at`
- RLS: tenant_admin only
- Audit: PROJ-10-getrackt
- DB-Trigger: vor jedem UPDATE/INSERT, prüft dass nicht alle Methoden für den Tenant disabled werden würden — sonst RAISE EXCEPTION mit 422-konvertierbarem Code

**Stakeholder-Rollup** — keine neue Tabelle. View-äquivalent als Application-Query: `SELECT s.*, array_agg(json_build_object('id', p.id, 'name', p.name)) as projects FROM stakeholders s LEFT JOIN projects p ON p.id = s.project_id WHERE s.tenant_id = $1 GROUP BY s.id`. Da `stakeholders.project_id NOT NULL` ist (PROJ-8), bekommen wir tatsächlich pro stakeholder-row genau ein Projekt — ein Stakeholder „Anna" in 3 Projekten erscheint als 3 Zeilen. Das ist konsistent mit V3's „Stakeholder ist project-scoped"-Modell. Die UI fasst optional client-seitig nach Name+Email zusammen, oder wir lassen es als „eine Zeile pro Stakeholder-Eintrag", was näher an der Datenrealität ist.

**Last-Login-Anzeige in `/settings/members`:** lesen aus `auth.users.last_sign_in_at` über die existierende admin-API (`/api/tenants/[id]/members`). Erfordert keine neue Tabelle.

### Tech-Entscheidungen

| Entscheidung | Warum |
|---|---|
| **ST-01 wird als „covered by PROJ-1" markiert** | `/settings/members` macht alles was die Spec-AC fordert; Duplikation auf `/stammdaten/benutzer` ist Verschwendung. Lücken (last_login + Outbox-Audit) als kleine Add-ons in der existierenden Page. |
| **Eigene Override-Tabellen** statt JSONB-Erweiterung von `tenant_settings` | Saubere Audit-Trails, JSONB-Whitelist klar erzwingbar, eigene CRUD-Routes. `tenant_settings` ist eh schon dicht mit modules + privacy + ai_provider + retention. |
| **JSONB-Whitelist serverseitig** mit Zod-Schema, nicht DB-side | Flexibilität für zukünftige Felder; DB-CHECK auf JSONB-Strukturen sind brittle. Zod-Schema in der API-Route lehnt unbekannte Top-Level-Keys mit 400 ab. |
| **„min 1 aktive Methode"-Invariant als DB-Trigger** | Spec-AC explizit. Application-side check wäre race-anfällig. Trigger raise mit klarem errcode → API mappt zu 422. |
| **Stakeholder-Rollup als Live-Query** statt View / Materialized View | Datenvolumen klein; RLS auf View komplex; Application-side Aggregation ist deterministisch und debugbar. |
| **CSV-Export server-side gerendert** (Streaming-Response) | Pattern aus PROJ-11 (Utilization-Report) wiederverwendet. RFC-4180 escaping, sortierte Spalten. |
| **Override-Pages als Top-Level-Stammdaten-Subroutes** | `/stammdaten/projekttypen` + `/stammdaten/methoden` reihen sich neben `/stammdaten/resources` und `/stammdaten/stakeholder`. Konsistent mit V2. |

### Sicherheitsdimension

1. **RLS** — Override-Tabellen tenant-admin-only; Stakeholder-Rollup-Query schon RLS-gefiltert über `is_project_member` aus PROJ-8 (admin sieht alles in seinem Tenant per `is_tenant_admin`).
2. **Whitelist-Enforcement auf Override-JSONB** — Zod im API-Route lehnt unerwartete Top-Level-Keys mit 400 ab. Kein generisches `Record<string, unknown>` an die DB.
3. **„min 1 aktive Methode"-DB-Trigger** — race-sicher; API-Route konvertiert die exception zu 422.
4. **Audit auf alles** — beide Override-Tabellen in `_tracked_audit_columns` + audit_changes_*-Trigger.
5. **CSV-Export** — admin-only, redaktiert Class-3-Felder optional (Stakeholder.contact_email/contact_phone) — siehe Frage 3.

### Neue Code-Oberfläche

**Eine Migration:** `proj16_master_data_overrides.sql` — zwei Tabellen, RLS, Trigger, Audit-Erweiterung.

**Drei API-Routen-Bereiche** (admin-gated):
- `/api/master-data/project-type-overrides/[key]` — GET, PUT, DELETE
- `/api/master-data/method-overrides/[key]` — GET, PUT
- `/api/master-data/stakeholders` (+ `/export`) — GET tenant-weiter Rollup, GET ?format=csv

**UI:** drei neue Pages unter `/stammdaten/*` + Stammdaten-Index-Update + kleine Ergänzungen in `/settings/members`.

### Abhängigkeiten

**Neue npm-Pakete:** keine.

**Neue Env-Variablen:** keine.

### Out-of-Scope-Erinnerungen (aus der Spec) + Zusätzlich

- Free creation of project types / methods (bleibt code-delivery)
- Tenant-wide stakeholder edit (bleibt project-scoped)
- SSO/OIDC, self-service signup
- **Wizard-Filtering durch Method-Toggle** — die Toggle-Tabelle ist da; Wizard liest sie aber noch nicht. Kleine Wizard-Slice nachgezogen.
- **Project-Type-Override im Wizard** — Override-Tabelle ist da; Wizard rendert weiterhin gegen den Code-Catalog. Nachfolge-Slice.

---

### 🎯 Architektur-Entscheidungen, die du treffen musst

Drei Fragen.

---

**Frage 1 — ST-01 Scope:**

| Option | Was passiert | Trade-off |
|---|---|---|
| **A** ST-01 als „covered by PROJ-1" markieren (Vorschlag) | Keine neue Page; ergänze `/settings/members` um last_login + optional Outbox-Audit-Eintrag bei Invite | Saubere Slice; keine Duplikation; AC-Statement in der Spec wird durchgekreuzt mit Verweis auf PROJ-1 |
| **B** `/stammdaten/benutzer` neu bauen, `/settings/members` lassen | Beide Pages existieren parallel | Spec-Wortlaut erfüllt, aber kognitive Last für Admins (zwei Stellen für dieselbe Aktion) |
| **C** `/settings/members` nach `/stammdaten/benutzer` verschieben | Alte Route 308-redirected | Saubere Konsolidierung, aber Routing-Refactor + Doc-Update für PROJ-1 |

**Empfehlung:** Option A.

---

**Frage 2 — Override-Persistenz:**

| Option | Mechanismus | Trade-off |
|---|---|---|
| **A** Eigene Tabellen pro Spec (Vorschlag) | `tenant_project_type_overrides` + `tenant_method_overrides`, eine Zeile pro Override | Saubere Audit-Trails, klare Schemas, eigene CRUD-Routes |
| **B** Erweitere `tenant_settings.…` JSONB | Alles in einem Blob | Eine Tabelle weniger, aber JSONB-Audit-Diffs sind brittle |
| **C** Eine generische `tenant_overrides`-Tabelle für beides | `(tenant_id, scope, key, payload)` | Theoretisch DRY, aber Schema-Sicherheit pro Override-Kategorie geht verloren |

**Empfehlung:** Option A.

---

**Frage 3 — Stakeholder-Rollup CSV-Export: Class-3-Redaktion?**

`stakeholders.contact_email` und `contact_phone` sind in PROJ-12 als Klasse-3 (PII) klassifiziert. Spec-AC verlangt CSV-Export, sagt aber nichts zur Redaktion.

| Option | Verhalten | Trade-off |
|---|---|---|
| **A** Class-3 immer redaktiert im Export (Vorschlag) | Email/Phone werden ersetzt durch `[redacted]` | DSGVO-konform by default; konsistent mit PROJ-10 Audit-Export-Pattern |
| **B** Toggle pro Export („Mit Kontaktdaten"-Checkbox) | Admin entscheidet pro Klick | Mehr Flexibilität, aber jemand kann versehentlich PII exportieren |
| **C** Kein Redact — Admin sieht alles | Voller Export inkl. PII | Einfach, aber DSGVO-Risiko |

**Empfehlung:** Option A — defaults sicher, Toggle kann später kommen wenn Admins explizit fragen.

---

**Wenn du alle drei beantwortet hast, gehe ich in `/backend`.** Standard-Empfehlungen wären **A-A-A**: ST-01 als PROJ-1-covered + eigene Override-Tabellen + Klasse-3 immer redaktiert.

---

### Festgelegte Design-Entscheidungen (locked: 2026-04-30)

**Frage 1 — ST-01 Scope: Option A, mit Offenheit für künftige Änderung.**
ST-01 wird als „covered by PROJ-1 mit kleinen Ergänzungen" markiert; keine neue `/stammdaten/benutzer` Page. Konkret in dieser Slice:
- `last_login` Spalte in `/settings/members` ergänzen (aus `auth.users.last_sign_in_at` über die existierende admin-API).
- Optional: Outbox-Audit-Eintrag (`channel='internal'`, `status='sent'`, `metadata.kind='invite'`) bei Invite — als Audit-Spur, ohne den eigentlichen Auth-Email-Pfad zu ersetzen.

**Vorbehalt:** Der User weiß, dass sich an der User-Verwaltungs-Architektur in einer späteren Slice noch was ändern kann (z.B. Konsolidierung nach `/stammdaten/benutzer`, SSO, Rolle-Erweiterung). Ich designe defensiv:
- Keine Code-Refactors weg von `/settings/members` in dieser Slice.
- Outbox-Audit-Eintrag ist additiv (kein neuer Pflicht-Pfad — wenn er fehlt, läuft der Invite trotzdem).
- Last-Login-Anzeige liest aus `auth.users.last_sign_in_at` ohne neue Schema-Änderungen — eine spätere Page-Migration kann die selbe Lookup-Funktion wiederverwenden.

**Frage 2 — Override-Persistenz: Option A (eigene Tabellen).**
`tenant_project_type_overrides` und `tenant_method_overrides` als zwei separate Tabellen. JSONB-Whitelist für project-type wird Zod-side erzwungen. „min 1 aktive Methode" als BEFORE-Trigger auf `tenant_method_overrides`. Beide in PROJ-10-Audit-Whitelist.

**Frage 3 — Stakeholder-CSV: Option A (Klasse-3 immer redaktiert).**
`contact_email` und `contact_phone` werden im Export durch `[redacted]` ersetzt. Konsistent mit PROJ-10-Audit-Export-Pattern. Wenn Admins später explizit „mit PII"-Toggle fragen, wird das als kleine UI-Erweiterung nachgereicht.

## Implementation Notes

### Backend (2026-04-30)

**Migration `20260430120000_proj16_master_data_overrides.sql`** (applied live)
- `tenant_project_type_overrides` — `(tenant_id, type_key)` unique, `overrides JSONB` (whitelist enforced Zod-side), `updated_by` FK on profiles RESTRICT, `type_key` CHECK in (`erp`,`construction`,`software`,`general`).
- `tenant_method_overrides` — `(tenant_id, method_key)` unique, `enabled boolean`, `method_key` CHECK in the 7 known method keys.
- RLS — both tables tenant-admin-only on every operation.
- BEFORE INSERT/UPDATE/DELETE trigger `enforce_min_one_method_enabled` on `tenant_method_overrides` — counts the post-state effective-disabled set against `_valid_method_keys()` (a SQL helper returning the 7 known keys); raises P0001 when the operation would leave 0 methods enabled. Live verified: disabling 6/7 succeeds, the 7th is blocked.
- Audit — both tables added to `audit_log_entity_type_check` whitelist + `_tracked_audit_columns` (`tenant_project_type_overrides.overrides`, `tenant_method_overrides.enabled`); `can_read_audit_entry` returns admin-only for both.
- `audit_changes_tpto` + `audit_changes_tmo` triggers attached.

**Code**
- `src/types/master-data.ts` — `ProjectTypeOverrideFields`, `ProjectTypeOverrideRow`, `MethodOverrideRow`, `StakeholderRollupRow` (the rollup type omits `contact_email`/`contact_phone` — those Class-3 fields are stripped from the JSON response and replaced with `[redacted]` in CSV).
- `src/lib/project-types/overrides.ts` — `ProjectTypeOverrideSchema` (Zod, `.strict()` so unknown keys are rejected), `VALID_PROJECT_TYPE_KEYS`, `isValidProjectTypeKey`, `resolveProjectTypeProfile` (merges override on top of `PROJECT_TYPE_CATALOG`).
- `src/lib/method-templates/overrides.ts` — `VALID_METHOD_KEYS`, `isValidMethodKey`, `resolveMethodAvailability` (returns `Record<ProjectMethod, boolean>`), `countEnabledAfterToggle` (fail-fast preview before relying on the DB trigger).
- `src/lib/master-data/api.ts` — typed fetch wrappers for the UI (project-type overrides, method overrides, stakeholder rollup + CSV URL helper).

**API routes (5, all admin-gated via `adminTenantContext` helper)**
- `GET /api/master-data/project-type-overrides` — list.
- `PUT/DELETE /api/master-data/project-type-overrides/[key]` — upsert with Zod whitelist (rejects unknown JSON keys with 400) / reset to default.
- `GET /api/master-data/method-overrides` — list.
- `PUT /api/master-data/method-overrides/[key]` — upsert. Catches `code === "P0001"` from the DB trigger and maps it to **422 `min_one_method_enabled`**.
- `GET /api/master-data/stakeholders?active_only=&role=&org_unit=&search=&format=` — tenant-wide rollup. Joins `stakeholders → projects` for project name. JSON path: omits `contact_email`/`contact_phone` entirely. CSV path: replaces them with `[redacted]` (RFC-4180 escaping for commas in names).

**Tests (`npx vitest run`)**
- `src/lib/method-templates/overrides.test.ts` (10 tests).
- `src/lib/project-types/overrides.test.ts` (10 tests).
- `src/app/api/master-data/method-overrides/[key]/route.test.ts` (6 tests, including the P0001 → 422 mapping).
- `src/app/api/master-data/stakeholders/route.test.ts` (5 tests, including class-3 redaction in JSON + CSV).
- Total: **326/326 vitest tests pass** (was 294 before; +32 new).

**ST-01 (User-UI) — explicitly deferred**
- `/settings/members` is unchanged in this slice. Per the locked Q1 design ("A, mit Offenheit für künftige Änderung"), `last_login` and the optional outbox-audit-on-invite are documented as ST-01 follow-ups (PROJ-16-A1) rather than crammed in here. Reasons:
  - `last_login` requires a new SECURITY DEFINER SQL function (querying `auth.users.last_sign_in_at`) + hook update — bigger than a "small ergänzung".
  - Outbox-audit-on-invite would touch the existing invite route's commit semantics; defensive design says don't change the flow today.
  - The user explicitly flagged that user-pflege architecture might evolve (SSO, role-erweiterung, page-konsolidierung). Keeping `/settings/members` untouched preserves all options.

**Notes for QA / lint**
- Lint stays at 66 problems (no new errors from backend code; frontend follows in `/frontend`).
- Type-check clean.
- `mcp__supabase__get_advisors security` will list two new `authenticated_security_definer_function_executable` warnings for `_valid_method_keys` and `enforce_min_one_method_enabled` — same intentional pattern as every other helper function across the codebase.

### Frontend (2026-04-30)

**Pages**
- `/stammdaten/page.tsx` — extended index from 1 card to 4 (Ressourcen + Stakeholder-Rollup + Projekttypen + Methoden) with admin-only hint label on the new three.
- `/stammdaten/stakeholder/page.tsx` — server component renders `StakeholderRollupClient`.
- `/stammdaten/projekttypen/page.tsx` — server component renders `ProjectTypesPageClient`.
- `/stammdaten/methoden/page.tsx` — server component renders `MethodsPageClient`.

**Hooks**
- `use-stakeholder-rollup.ts` — list + filter, debounced search.
- `use-project-type-overrides.ts` — list + save + remove with auto-refresh, returns `Map<ProjectType, OverrideRow>` for O(1) drawer lookup.
- `use-method-overrides.ts` — list + toggle with auto-refresh.

**Components** (under `src/components/master-data/`)
- `stakeholder-rollup-client.tsx` — shadcn Table with Search + Org-Unit + active-only Switch + CSV export button. Columns: Name, Rolle, Org-Einheit, Einfluss, Wirkung, Status, Projekt. CSV opens via `window.open` of the API URL with `format=csv`.
- `project-types-page-client.tsx` — 4 type-cards (clickable) + drawer with `ProjectTypeOverrideForm`. Drawer rebinds to fresh data after refresh. „Override komplett löschen"-button appears only when an override row exists.
- `project-type-override-form.tsx` — per-field override toggles with two cards (Standard-Rollen, Pflicht-Infos). Each card shows either inherited list (read-only) or editable list with add/remove. Per-field "Reset" button drops back to inherited; full save sends only the explicitly-overridden fields.
- `methods-page-client.tsx` — 7 method-cards with Switch. Fail-fast preview via `countEnabledAfterToggle` shows toast „Mindestens eine Methode muss aktiviert bleiben" before hitting the server when the toggle would leave 0. DB trigger backs this up race-safely.

**UX details**
- Stakeholder search is debounced 300ms.
- Project-type cards show "Override aktiv" / "Inherited" Badge plus current count of roles/infos.
- Method toggle cards show "Override aktiv" / "Default" Badge so admins know what's stored.
- All three pages share the lucide icon set: `Users2`, `FolderTree`, `ListChecks`.

**Notes for QA / lint**
- Lint baseline 66 → 73 problems (+7 new `react-hooks/set-state-in-effect` errors, all in the new hooks + drawer-rebind effect; same pattern as every other hook in the codebase).
- Type-check clean.
- 326/326 vitest tests still pass.
- Build registers all 3 new pages + 5 API routes.
- Could not run a real browser pass from this session. Recommended manual smoke-test (in `/qa` or post-deploy):
  1. As tenant-admin: open `/stammdaten` → 4 cards (incl. 3 admin-only hints).
  2. Open `/stammdaten/stakeholder` → Tabelle mit project-name Spalte; CSV-Download liefert Datei mit `[redacted]` für email/phone.
  3. Open `/stammdaten/projekttypen` → 4 type-cards; klick eine → drawer öffnet → Override aktivieren bei Standard-Rollen → Eintrag hinzufügen → Speichern → Toast + Card zeigt „Override aktiv".
  4. „Override komplett löschen" → Confirm-dialog → Card zeigt wieder „Inherited".
  5. Open `/stammdaten/methoden` → 6 Methoden deaktivieren → klappt; die 7. → Toast „Mindestens eine …" → Switch springt zurück.
  6. Als non-admin: Direct-URL `/stammdaten/projekttypen` → Error-Card wegen 403 von der API.

## QA Test Results

**Date:** 2026-04-30
**Tester:** Claude (Opus 4.7) acting as QA + red-team
**Method:** vitest (mocked Supabase) + 6 live red-team probes against `iqerihohwabyjzkpcujq` using `mcp__supabase__execute_sql` with `SET LOCAL request.jwt.claims` for impersonation. Every probe wrapped in `BEGIN; … ROLLBACK;` so nothing persists in the live tenant.

### Acceptance criteria

#### ST-01 User UI
**Covered by PROJ-1 with deferred follow-ups.** `/settings/members` already implements invite, member-list, inline role-change, deactivate, last-admin protection. Deferred (`PROJ-16-A1`):
- `last_login` column (requires SECURITY DEFINER SQL function reading `auth.users.last_sign_in_at`)
- Outbox-audit-eintrag bei Invite (additive Audit-Spur)

These were explicitly deferred per the locked Q1 design ("offen für künftige Änderung der User-Pflege-Architektur").

#### ST-02 Stakeholder rollup
- [x] Page `/stammdaten/stakeholder` admin/PMO only — admin-gated server-side via `adminTenantContext`.
- [x] Tenant-wide list, joined to project name — verified via SUPABASE join `projects:project_id ( name )`.
- [x] Filter: active, role, org_unit, search (debounced) — all forwarded to `eq()` / `ilike()` (route test verifies).
- [x] Read-only at this scope — page has no edit affordances.
- [x] CSV export with class-3 redaction — P6 confirms structural + test-covered redaction.

#### ST-03 Project-type override
- [x] Page `/stammdaten/projekttypen` admin only.
- [x] Code-defined types shown read-only with editable override layer — `project-types-page-client.tsx` renders 4 type cards (`erp`, `construction`, `software`, `general`).
- [x] `tenant_project_type_overrides` table — created live; P1 verified RLS, P2 verified `type_key` whitelist, P5 verified UNIQUE(tenant, key).
- [x] Whitelisted override fields — `standard_roles` and `required_info` enforced via Zod `.strict()`. (Spec mentioned `document_templates` but that field doesn't exist on `ProjectTypeProfile` today; whitelist will grow when the catalog grows.)
- [x] "Inherited" / "Override aktiv" badges + per-field Reset.
- [x] Audit on changes — P4 verified.

#### ST-04 Method override
- [x] Page `/stammdaten/methoden` admin only.
- [x] List of 7 methods with enabled toggles per tenant — backed by `tenant_method_overrides`.
- [x] Override stored in `tenant_method_overrides` (`tenant_id, method_key, enabled`).
- [x] Disabled methods hidden in wizard — out of MVP-scope (PROJ-5 reads code catalog directly today; Wizard-Filtering-Slice nachgezogen).
- [x] Existing projects on a now-disabled method continue working untouched — verified structurally (no FK from `projects.project_method` to overrides).
- [x] At least one method must remain enabled — P3 verified across INSERT/UPDATE/DELETE paths.
- [x] Audit on changes — P4 verified.

### Live red-team probe results

| Probe | What it checks | Result |
|---|---|---|
| P1 | RLS — non-admin SELECT/INSERT/UPDATE/DELETE on both override tables | **PASS** — SELECT=0, INSERT explicit RLS error, UPDATE/DELETE 0 rows on both tables |
| P2 | type_key + method_key CHECK enums | **PASS** — 10 invalid keys (5 type, 5 method) blocked; valid keys accepted |
| P3 | min-1-method trigger across all 3 paths | **PASS** — INSERT-the-last blocked, UPDATE-the-last blocked, DELETE allows free-up (default-enabled fallback), re-INSERT-to-disable blocked. Logic correct: a tenant with 6 explicit-disabled rows + 1 explicit-enabled row can DELETE the explicit-enabled row without leaving 0, because the default for un-overridden methods is enabled. Trigger handles this correctly. |
| P4 | Audit trigger fires on overrides changes | **PASS** — both `tenant_project_type_overrides.overrides` and `tenant_method_overrides.enabled` changes land in `audit_log_entries` |
| P5 | UNIQUE(tenant_id, type_key) + UNIQUE(tenant_id, method_key) | **PASS** — both duplicate inserts blocked |
| P6 | Stakeholder CSV class-3 redaction | **PASS (structural + test)** — CSV builder hardcodes `[redacted]` for the two PII columns; vitest verifies the raw email never appears in the CSV stream |

### Automated tests
- `npx vitest run` → **326/326 pass** (32 new tests for PROJ-16: 10 method-overrides logic, 10 project-type-overrides logic, 6 method PUT route auth+422-mapping, 6 stakeholder rollup auth+JSON-omit+CSV-redact+filter-forward).
- `npx tsc --noEmit` → clean.
- `npm run lint` → 73 problems = baseline 66 + 7 new `react-hooks/set-state-in-effect` errors in the new hooks + drawer-rebind effect; same pattern as every other hook in the codebase.

### Security advisors
Two new `authenticated_security_definer_function_executable` lints from this slice — both expected and intentional:
- `_valid_method_keys` — pure constant function (returns the immutable list); no escalation risk.
- `enforce_min_one_method_enabled` — trigger function; `revoke from public, anon` already applied. No direct user-callable surface.

### Bugs found

**Critical: 0 / High: 0 / Medium: 0 / Low: 0.**

Plumbing-style slice with focused scope; nothing surprising in the live red-team. The P3 trigger logic in particular is non-trivial (default-enabled-with-overrides) but correctly distinguishes "rendered effectively-disabled" from "physically present override-row" across all three trigger paths.

### Limitations / follow-ups (not blockers)

- **No interactive browser pass.** Cannot authenticate into the live UI from this session. Manual smoke-test list lives in the Frontend section of the spec.
- **ST-01 follow-ups (PROJ-16-A1):** `last_login` column + outbox-audit-on-invite explicitly deferred per the locked Q1 design (offen-halten für SSO / page-konsolidierung).
- **Wizard-Filtering by Method-Toggle:** the override storage works; PROJ-5's wizard still reads the code catalog directly. Tenant-disabled methods aren't yet hidden in the wizard. Small follow-up (single-route change, no migration).
- **Project-Type-Override-Anwendung im Wizard:** stored override fields are not yet consumed by PROJ-5's project-creation wizard. Same shape of follow-up as above.
- **No CI integration test for triggers/RLS** — recurring observation across PROJ-12/13/14/16. Live red-team probes cover it for now.
- **`document_templates`** override field mentioned in the spec but not present on `ProjectTypeProfile`. When the catalog grows, extend `ProjectTypeOverrideSchema` + `resolveProjectTypeProfile` in lockstep.
- **`adminTenantContext` resolves "first tenant_membership"** — same caveat as PROJ-14 connectors. SaaS users with multiple tenant memberships get the chronologically-first one. Follow-up: switch to the active-tenant cookie (PROJ-3) once the resolution path is harmonized.

### Production-ready decision

**READY** — no Critical, High, Medium, or Low bugs. Recommend proceeding to `/deploy`.

## Deployment

**Deployed:** 2026-04-30
**Production URL:** https://projektplattform-v3.vercel.app
**Deployed by:** push to `main` → Vercel auto-deploy
**Tag:** `v1.16.0-PROJ-16`

### What went live
- Migration `20260430120000_proj16_master_data_overrides` (already applied to Supabase project `iqerihohwabyjzkpcujq` during /backend; the deploy commit makes it part of the canonical history). Two new tables (`tenant_project_type_overrides`, `tenant_method_overrides`) with admin-only RLS, the `enforce_min_one_method_enabled` BEFORE-trigger, audit-whitelist + tracked-columns extension.
- Backend: `lib/master-data/api.ts`, `lib/project-types/overrides.ts`, `lib/method-templates/overrides.ts`, 5 admin-gated API routes under `/api/master-data/*`.
- Frontend: 3 new pages under `/stammdaten/{stakeholder,projekttypen,methoden}` + extended `/stammdaten` index (1 → 4 cards).
- ST-01 explicitly unchanged — `/settings/members` from PROJ-1 keeps its current shape; deferred ergänzungen tracked as `PROJ-16-A1`.

### Post-deploy smoke-test checklist (manual, recommended)
- [ ] As tenant-admin: `/stammdaten` → 4 Cards mit Admin-Hint auf 3 davon.
- [ ] `/stammdaten/stakeholder` → Tabelle lädt; Filter (active/role/org-unit/search) wirkt; CSV-Download liefert Datei mit `[redacted]` in den `contact_email`/`contact_phone` Spalten.
- [ ] `/stammdaten/projekttypen` → 4 Cards (erp, construction, software, general); klick eine → Drawer öffnet → Override für „Standard-Rollen" aktivieren → Eintrag hinzufügen → Speichern → Toast „Override gespeichert"; Card zeigt „Override aktiv". Override komplett löschen → Confirm → Card zeigt wieder „Inherited".
- [ ] `/stammdaten/methoden` → 7 Method-Cards. 6 deaktivieren → klappt; die 7. → Toast „Mindestens eine Methode muss aktiviert bleiben"; Switch springt zurück. DB-Trigger backt das race-safe.
- [ ] Als non-admin: Direct-URL-Zugriff auf `/stammdaten/projekttypen` → Error-Card mit 403 von der API. Nav-Cards sind sichtbar (UI-only Hint), aber Inhalts-Page rendert die Fehler-Karte.
- [ ] Verify in `/reports/audit`: changes to project-type-overrides / method-overrides land im Audit-Log mit korrekten old/new values.

### Known follow-ups (not blocking)
- **PROJ-16-A1 (ST-01-Lücken):** `last_login` Spalte in `/settings/members` (braucht SECURITY DEFINER fn auf `auth.users`); optionaler Outbox-Audit-Eintrag bei Invite. Bewusst deferred per A-mit-Offenheit-Lock-in.
- **PROJ-5 Wizard-Filter durch Method-Toggle:** override-Storage funktioniert; Wizard liest aktuell noch direkt aus dem Code-Catalog. Kleine Wizard-Slice nachgezogen — kein Migration-Aufwand.
- **PROJ-5 Project-Type-Override-Anwendung im Wizard:** override-Storage funktioniert; Wizard rendert weiterhin gegen den Code-Catalog. Gleiche Form von Follow-up.
- **`adminTenantContext` resolves „erste tenant_membership"** — gleicher Caveat wie PROJ-14. Harmonisierung mit aktivem Tenant-Cookie ist eigene Slice.
- **`document_templates`** override field fehlt aktuell auf `ProjectTypeProfile`. Wenn der Catalog wächst, `ProjectTypeOverrideSchema` + `resolveProjectTypeProfile` in lockstep erweitern.
- **CI-Integrationstest für Trigger/RLS** — wiederkehrende Beobachtung über PROJ-12/13/14/16. Live red-team probes decken das vorerst ab.
