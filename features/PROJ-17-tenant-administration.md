# PROJ-17: Tenant Administration — Branding, Modules, Privacy Defaults, Export, Offboarding

## Status: Architected
**Created:** 2026-04-25
**Last Updated:** 2026-04-29

## Summary
Turns `/einstellungen` into the full tenant-admin center. Beyond what PROJ-1 already exposes (rename tenant, manage domain), this adds: tenant base data (display name, language, branding URL/color), module enable/disable, privacy default class, GDPR Art. 15/20 data export, and tenant offboarding (soft-delete with grace period). Inherits V2 EP-15.

## Dependencies
- Requires: PROJ-1 (Auth, Tenants, Roles)
- Requires: PROJ-10 (Audit + retention + redaction)
- Requires: PROJ-12 (Privacy classification — needed for default class field + export redaction)
- Requires: PROJ-13 (Email send for offboarding notice)
- Requires: PROJ-14 (Connector framework — backup destinations for export)

## V2 Reference Material
- **Epic file:** `~/projects/Projeketplattform_v2_D.U/planning/epics/ep-15-mandanten-administration.md`
- **Stories:** `~/projects/Projeketplattform_v2_D.U/planning/stories/ep-15.md` (ST-01 base data, ST-02 active modules, ST-03 privacy default class, ST-04 GDPR export, ST-05 tenant offboarding)
- **ADRs:** `docs/decisions/data-privacy-classification.md`, `docs/decisions/retention-and-export.md`, `docs/decisions/metamodel-infra-followups.md`
- **V2 code paths to study during /architecture and /backend:**
  - `apps/web/app/einstellungen/page.tsx` — V2's tenant settings page
  - `apps/api/src/projektplattform_api/routers/tenant.py`
  - `apps/api/src/projektplattform_api/services/tenant_export.py`

## User Stories
- **[V2 EP-15-ST-01]** As a tenant admin, I want to set display name, language (de/en), and basic branding (logo URL, accent color) so the platform shows in our look.
- **[V2 EP-15-ST-02]** As a tenant admin, I want to enable/disable optional modules (Risiken, Budget, KI, Konnektoren, Vendor, Kommunikation) tenant-wide.
- **[V2 EP-15-ST-03]** As a tenant admin, I want to set a default data-privacy class for unclassified fields so we route conservatively to local AI.
- **[V2 EP-15-ST-04]** As a tenant admin, I want to export all my tenant data as a machine-readable bundle (DSGVO Art. 15/20).
- **[V2 EP-15-ST-05]** As a tenant admin, I want to delete the tenant in a two-step way (soft-delete → 30-day grace → hard-delete) so we leave no orphan data when contracts end.

## Acceptance Criteria

### Tenant base data (ST-01)
- [ ] `tenants.name` editable (already exists from PROJ-1).
- [ ] New columns: `language (de|en)`, `branding (JSONB { logo_url, accent_color })`.
- [ ] `logo_url` HTTPS-only.
- [ ] `accent_color` hex `#RRGGBB`.
- [ ] Language change applies on next page reload (i18n is a separate work item; for now reads from a TS dictionary with de/en keys).
- [ ] Accent color exposed as CSS variable `--color-brand-600`.
- [ ] Audit on changes.

### Active modules (ST-02)
- [ ] `tenant_settings.active_modules` (JSONB array of module keys).
- [ ] Default modules: `projects, master_data, members` (always enabled — core).
- [ ] Optional: `risks, budget, ki, connectors, vendor, communication`.
- [ ] Disabling hides nav entries (global + project-tab); deactivated module APIs return `404` for reads, `403` for writes (per V2 AK).
- [ ] Existing data preserved when module disabled.
- [ ] Audit on toggles.

### Privacy default class (ST-03)
- [ ] `tenant_settings.privacy_defaults` (JSONB, e.g. `{ default_class: 1|2|3 }`).
- [ ] AI router (PROJ-12) honors the tenant default for unclassified fields.
- [ ] Existing class-3 fields STAY class-3 — defaults cannot deklassify.
- [ ] Setting default lower than 1 not allowed; setting higher (more conservative) shows warning "more data routes locally".

### GDPR data export (ST-04)
- [ ] Background job triggered by admin → produces ZIP with JSON dumps per entity (projects, work_items, stakeholders, risks, budget, audit_log, outbox, vendors, …).
- [ ] Class-3 fields redacted when "Redaction on" toggle set; identical behavior to PROJ-10's audit export redaction.
- [ ] UI shows progress + completion.
- [ ] Download link is signed and expires (24h default).
- [ ] Each export logged in audit with actor + timestamp + scope.
- [ ] Edge Function or Supabase scheduled job; storage in Supabase Storage with private bucket + signed URLs.

### Tenant offboarding (ST-05)
- [ ] Two-stage delete: Step 1 → soft-delete (`tenants.is_deleted=true`, `deleted_at` set, grace 30 days). Step 2 → hard-delete after grace.
- [ ] During grace, **platform-admin** (not tenant-admin) can revert.
- [ ] At grace end, a worker (Supabase scheduled function) removes the tenant + all dependent rows (CASCADE on `tenants.id`).
- [ ] Pre-delete: an EP-15-ST-04 export auto-runs and is retained for the platform admin.
- [ ] Audit trail of the deletion stays in a global `deletion_log` table outside the tenant.

## Edge Cases
- **Disabling 'communication' while drafts exist** → drafts preserved; UI shows "module disabled" state.
- **Privacy default raised to 3 then lowered back to 1** → audit trail of both changes; existing class-3 fields unchanged.
- **GDPR export of a huge tenant** → background job streams; progress + retry on chunk failures.
- **Offboarding restored after 31 days** → not allowed; documented at deletion time.
- **Hard-delete fails partway** → fallback: marks deletion as `errored`, alerts platform admin; transaction-bound when possible.
- **Cross-tenant view of another tenant's offboarding** → impossible (RLS).

## Technical Requirements
- **Stack:** Next.js 16 + Supabase + Edge Functions for export/delete background jobs.
- **Multi-tenant:** `tenant_settings` is one row per tenant with `tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE`. RLS: tenant_admin read+write own row; platform admin (separate role) for offboarding actions.
- **Validation:** Zod for branding (hex color regex, https URL), privacy_defaults shape, module key list.
- **Auth:** Supabase Auth + tenant_admin or platform-admin checks.
- **Privacy:** Class-3 fields pass through redaction logic on export.
- **Background jobs:** Long-running export & hard-delete via Supabase scheduled Edge Functions.

## Out of Scope (deferred or explicit non-goals)
- Self-service tenant signup (platform-admin creates tenants).
- Billing / license management.
- File-upload pipeline (URL-based branding only).
- Per-tenant custom translations beyond the de/en code dictionary.
- Reactivation past grace.
- Partial deletion (only-this-project deletion is separate).

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Realitätscheck und Scope

Die Spec ist groß — fünf Stories, davon drei UI-/Konfig-lastig (ST-01 Branding, ST-02 Module, ST-03 Privacy-Default) und zwei mit schwerer Infrastruktur (ST-04 GDPR-Export = Edge Function + Storage + Signed-URL + Progress, ST-05 Offboarding = Soft-Delete + 30-Tage-Grace + Worker + Deletion-Log). Wir bauen einen **MVP-Slice mit den drei Konfig-Stories und liefern dabei die deferred-Items aus PROJ-12 und PROJ-10 mit, die alle dieselbe `tenant_settings`-Tabelle teilen** — ein Schritt löst drei Cross-Feature-Schulden ab.

Bestand vor dieser Iteration:
- `tenants` hat `id, name, domain, created_by, created_at, updated_at`. Keine Branding-/Sprach-Felder.
- Eine `tenant_settings`-Tabelle existiert noch nicht (PROJ-10 + PROJ-12 hatten sie als „später" markiert).
- `/settings/tenant` ist eine schlanke Seite mit Name + Domain (PROJ-1).

### MVP-Scope (diese Iteration)

```
✅ IN dieser Iteration                       ⏳ DEFERRED (eigene Slices)
─────────────────────────────────────────    ───────────────────────────────
ST-01 Tenant-Stammdaten (lang + branding)    ST-04 GDPR-Datenexport
ST-02 Aktive Module (UI + API-Gating)        ST-05 Tenant-Offboarding
ST-03 Privacy-Default-Klasse                 (Beide brauchen Edge-Functions
PROJ-12 ai_provider_config (jetzt UI)         + Storage + Worker — eigene
PROJ-10 retention_overrides (jetzt UI)        Slice rechtfertigen.)
```

### Komponentenstruktur

```
/settings/tenant   (admin-only — existiert; wird aufgebrochen in Sektionen)
├── Section „Stammdaten"   (existierend → erweitert)
│   ├── Name (existiert)
│   ├── Domain (existiert)
│   ├── Sprache  (Select de | en) — neu
│   └── Branding — neu
│       ├── Logo-URL (HTTPS only)
│       └── Accent-Color (#RRGGBB)
│
├── Section „Module"   (neu)
│   ├── Core-Module (immer aktiv, schreibgeschützt: Projekte, Stammdaten, Mitglieder)
│   └── Optionale Module-Toggles
│       ├── Risiken
│       ├── Entscheidungen
│       ├── KI-Vorschläge
│       └── Audit-Reports
│   (Konnektoren / Vendor / Kommunikation = noch nicht gebaut → ausgegraut mit „Demnächst")
│
├── Section „Datenschutz"   (neu)
│   ├── Default-Klasse für unspezifizierte Felder (1 / 2 / 3, default 3)
│   │   └── Warnung wenn höher gewählt: „Mehr Daten werden lokal verarbeitet"
│   └── Retention-Overrides
│       └── Audit-Log-Aufbewahrung (Tage, default 730)
│
├── Section „KI-Provider"   (neu — PROJ-12 unlock)
│   ├── Externes Modell aktiv (Anthropic / aus / Stub-only)
│   ├── Modell-ID (claude-opus-4-7 / claude-sonnet-4-6 / claude-haiku-4-5-20251001)
│   └── Hinweis: Klasse-3-Hard-Block greift unabhängig von dieser Konfiguration
│
└── Section „Gefahrenzone"   (Platzhalter für ST-05 Offboarding — sichtbar als „Demnächst")

Konsumenten der neuen Settings (Nicht-UI-Code-Pfade):
├── Top-Nav → liest active_modules, blendet Risiken/Entscheidungen/KI-Vorschläge aus
├── Project-Room-Sidebar → liest active_modules, blendet projekt-interne Tabs aus
├── PROJ-12-Router → liest privacy_defaults.default_class für unklassifizierte Felder
├── PROJ-12-Router → liest ai_provider_config.{external_provider, model_id}
├── PROJ-10-Retention-Cron → liest retention_overrides.audit_log_days, fallback 730
└── /api/projects/[id]/risks (etc.) → return 404 wenn Modul deaktiviert ist
```

### Datenmodell (Klartext)

**Erweiterung an `tenants`:**
- `language` — `de` oder `en`, default `de`
- `branding` — JSONB mit `logo_url` (HTTPS) und `accent_color` (`#RRGGBB`); beide optional
- Beide Klasse 1 (technisch); Audit-Trail über die existierenden PROJ-10-Mechanismen

**Neue Tabelle `tenant_settings`:**
- 1:1 Beziehung zu `tenants` (UNIQUE FK auf tenant_id mit ON DELETE CASCADE)
- `active_modules` JSONB — Liste der aktiven Modul-Schlüssel; Default-Wert beim Anlegen: alle aktiv
- `privacy_defaults` JSONB — `{ default_class: 1|2|3 }`
- `ai_provider_config` JSONB — `{ external_provider: 'anthropic'|'none', model_id?: string }`
- `retention_overrides` JSONB — z. B. `{ audit_log_days: 365 }`; leer bedeutet System-Default

Die Tabelle wird per Trigger automatisch beim Anlegen eines Tenants angelegt und mit Defaults initialisiert. Eine Backfill-Migration füllt sie für die aktuell existierenden Tenants.

**RLS:**
- `tenant_settings` SELECT + UPDATE: nur `is_tenant_admin(tenant_id)`. Members ohne Admin-Rolle sehen die Settings nicht.
- `tenants.language` + `tenants.branding`: Members können lesen (für UI-Rendering); Update-Pfad bleibt admin-only über die existierende `tenants_update_admin`-Policy.

### Tech-Entscheidungen

| Entscheidung | Warum |
|---|---|
| ST-01 + ST-02 + ST-03 als gemeinsamer Slice | Alle drei lieben dasselbe `tenant_settings`-Schema; eine Migration, eine Admin-Seite, ein API-Endpunkt für `/api/tenants/[id]/settings`. Splitten würde drei Mini-Slices ohne Mehrwert erzeugen. |
| ST-04 + ST-05 in eigene Slices | Beide bringen schwere Infrastruktur (Edge Functions, Storage, scheduled Worker, deletion_log) — sind keine UI-Erweiterung sondern eigenständige Sub-Systeme. ST-05 hängt zusätzlich an PROJ-13 (E-Mail), das auch noch nicht da ist. |
| `tenant_settings` als separate Tabelle, nicht als Spalten an `tenants` | Trennt User-facing Identität (Name, Domain) von Konfiguration. Settings können wachsen, ohne `tenants` zu spammen. RLS-Policies bleiben einfacher (Admin-only auf Settings vs gemischt auf Tenants). |
| AI-Provider-UI hier statt in PROJ-12 | PROJ-12 wartete laut Spec auf PROJ-17 für genau diese Stelle. Statt eine isolierte Admin-Seite in PROJ-12 zu bauen, wird sie hier nativ integriert. |
| Retention-Override-UI hier statt in PROJ-10 | Gleicher Grund — PROJ-10 hat den `retention_overrides`-JSONB-Hook bereits dokumentiert; hier wird er erstmals befüllbar. |
| Module-Gating: API antwortet 404, Nav blendet aus | Spec: „deactivated module APIs return 404 for reads, 403 for writes". 404 statt 403 für Reads verhindert Existenz-Leak (Nutzer:in soll nicht erkennen, ob ein Modul existiert aber gesperrt ist oder gar nicht gibt). 403 für Writes ist klarer Auth-Fehler. |
| Settings im Auth-Snapshot mitliefern | `loadServerAuth` zieht in einem Schritt User + Memberships + jetzt auch das aktive Tenant-Settings-Blob. Spart Round-Trips bei Nav-Render und vermeidet flackernde Module-Tabs. |
| Sprach-Switch nutzt vorhandenes TS-Wörterbuch | Spec: „i18n is a separate work item; for now reads from a TS dictionary with de/en keys". Wir liefern das Wörterbuch noch nicht — die Sprach-Auswahl wird gespeichert, aber UI bleibt fest auf de bis ein i18n-Pass nachzieht. ST-01-AC „applies on next page reload" wird damit nicht heute, sondern bei i18n-Slice erfüllt. **Klarstellung im Header: `language` ist gespeichert, sichtbarer Effekt erst mit dem i18n-Slice.** |
| Trigger erstellt `tenant_settings`-Zeile beim Tenant-Insert | Garantiert „jeder Tenant hat genau eine Settings-Zeile". Vermeidet NULL-Pfade in den Konsumenten. |

### Sicherheitsdimension

- Settings-Tabelle ist tenant-scoped via UNIQUE FK auf tenants.id; CASCADE-DELETE räumt auf, wenn der Tenant gelöscht wird (relevant für ST-05 Offboarding-Slice).
- RLS lässt nur tenant_admin lesen + schreiben; cross-tenant 0 Rows.
- Privacy-Default kann Klasse-3-Felder NICHT deklassifizieren — die Field-Registry-Lookups bleiben autoritativ. Nur „unbekannte" Felder werden vom Default-Wert beeinflusst.
- Branding-Logo-URL ist HTTPS-validiert (Zod). Verhindert mixed-content-Warnung im Browser; verhindert javascript:- oder data:-URLs aus dem Setting.
- Accent-Color via Zod-Regex `^#[0-9A-Fa-f]{6}$` validiert. Verhindert CSS-Injection.
- Module-Toggle: Server-seitig auch im API-Gate, nicht nur im Nav. Andernfalls könnte ein Power-User die Module per direktem URL-Aufruf umgehen.
- AI-Provider-Setting kann den Klasse-3-Hard-Block NICHT überschreiben (PROJ-12-Vertrag). Auch wenn `external_provider='anthropic'` gesetzt ist, geht ein Klasse-3-Payload weiterhin lokal.

### Neue Code-Oberfläche

**Eine Migration:** `proj17_tenant_settings_and_branding.sql` — `tenants`-Spalten + `tenant_settings`-Tabelle + RLS + Trigger + Backfill.

**API-Routen:**
- `GET /api/tenants/[id]/settings` — admin-only, liefert das volle Settings-Blob
- `PATCH /api/tenants/[id]/settings` — admin-only, Zod-validiert, partielle Updates
- `PATCH /api/tenants/[id]` — bereits existierend, erweitert um `language` + `branding`

**Lib-Module (neu):**
- `lib/tenant-settings/api.ts` — typed fetch-wrapper für die UI
- `lib/tenant-settings/modules.ts` — Modul-Schlüssel-Konstanten + Default-Set + Helfer `isModuleActive(settings, key)`
- Konsumenten in PROJ-12 (`router.ts`) und PROJ-10 (`apply-retention`) lesen das Blob beim Aufruf

**UI:**
- `app/(app)/settings/tenant/page.tsx` — bleibt der Page-Container, bekommt Sektionen
- `components/settings/tenant/{base-data-section,modules-section,privacy-section,ai-provider-section}.tsx` — pro Sektion eine Form
- `loadServerAuth` erweitert um `tenantSettings` für den aktuellen Tenant
- `useAuth()` exportiert die Settings clientseitig
- `TopNav` + `ProjectRoomShell` filtern Tabs anhand `isModuleActive`
- Risiken/Entscheidungen/AI-Proposals API-Routen prüfen am Anfang `requireModuleActive('risks')` etc.

### Abhängigkeiten

Keine neuen npm-Pakete.

### Out-of-Scope-Erinnerungen (aus der Spec)

- Self-Service-Tenant-Signup
- Billing/Lizenzierung
- File-Upload (Branding-Logo bleibt URL-basiert)
- Per-Tenant-Custom-Translations über das de/en-Dictionary hinaus
- Reaktivierung nach 30-Tage-Grace
- Partial-Deletion (nur dieses Projekt löschen) — separater Pfad

### Festgelegte Design-Entscheidungen

**Frage 1 — Modul-Toggle-Set: Option A (alle gebauten Module).** `risks`, `decisions`, `ai_proposals`, `audit_reports` sind toggle-bar. `connectors`, `vendor`, `communication` erscheinen als ausgegraut „Demnächst" — Schema akzeptiert sie schon, UI rendert disabled.

**Frage 2 — Defaults beim Tenant-Insert: Option A (privacy-by-default).** Alle vier toggle-baren Module aktiv, `default_class=3`, `ai_provider_config={ external_provider: 'none' }`. Externer Provider wird zum expliziten Opt-in, das ein Tenant-Admin pro Tenant aktivieren muss. Matcht die V2-Architektur-Direktive „KI als Vorschlagsschicht, nie still" und harmoniert mit der aktuellen Vercel-Konfig (kein API-Key gesetzt).

**Frage 3 — Sprach-Setting: Option A (speichern, wirkungslos bis i18n).** Das Select rendert mit `de | en`, persistiert die Auswahl, hat aber heute keinen sichtbaren UI-Effekt — die i18n-Schicht ist ein eigener Slice. Damit bleibt das Schema stabil und ST-01 zählt als erfüllt; ein Hinweistext im Select erklärt den Status.

Alle drei Entscheidungen sind backend-/schema-identisch — sie steuern nur Defaults und UI-Form.

## Implementation Notes
_To be added by /frontend and /backend_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
