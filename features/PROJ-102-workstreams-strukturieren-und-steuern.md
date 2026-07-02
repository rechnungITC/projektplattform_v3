---
id: PROJ-102
title: "Workstreams strukturieren und steuern"
issue_type: Story
epic_code: C
epic_title: "Aufgaben & Workstreams"
priority: Highest
priority_source: "Must (MVP)"
labels: ["ma-platform", "epic-c", "mvp"]
dependencies: ["A1", "A2", "C1", "D1", "L1", "L3"]
roles: ["Workstream Leads", "Deal Lead", "PMO-Lead", "SteerCo (lesend)"]
summary_for_jira: "[C2] Workstreams strukturieren und steuern"
---

# PROJ-102: Workstreams strukturieren und steuern

## Status: In Progress (Backend live)
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic C — Aufgaben & Workstreams)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND** · Andockpunkt: Gruppierung über Work-Items (merge mit PROJ-127). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** C — Aufgaben & Workstreams  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP)  
> **Labels:** `ma-platform` · `epic-c` · `mvp`  
> **Abhängigkeiten:** `A1`, `A2`, `C1`, `D1`, `L1`, `L3`

**User Story:**

Als Workstream Lead möchte ich meinen Workstream (z. B. Commercial DD, Legal, IT) mit Zielen, Aufgaben, Deliverables und Statusbericht eigenständig steuern, damit Workstream-Verantwortung sichtbar und auswertbar ist.

**Beschreibung / Kontext:**

Das Modell nennt 12 typische Workstreams (Strategy, Commercial, Finance, Tax, Legal, HR, IT, Operations, Sales/Customer, Integration/PMI, Communications, Risk/Compliance). Jeder Workstream ist eine eigene Steuerungseinheit.

**Akzeptanzkriterien:**

- [ ] Workstreams sind je Projekt anlegbar und einer Phase oder mehreren Phasen zuordenbar.
- [ ] Pro Workstream sind Ziel, Verantwortlicher, Status (RAG), Aufgabenliste und Deliverable-Liste sichtbar.
- [ ] Ein Workstream-Dashboard zeigt Fortschritt (% erledigte Aufgaben, offene Risiken, abgeschlossene Deliverables).
- [ ] Der Workstream-Status fließt in das Projekt-Statusreporting (L1, L3) ein.
- [ ] Workstreams sind aus Templates (A3) vorbelegbar.

**Abgrenzungen (Out of Scope):**

- Keine eigene Workstream-Methodik wird vorgegeben – die Plattform strukturiert nur.
- Workstream-Kapazitäten / Auslastung sind nicht abbildbar.

**Offene Fragen:**

- Soll der Workstream-Status manuell oder regelbasiert bestimmt werden (z. B. ab x % überfälligen Tasks = Rot)?
- Sollen workstream-übergreifende Abhängigkeiten visualisiert werden (Dependency Map)?

**Definition of Ready:**

- [ ] Workstream-Liste ist mit M&A abgestimmt.
- [ ] RAG-Logik ist definiert.

**Definition of Done:**

- [ ] Workstreams sind anlegbar, befüllbar, Status pflegbar und im Reporting sichtbar.

**Abhängigkeiten:**

- A1, A2 – Projekt, Phasenmodell
- C1 – Aufgaben
- D1 – Deliverables
- L1, L3 – Reporting

**Betroffene Rollen:**

- Workstream Leads
- Deal Lead
- PMO-Lead
- SteerCo (lesend)

---

## Tech Design (Solution Architect)

**Architektur-Datum:** 2026-07-02 · **Reuse-Klasse:** EXTEND (PROJ-112-Rezept, nicht dd_streams generalisieren) · **CIA-reviewed:** 2026-07-02 (5 Forks gelockt, GO)

### Leitprinzip
Ein Workstream ist eine **neue Steuerungseinheit je M&A-Projekt** (Strategy, Commercial, Legal, IT, PMI, …). Wir bauen sie nach dem **bewährten PROJ-112 (`dd_streams`)-Rezept** (Struktur + Need-to-know + Audit), aber als **eigene Tabelle** — ein DD-Stream ist ein Geschwister, kein Spezialfall (ADR: 102 merge mit 127 PMI, nicht mit 112). Aufgaben (PROJ-101) und Risiken (PROJ-20) werden per **additiver pro-Paar-FK** an Workstreams gehängt — kein neues Link-Generikum.

### Neue Datenobjekte
```
workstreams (je Projekt)
- id, tenant_id, project_id
- workstream_key   (slug-regex, unique je Projekt — wie dd_streams.stream_key)
- label            (Anzeigename, z. B. "Legal DD")
- goal             (Ziel, Freitext — AC2)
- lead_user_id     (Verantwortlicher, FK profiles, nullable)
- rag_status       (Enum green|amber|red, manuell — AC2/F5, default 'green')
- scope, notes     (optional)
- confidentiality_level  (ma_confidentiality_level, 100a — Need-to-know von Tag 1)
- sort_order
- (PROJ-10 Field-Audit)

workstream_phases (M:N — AC1 "einer ODER mehreren Phasen", F2)
- workstream_id, phase_id, tenant_id  (unique(workstream_id, phase_id))

work_items.workstream_id   (NEU, nullable FK → workstreams, F3 / PROJ-Y-101a)
risks.workstream_id        (NEU, nullable FK → workstreams, F4 — analog risks.context_phase_id)
```

### Gelockte Architektur-Entscheidungen (CIA 2026-07-02)
- **F1 — Neue `workstreams`-Tabelle, KEINE dd_streams-Generalisierung.** dd_streams trägt DD-Semantik (findings_consolidated, Q&A/Findings-FK-Ketten, eigener RPC) und ist deployed + per-FK belastet. Generalisieren = hoher Blast-Radius, null MVP-Nutzen. Wir reusen das **Rezept** (Struktur/RLS/Audit/`audit_entity_type`-CHECK/`can_read_audit_entry`-Zweig), nicht die Tabelle → kein DUP.
- **F2 — M:N `workstream_phases`.** AC1 fordert Multi-Phase explizit; Workstreams laufen fachlich phasenübergreifend (IT-Integration: DD→Signing→PMI). Single→M:N später nachrüsten wäre ein Datenmodell-Bruch. Kein verfrühtes Generikum — minimal-korrekte Kardinalität für ein explizites AC.
- **F3 — `work_items.workstream_id` FK (löst PROJ-Y-101a ein).** Additive nullable FK auf der Kern-Tabelle (Pflicht-`gitnexus_impact` vor Migration; nullable + kein CHECK bricht Bestand nicht). PROJ-101-Konsumenten (`ma-task-dialog` Freitext→WS-Dropdown, `ma-tasks-page`-Filter, `useWorkItems.workstream`) von `attributes->>ma_workstream` auf `.eq('workstream_id', …)` umstellen. **Pflicht bleibt WEICH** (UI-seitig für M&A-Tasks, KEIN DB-NOT-NULL — generische Non-M&A-work_items haben nie einen Workstream) → verlängert PROJ-101-D-1. Bestehende Freitext-Tags werden **nicht gelöscht** (Datenverlust-Schutz; realistisch 0 Zeilen in Prod, da PROJ-101 gestern kam + keine M&A-Projekte); Rest-Aufräumung → PROJ-Y-102e.
- **F4 — `risks.workstream_id` FK (pro-Paar, kein Polymorph).** PROJ-102 ist der in PROJ-101-F2 erwartete „zweite Konsument". Präzedenz: `risks.context_phase_id` ist bereits eine nullable pro-Paar-FK zu phases — `risks.workstream_id` ist exakt konsistent. Dashboard-Query: `count(risks WHERE workstream_id=X AND status='open')`. Polymorphe Governance-Link-Tabelle wäre das verfrühte Generikum, vor dem F2 warnte.
- **F5 — Manueller RAG-Status.** green/amber/red, gesetzt vom WS-Lead. Regelbasierte Auto-RAG (x% überfällige Tasks → rot) braucht unabgestimmte Schwellwerte + macht Governance-Status streitbar → deferred (PROJ-Y-102d), später additiv als berechnetes Feld neben manuellem Override.

### Was neu gebaut wird
1. **Migration** (PROJ-112-Rezept, idempotent, Section-0-CHECK zuerst): `workstreams` + `workstream_phases` (RLS: tenant + 3 RESTRICTIVE Need-to-know-Policies via `can_access_classified`); additive `work_items.workstream_id` + `risks.workstream_id`; `audit_log_entity_type_check` um `'workstreams'`+`'workstream_phases'` erweitern **vor** erstem Audit-Write (PROJ-100a-H-1-Lektion); `can_read_audit_entry` authenticated-EXECUTE-Grant nach Recreate re-granten (Memory-Lektion); PROJ-10-Audit-Wiring (`_tracked_audit_columns`).
2. **Dashboard-Aggregat** = SECURITY-**INVOKER**-RPC `workstream_dashboard(project)` (mirror PROJ-116 `dd_report_consolidated`): pro WS `{ tasks_total, tasks_done, open_risks, deliverables_total:null }` — Need-to-know **gratis** über INVOKER + Caller-Kontext. Deliverable-Count = `null`/„—" bis PROJ-104.
3. **API-Routen:** `GET/POST /workstreams`, `GET/PATCH/DELETE /workstreams/[wsid]` (rag_status via PATCH — RAG ist kein Lifecycle-State-Machine, freie Übergänge, plain PATCH durch Audit-Trigger), `PUT /workstreams/[wsid]/phases` (M:N setzen), `GET /workstreams/dashboard` (INVOKER-RPC).
4. **PROJ-101-Umstellung (F3):** Aufgaben-Dialog + Filter auf WS-Dropdown/FK.

### Komponenten-Struktur (UI)
```
M&A-Projektraum
└── Tab „Workstreams" (neu, requiresProjectType ma)
    ├── Dashboard-Kacheln je WS: Label · Lead · RAG-Badge · Fortschritt (% Tasks) · offene Risiken · Deliverables (—)
    ├── „Neuer Workstream" / „Bearbeiten"-Dialog (Label · Ziel · Lead · RAG · Phasen-Multiselect · Vertraulichkeit)
    ├── WS-Detail: Ziel + RAG + Aufgabenliste (work_items WHERE workstream_id, reuse) + Risiken (reuse) + Deliverables (—)
    └── RAG-Inline-Control (green/amber/red)

Querschnitt: PROJ-101 „Aufgaben"-Tab → Workstream-Feld wird FK-Dropdown statt Freitext.
```

### Offene Spec-Fragen — beantwortet
- **RAG manuell vs. regelbasiert?** Manuell (F5); Auto-Regel → PROJ-Y-102d.
- **Workstream-übergreifende Dependency-Map?** Out of Scope MVP → Followup (nutzt später die deployte polymorphe `dependencies`-Tabelle aus PROJ-9-R2).

### Deviations (dokumentiert)
- **AC2/AC3 Deliverable-Liste/-Count** → forward-compat deferred (PROJ-104 fehlt), Dashboard zeigt „—". Owner **PROJ-104** (`deliverables.workstream_id`, gleiches pro-Paar-Muster).
- **AC5 Template-Vorbelegung** → deferred (PROJ-96 fehlt). Owner **PROJ-96** (PROJ-Y-102c).
- **AC4 tiefe Reporting-Integration (L1/L3)** → deferred (PROJ-131/132 fehlt); `rag_status` + Aggregate sind read-ready. Owner **PROJ-131/132** (PROJ-Y-102d).
- **AC1 „mehrere Phasen"** voll erfüllt (M:N, KEINE Deviation).

### Tech-Entscheidungen (für PM)
- **Rezept-Reuse statt Neubau/Refactor:** Workstreams erben Need-to-know, Audit und das erprobte Struktur-Muster der DD-Streams, ohne die Live-DD-Kette anzufassen.
- **Pro-Paar-FK statt Link-Generikum:** Aufgaben/Risiken hängen direkt und indexierbar am Workstream — konsistent mit dem bestehenden `risks.context_phase_id`.
- **Manueller RAG:** transparenter, unstrittiger Governance-Status; das Dashboard liefert die Datenbasis.

### Abhängigkeiten (Pakete)
Keine neuen npm-Pakete. Eine Supabase-Migration (2 Tabellen + 2 additive FKs + 1 INVOKER-RPC).

### Risiken (CIA)
- **HOCH-Blast `work_items` (F3):** Pflicht-`gitnexus_impact` + idempotente/reversible Migration + Live-Migration-Smoke gegen Prod.
- `audit_entity_type`-CHECK vor erstem Audit-Write erweitern; `can_read_audit_entry`-Grant re-granten; Need-to-know 3 RESTRICTIVE-Policies + Pentest-AC von Tag 1; nicht-gematchte `ma_workstream`-Tags nicht löschen.

### Followups (PROJ-Y)
- **PROJ-Y-102a → PROJ-127:** Workstream-`type`/IMO-Config beim PMI-Merge.
- **PROJ-Y-102b → PROJ-104:** `deliverables.workstream_id` + Deliverable-Count aktivieren.
- **PROJ-Y-102c → PROJ-96:** Workstream-Template-Katalog + AC5-Vorbelegung.
- **PROJ-Y-102d → PROJ-131/132:** Auto-RAG-Regel + WS-Status in Report-Presets.
- **PROJ-Y-102e (Hygiene):** stehen-gebliebene `attributes.ma_workstream`-Tags nach Deploy auditieren/aufräumen.

---

## Backend Implementation Notes (2026-07-02)

**Migration `20260702074148_proj102_workstreams`** (live in Prod-DB + Repo versionsgleich, PROJ-134-konform; recreates auf LIVE-Defs aufgesetzt inkl. committees/dd_*):
- `workstreams` (workstream_key unique/Projekt, label, goal, lead_user_id, `rag_status` green/amber/red default green, scope, notes, `confidentiality_level`, sort_order) — RLS tenant/project (PROJ-4) + 3 RESTRICTIVE Need-to-know-Policies (`can_access_classified`), moddatetime + `record_audit_changes`-Trigger.
- `workstream_phases` M:N (PK (workstream_id, phase_id)) — RLS faltet Membership + Need-to-know über die Eltern-`workstreams` ein; kein Audit-Trigger (Join, insert/delete-only).
- Additive nullable FKs `work_items.workstream_id` + `risks.workstream_id` (beide ON DELETE SET NULL, partieller Index) — work_items additiv (HOCH-Blast sicher, kein NOT NULL).
- `audit_log_entity_type_check` um `workstreams`+`workstream_phases` erweitert **aus der Live-Liste** (committees etc. erhalten). `_tracked_audit_columns` + `can_read_audit_entry` aus Live-Defs recreated + `workstreams`-Zweig + **authenticated-EXECUTE re-granted** (Recreate-drop-Lektion).
- SECURITY-**INVOKER**-RPC `workstream_dashboard(project)` → je WS `{tasks_total, tasks_done, open_risks, deliverables_total:null}`; Need-to-know via Caller-Kontext.

**API:** `GET/POST /workstreams`, `GET/PATCH/DELETE /workstreams/[wsid]` (rag_status via PATCH — kein State-Machine-RPC), `PUT /workstreams/[wsid]/phases` (M:N-Diff: add-missing/remove-extra, kein Wholesale-Wipe), `GET /workstreams/dashboard`. Auth via `requireProjectAccess` (view/manage_members). Client-Wrapper `lib/ma-project/workstreams-api.ts`, Typen `types/workstream.ts`, Hook `use-workstreams`.

**F3 (additiv, Build-grün):** `work_items.workstream_id` in create+patch-Zod-Schema (Spread→INSERT/UPDATE), `WorkItem`-Typ + beide Hooks (Select+Mapping), `useWorkItems.workstreamId`-Filter ergänzt. Der alte `attributes.ma_workstream`-Pfad bleibt vorerst; **UI-Umstellung auf WS-Dropdown (ma-task-dialog/ma-tasks-page) → /frontend** (PROJ-Y-102e für Tag-Cleanup).

**Live-Smoke gegen Prod (Pflicht, 0 Residue):** DO-Block auf PMI-Projekt — 8/8 Assertions: RAG default green · M:N 2 Phasen · work_item-Link · risk-Link open · dashboard open_risks=1/tasks_total=1 · **committees noch im CHECK (kein Regressions-Verlust)** · Audit-Row für workstreams-UPDATE (CHECK+tracked+Trigger). Residue-Recheck 0.

**Quality-Gates:** vitest **2171/2171** (+24 Route-Tests + Drift-Kitchensinks um workstream_id erweitert); ESLint 0; tsc 14 Baseline/0 neu; build clean (4 Routen registriert).

**Noch offen → /frontend:** „Workstreams"-Tab (Nav-Section + Dashboard-Kacheln + Create/Edit-Dialog mit Phasen-Multiselect + RAG-Control + Detail mit Aufgaben/Risiken-Liste) + PROJ-101-Aufgaben-Dropdown-Umstellung. **→ /qa:** Need-to-know-Pentest (RESTRICTIVE-Policies), Live-E2E, Playwright-Auth-Gate.

---

## Frontend Implementation Notes (2026-07-02)

**Neuer „Workstreams"-Tab im M&A-Projektraum + F3-UI-Umstellung.**
- **Nav** (`method-templates/index.ts`): `MA_WORKSTREAMS_SECTION` (`tabPath: "workstreams"`, Icon `Layers`, `requiresProjectType: "ma"`) via `withMaFoundation` nach Aufgaben injiziert (…Rollen → Aufgaben → **Workstreams** → Governance → Due Diligence → DD-Bericht).
- **Route** `src/app/(app)/projects/[id]/workstreams/page.tsx`.
- **`workstreams-page.tsx`** (Dashboard-Kacheln): pro WS Card mit Label · RAG-Badge (grün/gelb/rot) · Ziel · Lead (via `useTenantMembers`) · Fortschrittsbalken (`tasks_done/tasks_total` aus `workstream_dashboard`) · offene Risiken · Deliverables „—" · Inline-RAG-Select (PATCH `rag_status`) · Edit/Delete (`edit_master`-gated, AlertDialog-Confirm). Dashboard-Fetch als `let cancelled`-IIFE (react-compiler-safe).
- **`workstream-dialog.tsx`** (Create/Edit, react-hook-form + `useWatch`): Label · Ziel · Lead (ResponsibleUserPicker) · RAG-Select · Vertraulichkeit-Select · Phasen-Checkbox-Liste (`usePhases`); create leitet `workstream_key` per `slugifyKey(label)` ab; Phasen via `setWorkstreamPhases` (Diff-PUT); Edit lädt Bestands-Phasen via `getWorkstream`.
- **F3 UI-Switch (PROJ-Y-101a eingelöst):** `ma-task-dialog` Workstream-Feld Freitext → **WS-Dropdown** (`useWorkstreams`, schreibt `workstream_id`; `attributes.ma_workstream`-Manipulation entfernt); `ma-tasks-page` Filter Freitext → WS-Dropdown (`workstreamId`), Zeilen-Badge zeigt WS-Label aus `workstream_id`-Map. `useWorkItems.workstreamId` genutzt.
- Reuse Card/Progress/Badge/Select/Dialog/AlertDialog/Checkbox + ResponsibleUserPicker/usePhases/useTenantMembers. Kein neues Dep/shadcn.

**Quality-Gates:** vitest **2171/2171**; ESLint 0 (0 warnings — `useWatch` statt `watch`); tsc 14 Baseline/0 neu; build clean (`/projects/[id]/workstreams` + 4 API-Routen registriert).

**Noch offen → /qa:** Need-to-know-Pentest (RESTRICTIVE-Policies via Impersonation), Live-E2E (WS anlegen → Phasen → Task/Risk-Zuordnung → Dashboard → RAG → Delete, 0 Residue), Playwright-Auth-Gate für Route + APIs.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · C — Aufgaben & Workstreams_
