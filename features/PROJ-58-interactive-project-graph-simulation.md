# PROJ-58: Interactive Project Graph & Decision Simulation

## Status: In Progress (α docs + β-backend aggregator/API live; β-UI + γ/δ/ε/ζ/η deferred)
**Created:** 2026-05-07
**Last Updated:** 2026-05-07

## Kontext

Projektsteuerung ist heute in mehreren fachlich richtigen, aber getrennten Sichten verteilt: Project Room, Arbeitspakete, Gantt, Risiken, Entscheidungen, Stakeholder, Budget, Ressourcen und Reports. Fuer Projektleiter, Product Owner und Programmmanager fehlt eine visuelle Steuerungsschicht, die diese Beziehungen als Graph zeigt und Entscheidungen simulierbar macht.

PROJ-58 beschreibt eine interaktive Graph-Ansicht fuer Projekte, Programme, Epics, Features, User Stories, Tasks/Arbeitspakete, Stakeholder, Risiken, Entscheidungen, Budgetpositionen, Meilensteine, Abhaengigkeiten und Massnahmen. Der Graph ist kein reines Schaubild, sondern ein Analyse- und Simulationswerkzeug fuer kritische Pfade, Entscheidungsalternativen, Kosten-, Termin-, Risiko- und Stakeholder-Auswirkungen.

Die Umsetzung muss die bestehenden Architekturregeln respektieren:

- **Shared Core + Extensions:** Graph-Kern bleibt methoden- und projekttypagnostisch; ERP/Bau/Software-Spezifika kommen als Extensions.
- **AI as proposal layer:** KI darf Graphen, Entscheidungsbaeume und Massnahmen vorschlagen, aber nicht ohne Review direkt Domain-Daten veraendern.
- **Critical Path ohne unnoetige Persistenz:** Berechnete kritische Pfade sollen primaer aus vorhandenen Daten/API-Aggregationen entstehen; Persistenz nur fuer Nutzerentscheidungen oder akzeptierte Vorschlaege.
- **Data privacy:** Class-3-Daten wie konkrete Personalkosten, vertrauliche Stakeholder-Profile und individuelle Tagessaetze muessen maskiert und modellrouter-konform verarbeitet werden.

## Review-/Architektur-Anknuepfungen

- `docs/decisions/architecture-principles.md` — Shared Core, Extensions, AI als Vorschlagsschicht.
- `docs/decisions/v3-ai-proposal-architecture.md` — KI-Ausgaben muessen reviewbar, traceable und akzeptierbar sein.
- `features/PROJ-27-cross-project-links-and-subproject-bridge.md` — semantische Cross-Project-Beziehungen; Graph-View war dort explizit als Future UX-Step notiert.
- `features/PROJ-43-stakeholder-critical-path-detection-fix.md` — computed Critical Path als API-Aggregation, keine Materialized View/Trigger-Persistenz.
- `features/PROJ-56-project-readiness-health-command-center.md` — Readiness/Health-Signale liefern gute Eingaben fuer Graph-Highlights.
- `features/PROJ-57-participant-resource-linking-operating-model.md` — Stakeholder/Member/Resource/Rate-Beziehungen liefern Graph-Kanten und Datenschutzregeln.
- `docs/design/dashboards/project-dependencies.html` — vorhandene visuelle Referenz fuer Dependency-Graph/Critical-Path-Dashboard.

## Dependencies

- **Requires:** PROJ-9 Work Item Metamodel.
- **Requires:** PROJ-19 Phases & Milestones.
- **Requires:** PROJ-20 Risks & Decisions.
- **Requires:** PROJ-21 Output Rendering, wenn Graph-Ergebnisse in Reports auftauchen.
- **Requires:** PROJ-25/43 Critical Path Grundlagen.
- **Requires:** PROJ-27 Cross-Project Links, wenn projektuebergreifende Kanten im MVP enthalten sind.
- **Requires:** PROJ-35/43 Stakeholder Health/Critical-Path Detection fuer Stakeholder-Signale.
- **Recommended after:** PROJ-55 fuer stabilen Tenant-/Settings-Kontext.
- **Feeds:** PROJ-56 Health/Readiness, PROJ-21 Reports, spaeter Assistant/Orchestrator PROJ-38/39.

## Zielbild

Als Projektleiter / Product Owner / Programmmanager moechte ich ein Projekt in einer interaktiven Graph-Ansicht darstellen koennen, sodass ich Zusammenhaenge zwischen Projekten, Epics, Features, User Stories, Arbeitspaketen, Stakeholdern, Risiken, Entscheidungen, Kosten und Abhaengigkeiten transparent erkenne, simuliere und steuere.

Der Nutzer soll:

- Projektdaten als Graph mit typisierten Knoten und Kanten sehen.
- einen Zielzustand waehlen und den kritischen Pfad dorthin erkennen.
- Engpaesse, Blocker, Risiken, Budget- und Stakeholder-Knoten hervorheben.
- Entscheidungen als Knoten modellieren und Alternativen simulieren.
- Auswirkungen wie `+2 Tage`, `+4.000 EUR`, Risikoanstieg oder Stakeholder-Einbindung sichtbar machen.
- KI-Vorschlaege fuer initiale Projekt-/Entscheidungsbaeume erhalten und vor Uebernahme pruefen.
- aus Graph-Knoten direkt in die passende Detailansicht springen.

## MVP-Schnitt

Der MVP soll **2D-first** sein. 3D-Animation bleibt ein spaeter Slice, weil die fachliche Korrektheit des Graph-Modells wichtiger ist als visuelle Wirkung.

MVP-Knotentypen:

- Project
- Phase/Milestone
- Epic/Feature/User Story/Task bzw. Work Item
- Stakeholder
- Risk
- Decision
- Budget Signal
- Recommendation

MVP-Kantentypen:

- `belongs_to`
- `depends_on`
- `blocks`
- `unblocks`
- `influences`
- `causes_cost`
- `increases_risk`
- `requires_stakeholder`

MVP-Simulation:

- manuell gepflegte Entscheidungsalternativen mit Zeit-/Kosten-/Risiko-Auswirkung.
- regelbasierte Zusammenrechnung fuer Pfad, Kosten und Risiko.
- KI nur als Vorschlag fuer fehlende Knoten/Kanten/Alternativen, nicht als automatische Aenderung.

## Slice-Struktur

| Slice | Inhalt | Schema-Change | Status |
|---|---|---|---|
| **58-alpha** | Architecture spike: Graph-Model, Datenquellen, 2D vs. 3D, Library-Entscheidung, Privacy-Konzept | Nein | Planned |
| **58-beta** | Read-only Graph Aggregator + API + 2D Graph View fuer Projekt/Work Items/Risiken/Stakeholder/Meilensteine | Nein | Planned |
| **58-gamma** | Beziehungspflege im Graph: Kanten anlegen/bearbeiten/loeschen fuer erlaubte Typen | Optional | Planned |
| **58-delta** | Critical-Path + Blocker Overlay: Zielzustand, Engpassmarkierung, Side Panel | Nein | Planned |
| **58-epsilon** | Entscheidungssimulation: Alternativen, Zeit/Kosten/Risiko/Stakeholder-Auswirkungen | Optional | Planned |
| **58-zeta** | KI-Vorschlagsmodus: initialer Graph-/Entscheidungsbaum als `ai_proposals` reviewbar | Optional | Planned |
| **58-eta** | 3D/Motion Exploration: progressive enhancement, nur wenn 2D-MVP performant und verstaendlich ist | Nein | Planned |

## Routing / Touchpoints

### Existing UI routes

- `/projects/[id]` — Project-Room Einstieg; Graph kann als eigener Bereich oder Tab erscheinen.
- `/projects/[id]/planung` und `/projects/[id]/phasen` — Phasen, Sprints, Meilensteine, kritischer Pfad.
- `/projects/[id]/arbeitspakete` und `/projects/[id]/backlog` — Work Items, Epics, Features, User Stories, Tasks.
- `/projects/[id]/risiken` — Risiken und Massnahmen.
- `/projects/[id]/entscheidungen` — Entscheidungsknoten und Approval-Kontext.
- `/projects/[id]/stakeholder` und `/projects/[id]/stakeholder-health` — Stakeholder-Knoten, Einbindungszeitpunkte und Kommunikationshinweise.
- `/projects/[id]/budget` — Budgetsignale und Kostenwirkungen.
- `/reports/snapshots/[snapshotId]` — spaeterer Output fuer Graph-Simulationen in Reports.

### Proposed UI route

- `/projects/[id]/graph`
  - Methode- und projektuebergreifende Graph-Ansicht.
  - Link aus Project Sidebar/Room, sobald Slice 58-beta aktiv ist.

### Existing API routes/modules to reuse

- `GET /api/projects/[id]`
- `GET /api/projects/[id]/work-items`
- `GET /api/projects/[id]/dependencies`
- `GET /api/projects/[id]/critical-path`
- `GET /api/projects/[id]/phases`, `/milestones`, `/sprints`
- `GET /api/projects/[id]/risks`
- `GET /api/projects/[id]/decisions`
- `GET /api/projects/[id]/stakeholders`
- `GET /api/projects/[id]/stakeholder-health`
- `GET /api/projects/[id]/budget/summary`
- `GET /api/projects/[id]/readiness` aus PROJ-56, sobald vorhanden.

### Proposed API routes

- `GET /api/projects/[id]/graph`
  - Liefert normalisierte `nodes[]`, `edges[]`, `overlays[]`, `warnings[]`, `permissions`.
- `POST /api/projects/[id]/graph/edges`
  - Legt erlaubte Beziehungen an; validiert gegen Domain-Regeln.
- `PATCH /api/projects/[id]/graph/edges/[edgeId]`
  - Aendert Edge-Typ/Metadaten, sofern nicht derived/read-only.
- `DELETE /api/projects/[id]/graph/edges/[edgeId]`
  - Loescht nur manuelle Graph-Kanten, keine aus Domain-Tabellen abgeleiteten Kanten.
- `POST /api/projects/[id]/graph/simulations`
  - Berechnet Entscheidungsalternativen transient; persistiert nur, wenn Nutzer speichert.
- `POST /api/projects/[id]/graph/proposals`
  - Erzeugt KI-Vorschlaege fuer Graph-Erweiterungen via `ai_proposals`.

## Architekturentscheidungen fuer `/architecture`

Diese Fragen muessen vor `/backend` gelockt werden:

| Frage | Default-Empfehlung | Begruendung |
|---|---|---|
| 2D vs. 3D im MVP | **2D-first**, 3D spaeter | Lesbarkeit, Barrierefreiheit, Performance und fachliche Validierung sind wichtiger als Effekt. |
| Graph-Library | **Proven React graph/canvas library evaluieren** | Kein eigener Physics-/Layout-Engine-Bau. Kandidaten in /architecture gegen Next 16/React 19 pruefen. |
| Persistenzmodell | **Derived graph + optionale manuelle edges** | Bestehende Domain-Daten bleiben Quelle der Wahrheit; Graph ist Aggregations-/Steuerungsschicht. |
| Simulation | **Hybrid: regelbasiert zuerst, KI als Vorschlag** | Zahlen muessen nachvollziehbar sein; KI darf erklaeren und vorschlagen, nicht heimlich rechnen. |
| Critical Path | **API-Aggregation wiederverwenden** | Align mit PROJ-43-γ; keine MV/Trigger-Persistenz ohne belegten Performance-Bedarf. |
| Bearbeitung im Graph | **MVP read-mostly, gezielte Edge-Edits** | Direkte Vollbearbeitung im Graph ist UX-/Datenrisiko; Start mit klar begrenzten Mutationen. |
| Datenschutz | **Serverseitiges Masking nach Data Class** | Class-3 Kosten/Stakeholder-/Rate-Daten duerfen nicht im Client roh auftauchen. |
| AI Output | **`ai_proposals` / review_state** | Entspricht ADR; kein Auto-Accept. |

## User Stories

1. **Als Projektleiter** moechte ich alle relevanten Projektobjekte als zusammenhaengenden Graph sehen, damit ich nicht zwischen Listen mental Beziehungen rekonstruieren muss.
2. **Als Product Owner** moechte ich Epics, Features, Stories und Tasks mit Abhaengigkeiten sehen, damit Blocker und Lieferketten sichtbar werden.
3. **Als Programmmanager** moechte ich projektuebergreifende Beziehungen und Sub-Projekt-Bruecken sehen, damit Abhaengigkeiten zwischen Teams steuerbar werden.
4. **Als Projektleiter** moechte ich einen Zielzustand definieren, damit das System den kritischen Pfad und die wichtigsten Engpaesse hervorhebt.
5. **Als Entscheider** moechte ich Entscheidungsalternativen mit Kosten-, Termin-, Risiko- und Stakeholder-Auswirkungen simulieren, damit ich Folgen vor Freigabe verstehe.
6. **Als PMO** moechte ich schwierige Stakeholder und Kommunikationspunkte im Graphen sehen, damit Eskalationen frueher geplant werden.
7. **Als Nutzer** moechte ich KI-Vorschlaege fuer fehlende Knoten, Abhaengigkeiten und Massnahmen erhalten, aber vor Uebernahme pruefen koennen.

## Acceptance Criteria

### Funktionale Anforderungen

- [ ] AC-1: Graph zeigt mindestens die MVP-Knotentypen Project, Phase/Milestone, Work Item, Stakeholder, Risk, Decision, Budget Signal und Recommendation.
- [ ] AC-2: Knotentypen sind visuell klar unterscheidbar durch Icon, Farbe, Label und Legende.
- [ ] AC-3: Graph zeigt mindestens die MVP-Kantentypen `belongs_to`, `depends_on`, `blocks`, `unblocks`, `influences`, `causes_cost`, `increases_risk`, `requires_stakeholder`.
- [ ] AC-4: 1:n-Beziehungen werden ohne Label-Ueberdeckung lesbar dargestellt.
- [ ] AC-5: Nutzer kann zoomen, verschieben, Knoten anklicken und eine Detailansicht/Side Panel oeffnen.
- [ ] AC-6: Jeder Knoten kann zur passenden bestehenden Detailroute navigieren, wenn der Nutzer Zugriff hat.
- [ ] AC-7: Nutzer kann einen Zielzustand auswaehlen, z. B. Meilenstein, Work Item oder Release.
- [ ] AC-8: System berechnet und visualisiert den kritischen Pfad zum Zielzustand.
- [ ] AC-9: Blocker, Engpaesse und besonders kritische Knoten werden hervorgehoben.
- [ ] AC-10: Entscheidungen koennen als eigene Knoten modelliert werden.
- [ ] AC-11: Entscheidungen koennen Alternativen mit Zeitverzug/Zeitgewinn, Mehr-/Minderkosten, technischem Risiko, organisatorischem Risiko und notwendiger Stakeholder-Einbindung enthalten.
- [ ] AC-12: System simuliert alternative Entscheidungswege transient, ohne Domain-Daten automatisch zu veraendern.
- [ ] AC-13: Simulation zeigt Auswirkungen in Zahlen oder Naeherungen, z. B. `+2 Tage`, `+4.000 EUR`, `Risiko mittel -> hoch`.
- [ ] AC-14: System zeigt, welche Stakeholder an welchem Punkt eingebunden werden sollten.
- [ ] AC-15: Schwierige Stakeholder koennen ueber Stakeholder-Health/Risk-Signale beruecksichtigt werden; konkrete Class-3-Details bleiben maskiert.
- [ ] AC-16: KI kann einen initialen Graph-/Entscheidungsbaum als Vorschlag erzeugen.
- [ ] AC-17: KI fragt im Dialog fehlende Informationen ab, wenn Modellierung nicht belastbar ist.
- [ ] AC-18: KI-Vorschlaege landen im Review-Flow und werden erst nach Nutzerfreigabe uebernommen.
- [ ] AC-19: Wenn Nutzer neue Stories, Arbeitspakete, Risiken oder Entscheidungen hinzufuegt, aktualisiert sich der Graph nach Refresh bzw. Realtime-Event.
- [ ] AC-20: System generiert zu kritischen Situationen konkrete Handlungsempfehlungen und visualisiert sie als Recommendation-Knoten oder Side-Panel-Hinweise.

### Nicht-funktionale Anforderungen

- [ ] NFR-1: Graph bleibt bei 250 Knoten und 500 Kanten interaktiv nutzbar.
- [ ] NFR-2: Initiale Graph-API antwortet fuer typische Projekte p95 < 800 ms ohne KI-Aufruf.
- [ ] NFR-3: Layout-Engine blockiert nicht den Main Thread ueber laengere Zeit; grosse Layouts muessen progressiv/deferred rendern.
- [ ] NFR-4: Reduced-motion wird respektiert; 3D/Motion ist opt-in/progressive enhancement.
- [ ] NFR-5: Graph ist fuer Management und Fachbereiche lesbar: Legende, Filter, Sichten und klare Begriffe.
- [ ] NFR-6: Loesung arbeitet methodenagnostisch fuer klassisch, agil und hybrid.
- [ ] NFR-7: Server maskiert Class-3-Daten, bevor sie an den Client gehen.

## Edge Cases

- **EC-1: Projekt hat keine Work Items** — Graph zeigt Project, Readiness-Luecken und Handlungsempfehlungen statt leerem Canvas.
- **EC-2: Graph wird zu gross** — UI bietet Filter/Sichten: Management, Delivery, Risiko, Stakeholder, Budget.
- **EC-3: Nutzer hat keinen Zugriff auf verknuepftes Projekt** — Platzhalterknoten ohne vertrauliche Details.
- **EC-4: KI ist deaktiviert** — regelbasierter Graph bleibt voll nutzbar; KI-Vorschlagsschaltflaechen sind verborgen.
- **EC-5: Simulation trifft unsichere Annahmen** — Ergebnis zeigt Confidence/Unsicherheit und verlangt Nutzerfreigabe.
- **EC-6: Kante ist derived** — nicht direkt loeschbar; Nutzer muss die zugrunde liegende Domain-Relation bearbeiten.
- **EC-7: Zyklus im Graph** — fuer Visualisierung erlaubt, fuer Scheduling-Abhaengigkeiten durch bestehende Regeln blockiert.
- **EC-8: Budgetmodul deaktiviert** — Budgetknoten werden als nicht aktiv markiert, nicht als gruen gerechnet.
- **EC-9: Stakeholderdaten Class-3** — konkrete Coaching-/Persoenlichkeitsdetails bleiben maskiert oder nur berechtigten Rollen sichtbar.

## Out-of-Scope

- Verbindliche Vollautomatisierung der Projektplanung ohne Nutzerfreigabe.
- Finale Ressourcenfeinplanung auf Mitarbeiterebene.
- Vollstaendige Finanzbuchhaltung oder ERP-Kalkulation.
- Rechtlich verbindliche Entscheidungsvorlage.
- Vollstaendige KI-Autonomie ohne menschliche Kontrolle.
- 3D-Graph als MVP-Pflicht.
- Eigene Physics-/Graph-Engine von Grund auf.
- Cross-Tenant-Graphen.

## Open Questions

- Soll der MVP nur visualisieren oder auch direkte Bearbeitung im Graphen erlauben?
- Welche Knotentypen sind fuer den ersten Pilot zwingend notwendig?
- Soll die Simulation zuerst rein regelbasiert, KI-gestuetzt oder hybrid erfolgen?
- Wie werden Kosten- und Zeiteffekte initial gepflegt: manuell, Templates, historische Projektdaten oder KI-gestuetzt?
- Wie werden Stakeholder-Klassen fuer Simulation normalisiert: Unterstuetzer, Kritiker, Blocker, Entscheider?
- Welche Sichten sind MVP: Management, Delivery, Risiko, Stakeholder, Budget?
- Wie detailliert soll 3D/Motion im spaeteren Slice sein?
- Sollen Wahrscheinlichkeiten und Unsicherheiten im Entscheidungsbaum formal modelliert werden?
- Wie werden externe Einfluesse modelliert: Budgetkuerzung, neue Anforderungen, Ressourcenengpass?
- Soll PROJ-58 eigene Graph-Edge-Persistenz bekommen oder nur bestehende Domain-Relationen schreiben?

## DoR

- [ ] Zielgruppe und Hauptnutzer sind benannt.
- [ ] MVP-Knotentypen sind definiert.
- [ ] MVP-Beziehungstypen sind definiert.
- [ ] Grundlogik fuer kritischen Pfad ist fachlich abgestimmt.
- [ ] Grundlogik fuer Entscheidungssimulation ist beschrieben.
- [ ] Eingabedaten und Stammdatenquellen sind identifiziert.
- [ ] MVP-Scope ist gegen 3D/Full-Autonomy abgegrenzt.
- [ ] Architekturfrage 2D vs. 3D ist bewertet.
- [ ] KI-Rolle ist als Vorschlagsschicht beschrieben.
- [ ] Datenschutz-/Class-3-Regeln sind abgestimmt.
- [ ] Acceptance Criteria sind mit Stakeholdern abgestimmt.

## DoD

- [ ] Graph-Ansicht mit definierten Knotentypen ist verfuegbar.
- [ ] Beziehungen zwischen Knoten sind sichtbar und fuer erlaubte Typen pflegbar.
- [ ] Kritischer Pfad kann berechnet und angezeigt werden.
- [ ] Entscheidungsknoten koennen simuliert werden.
- [ ] Auswirkungen auf Zeit, Kosten, Risiken und Stakeholder werden visualisiert.
- [ ] Stakeholder-Einbindungspunkte werden dargestellt.
- [ ] Risiken und kritische Punkte werden hervorgehoben.
- [ ] KI kann mindestens einen initialen Projekt-/Entscheidungsbaum vorschlagen.
- [ ] KI-Vorschlaege sind reviewbar und werden nicht automatisch uebernommen.
- [ ] Dynamische Aktualisierung bei manuellen Aenderungen funktioniert.
- [ ] Handlungsempfehlungen werden sichtbar ausgegeben.
- [ ] Fachlicher Review mit Endanwendern wurde durchgefuehrt.
- [ ] Dokumentation/Nutzungshinweise liegen vor.

## QA / Verification Plan

- Unit tests fuer Graph-Aggregator und Edge-Normalisierung.
- API route tests fuer `GET /graph`, Simulation und Proposal-Erzeugung.
- Permission tests fuer Cross-Project/Stakeholder/Class-3-Masking.
- Performance-Smoke mit 250 Knoten/500 Kanten.
- Playwright fuer Zoom/Pan, Knoten-Auswahl, Detailroute, Filter/Sichten.
- Visual-regression fuer Management-, Delivery-, Risiko- und Stakeholder-Sicht.

## Implementation Notes

Noch nicht implementiert. Diese Spec ist bewusst als Epic mit Architektur-Gate geschrieben. `/architecture` muss vor `/backend` die Graph-Library, das Persistenzmodell, die Simulationstiefe, Datenschutzregeln und den MVP-2D-Schnitt locken.

## QA Test Results

_To be added by /qa_

## Deployment

_To be added by /deploy_

## Implementation Notes

### 2026-05-11 — Foundation slice (α docs + β-backend)

**58-α — Architecture decisions documented in spec sections** *Zielbild* and *MVP-Schnitt* above. The MVP node/edge taxonomy is locked: 8 node kinds (project / phase / milestone / work_item / risk / decision / stakeholder / budget / recommendation) and 8 edge kinds (belongs_to / depends_on / blocks / unblocks / influences / causes_cost / increases_risk / requires_stakeholder).

**58-β-backend — Read-only aggregator + API**

- `src/lib/project-graph/types.ts` — library-agnostic `GraphNode` + `GraphEdge` + `ProjectGraphSnapshot`. The shape (id + kind + label + tone + href + attributes) maps cleanly to react-flow, cytoscape and d3 without further transformation.
- `src/lib/project-graph/aggregate.ts` — `resolveProjectGraph()` pulls projects + phases + milestones + work_items + dependencies + risks + decisions + stakeholders + budget items in parallel. Capped per kind to keep the payload bounded. Polymorphic `dependencies` edges only emit when both endpoints survive the node cap; dangling edges are dropped.
- `GET /api/projects/[id]/graph` — auth-gated via `requireProjectAccess(..., "view")`. Returns `{ graph: ProjectGraphSnapshot }`.

**Tests**

- 3 aggregator unit tests: full happy-path with all 5 source tables populated, empty-project edge case, dangling-edge filter.
- 1 Playwright unauth smoke (2× browser projects).
- Vitest: **1266 / 1266 green** (was 1263; +3).

### Deferred follow-ups (PROJ-58-β-UI + γ/δ/ε/ζ/η)

- **β-UI** — picks a library (react-flow recommended for 2D, MIT-licensed) and renders the snapshot at `/projects/[id]/graph`. New dep — CIA review per `.claude/rules/continuous-improvement.md` before adoption.
- **γ — Beziehungspflege** — Edit-mode for edges (add/remove `depends_on` etc.) wired to the existing dependency routes.
- **δ — Critical-Path Overlay** — toggle that highlights critical paths via `compute_critical_path_phases` / `compute_critical_path_work_items`.
- **ε — Entscheidungssimulation** — Decision alternatives + "+ X Tage / Y EUR" delta calculations.
- **ζ — KI-Vorschläge** — initial graph from `ai_proposals` flow.
- **η — 3D/Motion** — progressive enhancement after the 2D MVP is stable.

The aggregator is the foundation for all of these — every deferred slice consumes the same `ProjectGraphSnapshot` shape.

## QA Test Results

- 3 aggregator unit tests pinning node-kind counts, dangling-edge filter, empty-project handling.
- 1 Playwright auth-gate smoke.
- 0 Critical / High Bugs.

## Deployment

- **Date deployed:** 2026-05-11
- **Production URL:** https://projektplattform-v3.vercel.app
- **DB migration:** keine.
- **Rollback plan:** `git revert` des Batch-6-Commits. Keine DB-Implikationen.
