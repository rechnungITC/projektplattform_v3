---
id: PROJ-104
title: "Deliverable-Katalog je Phase und Workstream führen"
issue_type: Story
epic_code: D
epic_title: "Deliverables & Artefakte"
priority: Highest
priority_source: "Must (MVP)"
labels: ["ma-platform", "epic-d", "mvp"]
dependencies: ["A1", "A2", "A3", "B1", "C1", "C2"]
roles: ["PMO-Lead", "Workstream Leads", "Deal Lead"]
summary_for_jira: "[D1] Deliverable-Katalog je Phase und Workstream führen"
---

# PROJ-104: Deliverable-Katalog je Phase und Workstream führen

## Status: Architected
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic D — Deliverables & Artefakte)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND** · Andockpunkt: neue `deliverables` (an PROJ-79 DMS). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** D — Deliverables & Artefakte  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP)  
> **Labels:** `ma-platform` · `epic-d` · `mvp`  
> **Abhängigkeiten:** `A1`, `A2`, `A3`, `B1`, `C1`, `C2`

**User Story:**

Als PMO-Lead möchte ich für jede Phase und jeden Workstream einen Katalog der zu erstellenden Deliverables (LOI, DD-Berichte, SPA, Closing Checklist) verwalten, damit verbindlich erkennbar ist, was bis wann zu liefern ist und wer dafür verantwortet.

**Beschreibung / Kontext:**

Das Modell listet pro Phase Deliverables (LOI, DD-Reports, SPA, Closing Memorandum, Day-1-Plan etc.). Diese sind die wesentlichen Steuerungsobjekte zur Fortschrittsbewertung.

**Akzeptanzkriterien:**

- [ ] Deliverable kann angelegt werden mit Name, Beschreibung, Phase, Workstream, Verantwortlichem (RACI), Solltermin, Status.
- [ ] Status: geplant, in Arbeit, in Review, freigegeben, ausgesetzt.
- [ ] Deliverables sind aus Template (A3) vorbelegbar.
- [ ] Ein Deliverable kann mit Dokumenten verknüpft werden (Datei-Upload oder Link zu DMS/Datenraum).
- [ ] Eine 'Deliverable-Ampel' im Workstream-Dashboard (C2) zeigt überfällige und kritische Deliverables.

**Abgrenzungen (Out of Scope):**

- Inhaltliche Qualitätsprüfung des Deliverables ist nicht Aufgabe der Plattform.
- Keine eigene Dokumentenerstellung.

**Offene Fragen:**

- Welches DMS / welcher Datenraum wird primär angebunden?
- Müssen Deliverables zwingend versioniert sein (siehe D3) oder reicht externe Versionierung im DMS?
- Wer entscheidet bei fehlenden Standard-Deliverables (z. B. neuer Deal-Typ)?

**Definition of Ready:**

- [ ] Standard-Deliverable-Liste je Phase ist mit M&A abgestimmt.
- [ ] Anbindungs-Strategie zu DMS/Datenraum ist entschieden.

**Definition of Done:**

- [ ] Deliverables sind anlegbar, befüllbar, verknüpfbar.
- [ ] Status und Frist sind nachverfolgbar.
- [ ] Vorbelegung aus Template funktioniert.

**Abhängigkeiten:**

- A1, A2, A3 – Projekt, Phase, Template
- B1 – Rollen
- C1, C2 – Aufgaben, Workstreams

**Betroffene Rollen:**

- PMO-Lead
- Workstream Leads
- Deal Lead

---

## Tech Design (Solution Architect)

**Architektur-Datum:** 2026-07-02 · **Reuse-Klasse:** EXTEND (dd_streams/PROJ-102-Rezept) · **CIA-reviewed:** 2026-07-02 (5 Forks gelockt, GO)

### Leitprinzip
Deliverables sind eine **neue M&A-Steuerungstabelle** je Projekt, gebaut nach dem bewährten dd_streams/workstreams-Rezept (Need-to-know + Audit + State-Machine-RPC). Sie hängen per **pro-Paar-FK** an Phase und/oder Workstream, lösen die in PROJ-102 zurückgestellte **Deliverable-Ampel** ein und **unlocken RACI** für Deliverables (wie im PROJ-97b-Migrations-Kommentar vorgesehen). Der formale Freigabe-Workflow (PROJ-105), echte Datei-Uploads (PROJ-79) und Templates (PROJ-96) bleiben bewusst außen vor.

### Neue Datenobjekte
```
deliverables (je Projekt)
- id, tenant_id, project_id
- name, description
- phase_id       (nullable FK phases, ON DELETE SET NULL)
- workstream_id  (nullable FK workstreams, ON DELETE CASCADE)
- CHECK (phase_id IS NOT NULL OR workstream_id IS NOT NULL)   -- kein Orphan (F1/R-1)
- responsible_user_id (FK profiles, "Verantwortlicher" — AC1)
- due_date       (Solltermin — AC1)
- status         (Enum planned/in_progress/in_review/approved/suspended — AC2)
- confidentiality_level (ma_confidentiality_level, 100a)
- sort_order
- (PROJ-10 Field-Audit)

deliverable_documents (Doc-Links, AC4 — externe URL, kein echter Upload)
- id, tenant_id, deliverable_id (FK CASCADE)
- title, url, tag_keys
- (Need-to-know erbt via EXISTS auf Eltern-deliverable)
```

### Gelockte Architektur-Entscheidungen (CIA 2026-07-02)
- **F1 — Anker:** `phase_id` + `workstream_id` beide nullable, aber `CHECK (phase_id IS NOT NULL OR workstream_id IS NOT NULL)` (ein Deliverable ohne Anker ist bedeutungslos + unzählbar für die Ampel). **`phase_id ON DELETE SET NULL`, `workstream_id ON DELETE CASCADE`** — verhindert, dass paralleles Löschen beider FKs den CHECK verletzt (R-1). Kein `deliverable_key`-Slug (kein URL-Bedarf; `sort_order` reicht).
- **F2 — Status-Lifecycle, `approved` PROJ-105-reserviert:** `transition_deliverable_status`-RPC nach `transition_dd_stream_status`-Muster (kein direktes Status-UPDATE, kein actor-param, revoke anon/public). Whitelist: `planned ↔ in_progress ↔ in_review`, alle → `suspended`, `suspended → planned`. **Der Übergang `in_review → approved` ist NICHT in PROJ-104 erlaubt** — `approved` ist reservierter Terminal-Status, den erst PROJ-105 via PROJ-31-Gate/Quorum vergibt (kein informeller Freigabe-Pfad, keine DUP mit 105). Im RPC-Kommentar dokumentiert.
- **F3 — Doc-Verknüpfung:** leichte `deliverable_documents`-Link-Tabelle (URL + Titel + tag_keys, `work_item_documents`-Muster), **externer Link only**; echter Datei-Upload deferred an PROJ-79 (dockt später als weitere Zeilenquelle an dieselbe Tabelle, kein Rebuild). Kein Storage-Bucket in PROJ-104. RESTRICTIVE-Gate erbt via EXISTS auf `deliverables` (analog `workstream_phases`).
- **F4 — RACI:** BEIDES — `responsible_user_id`-Feld (AC1 „Verantwortlicher", direkt editierbar wie `dd_streams.stream_lead_user_id`) **UND** `raci_assignments.target_type`-CHECK auf `('work_item','deliverable')` erweitern (recreate) + `set_deliverable_raci`/`clear_deliverable_raci`-RPC-Paar (analog `set_work_item_raci`, mit `deliverables`-Lookup). RACI-Audit löst über `raci_assignments.project_id` auf → kein neuer RACI-Zweig nötig; nur `deliverables` + `deliverable_documents` in `can_read_audit_entry` + `_tracked_audit_columns` ergänzen.
- **F5 — Deliverable-Ampel (löst PROJ-Y-102b):** deployten `workstream_dashboard`-RPC per `create or replace` (RPC-body-patch via `pg_get_functiondef`-Anchor) umstellen — `deliverables_total` = echte Zählung, neu `deliverables_overdue` (`due_date < today AND status NOT IN (approved, suspended)`). **SECURITY-INVOKER bleibt** → Need-to-know + Aggregat-Leak-Schutz via Caller-Kontext (LEFT JOIN respektiert RESTRICTIVE-Policies; PROJ-114/116-Lektion). „Kritisch" mappt das FE (overdue ∨ in_review-überfällig), kein DB-Feld. Phasen-Sicht deferred (PROJ-Y-104b).

### Was neu gebaut wird
1. **1 Migration:** `deliverables` + `deliverable_documents` (RLS tenant/project + 3 RESTRICTIVE Need-to-know; Audit-Trigger nur auf `deliverables`); `raci_target_type_check` recreate (+`deliverable`); `transition_deliverable_status` + `set/clear_deliverable_raci` RPCs; **Audit-Trio recreate aus LIVE-Defs** (+`deliverables`/`deliverable_documents`-Zweige, committees/workstreams erhalten, `authenticated`-Grant re-granten — R-2); `workstream_dashboard` create-or-replace (F5). Idempotent, Minute-Timestamp = Repo-Dateiname (PROJ-134).
2. **API-Routen:** `GET/POST /deliverables`, `GET/PATCH/DELETE /deliverables/[did]` (Status via `.../status`-RPC-Route), `GET/POST/DELETE /deliverables/[did]/documents`, `GET/POST/DELETE /deliverables/[did]/raci` (analog work-items/raci).
3. **Frontend:** „Deliverables"-Tab im M&A-Raum (Liste/Katalog je Phase+Workstream, Filter, Status-Inline, Create/Edit-Dialog mit Doc-Links + RACI) + **Ampel-Integration** ins Workstream-Dashboard (deliverables_total/overdue-Anzeige, „—" ersetzt).

### Komponenten-Struktur (UI)
```
M&A-Projektraum
└── Tab „Deliverables" (neu, requiresProjectType ma)
    ├── Filter: Phase · Workstream · Status · Verantwortlicher
    ├── Katalog-Liste: Name · Phase · Workstream · Verantwortlich · Solltermin (rot=überfällig) · Status-Badge/Inline · Doc-Count
    ├── Create/Edit-Dialog: Name/Beschreibung · Phase · Workstream · Verantwortlicher · Solltermin · Status · Vertraulichkeit · Doc-Links · RACI-Matrix
    └── Status-Transition (RPC; approved ausgegraut → „via Freigabe (PROJ-105)")

Querschnitt: Workstream-Dashboard-Kachel (PROJ-102) zeigt jetzt Deliverables total/überfällig statt „—".
```

### Offene Spec-Fragen — beantwortet
- **Welches DMS?** PROJ-79 (später); PROJ-104 = externer Link + PROJ-115-Datenraum-Link.
- **Deliverables versioniert?** Field-Level-Audit (PROJ-10) deckt Historie ab; explizite Versionsstände → PROJ-106.
- **Fehlende Standard-Deliverables?** Manuell anlegbar; Template-Katalog → PROJ-96.

### Deviations (dokumentiert, alle forward-compat)
- **AC3 Template-Vorbelegung** → PROJ-96 (PROJ-Y-104a).
- **Echter Datei-Upload** → PROJ-79 (PROJ-Y-104c); PROJ-104 liefert Link-Tabelle.
- **`approved`-Gate/Freigabe-Workflow** → PROJ-105 (`approved` reserviert, nicht in 104 setzbar).
- **Versionierung** → PROJ-106.

### Tech-Entscheidungen (für PM)
- **Rezept-Reuse:** Deliverables erben Need-to-know, Audit, State-Machine und Ampel-Integration ohne Neubau.
- **`approved` bewusst gesperrt:** verhindert einen informellen Freigabe-Pfad, den PROJ-105 später aufbrechen müsste.
- **Doc-Links statt Upload:** erfüllt AC4 heute, ohne ein verfrühtes Storage-Feature vor dem DMS zu bauen.

### Abhängigkeiten (Pakete)
Keine neuen npm-Pakete. Eine Supabase-Migration.

### Risiken (CIA)
- **R-1** phase SET NULL / workstream CASCADE gegen den NOT-NULL-CHECK (bei /backend testen).
- **R-2** Audit-Trio-Recreate droppt `authenticated`-Grant → verbatim aus LIVE + re-grant (Pflicht-Live-Smoke).
- **R-3** Aggregat-Leak im geänderten RPC → SECURITY-INVOKER + Pentest (nicht-cleared Member zählt vertrauliche Deliverables NICHT).

### Followups (PROJ-Y)
- **PROJ-Y-104a → PROJ-96:** Deliverable-Template-Vorbelegung (Copy-on-create).
- **PROJ-Y-104b → PROJ-95:** Phasen-Sicht der Deliverable-Ampel im Cockpit.
- **PROJ-Y-104c → PROJ-79:** echter Datei-Upload (Bucket-Quelle an `deliverable_documents`).

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · D — Deliverables & Artefakte_
