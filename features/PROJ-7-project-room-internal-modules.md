# PROJ-7: Project Room with Internal Kanban / Scrum / Gantt Modules

## Status: Deployed (MVP slice)
**Created:** 2026-04-25
**Last Updated:** 2026-04-25

## Summary
Once a project is created, the user enters its project room — a tab-based detail page covering Übersicht, Planung, Backlog, Stakeholder, Mitglieder, Historie, Einstellungen. Inside the Backlog tab, internal Kanban and Scrum board views work without external tools; the Planning tab gives a Gantt-flavored phase/milestone/work-package view. Adds the Risikoregister and Budget modules as further project-room cards. Inherits V2 EP-05.

## Dependencies
- Requires: PROJ-2 (Project CRUD)
- Requires: PROJ-4 (Platform Foundation: project nav)
- Requires: PROJ-6 (Rule engine for active modules)
- Requires: PROJ-9 (Work item metamodel) — backlog/board reads from it
- Influences: PROJ-11 (Resources) — Gantt resource bars feed in later

## V2 Reference Material
- **Epic file:** `~/projects/Projeketplattform_v2_D.U/planning/epics/ep-05-projektraum-und-interne-module.md`
- **Stories:** `~/projects/Projeketplattform_v2_D.U/planning/stories/ep-05.md` (ST-01 project room shell, ST-02 Kanban, ST-03 Scrum, ST-04 Gantt, F4.2 risks, F4.5 budget, ST-05 portfolio Gantt, ST-06 health traffic light)
- **ADRs:** `docs/decisions/project-room.md`, `docs/decisions/backlog-board-view.md`
- **V2 code paths to study during /architecture and /backend:**
  - `apps/web/app/projects/[id]/page.tsx` — V2's tab-based room
  - `apps/web/app/projects/[id]/components/Backlog/` — list+board toggle, arrow-button card movement
  - `apps/api/src/projektplattform_api/routers/work_items.py` — backlog filter + status PATCH
  - `apps/api/src/projektplattform_api/routers/risks.py`, `budget.py` — risk register + budget endpoints
  - `apps/api/src/projektplattform_api/services/health.py` — traffic-light formula

## User Stories
- **[V2 EP-05-ST-01]** As a user, I want a project room to appear automatically after project creation so that I can immediately work inside the project.
- **[V2 EP-05-ST-02]** As a user, I want an internal Kanban board so that I can run projects without external tools.
- **[V2 EP-05-ST-03]** As a user, I want an internal Scrum structure (Backlog + Sprint reference) so I can run agile projects without external tools.
- **[V2 EP-05-ST-04]** As a user, I want an internal Gantt so that classical projects are time-plannable inside the platform.
- **[V2 F4.2]** As a project lead, I want to capture, score, and track risks with mitigations so that risks are centrally visible and steerable.
- **[V2 F4.5]** As a project lead, I want to manage the project budget envelope, line items, and consumption so that budget deviations show up early.
- **[V2 EP-05-ST-05]** As a tenant admin or PMO, I want a portfolio-Gantt across all projects so that I see schedule conflicts at a glance.
- **[V2 EP-05-ST-06]** As a project lead or PMO, I want a green/yellow/red health traffic light per project derived from risk score, milestone slip, and budget burn so that I see where to act.

## Acceptance Criteria

### Project room shell
- [ ] After project creation the user lands on the project room (`/projects/[id]?tab=overview`).
- [ ] Default tabs: Übersicht, Planung, Backlog, Stakeholder, Mitglieder, Historie, Einstellungen.
- [ ] Tabs are URL-bound (`?tab=…`).
- [ ] Tab visibility is gated by `active_modules` from the rule engine (PROJ-6).
- [ ] Cross-tenant access → 404; missing project membership → 403 (per PROJ-4 RBAC).

### Kanban board (Backlog tab → Board view toggle)
- [ ] Backlog tab has List/Board toggle.
- [ ] Board has at least 5 columns mapping to `WorkItemStatus` enum (`offen → in_progress → blockiert → erledigt → abgebrochen`).
- [ ] Cards have left/right arrow buttons that PATCH status to prev/next enum value.
- [ ] Status changes are auto-audited (PROJ-10 hook).
- [ ] Filter chip strip shows only kinds present in the current project.

### Scrum structure
- [ ] Optional `sprints` table: `id, tenant_id, project_id, name, start_date, end_date, is_active`.
- [ ] `work_items.sprint_id` (nullable FK to sprints).
- [ ] Backlog list view groups by sprint (or "no sprint").
- [ ] Epic → Story → Task hierarchy is visible via parent links.
- [ ] Bugs visible in Scrum context.

### Gantt structure
- [ ] Planning tab renders a time axis showing phases, milestones, and work_packages.
- [ ] Each Gantt entity has start + end date (work_packages: `planned_start`/`planned_end`; phases: `planned_start`/`planned_end`; milestones: `target_date`).
- [ ] At least one finish-to-start dependency between two entities is storable.
- [ ] Schedule changes update the view after save.

### Risk register (F4.2)
- [ ] Table `risks` with: `id, tenant_id, project_id, title, description, probability (1-5), impact (1-5), score (computed), mitigation, status (open/mitigated/accepted/closed), responsible_user_id, created_at, updated_at`.
- [ ] CRUD endpoints + UI tab/card.
- [ ] Status changes are audited (PROJ-10).
- [ ] CSV export of the risk list.

### Budget module (F4.5)
- [ ] Table `budget_items` with: `id, tenant_id, project_id, category, planned_amount_cents, actual_amount_cents, currency, notes, created_at, updated_at`.
- [ ] Aggregate budget = sum of planned; consumption = sum of actual.
- [ ] Traffic-light: yellow at >80% consumed, red at >100%.
- [ ] CRUD + audit.
- [ ] CSV/PDF export.

### Portfolio Gantt (EP-05-ST-05)
- [ ] `/reports/portfolio-gantt` (admin/PMO only) renders one bar per project (start = min phase start, end = max milestone target_date).
- [ ] Filters: project type, method, lifecycle status, time range.
- [ ] Read-only; PNG + CSV export.

### Health traffic light (EP-05-ST-06)
- [ ] Server function computes per-project health from: risk score (≥12 → red, ≥8 → yellow, else green), milestone slippage (>14 days overdue → red, >0 → yellow), budget burn (>100% → red, >80% → yellow).
- [ ] Total health = max severity across the three dimensions.
- [ ] Health appears in `/projects` list and on portfolio Gantt.
- [ ] Tooltip explains which dimension drove the color.

## Edge Cases
- **Cross-tenant project access** → 404 (RLS).
- **Empty project** (no work items, no risks, no budget) → all dimensions return green; tabs render empty states with helpful CTAs.
- **Method changed mid-project** → board column visibility unchanged; only kind filter chips adjust.
- **A risk with score ≥12 but status `closed`** → does not drive red health (only open/active risks count).
- **A user without `risks` module access** → tab hidden + API returns 404 (per PROJ-17 module gating).
- **Portfolio Gantt requested by a tenant_member without PMO role** → 403; falls back to admin-only.

## Technical Requirements
- **Stack:** Next.js 16 + Supabase, shadcn/ui (`Tabs`, `Card`, `Table`, `Tooltip`, `Badge`). For Gantt: a lightweight library (e.g. `gantt-task-react`) or hand-rolled timeline; decide in /architecture.
- **Multi-tenant:** Every new table (`sprints`, `risks`, `budget_items`, plus future) MUST have `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`. RLS uses `is_tenant_member(tenant_id)` and `is_project_member(project_id)` (from PROJ-4).
- **Validation:** Zod schemas at API boundaries.
- **Auth:** Supabase Auth; project role checks (project_lead/editor/viewer from PROJ-4).
- **Performance:** Backlog board: use index on `(project_id, status, kind)`. Health computation: cache per project for 60s; recompute on write to risks/budget/milestones.
- **Audit hook:** Status changes trigger PROJ-10 audit (or its hook signal table).

## Out of Scope (deferred or explicit non-goals)
- WIP limits on Kanban.
- Drag-and-drop card movement (arrow buttons in v1; DnD when sort within column matters).
- Velocity / burndown charts.
- Resource swimlanes on Gantt (PROJ-11 work).
- Approval gates on phases (later governance epic).
- Per-tenant configurable health thresholds (deferred).

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### 1. Kurzantwort

**Ein gemeinsames Core-Datenmodell** (Phasen, Work Items, Stakeholder-Verknüpfungen) **plus eine Method-Config-Registry**, die pro Methode die sichtbaren Tabs, Modul-Reihenfolge und KI-Vorschlagstypen festlegt. **Keine drei parallelen Daten-Stacks** — das wäre Wartungstod. Eine `work_items`-Tabelle mit `kind`-Diskriminator (epic / feature / story / task / work_package / phase) trägt alle drei Methoden. Die Method-Config liest zur Render-Zeit, **welche Kinds in welchem Tab und in welcher Reihenfolge** angezeigt werden.

Sidebar-Navigation: globale Top-Nav bleibt; **Project-Room-Sidebar wandert auf die linke Seite, kollapsibel**. Inhalt der Sidebar wird method-driven aus der Config geladen.

### 2. Rendering-Matrix Scrum vs. PMI vs. Waterfall

| Bereich / Tab | Scrum | PMI / Prince2 | Waterfall |
|---|---|---|---|
| **Top-Bar (Header)** | Sprint-Selector + Burndown-Mini | Phasen-Leiste (horizontale Stages) | Phasen-Leiste (sequenziell, mit Fortschritts-Pfeil) |
| **Linke Sidebar — kollapsibel** | Backlog · Sprint-Board · Releases · Velocity · KI-Vorschläge · Stakeholder · Risiken · Budget | Phasen · Arbeitspakete · Meilensteine · Gantt · KI-Vorschläge · Stakeholder · Risiken · Budget | Phasen · Arbeitspakete · Abhängigkeiten · Gantt · Meilensteine · KI-Vorschläge · Stakeholder · Risiken · Budget |
| **Default Center View** | Sprint-Board (Kanban des aktiven Sprints) | Aktuelle Phase mit Work-Package-Liste | Gantt mit aktivem Phasen-Highlight |
| **Sekundär-View (Toggle)** | Backlog-Liste / Roadmap-Gantt | Gantt / WBS-Tree | WBS-Tree / Phase-Detail |
| **Card-Inhalt der Items** | Story-Card mit Acceptance Criteria, Story Points, Sprint-Tag | Work-Package-Card mit %-Fortschritt, Verantwortlichem, Aufwand | Work-Package-Card mit Vorgänger/Nachfolger, Deadline, Slack |
| **Method-spezifische Rituale-Card** (im Übersichts-Tab) | Sprint-Planning, Daily, Review, Retro | Phase-Gate, Lessons Learned, Meilenstein-Review | Sign-off pro Phase, Change-Request |
| **KI-Vorschläge — erlaubte Kinds** | Epic, Feature, Story, Task | Phase, Arbeitspaket, Meilenstein, To-do | Phase, Arbeitspaket, Abhängigkeit, Meilenstein |

**Gemeinsam genutzte Komponenten:**
- ProjectRoomShell + Sidebar (PROJ-4)
- KPI-Karten (Budget, Risk Count, Health), Stakeholder-Liste, Mitglieder-Tab, Historie-Tab — alle method-agnostisch
- WorkItemCard mit method-aware-Slots (Story-Points-Slot vs. WP-Aufwand-Slot)
- AI-Proposal-Inbox (PROJ-12)

**Method-spezifisch (eigene Components):**
- ScrumBoard (Sprint-aktiv-Filter), SprintSelector, BurndownChart
- PhaseTimelineBar (sequenziell, Top-Header), PhaseGateDialog
- GanttChart (geteilt zwischen PMI + Waterfall, mit Mode-Flag für Abhängigkeits-Linien)
- DependencyGraph (Waterfall + PMI optional)

### 3. Datenmodell je Methode (alles auf gemeinsamem Core)

| Methode | Genutzte Kinds aus `work_items` | Ergänzende Tabellen |
|---|---|---|
| **Scrum** | epic, feature, story, task, bug | sprints, sprint_assignments |
| **PMI** | phase, work_package, milestone, task | (keine, Gantt rein berechnet) |
| **Waterfall** | phase, work_package, milestone, task | dependencies (zwischen work_packages) |

`work_items` ist STI (per V2 ADR `work-item-metamodel.md`). Method-Spezifika wie Story Points oder Slack leben als optionale Spalten oder im JSON-Feld `attributes JSONB`.

### 4. Tabellenübersicht

| Tabelle | Zweck | Methode | Beziehung | Neu/Erweiterung |
|---|---|---|---|---|
| `phases` | Projekt-Phasen (Stages) | PMI, Waterfall | FK → projects | **NEU** (PROJ-19 baut, hier referenziert) |
| `milestones` | Meilensteine in Phasen | alle 3 | FK → projects, FK phase nullable | **NEU** (PROJ-19) |
| `work_items` | STI: Epic/Feature/Story/Task/WorkPackage/Phase | alle 3 | FK → projects, parent_id self-FK, attributes JSONB | **NEU** (PROJ-9) |
| `sprints` | Scrum-Sprints | Scrum | FK → projects | **NEU** |
| `sprint_assignments` | Items im Sprint | Scrum | FK → sprints, FK → work_items | **NEU** |
| `dependencies` | Vorgänger-Nachfolger | Waterfall + PMI | FK predecessor + successor → work_items, type FS/SS/FF/SF | **NEU** (Teil PROJ-7 oder PROJ-19) |
| `project_method_configs` | Pro-Projekt geladene Method-Config (cached, P1) | alle 3 | FK → projects, JSONB | **NEU — V1 nicht nötig**, später Override-Mechanik |
| `method_templates` | **Code-Registry**: Default-Configs pro Methode | alle 3 | – | **NEU als Code** (`src/lib/method-templates/`, nicht DB) |
| `risks` | Risikoregister | alle 3 | FK → projects, optional FK work_item_id | **NEU** (PROJ-19/20) |
| `budgets` | Budget-Positionen | alle 3 | FK → projects | **NEU** |
| `project_stakeholders` | Junction Stakeholder ↔ Projekt | alle 3 | FK → projects, FK → stakeholders | **NEU** (PROJ-8) |
| `work_item_stakeholders` | Junction Stakeholder ↔ Work Item | alle 3 | FK → work_items, FK → project_stakeholders | **NEU — wichtig für KI-Auto-Zuordnung** |
| `ai_proposals` | KI-Vorschlags-Layer | alle 3 | target_table + target_row_id | bereits in ADR `v3-ai-proposal-architecture.md` definiert |
| `projects` | Projekt-Methode | alle 3 | bestehende Tabelle | **ERWEITERUNG**: `project_method TEXT NOT NULL DEFAULT 'general'` mit CHECK in scrum/pmi/waterfall/safe/general |

### 5. Dashboard-Konfigurationslogik

**Wie das System die Methode erkennt:**
- `projects.project_method` ist die einzige Quelle der Wahrheit (CHECK-Constraint enforced).
- Default: `'general'` (zeigt eine pragmatische Mischung aus Phasen + Backlog).
- Bei Projekterstellung wählt der User die Methode aus einem Dropdown — Pflichtfeld (oder `general` als Fallback).

**Wie das System daraus die Dashboard-Config lädt:**
- Eine **Code-Registry** `src/lib/method-templates/` enthält je Methode eine TypeScript-Konstante:
  ```
  scrum.ts → { tabs, sidebarSections, defaultCenterView, allowedAiKinds, workItemKindsVisible, hasSprints, ... }
  pmi.ts → { ... }
  waterfall.ts → { ... }
  general.ts → { ... }
  ```
- Alle Configs erfüllen den TS-Typ `MethodConfig`.
- Beim Öffnen des Project Rooms liest der Server-Component `projects.project_method` und resolved daraus die Config:
  ```
  const config = METHOD_TEMPLATES[project.project_method] ?? METHOD_TEMPLATES.general
  ```
- Die Config wird via Context an die Tab-Komponenten + Sidebar gereicht.
- **`project_method_configs`-Tabelle** ist nur dann nötig, wenn ein Tenant-Override gewünscht ist (z.B. „in unserem Tenant heißt 'Sprint' immer 'Iteration'"). Das ist **P1**, nicht V1. Für V1: Code-Registry only.

**Wie wird verhindert, dass jede Methode komplett eigene Logik bekommt:**
- **Eine Render-Engine, viele Configs.** `<ProjectRoomDashboard config={config}>` rendert generisch — Sidebar-Items werden iteriert; Tab-Inhalte bekommen die `allowedKinds` als Prop und filtern die `work_items`-Query entsprechend.
- **Method-spezifische UIs nur dort, wo's wirklich nötig ist** (Sprint-Burndown, Phase-Gate-Dialog). Diese werden conditional gerendert: `{config.hasSprints && <ScrumBoard />}`.
- **Keine if/else-Hells in 50 Komponenten.** Jeder Schalter geht durch die Config.

### 6. KI-Zuordnungslogik

**Welche Objekte die KI je Methode erzeugen darf** — über `config.allowedAiKinds`:

| Methode | `allowedAiKinds` |
|---|---|
| Scrum | `['epic', 'feature', 'story', 'task', 'bug']` |
| PMI | `['phase', 'work_package', 'milestone', 'task']` |
| Waterfall | `['phase', 'work_package', 'milestone', 'dependency']` |
| general | `['epic', 'work_package', 'task', 'milestone']` (pragmatischer Mix) |

**Wie KI-Vorschläge zugeordnet werden — kombinierte Heuristik:**

1. **Topic Embeddings**: Beim Speichern eines AI-Proposals (in `ai_proposals.proposed_payload.title + description`) wird ein Embedding-Vektor berechnet (Claude oder local model je nach `data_class` per ADR `data-privacy-classification`).
2. **Parent-Suggestion**: Die Edge Function vergleicht das Embedding mit allen offenen `work_items` desselben Projekts. Bei Cosine-Similarity ≥ 0.78 wird `proposed_payload.parent_id_suggestion` gesetzt — eine **Empfehlung**, kein automatisches Setzen.
3. **Reviewer entscheidet**: Im Review-UI sieht der Mensch „Möchtest du dieser Story als Sub-Task von Epic X zuweisen?" mit Confidence-Score. Accept setzt `parent_id`.
4. **Fallback**: Ohne Parent-Suggestion landet der Vorschlag auf der Top-Ebene des relevanten Tabs (Scrum: Backlog ohne Sprint; PMI/Waterfall: ohne Phase).

**Stakeholder-Auto-Verknüpfung:**

1. Bei jedem AI-Proposal mit `target_table='work_items'` ruft die Edge Function eine Heuristik auf:
   - Match `proposed_payload.description` gegen `project_stakeholders` (Skills, Rollen, Verantwortungsbereiche).
   - Beste 1–3 Matches werden als **Vorschläge** in `proposed_payload.suggested_stakeholders[]` (UUIDs aus `project_stakeholders`) abgelegt.
2. Beim Accept eines Proposals werden die ausgewählten Stakeholder per `work_item_stakeholders` (Junction) verknüpft. Default: alle vorgeschlagenen, mit Häkchen zum Abwählen.
3. **Wichtig**: Stakeholder werden **nicht silent** zugewiesen. Reviewer sieht sie, kann abwählen — entspricht ADR `architecture-principles` „AI as proposal layer".

**Methodenabhängige Stakeholder-Verknüpfung (`config.stakeholderAttachableKinds`):**
- **Scrum**: Stakeholder werden Stories/Tasks zugewiesen, **nicht** Epics (Epics sind grobgranular).
- **PMI / Waterfall**: Stakeholder werden Work Packages oder Milestones zugewiesen.

### 7. Architekturentscheidung für V1

**Empfehlung: Einheitliches Core-Datenmodell + Method-Config-Registry. Keine getrennten Tabellen je Methode.**

| Argument | Einheitliches Core | Getrennte Tabellen |
|---|---|---|
| Tenant wechselt Methode mid-project | ✅ trivial (`project_method` flippen) | ❌ Datenmigration |
| Reporting über alle Projekte (Portfolio-View) | ✅ ein `union all` über `work_items` | ❌ N union-Joins |
| KI-Modell trainiert auf welcher Tabelle | ✅ einer | ❌ N |
| Neue Methode hinzufügen (z.B. SAFe) | ✅ neue Config-Datei + ggf. CHECK-Update | ❌ neue Tabellen, neue RLS, neue API |
| Pro-Methode-spezifische Konsistenz | 🟡 via Triggers + JSON-Schema | ✅ via NOT NULL |
| Migration-Komplexität bei V1 | ✅ niedrig | ❌ hoch |

**V1-Scope für PROJ-7:**
- ✅ `projects.project_method` Spalte + CHECK + UI im Create-Wizard
- ✅ `src/lib/method-templates/` Code-Registry mit `scrum`, `pmi`, `waterfall`, `general`
- ✅ `<ProjectRoomDashboard config={config}>` mit kollapsibler **linker Sidebar**, method-driven Sidebar-Sections + Top-Header (Phasen-Bar / Sprint-Selector je nach Methode)
- ✅ Übersichts-Tab mit Health-KPIs + method-spezifischer Rituale-Card
- ✅ Verbindung zu PROJ-9 (Backlog) + PROJ-19 (Phasen) + PROJ-8 (Stakeholders) — als Stubs falls jene Features noch nicht stehen

**V1 NICHT:**
- ❌ Sprint-Engine (eigenes PROJ oder Teil von PROJ-9)
- ❌ Echte Gantt-Kalkulation mit Critical Path (V1 nutzt simple Render-Variante aus dem Mockup)
- ❌ Tenant-Override für Method-Configs (`project_method_configs`-Tabelle)
- ❌ KI-Embedding-Stakeholder-Matcher (kommt in PROJ-12)

**Skalierung:** Sobald ein 4ter/5ter Methoden-Typ landet (SAFe, V-Modell XT 2.0), wird die Code-Registry zur Convention — eine Methode = ein File. Wenn ein Tenant pro-Methode-Felder anders haben will, kommt `project_method_configs` als Override-Tabelle dazu (Schicht 2 aus ADR `v3-master-data-and-global-catalogs`). Das Datenmodell bleibt stabil; nur die Configs wachsen.

### 8. Out of Scope (deferred)

- Real-Time Multi-User-Editing in Boards (P1 mit Supabase Realtime)
- Mobile-Responsive Gantt (separates Sub-Feature)
- Drag-and-Drop für Card-Movement (per ADR `backlog-board-view` ist Arrow-Button-Movement das V1-Ziel)
- Method-Auto-Detection (KI rät die Methode aus dem Projekt-Kontext) — explizit Nicht-AK, zu fehleranfällig

### 9. Trade-offs

| Trade-off | Gewählt | Warum okay |
|---|---|---|
| Code-Registry vs. DB-Config | Code für V1 | Method-Configs ändern sich rein per App-Release; Tenant-Overrides kommen später |
| `work_items` STI vs. getrennte Tabellen | STI mit `kind`-CHECK + `attributes JSONB` | Reporting + KI vereinfachen es; Method-Wechsel ist trivial |
| Sidebar-Default-Zustand | **expanded** auf Desktop, **collapsed** auf Mobile | Discoverability auf großem Screen, Platz auf kleinem |
| KI-Stakeholder-Auto-Assign | **Vorschlag** mit User-Zustimmung, nie silent | ADR `architecture-principles` — niemals automatische Mutation ohne Review |
| `project_method` als TEXT+CHECK vs ENUM | TEXT + CHECK | Einfacher zu erweitern (Migration der CHECK statt ALTER TYPE) |

## Implementation Notes
_To be added by /frontend and /backend_

## QA Test Results

**Date:** 2026-04-28  
**Tester:** /qa (combined pass with PROJ-9 + PROJ-19)  
**Environment:** Supabase project `iqerihohwabyjzkpcujq`, Next.js dev build.

### Scope of this pass
This QA covers the **MVP increment of PROJ-7** that has actually been built:
- Project Room shell (tab nav, method-aware sidebar + header, layout)
- `projects.project_method` column + CHECK constraint
- Method-config TypeScript registry under `src/lib/method-templates/`

**Out of scope** (deferred to dedicated future passes — these features have NOT been implemented yet):
- Risk register (F4.2)
- Budget module (F4.5)
- Portfolio Gantt (EP-05-ST-05)
- Health traffic-light formula (EP-05-ST-06) — only a scaffold component exists
- Live Gantt rendering library on the Planning tab (current implementation is a tree view per Tech Design)

### Automated checks
| Suite | Result |
|---|---|
| `npx tsc --noEmit` | ✅ clean |
| `npm test` | ✅ 76/76 |
| `npm run build` | ✅ compiles |

### Live database smoke tests via Supabase MCP
| Check | Result |
|---|---|
| `projects.project_method` column exists | ✅ |
| `projects_project_method_check` CHECK over 6 valid values | ✅ |
| Default value `'general'` for existing rows | ✅ (default applied at column add) |

### Acceptance criteria walkthrough
| AC | Status | Notes |
|---|---|---|
| Land on project room after creation | ✅ | `/projects/[id]` route loads via `layout.tsx` + RLS-scoped lookup. |
| Default tabs (Übersicht, Planung, Backlog, Stakeholder, Mitglieder, Historie, Einstellungen) | ✅ | Subroutes exist as folders under `/projects/[id]/`. |
| Tabs URL-bound | 🟡 **Path-based, not query-string** | Spec said `?tab=…`; implementation uses Next.js path routing (`/projects/[id]/backlog`). Functionally equivalent and more idiomatic; accepted as intentional deviation. |
| Tab visibility gated by `active_modules` (PROJ-6) | ⚪ Deferred | PROJ-6 rule engine not yet built; method-template registry partially substitutes. |
| Cross-tenant access → 404 | ✅ | RLS-scoped lookup in layout.tsx → `notFound()`. |
| Backlog tab List/Board toggle | ✅ | `BacklogToolbar` view-toggle. |
| Board ≥ 5 columns mapped to `WorkItemStatus` enum | ✅ | `backlog-board.tsx` iterates `WORK_ITEM_STATUSES` (5 values: todo / in_progress / blocked / done / cancelled). |
| Arrow buttons PATCH status | ✅ | Now wired to `/api/projects/[id]/work-items/[wid]/status` (PROJ-9 backend). |
| Filter chips show kinds present in current method | ✅ | `kindsForMethod()` from `src/lib/work-items/method-context.ts`. |
| `sprints` table + `work_items.sprint_id` | ✅ | Shipped via PROJ-9 migration. |
| Backlog list view groups by sprint | ✅ | `backlog-list.tsx`. |
| Epic → Story → Task hierarchy visible | ✅ | `backlog-tree.tsx`. |
| Bugs visible in Scrum context | ✅ | Cross-method bug filter via partial index + UI chip. |
| Risk register / Budget / Portfolio Gantt / Health formula | ⚪ | Out of scope for this increment. |

### Method-config registry sanity
- `src/lib/method-templates/{scrum,kanban,safe,waterfall,pmi,general}.ts` exist; barrel export in `index.ts`.
- `useCurrentProjectMethod` reads `projects.project_method` with graceful fallback to `'general'`.

### Bugs & findings
**No Critical or High bugs.**

| Severity | ID | Finding |
|---|---|---|
| Medium | M1 | Same as PROJ-9 M1 — trigger-only SECURITY DEFINER PostgREST exposure (system-wide; tracked once). |
| Low | L1 | Path vs query-string tab routing deviation from spec — verify the user is OK with the path-based approach (it's the better choice, just inconsistent with the spec text). |
| Info | I1 | Risk register, Budget, Portfolio Gantt, Health traffic light all unimplemented — spec scope larger than this MVP increment. Recommend splitting these into PROJ-7-risks, PROJ-7-budget, PROJ-7-portfolio specs in a future grooming pass. |

### Production-ready decision
**READY for the shipped increment** (project room shell + method-aware UI + `project_method` column). Risk/Budget/Portfolio/Health remain unbuilt and need their own /requirements + /architecture + build passes before claiming the full PROJ-7 spec is delivered.

## Deployment

- **Date deployed:** 2026-04-28
- **Production URL:** https://projektplattform-v3.vercel.app
- **Git tag:** `v0.1.0-mvp-backbone`
- **Deviations:**
  - Added Coming-Soon stub pages for 4 sidebar entries pointing to features that aren't built yet (risiken → PROJ-20, ai-proposals → PROJ-12, governance → PROJ-18, abhaengigkeiten → PROJ-9 UI). Tracked in commit `2fa73fb`.
  - Trimmed duplicate-route sections from 7 method templates (safe, scrum, kanban, vxt2, pmi, prince2, waterfall) until the underlying backlog/planung pages honor query / sub-tab modes. Affected sections: Epics & Features, Sprint-Board, Velocity, Meilensteine, Arbeitspakete, Board, Gantt. Tracked in commit `2fa73fb`.
  - Sidebar active-state detector now honors query strings (`isActiveSection` extension in `method-sidebar.tsx`). Tracked in commit `2fa73fb`.
