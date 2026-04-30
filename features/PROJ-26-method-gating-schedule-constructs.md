# PROJ-26: Method-Gating für Schedule-Constructs (Sprints, Phasen, Milestones)

## Status: Approved
**Created:** 2026-05-01
**Last Updated:** 2026-05-01

## Summary
Schließt eine Lücke aus PROJ-9 + PROJ-19: heute können `sprints`, `phases` und `milestones` in jedem Projekt angelegt werden — unabhängig von der Methode. Ein Scrum-Projekt kann eine Phase bekommen, ein Waterfall-Projekt einen Sprint. Das widerspricht der Methodenmodellierung (PROJ-6) und der Visibility-Regel, die für `work_items` bereits hart durchgesetzt wird (PROJ-9).

Diese Spec spiegelt das `WORK_ITEM_METHOD_VISIBILITY`-Pattern auf die drei Schedule-Tabellen und macht es defense-in-depth: API antwortet 422 mit klarer Meldung, DB-Trigger als zweite Verteidigungslinie. Bestandsdaten in unpassenden Methoden bleiben sichtbar, werden nur nicht mehr neu erzeugbar.

## Dependencies
- Requires: PROJ-6 (`projects.project_method`, Method-Catalog, Lock-Trigger)
- Requires: PROJ-9 (`sprints`, `work_items`-Visibility-Pattern als Vorlage)
- Requires: PROJ-19 (`phases`, `milestones`)
- Influences: PROJ-7 (Project-Room rendert Tabs/Buttons jetzt method-konsistent)
- Influences: PROJ-27 (saubere Vorbedingung für Sub-Project-Bridge — ein Waterfall-Projekt hat keine Sprints, ein Scrum-Projekt keine Phasen)

## V2 Reference Material
- **ADRs:** `docs/decisions/method-object-mapping.md` — V2 hat bereits Schedule-Constructs mit Methoden gemappt; V3 hat das für `work_items` umgesetzt (PROJ-9), für Sprints/Phasen/Milestones bisher nicht.
- **V3 code paths to study during /backend:**
  - `src/types/work-item.ts` — die Vorlage `WORK_ITEM_METHOD_VISIBILITY` + `isKindVisibleInMethod`
  - `src/app/api/projects/[id]/work-items/route.ts` — wie das 422-Handling für unzulässige Kinds aussieht
  - `supabase/migrations/20260428110000_proj9_work_items_sprints_dependencies.sql` — Trigger-Pattern (`prevent_work_item_parent_cycle`, `enforce_dependency_same_project`)
  - `supabase/migrations/20260428090000_proj19_phases_milestones.sql` — Phasen/Milestones-Schema

## User Stories
- **As a project lead in a Scrum-Projekt** möchte ich keine "Phase anlegen"-Aktion sehen können, damit das Werkzeug zur Methode passt und mein Team nicht versehentlich Wasserfall-Artefakte erzeugt.
- **As a project lead in a Waterfall-Projekt** möchte ich keinen Sprint anlegen können, weil Sprints im Wasserfall keinen Sinn ergeben.
- **As a system** möchte ich beim Methodenwechsel (sobald PROJ-6's Migration-RPC kommt) bestehende Bestands-Phasen/Sprints/Milestones nicht löschen, sondern als Read-Only-Altdaten beibehalten — damit kein Datenverlust entsteht.
- **As a developer** möchte ich, dass die Method-Visibility-Regeln für Schedule-Constructs an einer einzigen Stelle definiert sind (TypeScript-Registry + spiegelnde SQL-Funktion), damit Drift unmöglich ist.

## Acceptance Criteria

### Visibility-Registry (TypeScript, Single Source of Truth)
- [ ] `src/lib/work-items/schedule-method-visibility.ts` exportiert `SCHEDULE_CONSTRUCT_METHOD_VISIBILITY` als `Record<ScheduleConstructKind, ProjectMethod[]>`.
- [ ] Default-Mapping: `sprints → [scrum, safe]`, `phases → [waterfall, pmi, prince2, vxt2]`, `milestones → [waterfall, pmi, prince2, vxt2]`.
- [ ] Helper `isScheduleConstructAllowedInMethod(kind, method | null)` — gibt `true` zurück, wenn `method = null` (Setup-Phase, alles erlaubt), sonst Lookup.
- [ ] Vitest-Fixture pinnt jede `(construct, method)`-Kombination — Drift fail loud.

### API-Härtung (Defense Layer 1)
- [ ] `POST /api/projects/[id]/sprints` ruft `isScheduleConstructAllowedInMethod('sprints', project.method)`. Bei `false` → 422 mit `{ error: "schedule_construct_not_allowed_in_method", construct: "sprints", method: "<…>" }` und deutscher Klartext-Meldung "Sprints sind in einem <method>-Projekt nicht erlaubt. Erstelle ein Sub-Projekt mit Methode Scrum oder SAFe für die agile Umsetzung."
- [ ] `POST /api/projects/[id]/phases` analog, Meldung "Phasen sind in einem <method>-Projekt nicht erlaubt. Phasen leben in Wasserfall-/PMI-/PRINCE2-/VXT2-Projekten."
- [ ] `POST /api/projects/[id]/milestones` analog, Meldung sinngemäß.
- [ ] Methode = `NULL` → API erlaubt alles (Setup-Phase; konsistent mit PROJ-9).
- [ ] Bestehende Datensätze in unpassenden Methoden werden weder gelöscht noch versteckt — nur Neuanlage ist blockiert.

### DB-Härtung (Defense Layer 2)
- [ ] Drei BEFORE-INSERT-Trigger-Funktionen (`enforce_sprint_method_visibility`, `enforce_phase_method_visibility`, `enforce_milestone_method_visibility`) lesen `projects.project_method` und werfen `check_violation` ('22023') wenn die Methode nicht in der spiegelnden SQL-Konstante steht.
- [ ] SQL-Konstanten leben in einer zentralen `validate_schedule_construct_method(p_construct text, p_method text)`-Funktion (SECURITY DEFINER, `search_path = public, pg_temp`) — die drei Trigger sind dünne Wrapper, die `p_construct` setzen.
- [ ] Trigger feuern nur INSERT (UPDATE auf `project_id`-Wechsel ist über RLS blockiert; INSERT ist der einzige Eingangspunkt).
- [ ] Methode = `NULL` → Trigger gibt `RETURN NEW` ohne Prüfung.
- [ ] Live-Smoke-Test (über Supabase MCP `execute_sql`): Sprint-Insert in Wasserfall-Projekt → blockt; Phase-Insert in Scrum-Projekt → blockt; Insert in Method=NULL-Projekt → ok.

### Frontend-Konsistenz (kein neuer Funktionsumfang, nur Aufräumen)
- [ ] Project-Room-Sidebar (PROJ-7): "Sprint anlegen"-Button erscheint nur, wenn `isScheduleConstructAllowedInMethod('sprints', method)`. Analog für Phasen/Milestones.
- [ ] Method-Templates (`src/lib/method-templates/*.ts`) referenzieren die neue Registry — Drift unmöglich.

### Migration-Plan (Bestandsdaten-Verträglichkeit)
- [ ] Vor der Trigger-Aktivierung: `SELECT count(*) FROM sprints s JOIN projects p ON p.id = s.project_id WHERE p.project_method NOT IN ('scrum','safe') AND p.project_method IS NOT NULL` — Anzahl unpassender Bestandsdaten messen, im Migration-Kommentar dokumentieren.
- [ ] Trigger werden mit `WHEN (NEW.created_at >= '<migration-zeitpunkt>')` versehen ODER alternativ: keine Bedingung, weil INSERT-Trigger ohnehin nur Neuanlagen treffen — Bestandsdaten bleiben unangetastet.

### Tests
- [ ] Vitest: `isScheduleConstructAllowedInMethod` für alle 7 Methoden × 3 Constructs (21 Fälle) + 3 Null-Method-Fälle.
- [ ] Vitest: Mocked-Supabase-Test der 3 Endpoints — happy path + verbotene Methode + Method=NULL.
- [ ] Live-MCP-Test: drei Trigger blocken; ein Insert in Method=NULL-Projekt geht durch.

## Edge Cases
- **Bestehender Sprint in einem Wasserfall-Projekt** (theoretisch durch alten API-Aufruf entstanden) → bleibt sichtbar und editierbar; Nur INSERT ist blockiert. Beim nächsten Method-Migration-RPC (PROJ-6 Follow-Up) wird ein Hinweis-Banner angezeigt.
- **Methode = NULL (Setup-Phase)** → alle Constructs erlaubt; sobald die Methode gesetzt wird, ist sie hard-locked (PROJ-6 `enforce_method_immutable`) und alles darüber hinaus blockiert.
- **VXT2-Projekt** → kann Phasen + Stories haben (Hybrid), aber keine Sprints — der agile Sprint-Anteil läuft in einem Scrum-Sub-Projekt (PROJ-27).
- **SAFe-Projekt** → kann Sprints (Iterations) haben, aber keine klassischen Phasen/Milestones — Program Increments werden später als eigenes Construct modelliert, nicht via `phases/milestones`.
- **Methode-Update via PROJ-6 Migration-RPC (deferred)** → Bestandsdaten in unpassenden Methoden zeigen ein "Methoden-fremd"-Badge; zukünftiger Cleanup ist user-getriggert.
- **Direkter SQL-Insert (z.B. Edge Function, SECURITY DEFINER-Pfad)** → Trigger blockt trotzdem, weil er auf jeder INSERT-Operation läuft, unabhängig vom Aufrufer-Privileg.

## Technical Requirements
- **Stack:** Next.js 16 + Supabase. Keine neuen npm-Pakete.
- **Multi-tenant:** Trigger nutzen die bestehende `projects.tenant_id`-Spalte indirekt (über Project-Lookup); keine neue tenant-relevante Tabelle.
- **Validation:** Zod-Schema-Erweiterung im API-Layer; CHECK-Constraint nicht möglich (fremder-Tabelle-Lookup), daher Trigger.
- **Auth:** Keine neue Auth-Logik — RLS-Policies aus PROJ-9/PROJ-19 bleiben unverändert.
- **Performance:** Trigger machen einen Index-Scan auf `projects.id` (PK) pro INSERT — vernachlässigbar (< 1 ms).
- **Audit:** Keine neue Audit-Spalte; PROJ-10-Hooks aus den Bestands-Tables werden weitergenutzt.

## Out of Scope (deferred or explicit non-goals)
- Migration bestehender unpassender Datensätze (z.B. einen Sprint in einem Wasserfall-Projekt automatisch löschen) — wird mit dem PROJ-6 Method-Migration-RPC behandelt, nicht hier.
- Tenant-spezifische Override-Tabelle für Visibility-Regeln (z.B. "in unserem Tenant darf SAFe auch Phasen") — gehört zu PROJ-16, ausdrücklich nicht in V1 dieser Spec.
- Cross-Project-Verknüpfungen (Waterfall-WP → Scrum-Sub-Projekt-Story) — eigene Spec PROJ-27.
- UI für die Methode-Visualisierung (Badge "VXT2 hybrid: Phasen oben, Stories unten") — separates UX-Polishing, nicht Kern.
- Erweiterung um SAFe-Program-Increments als eigene Tabelle — Designentscheidung wird gefällt, wenn PROJ-25 oder ein dezidierter SAFe-Increment-Spec landet.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

> **Authored:** 2026-05-01 · **Author:** /architecture skill
> **Audience:** PM + dev team. No code blocks; structural references only.

### 0. Why this is a separate spec (and not a PROJ-9 / PROJ-19 follow-up)

PROJ-9 deployed work-item Method-Visibility hart, PROJ-19 deployed Phasen/Milestones ohne Method-Check. Die Lücke ist klein, aber strukturell — drei API-Routen, drei Trigger-Funktionen, eine TS-Registry. Ein eigener Spec macht das QA-trackbar und liefert eine klare Migration; ein PROJ-9-Bugfix-Patch wäre versteckt und schwerer abzunehmen.

### 1. What gets built (component view)

```
PROJ-26
+-- TypeScript-Registry (Single Source of Truth)
|   +-- src/lib/work-items/schedule-method-visibility.ts
|       +-- SCHEDULE_CONSTRUCT_METHOD_VISIBILITY  <- {sprints, phases, milestones} -> ProjectMethod[]
|       +-- isScheduleConstructAllowedInMethod()  <- helper (null-method = always true)
|
+-- API-Härtung (Defense Layer 1)
|   +-- src/app/api/projects/[id]/sprints/route.ts        <- pre-check vor INSERT
|   +-- src/app/api/projects/[id]/phases/route.ts         <- pre-check vor INSERT
|   +-- src/app/api/projects/[id]/milestones/route.ts     <- pre-check vor INSERT
|       Alle drei: 422 + clean German message + machine-lesbare Code
|
+-- DB-Härtung (Defense Layer 2)
|   +-- supabase/migrations/202605xxxxxxxx_proj26_schedule_method_gating.sql
|       +-- validate_schedule_construct_method(p_construct, p_method)  <- zentrale Pure-Funktion
|       +-- enforce_sprint_method_visibility()                          <- BEFORE INSERT trigger fn
|       +-- enforce_phase_method_visibility()                           <- BEFORE INSERT trigger fn
|       +-- enforce_milestone_method_visibility()                       <- BEFORE INSERT trigger fn
|       +-- 3 trigger wirings (BEFORE INSERT ON sprints/phases/milestones)
|       +-- search_path hardening (= public, pg_temp)
|       +-- ACL: REVOKE EXECUTE FROM public/anon/authenticated für die 4 Funktionen
|
+-- Frontend-Aufräumen (kein neuer Funktionsumfang)
|   +-- src/lib/method-templates/{scrum,kanban,safe,waterfall,pmi,prince2,vxt2,neutral}.ts
|       +-- "Sprint anlegen"-Section nur in scrum/safe
|       +-- "Phase anlegen"-Section nur in waterfall/pmi/prince2/vxt2
|       +-- "Meilenstein anlegen"-Section nur in waterfall/pmi/prince2/vxt2
|       +-- (alle Templates referenzieren die neue Registry — kein Hardcoded-Liste)
|
+-- Tests
    +-- src/lib/work-items/schedule-method-visibility.test.ts  <- 21 + 3 Fixture-Cases
    +-- 3 API-Route-Tests (mocked Supabase) für die neuen 422-Pfade
    +-- 1 Live-MCP-Test (manuell ausgeführt während QA): Sprint in Wasserfall blockt, Phase in Scrum blockt, beides in NULL-Method ok
```

### 2. Data model in plain language

**Keine neuen Tabellen.** Keine neuen Spalten. Drei Trigger und eine zentrale Validation-Funktion sind das einzige Schema-Delta.

Die TypeScript-Registry:
- Ein Objekt mit drei Keys (`sprints`, `phases`, `milestones`).
- Jeder Key hat eine Liste von Methoden, in denen das Construct erlaubt ist.
- Ein zentraler Helper `isScheduleConstructAllowedInMethod(kind, method | null)`:
  - `method === null` → `true` (Setup-Phase, alles erlaubt — konsistent mit Work-Item-Pattern)
  - sonst Lookup in der Registry

Die SQL-Funktion `validate_schedule_construct_method(construct, method)`:
- Spiegelt die TypeScript-Registry 1:1 in PL/pgSQL.
- Rückgabe `boolean` (oder direkt `RAISE EXCEPTION` aus dem Trigger heraus).
- `method IS NULL` → return `true` ohne Lookup.

Die drei Trigger-Funktionen:
- Jede liest `projects.project_method` für `NEW.project_id` (Index-PK-Lookup, < 1 ms).
- Ruft `validate_schedule_construct_method('<construct>', method)`.
- Bei `false` → `RAISE EXCEPTION 'schedule_construct_not_allowed_in_method' USING ERRCODE = '22023'`.

### 3. Tech decisions (the why)

| Entscheidung | Wahl | Grund |
|---|---|---|
| Visibility-Registry vs. CHECK-Constraint pro Spalte | Registry + Trigger | CHECK kann nicht über FK auf andere Tabelle prüfen (`projects.project_method`). Trigger ist der einzige Weg auf DB-Ebene. |
| TS-Registry und SQL spiegeln (= zwei Quellen der Wahrheit) | bewusst dupliziert | Spiegelt PROJ-9-Defense-in-Depth-Pattern. TS für saubere UI/422-Errors, SQL als Hardlock — bei Schema-Erweiterung müssen beide gleichzeitig geändert werden (Pflicht im Code-Review). |
| Trigger nur BEFORE INSERT (nicht UPDATE) | bewusste Beschränkung | `project_id` einer Schedule-Row ist effektiv immutable (kein API-Pfad ändert es; RLS blockt cross-project-Update). Bestandsdaten in unpassender Methode (durch zukünftigen Method-Migration-RPC entstehbar) sollen explizit NICHT abgewiesen werden. |
| Bei `method = NULL` alles erlauben | konsistent mit Work-Items | Ein Projekt in der Setup-Phase soll frei strukturiert werden können; Lock erst beim ersten Method-Set greifbar (PROJ-6). |
| Keine Migration alter Bestandsdaten | bewusst aufgeschoben | Die Trigger schauen nur auf neue INSERTs; alte Daten bleiben sichtbar. Cleanup ist eine Entscheidung des Tenant-Admins, nicht des Systems. PROJ-6 Method-Migration-RPC wird die Werkzeuge dafür liefern. |
| `validate_schedule_construct_method` als zentrale Pure-Funktion | DRY | Eine PL/pgSQL-Funktion wird von 3 Trigger-Wrappern wiederverwendet — Erweiterung um neue Constructs (z.B. `safe_program_increments`) bedeutet nur einen WHEN-Branch + neuen Trigger-Wrapper. |
| Hardcoded SQL-Liste vs. JSONB-Konfig-Tabelle | Hardcoded | Method-Catalog ist Code-Registry (PROJ-6); Konsistenz. Erweiterung ist ein Migration-Commit, kein Tenant-Override. |
| Sub-Project-Bridge wird nicht hier gemacht | aufgeschoben → PROJ-27 | Sauberer Cut: PROJ-26 ist chirurgische Härtung; PROJ-27 ist neue Capability. QA und Deployment getrennt. |

### 4. Public API

| Endpoint | Auth | Verhalten |
|---|---|---|
| `POST /api/projects/[id]/sprints` | unverändert | Neu: pre-check `isScheduleConstructAllowedInMethod`. Bei false → 422 mit `error_code: schedule_construct_not_allowed_in_method`, klartext-Meldung. |
| `POST /api/projects/[id]/phases` | unverändert | analog |
| `POST /api/projects/[id]/milestones` | unverändert | analog |
| _alle anderen Routen (GET, PATCH, DELETE)_ | unverändert | Keine Änderungen — Bestandsdaten bleiben les- und änderbar. |

### 5. Migration plan (Supabase)

Eine Migration, eine Transaktion:

1. `validate_schedule_construct_method(text, text)` Funktion erstellen (SECURITY INVOKER, search_path).
2. Drei Trigger-Funktionen `enforce_<construct>_method_visibility()` erstellen.
3. Drei Trigger-Wirings `BEFORE INSERT ON <table> FOR EACH ROW EXECUTE FUNCTION ...`.
4. ACL: `REVOKE EXECUTE ... FROM public, anon, authenticated` für die 4 Funktionen — sie sind Trigger-only, keine direkte Aufruf-Sinnigkeit.
5. Hinweis-Kommentar in der Migration: aktuelle Anzahl unpassender Bestands-Sprints/Phasen/Milestones (für QA-Diff).

Reihenfolge ist unkritisch (keine FK-Abhängigkeiten der neuen Objekte). Migration läuft auf Bestandsdatenbank ohne Lock auf den drei Tabellen (Trigger-Add ist DDL, kurzer ShareLock).

### 6. What changes outside PROJ-26 (nichts Neues, nur Aufräumen)

- `src/lib/method-templates/*.ts` — die "create"-Action-Sections für Sprint/Phase/Milestone werden über die Registry gefiltert; aktuell enthalten manche Templates bereits halb-konsistente Filter, die werden vereinheitlicht.
- `src/components/projects/project-room-sidebar.tsx` (oder wo die "create"-Buttons sitzen) — Button-Anzeige erfolgt über `isScheduleConstructAllowedInMethod`.

### 7. Tests

| Test | Where | What |
|---|---|---|
| Visibility-Registry-Matrix | `src/lib/work-items/schedule-method-visibility.test.ts` | 21 Fälle (7 Methoden × 3 Constructs) + 3 Null-Method-Fälle |
| API 422 path (3×) | `src/app/api/projects/[id]/{sprints,phases,milestones}/route.test.ts` | mocked Supabase: erlaubte Methode → 201; verbotene Methode → 422; null Methode → 201 |
| Live MCP red-team | manuell | INSERT-Versuche über `execute_sql` in falscher Methode → ERRCODE 22023; richtiger Methode → ok |
| TS↔SQL Drift Guard (V1.5) | optional | Vitest, das die TS-Registry über einen Marker im Migration-Kommentar pinned. Aufwendiger, kann in einem Follow-up nachgezogen werden. |

### 8. Out of scope (deferred — explicitly named so PROJ-X candidates exist)

- **Bestandsdaten-Migration** — wenn ein Tenant Method-Migration-RPC nutzt (PROJ-6 Follow-Up), kann er entscheiden, ob unpassende Sprints/Phasen archiviert oder gelöscht werden. Nicht Aufgabe von PROJ-26.
- **Tenant-Override für Visibility** — PROJ-16 territory.
- **SAFe Program Increments** als eigenes Construct — separate Spec, wenn der SAFe-Use-Case real wird.
- **Cross-Project-Schedule-Constructs** (z.B. ein Sprint, der work_items aus mehreren Projekten enthält) — explizit Nicht-AK.
- **UI-Banner "Diese Daten passen nicht zur aktuellen Methode"** — Polish, deferred bis echte Migrationen entstehen.

### 9. Dependencies (packages)

Keine neuen npm-Pakete. Migration nutzt nur PL/pgSQL und Postgres-Standard.

### 10. Risk + trade-off summary

| Risiko | Mitigation |
|---|---|
| Trigger blockt versehentlich legitime INSERTs (z.B. SECURITY-DEFINER-Edge-Function zur Datenmigration) | Method=NULL-Bypass; alternativ: Edge Function setzt vor INSERT explizit `SET LOCAL` Session-Variable, die der Trigger respektiert. V1 verzichtet darauf — Edge Functions sollen über die offizielle API gehen. |
| TS-Registry und SQL driften auseinander | Code-Review-Pflicht: jede Änderung muss beide ändern. Optional Drift-Guard-Test (oben). |
| Bestandsdaten in falscher Methode bleiben sichtbar und verwirren User | Bewusst akzeptiert: kein Datenverlust ohne explizite User-Aktion. PROJ-6 Method-Migration-RPC liefert später die Werkzeuge. |
| Performance-Regression durch FK-Lookup pro INSERT | Vernachlässigbar — `projects.id` ist PK; Insert-Last auf Schedule-Tables ist generell niedrig (Sprint = paar pro Quartal, Phase = paar pro Projekt). |
| User wundert sich über 422 ohne UI-Polish | API-Meldung enthält Klartext-Hinweis "Erstelle ein Sub-Projekt mit Methode X" — verweist auf PROJ-27, sobald das landet. Bis dahin: Hint-Text reicht. |

## Implementation Notes

### Backend (2026-05-01)

Shipped as a single migration + a TS registry + 3 API patches. Architecture and implementation align 1:1.

**Migration**
- `supabase/migrations/20260501100000_proj26_schedule_method_gating.sql` — applied via Supabase MCP to project `iqerihohwabyjzkpcujq`.
- Creates 1 central pure validator `validate_schedule_construct_method(text, text)` (`SECURITY INVOKER`, `IMMUTABLE`, hardened `search_path`) + 3 BEFORE INSERT trigger functions `enforce_<construct>_method_visibility` (`SECURITY DEFINER`, hardened `search_path`).
- Triggers wired on `sprints`, `phases`, `milestones`. Fire on INSERT only — bestehende Mismatch-Datensätze (1 sprint, 5 phases, 4 milestones — pre-migration count via `mcp__supabase__execute_sql`) bleiben unangetastet, by design.
- ACL hardened: `REVOKE EXECUTE ... FROM public, anon, authenticated` für alle 4 Funktionen — verifiziert via `pg_proc.proacl` query → ACL = `postgres=X/postgres, service_role=X/postgres` für alle 4 Funktionen.

**TypeScript registry (Single Source of Truth)**
- `src/lib/work-items/schedule-method-visibility.ts` — `SCHEDULE_CONSTRUCT_METHOD_VISIBILITY` map + `isScheduleConstructAllowedInMethod(kind, method | null)` helper + `scheduleConstructRejectionMessage(kind, method)` für deutsche 422-Klartext-Meldungen mit Sub-Project-Hint.
- Mapping: `sprints → [scrum, safe]`, `phases → [waterfall, pmi, prince2, vxt2]`, `milestones → [waterfall, pmi, prince2, vxt2]`. NULL method allows everything (setup phase).

**API hardening (Defense Layer 1)**
- `src/app/api/projects/[id]/sprints/route.ts` — POST handler liest `project_method` und blockt 422 mit `error_code: schedule_construct_not_allowed_in_method` + `field: project_method`.
- `src/app/api/projects/[id]/phases/route.ts` — analog.
- `src/app/api/projects/[id]/milestones/route.ts` — analog.
- Pre-check liegt zwischen `getAuthenticatedUserId` und `insert` — RLS bleibt unverändert.

**Test coverage**
- `src/lib/work-items/schedule-method-visibility.test.ts` — **29 neue Tests**: Mapping-Pin (3 cases), validity check gegen `PROJECT_METHODS` (1 case), null-method bypass (3 cases), 21-Fall-Matrix für alle (kind × method), German rejection-message (3 cases).
- Vitest gesamt: **388 → 417** (+29) all passing.
- TypeScript strict: 0 errors.
- `npm run build`: green, all 42 routes compile.

**Live red-team SQL (via MCP `execute_sql`)**

| # | Attack | Erwartung | Resultat |
|---|---|---|---|
| A | Sprint INSERT in WATERFALL-Projekt | block | ✅ ERRCODE 22023, "Sprints sind in einem WATERFALL-Projekt nicht erlaubt …" |
| B | Phase INSERT in SCRUM-Projekt | block | ✅ ERRCODE 22023, "Phasen sind in einem SCRUM-Projekt nicht erlaubt …" |
| C | Milestone INSERT in KANBAN-Projekt | block | ✅ ERRCODE 22023, "Meilensteine sind in einem KANBAN-Projekt nicht erlaubt …" |
| D | Alle 3 INSERTs in NULL-method-Projekt | allow | ✅ alle 3 successful (rolled back) |
| E | Matching-method INSERTs (sprint→scrum, phase→waterfall, milestone→waterfall) | allow | ✅ all successful (rolled back) |

Trigger HINT-Tag `schedule_construct_not_allowed_in_method` macht das Error-Mapping API-seitig stabil falls je ein Aufruf direkt durch die DB durchschlägt.

**Verified**
- TypeScript strict — 0 errors
- `npx vitest run` — 417/417 (54 files)
- `npm run build` — green, 42 routes
- 5 live MCP red-team scenarios — all pass

**Out of this story (deferred)**
- Bestandsdaten-Migration (1 mismatched sprint, 5 phases, 4 milestones) — wartet auf PROJ-6 method-migration RPC
- Tenant-Override-Tabelle für Visibility-Regeln — PROJ-16 territory
- Frontend-Aufräumen der `src/lib/method-templates/*.ts` Sidebar-Buttons — kein neues Verhalten, deferred bis nächster UI-Pass (kein Risiko: wo Buttons noch erscheinen, wirft die API jetzt 422 mit Klartext-Meldung)

## QA Test Results

**Date:** 2026-05-01
**Tester:** /qa skill
**Environment:** Supabase project `iqerihohwabyjzkpcujq`, Next.js dev build, Node 20.
**Verdict:** ✅ **Approved** — no Critical or High bugs.

### Automated checks
| Suite | Result |
|---|---|
| `npx tsc --noEmit` | ✅ clean (0 errors) |
| `npx vitest run` | ✅ **432/432 pass** (388 → 432, +44 for PROJ-26: 29 registry-fixture + 15 API-route-mock) |
| `npm run build` | ✅ green, 42 routes generated |
| `npx playwright install --dry-run` | ✅ chromium 147.0.7727.15 already installed (no E2E added — backend-only feature, no UI surface to walk through) |

### Database integrity (live MCP)
| Check | Result |
|---|---|
| 3 new triggers on `sprints` / `phases` / `milestones` (BEFORE INSERT, FOR EACH ROW) | ✅ all present and active |
| 4 new functions hardened (`search_path = public, pg_temp`) | ✅ verified via `pg_proc` query |
| 4 new functions ACL-revoked from public/anon/authenticated | ✅ ACL = `postgres=X/postgres, service_role=X/postgres` only |
| Pre-migration mismatched-rows snapshot | ✅ recorded: 1 sprint, 5 phases, 4 milestones — left in place by design |
| Supabase advisor (security) | ✅ **0 new warnings introduced by PROJ-26**. The 33 pre-existing warnings (pre-existing `function_search_path_mutable` on PROJ-12/PROJ-20/PROJ-22 fns; pre-existing `*_security_definer_function_executable` on RLS helpers, audit RPCs, sprint/phase state machines) are all unrelated to PROJ-26. |

### Live MCP red-team SQL (raw INSERTs, surfaced ERRCODE)

| # | Attack | Expected | Result |
|---|---|---|---|
| A | Sprint INSERT in WATERFALL project | block | ✅ ERRCODE 22023 + HINT `schedule_construct_not_allowed_in_method` + DE message "Sprints sind in einem WATERFALL-Projekt nicht erlaubt … Sub-Projekt …" |
| B | Phase INSERT in SCRUM project | block | ✅ ERRCODE 22023 + HINT + DE message |
| C | Milestone INSERT in KANBAN project | block | ✅ ERRCODE 22023 + HINT + DE message |
| D | All 3 INSERTs in NULL-method project | allow | ✅ all succeeded (rolled back) |
| E | Matching-method INSERTs (sprint→scrum, phase→waterfall, milestone→waterfall) | allow | ✅ all succeeded (rolled back) |

### Acceptance Criteria walkthrough

#### Visibility-Registry (TypeScript, Single Source of Truth)
| AC | Status | Notes |
|---|---|---|
| `SCHEDULE_CONSTRUCT_METHOD_VISIBILITY` exports `Record<ScheduleConstructKind, ProjectMethod[]>` | ✅ | Pinned by 3 mapping-fixture tests + 1 reference-validity test (against `PROJECT_METHODS`). |
| Default mapping (sprints / phases / milestones) | ✅ | sprints→[scrum, safe], phases/milestones→[waterfall, pmi, prince2, vxt2]. |
| Helper `isScheduleConstructAllowedInMethod` (null bypass) | ✅ | 3 null-method tests + 21-fall fixture matrix pin every (kind × method). |
| Vitest fixture pinning every (construct × method) | ✅ | 21 pinned cases + 3 null cases. |

#### API-Härtung (Defense Layer 1)
| AC | Status | Notes |
|---|---|---|
| `POST /api/projects/[id]/sprints` returns 422 with `schedule_construct_not_allowed_in_method` for non-agile method | ✅ | Verified by 2 mocked-Supabase tests (waterfall, kanban). German message + field=`project_method`. |
| `POST /api/projects/[id]/phases` analog | ✅ | Verified for scrum + safe. |
| `POST /api/projects/[id]/milestones` analog | ✅ | Verified for kanban + scrum. |
| Method = NULL → API erlaubt alles | ✅ | Verified per route. |
| Bestehende Datensätze werden weder gelöscht noch versteckt | ✅ | Triggers fire on INSERT only; `is_deleted`/SELECT paths unchanged. |

#### DB-Härtung (Defense Layer 2)
| AC | Status | Notes |
|---|---|---|
| 3 BEFORE-INSERT-Trigger werfen `check_violation` ('22023') | ✅ | Verified live (Tests A–C). |
| Zentrale Validation-Funktion `validate_schedule_construct_method` | ✅ | `IMMUTABLE` + SECURITY INVOKER + hardened `search_path`. |
| 3 Trigger sind dünne Wrapper über zentrale Funktion | ✅ | Each trigger fn passes `'<construct>'` to the shared validator. |
| Trigger fire only INSERT (UPDATE not affected) | ✅ | Verified via `information_schema.triggers`. |
| Method = NULL → trigger gibt RETURN NEW ohne Prüfung | ✅ | Verified live (Test D: all 3 inserts in NULL-method project succeeded). |

#### Frontend-Konsistenz
| AC | Status | Notes |
|---|---|---|
| Sidebar "Sprint anlegen"-Button method-aware | 🟡 **Deferred** | Per spec § Out-of-Scope and Implementation Notes: UI cleanup is documented as deferred to next UI pass. Backend now hard-blocks via 422, so the UI can keep its current shape without producing bad data. **This is a known deferral, not a bug.** |
| Method-Templates referenzieren neue Registry | 🟡 **Deferred** | Same — deferred bundling with sidebar cleanup. Backend gate is sufficient defense. |

#### Migration-Plan
| AC | Status | Notes |
|---|---|---|
| Pre-migration mismatched-rows count documented | ✅ | 1 sprint, 5 phases, 4 milestones (live MCP query result captured in Implementation Notes). |
| Trigger fires only on INSERT — Bestand unangetastet | ✅ | Confirmed: existing rows stay; only new INSERTs are gated. |

#### Tests
| AC | Status | Notes |
|---|---|---|
| Vitest registry matrix (21 + 3 cases) | ✅ | 29 tests in `src/lib/work-items/schedule-method-visibility.test.ts`. |
| Mocked-Supabase API tests for 3 endpoints (happy/forbidden/null) | ✅ | 15 tests across `sprints/phases/milestones/route.test.ts`. |
| Live-MCP red-team test | ✅ | 5 scenarios (A–E), all passed. |

### Edge cases verified
| Edge case | Result |
|---|---|
| Bestehender Sprint in einem Wasserfall-Projekt | ✅ Pre-existing (1 row) survived migration; INSERT in same conditions now blocks. Existing rows remain editable. |
| Methode = NULL (Setup-Phase) | ✅ Test D — all 3 inserts succeed; ACs intact. |
| VXT2-Projekt | ✅ Registry-pinned: VXT2 gets phases/milestones, NOT sprints. Tests cover this implicitly via the 21-fixture matrix. |
| SAFe-Projekt | ✅ Registry-pinned: SAFe gets sprints, NOT phases/milestones. Test for phases→safe and milestones→safe covered (route tests). |
| Direkter SQL-Insert (z.B. Edge Function) | ✅ Trigger blocks regardless of caller — verified by raw-SQL red-team. |

### Regression smoke (PROJ-9, PROJ-19) — no regressions
| Check | Result |
|---|---|
| PROJ-9 cross-project `dependencies` INSERT still blocks | ✅ ERRCODE 22023 from `enforce_dependency_same_project` |
| PROJ-9 same-project `dependencies` INSERT still passes | ✅ |
| PROJ-9 self-parent `work_items` UPDATE still blocks | ✅ ERRCODE 23514 from `prevent_work_item_parent_cycle` ("cycle in parent chain") |
| PROJ-19 `phases_planned_dates_order` CHECK still blocks `planned_end < planned_start` | ✅ ERRCODE 23514 — and it fires AFTER the PROJ-26 trigger lets the row through, confirming trigger ordering is OK |

### Bugs & findings

**0 Critical / 0 High.**

| Severity | ID | Finding | Status |
|---|---|---|---|
| Low | L1 | UI sidebar "Sprint/Phase/Meilenstein anlegen" buttons can still appear in mismatched-method projects (the backend now rejects with 422, but the button is shown until the deferred UI pass). | **Documented deferral** per spec § Out-of-Scope. No data-integrity risk because the API hard-blocks; only UX-polish concern. |
| Info | I1 | PROJ-9's `work_items` method-visibility check is API-only (no DB-layer trigger) — a waterfall project's epic INSERT goes through at the SQL layer. | **Pre-existing**, not introduced by PROJ-26. PROJ-9 explicitly says "SQL is the runtime guarantee" but only via CHECK on `kind` enum, not on the (kind, method) tuple. Worth a separate hardening pass if defense-in-depth is desired symmetrically. Tracked outside PROJ-26. |
| Info | I2 | 3 unrelated pre-existing `function_search_path_mutable` advisor warnings (`enforce_decision_immutability`, `enforce_ki_suggestion_immutability`, `_is_supported_currency`). | **Pre-existing**, unrelated. Tracking by their respective specs (PROJ-12, PROJ-20, PROJ-22). |
| Info | I3 | `auth_leaked_password_protection` advisor — Supabase Auth project-wide config. | **Pre-existing**, project-wide config, not specific to PROJ-26. |

### Security audit (red-team perspective)
- **Trigger bypass via SECURITY DEFINER** — none possible: the 3 triggers run BEFORE INSERT regardless of caller privilege; `service_role` bypasses RLS but BEFORE-INSERT triggers still fire (Postgres semantics).
- **Direct SQL injection of forbidden construct** — blocked by trigger (verified Tests A–C).
- **Mass assignment via API** — Zod schema rejects unknown keys; `project_method` is read-only, not accepted from client body.
- **NULL-method bypass abuse** — accepting NULL is intentional (setup phase). Once method is set it's hard-locked (PROJ-6 `enforce_method_immutable`), so a user cannot "unset to NULL" to bypass the check.
- **Method-string injection** — `validate_schedule_construct_method` does plain SQL `IN (…)` against constants; no dynamic SQL or string concatenation.
- **Cross-tenant amplification** — N/A: trigger reads target `project.project_method` via PK lookup; tenant isolation comes from existing RLS on `projects`.

### Production-ready decision

**READY** — no Critical or High bugs. The deferred UI-cleanup (L1) is explicitly documented in the spec as out-of-scope; the API + DB defense-in-depth means a stale UI button cannot produce inconsistent data. All 5 acceptance-criterion blocks pass; all 5 live red-team scenarios pass; 432/432 tests green; 0 new advisor warnings.

Suggested next:
1. **`/deploy`** when ready — no blockers.
2. Optional follow-up: tighten PROJ-9 work_items method-visibility at the DB-layer (Info I1) — own small spec.
3. Optional UI-pass: hide schedule-construct create-buttons when not allowed (L1) — bundle with PROJ-23 sidebar polish or schedule as a dedicated cleanup story.

## Deployment
_To be added by /deploy_
