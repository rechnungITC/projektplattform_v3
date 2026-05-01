# PROJ-21: Output Rendering — Status-Report & Executive-Summary

## Status: In Progress
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

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
