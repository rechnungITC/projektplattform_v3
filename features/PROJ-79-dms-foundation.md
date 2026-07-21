# PROJ-79: DMS Foundation

## Status: Architected (α — interner DMS-Kern; β externe Konnektoren deferred)
**Created:** 2026-06-06
**Last Updated:** 2026-07-21

## Summary
The platform needs a project-scoped Document Management System: a navigation tree per project under which documents can be uploaded, browsed, moved, renamed, and downloaded. External sources (SharePoint, Google Drive) can be connected per tenant; their content is mirrored as read-only references in the same tree. Tenant storage is enforced against a license-bound quota. This story builds the storage layer + tree + external-source connectors, **not** the RAG indexing or summarization, which is PROJ-80.

## Dependencies
- Requires: PROJ-2 (Project CRUD)
- Requires: PROJ-4 (Platform Foundation, RBAC)
- Requires: PROJ-10 (Audit)
- Compatible with: PROJ-70 (Auto-Generated Backlog from Kickoff) — reuse its parser/storage hardening where practical, but keep `context_sources` as kickoff-ingestion input and `document_tree_nodes`/`documents` as durable project DMS.
- Influences: PROJ-80 (RAG-Indexierung + Quintessenz) — operates on documents stored here
- Influences: PROJ-81 (Skill-to-RAG-Scope) — picks tree nodes from here
- Influences: PROJ-83 (Task-driven Content Generation) — generated documents land here

## V2 Reference Material
- None in V2. Adjacent: V2 had Stakeholder attachments as ad-hoc uploads; those are out of scope here (migrate to DMS later if desired).

## User Stories
- **[V3 SK-15]** As a PM, I want to upload documents into a project-specific tree structure, so that all project documents are organized in one place.
- **[V3 SK-16]** As a PM, I want to browse, rename, move, and delete documents and folders in the tree, so that I can keep the structure clean.
- **[V3 SK-17]** As a tenant admin, I want to connect external sources like SharePoint and Google Drive at tenant level, so that PMs can reference content from those sources inside their projects without re-uploading.
- **[V3 SK-18]** As a tenant admin, I want to see the current storage usage versus the license quota, so that I know when we are approaching the limit.

## Acceptance Criteria

### Data model
- [ ] Table `document_tree_nodes`: `id UUID PK, tenant_id UUID NOT NULL, project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE, parent_id UUID REFERENCES document_tree_nodes(id) ON DELETE CASCADE, node_type TEXT NOT NULL CHECK (node_type IN ('folder','document','external_link')), name TEXT NOT NULL, slug TEXT NOT NULL, sort_order INT NOT NULL DEFAULT 0, created_at, updated_at, created_by UUID`.
- [ ] Unique `(parent_id, slug)` per project (root has `parent_id=NULL` per project).
- [ ] Table `documents`: `id UUID PK, tenant_id UUID NOT NULL, tree_node_id UUID NOT NULL REFERENCES document_tree_nodes(id) ON DELETE CASCADE, storage_backend TEXT NOT NULL CHECK (storage_backend IN ('internal','sharepoint','gdrive')), storage_path TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes BIGINT NOT NULL, original_filename TEXT NOT NULL, checksum TEXT NOT NULL, ai_generated BOOLEAN NOT NULL DEFAULT false, ai_generated_metadata JSONB, created_at, updated_at, created_by UUID, deleted_at TIMESTAMPTZ`.
- [ ] Table `external_source_connectors`: `id UUID PK, tenant_id UUID NOT NULL, provider TEXT NOT NULL CHECK (provider IN ('sharepoint','gdrive')), display_name TEXT NOT NULL, credentials_secret_ref TEXT NOT NULL, root_path TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('active','error','disconnected')), last_sync_at TIMESTAMPTZ, created_at, created_by`.
- [ ] Table `tenant_storage_quotas`: `tenant_id UUID PK, license_tier TEXT NOT NULL, max_bytes BIGINT NOT NULL, soft_warning_pct INT NOT NULL DEFAULT 80, current_usage_bytes BIGINT NOT NULL DEFAULT 0, last_recomputed_at TIMESTAMPTZ`.

### Upload endpoint
- [ ] `POST /api/projects/:id/documents` — multipart upload to a specified tree node.
- [ ] Pre-flight check: requested upload size + current_usage_bytes ≤ max_bytes → otherwise 413 with quota error.
- [ ] Supported formats V1: PDF, DOCX, XLSX, PPTX, MD, TXT, CSV, PNG, JPG. Other formats stored but flagged `mime_unsupported_for_rag=true` (PROJ-80 will skip indexing).
- [ ] Max file size V1: 50 MB per document.
- [ ] Internal storage backend: Supabase Storage bucket `documents` scoped by `tenant_id/project_id/`.

### Tree operations
- [ ] `POST /api/projects/:id/tree/nodes` — create folder under a parent.
- [ ] `PATCH /api/projects/:id/tree/nodes/:nodeId` — rename, move (`parent_id` change with cycle detection).
- [ ] `DELETE /api/projects/:id/tree/nodes/:nodeId` — soft delete (sets `deleted_at`); orphaned documents under deleted folders are also soft-deleted.
- [ ] Cycle prevention: moving a node into one of its own descendants → 409.

### External source connectors
- [ ] Admin route `/admin/external-sources` — connect / disconnect / test / re-sync.
- [ ] Connecting SharePoint or Google Drive triggers OAuth flow (provider-specific) and stores token in Supabase Vault (referenced by `credentials_secret_ref`, never inline in DB).
- [ ] PM can, inside a project, create an `external_link` tree node pointing to a path inside the connected source; on access, the document is fetched on demand (no full mirror in V1).
- [ ] External documents are read-only.

### Quota
- [ ] `tenant_storage_quotas.current_usage_bytes` is recomputed on every upload, every soft delete, and on a daily sweep.
- [ ] Admin route `/admin/storage` shows usage bar with soft warning (yellow at ≥ `soft_warning_pct`%, red at ≥ 100%).
- [ ] Upload rejected at 100% with clear error message including current usage.
- [ ] Quota is per tenant, NOT per project.

### RLS
- [ ] `document_tree_nodes`, `documents`: read = `is_project_member(project_id)`; write per project role (project_lead and editor write; viewer read-only). Cross-tenant → 404.
- [ ] `external_source_connectors`: read/write admin-only.
- [ ] `tenant_storage_quotas`: read admin-only; write system-only via trigger.

### Audit
- [ ] Events: `document.uploaded`, `document.renamed`, `document.moved`, `document.deleted`, `tree_node.created`, `tree_node.deleted`, `external_source.connected`, `external_source.disconnected`, `storage_quota.exceeded`.

## Edge Cases
- **Tenant at 99 % quota uploads 100 MB file** → 413 with current usage and quota limit in body.
- **External source token expires** → connector status set to `error`, PM sees inline notice on external_link node, admin notified.
- **PM deletes a folder containing 200 documents** → soft-delete cascades; quota is recomputed but bytes stay charged for 30 days (retention window for restore); finalize after retention.
- **Duplicate filename in same folder** → server appends ` (2)`, ` (3)` etc. before extension.
- **MIME type spoofing (file claims to be PDF but isn't)** → server checksums and probes; mismatch → 415.
- **Cross-tenant access attempt** → 404 via RLS.
- **External link target deleted on provider side** → on access return 410 Gone; node remains until PM removes it.
- **AI-generated documents from PROJ-83** → flag `ai_generated=true`; metadata block captures which skill, which task.

## Technical Requirements
- **Stack:** Next.js 16 + Supabase (Storage, Vault, DB), shadcn/ui (`Tree`, `Dialog`, `Progress`, `Alert`).
- **Tree component:** decide in /architecture between `react-arborist`, `@radix-ui/react-tree`, or custom. Drag-and-drop optional for V1.
- **Storage backend:** internal = Supabase Storage; external = on-demand fetch with token from Vault.
- **Multi-tenant:** `tenant_id NOT NULL` on every new table with cascade delete. Storage path always prefixed by `tenant_id/project_id/`.
- **Validation:** Zod at API; MIME probing server-side.
- **Auth:** Supabase Auth; project membership check for tree/document; admin for external sources and quota.
- **Performance:** Tree fetch paginated by parent (lazy expansion). Quota recompute uses incremental delta on upload + nightly truth-sweep.
- **Audit hook:** PROJ-10.

## Out of Scope
- RAG indexing and embeddings (PROJ-80).
- Document version history (V2; for now overwrite-with-rename).
- Document preview (inline view) — V2.
- OCR for scanned PDFs (reserved PROJ-71 follow-up; PROJ-80 only surfaces extraction failures in V1).
- Bulk operations (multi-select move / delete) — V2.
- Per-project storage sub-quotas.
- Two-way sync with external sources (read-only references only).

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

> **CIA-reviewed 2026-07-21 (Portfolio + Fork).** Verdikt: PROJ-79 wird in **α (interner DMS-Kern, jetzt)** und **β (externe Konnektoren, deferred, CIA-pflichtig)** geteilt. α ist der klare pilot-kritische Gewinner — schließt die härteste ERP-Pilot-Lücke (durablearer Dokument-Speicher → PRD-Metrik „≥80% Artefakte auf der Plattform") mit etablierten Mustern und niedrigem Risiko. Dieses Design deckt **nur α** ab.

### Scope-Grenze α / β

| In α (dieser Slice) | Deferred → β (eigene Spec-Zeile, CIA-pflichtig) |
|---|---|
| Interner Dokument-Baum + Datei-Upload (Supabase Storage) | Externe SharePoint/GDrive-Konnektoren (`external_source_connectors`) |
| Tree-CRUD: Ordner anlegen, umbenennen, verschieben, soft-delete | OAuth-Flow + Supabase **Vault** (bisher nirgends genutzt) |
| Quota **inkrementell** (Zähler + Pre-Flight-Block bei Upload/Delete) | `external_link`-Knoten + On-Demand-Fetch externer Dokumente |
| RLS, PROJ-10-Audit, Admin-Storage-Übersicht | **Nächtlicher Quota-Truth-Sweep-Cron** (α zählt nur inkrementell) |

Die DB-Enums bleiben forward-kompatibel: `node_type` behält `external_link`, `documents.storage_backend` behält `sharepoint`/`gdrive` — α **erzeugt** aber ausschließlich `folder`/`document` bzw. `internal`. β schaltet die restlichen Werte frei, ohne Migration der α-Daten.

### A) Komponenten-Struktur (UI)

```
Projekt-Raum  →  neue Sektion "Dokumente"  (Core, ALLE Projekt-Typen — kein M&A-Gate)
+-- DMS-Seite  /projects/[id]/dokumente
|   +-- Linke Spalte: Dokument-Baum (react-arborist, lazy pro Parent geladen)
|   |   +-- Ordner-Knoten (aufklappbar)
|   |   +-- Dokument-Knoten (Icon nach MIME)
|   |   +-- Kontextmenü: Umbenennen · Verschieben · Löschen · Neuer Ordner
|   +-- Rechte Spalte: Detail des gewählten Knotens
|   |   +-- Ordner gewählt → Liste der Kinder + "Hochladen"- + "Ordner"-Button
|   |   +-- Dokument gewählt → Metadaten (Name, Größe, Typ, Uploader, Datum) + Download
|   +-- Upload-Dialog (Datei-Picker; Ziel = aktueller Ordner; Fortschritt + Fehler-States)
|   +-- Ordner-anlegen-Dialog · Umbenennen-Dialog · Verschieben (DnD im Baum) · Löschen-Confirm
|   +-- Kleiner Quota-Hinweis (gelb ≥ Soft-Warnung, rot bei 100%) im Seitenkopf
|
+-- Admin-Bereich: Storage-Übersicht  (Einstellungen → Speicher, tenant-admin-only)
    +-- Nutzungsbalken tenant-weit (aktuelle Bytes / Lizenz-Limit) mit Soft-Warnung
    +-- Read-only Liste der größten Projekte/Ordner (optional, aus vorhandenen Zählern)
```

**Reuse:** `react-arborist` ist bereits Dependency (org-tree, backlog-tree) → **kein neues Frontend-Dep**. shadcn `Dialog`/`Progress`/`Alert`/`Button` vorhanden.

### B) Datenmodell (Klartext)

Drei neue Tabellen (Feld-Details in den Akzeptanzkriterien oben). Multi-Tenant-Invariante: `tenant_id NOT NULL` + Cascade auf allen dreien.

- **`document_tree_nodes`** — der Baum je Projekt. Jeder Knoten ist ein *Ordner*, ein *Dokument* oder (β) ein *externer Link*. Wurzel je Projekt hat `parent_id = NULL`. Eindeutigkeit `(parent_id, slug)` verhindert Namensdopplung im selben Ordner. Verschieben = `parent_id` ändern **mit Zyklus-Prüfung** (ein Ordner darf nicht in seinen eigenen Nachfahren wandern → 409). Löschen = **soft-delete** (`deleted_at`), Kinder werden mit-soft-gelöscht.
- **`documents`** — Metadaten einer abgelegten Datei, hängt an genau einem `document`-Knoten. Zeigt via `storage_path` auf ein Objekt im Supabase-Storage-Bucket. Hält `mime_type`, `size_bytes`, `checksum`, `original_filename`. `ai_generated`-Flag + `ai_generated_metadata` für spätere PROJ-83-Artefakte (in α immer `false`).
- **`tenant_storage_quotas`** — ein Datensatz pro Tenant: `max_bytes` (aus Lizenz-Tier), `current_usage_bytes` (inkrementell gepflegt), `soft_warning_pct`. Quota ist **pro Tenant, nicht pro Projekt**.

**Storage-Backend (intern):** Supabase-Storage-Bucket **`documents`** — **privat**, Pfad immer `tenant_id/project_id/…`. Übernimmt 1:1 das gehärtete Muster aus PROJ-70 (`context-source-uploads`): Magic-Byte-Sniffing gegen MIME-Spoofing, MIME-Allowlist, Größen-Cap. Bucket-RLS-Policy tenant/project-prefixed — **nicht neu erfinden** (R-2).

**Versionierung ist NICHT Teil von α** (eigene Out-of-Scope-Liste: „overwrite-with-rename"). PROJ-106 legt die dokumentierte Versionskette später auf `documents` auf.

### C) Server-Verhalten (Regeln, keine Implementierung)

- **Upload** `POST /api/projects/:id/documents` (multipart): Pre-Flight `size + current_usage_bytes ≤ max_bytes` sonst **413** mit Nutzungs-/Limit-Angabe. MIME per Magic-Byte geprüft (Mismatch → **415**). Formate V1: PDF/DOCX/XLSX/PPTX/MD/TXT/CSV/PNG/JPG; andere gespeichert + `mime_unsupported_for_rag`-Flag (PROJ-80 überspringt). Max 50 MB. Doppelter Dateiname im Ordner → Server hängt ` (2)`/` (3)` an. Reihenfolge: **erst parsen/prüfen, dann Storage-Upload, dann DB-Insert** (PROJ-70-Lektion: Orphan-Cleanup bei Fehlschlag).
- **Tree-Ops:** `POST …/tree/nodes` (Ordner), `PATCH …/tree/nodes/:nodeId` (Rename/Move + Zyklus-Guard 409), `DELETE …/tree/nodes/:nodeId` (soft-delete, kaskadiert auf Kinder).
- **Quota inkrementell:** `current_usage_bytes` += bei Upload, −= bei Soft-Delete. **Aber:** gelöschte Bytes bleiben 30 Tage „charged" (Restore-Fenster, Edge-Case der Spec) — Finalisierung/Truth-Sweep erst in β. Zähler-Drift bewusst akzeptiert bis β-Sweep (R-3).
- **RLS:** `document_tree_nodes`/`documents` read = `is_project_member(project_id)`; write = `is_project_lead` **oder** editor-Rolle; viewer read-only; cross-tenant → **404**. `tenant_storage_quotas` read = tenant-admin; write = **system-only via Trigger/RPC** (kein direktes UPDATE).
- **Audit (PROJ-10):** Ereignisse `document.uploaded/renamed/moved/deleted`, `tree_node.created/deleted`, `storage_quota.exceeded`. (Konnektor-Events erst β.)

### D) Tech-Entscheidungen (WARUM)

1. **Interner Storage über das PROJ-70-Muster wiederverwenden** statt Neuentwurf → bewährte Bucket-RLS + Anti-Spoofing, niedriges Risiko (R-2-Mitigation).
2. **`react-arborist`** als Baum (schon im Einsatz) mit **lazy expansion pro Parent** → keine Massen-Query, kein neues Dep, konsistente UX mit org-tree.
3. **Quota bleibt in α, aber nur inkrementell** → Enforcement (Zähler + Pre-Flight) ist billig und gehört zur SaaS-Lizenz-Story; der teurere nächtliche Truth-Sweep-Cron wandert nach β (CIA-Präzisierung).
4. **Externe Konnektoren strikt in β** → Vault + OAuth + Provider-SDKs sind Greenfield mit ganz anderem Risiko-Profil; sie dürfen den musterbasierten α-Kern nicht ausbremsen (R-1).
5. **Soft-delete + 30-Tage-Charge** → Restore-Fähigkeit ohne sofortige Byte-Freigabe, wie im Edge-Case gefordert.

### E) Forward-Compat-Notiz — Dokument-Referenzen (CIA F-5 / PROJ-Y-doc-refs)

`documents` ist ab jetzt der **kanonische Binär-Store** der Plattform. Die bestehenden Link-Tabellen (`deliverable_documents.url`, `vendor_documents`, `work_item_documents`) bleiben **bewusst getrennt** (eigene Konzerne/Lebenszyklen) — **keine Konsolidierung in α**. Später (PROJ-Y-doc-refs) dürfen sie optional auf einen `document_tree_nodes`-Knoten via `node_id` zeigen statt auf eine Roh-URL. α baut dafür keine Kopplung, hält den Store aber referenzierbar (stabile Knoten-IDs).

### F) Dependencies

**Keine neuen Packages.** react-arborist (vorhanden), Supabase Storage (built-in), file-type/Magic-Byte-Härtung (aus PROJ-70 vorhanden). β wird Microsoft-Graph-/Google-Drive-SDK + Vault einführen (dann CIA).

### G) Deferred → β (als eigene Spec-Zeile / PROJ-Y-79β zu formalisieren)

`external_source_connectors` + SharePoint/GDrive-OAuth + Supabase Vault + Token-Refresh + On-Demand-Fetch + read-only `external_link`-Knoten + **nächtlicher Quota-Truth-Sweep-Cron**. **Offene Input-Frage Q1:** Will der M365-Pilotkunde SharePoint-Inhalte *referenzieren* oder *direkt hochladen*? Bei „referenzieren" rückt β vor die Skill-Familie (76–84), sonst dahinter.

### H) Handoff-Reihenfolge

Diese Slice hat sowohl Datenmodell/Storage/API (Backend) als auch Baum-/Upload-UI (Frontend). Empfehlung: **`/frontend` zuerst** (Tree + Upload-Dialog + Quota-Balken gegen gemockte/echte API), dann **`/backend`** (Migration + Bucket + RLS + RPCs + Audit + Quota-Trigger) — oder Backend-first, falls die UI reale Routen braucht. Danach `/qa` mit Pflicht-Vektoren: cross-tenant-404, MIME-Spoof-415, Zyklus-Move-409, Quota-413, soft-delete-Kaskade, RLS-Rollen (viewer read-only).

## Implementation Notes
_To be added by /frontend and /backend._

## QA Test Results
_To be added by /qa._

## Deployment
_To be added by /deploy._
