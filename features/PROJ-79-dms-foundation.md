# PROJ-79: DMS Foundation

## Status: Deployed (α backend + frontend + QA + live-RPC/RLS prod-smoke — 0 Critical/High; PR #247 → main, Tag v2.18.0-PROJ-79, 2026-07-23; β externe Konnektoren deferred)

## Deployment Scope: alpha

> **Scope-Klassifikation (PROJ-Y-145b, Tranche 5, 2026-08-24):** Der Statusheader nennt die Grenze selbst: **„α backend + frontend + QA + live-RPC/RLS prod-smoke … β externe Konnektoren deferred"**, und der CIA-Review vom 2026-07-21 hat den Schnitt ausdruecklich so gelegt — β (SharePoint/GDrive-OAuth, Vault, On-Demand-Fetch, naechtlicher Quota-Sweep) ist eine eigene, **CIA-pflichtige** Zeile. Ein benannter Teil-Schnitt mit eigener QA und eigenem Deployment, der Rest ausdruecklich aufgelistet: das ist `alpha`. α selbst ist stark belegt (Live-RPC/RLS-Prod-Smoke 16/16 mit 0 Rueckstaenden, echte OOXML-Erkennung inklusive des Beweises, dass die Full-Buffer-Pruefung noetig ist). Followup **PROJ-Y-79a**.

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
- [x] `tenant_storage_quotas.current_usage_bytes` is recomputed on every upload, every soft delete, and on a daily sweep.
  **Erst mit PROJ-Y-45p (2026-08-26) erfüllt.** α lieferte davon nur ein reines Inkrement beim
  `documents`-INSERT; Neuberechnung, Soft-Delete-Pfad und täglicher Lauf fehlten. Jetzt:
  `_dms_recompute_storage_usage` als einzige Autorität, drei anweisungsweise Trigger
  (INSERT/UPDATE/DELETE) und `dms_sweep_storage_quotas` im nächtlichen DMS-Cron.
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
  **Zweite Hälfte per Nutzer-Entscheid überholt (PROJ-Y-45p, 2026-08-26): Löschen gibt sofort frei.**
  Grund ist eine Messung, keine Vorliebe: die Aufbewahrungsfrist mit Purge und der
  Wiederherstellen-Pfad, die „bytes stay charged“ tragen sollten, wurden **nie gebaut** (kein
  Cron, kein Codepfad — beides live geprüft). Wörtlich umgesetzt hiesse die Klausel „für immer
  berechnet“, und kein Produktpfad gäbe je ein Byte frei. Die **erste** Hälfte („quota is
  recomputed“, ein Vorgang für 200 Dokumente) ist genau der Grund für anweisungsweise Trigger.
  Kommt später eine echte Aufbewahrungsfrist mit Wiederherstellen, ist die Klausel neu zu
  entscheiden — dann aber mit ihren Voraussetzungen.
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

### PROJ-Y-45p — Speicherzähler: Dekrement als Neuberechnung (2026-08-26)

Fremd-Slice-Nachtrag an **PROJ-79s** Quota-Kriterium, entdeckt in der ε-QA (Befund F-2,
Medium) und dort als `PROJ-Y-45p` registriert. Migration
`20260826110000_projy45p_quota_recompute`.

**Der Befund war schärfer als das Followup ihn beschrieb.** Registriert war „Zähler ohne
Dekrement“ mit der Notiz, die Papierkorb-Semantik sei „zu entscheiden, nicht zu raten“.
Gemessen: entschieden **war** sie — die α-Migration sagt in ihrem eigenen Kommentar
„Soft-delete does NOT free bytes (30-day retention window; freeing happens in β nightly
truth-sweep)“, und das Kriterium oben verlangt Neuberechnung an drei Stellen. Nur trägt diese
Politik nicht: **weder die Aufbewahrungsfrist mit Purge noch ein Wiederherstellen-Pfad
existieren** (kein Cron, kein Codepfad, beides live geprüft), also wäre „nicht freigeben“
gleichbedeutend mit „für immer berechnet“. Nutzer-Entscheid daher: Löschen gibt sofort frei.

**Warum Neuberechnung statt Gegenrechnung** — eine Gegenrechnung driftet bei jedem Weg, der
die Trigger nicht durchläuft, und genau so ist die Prod-Drift entstanden (unter
`session_replication_role = replica` sind Trigger aus). Live gemessen: `[E2E] Projektplattform
Test` 1.176 gezählte Byte bei **0** Dokumenten, `[E2E] Bau Test` 1.344 bei 0 — beide durch die
Migration auf 0 geheilt und danach unabhängig nachgemessen.

**Anweisungsweise, nicht zeilenweise.** `dms_soft_delete_subtree` löscht den Teilbaum in EINER
UPDATE-Anweisung; zeilenweise wären das für den Edge-Case „Ordner mit 200 Dokumenten“ 200
Neuberechnungen. Dynamisches SQL, weil Übergangstabellen je Ereignis anders heissen und ein
Trigger mit Übergangstabellen nur für **ein** Ereignis erklärt werden darf — was der erste
Anwendungsversuch belegt hat: eine Spaltenliste (`after update of …`) ist damit unvereinbar
(`transition tables cannot be specified for triggers with column lists`), die Migration rollte
atomar zurück (nachgemessen: 0 neue Funktionen, Zähler unverändert). Die Verengung sitzt
deshalb **in** der Funktion als symmetrische Differenz über die zählrelevanten Spalten — und
ist dort schärfer als eine Spaltenliste, die schon beim Nennen einer Spalte feuert.

**Das reine Inkrement `_dms_bump_storage_usage` ist entfernt**, nicht stillgelegt: zwei
Autoritäten für dieselbe Zahl wären der eigentliche Fehler. Funktionsinventar 296 → 298
(+3 neue, −1 gedroppte).

**Was der Zähler NICHT ist:** die Bytes auf der Platte. PROJ-45-ε legt je Foto zwei
abgeleitete Grössen als Geschwister-Objekte ohne eigene `documents`-Zeile ab (AC-45εH-17,
bewusst) — die zählen nicht mit. Wer das später „repariert“, ändert eine getroffene
Entscheidung.

**Nachweise (live gegen Prod, 0 Rückstände über sechs Zähler):** eigener Pentest
`tests/sql/PROJ-Y-45p-quota-recompute-pentest.sql` **20/20** — tragend `B_softdelete_gibt_frei`
und `B2_teilbaum_gibt_alles_frei` (der Nutzer-Entscheid, belegt statt behauptet),
`C`/`D` (Hart-Löschen und Kaskade, die Quelle der Drift), `F` (Umbenennen löst **keine**
Neuberechnung aus) mit `F2` als Gegenprobe, `J` (der Sweep heilt eine gepflanzte Drift),
`H`/`H2` (Mandantentrennung — mit einem eigenen zweiten Wegwerf-Mandanten, weil der Vektor
gegen die echten Mandanten nach dem Sweep 0 → 0 gemeldet und damit nichts belegt hätte),
`I1`–`I5` (Rechte, inkl. PUBLIC). Regressionen wörtlich: **PROJ-79-DMS 16/16** (inkl.
`QUOTA-seed usage=1000`), **PROJ-45-ε 12/13 + H mandantenabhängig / 6/6** wie protokolliert,
**PROJ-Y-45q 14/14 + 5/5**. Advisors **0 ERROR** auf beiden Achsen, **kein** Treffer für die
drei neuen Funktionen oder `tenant_storage_quotas`.

**Deployment Scope bleibt `alpha`:** β (externe Konnektoren) ist unverändert zurückgestellt.
Dieses Kriterium war eine stille Lücke **innerhalb** von α und ist jetzt geschlossen.

### Backend — α (2026-07-21)
DB + API layer for the internal DMS core. **Two migrations applied to prod** (`iqerihohwabyjzkpcujq`):
- `20260721120000_proj79_dms_foundation_alpha` — 3 tables (`document_tree_nodes`, `documents`, `tenant_storage_quotas`) + private Storage bucket `documents` (50 MB cap + 9-MIME allowlist, tenant/project-prefixed) + 4 `storage.objects` RLS policies (seg1 tenant-member, seg2 project-member) + quota-increment trigger `_dms_bump_storage_usage` (locked to postgres/service_role) + RPCs `dms_move_node` (cycle guard) & `dms_soft_delete_subtree` (cascade). Audit trio (`audit_log_entity_type_check` + `_tracked_audit_columns` + `can_read_audit_entry`) recreated **non-destructively from live prod defs** (+authenticated re-grant, siblings preserved).
- `20260721120500_proj79_dms_quota_status` — `dms_quota_status(project_id)` SECURITY DEFINER, member-readable (upload pre-flight + UI quota bar without widening the admin-only base-table SELECT).

**Live-RPC-smoke (mandatory) ALL PASS**, rollback-marker → 0 residue: quota +1000 · move · cycle-guard · cascade (3 nodes + doc) · audit-trio intact. **0 ERROR-level advisors.**

**API routes** (`src/app/api/projects/[id]/…`): `documents/tree` GET (list, `?parent_id`), `tree/nodes` POST (create folder + slug dedup), `tree/nodes/[nodeId]` PATCH (rename | move→`dms_move_node`, 42501→403/P0002→404/23514→409) + DELETE (`dms_soft_delete_subtree`), `documents` POST (multipart upload: Content-Length + 50 MB → 413, magic-byte sniff → 415, quota pre-flight → 413, dedup, orphan-safe insert→upload→insert + sha256), `documents/[docId]/download` GET (signed URL), `storage-quota` GET. **Lib** `src/lib/dms/` (mime, slug, schema, storage). **Types** `src/types/dms.ts`.

**Deviations / notes:**
- **α allowlist == RAG-supported set** (9 formats: pdf/docx/xlsx/pptx/txt/md/csv/png/jpg); anything else is a hard 415. `mime_unsupported_for_rag` stays `false` in α (reserved for PROJ-80/β when the allowlist widens).
- **Fix during review:** MIME sniff now passes the **full buffer** to `file-type` (was a 4 KB head slice) so ZIP-based OOXML (docx/xlsx/pptx) subtypes are detected reliably instead of wrongly 415-ing. → **QA must upload a real docx/xlsx/pptx.**
- **Quota on soft-delete:** bytes are **not** freed in α (30-day retention window); freeing is the β nightly truth-sweep. Conservative over-count favours quota safety.
- Storage-object RLS is tenant+project defense-in-depth; the fine-grained lead/editor gate lives at the API layer (`requireProjectAccess("edit")`).

**Gates:** lint 0 · tsc 14 baseline / **0 new** · vitest **2341/2341** (296 files, +73 DMS) · build clean (6 DMS routes registered).

**Deferred → β (not built):** external SharePoint/GDrive OAuth + Vault + on-demand fetch + `external_link` nodes + nightly quota truth-sweep cron.

### Frontend — α (2026-07-21)
"Dokumente" tab (core, all project types — no M&A gate). New `SidebarSection` `dms-documents` (tabPath `dokumente`, `FolderTree` icon) injected once in `method-templates/index.ts` right after Übersicht for every method (mirrors the M&A-section injection but **without** `requiresProjectType`, so it shows for all project types). Route `src/app/(app)/projects/[id]/dokumente/page.tsx`.

- **Components** `src/components/projects/dms/`: `dms-page.tsx` (orchestrator — tree + detail panel + quota header + New-folder/Upload buttons + folder-create/rename Dialog + delete AlertDialog + upload Dialog with file picker/size/error states; all writes `useProjectAccess("edit_master")`-gated), `dms-tree.tsx` (react-arborist — folders/documents, MIME icons, per-row dropdown rename/delete/new-folder/download, inline DnD move via `onMove`→`moveNode`, `disableDrop` onto document leaves; backend RPC stays the cycle authority → 409 toast), `dms-quota-bar.tsx` (Progress bar, amber ≥ soft-warning / red ≥ 100%).
- **Hooks** `use-document-tree.ts` (loads whole tree, builds forest), `use-storage-quota.ts`. **API client** `src/lib/dms/api.ts`. **Pure libs** `src/lib/dms/tree.ts` (`buildForest`) + `format.ts` (`formatBytes`), both unit-tested.
- **Backend touch (additive):** `GET …/documents/tree?all=true` returns the whole project tree flat (client builds the forest — org-tree pattern) alongside the existing lazy per-parent mode. +1 route test.

**Deviation (documented):** α loads the **whole tree in one fetch** (`?all=true`) instead of lazy per-parent expansion the tech design mentioned — simpler, matches the org-tree/backlog-tree "flat→forest" pattern already in the codebase, `.limit(1000)` cap. Lazy expansion can layer on later if project trees grow past that. **No new dependency** (react-arborist + shadcn already present).

**Gates:** lint 0 · tsc 14 baseline / **0 new** · vitest **2349/2349** (298 files, +8 DMS FE: tree-forest 4, formatBytes 3, tree `?all` route 1; PROJ-94 nav-injection test updated for the new core section) · build clean (`/projects/[id]/dokumente` registered).

_→ /qa: cross-tenant-404, MIME-spoof-415 (upload a real docx/xlsx/pptx per backend note), cycle-move-409, quota-413, soft-delete cascade, viewer read-only (no New-folder/Upload/row-actions)._

## QA Test Results

### α QA — 2026-07-21 (In Review; one live-smoke handoff before Approved)

**Verdict:** all Pflicht-Vektoren PASS at the code / component / real-lib / auth-gate layers; the DB-layer RLS+RPC live smoke is authored + reproducible but **not executed against prod in this session** (no Supabase MCP in the QA session) → run it before flipping to Approved. **0 Critical / 0 High** in everything executed.

**Gates:** lint **0** · tsc **14 baseline / 0 new** · vitest **2355/2355** (299 files; +6 real-OOXML) · Playwright DMS auth-gates **8/8 chromium** (Mobile Safari skipped — WebKit host libs missing, PROJ-67/F2 env).

**Pflicht-Vektor → verification:**

| Vektor | Status | Wie verifiziert |
|---|---|---|
| **cross-tenant-404** | PASS (code) + authored (DB) | `requireProjectAccess` RLS-null→404 (download route test + shared helper); live-smoke `XTENANT` (T2-admin sieht 0 T1-Knoten) authored. |
| **MIME-Spoof-415 (echtes docx/xlsx/pptx, OOXML-Full-Buffer-Fix)** | **PASS (fully executed, real file-type)** | `src/lib/dms/mime.ooxml.test.ts` (non-mocked `file-type` + jszip): real docx/xlsx/pptx detected + RAG-supported; spoofed `.pdf`-das-eigentlich-docx→415; plain-zip→415; **padded docx (>4100 B, Marker jenseits Byte 4100): 4 KB-Slice liefert `application/zip` (alt = falsches 415), Full-Buffer liefert korrektes docx-MIME** — beweist den Review-Fix. |
| **Zyklus-Move-409** | PASS (API map) + authored (DB) | PATCH-move mappt `23514→409` (route test); live-smoke `CYCLE` (move F1→Nachfahre F2 → 23514) + `NONFOLDER` (move in Dokument → 23514) authored. |
| **Quota-413** | PASS (API) + authored (DB) | Upload-Route Quota-Pre-Flight→413 (route test, `quota_exceeded`-Body); live-smoke `QUOTA-seed` (Increment-Trigger + member-lesbares `dms_quota_status` = 1000 nach Seed-Doc) authored. |
| **Soft-delete-Kaskade** | PASS (API) + authored (DB) | DELETE-Route → `dms_soft_delete_subtree` (route test P0002→404/42501→403); live-smoke `CASCADE` (F1-Subtree soft-delete = 2 Knoten, Dokument-Knoten + `documents`-Zeile `deleted_at` gesetzt, ausgezogenes F2 überlebt) authored. |
| **Viewer read-only (kein Ordner/Upload/Zeilen-Aktionen)** | PASS (FE + API) + authored (DB) | FE: alle Schreib-Entry-Points (`Ordner`/`Hochladen`/Row-Dropdown/DnD) hinter `useProjectAccess("edit_master")`; API: `requireProjectAccess("edit")`→403 für non-editor (route tests); live-smoke `VIEWER-*` (RLS: viewer sieht, INSERT→42501, UPDATE/DELETE rows=0, `dms_move_node`→42501) authored. |

**Artefakte:** `src/lib/dms/mime.ooxml.test.ts` (6, real), `tests/PROJ-79-dms.spec.ts` (8 auth-gates), `tests/sql/PROJ-79-dms-pentest.sql` (DO-block, rollback-marker, 0 Residue — als postgres/service_role laufen lassen).

**Offener Handoff vor Approved:** ~~`tests/sql/PROJ-79-dms-pentest.sql` einmal live gegen Prod ausführen~~ — **ERLEDIGT 2026-07-21 (main-thread session mit Supabase-MCP).**

### Live-RPC/RLS Prod-Smoke — 2026-07-21 → **Approved**

`tests/sql/PROJ-79-dms-pentest.sql` **live gegen Prod ausgeführt** (`iqerihohwabyjzkpcujq`), unter realer `authenticated`-Rolle + `request.jwt.claims`-Impersonation, sentinel-rollback → **0 Residue** (verifiziert: 0 P79-PENTEST-Tenants/Nodes/Profiles/Docs). **Alle 16 Assertions `t`:**

`QUOTA-seed usage=1000` · `XTENANT` T2-admin sieht 0 T1-Knoten · `VIEWER-sel` sieht 3 · `VIEWER-ins` 42501 · `VIEWER-upd` rows=0 · `VIEWER-del` rows=0 · `RPC-role` viewer-move 42501 · `CYCLE` 23514 · `NONFOLDER` 23514 · `MOVE-OK` F2→root · `CASCADE` 2 Knoten + Dokument-Row soft-deleted + ausgezogenes F2 überlebt · `AUDIT` name-change-Row + `can_read_audit_entry` admin=t.

**Harness-Fix während des Laufs:** die Pentest-Datei rief `dms_quota_status` vor dem Setzen eines JWT-Claims auf → RPC-Auth-Guard (`auth.uid()` null) feuerte. Behoben (Admin-Claim vor dem Quota-Check gesetzt) — Code unberührt, reiner Test-Harness-Fix. Datei ist jetzt reproduzierbar grün.

**Verdict: 0 Critical / 0 High → PRODUCTION-READY.** Alle 6 Pflicht-Vektoren jetzt auf DB-Ebene live bewiesen (nicht nur authored). β (externe Konnektoren) bleibt out-of-scope.

## Deployment
_To be added by /deploy._
