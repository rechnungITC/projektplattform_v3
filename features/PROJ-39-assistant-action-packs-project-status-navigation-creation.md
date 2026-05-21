# PROJ-39: Assistant Action Packs — Project Status, Navigation, Creation

## Status: Deployed (Assistant core MVP slice live since 2026-05-18; mic policy fix 2026-05-21)
**Created:** 2026-05-04
**Last Updated:** 2026-05-21

## Origin
Diese Spec konkretisiert die ersten produktiven Assistant-Fähigkeiten, die aus PROJ-37 und PROJ-38 hervorgehen. Sie trennt klar zwischen der Assistant-Oberfläche/Runtime und den tatsächlich unterstützten Aktionspaketen, damit der Assistent nicht als freier Agent ohne definierte Fachgrenzen startet.

## Summary
Builds the first production-grade assistant command packs: project status retrieval, in-app navigation, report retrieval, project lookup/opening, and conversational project-draft creation. This slice defines what the assistant is actually allowed to do in v1 and how those actions map to existing platform features such as Project Room, Reports, Risks/Decisions, and the guided project wizard. It intentionally avoids generic "do anything" agent claims and instead creates bounded, testable action surfaces.

## Dependencies
- Requires: PROJ-37 (assistant UX)
- Requires: PROJ-38 (intent runtime)
- Requires: PROJ-2 (project CRUD)
- Requires: PROJ-5 (guided project creation wizard)
- Requires: PROJ-20 (risks/decisions for project status answers)
- Requires: PROJ-21 (snapshots/reports as answer sources)
- Requires: PROJ-23 / PROJ-28 (navigation shell / method-aware routes)
- Requires: PROJ-17 (assistant module gate / tenant settings extension)
- Influences: future action packs for stakeholders, budget, approvals, communication

## User Stories

1. **Status command pack** — Als Nutzer möchte ich per Assistent den aktuellen Stand eines Projekts abfragen können, damit ich schnell eine belastbare Zusammenfassung bekomme.

2. **Navigation command pack** — Als Nutzer möchte ich per Assistent gezielt in Projektbereiche springen können, damit ich nicht manuell durch Menüs navigieren muss.

3. **Project lookup/open** — Als Nutzer möchte ich Projekte per Sprache/Text finden und öffnen können, auch wenn ich nur einen Teil des Namens weiß.

4. **Project creation command pack** — Als Nutzer möchte ich ein neues Projekt dialogisch vorbereiten und dann als bestätigbaren Entwurf/Wizard-State übernehmen können.

5. **Report-aware answers** — Als Nutzer möchte ich, dass der Assistent bei Statusfragen vorhandene Snapshots/Reports nutzen kann, damit die Antwort eine erkennbare Managementsicht hat.

## Acceptance Criteria

### A. Status Action Pack
- [ ] Assistant unterstützt mindestens diese Status-Intents:
  - `Wie ist der aktuelle Stand zu Projekt X?`
  - `Was sind die größten Risiken?`
  - `Welche Entscheidungen sind offen oder neu?`
  - `Was sind die nächsten Meilensteine?`
- [ ] Antworten basieren auf echten Plattformdaten und nennen erkennbar ihre Quelle (`live project data` vs `latest snapshot`).
- [ ] Wenn ein aktueller Snapshot existiert, darf der Assistent ihn bevorzugt als Management-Zusammenfassung nutzen; wenn nicht, aggregiert er live aus Projektdaten.
- [ ] Antwort bleibt read-only und führt keine Seiteneffekte aus.

### B. Navigation Action Pack
- [ ] Assistant kann mindestens in diese Bereiche navigieren:
  - Projektübersicht
  - Arbeitspakete/Backlog
  - Risiken
  - Entscheidungen
  - Reports/Snapshots
  - Stakeholder
- [ ] Method-aware Routen aus PROJ-28 werden respektiert (z. B. Wasserfall-/Scrum-spezifische Labels und Slugs).
- [ ] Wenn ein Bereich im Tenant deaktiviert ist, antwortet der Assistent entsprechend und navigiert nicht blind.

### C. Project Lookup / Open
- [ ] Assistant kann Projekte anhand von Name, Teilstring oder nahem Treffer suchen.
- [ ] Bei mehreren Treffern stellt der Assistent eine Rückfrage/Auswahl.
- [ ] Öffnen eines Projekts ist read-only und ohne zusätzliche Bestätigung erlaubt, wenn der User Sichtrechte hat.
- [ ] Nicht sichtbare Projekte werden neutral behandelt ohne Existenz-Leak.

### D. Project Creation Action Pack
- [ ] Assistant kann aus einem Gespräch mindestens folgende Felder sammeln:
  - Projektname
  - Projekttyp
  - Methode
  - Kurzbeschreibung / Ziel
- [ ] Das Ergebnis wird an den Wizard aus PROJ-5 übergeben, nicht als ungebremste Direktanlage ausgeführt.
- [ ] Nutzer sieht einen Review-/Summary-Schritt vor endgültigem Erstellen.
- [ ] Type-/method-aware Follow-up-Fragen aus PROJ-5 bleiben aktiv.

### E. Tenant / Module Integration
- [ ] Es existiert ein eigener Assistant-/Voice-Modulschalter in Tenant Settings oder ein klar definierter Schlüssel im bestehenden Module-System.
- [ ] Wenn der Assistant tenantweit deaktiviert ist, sind Entry-Points, Navigation und APIs gesperrt.
- [ ] Command Packs respektieren bestehende Modulschalter (`risks`, `decisions`, `output_rendering`, usw.).

### F. Deployment / Browser Requirements
- [ ] Produktionsdoku und Security Header/Permissions Policy werden so erweitert, dass Mikrofonnutzung für den Assistant möglich ist, ohne unnötig weitere Sensoren freizugeben.
- [ ] Text-Fallback bleibt möglich, wenn Mikrofonpolitik im Deployment absichtlich restriktiv bleibt.

## Edge Cases
- **Projektstatusfrage ohne Projektnamen** → Assistent nutzt aktuellen Projektkontext oder fragt nach.
- **Mehrere Projekte mit ähnlichem Namen** → disambiguation statt falscher Öffnung.
- **Report veraltet** → Assistent kennzeichnet das Alter des Snapshots oder fällt auf Live-Daten zurück.
- **Wizard-Feld fehlt im Dialog** → Assistent sammelt nach oder übergibt an Wizard mit unvollständigem Draft.
- **Module deaktiviert** → Aktion wird freundlich blockiert.

## Technical Requirements
- **Search / lookup:** typed project-search helper or API path, no fuzzy magic without server-side scoping
- **Report integration:** reads latest relevant `report_snapshots` when available
- **Navigation integration:** emits route targets compatible with App Shell / PROJ-28
- **Wizard integration:** writes into draft or wizard state, not directly into final project rows
- **Tenant settings:** assistant module key must be integrated with PROJ-17-style module gating

## Out of Scope
- Budget-, vendor-, approval-, communication- and stakeholder-coaching command packs
- Autonomous multi-step action chains after project creation
- Cross-tool actions in Jira/Slack/Teams

## Suggested Follow-up Epics (not authored yet)
- **PROJ-40** Assistant Conversation Audit & Transcript Governance
- **PROJ-41** Assistant Provider / Speech Infrastructure & Wake-Word Runtime
- **PROJ-42** Assistant Domain Packs for Budget / Stakeholders / Approvals / Communication

## Tech Design (Solution Architect)

### Scope Decision

PROJ-39 ships the first bounded action pack: project status, project lookup/open, in-app navigation, report summary routing, and project draft creation. The assistant does not expose budget/vendor/stakeholder coaching commands in this slice.

### Action Pack Structure

Assistant Action Packs
+-- Project Status
    +-- project master data
    +-- open/high risks
    +-- active decisions
    +-- upcoming milestones
    +-- latest report snapshot when available
+-- Navigation
    +-- overview
    +-- backlog/work items
    +-- risks
    +-- decisions
    +-- reports
    +-- stakeholders
+-- Project Lookup
    +-- tenant-scoped name/substring search
    +-- clarification when multiple matches exist
+-- Project Draft Creation
    +-- extract name/type/method/description when possible
    +-- write Wizard draft
    +-- send user to Wizard review path

### Data Model

No new domain objects are introduced for project actions. Status answers aggregate existing project, risks, decisions, milestones, and report snapshot data. Project creation uses existing `project_wizard_drafts`.

### Tech Decisions

- Module gates are enforced before route targets are returned.
- Non-visible projects are treated as "not found" without existence leaks.
- Navigation results include both text and route targets, allowing the UI to present a safe action button.
- Draft creation is a reviewable handoff, not a direct `projects` insert.

### Dependencies

Uses existing Project Room routes, PROJ-5 wizard drafts, PROJ-20 governance tables, and PROJ-21 report snapshots.

## Implementation Notes (2026-05-18)

- Implemented first action packs for project status aggregation, project lookup/open, method-aware navigation, report-summary routing, and project draft creation.
- Status answers use existing project, risk, decision, milestone, and latest report snapshot data; no answer path mutates business data.
- Navigation returns route targets for the UI and respects module availability before sending the user into risks, decisions, reports, stakeholders, or work-item surfaces.

## QA Test Results (2026-05-18)

- Runtime tests cover the supported intent/action pack paths, including navigation precedence and project-draft creation.
- The Assistant public API smoke verifies the route stays auth-gated; broader authenticated UX validation still needs refreshed visual baselines after the tenant-settings screen change.
- Final pre-deploy pass on branch `assistant/proj37-41-deploy`: `npm test`, `npm run lint`, `npm run build`, focused Chromium Playwright, `npm audit` with 0 high/critical, and production schema-drift guard all passed. Production-ready decision: READY for the Assistant core MVP.
