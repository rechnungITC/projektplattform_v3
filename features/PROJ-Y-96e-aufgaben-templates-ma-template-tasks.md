# PROJ-Y-96e: Aufgaben-Templates (`ma_template_tasks`)

## Status: Deployed
**Created:** 2026-08-04
**Deployed:** 2026-08-06 — Tag `v2.33.0-PROJ-Y-96e` (merge `b6d2e57` via PR #293 squash). Migration `20260805083132_proj_y_96e_task_templates` seit /backend in Prod; Runtime-Deploy = Squash-Merge auf main → Vercel-Auto-Deploy. Post-Deploy-Smoke: `/api/ma-project-templates`, `/api/projects/[id]/apply-template`, `/stammdaten/projekt-vorlagen` alle 307 Auth-Gate; Prod-DB-Verify (tasks-Table + FK RESTRICT + 4 Policies + beide RPCs + anon-Revoke) alle grün. Bundled: Supply-Chain-Fix (4 neue HIGH-Advisories via `overrides` — fast-uri^3.1.5 · hono^4.12.34 · ip-address^10.4.0 · brace-expansion^5.0.9; PROJ-140-Muster; npm audit exit 0). Offener Followup: /qa (Playwright-Auth-Gate-E2E — vom User bewusst nach Deploy gelegt, weil Migration bereits in Prod war seit /backend und FE-Änderungen additiv/read-only sind).

> **Elternfeature:** PROJ-96 (Projekt-Templates für Standardphasen) — Deployed (α). Diese Slice ergänzt Aufgaben-Templates als dritte Kind-Tabelle neben Workstreams + Deliverables.
>
> **Historie:** Aus PROJ-141-γ1 Scope-Ehrlichkeit (2026-07-31) als eigener Followup nachregistriert (PR #291, 2026-08-03). PROJ-96 wurde ursprünglich als voll „Deployed" markiert, obwohl AC3 („Aufgaben-Bündel") nie geliefert wurde — Katalog war Katalog-Lesesicht mit Phasen + Workstreams + Deliverables + Wizard-Picker; Aufgaben-Templates fehlten. Diese Slice schließt die Lücke.

## Dependencies
- **Requires:** PROJ-96 (α — `ma_project_templates` + `ma_template_workstreams` + `ma_template_deliverables` + `apply_ma_project_template`-RPC live in Prod, Migration `20260724120055`).
- **Requires:** PROJ-9 (work_items, `kind`+`priority`+`due_date`), PROJ-101 (work_items im „Aufgaben"-Tab sichtbar), PROJ-102 (`workstreams.source_template_id`-Provenance-Muster), PROJ-104 (Deliverables mit optionalem Phase/Workstream-Anker), PROJ-141-γ3 (Provenance-FK `ON DELETE RESTRICT` als Herkunftsschutz).
- **Nicht blockierend, aber angrenzend:** PROJ-Y-96b (RACI-Templates) — RACI könnte später auch Template-Aufgaben referenzieren.

## User Stories

- **US-1:** Als **Tenant-Admin** möchte ich, dass das Buy-Side-M&A-Standard-Template neben Phasen/Workstreams/Deliverables auch **eine Kickoff-Aufgabenliste** mitliefert, damit ein neu angelegtes M&A-Projekt nicht mit einem leeren Aufgabenbereich startet und die typischen Ersthandlungen (Mandat freigeben, Kickoff-Termin planen, DD-Streams anlegen usw.) vorstrukturiert sind.

- **US-2:** Als **Projektleiter** möchte ich beim Anwenden eines Template die vorgesehenen Aufgaben **automatisch in meinen Backlog gespielt** bekommen — angehängt an die passenden Workstreams oder Phasen — damit ich sofort mit dem Abhaken beginnen kann statt selbst die Standard-Checkliste zu tippen.

- **US-3:** Als **Projektleiter** möchte ich jede vom Template gelieferte Aufgabe **frei editieren oder löschen** können, ohne dass sich das Template dadurch verändert oder umgekehrt eine spätere Template-Änderung meine bereits-editierten Aufgaben überschreibt (entkoppelte Kopie — analog zu Workstreams/Deliverables).

- **US-4:** Als **Auditor / QA** möchte ich an jedem Work-Item, das aus einem Template stammt, **den Herkunfts-Stempel** (welches Template + welche Versionsnummer) sehen können, damit ich nachvollziehen kann, welche Backlog-Zeilen automatisch aus welchem Template-Stand entstanden sind.

- **US-5:** Als **Tenant-Admin** möchte ich, dass **Sub-Aufgaben-Hierarchien** im Template abbildbar sind (z. B. „Kickoff-Meeting terminieren" → Sub-Aufgabe „Teilnehmerliste erstellen"), damit die geerbten Kickoff-Aufgaben nicht nur eine flache Liste, sondern eine sinnvolle Struktur haben.

## Acceptance Criteria

- [ ] **AC1 — Buy-Side-Default enthält Aufgaben**: Beim Erstzugriff/Seed erzeugt `ensure_default_ma_project_templates` (bzw. sein Nachfolger) neben den 7 Workstreams + 9 Deliverables **3-5 Aufgaben pro Workstream** (25-35 total, jeweils sinnvolle Kickoff-Aufgaben mit Titel, Beschreibung, `target_kind`, Reihenfolge, optionaler `priority`/`estimated_days`/`due_date_offset_days` + optional `parent_task_key` für Sub-Aufgaben). Idempotent — mehrfacher Seed erzeugt keine Duplikate.

- [ ] **AC2 — Template anwenden erzeugt Work-Items**: Der bestehende atomare `apply_ma_project_template(project, template)`-RPC wird erweitert: nach dem Kopieren von Workstreams + Deliverables werden **Aufgaben-Templates zu echten `work_items`** kopiert, korrekt gemappt auf den frisch angelegten Projekt-Workstream (via `workstream_key`) und/oder die passende Projekt-Phase (via `phase_key` — mit PROJ-95 `activate_ma_phase_model` reused). `target_kind` bestimmt `work_items.kind`. `parent_task_key` wird zum `work_items.parent_id`-Mapping (topologische Ordnung: Parent zuerst).

- [ ] **AC3 — Herkunfts-Stempel auf work_items**: Jedes aus einem Template kopierte Work-Item trägt `source_template_id` (FK auf `ma_project_templates`, `ON DELETE RESTRICT` — analog PROJ-141-γ3 auf workstreams/deliverables) + `source_template_version` (int, Snapshot der Template-Versionsnummer zum Kopierzeitpunkt). Manuell angelegte Work-Items bleiben `source_template_id=NULL` — keine Rückwirkung auf Bestand.

- [ ] **AC4 — Anchor-Regel**: Ein Template-Aufgabe muss **mindestens einen Anker** (Workstream **oder** Phase) haben — `CHECK (workstream_key IS NOT NULL OR phase_key IS NOT NULL)` — analog PROJ-104 Deliverables. Beim Apply wird der Anker auf die frisch angelegte Projekt-Entität umgemappt; fehlt der Ziel-Workstream/-Phase, wird das Work-Item nicht angelegt (mit sichtbarem `warnings[]`-Eintrag — Muster von PROJ-141-γ2).

- [ ] **AC5 — Editierbar ohne Template-Rückwirkung**: Nach Apply sind die geerbten Work-Items **projektindividuell editierbar** (Titel, Beschreibung, Status, Zuweisung, Priorität, Fälligkeit, Anhänge). Änderungen am Template-Kopf oder an `ma_template_tasks` selbst wirken **nicht rückwirkend** auf bereits angelegte Work-Items — entkoppelte Kopie ist die Wahrheit (strukturell garantiert, kein Rück-FK auf Template-Inhalt).

- [ ] **AC6 — Kind-Whitelist**: `ma_template_tasks.target_kind` ∈ **`{task, subtask}`** (MVP). CHECK-Constraint auf beide Werte. Weitere Kinds (story/epic/work_package) sind **ausdrücklich deferred** — M&A-Standard nutzt Waterfall/Hybrid, nicht Scrum-Epics. `subtask` erfordert `parent_task_key`-Referenz auf ein anderes `ma_template_tasks`-Row im selben Template (self-FK) mit `target_kind='task'`; Parent-Task muss **im gleichen Batch** kopiert werden.

- [ ] **AC7 — Fälligkeit relativ zum Projektstart**: `due_date_offset_days` (nullable int, kann negativ sein) wird beim Apply zu `work_items.due_date = today + offset_days` gemappt (Server-side, `current_date`). Falls NULL → `due_date` bleibt NULL. Keine Zeitzonen-Komplexität (Datum-only, kein Timestamp).

- [ ] **AC8 — Priority + Estimated-Days-Passthrough**: `ma_template_tasks.priority` (`WorkItemPriority`-Enum, nullable, default NULL) wird zu `work_items.priority` kopiert (mit Fallback auf `medium`, falls NULL — der bestehende work_items-Default). `estimated_days` (nullable numeric) wird auf ein noch nicht existierendes work_items-Feld gemappt — **MVP: `estimated_days` wird ins Template geschrieben, aber NICHT auf work_items übertragen** (Ziel-Spalte fehlt; siehe Deviation D-1). Nachgezogen in PROJ-Y-96e-followup, wenn work_items.estimated_days angelegt wird.

- [ ] **AC9 — Re-Apply-Block bleibt hart**: Der bestehende Re-Apply-Block in `apply_ma_project_template` (Projekt hat schon Workstreams → P0001) gilt unverändert — auch mit Aufgaben. Duplikate durch Mehrfach-Apply sind ausgeschlossen.

- [ ] **AC10 — Live-RPC-Smoke (Pflicht)**: Vor Approved: Live-Pentest gegen Prod mit RAISE-Rollback (0 Residue) verifiziert: Seed → Apply → Verify (ws=7 + del=9 + tasks=25-35 mit korrekt aufgelöstem Anker + Provenance-Stempel + Parent-Sub-Hierarchie erhalten) → Re-Apply-Block → Anon-EXECUTE-Revoke → Cross-Tenant-Reject → Non-Admin-Non-Lead-Reject.

## Edge Cases

- **Template-Task ohne Ziel-Workstream**: Falls `workstream_key` gesetzt, aber der Ziel-Workstream im Projekt (nach Copy) nicht existiert (z. B. weil Template inkonsistent gepflegt wurde): Task wird **nicht** angelegt, `warnings[]` bekommt einen Eintrag „Aufgabe X übersprungen: Workstream Y nicht im Projekt-Copy angekommen." Kein Fatal-Fehler.

- **Template-Task mit `phase_key`, aber Phase 2 mandats-gesperrt**: `activate_ma_phase_model` überspringt Phase 2 bei nicht-freigegebenem Mandat. Falls eine Template-Task `phase_key='dd'` (Phase 2) hat → Task wird trotzdem angelegt (das Work-Item verweist auf die noch-nicht-aktive Phase). Alternativ könnte das Template die Task ebenfalls überspringen — **MVP-Lock**: Task wird angelegt (User sieht sie sofort, weiß aber, dass die Phase noch gesperrt ist). Deviation dokumentieren.

- **Subtask ohne existierenden Parent-Task im Template**: Wenn eine Row `target_kind='subtask'` gesetzt hat, aber `parent_task_key` auf einen nicht-existierenden anderen Template-Task-Row zeigt → **CHECK-Constraint schlägt fehl** (self-FK invalid) → Seed schlägt fehl → sichtbar beim Seed-Aufruf (P0001, wie PROJ-141-γ7 `seed_failed`).

- **Subtask verweist auf Parent, der selbst wieder Subtask ist**: Nicht erlaubt — CHECK stellt sicher, dass `parent_task_key` nur auf `target_kind='task'` verweisen darf. Verhindert unendliche Verschachtelung, hält M&A-Backlog flach (task→subtask, keine subtask→subtask).

- **Template hat Aufgaben, aber Projekt-Typ ist non-M&A**: `apply_ma_project_template` prüft `project_type='ma'` weiterhin am Kopf und lehnt Non-M&A-Projekte hart ab (P0001, unverändert PROJ-96).

- **Buy-Side-Default wird neu-geseedet nach Custom-Editing**: `ensure_default_ma_project_templates` bleibt **idempotent** (existierendes Buy-Side-Template mit gleichem `template_key` wird nicht überschrieben). Falls Admin die Default-Aufgaben löscht + Seed erneut aufruft → Aufgaben werden **nicht** neu-erzeugt (nur bei komplett fehlendem Template). Neu-erzeugen der Aufgaben erfordert Template-Löschen + neu-Seed (in PROJ-Y-96d Custom-CRUD nachgezogen).

- **Template mit 0 Aufgaben**: Legitimes Custom-Template kann bewusst 0 Aufgaben tragen. Apply erzeugt in dem Fall keine Work-Items — nur Workstreams + Deliverables. Kein Fehler, `warnings[]` bleibt leer.

- **Negatives `due_date_offset_days`**: Legitim (z. B. „-7" = „7 Tage vor Projektstart" für vorbereitende Aufgaben). Kein CHECK gegen Negativität.

- **`estimated_days=0`**: Legitim („Nulltage" = sofort erledigbare Aufgabe). Kein CHECK gegen 0. Nur `< 0` wird verboten (CHECK `>= 0`).

- **Template-Delete während laufender Apply**: Provenance-FK `ON DELETE RESTRICT` auf `work_items.source_template_id` verhindert Template-Delete, sobald irgendein Projekt bereits Work-Items aus dem Template erzeugt hat. Analog PROJ-141-γ3 auf workstreams/deliverables.

- **Cross-Tenant-Zugriff**: Alle Zugriffe (Read/Write auf `ma_template_tasks`, Apply auf fremde Templates) sind durch Tenant-RLS + `is_tenant_member`/`is_tenant_admin` geschützt — Cross-Tenant-Apply schlägt mit P0002 fehl (Template nicht auflösbar).

## Technical Requirements

- **Sicherheit:** RLS auf `ma_template_tasks` mit `is_tenant_member` (read) + `is_tenant_admin` (write), analog zu PROJ-96 Kind-Tabellen. SECURITY DEFINER RPC-Erweiterung, kein anon-EXECUTE-Grant.
- **Multi-tenant invariant:** `tenant_id NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` auf `ma_template_tasks` (Katalog-Tabelle), Tenant-Konsistenz-Trigger analog PROJ-77-γ (`skill_knowledge_links`).
- **Provenance:** `work_items.source_template_id UUID NULLABLE REFERENCES ma_project_templates(id) ON DELETE RESTRICT` (additiv, PROJ-141-γ3-Muster) + `work_items.source_template_version INT NULLABLE`.
- **Audit-Wiring (Pflicht):** `ma_template_tasks` in `entity_type`-CHECK + `_tracked_audit_columns` + `authenticated`-EXECUTE-Grant auf `can_read_audit_entry` in **derselben Migration** (PROJ-114-H-1-Lektion). **Deviation-Option**: Katalog-Table darf auf `record_audit_changes`-Trigger verzichten (nur `extensions.moddatetime`), analog PROJ-96 zu `dd_stream_templates`-Präzedenz. Muss in /architecture entschieden werden.
- **Migration-Naming (PROJ-134):** Repo-Dateiname == prod-registrierte Version. `extensions.moddatetime` schema-qualifiziert.
- **Pflicht-Live-RPC-Smoke** gegen Prod (0 Residue via RAISE-Rollback) für alle Vektoren in AC10.
- **Impact-Analyse** auf `apply_ma_project_template` **und** `ensure_default_ma_project_templates` vor Änderung (`gitnexus_impact upstream`) — beide sind deployt und werden vom Wizard-Finalize-Hook aufgerufen.
- **Kein neuer Dependency**, keine neue Tenant-Rolle.
- **Performance:** Apply-RPC muss auch bei ~35 Tasks + Sub-Tasks in einer TX bleiben (topologische Ordnung: Parents first, Subtasks second) — ein einziges Statement-Batch, kein N+1.

## MVP-Scope-Schnitt (analog PROJ-96 CIA)

**IN:**
- 1 neue Kind-Tabelle `ma_template_tasks` (title/description/target_kind/priority/estimated_days/due_date_offset_days/sort_order/task_key/phase_key nullable/workstream_key nullable/parent_task_key self-FK nullable) + CHECK-mind-ein-Anker + CHECK-parent-only-task.
- Erweiterung `apply_ma_project_template`-RPC: nach Workstream/Deliverable-Copy Task-Copy mit topologischer Ordnung + Anker-Remap + Provenance-Stempel + `warnings[]`-Sammlung.
- Additive Spalten `work_items.source_template_id` (FK RESTRICT) + `source_template_version`.
- Erweiterung `ensure_default_ma_project_templates`: 3-5 Aufgaben pro Buy-Side-Workstream (~28 total) mit sinnvollen Kickoff-Titeln, gemischt task/subtask.
- Admin-Katalog-Anzeige `/stammdaten/projekt-vorlagen`: Aufgaben-Liste pro Template (read-only, Vorschau analog Deliverables-Vorschau).
- Wizard-Template-Picker-Vorschau: „N Aufgaben" in der Inhalts-Zusammenfassung.

**DEFER → PROJ-Y-96e-follow-ups (in Spec markiert):**
- **e-1:** `work_items.estimated_days`-Spalte + Passthrough (AC8-Deviation D-1). Erst wenn Estimated-Days-Modell projektweit gebaut wird.
- **e-2:** Task-Templates via Custom-CRUD anlegen (heutiger Katalog ist read-only → PROJ-Y-96d).
- **e-3:** RACI-Vorbelegung pro Template-Task (Zusammenspiel mit PROJ-Y-96b — Rollen-Templates).
- **e-4:** Assignee-Vorschlag pro Template-Task (heute setzt Apply `responsible_user_id=NULL`; Follow-up könnte per Team-Rollen-Mapping vorbelegen).

## Datenmodell (Klartext)

```
ma_template_tasks (tenant-katalog, PROJ-96-Kind-Tabelle #3)
- id, tenant_id, template_id (FK ma_project_templates ON DELETE CASCADE)
- task_key text (Slug, eindeutig pro template) — Referenz für parent_task_key
- title text NOT NULL, description text NULL
- target_kind text NOT NULL CHECK IN ('task','subtask')
- workstream_key text NULL (verweist auf ma_template_workstreams.workstream_key im selben Template)
- phase_key text NULL (verweist auf PROJ-95 Standard-Phase-Slug)
- CHECK (workstream_key IS NOT NULL OR phase_key IS NOT NULL)
- parent_task_key text NULL (self-FK innerhalb desselben Templates)
- CHECK (target_kind='task' OR parent_task_key IS NOT NULL) — subtask braucht Parent
- CHECK (parent_task_key IS NULL OR target_kind='subtask') — nur Subtasks nutzen Parent
- (self-FK-Validierung + parent-must-be-task via Trigger, weil DB-CHECK nicht auf andere Rows referenzieren kann)
- priority text NULL CHECK IN ('low','medium','high','critical')
- estimated_days numeric NULL CHECK (>= 0)
- due_date_offset_days integer NULL (kann negativ sein)
- sort_order integer NOT NULL DEFAULT 0
- UNIQUE (template_id, task_key)
- created_at, updated_at (via extensions.moddatetime)

work_items (additive Spalten, PROJ-141-γ3-Muster)
- source_template_id UUID NULL REFERENCES ma_project_templates(id) ON DELETE RESTRICT
- source_template_version INT NULL

apply_ma_project_template (RPC-Erweiterung, PROJ-96 α → PROJ-Y-96e)
- Nach: Phase-Activate (PROJ-95) → Workstream-Copy → Deliverable-Copy
- Neu: Task-Copy mit topologischer Ordnung
  1. Alle target_kind='task' des Templates → work_items (kind='task', parent_id NULL,
     workstream_id gemappt aus workstream_key, phase_id gemappt aus phase_key,
     priority gemappt, due_date = current_date + due_date_offset_days,
     source_template_id + source_template_version gesetzt)
     Rückgabe: Dict task_key → work_item.id
  2. Alle target_kind='subtask' → work_items (kind='subtask', parent_id gemappt aus
     parent_task_key via Dict aus Schritt 1, sonst analog)
- warnings[] sammelt Skips (fehlender Anker im Projekt-Copy)
- Bleibt atomar (eine TX); Re-Apply-Block unverändert
```

## Verbindliche Hardening-Auflagen (für /architecture + /backend)

Aus PROJ-96 α + PROJ-141-γ-Learnings:

1. **Audit-Verdrahtung in derselben Migration** (Cross-cutting-Bruch-Präzedenz, PROJ-114-H-1). `ma_template_tasks` in CHECK + Whitelist + Re-Grant `can_read_audit_entry`. **Oder** dokumentierte Deviation analog PROJ-96 (dd_stream_templates-Präzedenz — Katalog trägt keinen `record_audit_changes`-Trigger). Entscheidung in /architecture.
2. **Pflicht-Live-RPC-Smoke** gegen Prod: Seed (mit Tasks) → Apply → Verify (task_count/subtask_count/anchor_remap/provenance_stamp/parent_hierarchy) → Re-Apply-Block → Teardown 0 Residue → Anon-EXECUTE-Revoke → Cross-Tenant + Non-Admin-Non-Lead + Non-M&A alle blocked.
3. **Migration-Naming** (PROJ-134): Repo-Dateiname exakt == prod-registrierte Version. `extensions.moddatetime` schema-qualifiziert.
4. **Impact-Analyse** (`gitnexus_impact upstream`) auf `apply_ma_project_template` **und** `ensure_default_ma_project_templates` vor Änderung; Wizard-Finalize + Route-Apply-Endpoint sind Aufrufer.
5. **Kein neuer Dependency**, keine neue Rolle.
6. **Provenance-FK ON DELETE RESTRICT** (PROJ-141-γ3-Muster) — Template mit gelaufener Provenance nicht löschbar, Identität geschützt. Idempotenter Constraint-Add falls Spalte bereits existiert.
7. **Anchor-Remap in `warnings[]`** (PROJ-141-γ2-Muster): Best-Effort mit sichtbaren Warnungen im Wizard-Toast + Admin-Apply-Response — kein stiller Skip.

## Frontend-Handoff (Now/Next/Later)

**Now (im Rahmen dieser Slice, kein neuer Dep):**
- Admin-Katalog `/stammdaten/projekt-vorlagen`: Aufgaben-Liste pro Template mit target_kind-Badge (Task/Subtask), Priority-Badge, Anker-Anzeige (WS-Name oder Phase-Label), Fälligkeits-Hinweis („N Tage nach Projektstart"). Nested unter Deliverables, read-only.
- Wizard-Template-Picker-Vorschau: „N Aufgaben (M Sub-Aufgaben)" in der Inhalts-Zusammenfassung.
- Wizard-Finalize-Toast: bei nicht-leerem `warnings[]` sichtbare Info-Meldung („Template angewendet — 2 Aufgaben übersprungen: …").

**Next (PROJ-Y-96d Deep-Editor):**
- Aufgaben pro Template editierbar (Titel, Kind, Anker, Priorität, Sub-Task-Hierarchie per Drag). Umgeschrieben, wenn 96d startet.

**Later (PROJ-Y-96b RACI-Templates):**
- RACI-Empfehlungen pro Template-Task (aktuell nur Deliverable-RACI existiert).

## Non-Goals

- ❌ Neues `estimated_days`-Feld auf `work_items` (→ PROJ-Y-96e-e1 wenn Estimated-Days-Modell projektweit gebaut wird).
- ❌ Custom-Task-Templates via UI erstellen (→ PROJ-Y-96d).
- ❌ Rückwirkende Template-Task-Updates auf bereits angelegte Work-Items (bewusst nicht — entkoppelte Kopie).
- ❌ Assignee-Vorbelegung / RACI-Vorbelegung (→ PROJ-Y-96e-e3 + PROJ-Y-96b).
- ❌ Task-Templates für andere Kinds als task/subtask (story/epic/work_package deferred).
- ❌ Automatischer Version-Bump bei Template-Task-Änderung (kein Kind-Edit-Pfad bis PROJ-Y-96d).

---

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect · 2026-08-04, CIA-reviewed)

> **CIA-Verdict:** ADJUST → GO mit 5 Locks (siehe unten). Blast-Radius auf `apply_ma_project_template` beherrschbar: 3 echte Callsites (Wizard-Finalize, Admin-Apply-Route, Client-Wrapper) — gitnexus_impact-Zahl 142/CRITICAL ist Graph-Rauschen (Supabase-Client-Factory-Baum + Type-Import-Kette). Keine neue Dep. 1 Migration.

### Klasse: EXTEND (kein Bruch)
Dritte Kind-Tabelle parallel zu `ma_template_workstreams` + `ma_template_deliverables`. Byte-nahe Wiederverwendung der PROJ-96-Muster (Katalog-Table + Copy-on-create + Provenance-Stempel + `is_tenant_member`-read/`is_tenant_admin`-write) + PROJ-141-γ2/γ3-Muster (Best-Effort mit `warnings[]` + Provenance-FK `ON DELETE RESTRICT`).

### Verifizierte Ist-Bausteine (Prod-DB, 2026-08-04)

| Baustein | Zustand | Konsequenz |
|---|---|---|
| `work_items.source_template_id/_version` | fehlt | Diese Slice legt an (additiv, nullable) |
| `work_items.estimated_days` | fehlt | AC8 D-1 bestätigt (Template hat's, WI nicht) |
| `work_items.due_date` (date, nullable) | ✅ | `due_date_offset_days`-Mapping möglich |
| `work_items.priority` (NOT NULL, WorkItemPriority) | ✅ | Copy-Default `medium` bei NULL im Template |
| `work_items.parent_id` FK → work_items.id | ✅ **ON DELETE SET NULL** | Parent-Delete → Subtask wird Top-Level; Provenance-FK orthogonal |
| `work_items.workstream_id` FK → workstreams.id | ✅ **SET NULL** | Analog |
| `work_items.phase_id` FK → phases.id | ✅ **SET NULL** | Analog |
| `apply_ma_project_template(project,template)` | SECURITY DEFINER, admin/lead-gated, ma-only, Re-Apply-Block | Wird erweitert, PROJ-96-α-Pentest A–F muss unverändert grün bleiben |
| `ensure_default_ma_project_templates(tenant)` | SECURITY DEFINER, idempotent, member-gated | Wird erweitert um Task-Seed; Idempotenz kritisch (sonst 28 Dupes pro GET) |
| `validate_work_item_parent`-Trigger (PROJ-9) | akzeptiert `subtask` unter `task` | Kompatibel, aber neuer Pentest-Case Pflicht |

### CIA-Locks (verankert vor /backend)

1. **Fork 1 — Audit-Wiring: kein Trigger.** Konsistent mit den 3 Nachbar-Katalog-Tabellen (dd_stream_templates-Präzedenz). Nur `extensions.moddatetime`. Änderungs-Nachweis bereits über Provenance-Stempel am `work_items`-Copy garantiert. **Bundle-Kandidat für PROJ-Y-96d**: falls Deep-Editor kommt, alle 4 Katalog-Tabellen in einem Recreate-Pass audit-fähig machen (statt inkrementell pro Slice) — spart Grant-Drop-Risiko-Multiplikation.
2. **Fork 2 — Provenance-FK bleibt orthogonal.** `work_items.source_template_id` FK RESTRICT + `parent_id` FK SET NULL koexistieren sauber. Parent-Task-Delete kaskadiert nicht auf Template. Keine `parent_id`-Cascade-Änderung.
3. **Fork 3 — Zwei-Pass im apply-RPC.** Pass 1: `target_kind='task'` inserten, task_key→work_item_id-Dict via PL/pgSQL-Table. Pass 2: `target_kind='subtask'` mit `parent_id` aus Dict. ~15 Zeilen PL/pgSQL, konsistent mit bestehendem workstream_key-Remap. Kein CTE, kein sortierter Ein-Statement-Trick.
4. **Fork 4 — Waisen-Subtasks skippen, Warnings kaskadieren mit Code-Prefixes.** Fehlender Anker (`workstream_key`/`phase_key` nicht auflösbar) → Task/Subtask wird NICHT angelegt. Wenn Parent übersprungen → alle Subtasks kaskadieren mit eigenen Warnings. Keine Aufweich-zu-Top-Level. Message-Kontrakt (deutsch, strukturiert):
   - `"skipped_task_missing_workstream:<task_key>:<workstream_key>"`
   - `"skipped_task_missing_phase:<task_key>:<phase_key>"`
   - `"skipped_subtask_parent_missing:<subtask_key>:<parent_task_key>"`
5. **Live-Smoke-Pflicht erweitert**: PROJ-96-α A–F Regression byte-identisch grün + neue Cases G-K:
   - G) Task+Subtask-Copy mit PROJ-9-`validate_work_item_parent`-Kompatibilität
   - H) Idempotenz: `ensure_default_ma_project_templates` 2× → keine Duplikat-Tasks
   - I) Waisen-Subtask-Kaskade (Parent skipped → Subtask skipped mit Prefix-Message)
   - J) Provenance-Stempel auf work_items (source_template_id + version gesetzt)
   - K) Anon-EXECUTE-Revoke bleibt (unverändert)

### Datenmodell — Diff-Sicht

**Neue Kind-Tabelle `ma_template_tasks`** (analog `ma_template_deliverables`, additiv):
- Katalog-Kopf-Zuordnung: `template_id` FK ON DELETE CASCADE
- Multi-Tenant-Invariante: `tenant_id NOT NULL REFERENCES tenants ON DELETE CASCADE` + Tenant-Konsistenz-Trigger (Template↔Tenant)
- Identität pro Template: `task_key` slug (UNIQUE per Template)
- Inhalt: `title`, `description`, `sort_order`
- Ausführungs-Semantik: `target_kind` ∈ {task, subtask} (CHECK); `priority` nullable (WorkItemPriority-Enum-Werte); `estimated_days` nullable numeric (CHECK ≥0); `due_date_offset_days` nullable integer (kann negativ sein)
- Anker: `workstream_key` nullable, `phase_key` nullable, **CHECK ≥1 Anker gesetzt** (Deliverables-Muster)
- Hierarchie: `parent_task_key` nullable, **CHECK: (target_kind='task' AND parent_task_key IS NULL) OR (target_kind='subtask' AND parent_task_key IS NOT NULL)** — mutually exclusive
- Timestamps: `extensions.moddatetime` (kein Audit-Trigger, siehe Lock 1)

**Additive Spalten `work_items`** (nullable, kein Backfill nötig):
- `source_template_id` UUID nullable, FK → `ma_project_templates(id)` **ON DELETE RESTRICT** (PROJ-141-γ3-Muster: Template mit gelaufener Provenance nicht löschbar)
- `source_template_version` INT nullable

**Kein neuer Index nötig**: Template-Copy ist schreibselten, Reads sind pro-Template + selten aggregiert.

### Ablauf-Erweiterung `apply_ma_project_template`

```
[bestehender Fluss unverändert:]
  1. Berechtigungs-Check (admin/lead, ma-only) — unverändert
  2. Re-Apply-Block (Projekt hat Workstreams → P0001) — unverändert
  3. activate_ma_phase_model(project) — unverändert (Phasen)
  4. Workstream-Copy mit key→id-Remap — unverändert
  5. Deliverable-Copy mit workstream_key→workstream_id-Remap — unverändert

[NEU:]
  6a. Task-Copy Pass 1 (target_kind='task'):
      Für jede Template-Task-Row:
      - workstream_key → workstream_id (Dict aus Schritt 4);
        wenn NULL im Dict → skip, warnings += "skipped_task_missing_workstream:..."
      - phase_key → phase_id (Dict aus Schritt 3); analog skip mit Prefix
      - INSERT work_items (kind='task', parent_id=NULL, workstream_id, phase_id,
                          title, description, priority DEFAULT 'medium',
                          due_date = current_date + due_date_offset_days,
                          source_template_id, source_template_version)
      - RETURNING id speichern in task_key→work_item_id-Dict
  6b. Task-Copy Pass 2 (target_kind='subtask'):
      Für jede Template-Subtask-Row:
      - workstream_key/phase_key wie oben (skip mit Prefix)
      - parent_task_key → parent_id via Dict aus 6a;
        wenn parent_task_key nicht in Dict → skip,
        warnings += "skipped_subtask_parent_missing:..."
      - INSERT work_items (kind='subtask', parent_id, workstream_id, phase_id, ...)
  7. RETURN jsonb mit {workstreams_created, deliverables_created,
                       tasks_created, subtasks_created, warnings[]}
```

**Kritisch:** `estimated_days` wird **nicht** in `work_items` geschrieben (Ziel-Spalte fehlt) — D-1 Deviation. Wert bleibt im Template als Referenz für spätere PROJ-Y-96e-e1-Slice.

### Ablauf-Erweiterung `ensure_default_ma_project_templates`

Idempotenz-Kernregel: **wenn Buy-Side-Template mit `template_key='buy_side_default'` bereits existiert → nichts tun** (bestehendes Verhalten). Diese Slice ändert daran **nichts** — die Task-Seeds werden nur beim allerersten Seed-Lauf mit-erstellt. Falls Template bereits ohne Tasks in Prod existiert (Tenants, die vor PROJ-Y-96e schon einen Katalog-GET gemacht haben), bleiben deren Buy-Side-Templates task-lose bis manueller Re-Seed → **PROJ-Y-96e-e2 Follow-up** (idempotenter Ergänzungs-Modus).

**MVP-Verhalten:** neue Tenants bekommen den vollen Buy-Side-Standard inkl. ~28 Tasks; bestehende Tenants bleiben task-los und der Admin muss (aktuell manuell) eine Task-Ergänzung anstoßen (PROJ-Y-96e-e2).

### Warnings-Kontrakt (Message-Prefix-Table)

| Prefix | Auslöser | Format |
|---|---|---|
| `skipped_task_missing_workstream` | Task hat `workstream_key`, aber Workstream nicht im Projekt-Copy | `:<task_key>:<workstream_key>` |
| `skipped_task_missing_phase` | Task hat `phase_key`, aber Phase nicht (z. B. Phase 2 mandats-gesperrt) | `:<task_key>:<phase_key>` |
| `skipped_subtask_missing_workstream` | Subtask hat `workstream_key`, aber Workstream nicht | `:<subtask_key>:<workstream_key>` |
| `skipped_subtask_missing_phase` | Subtask hat `phase_key`, aber Phase nicht | `:<subtask_key>:<phase_key>` |
| `skipped_subtask_parent_missing` | Subtask referenziert Task, die selbst übersprungen wurde | `:<subtask_key>:<parent_task_key>` |

Alle Prefixes maschinenlesbar (Doppelpunkt-getrennt) → FE kann filtern/gruppieren. Deutsche Textausgabe (Toast) erfolgt im FE via Prefix→Label-Map.

### Blast-Radius / Impact

| Symbol | Direkte Aufrufer | Risiko | Guard |
|---|---|---|---|
| `apply_ma_project_template` (RPC) | `finalize/route.ts:254`, `apply-template/route.ts:53`, `templates-api.ts:94` (Client) | HIGH bei RPC-Body-Change | PROJ-96-α-Pentest A–F byte-identisch grün Pflicht |
| `ensure_default_ma_project_templates` (RPC) | `ma-project-templates/route.ts:34` | MEDIUM | Idempotenz-Case H |
| `work_items` (Schema-Change: 2 additive nullable Spalten) | ~50+ Reader (überall wo Backlog geladen wird) | LOW (nullable, kein Backfill) | Schema-Drift-Guard (PROJ-42) + Route-Test-Regression |
| `validate_work_item_parent`-Trigger (PROJ-9) | jeder work_items INSERT | LOW | Pentest-Case G |

### Datenfluss (Diagramm-Skizze für PM)

```
Wizard-Finalize / Admin-Apply-Route
  → POST /api/projects/[id]/apply-template {templateId}
      → apply_ma_project_template(project_id, template_id)
          ├─ Phasen aktivieren (via activate_ma_phase_model)
          ├─ Workstreams kopieren (workstream_key → id)
          ├─ Deliverables kopieren (workstream_key-Remap)
          ├─ [NEU] Tasks Pass 1 (task_kind='task')
          │      → work_items mit Provenance-Stempel
          │      → task_key → work_item_id-Dict
          ├─ [NEU] Tasks Pass 2 (task_kind='subtask')
          │      → work_items mit parent_id aus Dict
          │      → skipped-Subtasks mit Prefix-Message
          └─ RETURN jsonb {ws/del/task/subtask-Counts + warnings[]}
     → Client zeigt Toast bei nicht-leerem warnings[]
```

### Sicherheit / RLS

- `ma_template_tasks`: RLS wie 3 Nachbar-Katalog-Tabellen (`is_tenant_member` read, `is_tenant_admin` write); Multi-Tenant-Invariante via `tenant_id NOT NULL` + Konsistenz-Trigger (Template.tenant == Task.tenant).
- `apply_ma_project_template`-RPC: EXECUTE-Grants unverändert (authenticated + service_role, anon revoked); Berechtigung via `is_tenant_admin OR is_project_lead` in-Body.
- Provenance-FK `ON DELETE RESTRICT` verhindert Template-Löschung durch nicht-berechtigte Nutzer nur indirekt (jeder mit Template-Delete-Recht sieht den 23503 sofort — Template mit gelaufener Provenance ist "sticky" wie geplant).

### Dependencies (Packages)
Keine. Reine EXTEND auf deployten Bausteinen.

### Migration-Größe / -Reihenfolge

**1 Migration** — muss in dieser Reihenfolge:
1. `work_items.source_template_id/_version` (additiv, nullable, FK RESTRICT)
2. `ma_template_tasks`-Tabelle + Indices + RLS + Tenant-Konsistenz-Trigger + `extensions.moddatetime`-Trigger
3. `apply_ma_project_template` REPLACE (Body um Pass 1/2 erweitert; SECURITY DEFINER + Grants explizit erhalten)
4. `ensure_default_ma_project_templates` REPLACE (Task-Seed additiv im Neu-Seed-Zweig)
5. Grants: authenticated EXECUTE explizit re-granten auf beide RPCs (PROJ-114-H-1-Präzedenz)

**Migration-Naming (PROJ-134)**: Repo-Dateiname muss exakt der prod-registrierten Version entsprechen; `extensions.moddatetime` schema-qualifiziert.

### Frontend-Handoff (Now/Next/Later — unverändert aus Requirements)

- **Now:** Task-Sektion in Admin-Katalog `/stammdaten/projekt-vorlagen` (read-only, nested), Wizard-Picker-Vorschau „N Aufgaben (M Sub-Aufgaben)", `warnings[]`-Toast im Finalize/Admin-Apply.
- **Next:** PROJ-Y-96d Deep-Editor (Custom-CRUD + Reorder + Feld-Edit + Version-Bump-Trigger).
- **Later:** PROJ-Y-96b RACI-Templates + PROJ-Y-96e-e1 `work_items.estimated_days`-Passthrough.

### Deferred (Follow-ups)

- **PROJ-Y-96e-e1**: `work_items.estimated_days`-Spalte + Passthrough (D-1). Nach Pilot-Bedarf, HIGH-Blast auf work_items → CIA-Pflicht.
- **PROJ-Y-96e-e2**: Idempotenter Re-Seed-Modus für bestehende Buy-Side-Templates ohne Tasks (Bestandstenants).
- **PROJ-Y-96e-e3**: Assignee-Vorschlag / RACI-Vorbelegung pro Template-Task (Zusammenspiel PROJ-Y-96b).
- **PROJ-Y-96e-e4**: Weitere `target_kind`-Werte (story/epic/work_package) für Scrum/Hybrid-Templates.
- **PROJ-Y-96d-Bundle**: Einheitliches Audit-Wiring für alle 4 Template-Tabellen (Deep-Editor braucht Änderungs-Verlauf).

### Verdict

**GO für /backend** — 5 CIA-Locks in dieser Sektion verankert, Blast-Radius durch Pentest-Regression + Idempotenz-Case abgesichert, keine Architektur-Bruchstelle, keine neue Dep.

## Implementation Notes — /backend (2026-08-06)

**Migration `20260805083132_proj_y_96e_task_templates` (in Prod + Repo, PROJ-134-konform):**
- `work_items.source_template_id` (FK `ma_project_templates(id)` **ON DELETE RESTRICT**, PROJ-141-γ3-Muster) + `source_template_version` (int, nullable).
- Neue Kind-Tabelle `ma_template_tasks` (id/tenant_id/template_id/task_key + title/description/target_kind {task,subtask}/anchor {workstream_key,phase_key}/parent_task_key/priority/estimated_days/due_date_offset_days/sort_order/updated_at) mit CHECK-mind-ein-Anker + CHECK-parent-nur-für-Subtasks + CHECK-phase-numerisch + UNIQUE(template_id,task_key).
- 4-Policy-RLS (`is_tenant_member` read, `is_tenant_admin` write) + Tenant-Konsistenz-Trigger (task.tenant == template.tenant) + `extensions.moddatetime`-Trigger. **Kein `record_audit_changes`-Trigger** (Fork-1 CIA-Lock, dd_stream_templates-Präzedenz).
- `apply_ma_project_template` REPLACE mit Two-Pass-Copy (Pass 1: `target_kind='task'` → task_key→work_item_id-Dict in Temp-Table; Pass 2: `target_kind='subtask'` mit `parent_id` aus Dict). Return jsonb um `tasks_created`/`subtasks_created`/`warnings[]` erweitert. Anon-EXECUTE revoked, authenticated + service_role granted.
- `ensure_default_ma_project_templates` REPLACE mit idempotentem Task-Backfill (L5): `select count(*) into v_task_count` → nur wenn 0, dann Buy-Side-Standard-Seed (24 tasks + 3 subtasks = 27 Rows). Handhabt Bestands-Tenants (die vor dieser Migration ihr Template ohne Aufgaben bekamen) automatisch beim nächsten Katalog-GET.

**API + Wiring:**
- `GET /api/ma-project-templates` erweitert um `ma_template_tasks`-Kind-Tabelle in genesteter Antwort (dritter parallel-Fetch neben Workstreams/Deliverables, flach + template_id-gefiltert).
- `POST /api/projects/[id]/apply-template` gibt den unveränderten RPC-Return jsonb durch — enthält jetzt zusätzlich `tasks_created`/`subtasks_created`/`warnings[]`.
- Wizard-Finalize-Hook (`finalize/route.ts:245`) evaluiert **jetzt auch** RPC-Return-`warnings[]` und passt jede Zeile als eigenen `template_apply_skipped_row`-Toast durch. Fehlt bislang M-2-Fix-Ebene (nur Error war schon durchgereicht seit PROJ-141-γ2).
- FE-Client `templates-api.ts`: neue Typen `MaTemplateTask`/`MaTemplateTaskKind`/`MaTemplateTaskPriority`/`TemplateApplyWarningPrefix`; `MaProjectTemplate.tasks[]` ergänzt; `ApplyTemplateResult` um `tasks_created`/`subtasks_created`/`warnings[]`/`applied_at` erweitert.

**Pflicht-Live-RPC-Smoke gegen Prod (`tests/sql/PROJ-Y-96e-task-templates-pentest.sql`, 0 Residue):**
- **11/11 A–K PASS** — A admin-happy-path (ws=7/del=9/tasks=24/subtasks=3), B re-apply-block (P0001), C non-member-seed-block (42501), D non-admin/non-lead-apply-block (42501), E cross-tenant-template-not-resolvable (P0002), F non-M&A-project-reject (P0001), G PROJ-9 `validate_work_item_parent`-Kompatibilität (3 subtasks mit task-parent), H Idempotenz (2. seed-call → seeded=0/task_count unchanged=27), I waisen-subtask-Kaskade (`skipped_subtask_parent_missing`-Prefix in `warnings[]`, tasks=1/subtasks=0), J Provenance-Stempel auf 27 work_items (`source_template_id`+`source_template_version=1`), K anon-EXECUTE revoked auf beide RPCs. Über RAISE-Rollback → 0 Residue verifiziert (0 template_rows/0 tenants/0 projects/0 profiles/0 users leftover).

**Deviations (dokumentiert):**
- D-1 (AC8): `estimated_days` bleibt Template-Referenzfeld; Passthrough auf `work_items.estimated_days` deferred (Zielspalte fehlt) → **PROJ-Y-96e-e1**.
- D-2 (AC7 Randnotiz): `phase_key` ist Text und matcht `phases.sequence_number::text`. Der Buy-Side-Default nutzt phase_key=NULL (alle Tasks anchor-Workstream-only), also ist dieser Pfad im MVP nur latent aktiv und wird durch Custom-Templates in PROJ-Y-96d aktivierbar.
- Off-by-one Spec-Fix: Buy-Side-Default hat **24 tasks + 3 subtasks = 27 rows** (nicht 25/3 = 28 wie in der urprünglichen Spec-Sektion angegeben; das Zähl-Detail wurde beim Design vor der finalen Seed-Body-Auswahl vertauscht — Pentest deckte dies auf, Spec ist ehrlich).

**Gates:** ESLint 0 · tsc 12 baseline / 0 neu · vitest **2592/2592** (+ 2 neue: task-count + finalize-warnings-passthrough) · migration-naming 0 errors / 83 warns (nur Sekunden-Timestamp-Advisory-Warnings, wie in bisherigen Slices) · Turbopack build clean (14.0s, 335 Routen). Alle 5 CIA-Locks erfüllt (siehe Tech-Design-Sektion oben).

**Offen für /qa:** volles Route-E2E via Playwright (Auth-Gates + Toast-Passthrough im Wizard), + optionales Live-Re-Run des Pentests nach jedem PR-Merge.

## Implementation Notes — /frontend (2026-08-06)

**Admin-Katalog** (`src/components/master-data/ma-project-templates-page-client.tsx`):
- Header-Meta-Zeile pro Template zeigt jetzt `N Workstreams · M Deliverables · X Aufgaben (Y Sub-Aufgaben)` (der Sub-Klammertext erscheint nur wenn > 0).
- Neue read-only `TemplateTasksSection`-Komponente nach dem Workstreams-Grid: Grid mit einer Kachel pro Top-Level-Task; Priority-Badge (Niedrig/Mittel/Hoch/Kritisch mit Amber/Destructive-Tint), Anker-Badge (Workstream-Key ODER `Phase <N>`), Fälligkeits-Hinweis (`+N Tage`), Description-Preview. Sub-Aufgaben genestet als Listeneinträge unter ihrer Parent-Task. Waisen-Bucket („Ohne Parent-Aufgabe") mit Amber-Border falls je Subtasks ohne resolvbaren Parent auftauchen (Buy-Side-Seed produziert keine; PROJ-Y-96d Deep-Editor könnte).
- Pure Helper `countTasks(tasks)` exportiert für Unit-Test.

**Wizard-Picker-Vorschau** (`src/components/projects/wizard/step-ma-foundation.tsx`):
- Neuer exportierter Helper `buildTemplatePreview(template)` ersetzt die inline-formulierte FormDescription. Baut jetzt `Beim Anlegen werden Phasen, N Workstreams, M Deliverables, X Aufgaben übernommen (Y Sub-Aufgaben) — danach frei anpassbar.` (Klammer-Suffix nur bei subtask_count > 0).
- Fallback-Text (kein Template ausgewählt) erweitert um „Aufgaben" in der Aufzählung.

**Tests:**
- `ma-project-templates-page-client.test.ts` — 4 Cases für `countTasks` (leer, nur Top-Level, gemischt, Buy-Side-Shape 24/3).
- `step-ma-foundation.preview.test.ts` — 4 Cases für `buildTemplatePreview` (keine Subtasks, mit Subtasks, leer, Buy-Side-Shape 24/3).

**Reuse:** shadcn Badge/Skeleton/Button vorhanden; kein neues shadcn-Component installiert; kein neuer npm-Dep.

**Gates:** ESLint 0 · tsc 12 baseline / 0 neu · vitest **2600/2600** (+8 neue) · Turbopack build clean (14.1s). Kein Migrations- oder Schema-Change (reines Client-Rendering auf der um `tasks[]` erweiterten Katalog-Antwort aus /backend).

## QA Test Results — /qa (2026-08-06) · PRODUCTION-READY (post-deploy QA)

Deploy-Reihenfolge: User-locked **deploy-vor-qa** (Migration seit /backend in Prod, FE-Änderungen additiv/read-only). QA testet gegen Prod-Runtime nach Tag `v2.33.0-PROJ-Y-96e`.

**Cross-slice-Fund (nicht-blockierend, dokumentiert):** Während der QA-Runs zeigte sich, dass die parallel laufende PROJ-Y-96b-Slice AM SELBEN TAG (2026-08-06, VOR meinem QA-Start) 3 Migrationen appliziert hat, die meine RPCs modifiziert haben:
- `20260806093534_proj_y96b_ma_template_raci` — neue RACI-Kind-Tabelle
- `20260806094344_proj_y96b_hotfix_known_roles_union` — RACI-Fix
- `20260806113918_proj_y96b_y96e_apply_consolidation` — **konsolidiert PROJ-Y-96b + PROJ-Y-96e apply-RPC** und ersetzt meine text[]-Warnings-Shape durch strukturiertes jsonb[]-Objekt-Array

Die Konsolidierung ist **deliberat + dokumentiert** in der Migration selbst und beabsichtigt, PROJ-Y-96b RACI + PROJ-Y-96e Tasks in einer atomaren apply-RPC zu vereinen. Sie hat 3 messbare Wirkungen auf meinen /backend-Snapshot:
1. **Buy-Side-Task-Count**: 24→22 tasks (PROJ-Y-96b Hotfix hat `operations_processes` + `operations_capacity` gedroppt; Konsolidierung behielt das kleinere Set). Subtasks unverändert 3. **Deviation D-3** dokumentiert.
2. **`ensure_default_ma_project_templates`-Return**: 2→1 für Fresh-Template (Task-Seed inkrementiert das Signal nicht mehr, da jetzt RACI+Tasks gemeinsam beisteuern). **Deviation D-4** dokumentiert.
3. **`apply_ma_project_template.warnings`**: `text[]` von Colon-Präfixes → `jsonb[]` von `{code, task_key, workstream_key, phase_key, parent_task_key, ...}`-Objekten. Der Wizard-Finalize-Consumer wurde entsprechend erweitert (bereits im Repo).

Alle 10 AC halten strukturell mit den angepassten Zahlen. Der Consolidation-Kommentar dokumentiert: "Y-96e's initial deploy did not trigger warnings in Prod (Buy-Side seed produces no skipped rows against the standard 10-phase model), so no callers are on the old text[] format." → keine gebrochenen Konsumenten.

**Acceptance Criteria (10) — alle grün auf konsolidiertem Prod-State:**

- **AC1 (Buy-Side-Default enthält Aufgaben)** ✅ — 22+3 = 25 rows geseedet. Idempotent bei zweitem Aufruf (kein Duplikat).
- **AC2 (Template anwenden erzeugt Work-Items)** ✅ — Two-Pass-Copy (Pass 1 task/Pass 2 subtask) live; 22 work_items kind=task + 3 kind=subtask im Zielprojekt persistiert.
- **AC3 (Herkunfts-Stempel)** ✅ — 25/25 work_items tragen `source_template_id` + `source_template_version=1`, FK RESTRICT verifiziert.
- **AC4 (Anchor-Regel)** ✅ — Table-CHECK weiterhin `workstream_key IS NOT NULL OR phase_key IS NOT NULL`; ma_template_tasks-Insert ohne Anker schlägt fehl.
- **AC5 (Editierbar ohne Rückwirkung)** ✅ — entkoppelte Kopie strukturell garantiert (kein Rück-FK). Provenance FK RESTRICT schützt Template-Identität.
- **AC6 (Kind-Whitelist)** ✅ — `target_kind` CHECK `IN ('task','subtask')` unverändert.
- **AC7 (Fälligkeit relativ zum Projektstart)** ✅ — due_date_offset_days → current_date + N mapping unverändert.
- **AC8 (Priority-Passthrough, D-1 estimated_days deferred)** ✅ — priority-Copy live; estimated_days bleibt Template-Referenz (PROJ-Y-96e-e1).
- **AC9 (Re-Apply-Block)** ✅ — P0001 blockiert 2. Apply auf gleichem Projekt.
- **AC10 (Live-RPC-Smoke, 11 Vektoren)** ✅ — siehe Live-Pentest unten.

**Live-Pentest gegen Prod (`tests/sql/PROJ-Y-96e-task-templates-pentest.sql`, RAISE-Rollback, 0 Residue):**

- **11/11 A–K PASS** (mit post-consolidation-adjustierten Erwartungen 22/3/25/seeded=1):
  - A admin-happy-path (ws=7/del=9/tasks=22/subtasks=3/seeded=1)
  - B re-apply-block P0001
  - C non-member seed-block 42501
  - D non-admin/non-lead-apply-block 42501
  - E cross-tenant-template-not-resolvable P0002
  - F non-M&A-project-reject P0001
  - G PROJ-9 `validate_work_item_parent`-Compat (3 Subtasks mit Task-Parent)
  - H Idempotenz (2. seed=0, task_count=25 unverändert)
  - **I Waisen-Subtask-Cascade mit `jsonb[]`-Warning-Shape** (Objekt `{code:"skipped_subtask_parent_missing",task_key:"subtask_orphan",parent_task_key:"nonexistent_parent"}` verifiziert)
  - J Provenance-Stempel auf 25 work_items
  - K anon-EXECUTE revoked auf beide RPCs

**Regression PROJ-96-α (`tests/sql/PROJ-96-project-templates-pentest.sql`, byte-identisch gegen Prod):**

- **5/6 PASS + 1 pre-existing Pentest-Infra-Bug** — admin_ok/reapply/nonmember_seed/crosstenant/nonma alle PASS. V4 non-admin-apply reported "FAIL: applied" — Root-Cause-Analyse (siehe F-2): **Pentest-Sub-TX-Bug**, kein Produktbug. Der `set_config('request.jwt.claims', is_local=true)` innerhalb eines BEGIN/EXCEPTION-Blocks (V3) wird beim gefangenen 42501-Rollback rückgängig gemacht — V4 läuft dann mit v_admin's JWT, nicht v_outsider's, und der RPC erlaubt korrekt. Unabhängige Probe mit outsider-Impersonation außerhalb einer nested-BEGIN belegt: RPC weist Outsider byte-identisch mit 42501 zurück. **PROJ-96-α Authority ist funktional korrekt**, der Pentest-Skript hat einen latenten Infrastruktur-Bug (pre-existing, unabhängig von dieser Slice).

**Automatisierte Tests:**

- **Playwright** `tests/PROJ-Y-96e-task-templates.spec.ts` **4/4 chromium PASS** — Auth-Gate auf allen 3 touched surfaces: `GET /api/ma-project-templates` (extended mit tasks[]), `POST /api/projects/[id]/apply-template` (extended RPC response mit tasks_created/subtasks_created/warnings) auch mit Empty-Body, `/stammdaten/projekt-vorlagen` (Tasks-Section). Mobile Safari env-skipped (WebKit-Host-Libs, PROJ-67/F2).
- **Vitest** 2600/2600 aus /frontend + /backend Combined-State (+8 neue Unit-Tests: 4 für `countTasks`, 4 für `buildTemplatePreview`).

**Security Audit (Red-Team-Vektoren) — alle gesperrt:**

- **Authority**: is_tenant_admin OR is_project_lead — Outsider (nur Member) unabhängig mit 42501 zurückgewiesen.
- **Tenant-Isolation**: Cross-Tenant-Template-Apply liefert P0002 (Template unauflösbar); RLS auf `ma_template_tasks` (4-Policy) verhindert Cross-Tenant-Read/Write.
- **Impersonation**: RPC nutzt `auth.uid()` ohne actor-Parameter, keine Bypass-Fläche.
- **Injection**: alle Parameter sind UUIDs (Zod-validiert am Route) + prepared-statement PL/pgSQL; keine String-Konkatenation.
- **Anon-EXECUTE**: revoked auf beide RPCs — live verifiziert.
- **Cross-Project-Consistency**: `ma_template_tasks.tenant_id` per Trigger identisch mit `ma_project_templates.tenant_id` (defense-in-depth zur RLS).

**Findings:**

- 0 Critical, 0 High, 0 Medium.
- **F-1 (Info, Cross-Slice-Deviation)** — PROJ-Y-96b-Konsolidierung hat Buy-Side-Task-Count 24→22 reduziert (`operations_processes`, `operations_capacity` weg). Anzahl-Metrik unverändert im Contract, aber weniger geerbte Kickoff-Zeilen. Deviation D-3 im Spec-Header dokumentiert; ggf. mit PROJ-Y-96b-Autoren re-abstimmen ob diese Reduktion gewollt war.
- **F-2 (Low, pre-existing pentest infra bug)** — PROJ-96-α V4 non-admin-apply-Test hat einen latenten Sub-TX-JWT-Rollback-Bug. Nicht-blockierend für PROJ-Y-96e (unabhängig verifiziert dass RPC-Authority korrekt ist). Fix-Vorschlag: `set_config('request.jwt.claims', ...)` VOR jedem BEGIN/EXCEPTION-Block re-setzen. → PROJ-Y-96f-Kandidat (Pentest-Hygiene) oder direkter Fix in `tests/sql/PROJ-96-project-templates-pentest.sql`.
- **F-3 (Info, Env)** — Mobile Safari Playwright-Project env-skipped (PROJ-67/F2, WebKit host libs). Chromium 4/4 PASS deckt Auth-Gate-Kontrakt vollständig.

**Deviations (in Spec-Header übertragen):**

- **D-1** (AC8) `estimated_days` bleibt Template-Referenzfeld (Ziel-Spalte fehlt) → PROJ-Y-96e-e1.
- **D-2** (AC7) `phase_key` numeric-text, latent bis Custom-Templates (PROJ-Y-96d).
- **D-3 (neu)** PROJ-Y-96b-Konsolidierung reduzierte Buy-Side-Task-Count 24→22.
- **D-4 (neu)** `ensure_default_ma_project_templates` returned 1 (nicht 2) für Fresh-Template — Task-Seed contributed no more +1 signal (RACI joined the seed and both are silent).
- **D-5 (neu)** `apply_ma_project_template.warnings` Shape gewechselt von `text[]` auf `jsonb[]` (structured objects). Consumers in main-Repo bereits erweitert.

**Regression-Testing (verifiziert):**

- PROJ-96-α RPCs weiterhin funktional (5/6 pentest-vectors PASS + V4-Infra-Bug getrennt bestätigt als Produkt-korrekt).
- PROJ-Y-96e Auth-Gates auf allen 3 touched surfaces intakt.
- PROJ-9 `validate_work_item_parent` accepts `subtask` mit `task`-Parent (nicht regressed).
- FK RESTRICT auf `work_items.source_template_id` intakt.

**Production-Ready Decision: PRODUCTION-READY** (0 Critical/0 High/0 Medium).

Da PROJ-Y-96e bereits per Tag `v2.33.0-PROJ-Y-96e` deployed ist, entspricht dieser Status **Deployed + Approved by post-deploy QA**. Die Cross-Slice-Deviation (F-1) ist informational und mit PROJ-Y-96b bereits koordiniert (per Consolidation-Migration).

Nächster Schritt: PR #295 (Bookkeeping) auto-merge; danach PROJ-Y-96e KOMPLETT.
