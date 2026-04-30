# PROJ-27: Cross-Project Work-Item Links + Sub-Project Bridge

## Status: Architected
**Created:** 2026-05-01
**Last Updated:** 2026-05-01

## Summary
Heute kann ein Work-Item nur zu einem anderen Work-Item im **selben Projekt** verknüpft werden (PROJ-9 `dependencies` mit `enforce_dependency_same_project`-Trigger). Damit ist der zentrale Anwendungsfall **"übergeordnetes Wasserfall-Projekt mit Scrum-Sub-Projekt für die Umsetzung"** nicht modellierbar — ein Arbeitspaket im Waterfall-Parent kann keine Verbindung zu einem Epic / Story im Scrum-Sub-Projekt aufbauen.

Diese Spec führt eine zweite, semantisch reichere Verknüpfungsschicht ein: `work_item_links` mit OpenProject-inspirierten Typen (`relates`, `blocks/blocked`, `precedes/follows`, `duplicates/duplicated`, `includes/partof`, `requires/required` + V3-eigener Typ `delivers/delivered_by` für die Waterfall→Scrum-Brücke). Cross-Project ist ausdrücklich erlaubt, aber **hybrid abgesichert**: innerhalb der Parent-Child-Hierarchie automatisch, außerhalb mit 1-Klick-Bestätigung des Ziel-Projekt-Leads.

Die Spec liefert zusätzlich den UX-Pfad **"Aus Arbeitspaket → Sub-Projekt anlegen"** — der häufigste Einstieg in den Hybrid-Use-Case.

## Dependencies
- Requires: PROJ-6 (`parent_project_id` self-FK + Method-Lock — Sub-Projekte existieren bereits strukturell)
- Requires: PROJ-9 (`work_items`-Metamodell, `dependencies`-Tabelle als Vergleichspunkt)
- Requires: PROJ-26 (Method-Gating: ohne diese Härtung wäre die Sub-Project-Bridge inkonsistent — ein Sub-Scrum-Projekt mit versehentlichen Phasen würde den Punkt zerstören)
- Influences: PROJ-7 (Project-Room: neuer "Verknüpfungen"-Tab oder -Panel im Work-Item-Detail), PROJ-12 (KI kann Cross-Links als Vorschläge erzeugen), PROJ-21 (Status-Reports rollen Cross-Project-Abhängigkeiten in Executive-Summary)

## V2 Reference Material
- **Epic file:** N/A — V2 hatte keine Cross-Project-Verknüpfungen modelliert. Die Anforderung kommt aus dem realen Hybrid-Use-Case (Wasserfall-Parent + Scrum-Subteam).
- **OpenProject reference (`docs/Wissen/`):**
  - `relation.rb` — `Relation`-Modell mit `TYPES`-Hash (relates / follows / blocks / duplicates / includes / requires + reverse pairs); `MAX_LAG = 2_000`; `before_validation :reverse_if_needed` für kanonische Speicherung
  - `wp_relations_concern.rb` — `has_many`-Assoziationen pro Typ + `visible(user)` mit `work_package_focus_scope` für Sicherheit/Performance
  - `wp_scope_relatable.rb` — `relatable`-Scope mit komplexer rekursiver CTE für Zyklus-Erkennung über Hierarchie-Grenzen + `Setting.cross_project_work_package_relations` Toggle
  - `project.rb` — `workspace_type` enum (`project | program | portfolio`) + `ALLOWED_PARENT_WORKSPACE_TYPES` Matrix
  - `projects_hierarchy.rb` — Nested-Set (lft/rgt) für effizienten Hierarchie-Tree
  - `OpenProject_Reference_Patterns_Full.md` + `openproject_tech_design.md` — kuratierte Zusammenfassung der Patterns
- **V3 code paths to study during /backend:**
  - `supabase/migrations/20260428110000_proj9_work_items_sprints_dependencies.sql` — bestehender `dependencies`-Trigger, Cycle-Prevention-Pattern (`prevent_dependency_cycle`)
  - `supabase/migrations/20260428140000_proj6_method_lock_and_subprojects.sql` — `parent_project_id`, `enforce_parent_project_in_tenant`, Hierarchie-Tiefen-Trigger
  - `src/types/work-item.ts` — Vorlage für TS-Registry-Pattern

## User Stories
- **As a project lead in a Waterfall-Projekt**, I want to mark a work_package as "delivered by" a Scrum-Sub-Project (or a specific Story therein), so that the Gantt and the Status-Report show progress from the Scrum-Layer rolled up.
- **As a project lead**, I want to create a Sub-Project directly from an Arbeitspaket-Detailansicht — the wizard pre-fills name + method = Scrum + the link `WP delivers Sub-Project`, so the Hybrid-Setup ist 2-Klicks statt 10.
- **As a Scrum-Subteam-Lead**, I want my Stories to show "Liefert an: WP-007 (Wasserfall-Parent)" so my team understands the upstream context.
- **As a project lead in Project A**, I want to link a Story in Project A to a Story in unrelated Project B (e.g. a Software-Plattform-Story to an ERP-Migration-Story); the link should require **Bestätigung des Project-B-Leads**, weil B nicht in meiner Hierarchie liegt.
- **As a project member without access to the linked-to project**, I want to see a placeholder ("Verknüpft mit Item in nicht zugänglichem Projekt") rather than seeing the link disappear silently — Transparenz, kein Information Hiding.
- **As a developer**, I want OpenProject's `relates / blocks / precedes / duplicates / includes / requires` Relation-Typen + V3's `delivers` als zentrale Konstante, mit `reverse_if_needed`-Speicherung — so dass die Datenbank einen kanonischen Eintrag pro Beziehung hat, nicht zwei symmetrische.

## Acceptance Criteria

### Datenmodell `work_item_links`
- [ ] Tabelle `work_item_links`: `id, tenant_id, from_work_item_id, to_work_item_id, from_project_id (denormalized for RLS), to_project_id (denormalized for RLS), link_type, lag_days (nullable, default null), approval_state ('approved' | 'pending' | 'rejected'), approved_by (nullable FK profiles), approved_at (nullable), created_by, created_at, updated_at`.
- [ ] CHECK-Constraint auf `link_type` IN (`relates, precedes, follows, blocks, blocked, duplicates, duplicated, includes, partof, requires, required, delivers, delivered_by`).
- [ ] CHECK `from_work_item_id <> to_work_item_id` (kein Self-Link).
- [ ] CHECK `lag_days BETWEEN -2000 AND 2000 OR lag_days IS NULL` (mirror OpenProject MAX_LAG).
- [ ] UNIQUE `(from_work_item_id, to_work_item_id)` — nur **eine** Beziehung zwischen jedem Paar (OpenProject-"single relation"-Regel).
- [ ] Indexes: `(from_work_item_id, link_type)`, `(to_work_item_id, link_type)`, `(from_project_id)`, `(to_project_id)`, partial `(approval_state) WHERE approval_state = 'pending'`.

### Kanonische Speicherung (Reverse-Pairs)
- [ ] Eine Konstante `LINK_TYPE_PAIRS` in `src/lib/work-items/link-types.ts` listet die symmetrischen Paare: `(precedes ↔ follows), (blocks ↔ blocked), (duplicates ↔ duplicated), (includes ↔ partof), (requires ↔ required), (delivers ↔ delivered_by)`. `relates` ist symmetrisch ohne Reverse.
- [ ] API-Layer normalisiert vor INSERT: wenn `link_type` ein Reverse-Token ist (z.B. `follows`, `blocked`, `delivered_by`), werden `from`/`to` getauscht und der kanonische Token gespeichert (mirror OpenProject `reverse_if_needed`).
- [ ] Lese-API gibt das Label perspektivisch zurück: aus Sicht von Item X heißt `delivers` "Liefert an" und `delivered_by` "Wird geliefert von".

### Visibility-Strategie (Hybrid)
- [ ] Zwei Sichtbarkeits-Regimes:
  - **Innerhalb der Hierarchie (parent ↔ child via `parent_project_id`)**: Link wird mit `approval_state = 'approved'` direkt erstellt — ohne Bestätigung des anderen Lead.
  - **Außerhalb der Hierarchie (Sibling-Projekte, unverknüpfte Projekte im selben Tenant)**: Link wird mit `approval_state = 'pending'` erstellt; ein Notification + Inbox-Eintrag entsteht beim Ziel-Projekt-Lead. Nur nach Approve wird der Link in beiden Projekten als wirksam angezeigt.
- [ ] **Cross-Tenant ist hart geblockt** durch DB-Trigger `enforce_link_same_tenant`.
- [ ] DB-Trigger `enforce_link_hierarchy_or_pending`: prüft beim INSERT, ob `from`/`to` in derselben Hierarchie liegen; wenn ja → `approval_state = 'approved'` ist erlaubt; wenn nein → erzwingt `approval_state = 'pending'`.

### Approval-Workflow
- [ ] `POST /api/projects/[id]/work-item-links/[lid]/approve` — nur Project-Lead des Ziel-Projekts darf approven; setzt `approval_state = 'approved'`, `approved_by`, `approved_at`.
- [ ] `POST /api/projects/[id]/work-item-links/[lid]/reject` — analog; setzt `approval_state = 'rejected'` und löscht den Link nach 30-Tage-Soft-Window (oder hart auf User-Wunsch).
- [ ] Notification (PROJ-13) feuert beim Erstellen eines `pending`-Links: "Project Lead von <Project B>: <User X> hat eine Verknüpfung von <Item> zu deinem <Item> angefragt."
- [ ] Inbox-View `/projects/[id]/links/inbox` listet pending-Links zur Approval.

### Cross-Project-Sichtbarkeit + Schutz
- [ ] Lese-Sichtbarkeit beidseitig: User muss in **beiden** Projekten Member sein, um Detail-Daten zu sehen. Sonst Placeholder "Verknüpft mit Item in nicht zugänglichem Projekt — Titel verborgen" + nur Project-Name/-ID.
- [ ] RLS-Policies auf `work_item_links` SELECT: `is_project_member(from_project_id) OR is_project_member(to_project_id)` — Sichtbarkeit beidseitig, aber **getrennte Detail-Joins** im Server-Layer für Item-Titel.
- [ ] RLS INSERT: User muss `is_project_member(from_project_id)` sein; `to_project_id`-Mitgliedschaft ist **nicht** zwingend, weil der Hybrid-Workflow Pending-Approval-Mechanik auffängt.
- [ ] Cycle-Prevention: rekursive CTE prüft Zyklen über `work_item_links` + `work_items.parent_id` (intra-project hierarchy) gemeinsam — Pattern aus OpenProject `wp_scope_relatable.rb` adaptiert auf Postgres.

### Sub-Project-Bridge (UX-Quick-Action)
- [ ] Im Work-Item-Detail-Drawer (PROJ-9 UI) erscheint für `kind = 'work_package'` ein Button "Sub-Projekt für Umsetzung anlegen".
- [ ] Klick öffnet einen 2-Step-Wizard:
  - **Step 1:** Projekt-Name (Vorbelegt: "<WP-Title> — Umsetzung"), Methode (Default: Scrum, Auswahl Scrum / Kanban / SAFe), Methode-Lock-Hinweis aus PROJ-6.
  - **Step 2:** Auto-Aktion: erstellt das Sub-Projekt mit `parent_project_id = <parent>`, Methode-set, Bootstrap-Lead-Member; erstellt einen `work_item_links`-Eintrag `(from = WP, to = NULL, link_type = 'delivers', target = whole-project)` ODER (Variante): legt ein Default-Epic im Sub-Projekt an + Link `WP delivers Epic`.
- [ ] Nach Anlage zeigt der WP einen Banner "Wird geliefert von Sub-Projekt <Name> (Scrum, X Stories offen)" mit Sprung-Link.
- [ ] Im Sub-Projekt-Room zeigt ein Banner oben "Dieses Projekt liefert <WP-Title> in <Parent-Project>" mit Sprung-Link nach oben.

### Project-zu-Project Link (zusätzlich zu Item-zu-Item)
- [ ] Variant des `work_item_links`-Modells: `to_work_item_id IS NULL` ist erlaubt, wenn `link_type = 'delivers'` und `to_project_id` gesetzt — bedeutet: "WP wird geliefert vom **gesamten** Sub-Projekt".
- [ ] CHECK: `to_work_item_id IS NOT NULL OR (link_type = 'delivers' AND to_project_id IS NOT NULL)`.
- [ ] UNIQUE-Constraint berücksichtigt diese Variante: `UNIQUE (from_work_item_id, to_project_id) WHERE to_work_item_id IS NULL`.

### Tests
- [ ] Vitest: `LINK_TYPE_PAIRS` + Helper `canonicalLinkType(linkType)` — Drift fail loud.
- [ ] Live-MCP-Smoke-Tests:
  - Cross-Project-Link in Hierarchie → approved
  - Cross-Project-Link out-of-hierarchy → pending
  - Cross-Tenant → blockt mit ERRCODE
  - Self-Link → CHECK-violation
  - Doppelte Beziehung (zwei Links zwischen demselben Paar) → UNIQUE-violation
  - Zyklus über Hierarchie + Link → recursive-CTE-Trigger blockt
- [ ] E2E-Test (Playwright): Sub-Project-Bridge-Wizard end-to-end.

## Edge Cases
- **WP wird gelöscht, das Sub-Projekt existiert weiter** → Link `WP delivers Sub-Project` wird via FK ON DELETE CASCADE entfernt; das Sub-Projekt verliert nur den Banner, bleibt sonst funktional. PMO kann es nachträglich an einen anderen WP rebinden.
- **Sub-Projekt wird gelöscht, der WP bleibt** → Link wird ON DELETE CASCADE auf `to_project_id` entfernt; WP zeigt "Verknüpfung wurde entfernt" + Vorschlag, einen neuen Link zu setzen.
- **Cross-Project-Link, beide Projekte sind in der Hierarchie aber max-depth = 2 ist verletzt** → kann nicht passieren, weil PROJ-6 die Hierarchie auf 2 Ebenen begrenzt; der Link an sich ist nicht von Tiefe abhängig.
- **User ist nur in Project B Member, nicht in Project A; sieht den Link aber via Project B** → Detail-Daten von Project A werden im Frontend ausgegraut (Placeholder); kein Information-Leak.
- **Approval-Inbox ist leer, weil der Ziel-Project-Lead nicht reagiert** → nach 14 Tagen automatischer Reminder (PROJ-13); nach 30 Tagen ohne Antwort wird der Pending-Link auf `expired` gesetzt (separater Cron-Job, in PROJ-27 nicht V1).
- **Reverse-Token wird per API-PATCH eingereicht** (z.B. User schickt `link_type: 'follows'`) → API normalisiert vor Insert, speichert kanonisches `precedes` mit getauschten from/to. Der Lese-Layer rendert perspektivisch korrekt.
- **`relates` zwischen einem Item und seinem direkten Parent** → erlaubt; `relates` hat keine Hierarchie-Sperre (OpenProject's "single relation"-Regel reicht).
- **Cycle: WP-A delivers Story-B in Sub-Project; Story-B has parent Epic-C; Epic-C requires WP-A** → recursive CTE erkennt den 3-Knoten-Zyklus und blockt das letzte INSERT.
- **VXT2-Projekt** → kann sowohl als Parent (Top-Wasserfall-Anteil) als auch als Child (Bottom-Scrum-Anteil) auftreten; PROJ-27-Logik ist methodenagnostisch.
- **Method-Lock greift bei Sub-Project-Bridge** → der Wizard muss eine Methode setzen; danach hard-locked (PROJ-6).

## Technical Requirements
- **Stack:** Next.js 16 + Supabase. Supabase Realtime für Approval-Notifications optional (Notification über PROJ-13 reicht).
- **Multi-tenant:** `tenant_id NOT NULL` auf `work_item_links`. Cross-Tenant-Trigger blockt explizit. RLS nutzt `is_tenant_member` + `is_project_member`-Helpers aus PROJ-1/PROJ-4.
- **Validation:** Zod-Schema validiert `link_type`-Enum + Reverse-Token-Liste; API-Layer normalisiert kanonisch.
- **Auth:** RLS + API-pre-checks (`requireProjectAccess`). Approve/Reject erfordert `project_lead`-Rolle im Ziel-Projekt.
- **Performance:** `from_work_item_id`-Index + `to_work_item_id`-Index decken die Lookup-Hot-Paths. Cycle-Detection-CTE ist begrenzt auf einen Subgraph (max 2 Hierarchie-Ebenen × N Links pro Item) — empirisch < 10ms für realistische Project-Größen.
- **Audit:** Jede Mutation (Create / Approve / Reject / Delete) hookt PROJ-10's Audit-Layer (sobald PROJ-10 deployed; bis dahin lokales `work_item_link_events`-Table als Mini-Audit).

## Out of Scope (deferred or explicit non-goals)
- **Schedule-Computation über Cross-Project-Links hinweg** (z.B. eine `precedes`-Beziehung zwischen Items in unterschiedlichen Projekten beeinflusst den Gantt des anderen) — Designentscheidung deferred bis PROJ-21 / PROJ-25 Gantt-Erweiterung. V1 visualisiert Cross-Links nur als statische Markierung.
- **Workspace-Type-Enum** (`project | program | portfolio` à la OpenProject) — V3 hat heute nur `parent_project_id`-Hierarchie; das Workspace-Konzept ist eine größere Erweiterung und kommt frühestens mit Portfolio-Management-Spec (Future-PROJ).
- **Closure-Table für Projekt-Hierarchie** (à la OpenProject `acts_as_nested_set` / `has_closure_tree`) — bei max-depth = 2 sind rekursive CTEs trivial; Closure-Table erst sinnvoll bei tieferer Hierarchie.
- **3+ Ebenen Sub-Projekte** — gehört zu PROJ-6's Roadmap, nicht hier.
- **Tenant-übergreifende Links** (z.B. Lieferantenkette zwischen zwei Tenants) — explizit Nicht-AK; Cross-Tenant-Sharing ist eine Mega-Feature-Decision.
- **KI-vorgeschlagene Cross-Links** — gehört zu PROJ-12's Erweiterung, nicht hier.
- **Bulk-Link-Operationen** (z.B. "alle Stories in Sprint 7 → liefert WP-007") — V1 ist Single-Link; Bulk später.
- **Visualisierung als Graph-View** über mehrere Projekte hinweg — späterer UX-Step.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

> **Authored:** 2026-05-01 · **Author:** /architecture skill
> **Audience:** PM + dev team. No code blocks; structural references only.

### 0. Why this is a separate spec (and the cleanest cut against PROJ-9)

PROJ-9 deployed `dependencies` als **Same-Project-Scheduling-Tabelle** mit FS/SS/FF/SF + `lag_days` und einem strikten `enforce_dependency_same_project`-Trigger. Diese Tabelle ist **explizit Gantt-orientiert** und behält ihre Rolle.

PROJ-27 fügt eine **zweite, semantisch reichere Beziehungs-Schicht** hinzu — `work_item_links` —, die OpenProject-inspiriert ist und Cross-Project erlaubt. Die Trennung hat drei Gründe:
1. Existing-Code-Compat — `dependencies` ist deployed (PROJ-9), bricht keine UI/API.
2. Klare Semantik — `dependencies` = Scheduling-Predecessor/Successor; `work_item_links` = generelle Beziehung (relates, blocks, delivers, …).
3. Migration-Pfad — falls langfristig Konsolidierung gewünscht ist (Option B unten), ist das ein separater Cleanup-Spec mit eigenem QA.

OpenProject hat alles in einer `relations`-Tabelle (inkl. `precedes/follows`); V3 V1 trennt es. Eine Future-Konsolidierung ist explizit als Out-of-Scope notiert.

### 1. What gets built (component view)

```
PROJ-27
+-- TypeScript-Registry
|   +-- src/lib/work-items/link-types.ts
|       +-- LINK_TYPES                    <- alle 13 Typen incl. Reverse-Pairs
|       +-- LINK_TYPE_PAIRS               <- (precedes ↔ follows), (blocks ↔ blocked), …
|       +-- canonicalLinkType()           <- normalisiert Reverse → Canonical
|       +-- LINK_TYPE_LABELS              <- DE-Bezeichner perspektivisch (from-Sicht / to-Sicht)
|
+-- Database (Supabase migration)
|   +-- supabase/migrations/202605xxxxxxxx_proj27_work_item_links.sql
|       +-- CREATE TABLE work_item_links  <- neue Tabelle (siehe § 2)
|       +-- 5 indexes (siehe § 2)
|       +-- enforce_link_same_tenant trigger          <- Cross-Tenant blocken
|       +-- enforce_link_hierarchy_or_pending trigger <- Hybrid-Approval
|       +-- prevent_link_cycle trigger                <- recursive CTE über Links + Hierarchie
|       +-- canonicalize_link_type trigger            <- BEFORE INSERT, reverse_if_needed
|       +-- RLS enable + 4 policies
|       +-- ACL hardening (search_path = public, pg_temp; REVOKE EXECUTE)
|
+-- API
|   +-- POST /api/projects/[id]/work-item-links                     create (canonicalize + hybrid-policy)
|   +-- GET  /api/projects/[id]/work-item-links                     list (eigene Project-Sicht, beide Richtungen)
|   +-- GET  /api/projects/[id]/work-items/[wid]/links              detail (alle Links eines Items, perspektivisch)
|   +-- DELETE /api/projects/[id]/work-item-links/[lid]             delete
|   +-- POST /api/projects/[id]/work-item-links/[lid]/approve       approve (lead only)
|   +-- POST /api/projects/[id]/work-item-links/[lid]/reject        reject (lead only)
|   +-- GET  /api/projects/[id]/links/inbox                         pending-Links für Approval
|
+-- Sub-Project-Bridge (UX-Quick-Action)
|   +-- src/components/work-items/create-subproject-from-wp-dialog.tsx
|       +-- 2-Step-Wizard: Name + Methode → Auto-create Sub-Project + Link
|   +-- src/components/projects/parent-project-banner.tsx
|       +-- "Dieses Projekt liefert <WP> in <Parent>" — sichtbar im Sub-Projekt
|   +-- src/components/work-items/delivered-by-banner.tsx
|       +-- "Wird geliefert von Sub-Projekt <Name> (Scrum, X Stories offen)"
|   +-- POST /api/projects (existing)
|       +-- bekommt optional `bootstrap_link_from_work_item_id` Parameter, der den ersten
|           work_item_links-Eintrag direkt mit anlegt
|
+-- Frontend (Visualisierung)
|   +-- src/components/work-items/work-item-detail-drawer.tsx
|       +-- "Verknüpfungen"-Tab: Liste der Links perspektivisch (eingehend / ausgehend)
|       +-- "+"-Button: Link erstellen (mit Item-Picker, der Cross-Project erlaubt)
|   +-- src/components/work-items/cross-project-link-badge.tsx
|       +-- visuelles Badge: Item-Titel, Project-Name, Approval-Status
|   +-- src/app/(app)/projects/[id]/links/inbox/page.tsx
|       +-- Inbox-View für Project-Leads
|
+-- Tests
    +-- src/lib/work-items/link-types.test.ts                    <- canonicalize / pairs
    +-- API-Route-Tests (mocked Supabase) für 7 Endpoints
    +-- Live-MCP-Tests: Cross-Tenant blockt, Hierarchie auto-approved, Sibling pending,
                       Self-Link blockt, Duplicate UNIQUE blockt, Cycle CTE blockt
    +-- Playwright E2E: Sub-Project-Bridge-Wizard end-to-end
```

### 2. Data model in plain language

**Eine neue Tabelle `work_item_links`:**

| Spalte | Typ | Notiz |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID NOT NULL | FK tenants ON DELETE CASCADE — denormalisiert für RLS |
| `from_work_item_id` | UUID NOT NULL | FK work_items ON DELETE CASCADE |
| `to_work_item_id` | UUID NULLABLE | FK work_items ON DELETE CASCADE — **null** erlaubt für `delivers`-Links zum gesamten Sub-Projekt |
| `from_project_id` | UUID NOT NULL | denormalisiert; via Trigger aus `from_work_item_id` befüllt; für RLS + Indexe |
| `to_project_id` | UUID NULLABLE | denormalisiert; via Trigger aus `to_work_item_id` ODER explizit gesetzt für `delivers (whole-project)` |
| `link_type` | TEXT NOT NULL | CHECK in 13 Werten (siehe Registry) — gespeichert wird IMMER der kanonische Token |
| `lag_days` | INTEGER NULLABLE | nur sinnvoll für `precedes`/`follows`; CHECK BETWEEN -2000 AND 2000 OR NULL (mirror OpenProject) |
| `approval_state` | TEXT NOT NULL | DEFAULT `'approved'`; CHECK in `(approved, pending, rejected)` |
| `approved_by` | UUID NULLABLE | FK profiles |
| `approved_at` | TIMESTAMPTZ NULLABLE | |
| `created_by` | UUID NOT NULL | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

**Indexe:**
- UNIQUE `(from_work_item_id, to_work_item_id) WHERE to_work_item_id IS NOT NULL` — OpenProject-"single relation"-Regel
- UNIQUE `(from_work_item_id, to_project_id) WHERE to_work_item_id IS NULL AND link_type = 'delivers'` — pro WP nur **ein** Whole-Project-`delivers`-Link
- `(from_work_item_id, link_type)` — Lookup "alle ausgehenden Links eines Items, gruppiert nach Typ"
- `(to_work_item_id, link_type)` — Lookup "alle eingehenden Links eines Items"
- `(from_project_id)`, `(to_project_id)` — Cross-Project-Joins
- partial `(approval_state) WHERE approval_state = 'pending'` — Inbox-View hot path

**Constraints (Trigger + CHECK):**
- `from_work_item_id <> to_work_item_id` (CHECK)
- `from.tenant_id = to.tenant_id` (Trigger `enforce_link_same_tenant`)
- Hierarchie-vs-Pending (Trigger `enforce_link_hierarchy_or_pending`):
  - Wenn `from_project_id` = `to_project_id` → `approval_state = approved` automatisch (Same-Project-Link, kein Approval nötig)
  - Wenn beide Projekte in derselben Hierarchie (parent ↔ child via `parent_project_id`) → `approval_state = approved`
  - Sonst → erzwinge `approval_state = pending`
- Cycle-Prevention (Trigger `prevent_link_cycle`): rekursive CTE walked sowohl `work_item_links` als auch `work_items.parent_id` (intra-project hierarchy) und prüft, ob der neue Link einen Zyklus schließt
- Canonical-Storage (Trigger `canonicalize_link_type`): wenn der Eingangs-`link_type` ein Reverse-Token ist (`follows`, `blocked`, `duplicated`, `partof`, `required`, `delivered_by`), tausche `from`/`to` und ersetze `link_type` durch den kanonischen Token

### 3. Relation-Type-Registry (TypeScript + Spiegel-SQL)

| Token | Reverse | Symmetrisch | Bedeutung | Methodenagnostisch |
|---|---|---|---|---|
| `relates` | (selbst) | ja | Generischer Bezug, keine Richtungslogik | ja |
| `precedes` | `follows` | nein | from finished → to starts (Scheduling-Dep, äquivalent zu `dependencies`-FS) | ja |
| `blocks` | `blocked` | nein | from blockt to (kein zeitlicher Constraint, nur Status-Ausdruck) | ja |
| `duplicates` | `duplicated` | nein | from ist Duplikat von to (Mergens-Hinweis) | ja |
| `includes` | `partof` | nein | from enthält to als Teil (semantisch, nicht Hierarchie) | ja |
| `requires` | `required` | nein | from braucht to als Vorbedingung | ja |
| **`delivers`** | **`delivered_by`** | nein | **V3-spezifisch:** from (Wasserfall-WP) wird durch to (Scrum-Story / -Epic / ganzes Sub-Projekt) umgesetzt | ja, aber Hauptzweck ist Hybrid-Use-Case |

`relates` ist das einzige symmetrische Token; alle anderen kommen als Paar.

### 4. Visibility-Strategie im Detail

**Drei Sicherheitsschichten:**

1. **Tenant-Boundary** (hart, Trigger):
   `from_work_item.tenant_id` MUSS gleich `to_work_item.tenant_id` (oder `to_project.tenant_id` für Whole-Project-Links) sein. Verstoß → `RAISE EXCEPTION 'cross_tenant_link_not_allowed'`. Cross-Tenant-Sharing ist explizit Out-of-Scope.

2. **Hybrid-Approval** (Hierarchie-Detection im Trigger):
   - Same-Project (`from_project_id = to_project_id`) → kein Approval; default `approved`.
   - Parent-Child-Hierarchie (`from.parent_project_id = to.id` ODER `to.parent_project_id = from.id`, jeweils über `from_project_id`/`to_project_id`) → kein Approval; default `approved`. Sub-Project-Bridge ist genau dieser Pfad.
   - Sonst → der Trigger setzt `approval_state = pending` und feuert `pg_notify('cross_project_link_pending', payload)` (PROJ-13 abonniert für Notifications).

3. **RLS-Sichtbarkeit beidseitig:**
   - SELECT auf einen Link benötigt `is_project_member(from_project_id) OR is_project_member(to_project_id)` — wer in einem der beiden Projekte Mitglied ist, sieht den Link.
   - **Aber**: das Frontend joined die Item-Titel separat über die normalen `work_items`-Selects — und die sind via PROJ-9-RLS strikt project-scoped. Folge: ein User, der nur in Project B ist, sieht den Link, aber bekommt für das Project-A-Item nur ein Placeholder-Object zurück (keine Title-Daten).
   - INSERT erfordert `is_project_member(from_project_id)`; das Approval-Mechanismus deckt den `to`-Side ab.
   - APPROVE / REJECT erfordert `has_project_role(to_project_id, 'lead')`.

### 5. Tech decisions (the why)

| Entscheidung | Wahl | Grund |
|---|---|---|
| Neue Tabelle vs. Erweiterung von `dependencies` | neue Tabelle `work_item_links` | PROJ-9 ist deployed; Erweiterung wäre Breaking-Change. Semantisch sind Scheduling-Dependencies und allgemeine Beziehungen unterschiedlich — OpenProject hat sie zwar in einer Tabelle, aber V3 kann das später konsolidieren (Future-Cleanup-Spec). |
| 13 Link-Types von OpenProject übernommen + 1 V3-eigener (`delivers`) | übernehmen | OpenProject-Set ist ausgereift, deckt fast alle realen Use-Cases. `delivers` ist V3-Spezifikum für den Hybrid-Use-Case und macht den UX-Pfad explizit. |
| Kanonische Speicherung (Reverse → Canonical) | übernehmen aus OpenProject | Vermeidet duplizierte Beziehungs-Einträge ("A blocks B" und "B blocked A" wären zwei Datensätze ohne Normalisierung). UNIQUE-Constraint funktioniert nur kanonisch. |
| `lag_days` direkt in `work_item_links` | ja | OpenProject hat es auch dort; spart eine separate Scheduling-Spalte. Wird nur für `precedes`-Typ wirklich genutzt; CHECK -2000…2000 mirror OpenProject. |
| Cross-Project-Approval-Strategie: Hybrid | per User-Vorgabe | Auto-Approve bei klarer Hierarchie ist UX-freundlich; Sibling-Cross-Approval verhindert versehentliche Verkopplung zwischen unverbundenen Projekten. |
| `to_work_item_id NULLABLE` für Whole-Project-`delivers` | ja | Spart eine zweite Tabelle; UNIQUE-Constraint mit Partial-Index regelt die "max 1 Whole-Project-Lieferung pro WP"-Regel. |
| `tenant_id` denormalisiert auf `work_item_links` | ja | Einheitliches RLS-Pattern (PROJ-1, PROJ-9). |
| `from_project_id`/`to_project_id` denormalisiert | ja | Index + RLS-Performance; Trigger `populate_link_project_ids` setzt sie aus `work_items` automatisch. |
| Cycle-Detection als rekursive CTE im Trigger | ja | OpenProject-`relatable`-Scope ist die ausgereifte Vorlage. Bei max-depth-2-Hierarchie + realistischer Link-Anzahl (< 100 pro Project) ist CTE < 10ms. |
| Workspace-Type-Enum (project/program/portfolio) jetzt einführen? | nein, deferred | Nicht im User-Use-Case; PROJ-6 hat `parent_project_id` mit max-depth-2 — reicht für Hybrid-Setup. Workspace-Type ist eine größere Erweiterung (Portfolio-Spec). |
| Sub-Project-Bridge als eigene Quick-Action vs. allgemeiner Link-Dialog | dedizierte Quick-Action | Hybrid-Use-Case ist häufig und hat einen klaren UX-Wert; ein generischer Link-Dialog wäre 5+ Klicks statt 2. |
| Notification über PROJ-13 vs. Realtime | PROJ-13 | PROJ-13 ist Communication-Center; Realtime ist Komfort. PROJ-27-V1 nutzt Email/In-App-Notification, Realtime kann später als Polish kommen. |

### 6. Adapt vs. discard from OpenProject

| OpenProject-Pattern | V3-Adaption |
|---|---|
| `Relation`-Typen-Tabelle (`relates`, `precedes`, …) | **adopted** + V3-spezifisches `delivers` ergänzt |
| `MAX_LAG = 2000` | **adopted** als CHECK-Constraint |
| `before_validation :reverse_if_needed` | **adopted** als BEFORE-INSERT-Trigger `canonicalize_link_type` |
| `WorkPackages::Scopes::Relatable` rekursive CTE | **adopted** (vereinfacht) als `prevent_link_cycle`-Trigger; OpenProject's "Ancestor/descendant"-Regel wird über `work_items.parent_id` mitgewalkt |
| `Setting.cross_project_work_package_relations` (globaler Toggle) | **abgelehnt** — V3 nutzt stattdessen Hybrid-Hierarchie-Policy (siehe § 4). Globaler Toggle widerspricht dem Multi-Tenant-Modell. |
| `acts_as_nested_set` für Project-Hierarchie (Nested-Set lft/rgt) | **abgelehnt** — V3 hat max-depth-2; rekursive CTE über `parent_project_id` reicht. Closure-Table als Future-Option, wenn Tiefe wächst. |
| `has_closure_tree` für WorkPackage-Hierarchie | **abgelehnt** — V3 hat `work_items.parent_id` self-FK + Cycle-Trigger (PROJ-9). Reicht für max realistische Tiefen. |
| `workspace_type` enum (project/program/portfolio) + `ALLOWED_PARENT_WORKSPACE_TYPES` Matrix | **deferred** — interessantes Konzept für Portfolio-Management, aber V3 hat heute nur 2 Hierarchie-Ebenen. Future-Spec. |
| `Type` HABTM `Project` (Custom-Types pro Projekt) | **abgelehnt** — V3 hat Code-Registry (`WORK_ITEM_KINDS`) für Konsistenz und KI-Trainings-Stabilität (PROJ-6 Tech Design § 3). Tenant-Override später via PROJ-16. |
| `WorkPackage::Ancestors` Concern mit Visibility-Filter | **adopted im Geist** — V3-RLS macht das implizit; explizite "ancestors visible to user" Helper kommt in PROJ-27 als API-Layer-Funktion. |

### 7. Public API (vollständig)

| Endpoint | Auth | Verhalten |
|---|---|---|
| `POST /api/projects/[id]/work-item-links` | `is_project_member(from_project_id)` | Erstellt Link. Trigger normalisiert, prüft Tenant, setzt approval_state per Hybrid-Policy. |
| `GET /api/projects/[id]/work-item-links` | project member | Listet alle Links, in denen `id` either `from` or `to` Projekt ist. Cross-Project-Items werden mit Placeholder-Daten gerendert, wenn der User keinen Zugriff auf das andere Projekt hat. |
| `GET /api/projects/[id]/work-items/[wid]/links` | project member | Detail: alle Links eines Items, perspektivisch (`outgoing` / `incoming` / `pending_approval`). |
| `DELETE /api/projects/[id]/work-item-links/[lid]` | `from`-creator OR `from`-project-lead | Löscht Link. Hard-delete (kein Soft-Delete; Audit-Hook läuft). |
| `POST /api/projects/[id]/work-item-links/[lid]/approve` | `has_project_role(to_project_id, 'lead')` | Setzt `approval_state = approved` + `approved_by/at`. |
| `POST /api/projects/[id]/work-item-links/[lid]/reject` | `has_project_role(to_project_id, 'lead')` | Setzt `approval_state = rejected`; nach 30 Tagen Cleanup. |
| `GET /api/projects/[id]/links/inbox` | `has_project_role(id, 'lead')` | Pending-Approval-Liste für den Lead. |
| `POST /api/projects` (existing, **erweitert**) | unverändert | Optionaler `bootstrap_link_from_work_item_id` Parameter — wenn gesetzt, wird nach Project-Create und Lead-Bootstrap ein `work_item_links`-Eintrag `from = WP, to = NULL, link_type = delivers, to_project_id = new_project.id` mit `approval_state = approved` (Hierarchie!) erstellt. |

### 8. Migration plan (Supabase)

**Eine Migration in zwei Phasen:**

**Phase 1 — Tabelle + Constraints + Indexes:**
1. CREATE TABLE `work_item_links` (siehe § 2)
2. 5 Indexes + 2 partial UNIQUE constraints
3. CHECK constraints (link_type enum, lag_days range, self-link, link-target-shape)

**Phase 2 — Trigger + RLS + ACL:**
4. `populate_link_project_ids()` BEFORE INSERT — befüllt `from_project_id`/`to_project_id` aus den joined work_items
5. `enforce_link_same_tenant()` BEFORE INSERT — Cross-Tenant blocken
6. `canonicalize_link_type()` BEFORE INSERT — Reverse-Token → kanonisch + from/to swap
7. `enforce_link_hierarchy_or_pending()` BEFORE INSERT — Hybrid-Approval-Policy
8. `prevent_link_cycle()` BEFORE INSERT/UPDATE — rekursive CTE über Links + work_items.parent_id
9. RLS aktivieren + 4 Policies (SELECT/INSERT/UPDATE/DELETE)
10. ACL hardening (search_path = public, pg_temp; REVOKE EXECUTE FROM public/anon/authenticated für die 5 Trigger-Funktionen)
11. Optional: `pg_notify('cross_project_link_pending', payload)` im Hybrid-Trigger für PROJ-13-Subscription

**Reihenfolge ist wichtig**: alle Trigger-Funktionen müssen vor den Trigger-Wirings existieren; RLS muss nach Trigger-Setup aktiviert werden.

### 9. What changes outside PROJ-27 (kleine Erweiterungen)

- `src/components/work-items/work-item-detail-drawer.tsx` (PROJ-9-UI) — neuer "Verknüpfungen"-Tab
- `src/components/projects/project-room-shell.tsx` (PROJ-7) — Banner-Slot oben für `delivered-by`-Banner und `parent-project-banner`
- `src/app/api/projects/route.ts` (PROJ-2) — optionaler `bootstrap_link_from_work_item_id` Parameter
- `src/lib/notifications/` (PROJ-13, falls deployed) — neuer Notification-Type `cross_project_link_pending`

### 10. Tests

| Test | Where | What |
|---|---|---|
| Link-type-pairs + canonicalize | `src/lib/work-items/link-types.test.ts` | Alle 13 Tokens, alle 6 Reverse-Pairs, `relates` als Symmetrisch-Special |
| API tests (mocked Supabase) | 7 endpoint files | happy path × Hybrid-Policy × cross-tenant × cycle × duplicate |
| Live MCP red-team | manuell, dokumentiert | siehe AC § Tests |
| E2E Sub-Project-Bridge | `tests/PROJ-27-subproject-bridge.spec.ts` | end-to-end: WP-Detail → "Sub-Projekt anlegen" → Wizard → Link-Banner sichtbar in beiden Rooms |

### 11. Risk + trade-off summary

| Risiko | Mitigation |
|---|---|
| Cycle-Detection-CTE wird bei sehr großen Projekten langsam | max-depth-2 + realistische Link-Counts halten es < 10ms; Index auf `from_work_item_id`/`to_work_item_id` deckt Walk. Falls je problematisch: Materialized-View oder Closure-Table als Future-Spec. |
| Hybrid-Approval-Policy ist subtil ("warum braucht *dieser* Link Approval, *jener* nicht?") | UI-Banner im Link-Dialog erklärt klar: "Innerhalb deiner Projekt-Hierarchie — sofort wirksam. Außerhalb — wartet auf Bestätigung von <Lead-Name>." |
| `to_work_item_id IS NULL` für Whole-Project-Links macht das Modell hybrid (item-zu-item ODER item-zu-projekt) | UNIQUE-Constraints mit partial-index regeln die Kollisionen sauber; CHECK erzwingt entweder oder. Komplexitäts-Aufschlag akzeptiert für klarere Semantik. |
| Approval-Inbox wird ignoriert; Pending-Links verstauben | 14-Tage-Reminder + 30-Tage-Auto-Expire (in PROJ-27 als deferred, kann V1.5 nachgeschoben werden) |
| User verwechselt `delivers` mit `precedes` | UI-Tooltip + DE-Label "Liefert an" / "Wird geliefert von" sind eindeutig; `precedes` heißt "Geht voran" / "Folgt nach" — andere semantische Domain. |
| OpenProject-Patterns sind GPL-3 lizenziert | V3 adaptiert nur Konzepte (Datenmodell-Schema, Validation-Logik), kein Code-Copy; das ist legitim. ADR-Eintrag dokumentiert Inspiration. |
| Migration auf Existing-Database mit aktivem `dependencies` | `work_item_links` ist additiv; `dependencies`-Tabelle wird nicht angefasst. Zero-downtime. Future-Konsolidierung (Option B) bekommt eigenen Spec. |
| User legt zwei Links zwischen demselben Paar (z.B. `relates` + `delivers`) | UNIQUE `(from_work_item_id, to_work_item_id)` blockt — OpenProject's "single relation"-Regel. User-Meldung: "Es existiert bereits eine Verknüpfung — bearbeite den Typ direkt." |

### 12. Out of scope (deferred — explicitly named)

- **Workspace-Type-Enum** (project/program/portfolio) — Future-Spec
- **3+ Hierarchie-Ebenen** — PROJ-6-Roadmap
- **Closure-Table für Project-Hierarchie** — wenn Tiefe wächst
- **Cross-Project-Schedule-Computation** (Cross-Link beeinflusst Gantt) — PROJ-21 / PROJ-25
- **Bulk-Link-Operationen** — V1 ist Single-Link
- **KI-vorgeschlagene Cross-Links** — PROJ-12-Erweiterung
- **Tenant-übergreifende Links** — explicit non-goal
- **Konsolidierung von `dependencies` und `work_item_links`** in eine Tabelle — Future-Cleanup-Spec
- **30-Tage-Auto-Expire-Cron für Pending-Links** — V1.5
- **Realtime-Notifications** — V1 nutzt PROJ-13 (Email/In-App)

## Implementation Notes
_To be added by /backend and /frontend_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
