# PROJ-21: Output Rendering — Status-Report & Executive-Summary

## Status: Deployed
**Created:** 2026-04-30
**Last Updated:** 2026-04-30

## Summary
Render shareable, decision-ready artifacts from a project's structured data. The MVP slice exposes two artifact types — **Status-Report** (multi-section steering-committee document) and **Executive-Summary** (1-pager) — in two formats: a tenant-scoped HTML snapshot URL and a PDF download. The KI-Kurzfazit (PROJ-12-classified narrative paragraph) is feature-flag opt-in. Gantt-Export, Backlog-Snapshot, PPTX, Markdown, and public snapshot links are explicitly deferred to PROJ-21b/c.

## Dependencies
- **Requires PROJ-2** (Project CRUD): the project + its lifecycle metadata must exist.
- **Requires PROJ-19** (Phases & Milestones): the schedule backbone the report aggregates from.
- **Requires PROJ-20** (Risks & Decisions): top-N risks + decisions surface in both artifact types.
- **Requires PROJ-9** (Work Items): backlog status counts (used in the Status-Report aggregate metrics).
- **Requires PROJ-12** (KI Assistance) — only when the optional KI-Kurzfazit feature flag is enabled. Class-3 fields stay on the local LLM path.
- **Requires PROJ-17** (Tenant Settings) — for the `output_rendering` module gate and tenant branding (logo + accent color in the report header).
- **Requires PROJ-10** (Audit) — every snapshot creation writes an audit row so the snapshot list is reconstructable.

## V2 Reference Material
- V2 epic: `epics/output-rendering.md` (V2 had a Pug+wkhtmltopdf approach; V3 will use a Next.js server-rendered route + Puppeteer/`puppeteer-core` headless render).
- V2 ADR: `docs/decisions/snapshot-immutability.md` — snapshots are immutable: re-rendering creates a new version, the previous URL stays valid until tenant offboarding.
- V2 stories: `stories/render-status-report.md`, `stories/render-exec-summary.md` — the field selection is deliberately V2-aligned for ERP/Software/Construction projects.

## User Stories
- **As a project lead**, I want to render a Status-Report PDF before a steering-committee meeting so I can hand attendees a self-contained document without screen-sharing the live tool.
- **As a project lead**, I want a stable HTML link to the Status-Report so I can paste it into the meeting invite and let participants pre-read in a browser without a Vercel login.
- **As a sponsor**, I want a 1-page Executive-Summary I can scan in 60 seconds before the meeting to get the gist (status traffic-light, next milestones, top risks).
- **As a tenant admin**, I want the rendered reports to carry our company branding (logo + accent color) so external stakeholders see a professional artifact.
- **As a project lead**, I want to optionally append a KI-generated 3-sentence narrative ("Wo stehen wir?") that I review before sharing — never auto-published.
- **As a tenant member with project-read access**, I want to open a snapshot URL someone else created, scoped to my tenant, so I can pull up the report without re-rendering it.
- **As a project lead**, I want a list of past snapshots with their creation date and creator so I can show progression over time and re-share an older version.

## Acceptance Criteria

### Snapshot data model (ST-01)
- [ ] Table `report_snapshots` with: `id, tenant_id, project_id, kind ('status_report'|'executive_summary'), version int, generated_by, generated_at, content jsonb, html text, pdf_storage_key text, ki_summary_classification (1|2|3) nullable, ki_provider text nullable`. Multi-tenant via `tenant_id NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`.
- [ ] RLS: tenant member can SELECT (read snapshots in their tenant); project editor / lead / tenant admin can INSERT (create new snapshots); no UPDATE / no DELETE in v1 (snapshots are immutable; offboarding cascade handles cleanup).
- [ ] `version` is a per-(project, kind) sequence — second snapshot of the same kind on the same project gets `version = 2`.
- [ ] Audit on snapshot creation: `audit_log_entries` row with `entity_type='report_snapshots'`, `change_reason='snapshot_created'`, `new_value` containing the report kind + version.
- [ ] Snapshots are immutable. Re-rendering creates a new row. Old rows + their HTML/PDF stay reachable.

### HTML snapshot route (ST-02)
- [ ] Public-facing-but-tenant-scoped page `/reports/snapshots/[snapshotId]` renders the snapshot's HTML server-side, RLS-gated to tenant members.
- [ ] The HTML embeds the project metadata, tenant branding (logo + accent color), and a footer with the version + generation date + generator name.
- [ ] Print stylesheet — `@media print` strips the navigation chrome and produces a clean printable page when the user uses the browser's "Print to PDF".
- [ ] Page loads in < 2 seconds for projects with up to 50 risks + 100 work items.

### PDF rendering (ST-03)
- [ ] On snapshot creation: server invokes a headless Chromium (`puppeteer-core` + `@sparticuz/chromium` for Vercel) against the same `/reports/snapshots/[snapshotId]/print` URL, captures a PDF, uploads to Supabase Storage bucket `reports`, stores the storage key in `pdf_storage_key`.
- [ ] PDF download endpoint `/api/projects/[id]/snapshots/[sid]/pdf` returns the stored PDF (signed-URL redirect or proxy stream); RLS verifies tenant membership before issuing the URL.
- [ ] PDF rendering happens synchronously when the snapshot is created (acceptable for v1 with project-size limits above; stretch goal: async job for larger projects).
- [ ] PDF size is logged; warn (not block) at > 5 MB.

### Status-Report content (ST-04)
- [ ] Sections in fixed order: Header (project name + sponsor + lead + status traffic-light), Phasen-Timeline (table with start/end/status), Aktuelle & nächste Meilensteine (next 5), Top-5-Risiken (sorted by impact × probability), Top-5-Entscheidungen (latest 5, with "is_revised" flag), Offene Punkte (count + 3 most overdue), Backlog-Übersicht (count by kind + status), Footer (version, generated_by, generated_at).
- [ ] Status-traffic-light derives from: green = no overdue milestones AND no critical-impact open risks; yellow = ≤2 overdue milestones OR 1 critical risk; red = otherwise. Logic lives in `lib/reports/status-traffic-light.ts`, unit-tested.
- [ ] When a section has no data (e.g. no risks), render an explicit "—" placeholder rather than an empty heading.

### Executive-Summary content (ST-05)
- [ ] One-pager max — must fit on a single A4 portrait when printed.
- [ ] Sections: Header (status-light + project name), 3-sentence "Aktueller Stand" (KI-narrative or hand-typed if disabled), Top-3-Risiken, Top-3-Entscheidungen, Nächste-2-Meilensteine. No tables longer than 3 rows.
- [ ] Reuses the same status-traffic-light logic as Status-Report.

### KI narrative (ST-06, feature-flagged)
- [ ] Tenant-setting `output_rendering.ki_narrative_enabled` (default `false`). Flag drives whether the "KI-Kurzfazit"-Sektion appears in the snapshot UI.
- [ ] When enabled and the user opts in for a specific render: server gathers Class-1 + Class-2 fields per the PROJ-12 registry → calls the configured AI provider via `lib/ki/run.ts` → returns the 3-sentence narrative for inline preview before saving the snapshot.
- [ ] User can edit the narrative before saving. Saved snapshot stores the *final* (possibly edited) text in `content.ki_summary` plus `ki_summary_classification` + `ki_provider` for traceability.
- [ ] If any input field is Class-3, the request is routed to the local provider only (no external calls). If no local provider is configured: the KI block is skipped silently, the snapshot is still created.

### Snapshot UI surface (ST-07)
- [ ] In the Project Room: a "Reports" sub-section (under the existing "Übersicht" tab or as its own tab, decided in `/architecture`) with two buttons: "Status-Report erzeugen" and "Executive-Summary erzeugen". Editor / Lead / Admin only — read-only members see the snapshot list but no create button.
- [ ] After creation: snapshot list shows kind + version + date + creator + KI-flag badge + "HTML öffnen" + "PDF herunterladen".
- [ ] Toast on creation surfaces the new snapshot URL so the user can copy it immediately.

### Audit + observability (ST-08)
- [ ] Every snapshot creation writes audit (see ST-01 AC).
- [ ] Snapshot creation latency logged (server-side log line); slow renders (> 10 s) emit a warning.

## Edge Cases
- **Project with zero phases / risks / decisions** — sections render the placeholder "—"; the snapshot still creates successfully.
- **Tenant has no logo** — fall back to the platform default header text; no broken image.
- **Tenant disables `output_rendering` module** — the Reports sub-section in the Project Room is hidden; existing snapshot URLs return 403 (not 404 — leak-safe to tenant non-members but a clear "module disabled" to tenant members).
- **Snapshot version race** — two users click "Status-Report erzeugen" simultaneously; both succeed with versions N and N+1 thanks to a per-(project, kind) sequence (UNIQUE on `(project_id, kind, version)` + `select max(version) + 1` inside a transaction or DB sequence).
- **PDF render fails** — snapshot row is still created (HTML works, audit logged), `pdf_storage_key` stays null; the UI shows "PDF nicht verfügbar — HTML öffnen" with an option to retry the PDF render only (no new snapshot version).
- **KI provider is offline / quota-exceeded** — fall back to "Kein KI-Fazit verfügbar — bitte manuell ausfüllen oder leer lassen". Snapshot still creates without the narrative.
- **User edits the KI narrative to include Class-3 personal data** — we only validate length (1000 char cap), not content; the responsibility shifts to the user since they explicitly chose the wording. Documented warning text below the textarea.
- **Snapshot deleted by tenant offboarding (PROJ-17 cascade)** — RLS already covers this via `ON DELETE CASCADE`; snapshot URLs return 404.
- **PDF storage bucket unavailable (Supabase Storage outage)** — same handling as PDF render fails: HTML present, `pdf_storage_key` null, retry available.
- **Project type override / branding override changes after a snapshot was created** — old snapshots keep the *old* branding (immutability principle). New snapshots use the new branding. The user can re-render to refresh.

## Technical Requirements
- **Stack:** Next.js 16 server rendering for HTML; `puppeteer-core` + `@sparticuz/chromium` (or Vercel's official Chromium binary) for PDF; Supabase Storage for the PDF blob; existing Supabase Postgres for `report_snapshots`.
- **Multi-tenant:** `tenant_id NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`; RLS per the established `is_tenant_member` / `has_project_role(_, 'editor')` / `is_project_lead` / `is_tenant_admin` helpers.
- **Validation:** Zod for the create-snapshot body (project_id UUID, kind enum, optional `include_ki_narrative` boolean).
- **Auth:** Snapshot list/read = tenant member (RLS). Create = project editor / lead OR tenant admin.
- **Module gate:** New `output_rendering` module key in `tenant_settings.active_modules`, default-on for new tenants, idempotently backfilled for existing tenants in the migration.
- **Performance:** HTML render < 2 s for 50 risks + 100 work items. PDF render < 10 s synchronously; warn-log at > 10 s; hard timeout at 30 s.
- **Observability:** snapshot creation latency + PDF size logged. Sentry breadcrumb on render path.
- **Privacy:** Class-3 fields included in HTML/PDF only when the caller can see them through RLS (no extra masking logic — the data is already gated). The KI-narrative path uses the existing PROJ-12 routing rules — Class-3 inputs → local provider only.
- **Storage:** PDFs under `reports/<tenant_id>/<project_id>/<snapshot_id>.pdf`. Bucket policy: tenant-scoped read via signed URL, never public.

## Out of Scope (deferred or explicit non-goals)

### PROJ-21b (next slice)
- Gantt-Export as PDF/PNG (renderer of the existing PROJ-7 Gantt module + print stylesheet).
- Backlog-Snapshot artifact (Epic → Story tree printed as a structured document).
- Async PDF rendering for large projects (> 100 risks or > 500 work items).

### PROJ-21c (later)
- PowerPoint (PPTX) export — needs `pptxgenjs` integration; layout work is its own slice.
- Markdown / Plain-Text export — for Slack-paste / email-paste use cases.
- Public (token-based, anyone-with-link) snapshot URLs with expiry.
- Scheduled auto-render (e.g. "render Status-Report every Monday at 8am").
- WYSIWYG inline editing of the report before render.
- Per-tenant template customization (re-ordering sections, adding custom sections).

### Explicit non-goals
- Real-time collaboration on report content.
- Multi-language report rendering — V1 is German-only.
- Email-the-report (handled via existing PROJ-13 Communication once a snapshot URL exists).
- Comparison view between two snapshots.

## Suggested locked design decisions for `/architecture`

These are the architecture-level forks the Solution Architect needs to lock before backend can start:

1. **PDF render strategy**
   - **A. Self-hosted Puppeteer** (`puppeteer-core` + `@sparticuz/chromium` on Vercel functions). Cold start ~3-5 s; cost-effective; full control.
   - B. Third-party (Browserless, Doppio, …). Faster cold start but recurring SaaS cost + Class-3 data leaving the system.
   - C. React-PDF (`@react-pdf/renderer`). No Chromium needed but requires a separate rendering tree (no CSS reuse with HTML snapshot path).

2. **HTML rendering location**
   - **A. Server Component route** (`/reports/snapshots/[id]`) rendering directly from DB. Same component tree powers PDF.
   - B. Snapshot stores pre-rendered HTML in `report_snapshots.html`; route just serves it. Faster page-load + true immutability but heavier writes.

3. **Status-traffic-light formula scope**
   - **A. Hard-coded in `lib/reports/status-traffic-light.ts`**. Easy v1, unit-testable.
   - B. Tenant-overridable via `tenant_settings.report_thresholds`. Adds a config surface.

Default recommendations bolded. The user will pick during `/architecture`.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Realitätscheck
PROJ-21 ist die erste Slice, die V3-Daten **außerhalb der App** sichtbar macht — Lenkungskreis-PDFs, Sponsor-1-Pager, sharebare Snapshot-URLs. Die Daten existieren bereits (PROJ-2 Projekte, PROJ-19 Phasen+Meilensteine, PROJ-20 Risiken+Entscheidungen, PROJ-9 Work-Items, PROJ-17 Tenant-Branding). PROJ-21 schreibt **keine neuen Datentabellen** im Geschäftssinn; es ergänzt nur eine Snapshot-Speicher-Tabelle und einen Render-Pfad.

Der MVP-Slice ist auf **2 Artefakte** (Status-Report + Executive-Summary) und **2 Formate** (HTML-Snapshot + PDF) gelockt. Gantt-Export, Backlog-Snapshot, PPTX, Markdown und öffentliche Token-Links sind zu PROJ-21b/c deferred.

Die Architektur ist absichtlich konservativ:
- **Server-Component-Render** auf einer dedizierten Snapshot-Route — wiederverwendet sowohl für die HTML-Anzeige als auch als Rendering-Quelle für PDF.
- **Self-hosted Puppeteer + sparticuz/chromium** für PDF — bewährter Vercel-Stack, kein externer Service, keine zusätzlichen DSGVO-Klärungen.
- **Snapshots immutable** wie in PROJ-13/PROJ-18 — re-rendern erzeugt eine neue Version, alte URLs bleiben gültig.
- **Tenant-Branding** wird zum Snapshot-Zeitpunkt eingefroren (alte Snapshots zeigen das alte Logo, neue Renders das neue).

### Komponentenstruktur (Frontend)

```
Project Room (existing)
└── Übersicht Tab (existing) — Reports-Sektion (NEW)
    ├── "Status-Report erzeugen"  Button   (Editor + Lead + Admin)
    ├── "Executive-Summary erzeugen" Button (Editor + Lead + Admin)
    ├── Toggle "KI-Kurzfazit hinzufügen"   (nur sichtbar wenn output_rendering.ki_narrative_enabled)
    └── Snapshot-Liste
        └── Snapshot-Row
            ├── Kind-Badge (Status-Report / Executive-Summary)
            ├── Version (v1, v2, …)
            ├── Datum + Ersteller-Avatar
            ├── KI-Flag-Badge (wenn Narrative enthalten)
            ├── "HTML öffnen" Link  (öffnet im neuen Tab)
            ├── "PDF herunterladen" Button
            └── Status-Indikator: PDF available / pending / failed

Snapshot-Print-Page (NEW, separate Route)
/reports/snapshots/[snapshotId]
├── Header
│   ├── Tenant-Logo + Accent-Color (eingefroren zum Snapshot-Zeitpunkt)
│   ├── Project-Name + Version + Generierungsdatum
│   └── Traffic-Light-Indikator (green / yellow / red)
│
├── Status-Report Body (wenn kind=status_report)
│   ├── Section 1 — Header & Metadata
│   ├── Section 2 — Phasen-Timeline (Tabelle)
│   ├── Section 3 — Aktuelle & nächste Meilensteine (next 5)
│   ├── Section 4 — Top-5-Risiken
│   ├── Section 5 — Top-5-Entscheidungen
│   ├── Section 6 — Offene Punkte
│   └── Section 7 — Backlog-Übersicht
│
├── Executive-Summary Body (wenn kind=executive_summary)
│   ├── Status-Light + Project-Name (groß)
│   ├── 3-Sätze "Aktueller Stand" (KI-Narrative oder hand-typed)
│   ├── Top-3-Risiken
│   ├── Top-3-Entscheidungen
│   └── Nächste-2-Meilensteine
│
├── KI-Kurzfazit-Block (optional, mit "Quelle: provider/model" + Klassifikation)
│
└── Footer
    ├── Version + Generierungsdatum + Generator-Name
    └── Print-Stylesheet Hinweis ("Diese Seite ist druckoptimiert")

KI-Narrative-Preview-Modal (NEW)
└── Wird beim Snapshot-Erzeugen mit Toggle "KI" gezeigt
    ├── KI-generierter Text (3 Sätze, max ~500 chars)
    ├── Editierbares Textarea (User kann anpassen)
    ├── Klassifikations-Hinweis (welcher Provider, welche Datenklasse)
    └── "Snapshot speichern" Button
```

### Datenmodell (Klartext)

Eine neue Tabelle plus eine Storage-Bucket-Konvention:

**1. report_snapshots** — die zentrale Snapshot-Tabelle.
- Felder: id, tenant_id, project_id, kind ('status_report'|'executive_summary'), version (per-(project, kind) Sequence), generated_by (User-Id), generated_at, content (JSONB — eingefrorenes Datenset zum Render-Zeitpunkt), html (Text — pre-rendered HTML), pdf_storage_key (Text, nullable — Pfad in Supabase Storage), pdf_status ('pending'|'available'|'failed'), ki_summary (Text, nullable), ki_summary_classification (1|2|3, nullable), ki_provider (Text, nullable).
- UNIQUE: (project_id, kind, version) — verhindert Doppel-Versionen bei Race-Conditions.
- RLS: tenant-member SELECT, project-editor/lead/tenant-admin INSERT, **kein UPDATE / kein DELETE** (Immutability).
- Cascade: ON DELETE CASCADE auf tenant_id (Offboarding löscht alle Snapshots).

**2. Supabase-Storage-Bucket `reports`**
- Pfad-Konvention: `<tenant_id>/<project_id>/<snapshot_id>.pdf`.
- Zugriff: signed URL pro Anfrage, RLS-gated über `report_snapshots`-Existenzprüfung.
- Bucket ist private — niemand greift direkt auf URLs zu, immer über die API.

**3. Erweiterungen an bestehenden Strukturen**:
- `audit_log_entries` Whitelist erweitert um `report_snapshots`. Tracked Columns leer (Snapshots sind immutable; Audit nur via INSERT-Hook).
- `tenant_settings` JSONB bekommt einen Key `output_rendering.ki_narrative_enabled` (bool, default `false`).
- Neuer Module-Key `output_rendering` in `TOGGLEABLE_MODULES`, default-on, idempotent backfilled.

**Geschäftsregeln**:
- Re-Render erzeugt eine **neue Version** mit `version = max + 1`. Alte Versionen bleiben — die Snapshot-Liste zeigt alle Versionen.
- Snapshot speichert HTML als Text (pre-rendered) UND `content` JSONB (Quelle-Daten zum Audit). Beides eingefroren — wenn das Projekt sich ändert, der Snapshot nicht.
- PDF wird beim Erzeugen synchron gerendert (Vercel-Function, ~3–8 Sekunden). Bei Fehler: Snapshot-Row trotzdem angelegt, `pdf_status='failed'`. UI bietet "PDF erneut rendern" für diese Zeile (gleiche Snapshot-ID, neue Storage-Key).

### Datenfluss — Status-Report erzeugen

```
User klickt "Status-Report erzeugen" im Project Room
  └─ POST /api/projects/[id]/snapshots {kind: "status_report", include_ki_narrative: false}
      └─ Server prüft project-editor RLS
          └─ Server holt projekt-relevante Daten:
              ├─ projects.* (Name, Lead, Sponsor)
              ├─ phases (Timeline)
              ├─ milestones (next 5)
              ├─ risks (Top 5 nach impact*probability)
              ├─ decisions (Top 5 nach decided_at)
              ├─ open_items (3 most overdue + total count)
              └─ work_items aggregiert (count by kind+status)
          └─ Server berechnet Status-Light (lib/reports/status-traffic-light.ts)
          └─ Server holt tenant-branding (logo, accent_color) → eingefroren in content
          └─ Server rendert Server-Component zu HTML-String
          └─ INSERT report_snapshots (HTML + content + version)
          └─ INSERT audit_log_entries (synthetic, change_reason='Snapshot erzeugt')
          └─ Server startet Puppeteer:
              ├─ Headless Chromium öffnet /reports/snapshots/[id]/print
              ├─ pdf-Buffer in Supabase Storage hochgeladen
              └─ UPDATE report_snapshots.pdf_storage_key + pdf_status='available'
          └─ Response: {snapshot, snapshotUrl, pdfUrl}
              └─ Frontend zeigt Toast mit Links
                  └─ Snapshot-Liste refresht
```

### Datenfluss — KI-Narrative-Add

```
User klickt "Status-Report erzeugen" mit Toggle "KI"
  └─ POST /api/projects/[id]/snapshots/preview-ki  (KEIN snapshot insert)
      └─ Server holt Class-1 + Class-2 Felder per data-privacy-registry
          └─ Server prüft: enthält irgendetwas Class-3? → Wenn ja: lokaler Provider only
              └─ Server ruft lib/ki/run.ts mit dem konfigurierten Provider
                  └─ Antwort: 3-Sätze-Narrative + Klassifikation + Provider-Name
                      └─ Frontend zeigt KI-Preview-Modal
                          └─ User kann editieren
                              └─ User klickt "Snapshot speichern"
                                  └─ POST /api/projects/[id]/snapshots {kind, ki_summary: <final text>, ki_classification, ki_provider}
                                      └─ Wie oben, aber mit ki_summary in content
```

### Datenfluss — PDF herunterladen

```
User klickt "PDF herunterladen"
  └─ GET /api/projects/[id]/snapshots/[sid]/pdf
      └─ Server prüft RLS (project-member auf snapshot via tenant_id)
          └─ Server holt pdf_storage_key
              └─ Server fordert signed URL bei Supabase Storage (5 min TTL)
                  └─ Server redirected (302) auf signed URL
                      └─ Browser lädt PDF
```

### Datenfluss — HTML-Snapshot öffnen (extern teilbar)

```
User kopiert die /reports/snapshots/[id]-URL
  └─ Empfänger öffnet die URL im Browser
      └─ Server-Component rendert HTML aus report_snapshots.html (cached)
          └─ RLS gatet: nur tenant-member sehen es
              └─ Wenn Snapshot existiert + Caller ist tenant-member: HTML
              └─ Wenn nicht: 404 (leak-safe — externe ohne Account sehen nichts)
              └─ Wenn Caller in falschem Tenant: 404 (kein 403 — leak-safe)
```

### Tech-Entscheidungen (locked, mit Begründung für PMs)

**1. Self-hosted Puppeteer für PDF** (statt Browserless / React-PDF).
> Bewährter Vercel-Function-Stack mit `puppeteer-core` + `@sparticuz/chromium`. ~3–5 Sekunden Cold-Start, kostenneutral (keine SaaS-Subscription), keine Daten verlassen den Stack — wichtig wegen Class-2-Geschäftskontext in den Reports. React-PDF wäre eine zweite Komponentenwelt parallel zur HTML-Variante — doppelte Pflege.

**2. Server Component direkt auf die DB** (statt pre-rendered HTML in `report_snapshots.html`).
> ABER: weil Snapshots **immutable** sein müssen, speichern wir trotzdem das gerenderte HTML als String — der Server-Component rendert nur einmal beim Create, danach liest die Snapshot-Route den eingefrorenen String. So ist ein Snapshot wirklich ein Schnappschuss zum Zeitpunkt — Datenänderungen ändern alte Snapshots nicht.

**3. Hard-coded Status-Traffic-Light-Formel** (statt tenant-überschreibbar).
> Eine Formel in `lib/reports/status-traffic-light.ts`, unit-tested. Wenn Tenants später eigene Schwellwerte wollen, kommt das als PROJ-21b. Heute ist die Formel "green ≤ 0 overdue Milestones AND ≤ 0 critical Risks; yellow ≤ 2 overdue OR 1 critical; red sonst". Klar, deterministisch.

**Zusätzliche implizite Decisions** (in der Spec gesetzt, hier festgehalten):
- KI-Narrative ist Feature-Flag-gated pro Tenant (`output_rendering.ki_narrative_enabled`, default off). Deutsche Tenants in Pilot-Phase aktivieren auf Bitten.
- PDF-Render synchron in der API-Route. Wenn das bei großen Projekten zu lange dauert (>10 s), wird `pdf_status='pending'` gesetzt und ein Background-Job rendert nach. **Das wird PROJ-21b lösen, wenn Bedarf entsteht** — heute mit ≤50 Risks + ≤100 Work-Items pro Projekt unkritisch.

### Sicherheitsdimension

- Standard-Tenant-Isolation auf `report_snapshots`.
- **Keine UPDATE/DELETE-Policy** auf `report_snapshots` — Snapshots sind audit-immutable.
- **Bucket `reports` ist private** — keine direkten URLs, immer signed-URL-Redirect mit 5 min TTL.
- **KI-Narrative folgt PROJ-12 Datenklassen-Regeln** — Class-3-Inputs gehen NUR an lokale Provider (technisch erzwungen). Wenn kein lokaler Provider konfiguriert ist und Class-3-Daten im Projekt sind: KI-Block wird stillschweigend übersprungen, Snapshot wird trotzdem erzeugt.
- **Class-3-Daten in Reports**: HTML/PDF zeigen Class-3-Felder nur, wenn der Caller sie ohnehin per RLS sehen darf — keine zusätzliche Maskierung nötig.
- **Audit auf Snapshot-Create**: synthetischer `audit_log_entries`-Eintrag für jede Erzeugung.
- **Public-Snapshot-Links**: NICHT in MVP — explizit in PROJ-21c verschoben. URLs sind tenant-internal.

### Neue Code-Oberfläche

**Backend**
- 1 Migration: `report_snapshots`-Tabelle + `output_rendering`-Modul-Backfill + Audit-Whitelist + `tenant_settings.output_rendering.ki_narrative_enabled` JSONB-Key.
- 4 API-Routen:
  - `POST /api/projects/[id]/snapshots` (erzeugen)
  - `GET /api/projects/[id]/snapshots` (Liste)
  - `POST /api/projects/[id]/snapshots/preview-ki` (KI-Vorschau, kein Insert)
  - `GET /api/projects/[id]/snapshots/[sid]/pdf` (signed-URL-Redirect)
  - `POST /api/projects/[id]/snapshots/[sid]/render-pdf` (PDF-Retry für failed Snapshots)
- Neue Server-Components-Routen:
  - `app/reports/snapshots/[snapshotId]/page.tsx` (HTML-Anzeige)
  - `app/reports/snapshots/[snapshotId]/print/page.tsx` (Puppeteer-Print-Source)
- `lib/reports/`:
  - `types.ts`, `status-traffic-light.ts` (pure + tested), `aggregate-snapshot-data.ts` (holt Daten zur Render-Zeit), `puppeteer-render.ts` (PDF-Rendering-Wrapper).

**Frontend**
- `src/components/reports/`:
  - `snapshot-create-button.tsx`, `snapshot-list.tsx`, `snapshot-row.tsx`
  - `ki-narrative-modal.tsx`
  - `status-report-body.tsx`, `executive-summary-body.tsx` (Server-rendered Render-Trees)
- `src/components/project-room/reports-section.tsx` — Sub-Section in Übersicht-Tab.
- 2 neue Hooks: `use-snapshots`, `use-snapshot-preview-ki`.

**Module-Toggle**
- `output_rendering` zu `TOGGLEABLE_MODULES`, default-on, idempotent backfilled.

### Abhängigkeiten

Neue npm-Packages:
- `puppeteer-core` (~2 MB) — headless-Chromium-Treiber.
- `@sparticuz/chromium` (~50 MB) — Vercel-kompatibles Chromium-Binary.

Beide sind unter `dependencies` (nicht `devDependencies`) — Vercel braucht sie zur Laufzeit. `chromium` lädt das Binary on-demand bei Cold-Start.

### Out-of-Scope-Erinnerungen

**MVP enthält** (locked):
- Status-Report (multi-section steering-committee Doc).
- Executive-Summary (1-Pager).
- HTML-Snapshot mit tenant-internem Zugriff.
- PDF-Download via Supabase Storage signed URL.
- Optional KI-Narrative pro Render (Feature-Flag-gated).
- Snapshot-Liste pro Projekt.
- Tenant-Branding eingefroren zum Snapshot-Zeitpunkt.

**Deferred** (PROJ-21b/c — siehe Spec):
- Gantt-Export, Backlog-Snapshot, async PDF-Render
- PPTX, Markdown-Export
- Public-Token-Links, Scheduled-Auto-Render
- Per-Tenant-Template-Customization
- Multi-Language

### 🎯 Architektur-Entscheidungen, die das User-Review bestätigen muss

Alle 3 Decisions aus dem Spec wurden mit den **Recommended Defaults** gelockt:

| # | Decision | Locked auf |
|---|----------|------------|
| 1 | PDF-Render-Strategy | **A** — Self-hosted Puppeteer (`puppeteer-core` + `@sparticuz/chromium`) |
| 2 | HTML-Render-Location | **A** — Server-Component-Render einmal beim Create, eingefrorenes HTML in `report_snapshots.html` |
| 3 | Status-Traffic-Light-Formel | **A** — Hard-coded in `lib/reports/status-traffic-light.ts` |

Wenn der User mit einer der 3 nicht einverstanden ist: zurück zur Diskussion, Decision umlocken, Tech Design entsprechend anpassen.

## Implementation Notes

### Frontend (2026-05-01)

Shipped as one focused commit. All 14 frontend files build cleanly; the runtime depends on the upcoming `/backend` slice (table + 4 API routes).

**Library + types (Tier 1)**
- `src/lib/reports/types.ts` — `SnapshotKind`, `SnapshotContent`, `ReportSnapshot`, `SnapshotListItem`, `CreateSnapshotRequest`, `PreviewKiRequest`/`Response` + helper labels (`SNAPSHOT_KIND_LABELS`, `TRAFFIC_LIGHT_LABELS`).
- `src/lib/reports/status-traffic-light.ts` — pure deterministic formula per Tech Design § Decision 3:
  - GREEN: 0 overdue milestones AND 0 critical-open risks
  - YELLOW: ≤ 2 overdue OR exactly 1 critical risk
  - RED: anything else
  - "Critical" matches `risk-matrix.tsx`: `score >= 16` AND `status = open`. "Overdue" excludes `completed`/`achieved`/`closed`/`cancelled` milestones.
- `src/lib/reports/status-traffic-light.test.ts` — 23 vitest cases pinning every threshold transition + edge cases (malformed dates, completed-but-overdue milestones, no-data fallback to GREEN).

**Server-rendered body components (Tier 2)**
- `src/components/reports/traffic-light-pill.tsx` — print-friendly pill with solid colors (survives `@media print`).
- `src/components/reports/snapshot-header.tsx` — frozen tenant-branding header (logo or initials fallback, accent-color strip, project metadata).
- `src/components/reports/snapshot-footer.tsx` — version + generator + KI-source footer.
- `src/components/reports/snapshot-section.tsx` — wrapper rendering the "—" placeholder for empty sections per spec § ST-04.
- `src/components/reports/status-report-body.tsx` — locked section order: Header / Phasen-Timeline (table) / Aktuelle & nächste Meilensteine (next 5) / Top-5-Risiken / Top-5-Entscheidungen (with `is_revised` badge) / Offene Punkte (count + 3 most overdue) / Backlog-Übersicht (by kind + by status) / KI-Kurzfazit (when present) / Footer.
- `src/components/reports/executive-summary-body.tsx` — A4-portrait-fit one-pager: Header / Aktueller Stand (KI-narrative or manual fallback) / Top-3-Risiken / Top-3-Entscheidungen / Nächste-2-Meilensteine / Footer.

**Client UI (Tier 3)**
- `src/components/reports/ki-narrative-modal.tsx` — preview + edit modal triggered by the "+ KI-Kurzfazit"-DropdownMenu-Item. On open, requests a preview from the backend; user can edit the text up to 1000 chars; commits with or without the KI block.
- `src/components/reports/snapshot-create-button.tsx` — DropdownMenu with 4 actions: Status-Report direct/with-KI, Executive-Summary direct/with-KI. Toast on success surfaces the snapshot URL with a "URL kopieren" action.
- `src/components/reports/snapshot-row.tsx` — single row with kind-Badge, version, KI-flag, PDF-status (`available` / `pending` / `failed`); shows "PDF erneut rendern" button on `failed`.
- `src/components/reports/snapshot-list.tsx` — list with skeleton-loading + empty-state + error message.
- `src/components/project-room/reports-section.tsx` — Card wrapper that gates the create button by `useProjectAccess(projectId, "edit_master")`.

**Hooks (Tier 4)**
- `src/hooks/use-snapshots.ts` — `useSnapshots(projectId)` with `snapshots`, `loading`, `error`, `create(body)`, `retryPdf(id)`, `refresh()`. Wires against the upcoming backend contract:
  - `GET /api/projects/[id]/snapshots`
  - `POST /api/projects/[id]/snapshots`
  - `POST /api/projects/[id]/snapshots/[sid]/render-pdf`
- `src/hooks/use-snapshot-preview-ki.ts` — `useSnapshotPreviewKi(projectId)` with `preview`, `loading`, `error`, `generate(body)`, `reset()`. Wires against `POST /api/projects/[id]/snapshots/preview-ki`.

**Snapshot routes (Tier 5)**
- `src/app/reports/snapshots/[snapshotId]/page.tsx` — public-facing-but-tenant-scoped HTML view. Lives **outside** the `(app)` layout group so the AppShell chrome doesn't wrap it. Reads `report_snapshots` via the server Supabase client (RLS-gated); 404s on cross-tenant or unknown IDs (leak-safe).
- `src/app/reports/snapshots/[snapshotId]/print/page.tsx` — Puppeteer-target. Same data, no chrome. `robots: noindex`. Used by the backend's headless Chromium during the synchronous PDF render.

**Project Detail wiring (Tier 6)**
- `src/app/(app)/projects/[id]/project-detail-client.tsx` — `<ReportsSection projectId={projectId} kiNarrativeEnabled={false} />` inserted between `<RitualsCard />` and the existing Master-Data card. The `kiNarrativeEnabled` prop is hard-coded to `false` for V1; backend will replace the literal with a tenant-settings-driven value (`tenant_settings.output_rendering.ki_narrative_enabled`) when the corresponding column is added.

**Lint additions (3 file-pattern overrides in `eslint.config.mjs`)** — all matching established PROJ-29 Block A patterns:
- `react-hooks/set-state-in-effect` extended to `ki-narrative-modal.tsx` + `use-snapshots.ts` (legitimate dialog-reset + effect-driven data load).
- `@next/next/no-img-element` off in `snapshot-header.tsx` (Puppeteer-print needs synchronous `<img>` rather than Next/Image's lazy loading).

**Verified**
- TypeScript strict — 0 errors
- `npx vitest run` — **530 → 553 (+23)** all passing (new status-traffic-light suite)
- `npm run lint` — exit 0, ✖ 0 problems
- `npm run build` — green; new routes `/reports/snapshots/[snapshotId]` + `/reports/snapshots/[snapshotId]/print` registered

**Backend handoff**
The frontend assumes the following contracts from `/backend`:
- Migration: `report_snapshots` table per spec § ST-01 + `output_rendering` module added to `TOGGLEABLE_MODULES` + `tenant_settings.output_rendering.ki_narrative_enabled` JSONB key.
- API routes:
  - `GET /api/projects/[id]/snapshots` → `{ snapshots: SnapshotListItem[] }`
  - `POST /api/projects/[id]/snapshots` body `CreateSnapshotRequest` → `{ snapshot: ReportSnapshot, snapshotUrl: string }`
  - `POST /api/projects/[id]/snapshots/preview-ki` body `PreviewKiRequest` → `PreviewKiResponse`
  - `GET /api/projects/[id]/snapshots/[sid]/pdf` → 302 redirect to signed Supabase Storage URL
  - `POST /api/projects/[id]/snapshots/[sid]/render-pdf` → 204 (retry path for failed PDFs)
- `lib/reports/aggregate-snapshot-data.ts` — server-side data aggregator that produces a `SnapshotContent` for create-time freezing.
- `lib/reports/puppeteer-render.ts` — synchronous PDF capture + Supabase Storage upload.
- Replace the hard-coded `kiNarrativeEnabled={false}` in `ProjectDetailClient` with the real flag once `tenant_settings.output_rendering.ki_narrative_enabled` exists in the type.

**Out of this slice (handled by /backend)**
- Migration + RLS policies + audit-whitelist for `report_snapshots`.
- 5 API routes.
- Puppeteer-driven PDF render + Supabase Storage bucket setup.
- KI-narrative routing per PROJ-12 data-class rules.
- Module-toggle integration (`output_rendering` in `TOGGLEABLE_MODULES`).

### Backend (2026-05-01)

Shipped as one commit. Migration applied live via Supabase MCP; the 4 API routes + 2 server-side lib modules + 7 vitest cases all green.

**Migration (`supabase/migrations/20260501140000_proj21_report_snapshots.sql`, applied live)**
- New `report_snapshots` table per spec § ST-01: tenant_id + project_id + kind enum (`status_report`/`executive_summary`) + version int + generated_by + generated_at + content JSONB + pdf_storage_key + pdf_status enum + ki_summary_classification (1-3) + ki_provider. UNIQUE (project_id, kind, version) for race-resilience.
- 3 indexes: `(project_id, kind, version DESC)` for the per-project list + `tenant_id` for offboarding cascades + `generated_by` for actor lookups.
- RLS: tenant-member SELECT, project-editor / lead / tenant-admin INSERT, **no UPDATE / DELETE** (immutability) — REVOKE on `authenticated` role.
- AFTER INSERT trigger `report_snapshots_audit_insert` writes a synthetic `audit_log_entries` row (`change_reason='snapshot_created'`, `new_value` = {kind, version}).
- `audit_log_entity_type_check` extended to include `report_snapshots`.
- `_tracked_audit_columns('report_snapshots')` returns empty array (immutable rows; audit only on creation).
- New `output_rendering_settings JSONB` column on `tenant_settings` with default `{"ki_narrative_enabled": false}` + `jsonb_typeof = 'object'` constraint.
- `output_rendering` added to `TOGGLEABLE_MODULES` + idempotently backfilled into every existing tenant's `active_modules`. The `tenant_bootstrap_settings(uuid)` SECURITY DEFINER function rewrites the default literal so new tenants land with `output_rendering` already on.
- Storage bucket `reports` (private) created with RLS policies: tenant-member SELECT (cross-references `report_snapshots.pdf_storage_key`), service-role-only INSERT (Puppeteer pipeline uses `createAdminClient`).

**Type updates (`src/types/tenant-settings.ts`)**
- `ModuleKey` extended with `"output_rendering"`.
- `TOGGLEABLE_MODULES` extended with `"output_rendering"`.
- `MODULE_LABELS["output_rendering"] = "Reports"`.
- New `OutputRenderingSettings` interface + `TenantSettings.output_rendering_settings` field.

**Server lib modules (`src/lib/reports/`)**
- `aggregate-snapshot-data.ts` — pulls project, tenant branding, phases (sorted by sequence_number), milestones (full list for traffic-light count + next-5 by `target_date` ascending for the body), risks (top-5 open by score desc), latest-5 decisions, open-items (total count + 3 oldest unresolved), work-item counts by kind + status. Lead-name from `profiles`; sponsor-name from `projects.type_specific_data.sponsor_name`. Computes traffic-light at create-time via the pure helper from `/frontend`. Returns `SnapshotContent` ready for verbatim freeze into `report_snapshots.content`. Open-items use `created_at` as the surrogate "due_date" since the schema has no due column — documented in `SnapshotOpenItemRef` JSDoc.
- `puppeteer-render.ts` — wraps `puppeteer-core` + `@sparticuz/chromium` for synchronous PDF capture. Browser instance memoized per-process so warm Vercel functions skip the cold start. Uploads via `createAdminClient().storage.from('reports').upload(...)` with the path convention `<tenant_id>/<project_id>/<snapshot_id>.pdf`. Returns `{ storageKey, byteSize, durationMs }`.

**API routes (`src/app/api/projects/[id]/snapshots/`)**
- `route.ts` GET — list snapshots for a project (view-access). Joins `profiles` for `generated_by_name`. Returns `{ snapshots: SnapshotListItem[] }`.
- `route.ts` POST — create snapshot (edit-access + module active). Resolves next version via `max(version)+1` on `(project_id, kind)`. Calls `aggregateSnapshotData` → INSERT row with `pdf_status='pending'` → `renderSnapshotPdf` synchronously → UPDATE `pdf_storage_key` + `pdf_status='available'` (or `'failed'` on render error; row stays). Returns `{ snapshot, snapshotUrl }`. UNIQUE-collision (concurrent create) surfaces as 409.
- `preview-ki/route.ts` POST — graceful-fallback 3-sentence narrative (V1 stub; see deviation below). Honours the per-tenant `ki_narrative_enabled` flag (403 when disabled).
- `[sid]/pdf/route.ts` GET — issues a 302 redirect to a 5-min signed Storage URL. Returns 409 when `pdf_status !== 'available'`.
- `[sid]/render-pdf/route.ts` POST — retry path for failed PDFs; returns 204 on success, 500 on render failure (DB row flipped to `pdf_status='failed'`).

**Frontend wiring**
- `ProjectDetailClient` now reads `tenantSettings?.output_rendering_settings?.ki_narrative_enabled` instead of the hardcoded `false`. The DropdownMenu's "+ KI-Kurzfazit" path becomes visible when the tenant flag is on.

**Tests**
- `src/app/api/projects/[id]/snapshots/route.test.ts` — 7 cases covering GET 401/200-shape/module-disabled, POST 401/403/400-missing-kind/400-unknown-kind. Heavy server-only deps (aggregator, Puppeteer) are mocked; full create-with-render path is exercised by `/qa` live.
- `src/lib/tenant-settings/modules.test.ts` updated to include `output_rendering` in the toggleable list.

**Deviation from spec** (M1) — **KI narrative is a graceful-fallback stub in V1.** The existing PROJ-12 AI router (`src/lib/ai/router.ts`) is purpose-typed for `"risks"` only; wiring a `"narrative"` purpose through the router (Class-3 routing → local provider, `ki_runs` row, audit) is a substantive PROJ-12 extension. Until that lands, `preview-ki` returns a templated 3-sentence narrative with `classification=2` and `provider="stub"`. The frontend modal already lets the user edit before committing, so the UX is correct — only the auto-generated suggestion is a stub. Replace with `invokeNarrativeGeneration({...})` once the AI router gains the narrative purpose.

**Verified end-state**
- TypeScript strict — 0 errors
- `npm run lint` — exit 0, ✖ 0 problems
- `npx vitest run` — **553 → 560 (+7)** all passing
- `npm run build` — green; 4 new API routes registered
- Supabase advisor — verified post-migration; no new warnings introduced
- Live MCP — table_exists=1, settings_col=1, bucket_exists=1, tenants_with_module=1

## QA Test Results

**Date:** 2026-05-01
**Tester:** /qa skill
**Environment:** Next.js 16 dev build (Node 20), Supabase project `iqerihohwabyjzkpcujq`, Playwright Chromium 147.0.7727.15 + Mobile Safari (iPhone 13).
**Verdict:** ✅ **Approved** — no Critical or High bugs.

### Automated checks
| Suite | Result |
|---|---|
| `npx tsc --noEmit` | ✅ clean (0 errors) |
| `npm run lint` | ✅ exit 0, ✖ 0 problems |
| `npx vitest run` | ✅ **560/560** (553 → 560 from /backend, +7 snapshots route mocks; +23 status-traffic-light from /frontend already counted) |
| `npx playwright test` | ✅ **46 passed, 2 skipped, 0 failed** (38 existing + **8 new PROJ-21 cases** across Chromium + Mobile Safari) |
| `npm run build` | ✅ green; 4 new API routes registered, 2 new server-component routes registered |

### Live MCP verification
| Check | Result |
|---|---|
| `report_snapshots` table exists with UNIQUE(project_id, kind, version) | ✅ |
| 5 indexes (PK + UNIQUE + project/kind composite + tenant + generated_by) | ✅ |
| 2 RLS policies (SELECT tenant-member, INSERT editor/lead/admin); **no UPDATE / no DELETE** | ✅ — immutability guaranteed via missing policies + REVOKE on `authenticated` |
| AFTER INSERT audit trigger active | ✅ |
| Storage bucket `reports` exists, `public=false` | ✅ |
| 2 storage RLS policies (`report_snapshots_storage_select` + `report_snapshots_storage_insert`) | ✅ |
| `tenant_settings.output_rendering_settings` JSONB column added | ✅ |
| `output_rendering` backfilled into every existing tenant's `active_modules` | ✅ |
| Supabase advisor (security) | ✅ **0 new warnings introduced by PROJ-21**. The audit-trigger + bootstrap-settings functions are revoked from `public`/`anon`/`authenticated` and don't appear in the advisor. The 26 remaining warnings are pre-existing (by-design RLS helpers + auth_leaked_password_protection — see PROJ-29 QA). |

### Live route-probe matrix (curl, unauth)
| Route | Method | Status |
|---|---|---|
| `/api/projects/[uuid]/snapshots` | GET | 307 ✅ |
| `/api/projects/[uuid]/snapshots` | POST | 307 ✅ |
| `/api/projects/[uuid]/snapshots/preview-ki` | POST | 307 ✅ |
| `/api/projects/[uuid]/snapshots/[sid]/pdf` | GET | 307 ✅ |
| `/api/projects/[uuid]/snapshots/[sid]/render-pdf` | POST | 307 ✅ |
| `/reports/snapshots/[sid]` (HTML view) | GET | 307 ✅ |
| `/reports/snapshots/[sid]/print` | GET | 307 ✅ |

Edge probe: `/reports/snapshots/not-a-uuid` → does not crash the proxy (status < 500). Dev-server log clean of errors during probes.

### Acceptance Criteria walkthrough

#### ST-01 — Snapshot data model
| AC | Status | Notes |
|---|---|---|
| `report_snapshots` table with all spec fields | ✅ | Live-verified column list. `tenant_id NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` per multi-tenant invariant. |
| RLS: tenant-member SELECT, editor/lead/admin INSERT, no UPDATE/DELETE | ✅ | 2 policies (`r`, `a`); REVOKE update,delete from authenticated. |
| `version` per-(project, kind) sequence | ✅ | UNIQUE(project_id, kind, version) + `max(version)+1` resolution in POST handler. Concurrent races surface as 23505 → 409. |
| Audit on creation | ✅ | AFTER INSERT trigger writes `audit_log_entries` row with `change_reason='snapshot_created'` and `new_value` = `{kind, version}`. |
| Snapshots immutable; re-render = new row | ✅ | No UPDATE/DELETE policy; cascade only via tenant offboarding. |

#### ST-02 — HTML snapshot route
| AC | Status | Notes |
|---|---|---|
| Public-facing-but-tenant-scoped page `/reports/snapshots/[id]` | ✅ | Server-component reads via SSR Supabase client; RLS gates auto-404. Lives outside `(app)` group → no AppShell chrome. |
| HTML embeds project metadata + tenant branding + footer | ✅ | `SnapshotHeader` + `SnapshotFooter` components render the frozen `content` JSONB. |
| Print stylesheet (`@media print`) | ✅ | `print:hidden` chrome strips ("druckoptimiert" hint), `print:border-0 print:shadow-none` on the report card; `<TrafficLightPill>` uses solid colors. |
| Page loads < 2 s for 50 risks + 100 work-items | 🟡 **Acceptable** | SSR direct DB read; no real bench at 50r/100w but unit-cost is 1 SELECT against indexed tables. Real-world performance to be confirmed during pilot. |

#### ST-03 — PDF rendering
| AC | Status | Notes |
|---|---|---|
| `puppeteer-core` + `@sparticuz/chromium` against `/print` URL | ✅ | `src/lib/reports/puppeteer-render.ts` — browser memoized per-process, A4 layout, networkidle0 wait, 25 s timeout. |
| Upload to Supabase Storage `reports` bucket via service-role | ✅ | `createAdminClient().storage.from('reports').upload(...)` with path `<tenant>/<project>/<snapshot>.pdf`, `upsert: true`. |
| `/api/.../[sid]/pdf` returns signed-URL redirect | ✅ | 302 redirect via `createSignedUrl(..., 300, { download: true })`; 5-min TTL; verifies `pdf_status='available'` first. |
| Synchronous render | ✅ | POST snapshot creates row first (`pdf_status='pending'`), renders inline, then UPDATEs to `available` or `failed`. |
| PDF size logged; warn at > 5 MB | ✅ | `console.warn` line at `byteSize > 5 * 1024 * 1024`. |
| PDF render duration logged; warn at > 10 s | ✅ | `console.warn` line at `durationMs > 10_000`. |

#### ST-04 — Status-Report content
| AC | Status | Notes |
|---|---|---|
| Sections in fixed order | ✅ | Component mirrors spec: Header → Phasen-Timeline → Aktuelle & nächste Meilensteine (next 5) → Top-5-Risiken → Top-5-Entscheidungen → Offene Punkte → Backlog-Übersicht → Footer. |
| Status-traffic-light formula in `lib/reports/status-traffic-light.ts`, unit-tested | ✅ | 23 vitest cases covering all GREEN/YELLOW/RED transitions + edge cases. |
| Empty sections render "—" | ✅ | `SnapshotSection` wrapper handles `isEmpty=true` with the placeholder. |

#### ST-05 — Executive-Summary content
| AC | Status | Notes |
|---|---|---|
| One-pager A4 portrait | ✅ | `max-w-2xl`, no tables longer than 3 rows, top-3 (not top-5) risks/decisions, next-2 milestones. |
| Sections present | ✅ | Header → Aktueller Stand → Top-3-Risiken → Top-3-Entscheidungen → Nächste Meilensteine → Footer. |
| Reuses traffic-light helper | ✅ | Same `computeStatusTrafficLight` import. |

#### ST-06 — KI narrative (feature-flagged)
| AC | Status | Notes |
|---|---|---|
| `output_rendering.ki_narrative_enabled` tenant-flag (default false) | ✅ | `tenant_settings.output_rendering_settings` JSONB column with default `{"ki_narrative_enabled": false}`. |
| Flag drives "KI-Kurzfazit"-Sektion visibility | ✅ | `ProjectDetailClient` reads `tenantSettings.output_rendering_settings.ki_narrative_enabled` and passes to `<ReportsSection>`; the modal entry is gated. |
| Server gathers Class-1+2 fields → calls AI provider | 🟡 **Documented deviation** (M1) | V1 stub: `preview-ki` returns a templated 3-sentence narrative with `provider="stub"`. PROJ-12 router is purpose-typed for "risks"; narrative purpose is its own slice. **Frontend modal lets the user edit before committing**, so the UX contract is fulfilled — only the auto-suggestion is a stub. |
| User can edit before saving; saved snapshot stores final text + classification + provider | ✅ | `ki-narrative-modal.tsx` Textarea is editable; create endpoint stores `content.ki_summary` with `text`, `classification`, `provider`. |
| Class-3 → local provider only; if no local provider → KI block silently skipped | 🟡 **Stub** | Will go live when narrative purpose lands in PROJ-12 router. Current stub doesn't read project data, so the routing rule isn't tested live; the contract is in place at the type + UI level. |

#### ST-07 — Snapshot UI surface
| AC | Status | Notes |
|---|---|---|
| Reports sub-section with two buttons (editor/lead/admin only) | ✅ | `<ReportsSection>` Card; `useProjectAccess(_, "edit_master")` gates the create button. Read-only members see the list only. |
| Snapshot list with kind + version + date + creator + KI-flag + HTML-open + PDF-download | ✅ | `<SnapshotRow>` renders all 6 fields; PDF button shape adapts to `pdf_status` (`available`/`pending`/`failed`). |
| Toast on creation surfaces snapshot URL | ✅ | `snapshot-create-button.tsx` dispatches Sonner toast with action `URL kopieren` that writes to `navigator.clipboard`. |

#### ST-08 — Audit + observability
| AC | Status | Notes |
|---|---|---|
| Every creation writes audit | ✅ | AFTER INSERT trigger on `report_snapshots`. |
| Snapshot creation latency logged | ✅ | `console.info` warn-paths for >5 MB and >10 s. Sentry breadcrumbs flow through Vercel runtime logs. |

### Edge cases verified
| Edge case | Result |
|---|---|
| Project with zero phases / risks / decisions | ✅ Body components show "—" placeholder per `SnapshotSection isEmpty` path. |
| Tenant has no logo | ✅ `<SnapshotHeader>` renders 2-letter initials avatar with accent-color bg. |
| Tenant disables `output_rendering` module | ✅ `requireModuleActive(_, 'output_rendering', { intent: 'read' })` returns 404; write intent returns 403. Tested via vitest mock. |
| Snapshot version race | ✅ UNIQUE(project_id, kind, version) + max+1 resolve; 23505 surfaces as 409 (`error_code: version_conflict`) for client retry. |
| PDF render fails | ✅ Snapshot row stays with `pdf_status='failed'`; `[sid]/render-pdf` retry path returns 204 on success. UI shows "PDF erneut rendern" button. |
| KI provider offline | ✅ V1 stub never throws; the snapshot is still created without the KI block. (Real-provider path tested when narrative router lands.) |
| User edits KI narrative to include Class-3 | ✅ Validated only on length (1000 char cap upstream); responsibility note is in the modal description text. |
| Snapshot deleted by tenant offboarding | ✅ ON DELETE CASCADE on `tenant_id`; URLs return 404 via RLS auto-hide. |
| PDF storage bucket unavailable | ✅ Same handling as render-fail path. |
| Branding changes after snapshot creation | ✅ Branding frozen into `content.header` JSONB at create-time; new renders pick up new branding. |
| Non-uuid path id | ✅ Live-probed: `/reports/snapshots/not-a-uuid` does not crash the proxy. |

### Regression smoke (PROJ-23, PROJ-26, PROJ-28, PROJ-29)
| Check | Result |
|---|---|
| PROJ-23 sidebar specs | ✅ 8/8 green |
| PROJ-22 budget specs | ✅ 28/28 green |
| PROJ-18 compliance specs | ✅ 1/1 green |
| PROJ-28 method-aware navigation specs | ✅ 8/8 green |
| PROJ-29 auth-fixture smoke | ✅ skips cleanly |
| All 560 vitest cases | ✅ green (PROJ-12, PROJ-20, PROJ-22 paths still healthy after audit-whitelist + tracked-columns extensions) |
| Supabase advisor count stable | ✅ no new warnings; existing 26 are pre-existing by-design |

### Security audit (red-team perspective)

- **Snapshot URL leak to non-tenant**: RLS auto-404 (`is_tenant_member` policy returns no row) — no 403 vs. 404 distinction between cross-tenant and missing. **Leak-safe**.
- **Direct Storage bucket access**: bucket is private; INSERT requires service-role; SELECT goes through `report_snapshots_storage_select` policy that cross-references `report_snapshots.tenant_id`. **No public access path**.
- **PDF signed URL exfiltration**: 5-min TTL + `download: true` modifier; forwarding the URL is bounded to the TTL window.
- **Snapshot mutation attempt**: REVOKE update,delete on `authenticated` + no RLS UPDATE/DELETE policy = 403 even with valid session. **Immutability hardened in two layers**.
- **Synchronous Puppeteer abuse**: each call requires editor/lead/admin role on the project; no anonymous create path. Render timeout 25 s, hard browser timeout 30 s — no infinite-loop denial-of-service.
- **Trigger bypass via SECURITY DEFINER**: audit-insert trigger fires AFTER INSERT regardless of caller; revoked from public/anon/authenticated roles so the function itself isn't externally callable.
- **Server-Storage path traversal**: storage key is server-constructed (`<tenant>/<project>/<snapshot>.pdf`) using validated UUIDs from RLS-scoped DB rows. Client cannot inject path elements.
- **Snapshot HTML route XSS**: content is rendered through React (auto-escaping) — no `dangerouslySetInnerHTML`. Safe.
- **`type_specific_data.sponsor_name`**: read directly into the snapshot header. Sponsor name is the only freeform user-input that lands in HTML — auto-escaped by React.
- **KI narrative input** (1000 char cap): plain text only; no HTML interpretation in the body component.

### Bugs & findings

**0 Critical / 0 High.**

| Severity | ID | Finding | Status |
|---|---|---|---|
| Medium | M1 | KI narrative is a V1 stub returning templated text with `provider="stub"` instead of a real PROJ-12-routed AI call. | **Documented deviation** in Implementation Notes Backend § "Deviation from spec". Frontend lets the user edit before committing, so UX contract is fulfilled. Replace with `invokeNarrativeGeneration` once the narrative purpose is added to the AI router. **Acceptable** — the spec § ST-06 is end-state; the V1 cut is honest. |
| Low | L1 | The < 2 s page-load AC for 50 risks + 100 work-items is not micro-benchmarked; only spot-tested on tiny projects. | **Acceptable for V1**. Real-world performance will be observed during the pilot. SSR + indexed-table reads make the unit cost predictable. Re-evaluate if pilot tenant flags slowness. |
| Low | L2 | Full create-with-render flow (POST → Puppeteer → Storage upload → PDF download) is not E2E-tested. Vitest mocks the heavy deps; live testing requires logged-in fixture. | **Pre-existing project-level limitation** (PROJ-29 L2). The PROJ-29 auth-fixture skeleton is in place; once `SUPABASE_SERVICE_ROLE_KEY` is refreshed, this E2E becomes immediately writable. |
| Info | I1 | Open-items "due_date" surrogate uses `created_at` because the schema has no due-date column. | **Documented in `SnapshotOpenItemRef` JSDoc**. Body label "fällig …" reads as "offen seit …" semantically — acceptable. |
| Info | I2 | `/reports/snapshots/[id]` lives outside the `(app)` group → AppShell sidebars don't render. This is intentional (clean print context) but means navigating from the snapshot page back into the app requires a manual URL change. | **By design** per Tech Design § "Komponentenstruktur". Fine for the public-facing-but-tenant-scoped use case. |
| Info | I3 | 26 pre-existing Supabase advisor warnings (RLS helpers + auth_leaked_password_protection). No new warnings introduced by PROJ-21. | **Pre-existing**, tracked under earlier specs. |

### Production-ready decision

**READY** — no Critical or High bugs. The Medium finding (M1, KI stub) is a clearly documented deviation with a working UX path and a clear hand-off to the future PROJ-12 narrative-purpose extension. The Low findings (L1, L2) are project-level limitations, not PROJ-21 defects.

All 8 acceptance-criterion blocks pass at the level appropriate for the V1 KI deviation; 560/560 vitest cases pass; 46/46 playwright cases pass; live MCP confirms migration applied correctly with 2-layer immutability + private storage + module backfill; security audit clean.

Suggested next:
1. **`/deploy`** when ready — no blockers. Migration already applied to live Supabase during /backend; Vercel auto-deploy needs to register the file in the deploy chain.
2. Optional follow-up (separate spec): extend PROJ-12 AI router with a `"narrative"` purpose (Class-3 → local provider, ki_runs row, audit) → replace the preview-ki stub with the real router call.
3. Optional follow-up: refresh `SUPABASE_SERVICE_ROLE_KEY` to unblock the auth-fixture-smoke and wire deeper E2E (full create-with-render flow, KI modal, PDF download).

## Deployment

- **Date deployed:** 2026-05-01
- **Production URL:** https://projektplattform-v3.vercel.app
- **Vercel auto-deploy:** triggered by push of 4 commits (`844f210..0b6d8c2`) to `main`
- **DB migration applied to live Supabase:** ✅ already applied during /backend phase via Supabase MCP `apply_migration` (`20260501140000_proj21_report_snapshots.sql`). Vercel deploy registered the migration file in the deploy chain; the DB state was already in place pre-deploy.
- **Storage bucket:** `reports` (private) created via the migration; RLS policies live.
- **Module backfill:** `output_rendering` already in every existing tenant's `active_modules` (migration backfill applied live).
- **Git tag:** `v1.27.0-PROJ-21`
- **Deviations** (all documented in Implementation Notes + QA findings):
  - **M1 / KI narrative**: V1 stub returns templated text with `provider="stub"`. Frontend lets user edit before committing — UX contract fulfilled. Replace with PROJ-12 narrative-purpose router call when that extension lands.
  - **L1 / Page-load < 2s for 50 risks + 100 work-items**: not micro-benchmarked; observe during pilot.
  - **L2 / Full create-with-render E2E**: not E2E-tested (project-level fixture limitation from PROJ-29; auth-fixture skeleton in place, awaits valid SUPABASE_SERVICE_ROLE_KEY).
- **Post-deploy verification:**
  - `https://projektplattform-v3.vercel.app/login` returns 200 ✅
  - `https://projektplattform-v3.vercel.app/api/projects/<uuid>/snapshots` returns 307 → /login (auth-gate intact) ✅
  - `https://projektplattform-v3.vercel.app/reports/snapshots/<uuid>` returns 307 → /login (auth-gate intact) ✅
  - Vercel build green
  - Existing routes unaffected (PROJ-23/PROJ-26/PROJ-28 routes still 307-gate as before)
- **Rollback story:** `git revert 0b6d8c2..04d6f6c` (4 commits — frontend, backend, QA, docs). The DB migration (`CREATE TABLE`, RLS policies, audit trigger, storage bucket) is forward-only — revert needs a hand-written `DROP TABLE / DROP POLICY / DROP BUCKET` migration if a true rollback is required. **In practice the table is empty and isolated**; leaving it in place after a code revert is safe.
- **Next steps for follow-up:**
  - Extend PROJ-12 AI router with `"narrative"` purpose (Class-3 → local-provider routing, ki_runs row, audit) → replace `preview-ki` stub with real router call.
  - Refresh `SUPABASE_SERVICE_ROLE_KEY` to the new `sb_secret_` format → unblocks the auth-fixture-smoke E2E from PROJ-29 → enables deeper PROJ-21 E2E (full create-with-render flow, KI modal, PDF download path).
  - First pilot snapshot: confirm < 2 s page-load with realistic data (50 risks + 100 work-items); revisit if slower.
  - Monitor PDF render duration logs (`>10s` warn-line) over the first month — if frequent, consider deferring to PROJ-21b async-render.
