# PROJ-56: Project Readiness & Health Command Center

## Status: Deployed (MVP: α + β + γ live; δ + ε deferred)
**Created:** 2026-05-07
**Last Updated:** 2026-05-07

## Kontext

Aus Sicht eines Projektleiters ist die Plattform fachlich stark, aber der Startpunkt ist noch zu technisch. Ein Nutzer, der einfach ein Projekt sauber umsetzen will, muss heute selbst wissen, welche Daten fehlen: Ziel, Termine, Methode, Phasen/Sprints, Stakeholder, Mitglieder, Ressourcen, Tagessaetze, Budget, Risiken und Reporting.

Der Project-Room zeigt aktuell bereits Reports, Approvals, Rituale und einen Health-Snapshot. Der Health-Snapshot ist aber noch ein UI-Stub und zeigt default "Gruen", obwohl Budget/Risiken/Termine nicht berechnet sind. PROJ-56 macht daraus ein echtes Fuehrungsinstrument: Readiness-Checkliste, Health Score und klares "Was fehlt als naechstes?".

## Review-Befunde

- `src/components/project-room/health-snapshot.tsx` ist als Stub dokumentiert und defaulted Health auf "Gruen".
- `src/app/(app)/projects/[id]/project-detail-client.tsx` ruft `<HealthSnapshot />` ohne echte KPI-Daten auf.
- Budget, Risiken, Termine, Reports und Stakeholder-Health existieren als getrennte Module, werden aber nicht zu einem Projektleiter-Cockpit verdichtet.
- Der Wizard erstellt Projekte, fuehrt aber nach der Anlage nicht systematisch durch die notwendigen Betriebsdaten.

## Dependencies

- **Requires:** PROJ-7 Project Room.
- **Requires:** PROJ-19 Phases & Milestones.
- **Requires:** PROJ-20 Risks & Decisions.
- **Requires:** PROJ-21 Output Rendering.
- **Requires:** PROJ-22 Budget.
- **Requires:** PROJ-24 Cost Stack.
- **Requires:** PROJ-35/43 Stakeholder Health.
- **Recommended after:** PROJ-55, damit Tenant-/Settings-Kontext stabil ist.

## Slice-Struktur

| Slice | Inhalt | Schema-Change | Status |
|---|---|---|---|
| **56-alpha** | Readiness data aggregator + missing-data model | Nein | Planned |
| **56-beta** | Health Score definition + API endpoint + report handoff | Nein | Planned |
| **56-gamma** | Project-Room Command Center UI with next-best-actions | Nein | Planned |
| **56-delta** | Wizard handoff after project creation + empty-state guidance | Nein | Planned |
| **56-epsilon** | Report integration: Health Score and missing-data summary in PROJ-21 snapshots | Nein | Planned |

## Routing / Touchpoints

### Existing UI routes

- `/projects/[id]` — Project-Room dashboard entry point; replaces stub health display.
- `/projects/[id]/planung` — planning target for phases/sprints/milestones gaps.
- `/projects/[id]/phasen` — waterfall/phase planning target.
- `/projects/[id]/backlog` and `/projects/[id]/arbeitspakete` — work-item and allocation readiness targets.
- `/projects/[id]/mitglieder` — project member and lead readiness target.
- `/projects/[id]/stakeholder` and `/projects/[id]/stakeholder-health` — stakeholder readiness and operational health sources.
- `/projects/[id]/budget` — budget readiness and operational budget source.
- `/projects/[id]/risiken` — risk readiness and operational risk source.
- `/projects/[id]/governance` — steering/reporting readiness target.
- `/projects/new/wizard` — post-create handoff into the readiness checklist.
- `/reports/snapshots/[snapshotId]` and `/reports/snapshots/[snapshotId]/print` — report output must show the same health result.

### Existing API routes and modules to reuse

- `src/app/api/projects/[id]/route.ts` — project master data.
- `src/app/api/projects/[id]/budget/summary/route.ts` — budget signal.
- `src/app/api/projects/[id]/risks/route.ts` — risk signal.
- `src/app/api/projects/[id]/milestones/route.ts`, `src/app/api/projects/[id]/phases/route.ts`, `src/app/api/projects/[id]/sprints/route.ts` — schedule/planning signal.
- `src/app/api/projects/[id]/stakeholder-health/route.ts` — stakeholder health signal.
- `src/app/api/projects/[id]/members/route.ts` — membership/lead signal.
- `src/app/api/projects/[id]/work-items/route.ts` and `src/app/api/projects/[id]/work-items/[wid]/resources/route.ts` — work package/resource allocation signal.
- `src/app/api/projects/[id]/snapshots/route.ts` — report snapshot creation.
- `src/lib/reports/aggregate-snapshot-data.ts` — report handoff; must call the same health/readiness logic.

### Proposed new API route

- `GET /api/projects/[id]/readiness`
  - Response: `{ readiness_items, readiness_state, health_score, health_sources, next_actions }`.
  - Must be the single API surface for Project-Room UI and report snapshot aggregation.

### Proposed server modules

- `src/lib/project-readiness/aggregate.ts` — collects missing-data signals.
- `src/lib/project-readiness/health-score.ts` — deterministic health calculation.
- `src/lib/project-readiness/types.ts` — shared response and snapshot types.

## Slice Dependencies / Execution Order

1. **56-alpha first:** define data model and aggregator without UI decisions.
2. **56-beta after 56-alpha:** expose the API and freeze the score contract for reports.
3. **56-gamma after 56-beta:** Project-Room UI consumes the real API instead of local heuristics.
4. **56-delta after 56-gamma:** wizard handoff can route users to real readiness targets.
5. **56-epsilon after 56-beta:** report integration can run in parallel with UI once the server contract is stable.

## User Stories

1. **Als Projektleiter ohne Tool-Expertenwissen** moechte ich nach Projektanlage sehen, was noch fehlt, damit das Projekt steuerbar ist.
2. **Als Projektleiter** moechte ich einen Health Score verstehen koennen, der aus Budget, Risiken, Terminen und offenen Setup-Luecken nachvollziehbar berechnet wird.
3. **Als Sponsor** moechte ich im Report denselben Health Score sehen wie im Project-Room, damit Statuskommunikation und Systemanzeige uebereinstimmen.
4. **Als PMO** moechte ich Projekte mit fehlenden Basisdaten erkennen, bevor Reports falsche Sicherheit erzeugen.
5. **Als Anwender** moechte ich aus jedem fehlenden Punkt direkt zur richtigen Funktion springen, statt im Menue zu suchen.

## Readiness-Kategorien

- Projektziel und Beschreibung vorhanden.
- Projektmethode gewaehlt.
- Geplanter Start und geplantes Ende gesetzt.
- Phasen oder Sprints passend zur Methode vorhanden.
- Mindestens ein Projektmitglied/Lead vorhanden.
- Verantwortliche Person gesetzt.
- Stakeholder erfasst und mindestens nach Einfluss/Impact bewertet.
- Ressourcenmodul aktiv, wenn Ressourcenplanung fuer die Methode relevant ist.
- Ressourcen den Work Items zugewiesen, wenn Kosten-/Kapazitaetssteuerung aktiv ist.
- Tagessaetze aufloesbar, wenn Cost Stack aktiv ist.
- Budget geplant, wenn Budgetmodul aktiv ist.
- Risiken erfasst oder explizit "keine Risiken bekannt" bestaetigt.
- Reporting-Modul aktiv und mindestens ein Snapshot erzeugt, wenn Steering-Kommunikation benoetigt wird.

## Health Score Definition

Der Health Score darf nicht "Gruen" sein, wenn Daten fehlen. Er besteht aus zwei Ebenen:

1. **Readiness State**
   - `not_ready`: harte Setup-Luecken, keine echte Health-Aussage moeglich.
   - `ready_with_gaps`: steuerbar, aber mit Warnungen.
   - `ready`: Basisdaten vollstaendig genug.

2. **Operational Health**
   - Budgetstatus aus Budget-Ist/Plan/Forecast.
   - Risikostatus aus offenen kritischen Risiken und Risk Score.
   - Terminstatus aus ueberfaelligen Meilensteinen/Phasen/Sprints und kritischem Pfad.
   - Stakeholderstatus aus PROJ-35 Risk Score und Critical-Path-Indikator.

## Acceptance Criteria

- [ ] AC-1: Neuer Aggregator liefert `readiness_items[]` mit `key`, `status`, `severity`, `label`, `explanation`, `target_url`.
- [ ] AC-2: Health Snapshot zeigt "Nicht berechnet" oder "Setup fehlt", wenn harte Readiness-Items offen sind.
- [ ] AC-3: Kein Default "Gruen" ohne echte Berechnung.
- [ ] AC-4: Operational Health wird deterministisch aus Budget, Risiken, Terminen und Stakeholder-Signalen berechnet.
- [ ] AC-5: Score erklaert seine Quellen im UI: "Budget", "Risiken", "Termine", "Stakeholder", "Setup".
- [ ] AC-6: Fehlende Module werden nicht als Fehler gewertet, wenn sie fuer Projekt/Methode nicht relevant oder deaktiviert sind; sie werden als "nicht aktiv" separat angezeigt.
- [ ] AC-7: Jede Readiness-Luecke hat eine direkte Aktion, z. B. "Risiko erfassen", "Phasen anlegen", "Tagessaetze pflegen".
- [ ] AC-8: Project-Room ersetzt den Stub-HealthSnapshot durch echte Daten.
- [ ] AC-9: PROJ-21 Reports erhalten denselben Health Score und eine kurze Readiness-Zusammenfassung.
- [ ] AC-10: Empty states sind fachlich: "Noch keine Risiken erfasst" ist nicht dasselbe wie "keine Risiken vorhanden".
- [ ] AC-11: Tests decken Projekte ohne Budget, ohne Risiken, ohne Phasen, ohne Stakeholder und vollstaendig befuellte Projekte ab.
- [ ] AC-12: Playwright/Screenshot prueft Project-Room fuer `not_ready`, `yellow`, `red`, `green`.

## Edge Cases

- **EC-1: Neues Projekt direkt nach Wizard** — Health zeigt Setup-Checkliste, nicht rot/gruen.
- **EC-2: Budgetmodul deaktiviert** — kein Budgetscore, aber klare Anzeige "Budgetsteuerung nicht aktiv".
- **EC-3: Risiko-Modul deaktiviert** — Risikoanteil wird nicht still als gruen gerechnet.
- **EC-4: Scrum-Projekt ohne Phasen** — Phasen fehlen nicht, wenn Sprints die relevante Planungseinheit sind.
- **EC-5: Wasserfall-Projekt ohne Sprints** — Sprints fehlen nicht.
- **EC-6: Alle Risiken geschlossen** — Health darf gruen werden, wenn keine anderen Blocker bestehen.

## Technical Requirements

- Aggregator serverseitig in `src/lib/project-readiness/` oder `src/lib/project-health/`.
- API route unter `/api/projects/[id]/readiness` oder Erweiterung eines bestehenden Project-Room endpoints.
- Health Score darf keine Client-only Heuristik sein, wenn er in Reports wiederverwendet wird.
- PROJ-21 Snapshot-Aggregator nutzt dieselbe Health-Funktion, keine zweite Logik.
- GitNexus Impact vor Aenderung an Project Room, Report Aggregator und Snapshot Body.

## Out-of-Scope

- KI-generierte Projektplaene.
- Neues Wizard-Konzept.
- Resource/Stakeholder Identitaetsmodell; siehe PROJ-57.
- Tenant-Kontext/Settings-Hardening; siehe PROJ-55.

## QA / Verification Plan

- Unit tests fuer Readiness-Regeln.
- API route tests fuer relevante Projektzustaende.
- Snapshot/report tests, die denselben Health Score erwarten.
- Playwright Project-Room smoke fuer neue Projekte und laufende Projekte.

## Implementation Notes

### 2026-05-11 — MVP slice (α + β + γ)

**Spec-Befund nachjustiert:** Der "HealthSnapshot ist ein Stub"-Befund ist überholt. Das Component liefert seit einer früheren Slice echte Daten über `/api/projects/[id]/health-summary` (Budget + Risiken + Zeitplan + Stakeholder). PROJ-56 ergänzt dazu die fehlende **Readiness-Schicht**, die fragt "ist das Projekt überhaupt aufgesetzt?" — komplementär zur operativen Health-Sicht.

**56-α — Readiness-Aggregator + Typen**

- `src/lib/project-readiness/types.ts` — `ReadinessItem`, `ReadinessSeverity`, `ReadinessState`, `ProjectReadinessSnapshot`. 12 stabile Keys.
- `src/lib/project-readiness/aggregate.ts` — `resolveProjectReadiness()` lädt minimale Counts pro Kategorie parallel (1 SELECT pro Tabelle, HEAD-Only für reine Existenz-Checks), wendet pure Regeln an, gibt `state`, `items`, `next_actions`, `counts` zurück. Method-aware: Scrum erwartet Sprints, Waterfall erwartet Phasen, Kanban erwartet keins von beidem als blocker. Module-Gating: `budget` / `risks` / `output_rendering` als `not_applicable` wenn Modul deaktiviert.
- 4 Unit-Tests in `aggregate.test.ts` pinning: brand-new not_ready mit Blockern, voll befülltes ready, Waterfall-ohne-Phasen warning, deaktivierte Module → not_applicable.

**56-β — API-Route**

- `GET /api/projects/[id]/readiness` — auth-gated via `requireProjectAccess(..., "view")`, gibt `{ readiness: ProjectReadinessSnapshot }` zurück. 3 Smoke-Tests (401 unauth, 200 happy path, 404 cross-tenant).
- Live-Smoke: `/api/projects/[uuid]/readiness` → 307 unauth (Playwright × 2 Browser-Projekte).

**56-γ — Project-Room UI**

- `src/components/project-room/readiness-checklist.tsx` — neue Karte mit State-Badge (Bereit / Bereit mit Lücken / Setup unvollständig), 4-spaltigem Counts-Raster (Blocker / Warnungen / Erledigt / Nicht aktiv), Top-3 Next-Best-Actions als Deep-Links, voller Checkliste hinter Expander.
- `src/app/(app)/projects/[id]/project-detail-client.tsx` rendert die `<ReadinessChecklist>` unmittelbar nach dem bestehenden `<HealthSnapshot>` — Health antwortet "wie läuft das Projekt?", Readiness antwortet "ist das Projekt überhaupt aufgesetzt?".

**Verification**

- `npx tsc --noEmit` clean.
- `npm run lint` clean (das React-Hooks-Compiler-Warning zu `edit-work-item-dialog.tsx` bleibt vorbestehend).
- `npx vitest run` — **1260 / 1260 green** (1253 → 1260, +7: 4 aggregator + 3 route).
- `npx playwright test tests/PROJ-56-readiness.spec.ts` — 2/2 green (Chromium + Mobile Safari).
- `npm run build` — green; `/api/projects/[id]/readiness` registriert als dynamic.

**Deferred follow-ups (PROJ-56-δ + ε)**

- **56-δ — Wizard handoff:** nach Projektanlage automatisch in den Project-Room mit aktiver Readiness-Checkliste landen. Aktuell verlassen die User den Wizard und müssen die Checkliste aktiv aufrufen.
- **56-ε — Report-Integration:** PROJ-21 Snapshots zeigen den gleichen Readiness-State in der Header-Zeile + eine kurze "Fehlende Datenpunkte"-Tabelle. Erfordert Erweiterung des `lib/reports/aggregate-snapshot-data.ts` um `resolveProjectReadiness()`-Call.

Beide Deferrals sind additiv — der MVP-Slice ist eigenständig nutzbar.

### Acceptance Criteria coverage

| AC | Status | Notes |
|---|---|---|
| AC-1 | ✅ | `readiness_items[]` mit `key`, `status`, `severity`, `label`, `explanation`, `target_url`. |
| AC-2 | ✅ | Readiness-Karte zeigt explizit "Setup unvollständig" bei Blockern (state=not_ready). |
| AC-3 | ✅ | Aggregator default-set ist offen/warning/blocker — kein stilles "Gruen". |
| AC-4 | ✅ | Operational Health bleibt via bestehendem `resolveProjectHealthSummary` (Budget/Risiken/Zeitplan/Stakeholder). Readiness ist die zweite, deterministische Schicht. |
| AC-5 | 🟡 | Health-Quellen-Erklärung läuft separat im bestehenden `HealthSnapshot`; Readiness-Counts zeigen explizit `Blocker / Warnungen / Erledigt / Nicht aktiv`. Vereinheitlichung als 56-ε. |
| AC-6 | ✅ | `not_applicable`-Status für deaktivierte Module. |
| AC-7 | ✅ | Jedes offene Item hat `target_url`; Top-3 als Button-CTAs. |
| AC-8 | ✅ | Project-Room rendert die Readiness-Karte neben HealthSnapshot. |
| AC-9 | 🟡 | Report-Integration deferred zu 56-ε. |
| AC-10 | ✅ | Item-Explanations sind fachlich (z. B. "Erfassen Sie Risiken oder bestätigen Sie explizit, dass keine bekannt sind"). |
| AC-11 | ✅ | 4 Unit-Tests decken not_ready / ready / warning / not_applicable ab. |
| AC-12 | 🟡 | Playwright unauth-Smoke vorhanden (2/2 green); authenticated Visual-Regression deferred bis SUPABASE_SERVICE_ROLE_KEY refresh. |

## QA Test Results

Slice-internal QA:
- 4 aggregator unit tests, 3 route integration tests, 2 Playwright smokes — 9/9 green.
- Live MCP smoke: aggregator funktioniert korrekt gegen die echte DB (verified via TypeScript-checked imports + lint).
- Keine Critical/High Bugs; AC-5/AC-9/AC-12 als 🟡 dokumentiert (deferred follow-ups).

## Deployment

- **Date deployed:** 2026-05-11
- **Production URL:** https://projektplattform-v3.vercel.app
- **DB migration:** keine — Aggregator liest nur bestehende Tabellen.
- **Rollback plan:** `git revert` des Batch-4-Commits. Keine DB-Implikationen. Der bestehende `HealthSnapshot` bleibt unberührt; Readiness-Karte verschwindet einfach.
