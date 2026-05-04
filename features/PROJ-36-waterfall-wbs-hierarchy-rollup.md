# PROJ-36: Waterfall-WBS Hierarchy & Roll-up

## Status: Deployed (36-Pre + 36-α + 36-γ live; 36-β absorbed by PROJ-9-R2)
**Created:** 2026-05-03
**Last Updated:** 2026-05-04 (36-γ Frontend Tree-View + WBS-Code-Edit-Dialog + View-Toggle + Indent/Outdent shipped; 820 vitest tests green; lint clean; build green)

## Origin
Diese Spec entstand aus einem CIA-Review (2026-05-03) zur User-Anfrage „Wasserfall-Modell wie MS Project". Die Architektur-Grundlage liegt in **ADR-004** ([`docs/decisions/project-phase-workpackage-todo-hierarchy.md`](../docs/decisions/project-phase-workpackage-todo-hierarchy.md)). Single-Responsibility: nur **WBS-/Tree-/Roll-up-Schicht** auf dem von PROJ-9-Round-2 gelieferten Hierarchie- und Dependency-Backbone. Gantt-Interaktion und Critical-Path sind explizit Out-of-Scope (PROJ-25).

## Dependencies
- Requires: **PROJ-9 Round 2** (Work Item Metamodel) — liefert `outline_path`, `sequence_in_parent`, erweiterte `ALLOWED_PARENT_KINDS` und die polymorphe `dependencies`-Tabelle als Schema-Backbone.
- Requires: **PROJ-19** (Phases & Milestones) — `work_items.phase_id` bleibt der Cross-Level-Bezug; Phasen/Milestones bleiben separate Tabellen.
- Requires: **PROJ-1** (Tenants) — Tenant-/RLS-Invarianten gelten unverändert auch für die konsumierten Backbone-Strukturen.
- Compatible: **PROJ-26** (Method-Gating) — WBS-Hierarchie ist cross-method, kein Refactor nötig.
- Architektur: **ADR-004** (project-phase-workpackage-todo-hierarchy) — verbindlich.
- Unblocks: **PROJ-25** (Drag-and-Drop Gantt) — kann Tree + Polymorphic Deps nutzen, statt eigene `phase_dependencies` zu bauen.
- Unblocks: **PROJ-11b** (Resource-Roll-up auf Summary-Items, Implementation-Note in PROJ-11).

## User Stories

1. **WBS-Hierarchie wie MS Project** — Als Projektleiter eines Wasserfall-Projekts möchte ich meine Arbeit **innerhalb einer Phase** hierarchisch in **Arbeitspaket → Sub-Arbeitspaket → Task → Subtask** strukturieren können, damit ich ein komplexes Projekt in steuerungsfähige Pakete zerlegen kann.

2. **Auto-WBS-Code** — Als Projektleiter möchte ich, dass für jede Hierarchie-Ebene automatisch ein WBS-Code (z. B. `1.2.3`) generiert wird, damit ich Items in Steering-Meetings und Reports eindeutig referenzieren kann, ohne manuell zu nummerieren.

3. **Manueller WBS-Code-Override** — Als Projektleiter möchte ich einen auto-generierten WBS-Code mit einer firmen-internen Nummerierung (z. B. `AP-001`) überschreiben können, damit die Plattform mit unserer bestehenden Projekt-Dokumentation harmoniert.

4. **Hybrid Roll-up** — Als PM möchte ich auf einem Arbeitspaket sowohl **eigene** Werte (Datum, Aufwand) **als auch** die aus Kindern abgeleiteten Werte sehen, damit ich Reserven oder Manager-Aufschläge auf Parent-Ebene halten kann, ohne die Kind-Daten zu verfälschen (analog OpenProject `derivedEstimatedTime`).

5. **Tree-View neben Liste** — Als PM möchte ich zwischen einer flachen Liste und einer hierarchischen Tree-View der Work Items wechseln können, damit ich beim Planen drillen und beim Filtern flach arbeiten kann.

6. **Polymorphe Dependencies** — Als PM möchte ich Dependencies zwischen beliebigen Entitäten setzen können (Projekt↔Phase, Phase↔Phase, Phase↔Arbeitspaket, Arbeitspaket↔Task, projektübergreifend), damit ich reale Abhängigkeiten ohne künstliche Zwischenschritte modellieren kann.

7. **Daten-sichere Migration** — Als PM möchte ich, dass meine bestehenden Dependencies (PROJ-9) beim Polymorphie-Umbau erhalten bleiben, damit kein Plan verloren geht.

8. **Multi-Level WBS** — Als Projektleiter möchte ich Arbeitspakete unter Arbeitspakete schachteln können (unbegrenzt tief), damit komplexe ERP-Implementierungen (Modul → Submodul → Funktion) sauber abgebildet werden.

## Acceptance Criteria

### A. Hierarchy Schema
- [ ] PROJ-36 konsumiert den von PROJ-9-Round-2 gelieferten Hierarchie-Backbone (`outline_path`, `sequence_in_parent`, erweiterte `ALLOWED_PARENT_KINDS`) als Voraussetzung.
- [ ] PROJ-36 definiert oder migriert diesen Backbone nicht erneut.
- [ ] Tree-View, Indent/Outdent und WBS-Semantik bauen auf diesem Backbone auf.

### B. WBS-Code (Auto + Override)
- [ ] Spalte `work_items.wbs_code TEXT` (nullable, max 50 chars).
- [ ] Spalte `work_items.wbs_code_is_custom BOOLEAN NOT NULL DEFAULT false`.
- [ ] Bei INSERT/UPDATE auf `parent_id` oder `sequence_in_parent`: wenn `wbs_code_is_custom = false`, wird `wbs_code` aus `outline_path` neu berechnet (Format: dot-separated, z. B. `1.2.3`).
- [ ] User kann `wbs_code` via UI editieren → setzt `wbs_code_is_custom = true`.
- [ ] User kann `wbs_code_is_custom` zurück auf `false` setzen → System regeneriert Code aus aktuellem `outline_path` (UI-Hinweis: „Code wird von 'AP-001' auf '1.3.2' regeneriert").
- [ ] Validation: `wbs_code` matcht regex `^[A-Za-z0-9._-]{1,50}$` (keine Leerzeichen, Sonderzeichen-Whitelist).
- [ ] UNIQUE-Constraint: `wbs_code` ist innerhalb (`project_id`, `parent_id`) eindeutig (Geschwister dürfen nicht kollidieren; Cross-Sibling-Konflikte sind erlaubt).
- [ ] Auto-Gen-Konflikt: wenn ein manueller Code „1.2" auf Sibling A gesetzt ist und Sibling B Auto-Gen `1.2` bekommen würde, springt B auf den nächsten freien Code (`1.3`).

### C. Roll-up (Hybrid — Derived + Own)
- [ ] Spalten `work_items.derived_planned_start DATE` und `work_items.derived_planned_end DATE` (nullable, computed).
- [ ] Spalte `work_items.derived_estimate_hours NUMERIC(10,2)` (nullable, computed).
- [ ] Berechnung **rekursiv** (Trigger oder Materialized-View-Refresh on Child-Change):
  - `derived_planned_start = MIN(child.planned_start, child.derived_planned_start)` über alle direkten Kinder
  - `derived_planned_end = MAX(child.planned_end, child.derived_planned_end)`
  - `derived_estimate_hours = SUM(COALESCE(child.estimate_hours, 0) + COALESCE(child.derived_estimate_hours, 0))`
- [ ] Wenn Item keine Kinder hat: `derived_*` ist `NULL`.
- [ ] Wenn Item Kinder hat **und** eigene Werte (`planned_start`, `estimate_hours`): UI zeigt **beide getrennt** an (nicht zusammenaddiert in einer Zelle, sondern als zwei Felder: „Eigenes: 40h · Aus Kindern: 120h · Gesamt: 160h").
- [ ] „Gesamt"-Anzeige (additiv, OpenProject-Pattern): `displayed_effort = COALESCE(own_estimate, 0) + COALESCE(derived_estimate, 0)`. Bei Datumsfeldern: Anzeige beider Werte ohne Aggregation, da Min/Max nicht additiv sind.
- [ ] Performance-Anforderung: Roll-up-Recompute bei Child-Change < 200 ms für Subtree mit 1000 Items.

### D. Dependency Backbone Consumption (per ADR-004)
- [ ] PROJ-36 verwendet die polymorphe `dependencies`-Struktur, die von PROJ-9-Round-2 geliefert wird.
- [ ] PROJ-36 besitzt **nicht** das Schema, die Migration, Trigger, Cycle-Detection, Tenant-Boundary-Prüfung oder RLS-Logik der `dependencies`-Tabelle.
- [ ] PROJ-36-UI bleibt kompatibel mit Dependencies auf `project`, `phase`, `work_package` und `todo`.

### E. Tree-View UI (View-Toggle, kein DnD)
- [ ] Bestehende Route `/projects/[id]/arbeitspakete` bekommt einen **View-Toggle**: „Liste" (heutige flache Ansicht) | „Hierarchie" (neue Tree-View).
- [ ] Default-View: „Hierarchie" wenn mindestens ein Work Item Kinder hat, sonst „Liste".
- [ ] Toggle-Präferenz wird pro `(user_id, project_id)` in `localStorage` persistiert (kein DB-Schema-Aufwand für MVP).
- [ ] Tree-View-Spalten: WBS-Code · Name · Kind · Eigenes Datum · Roll-up Datum · Eigener Aufwand · Roll-up Aufwand · Status.
- [ ] Expand/Collapse pro Parent-Knoten; Buttons „Alle ausklappen" / „Alle einklappen".
- [ ] **Indent / Outdent** Buttons: ein Item eine Hierarchie-Ebene tiefer/höher schieben (verändert `parent_id`).
- [ ] Inline-Edit: Name + WBS-Code (Override toggelt `wbs_code_is_custom`).
- [ ] Tree-View nutzt Virtualisierung (z. B. `@tanstack/react-virtual`) wenn > 200 Items im Projekt.
- [ ] **Drag-and-Drop ist NICHT in dieser Spec** (gehört zu PROJ-25).

### F. Method-Gating (cross-method)
- [ ] PROJ-26 wird **nicht** geändert. WBS-Hierarchie ist cross-method erlaubt — auch ein Scrum-Projekt kann `work_package → task` nutzen.
- [ ] Method-Visibility (welche Kinds in Pickern erscheinen und angelegt werden dürfen) bleibt PROJ-6/26-gesteuert.
- [ ] Parent-Child-Regeln (`ALLOWED_PARENT_KINDS`) gelten kind-spezifisch unabhängig von der Methode.

### G. Multi-Tenant + RLS + Class-3
- [ ] WBS-Code, `outline_path`, `wbs_code_is_custom` enthalten **keine personenbezogenen Daten** → keine Class-3-Klassifikation nötig.

### H. Migration-Plan
- [ ] Migration-Datei `supabase/migrations/20260503xxxxxx_proj36_wbs_hierarchy_polymorphic_deps.sql`:
  1. `ALTER TABLE work_items ADD COLUMN wbs_code TEXT, wbs_code_is_custom BOOLEAN NOT NULL DEFAULT false, derived_planned_start DATE, derived_planned_end DATE, derived_estimate_hours NUMERIC(10,2);`
  2. Backfill `wbs_code` aus vorhandenem `outline_path` (initial alle nicht-custom).
  3. Trigger erstellen: `tg_work_items_wbs_code_autogen`, `tg_work_items_rollup_recompute`.
  4. Verifikations-SELECTs für neue WBS-/Roll-up-Spalten.
- [ ] `outline_path`, `sequence_in_parent`, erweiterte Parent-Regeln und polymorphe `dependencies` gelten in dieser Migration als bereits durch PROJ-9-Round-2 bereitgestellt.
- [ ] DOWN-Migration vorhanden (`supabase/migrations/.../down.sql` oder Inline-Notizen).
- [ ] CIA-Pflicht für `/architecture`-Phase: Migration auf Kopie der Prod-DB testen, bevor sie in `/backend` gemerged wird (Backfill-Korrektheit + Roll-up-Recompute).

## Edge Cases

1. **Move work_package mit > 1000 Descendants** — `outline_path`-Trigger muss Subtree-Update batchen (`UPDATE … WHERE outline_path <@ old_path`), nicht zeilenweise.
2. **Manual WBS-Code kollidiert mit Auto-Gen-Sibling** — User setzt manuell `1.2` auf Item A; Sibling B würde Auto `1.2` bekommen. Resolution: B springt auf nächste freie Nummer (`1.3`).
3. **Custom-WBS-Code beim Parent-Wechsel** — User hat `AP-001` auf Item X. X wird in anderen Parent verschoben. `wbs_code_is_custom` bleibt `true`, Code bleibt `AP-001` (regeneriert nicht).
4. **`wbs_code_is_custom` zurück auf false** — UI fragt: „Code wird von 'AP-001' auf '1.3.2' regeneriert. Fortfahren?"
8. **Hybrid-Roll-up Parent ohne Kinder** — `derived_*` ist `NULL`. UI zeigt nur „Eigenes: 40h" ohne „Derived"-Spalte.
9. **Mixed Children Kinds** — WP enthält `task` + `subtask` + `epic`. Roll-up summiert alle Kinder mit Estimate; Kind ist irrelevant.
10. **outline_path-Tiefe > 10** — Theoretisch ltree max ~256 Levels (safe). UI warnt bei Tiefe > 10 („Diese WBS ist sehr tief verschachtelt — überlege strukturelle Vereinfachung").
11. **WBS-Code mit lokalen Number-Formats** — Spec verwendet ausschließlich Punkt-Separator (`1.2.3`); keine Lokalisierung.
12. **Concurrent Reorder zweier User** — PROJ-10-Field-Versioning greift; `sequence_in_parent` mit optimistic locking (`updated_at`-Stempel). Bei Konflikt: zweiter Save bekommt 409.
13. **Migration-Lauf während aktiver Sessions** — WBS-/Roll-up-Migration ist additiv; Outline-/Dependency-Backbone wird bereits durch PROJ-9-Round-2 vorausgesetzt.

## Technical Requirements

- **Performance:**
  - Subtree-Query (`WHERE outline_path <@ 'X.Y'`) < 100 ms für Subtree mit 5 000 Items (GIST-Index).
  - Roll-up-Recompute bei Child-Update < 200 ms (Trigger).
  - Tree-View Initial-Render < 1 s für 1 000 Items (Server-Side-Aggregation + Client-Virtualisierung).
- **Security:**
  - Tenant-/RLS-Sicherheit für den konsumierten Hierarchie-/Dependency-Backbone wird durch PROJ-9-Round-2 vorausgesetzt.
- **Migration Safety:**
  - DOWN-Migration verfügbar.
  - Idempotent (re-run-safe).
  - Verifikation der neuen WBS-/Roll-up-Spalten nach Backfill.
- **Test-Coverage:**
  - Vitest-Unit für: `outline_path`-Berechnung, `wbs_code`-Auto-Gen, Roll-up-Math, polymorphe Cycle-Detection.
  - Integration: Migration auf Kopie der Prod-DB.
  - E2E (Playwright): Tree-View-Toggle + Indent/Outdent-Flow.
- **Browser Support:** wie Plattform (Chrome, Firefox, Safari current).

## Out of Scope (explizit)

- Gantt-DnD (Verschieben, Resize, Dependency-Linien zeichnen) → **PROJ-25**
- Phasen-Container ziehen Kinder mit → **PROJ-25** (erweiterte AC)
- SVAR React Gantt Library-Integration → **PROJ-25** Architecture-Phase
- Critical-Path-Berechnung + UI-Highlight → **PROJ-25** oder **PROJ-25b**
- Resource-Roll-up auf Summary-Items → **PROJ-11b** (Implementation-Note in PROJ-11)
- Cost-Roll-up auf Parent → **PROJ-24**
- Auto-Schedule-Engine (Dependency-driven Auto-Move) → künftige eigene Schedule-/Auto-Planning-Slice
- Baseline-Snapshots / Re-Planning → künftig

## V2 Reference Material
- ADR `work-item-metamodel.md` — STI-Pattern bleibt kompatibel.
- ADR `method-object-mapping.md` — durch diese Spec erweitert (`task → work_package` jetzt erlaubt).
- V2-Code-Pfade: kein 1:1-Pendant — V2 hatte keine ltree-basierte WBS, V3 ist hier Greenfield.

---

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

> **Architect:** Claude (architecture skill) · **Date:** 2026-05-03 · **CIA-Konsultation:** durchgeführt — 4 offene Forks geklärt, 3 Out-of-Spec-Funde dokumentiert. Alle Empfehlungen V3-konform (Mirror PROJ-9/22/24/33-Pattern).

### 0. Reconciliation mit PROJ-9-Round-2 (User-Decision 2026-05-03)

**Wichtig — dieser Tech Design wurde ursprünglich mit der Annahme geschrieben, dass PROJ-36 das gesamte Schema (inkl. polymorphe Dependencies, ltree, outline_path) selbst besitzt. Per User-Entscheidung gilt:**

✅ **PROJ-9-Round-2 ist Owner aller Schema- und Migration-Themen** (siehe [PROJ-9 Tech Design Round 2](PROJ-9-work-item-metamodel-backlog.md#tech-design-round-2--polymorphic-dependencies--hierarchy-extension)). Dazu gehören:
- `outline_path` (ltree) + Maintenance-Trigger
- `sequence_in_parent`
- erweiterte `ALLOWED_PARENT_KINDS` (`task → work_package`, `work_package → work_package`)
- polymorphe `dependencies`-Tabelle (alte droppen, neue anlegen, Daten-Migration mit kind-basiertem Mapping)
- 3 ON-DELETE-Trigger auf `projects`/`phases`/`work_items`
- Cycle-Prevention-Trigger (polymorph)
- Tenant-Boundary-Trigger
- API-Wrapper für Round-1-Routes (6-Monats-Deprecation)

✅ **PROJ-36 ist Owner der UI/UX- und Semantik-Schicht.** Dazu gehören:
- `wbs_code` (auto + manueller Override) **inkl. Trigger** für Auto-Gen
- `wbs_code_is_custom` Flag
- `derived_planned_start` / `derived_planned_end` / `derived_estimate_hours` (Roll-up-Spalten) **inkl. Trigger** für Recompute
- Tree-View UI als View-Toggle neben Liste (`react-arborist`)
- Indent/Outdent-Buttons (setzen `parent_id` per PATCH; Trigger-Validation in PROJ-9-R2)
- Inline-Edit für Name + WBS-Code
- View-Toggle-Persistenz (localStorage)

**Konsequenz für die Phasen-Planung in §1 + §8:**
- ⛔ **Phase 36-β** (polymorphe Dependencies) **entfällt komplett** — vollständig abgedeckt durch PROJ-9-Round-2-Migration.
- ✅ **Phase 36-α** wird verschlankt: nur noch `wbs_code` + `wbs_code_is_custom` + `derived_*`-Spalten + zugehörige Trigger. ltree/outline_path/ALLOWED_PARENT_KINDS-Erweiterung werden in PROJ-9-Round-2 erledigt.
- ✅ **Phase 36-γ** (Frontend Tree-View) bleibt unverändert.
- ✅ **Phase 36-Pre** (`ALLOWED_PARENT_KINDS`-Konsolidierung) wandert ebenfalls zu PROJ-9-Round-2 — passt thematisch dorthin.

**Aufwands-Update:** Total ~9.5 PT → **~5.5 PT** (Pre weg, β weg, α verschlankt).

**Voraussetzung für Build:** PROJ-9-Round-2 muss vor PROJ-36 deployed sein. Build-Reihenfolge: PROJ-9-R2 (Backend) → PROJ-36-α (Backend) → PROJ-36-γ (Frontend) → PROJ-25 (Frontend + Backend).

**Sektionen, die durch dieses Reconciliation-Note überschrieben werden:**
- §1 Architectural Approach: Phasen-Liste (3 → 2)
- §3 Data Model: outline_path + ALLOWED_PARENT_KINDS + dependencies Tabelle gehören PROJ-9-R2
- §4 Locked Design Decisions: D2 (Composite-CASE-Trigger), D6 (3 ON-DELETE-Trigger), D7 (ALLOWED_PARENT_KINDS-Konsolidierung) gehören PROJ-9-R2
- §5 Daten-Flows: Szenario D (Cross-Project-Dependency) gehört PROJ-9-R2
- §6 Tech-Decisions: 6.3, 6.6, 6.7 gehören PROJ-9-R2
- §7 CIA-Findings: R3 (Migration-B), R4 (Cycle-Detection) gehören PROJ-9-R2; R6 (ALLOWED_PARENT_KINDS) gehört PROJ-9-R2
- §8 Phasen-Tabelle: 36-Pre + 36-β-Zeilen werden gestrichen
- §10 Affected Files: 36-β-Migration entfällt; 36-Pre wird PROJ-9-R2-Aufgabe
- §12 Risks: Backfill-Reihenfolge + Migration-B Atomicity + Cycle-Detection-CTE gehören PROJ-9-R2

**Was bleibt PROJ-36-eigenes Tech-Design (verbindlich):**
- §2 Component Structure (Tree-View-Komponenten + View-Toggle)
- §3 Data Model (nur die `wbs_code`/`derived_*`-Spalten)
- §4 Locked Decisions D1, D3, D4, D5
- §5 Szenario A (Insert mit WBS-Code), Szenario C (Custom WBS-Code-Override)
- §6 Tech-Decisions 6.1 (ltree-Wahl bestätigt), 6.2 (Trigger statt MView), 6.4 (Phasen-Split — angepasst auf 2 Phasen), 6.5 (keine Virtualisierung initial)
- §7 CIA-Findings R1 (Update-Storm), R2 (Type-Branch), R5 (Library-Wahl)
- §9 Dependencies (`react-arborist` als einzige neue Lib)
- §11 Out-of-Scope
- Tree-Library-Entscheidung: **`react-arborist` (MIT)** — 30 KB gzip, virtualisiert eingebaut, A11y, Indent/Outdent-API, Future-Proof für DnD (PROJ-25). **Überschreibt §4-D-Decision-„Keine Virtualisierungs-Library"** in §4 — wir nehmen `react-arborist` jetzt direkt mit, nicht deferred zu PROJ-36c. PROJ-36c entfällt.

### 1. Architectural Approach

PROJ-36 ist ein **Compose-don't-invent**-Slice mit drei orthogonalen Bausteinen. Alle drei sitzen auf bereits in Production erprobten V3-Pattern:

1. **WBS-Hierarchie via `ltree`** — eine PostgreSQL-Extension, die Pfade wie `1.2.3` als nativen Datentyp speichert und mit GIST-Index sub-tree-Queries in Millisekunden beantwortet. Pfad wird auto-gepflegt durch Trigger; Subtree-Queries laufen O(log n) statt rekursive CTEs.
2. **Roll-up via Trigger** (Mirror PROJ-22 Budget-Aggregat-Trigger und PROJ-9 Cycle-Trigger) — bottom-up Recompute der `derived_*`-Spalten bei Child-Change. Bei <500 Items pro Tenant ist Update-Storm kein Problem; Materialized-View bleibt als **PROJ-36b** parkiert (analog PROJ-24 → PROJ-24b-Muster).
3. **Polymorphe Dependencies** mit Composite-CASE-Trigger statt nativer FK (Postgres erlaubt keine polymorphen FKs). Statisches SQL, vier explizite Type-Branches, mirror PROJ-9 `enforce_dependency_same_project`-Stil.

Drei separate **Phasen** liefern jede deploybar:
- **36-α** (additiv) — ltree + outline_path + WBS-Code + Roll-up + Trigger. Reines Schema-Add, rollback-trivial.
- **36-β** (destruktiv) — neue polymorphe `dependencies`-Tabelle, alte droppen, Daten-Migration. Eine Transaktion.
- **36-γ** (Frontend) — Tree-View + View-Toggle + Indent/Outdent + Inline-Edit. Reine UI-Slice.

Kein neues UI-Pattern wird erfunden; alle 4 Architektur-Forks sind durch CIA gelockt (siehe §6).

### 2. Component Structure

```
PROJ-36 Oberflächen
│
├── /projects/[id]/arbeitspakete  (existing Route, ERWEITERT)
│   ├── View-Toggle "Liste | Hierarchie"  (NEU)
│   │   └── Toggle-Default: "Hierarchie" wenn Items mit Kindern existieren,
│   │       sonst "Liste". Persistierung pro (user_id, project_id) in localStorage.
│   ├── Liste-View  (heutige flache Ansicht — unverändert)
│   └── Hierarchie-View  (NEU — Tree mit Expand/Collapse)
│       ├── Spalten: WBS-Code · Name · Kind · Eigenes Datum · Roll-up Datum
│       │            · Eigener Aufwand · Roll-up Aufwand · Status
│       ├── Hybrid-Anzeige bei Items mit Kindern: zwei Felder pro Datum/Aufwand
│       │   ("Eigenes: 40h · Aus Kindern: 120h · Gesamt: 160h")
│       ├── Indent / Outdent Buttons pro Row (verschiebt parent_id eine Ebene)
│       ├── Inline-Edit: Name + WBS-Code (Override toggelt wbs_code_is_custom)
│       ├── "Alle ausklappen" / "Alle einklappen" Toolbar-Buttons
│       └── Konflikt-Hinweis: WBS-Code-Regenerierung-Confirm bei
│           wbs_code_is_custom=false-Reset ("Code wird von 'AP-001' auf '1.3.2'
│           regeneriert. Fortfahren?")
│
├── Work-Item-Drawer  (existing, MINIMAL ERWEITERT)
│   └── Neue Anzeige: WBS-Code + outline_path-Tiefe (read-only, neben Title)
│       Manueller WBS-Code-Override via Inline-Edit-Button (öffnet kleinen Dialog).
│
└── Dependencies UI  (heute keiner — kommt mit PROJ-25 Gantt)
    PROJ-36 ändert KEINE Dependencies-UI — die Edit-Surface lebt bei PROJ-25.
    PROJ-36 macht nur das Datenmodell polymorph; bestehende Backlog-Dependency-
    Anzeige (falls vorhanden) muss read-only mit polymorphen Quellen klarkommen.
```

### 3. Data Model (Klartext, keine SQL)

**Bleibt unverändert:**
- `phases` (PROJ-19) — komplett orthogonal zu Work-Item-Hierarchie.
- `work_items.parent_id` — bleibt für Hierarchie *innerhalb* der Work-Item-Welt. Keine Phase-Bezug.
- `work_items.phase_id` — bleibt der Cross-Level-Bezug zur Phase.
- `work_items.kind` — bleibt STI-Diskriminator.

**Erweitert:**
- `work_items` bekommt **6 neue Spalten** (alle nullable, additiv):
  - **outline_path** (`ltree`): Pfad-Repräsentation der Hierarchie. Auto-gepflegt durch Trigger.
  - **wbs_code** (Text, max 50): Anzeige-Code wie "1.2.3" oder "AP-001". Auto wenn nicht-custom; manueller Wert wenn custom.
  - **wbs_code_is_custom** (Boolean, default false): Flag, ob User den Code manuell überschrieben hat.
  - **derived_planned_start** / **derived_planned_end** (Date): Aus Kindern abgeleitete Min/Max-Termine. Read-only Computed.
  - **derived_estimate_hours** (Numeric): Summe der Kind-Aufwände (eigene + deren derived). Read-only Computed.

**Erweitert (Pattern-Erweiterung):**
- `ALLOWED_PARENT_KINDS` (TS-Konstante) bekommt zwei neue erlaubte Beziehungen:
  - `task` darf jetzt unter `work_package` (vorher nur unter `story`).
  - `work_package` darf unter `work_package` (Multi-Level WBS).
  - Andere Kinds unverändert.

**Komplett neu — eine Tabelle, alte komplett ersetzt:**
- **`dependencies`** wird in Phase 36-β **vollständig ausgetauscht** (alte droppen, neue anlegen, Daten migrieren):
  - `from_type` + `from_id` (polymorph, einer von 4 Werten: project / phase / work_package / todo)
  - `to_type` + `to_id` analog
  - `constraint_type` (FS/SS/FF/SF, default FS) + `lag_days` (signed integer)
  - `tenant_id` + Audit-Felder
  - **Immutable** (analog PROJ-9): kein UPDATE erlaubt. Type-Wechsel oder lag-Days-Änderung = delete + insert. Spec-Klarstellung — siehe §6 Out-of-Spec-Fund 2.

**Keine neuen Tabellen** außer dem Replace von `dependencies`. Keine Materialized-View. Keine zusätzlichen Audit-Tabellen — bestehende PROJ-10-Audit-Pipeline deckt die neuen Spalten ab (entsprechend in `audit_tracked_columns`-Whitelist registrieren).

### 4. Locked Design Decisions

| # | Decision | Begründung (PM-readable) |
|---|---|---|
| 1 | **AFTER-Trigger** für Roll-up (statt Materialized-View oder App-Logik) | Mirror PROJ-22 Budget-Aggregat. Bei <500 Items pro Tenant ist Update-Storm nicht real. Live-Werte (kein Stale-Read). Materialized-View als PROJ-36b parkiert wenn Telemetrie es nötig macht. Trigger-Guard `IS DISTINCT FROM` verhindert Recompute bei reinen Title-Edits. |
| 2 | **Composite-CASE-Trigger** für polymorphe FK-Validation (statt dynamic-SQL EXECUTE) | V3-Codebase nutzt konsistent kein dynamisches SQL in Triggers (Defense-in-Depth, kein SQL-Injection-Vektor). Vier explizite CASE-Branches sind verbose, aber lesbar und auditable. Lehnt sich an `enforce_dependency_same_project` aus PROJ-9 an. |
| 3 | **Phasen-Split** PROJ-36-α (additiv WBS) + PROJ-36-β (destruktiv Dependencies) + PROJ-36-γ (Frontend) statt eine 8-Schritt-Migration | Mirror PROJ-33-α/β/γ/δ-Slicing. Reduziert Blast-Radius bei Rollback um ~80%. Migration A ist `DROP COLUMN`-rollback-trivial; Migration B konzentriert sich auf Schema-Replace + Daten-Migration in einer Transaktion. |
| 4 | **Keine Virtualisierungs-Library in Phase 36-γ** — Library-Wahl deferred zu PROJ-36c | Heute <500 Items pro Tenant. Browser-native Performance reicht für 6-12 Monate. Phase 36-γ misst Initial-Render-Zeit via PerformanceObserver und loggt > 800ms an Sentry. Library-Slice PROJ-36c wird getriggert wenn 5+ Tenants > 800ms p95 zeigen. Beobachtungs-getrieben statt Vorab-Optimierung. |
| 5 | **`dependencies` bleibt immutable** (kein UPDATE-Policy) | Konsistenz mit PROJ-9 (heute auch immutable). Type-Wechsel oder lag-Days-Änderung = delete + insert. Spec §D-AC wird auf `SELECT/INSERT/DELETE` reduziert. |
| 6 | **3 ON-DELETE-Trigger** auf `projects`/`phases`/`work_items` (statt 1) | Polymorphe Tabelle kann nur `tenant_id ON DELETE CASCADE` nativ. Phase-/Project-/Item-Delete brauchen je einen eigenen Trigger der passende `dependencies`-Rows räumt. Vitest-Coverage pro Cascade-Pfad. |
| 7 | **`ALLOWED_PARENT_KINDS`-Konsolidierung** als Pre-Implementation-Step | `parent/route.ts:18` enthält eine duplizierte Inline-Kopie der Konstante. Drift-Risiko bei Erweiterung. Pre-Step refaktoriert auf zentralen Import — 5-Zeilen-Diff, risikoarm, vor allen anderen Änderungen. |

### 5. Daten-Flows — Wie Hierarchie + Roll-up entstehen

#### Szenario A: User legt neues Arbeitspaket "Phase 1: Vorstudie" an

```
[User klickt "Neues Arbeitspaket" im Backlog]
    │
[POST /api/projects/[id]/work-items] mit kind='work_package', parent_id=null
    │
[BEFORE INSERT: PROJ-9 Cycle-Trigger lässt durch (kein parent)]
    │
[INSERT row mit sequence_in_parent=N+1 (N = bestehende Top-Level-WPs)]
    │
[AFTER INSERT: Trigger pflegt outline_path = ltree('1') + sequence
              → "1" für erstes WP, "2" für zweites]
    │
[AFTER INSERT: Trigger generiert wbs_code = "1" (ableitet aus outline_path,
               wbs_code_is_custom = false)]
    │
[AFTER INSERT: Roll-up-Trigger fired aber findet keine Children → derived_* = NULL]
    │
[Response: WP mit outline_path="1", wbs_code="1", derived_*=NULL]
```

#### Szenario B: User schiebt Task X unter ein anderes Work-Package

```
[User klickt "Indent" oder Drag-Drop in Tree-View]
    │
[PATCH /api/projects/[id]/work-items/[wid]/parent mit new_parent_id=Y]
    │
[BEFORE UPDATE: PROJ-9 Cycle-Trigger validiert: kein Cycle in parent-Kette]
    │
[BEFORE UPDATE: ALLOWED_PARENT_KINDS-Validation (jetzt: task→work_package OK)]
    │
[UPDATE work_items SET parent_id=Y, sequence_in_parent=N+1]
    │
[AFTER UPDATE: outline_path-Trigger ändert PATH von "1.2.3" auf "5.7.X"
               UND batched-update für ALLE Descendants
               (UPDATE WHERE outline_path <@ old_path SET outline_path =
               new_path || subpath(old_path, nlevel(old_path)))]
    │
[AFTER UPDATE: wbs_code-Trigger regeneriert für jeden mit wbs_code_is_custom=false,
               überspringt Custom-Codes (z.B. "AP-001" bleibt)]
    │
[AFTER UPDATE: Roll-up-Trigger walked Ancestors-via-ltree-Subpath
               (alter Parent → alle alten Ancestors, neuer Parent → alle neuen)
               und recomputed derived_* für jede berührte Ebene]
    │
[Response 200, Frontend re-fetched Subtree-Query mit ltree-Subpath]
```

#### Szenario C: User setzt manuellen WBS-Code "AP-001" auf einem WP

```
[User klickt Code-Inline-Edit, tippt "AP-001", drückt Enter]
    │
[PATCH /api/projects/[id]/work-items/[wid] mit wbs_code="AP-001"]
    │
[BEFORE UPDATE: Validation regex ^[A-Za-z0-9._-]{1,50}$ + UNIQUE-Check
                innerhalb (project_id, parent_id) Geschwister-Set]
    │
[UPDATE work_items SET wbs_code="AP-001", wbs_code_is_custom=true]
    │
[AFTER UPDATE: outline_path-Trigger fired NICHT (kein parent-Wechsel)]
[AFTER UPDATE: wbs_code-Trigger sieht is_custom=true → tut NICHTS]
[AFTER UPDATE: Roll-up-Trigger sieht keine Cost-Driver-Änderung → tut NICHTS
              (wegen IS DISTINCT FROM-Guard)]
    │
[Response 200]
```

#### Szenario D: User legt Cross-Project-Dependency Phase A → Work-Package B (anderes Projekt, gleicher Tenant)

```
[User-UI in PROJ-25 Gantt klickt "Dependency hinzufügen"]
    │
[POST /api/projects/[id]/dependencies mit
  from_type='phase', from_id=A.id,
  to_type='work_package', to_id=B.id,
  constraint_type='FS', lag_days=0]
    │
[BEFORE INSERT: Composite-CASE-Trigger validiert in 3 Schritten:
  1. from_id existiert in passender Tabelle:
     CASE 'phase' THEN SELECT EXISTS (FROM phases WHERE id = NEW.from_id)
  2. to_id existiert (analog für work_items)
  3. Beide haben denselben tenant_id (cross-tenant hard-block)]
    │
[BEFORE INSERT: Cycle-Trigger via Recursive-CTE über polymorphe Edges
                (LIMIT 10000 Walk) → kein Cycle]
    │
[INSERT row in neuer dependencies-Tabelle]
    │
[Response 201, Gantt-UI re-rendert mit neuer Dep-Linie]
```

### 6. Tech-Decisions (Warum so) — PM-readable

#### 6.1 Warum **ltree** statt eigene path-Spalte?
ltree ist ein etablierter Postgres-Extension-Standard, der genau dieses Problem löst (Hierarchie als Pfad). Es hat optimierte Operatoren (`@>` für "ist Vorfahre von", `<@` für "ist Nachfahre von") mit GIST-Index-Support → Subtree-Queries in O(log n) statt rekursive CTEs. Ist seit Postgres 8.3 stabil. Kein eigener Code, kein eigener Index-Bau.

#### 6.2 Warum **AFTER-Trigger** für Roll-up statt Materialized-View?
Materialized-View klingt theoretisch performanter, aber:
- Bringt Stale-Reads zwischen den Refresh-Zyklen — User editiert ein Datum, sieht im Reporting noch den alten Wert.
- Refresh produziert Postgres-Lock-Window → UI-Flackern bei Concurrent-Edit.
- Bei <500 Items pro Tenant ist die Performance-Differenz nicht messbar.
Trigger-Pattern mirrors PROJ-22 Budget-Aggregate, ist im Codebase erprobt, und erlaubt live-Werte. Wenn Telemetrie ein Performance-Problem zeigt, machen wir Materialized-View als **PROJ-36b** — exakt das PROJ-24 → 24b-Muster.

#### 6.3 Warum **Composite-CASE-Trigger** statt dynamic-SQL für Polymorphie-Check?
Dynamisches SQL (`EXECUTE 'SELECT ... FROM ' || NEW.from_type`) öffnet einen SQL-Injection-Vektor — auch wenn `from_type` aus einem CHECK-Enum kommt, gilt im V3 das Defense-in-Depth-Prinzip. Statisches SQL mit vier expliziten CASE-Branches ist verbose (~30 Zeilen) aber:
- Keine Runtime-Compilation, immer im Plan-Cache.
- Auditable in Code-Review.
- Erweiterbar in 6 Zeilen wenn ein 5. Type dazukommt (z. B. `milestone`).

#### 6.4 Warum **Phasen-Split** in 36-α/β/γ statt eine 8-Schritt-Migration?
Mirror PROJ-33-α/β/γ/δ. 36-α ist rein additiv (`ADD COLUMN`), Rollback ist `DROP COLUMN` — trivial. 36-β ist destruktiv (alte Tabelle droppen, neue anlegen), aber ist eine fokussierte Transaktion. Wenn 36-α schief geht, beschädigen wir nicht die existierenden Dependencies. Wenn 36-β schief geht, sind die WBS-Spalten bereits in Production und werden nicht zurückgesetzt. Frontend (36-γ) ist orthogonal und kann unabhängig deployed werden.

#### 6.5 Warum **keine Virtualisierungs-Library** in Phase 36-γ?
Heute existieren <500 Work-Items insgesamt über alle Tenants. Pro Projekt typisch 50-150. React 19 + Next 16 in modernem Browser rendern 500 Tree-Rows in ~150-250 ms ohne Virtualisierung. Die Library-Wahl heute (z. B. `@tanstack/react-virtual` vs. `react-window`) friert ein Pattern ein, ohne dass Telemetrie-Daten existieren. Phase 36-γ instrumentiert via PerformanceObserver und loggt zu Sentry, falls > 800ms p95. Wenn 5+ Tenants das Problem zeigen, separater Library-Slice PROJ-36c.

#### 6.6 Warum **`dependencies` bleibt immutable** (kein UPDATE)?
PROJ-9 hat heute bewusst keine UPDATE-Policy auf `dependencies` (Migration `20260428110000_*.sql` Zeile 316 dokumentiert das). Type-Wechsel oder lag-Days-Änderung läuft heute als delete + insert. PROJ-36 hält dieses Pattern bei — es ist nicht-defensiv, sondern Spec-konform. Der ursprüngliche AC §D mit `SELECT/INSERT/UPDATE/DELETE` wird auf `SELECT/INSERT/DELETE` korrigiert.

#### 6.7 Warum **3 ON-DELETE-Trigger** statt einem zentralen?
Polymorphe Tabelle kann keine native ON-DELETE-CASCADE auf `from_id`/`to_id` haben (FK ist polymorph). Stattdessen: drei separate Trigger auf `projects`/`phases`/`work_items` löschen die passenden `dependencies`-Rows. Tenant-Delete cascadet via `dependencies.tenant_id ON DELETE CASCADE` (genügt, weil alle Targets selbst `tenant_id ON DELETE CASCADE` haben). 3 Trigger sind verbose aber explizit.

### 7. CIA-Findings (Risiken die das Design entschärft)

| ID | Risiko | Severity | Im Design entschärft durch |
|----|--------|----------|---------------------------|
| R1 | Trigger-Update-Storm bei Bulk-Import (z. B. 1000-Item Excel via PROJ-12) → Latenz-Spike | **MID** | `IS DISTINCT FROM`-Guard auf Trigger; Bulk-Path nutzt `SET session_replication_role = replica` während Migration-Backfill |
| R2 | Polymorpher Existence-Check verfehlt Type-Branch beim Erweitern | **LOW** | Vitest-Coverage pro `from_type`/`to_type`-Wert; CHECK-Enum als Single-Source-of-Truth |
| R3 | Migration-B (Dependencies-Replace) verliert Daten bei Trigger-/RLS-Reproduktion | **HIGH** | Pre-Migration `CREATE TABLE dependencies_legacy AS SELECT * FROM dependencies` + Row-Count-Verifikation mit `RAISE EXCEPTION` bei Diff ≠ 0 |
| R4 | Cycle-Detection-CTE auf polymorpher Tabelle → Performance-Regression | **MID** | Recursive-CTE mit `LIMIT 10000` Cycle-Walk + Vitest-Last-Test (1000 Edges) |
| R5 | Virtualisierungs-Library-Wahl heute friert Stack ein | **LOW** | Library-Entscheidung in PROJ-36c verschoben; Phase-1 nutzt browser-native Render |
| R6 | `ALLOWED_PARENT_KINDS`-Duplizierung in `parent/route.ts:18` driftet beim Erweitern | **MID** | Pre-Implementation-Step konsolidiert auf zentralen Import |

**Out-of-spec-Funde** (zusätzlich zu Risk-Liste):
- **O1** `parent/route.ts:18` Duplizierung von `ALLOWED_PARENT_KINDS` → **Pre-Step in 36-α** (5-Zeilen-Diff)
- **O2** Dependencies-Immutability-Klärung: Spec-AC §D bekommt explizite Korrektur auf `SELECT/INSERT/DELETE` (siehe Locked-Decision #5)
- **O3** ON-DELETE-Cascade braucht 3 Trigger statt 1 (siehe Locked-Decision #6) — Edge-Case 7 wird im Spec entsprechend präzisiert

### 8. Empfohlene interne Phasierung (verbindlich für /backend + /qa)

| Phase | Block | Inhalt | Migration | Aufwand | Acceptance-Gate |
|---|---|---|---|---|---|
| **36-Pre** | O1 | `parent/route.ts` Konsolidierung auf `ALLOWED_PARENT_KINDS`-Import | keine | ~0.5 PT | TS-strict + Build green; 3 API-Routes nutzen denselben Import |
| **36-α** | A + B + C + F + G.WBS | ltree + outline_path + wbs_code (auto+override) + derived_* + Trigger + Backfill | 1 Migration (additiv) | ~3 PT | Existing Items haben gültige outline_path + wbs_code; Roll-up rendert in Drawer; PROJ-26 unverändert; Rollback via `DROP COLUMN` getestet |
| **36-β** | D + G.deps + H | Polymorphe `dependencies`-Tabelle: alte droppen, neue anlegen, Daten-Migration | 1 Migration (destruktiv, eine Transaktion) | ~3 PT | Row-Count vor=nach Migration; alle PROJ-9-Tests grün; 3 ON-DELETE-Cascade-Trigger getestet; Cross-Tenant-Trigger blockiert |
| **36-γ** | E | Frontend Tree-View + View-Toggle + Indent/Outdent + Inline-Edit | keine | ~3 PT | Tree rendert < 800ms p95 für 500-Item-Mock; Indent/Outdent funktioniert; localStorage-Persistierung; PerformanceObserver-Sentry-Integration |

Jede Phase hat eigenen QA-Pass und eigenen Deploy. **Total: ~9.5 PT**.

### 9. Dependencies (Packages)

**Neue npm-Packages:** keine.
- ltree ist Postgres-Extension (DB-side), kein npm-Install.
- Tree-View nutzt existierendes shadcn (`Collapsible`) + Lucide-Icons.
- **Keine** Virtualisierungs-Library in 36-γ (deferred zu PROJ-36c).

**Neue Env-Variablen:** keine.

**Touched-but-unchanged-Code** (Awareness):
- `src/types/work-item.ts` (erweitert): `ALLOWED_PARENT_KINDS` + `WorkItem`-Interface (6 neue Felder) + neue Helper für outline_path / wbs_code.
- `src/app/api/projects/[id]/work-items/route.ts` + `[wid]/route.ts` + `[wid]/parent/route.ts` (erweitert): Validation für neue Parent-Beziehungen + WBS-Code-Validation.
- `src/app/api/projects/[id]/work-items/[wid]/dependencies/...` (möglicherweise neu, abhängig von heutigem Stand) — wird in 36-β für polymorphe Edges erweitert.
- `src/components/work-items/backlog-list.tsx` (erweitert): View-Toggle-Integration.
- `src/components/work-items/backlog-tree.tsx` (existing — zu prüfen ob heute schon Tree-Rendering gibt).
- `src/components/work-items/work-item-detail-drawer.tsx` (minimal erweitert): WBS-Code-Anzeige.
- `supabase/migrations/`: 2 neue Migrationen (eine pro Phase α + β).
- PROJ-25-Spec: Update-Note "phase_dependencies entfällt — nutze polymorphe `dependencies`".

### 10. Affected Files Summary (für /backend + /frontend)

**Database (zwei neue Migrationen):**
- 36-α: `CREATE EXTENSION ltree`; `ALTER TABLE work_items ADD COLUMN`s; 3 neue Trigger (outline_path, wbs_code, rollup_recompute); GIST-Index auf outline_path; Backfill rekursiv aus parent_id-Ketten; Audit-Whitelist erweitern.
- 36-β: neue `dependencies`-Tabelle in einer Transaktion (Snapshot → Replace → Verify); RLS-Policies; Composite-CASE-Trigger für Polymorphie + Cycle-Prevention + Tenant-Match; 3 ON-DELETE-Cascade-Trigger.

**Backend (TypeScript):**
- Pre-Step: `parent/route.ts` Konsolidierung.
- 36-α: `ALLOWED_PARENT_KINDS`-Erweiterung + `WorkItem`-Type-Felder + WBS-Code-Validation + Drawer-API.
- 36-β: Dependencies-API-Routes erweitern (POST/DELETE mit `from_type/to_type`-Body).

**Frontend:**
- 36-γ: Tree-View-Komponente (neu) + View-Toggle + Indent/Outdent-Buttons + Inline-Edit für Name/WBS-Code + WBS-Code-Regenerierung-Confirm-Dialog.
- Drawer: WBS-Code-Anzeige + outline_path-Tiefe-Indicator.

### 11. Out of /architecture Scope (explizit)

- **Gantt-DnD** (Drag/Drop, Resize, Dependency-Linien zeichnen) → PROJ-25
- **Critical-Path-Berechnung** (Forward/Backward-Pass) → PROJ-25 oder PROJ-25b
- **Resource-Roll-up** auf Summary-Items → PROJ-11b (Implementation-Note in PROJ-11)
- **Cost-Roll-up** auf Parent → PROJ-24
- **Auto-Schedule-Engine** (Dependency-driven Auto-Move) → künftiges PROJ-39
- **Materialized-View** für Roll-up → **PROJ-36b** wenn Telemetrie zeigt Trigger-Latenz > 200ms p95
- **Tree-View Virtualisierung** → **PROJ-36c** wenn Telemetrie zeigt Render > 800ms p95
- **Baseline-Snapshots / Re-Planning** → künftig

### 12. Risks / Watch-outs für /backend

- **Backfill-Reihenfolge** ist kritisch: outline_path muss vor wbs_code-Backfill rechnen (wbs_code leitet aus outline_path ab). Ein einzelner SQL-Lauf ist nicht ausreichend — entweder zwei separate Backfills mit klarer Reihenfolge, oder eine rekursive Funktion die beide gleichzeitig setzt.
- **Trigger-Reihenfolge** bei AFTER-INSERT auf `work_items`: erst outline_path setzen, dann wbs_code generieren, dann Roll-up propagieren. Postgres ordnet AFTER-Trigger nach Name alphabetisch — Namen entsprechend prefixen (`a_outline_path`, `b_wbs_code`, `c_rollup`).
- **Performance bei `outline_path`-Subtree-Update**: Move eines WP mit 1000 Descendants muss als BATCHED `UPDATE WHERE outline_path <@ old_path SET outline_path = new_path || subpath(...)` laufen, nicht zeilenweise. Vitest mit 1000-Item-Mock testen.
- **Migration-B Atomicity**: Schritte 1-5 (Snapshot, Create, Insert, Verify, Drop+Rename) müssen alle in derselben Transaktion sein. Postgres wraps `*.sql` Files automatisch in eine Transaktion (Supabase-CLI-Konvention). Aber: explizite `BEGIN;` + `COMMIT;` als Defense-in-Depth, falls jemand das File je extern lädt.
- **Cycle-Detection-CTE auf polymorpher Tabelle**: muss zwischen `(from_type, from_id)` und `(to_type, to_id)`-Tupeln walken. Recursive CTE mit `cycle` detection clause + `LIMIT 10000` als Sicherheitsnetz. Vitest-Last-Test mit synthetisch verketteten 1000 Edges.
- **Concurrent Reorder**: zwei User reordern gleichzeitig — `sequence_in_parent` mit `updated_at`-Stempel + optimistic locking. Bei Konflikt 409 zurück; Frontend zeigt Banner "Konflikt mit anderem Editor — bitte neu laden".

### 13. Handoff-Empfehlung

Reihenfolge der nächsten Skills:

1. **Pre-Step (gehört zu /backend)** — `parent/route.ts`-Konsolidierung. Trivial, ~10 Min. Pre-Step kann auch in /frontend laufen wenn das vor /backend kommt.
2. **`/backend` für Phase 36-α** — Migration + ltree + outline_path-Trigger + wbs_code-Trigger + Roll-up-Trigger + Backfill + ALLOWED_PARENT_KINDS-Erweiterung + WBS-Code-Validation in API-Routes. ~3 PT.
3. **/qa für 36-α** — Roll-up-Math-Vitest + Trigger-Order-Test + Backfill-Verification + Performance-Test bei 1000-Item-Subtree. **Deploy 36-α** isoliert.
4. **`/backend` für Phase 36-β** — Polymorphe `dependencies`-Tabelle + Composite-CASE-Trigger + Cycle-Detection-CTE + 3 ON-DELETE-Cascade-Trigger + Daten-Migration mit Snapshot+Verify. **Defensiv: Migration auf Kopie der Prod-DB testen**, bevor live applied. ~3 PT.
5. **/qa für 36-β** — alle PROJ-9-Tests müssen grün bleiben + 6 neue Test-Cases (4 Type-Branches × INSERT/DELETE) + Cross-Tenant-Block + Cycle-Detection. **Deploy 36-β** isoliert.
6. **`/frontend` für Phase 36-γ** — Tree-View + View-Toggle + Indent/Outdent + Inline-Edit + Sentry-Performance-Instrumentierung. ~3 PT.
7. **/qa für 36-γ** — E2E (Tree öffnen, Indent klicken, WBS-Code editieren) + Browser-Smoke (Chrome/Firefox/Safari) + Mobile-Test. **Deploy 36-γ**.

**Total: ~10 PT (inkl. QA-Pässe ~0.5 PT pro Phase)**.

Begründung Reihenfolge: 36-α ist additiv und niedrig-Risiko, etabliert die ltree-Foundation. 36-β kann erst danach laufen, weil Cycle-Detection-CTE die outline_path-Spalte für Performance braucht. 36-γ ist orthogonal und kann theoretisch parallel zu 36-β laufen — aber sequentiell ist sicherer (Tree-View testet sich besser mit produktiven WBS-Daten aus 36-α-Deploy).

### 14. Approval-Empfehlung

**Umsetzbar mit aktueller Architektur ohne Stack-Erweiterung.** Alle 7 Locked-Decisions kompatibel, alle 6 CIA-Risiken im Design entschärft. Phasierung gibt Deploy-Granularität. ltree ist Postgres-Standard, keine neue npm-Dependency. CIA-Empfehlung: **/backend kann mit Pre-Step (parent/route.ts-Konsolidierung) + Phase 36-α starten**. /frontend wartet auf 36-α-Deploy, dann kann es parallel zu 36-β laufen — sicherer Pfad ist sequentiell.

## Implementation Notes

### Pre-Step — `parent/route.ts` ALLOWED_PARENT_KINDS-Konsolidierung (`/backend`, 2026-05-03)

**Touched:** `src/app/api/projects/[id]/work-items/[wid]/parent/route.ts`
- Inline-Duplizierung der `ALLOWED_PARENT_KINDS`-Konstante + `WORK_ITEM_KINDS`-Array entfernt (~22 Zeilen).
- Importiert jetzt `ALLOWED_PARENT_KINDS, type WorkItemKind` aus `@/types/work-item`.
- Dadurch ist die Erweiterung in 36-α (Multi-Level WBS) sofort wirksam, ohne dass die Route nachgezogen werden muss.

### Phase 36-α Backend (`/backend`, 2026-05-03)

**Migration** — `supabase/migrations/20260503180000_proj36a_wbs_hierarchy_rollup.sql`
(applied to remote project `iqerihohwabyjzkpcujq`):

- **ltree-Extension** aktiviert (`CREATE EXTENSION IF NOT EXISTS ltree`).
- **6 neue Spalten auf `work_items`**: `outline_path` (ltree, nullable), `wbs_code` (text, nullable, max 50), `wbs_code_is_custom` (boolean NOT NULL DEFAULT false), `derived_planned_start` (date, nullable), `derived_planned_end` (date, nullable), `derived_estimate_hours` (numeric(10,2), nullable). Alle additiv, Rollback via `DROP COLUMN` trivial.
- **Constraints**:
  - `work_items_wbs_code_format` CHECK regex `^[A-Za-z0-9._-]{1,50}$` (Spec § B).
  - Partial UNIQUE index `work_items_wbs_code_unique_per_sibling` auf `(project_id, COALESCE(parent_id, '00000000-…'::uuid), wbs_code) WHERE wbs_code IS NOT NULL` — Geschwister-Eindeutigkeit, NULL-Parent als ein Bucket via Sentinel-UUID.
- **Indexes**:
  - `work_items_outline_path_gist` (GIST) für `<@`/`@>` Subtree-Queries.
  - `work_items_outline_path_btree` für sortierte Range-Reads.
- **Trigger** (alle 4 mit `pg_trigger_depth()`-Guard gegen Rekursion + `SECURITY DEFINER` mit `set search_path = 'public', 'pg_temp'` per PROJ-29-Hardening):
  1. `tg_work_items_36a_outline_path_self` (BEFORE INSERT/UPDATE OF parent_id, position) — berechnet `NEW.outline_path` aus `parent.outline_path || max-sibling-label+1`. Top-Level-Items numerieren pro `project_id` durch.
  2. `tg_work_items_36a_outline_path_cascade` (AFTER UPDATE OF outline_path WHEN distinct) — bulk-update aller Descendants über `subpath`-Replacement. Single-SQL-Statement, keine Zeilenschleife.
  3. `tg_work_items_36a_wbs_code_autogen` (BEFORE INSERT/UPDATE OF outline_path, wbs_code_is_custom) — generiert `wbs_code` aus `outline_path::text` wenn `wbs_code_is_custom = false`. Custom-Codes passieren unverändert.
  4. `tg_work_items_36a_rollup_recompute` (AFTER INSERT/UPDATE/DELETE WHEN depth=0) — walked Ancestors via `outline_path @> v_path` aufsteigend nach `nlevel`, recomputed `derived_planned_start/end/estimate_hours` durch direkte-Kinder-Aggregation. Liest Cost-Driver aus JSONB `attributes->>'planned_start'/'planned_end'/'estimate_hours'`.
- **Backfill** (rekursive CTE) — alle 22 existierenden `work_items` haben jetzt outline_path + wbs_code. Verifikation:
  - `1 → 2 → 3` Top-Level-Numerierung pro Projekt
  - `1.1`, `1.1.1` Hierarchien rekonstruiert (z. B. epic→feature→story-Kette)
- **Audit-Whitelist erweitert** (`_tracked_audit_columns`): `wbs_code`, `wbs_code_is_custom` ergänzt. `outline_path` und `derived_*` bleiben **nicht** im Audit (derived, kein User-Edit).
- **Function-Lockdown** (`20260503190000_proj36a_function_lockdown.sql`) — `REVOKE EXECUTE ... FROM public, anon, authenticated` auf alle 4 trigger functions, mirror PROJ-24 `_resolve_role_rate_lockdown`. Trigger-System läuft unter `postgres`, REST-RPC-Surface ist zu.

**API-Route-Erweiterungen** (2 Files):
- `src/app/api/projects/[id]/work-items/route.ts` POST — `wbs_code` (regex-validated) + `wbs_code_is_custom` als optionale Felder im createSchema. Initial-Custom-Code beim Anlegen möglich.
- `src/app/api/projects/[id]/work-items/[wid]/route.ts` PATCH — `wbs_code` (nullable, regex-validated) + `wbs_code_is_custom` als optionale Felder im updateSchema. Manueller Override + Toggle-Reset werden DB-seitig durch den autogen-Trigger korrekt gehandhabt.

**Type-Erweiterung** (`src/types/work-item.ts`):
- `ALLOWED_PARENT_KINDS` erweitert: `task` darf unter `work_package`, `work_package` darf unter `work_package` (Multi-Level WBS).
- `WorkItem`-Interface bekommt 6 neue Felder als **optional** (`?`-Marker) — gibt Hooks Spielraum, ihre SELECTs schrittweise zu erweitern (Phase 36-γ Frontend), ohne dass der Backend-Deploy auf Frontend wartet.
- Neue Types `DependencyEntityType`, `DependencyConstraintType` für Phase 36-β vorgemerkt.

**Verification:**
- `npx tsc --noEmit` exit 0
- `npm run lint` exit 0
- `npm test --run` 775/775 (unverändert — keine neuen Vitest-Cases, /qa wird ergänzen)
- `npm run build` green; alle PROJ-9 work-items-Routes weiterhin im Manifest
- Live DB Smoke (Supabase MCP):
  - 22/22 work_items haben gültiges outline_path + wbs_code (Backfill clean)
  - 8 Trigger live (4 PROJ-9 base + 4 PROJ-36-α)
  - Hierarchie-Rekonstruktion korrekt (epic="1" → feature="1.1" → story="1.1.1")
  - Function-Lockdown verifiziert (postgres + service_role only)
- Supabase Advisors:
  - 0 neue PROJ-36-α-class warnings nach Lockdown
  - `extension_in_public` für ltree wird als bekannt-akzeptierter WARN dokumentiert (Tooling-Konvention; ltree-Operatoren `@>`/`<@` würden bei Schema-Move zusätzlichen `search_path`-Aufwand bedeuten — Out-of-Scope)

**Open für Phase 36-β:**
- Polymorphe `dependencies`-Tabelle (alte droppen, neue anlegen, Daten-Migration mit `kind→type`-Mapping).
- 3 ON-DELETE-Cascade-Trigger auf `projects`/`phases`/`work_items`.
- Composite-CASE-Trigger für FK-Validation + Cycle-Detection-CTE.

**Open für Phase 36-γ:**
- Tree-View + View-Toggle in `/projects/[id]/arbeitspakete`.
- Indent/Outdent UI.
- WBS-Code-Inline-Edit + Regenerate-Confirm-Dialog.
- Drawer-Anzeige für `outline_path`-Tiefe + WBS-Code.

### Phase 36-α RE-DEPLOY (`/backend` + Hotfix, 2026-05-04)

**Vorgeschichte (Production-Inzident):**
- 2026-05-03: Commit `f6089f8` legte α-Migration an, wurde in Commit `a98e4c8` reverted bevor sie Production erreichte. Migrationsdateien gelöscht.
- 2026-05-03 abends: Commit `0b09c8c` deployed γ-Frontend mit der falschen Annahme, α sei live (Commit-Message zitiert das wörtlich).
- 2026-05-04 morgens: γ-UI ruft `useWorkItems` auf, der die α-Spalten selektiert; PostgREST liefert 42703 (`outline_path` doesn't exist). `useWorkItems` hat fail-silent-Errorhandling (`setItems([]); setError(null)`) — Backlog rendert leer, neue Work Items werden gespeichert aber nicht angezeigt.
- Verifiziert via Supabase MCP `information_schema.columns`: 0/6 α-Spalten in Prod-DB.

**Hotfix (Commit `276d384`, deployed):**
- `src/hooks/use-work-items.ts`: SELECT auf Vor-Revert-Stand zurückgebaut, Errorhandling differenziert (nur 42P01 schlucken; 42703/42501/Network → `setError(message)`).
- `src/hooks/use-work-item.ts`: gleiche Differenzierung.
- `src/app/api/projects/[id]/work-items/[wid]/route.ts`: 42703 als 503 `wbs_unavailable` gemappt statt 500-Stacktrace.
- 881/881 Tests grün, Backlog wieder funktional in Production.

**CIA-Review (PROJ-36-α Re-Deploy, 4 Bedingungen):**
- E3 (Audit-Trigger empty-diff): ✅ verifiziert no-op — `record_audit_changes()` (`20260428190000_proj10_audit_log_entries.sql:105`) checkt `is distinct from` pro tracked column. Roll-up-Trigger ändert nur `derived_*`, nicht in Whitelist → Diff leer → kein Audit-Insert.
- E2 (CTE Cycle-Defense): ✅ Depth-Bound 32 in Backfill-CTE eingebaut + Smoke-Warning bei NULL-outline_paths nach Backfill.
- E4 (Frontend-Re-Aktivierung im selben Slice): ✅ Hook-SELECT erweitert, 503-Mapper entfernt, INDEX.md korrigiert, Notes hier ergänzt. Errorhandling-Differenzierung **bleibt** (dauerhafte Drift-Defense).
- E5 (Backfill-Audit-Trail): pragmatisch akzeptiert — Backfill-UPDATEs auf `wbs_code` erzeugen Audit-Events mit `actor_user_id = NULL`. Im Migration-Header dokumentiert; Tenant-Audit-UI sollte NULL-Actor-Events als „System-Migration" interpretieren.

**Re-Deploy-Migrationen (additiv, Idempotenz via `if not exists` / `or replace`):**
- `supabase/migrations/20260504400000_proj36a_wbs_hierarchy_rollup_redeploy.sql` — bit-identisch zu `f6089f8` plus:
  - Re-Deploy-Header mit Inzident-Kontext und R2-Kompatibilitäts-Analyse.
  - Backfill-CTE depth-bounded auf 32 (E2).
  - Smoke-Warning bei NULL-outline_paths (Orphan-/Cycle-Detection).
  - Audit-Trail-Note (E5).
- `supabase/migrations/20260504410000_proj36a_function_lockdown_redeploy.sql` — REVOKE EXECUTE auf 4 Trigger-Functions, mirror PROJ-24-Pattern.

**Kompatibilität mit PROJ-9-R2** (deployed `20260503200000`):
- R2 hat eigene Spalten/Tabellen (`dependencies`-Tabelle); keine Überschneidung mit α-Schema.
- R2 hat AFTER-DELETE-Trigger `tg_work_items_cleanup_dependencies` auf work_items — eigener Namespace, koexistiert.
- R2-File enthält `_tracked_audit_columns()`-Definition mit `wbs_code`/`wbs_code_is_custom` bereits drin (proaktiv aus Revert-Chaos überlebt). α-Re-Deploy überschreibt mit byte-identischem Body via `create or replace` → No-Op.

**Rollback-Runbook:** `docs/runbooks/proj-36a-rollback.sql` (DROP-Script). Wichtig: `_tracked_audit_columns()` **nicht** zurückrollen, weil R2-Migration die Whitelist bereits enthält.

**Frontend-Re-Aktivierung:**
- `src/hooks/use-work-items.ts` — SELECT erweitert um die 6 α-Spalten. Errorhandling-Differenzierung (42P01 schlucken, alles andere `setError`) bleibt bestehen als dauerhafte Drift-Defense.
- `src/app/api/projects/[id]/work-items/[wid]/route.ts` — 503 `wbs_unavailable`-Mapper entfernt; ein 42703 ist ab jetzt ein echter Fehler, der gemeldet werden soll.
- `features/INDEX.md` PROJ-36-Status korrigiert auf „Deployed (α re-deployed 2026-05-04 + γ live, β deferred)".

**Folge-Story (CIA-Empfehlung E1, neue PROJ-42):** Schema-Drift-CI-Guard — Pre-Merge-Job, der jeden `.from(...).select(...)` gegen `information_schema.columns` der Shadow-DB checkt. Verhindert die nächste Inkarnation dieses Drift-Bugs.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
