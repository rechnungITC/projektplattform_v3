# PROJ-58: Interactive Project Graph & Decision Simulation

## Status: In Progress (α + β-backend + β-UI SVG + γ edge-delete + δ critical-overlay + ε decision-sim + ζ AI-proposal-nodes + η framer-motion polish live; θ 3D-Verbindungsgraph ist Must-have und pending /architecture)
**Created:** 2026-05-07
**Last Updated:** 2026-05-12

## Kontext

Projektsteuerung ist heute in mehreren fachlich richtigen, aber getrennten Sichten verteilt: Project Room, Arbeitspakete, Gantt, Risiken, Entscheidungen, Stakeholder, Budget, Ressourcen und Reports. Fuer Projektleiter, Product Owner und Programmmanager fehlt eine visuelle Steuerungsschicht, die diese Beziehungen als Graph zeigt und Entscheidungen simulierbar macht.

PROJ-58 beschreibt eine interaktive Graph-Ansicht fuer Projekte, Programme, Epics, Features, User Stories, Tasks/Arbeitspakete, Stakeholder, Risiken, Entscheidungen, Budgetpositionen, Meilensteine, Abhaengigkeiten und Massnahmen. Der Graph ist kein reines Schaubild, sondern ein Analyse- und Simulationswerkzeug fuer kritische Pfade, Entscheidungsalternativen, Kosten-, Termin-, Risiko- und Stakeholder-Auswirkungen.

**Produktentscheidung 2026-05-12:** Eine saubere **3D-Darstellung der Verbindungen ist Must-have**. Die bisherige 2D-first/3D-deferred Linie ist damit fachlich ueberholt. Die bestehende 2D-SVG-Ansicht bleibt als Fallback und bereits gelieferte Basis erhalten, aber PROJ-58 gilt erst nach dem 3D-Verbindungsgraphen als vollstaendig geschlossen.

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

- Projektdaten als **raeumlichen 3D-Graph** mit typisierten Knoten und Kanten sehen.
- Verbindungen in 3D sauber nachvollziehen koennen: Richtung, Typ, Kritikalitaet, Herkunft und Ziel muessen visuell unterscheidbar sein.
- einen Zielzustand waehlen und den kritischen Pfad dorthin erkennen.
- Engpaesse, Blocker, Risiken, Budget- und Stakeholder-Knoten hervorheben.
- Entscheidungen als Knoten modellieren und Alternativen simulieren.
- Auswirkungen wie `+2 Tage`, `+4.000 EUR`, Risikoanstieg oder Stakeholder-Einbindung sichtbar machen.
- KI-Vorschlaege fuer initiale Projekt-/Entscheidungsbaeume erhalten und vor Uebernahme pruefen.
- aus Graph-Knoten direkt in die passende Detailansicht springen.

## MVP-Schnitt

Der PROJ-58-Zielzustand ist ab 2026-05-12 **3D-first fuer die Verbindungsdarstellung**. Der bisher gelieferte 2D-SVG-Graph bleibt als Fallback/Legacy-Ansicht bestehen, aber der MVP ist erst vollstaendig, wenn `58-θ` eine produktionsfaehige 3D-Verbindungsansicht liefert.

3D-Must-have-Scope:

- WebGL-/Canvas-basierte 3D-Szene mit Project-Zentrum, typisierten Knoten, gerichteten Kanten und sichtbarer Tiefenstaffelung.
- Kanten muessen durch Typ, Richtung, Kritikalitaet und Interaktionszustand unterscheidbar sein.
- Nutzer kann rotieren, zoomen, verschieben, fokussieren, Knoten/Kanten selektieren und in die bestehende Detailansicht springen.
- Critical-Path, Blocker, Cross-Project-Links, Stakeholder-, Risiko-, Entscheidungs- und Budgetbeziehungen muessen in 3D filterbar bleiben.
- Reduced-motion, Tastaturzugang und 2D-Fallback sind Pflicht, aber ersetzen die 3D-Darstellung nicht.

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
| **58-α** | Architecture spike: Graph-Model, Datenquellen, 2D vs. 3D, Library-Entscheidung, Privacy-Konzept | Nein | ✅ Deployed (2026-05-11) |
| **58-β-backend** | Read-only Graph Aggregator + `GET /api/projects/[id]/graph` | Nein | ✅ Deployed (2026-05-11, commit `6af5483`) |
| **58-β-UI** | 2D Graph View — hand-rolled SVG, concentric rings, no new dep | Nein | ✅ Deployed (2026-05-11, CIA-genehmigt statt react-flow) |
| **58-γ** | Beziehungspflege: Kanten löschen via Klick (`dependencies`-Edges) | Nein | ✅ Deployed (2026-05-11) |
| **58-δ** | Critical-Path Overlay: Toggle, dimmt Off-Path-Knoten/-Kanten | Nein | ✅ Deployed (2026-05-11) |
| **58-ε** | Entscheidungssimulation: `+ X Tage / Y EUR` Detail-Pill am Knoten | Nein | ✅ Deployed (2026-05-11) |
| **58-ζ** | KI-Vorschlags-Knoten aus `ai_proposals` (recommendation-Knoten-Art) | Nein | ✅ Deployed (2026-05-11) |
| **58-η** | Motion-Polish: framer-motion auf SVG-Renderer (Node-Enter, Hover, Critical-Path-Transitions) — `@xyflow/react` weiter deferred per CIA 2026-05-11 | Nein | ✅ Deployed (2026-05-12) |
| **58-θ** | 3D-Verbindungsgraph: WebGL/Three.js-basierte Ansicht mit raeumlichem Layout, Kanten-Typisierung, Interaktion, Filter, Fallback und Visual-QA | Nein erwartet | 🔴 Must-have pending (`/architecture` next) |

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
| 2D vs. 3D im MVP | **3D-first fuer Verbindungen; 2D bleibt Fallback** | Product decision 2026-05-12: saubere 3D-Verbindungsdarstellung ist Must-have. Die alte 2D-first-Entscheidung ist fuer den Zielzustand superseded. |
| Graph-Library / Renderer | **Proven Three.js/WebGL stack evaluieren** | Kein eigener 3D-/Physics-Engine-Bau. `/architecture` muss Three.js, ggf. React-Integration und Force/Layout-Optionen gegen Next 16/React 19 pruefen. |
| 3D-Layout | **Deterministisches Layout mit optionaler Force-Stabilisierung** | Projektmanager brauchen wiedererkennbare Raeume; dauerhaft springende Physics-Layouts sind fuer Steuerung ungeeignet. |
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
- [ ] AC-21: `58-θ` liefert eine echte 3D-Szene fuer `/projects/[id]/graph`; die bestehende 2D-SVG-Ansicht darf Fallback sein, aber nicht die primaere Zielansicht.
- [ ] AC-22: Kanten werden in 3D als gerichtete Verbindungen gerendert; Richtung ist durch Pfeil, Partikel, Verlauf oder gleichwertiges visuelles Signal erkennbar.
- [ ] AC-23: Kanten-Typen (`depends_on`, `blocks`, `influences`, `causes_cost`, usw.) sind in 3D durch Farbe, Stroke/Tube-Style, Label/Tooltip und Filter unterscheidbar.
- [ ] AC-24: Nutzer kann per Orbit/Pan/Zoom und Fokusaktion Knotencluster aus unterschiedlichen Perspektiven untersuchen.
- [ ] AC-25: Klick/Fokus auf eine Kante zeigt Startknoten, Zielknoten, Beziehungstyp, Quelle (`derived` vs. manuell), Kritikalitaet und ggf. zugrunde liegende Domain-ID.
- [ ] AC-26: Critical-Path-Overlay funktioniert in 3D: On-Path-Knoten/-Kanten werden hervorgehoben, Off-Path-Elemente gedimmt, ohne komplett unsichtbar zu werden.
- [ ] AC-27: Verbindungsmassen bleiben lesbar durch Filter, Edge-Bundling/Curving, Clustering oder Level-of-Detail; reine Linienwolken gelten als nicht akzeptiert.
- [ ] AC-28: 3D-Labels duerfen die Szene nicht unkontrolliert ueberdecken; Labels muessen fokussiert, geclustert oder als Tooltip/Side-Panel erscheinen.
- [ ] AC-29: 3D-Ansicht respektiert Berechtigungen und Class-3-Masking identisch zur 2D/API-Basis.
- [ ] AC-30: Bei fehlendem WebGL oder aktivem Reduced-Motion bleibt eine robuste 2D-Fallback-Ansicht nutzbar; der Fallback darf die 3D-Pflicht im Normalfall nicht ersetzen.

### Nicht-funktionale Anforderungen

- [ ] NFR-1: Graph bleibt bei 250 Knoten und 500 Kanten interaktiv nutzbar.
- [ ] NFR-2: Initiale Graph-API antwortet fuer typische Projekte p95 < 800 ms ohne KI-Aufruf.
- [ ] NFR-3: Layout-Engine blockiert nicht den Main Thread ueber laengere Zeit; grosse Layouts muessen progressiv/deferred rendern.
- [ ] NFR-4: Reduced-motion wird respektiert; 3D bleibt Pflicht im Normalmodus, Animation/Physics muss aber reduzierbar oder pausierbar sein.
- [ ] NFR-5: Graph ist fuer Management und Fachbereiche lesbar: Legende, Filter, Sichten und klare Begriffe.
- [ ] NFR-6: Loesung arbeitet methodenagnostisch fuer klassisch, agil und hybrid.
- [ ] NFR-7: Server maskiert Class-3-Daten, bevor sie an den Client gehen.
- [ ] NFR-8: 3D-Szene rendert auf Desktop und Tablet ohne blank canvas; Mobile bekommt mindestens nutzbaren read-only/fallback Pfad.
- [ ] NFR-9: Initiales 3D-Rendern fuer typische Projekte startet sichtbar < 2 s nach API-Datenempfang.
- [ ] NFR-10: Kamera, Zoom und Fokus duerfen keine UI-Overlaps mit Toolbar, Legende oder Side-Panel erzeugen.
- [ ] NFR-11: 3D-Renderer wird route-lokal geladen, damit nicht-Graph-Seiten keinen relevanten Bundle-Penalty tragen.
- [ ] NFR-12: Architektur muss eine bewusste Entscheidung dokumentieren, ob Three.js direkt, React-Wrapper oder eine spezialisierte 3D-Graph-Library genutzt wird.

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
- **EC-10: WebGL nicht verfuegbar** — 2D-Fallback erscheint mit klarer, unaufdringlicher Meldung; keine leere Flaeche.
- **EC-11: Sehr viele Kanten kreuzen sich** — Filter/Clustering/LOD wird angeboten; unlesbare Linienwolke gilt als Fehler.
- **EC-12: Kamera verliert Kontext** — Reset/Fit-to-View bringt Nutzer jederzeit zur stabilen Gesamtansicht zurueck.
- **EC-13: Mobile Viewport** — 3D darf vereinfacht sein, muss aber weder Text noch Controls ueberdecken.

## Out-of-Scope

- Verbindliche Vollautomatisierung der Projektplanung ohne Nutzerfreigabe.
- Finale Ressourcenfeinplanung auf Mitarbeiterebene.
- Vollstaendige Finanzbuchhaltung oder ERP-Kalkulation.
- Rechtlich verbindliche Entscheidungsvorlage.
- Vollstaendige KI-Autonomie ohne menschliche Kontrolle.
- 3D als reiner Effekt ohne fachlich lesbare Kanten-/Knoten-Semantik.
- Eigene Physics-/Graph-Engine von Grund auf.
- Cross-Tenant-Graphen.

## Open Questions

- Soll der MVP nur visualisieren oder auch direkte Bearbeitung im Graphen erlauben?
- Welche Knotentypen sind fuer den ersten Pilot zwingend notwendig?
- Soll die Simulation zuerst rein regelbasiert, KI-gestuetzt oder hybrid erfolgen?
- Wie werden Kosten- und Zeiteffekte initial gepflegt: manuell, Templates, historische Projektdaten oder KI-gestuetzt?
- Wie werden Stakeholder-Klassen fuer Simulation normalisiert: Unterstuetzer, Kritiker, Blocker, Entscheider?
- Welche Sichten sind MVP: Management, Delivery, Risiko, Stakeholder, Budget?
- Welche 3D-Renderer-/Library-Kombination erfuellt Next 16/React 19, Bundle- und Interaktionsanforderungen am saubersten?
- Welche Knoten-/Kantenmenge ist der harte Cutover von Voll-3D zu Clustering/LOD?
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
- [ ] 3D-Verbindungsgraph ist als Must-have akzeptiert.
- [ ] Architekturfrage Renderer/Library/Layout fuer 3D ist bewertet.
- [ ] KI-Rolle ist als Vorschlagsschicht beschrieben.
- [ ] Datenschutz-/Class-3-Regeln sind abgestimmt.
- [ ] Acceptance Criteria sind mit Stakeholdern abgestimmt.

## DoD

- [ ] Graph-Ansicht mit definierten Knotentypen ist verfuegbar.
- [ ] 3D-Verbindungsansicht ist als primaere Graph-Erfahrung verfuegbar.
- [ ] 3D-Kanten sind nach Typ, Richtung, Quelle und Kritikalitaet lesbar.
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
- Playwright-Screenshots fuer 3D-Graph auf Desktop und Mobile.
- Canvas/WebGL-Pixel-Smoke: Szene darf nicht blank sein, muss Knoten und Kanten sichtbar rendern.
- Interaktions-Smoke fuer Orbit/Pan/Zoom/Fit-to-view, Knotenfokus und Kantenfokus.
- Reduced-motion/Fallback-Test fuer 2D-Pfad bei deaktivierter/fehlender 3D-Faehigkeit.

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

### 2026-05-11 — Closing & Deferred batches (β-UI + γ + δ + ε + ζ)

CIA-Verdict (2026-05-11 16:58): **keine** neue Graph-Library; ship `@/components/projects/project-graph-view.tsx` als hand-rolled SVG mit Concentric-Rings-Layout (`computePositions`). Damit entfällt die `react-flow`/`cytoscape`-Adoption.

- **β-UI** — `project-graph-view.tsx`: lädt `/api/projects/[id]/graph`, rendert Projekt-Knoten zentral, dann eine Ringe pro Node-Kind (`phase → milestone → work_item → stakeholder → risk → decision → budget → recommendation`). Hover/Click/Focus fokussieren einen Knoten und blenden `NodeDetail` ein. `Counts-Legend` zeigt Kind-Counts; `Neu laden`-Button reagiert auf Edge-Delete und Mutationen.
- **γ — Edge-Delete** — Edges, die einen `dependency_id` tragen, sind klickbar; Confirm-Dialog → `DELETE /api/projects/[id]/dependencies/[depId]` → Reload. Strukturelle Edges (`belongs_to`, `influences`, …) bleiben read-only.
- **δ — Critical-Path Overlay** — Toggle-Button mit Count-Badge; aktiv → kritische Knoten/Edges in Warning-Farbe + 2px Stroke + Dash-Outline, alles andere auf 0.2/0.15 Opacity. Liest `attributes.is_critical` aus dem Snapshot (gefüllt von `resolveProjectGraph` über `compute_critical_path_*`).
- **ε — Entscheidungssimulation** — `NodeDetail` rendert `attributes.simulation` (`cost_delta_eur`, `time_delta_days`) als Amber-Pills mit Vorzeichen-Formatierung.
- **ζ — KI-Vorschlags-Knoten** — Recommendation-Node-Kind aus `ai_proposals` ist Teil von `RING_ORDER` und `KIND_LABEL`; Aggregator bezieht sie ein.

### 2026-05-12 — Motion polish (η)

CIA-Verdict (2026-05-11 18:09): **keine** `@xyflow/react`-Adoption, stattdessen framer-motion-Polish auf dem bestehenden SVG-Renderer. `framer-motion ^12.38.0` ist bereits aus PROJ-51 in `package.json`, also keine neue Dep.

- **Node-Enter** — `<motion.g>` mit `initial={{ scale: 0, opacity: 0 }}` → `animate={{ scale: 1, opacity }}`, gestaffelter `delay` per Ring-Index (max 200 ms total).
- **Hover/Focus** — `whileHover={{ scale: 1.15 }}` auf Knoten-Group; `whileTap={{ scale: 0.95 }}` für taktiles Feedback.
- **Critical-Path-Transitions** — Opacity-/Stroke-Width-Wechsel über `animate` statt CSS-Snap, 180 ms Easing.
- **Edge-Fade** — `<motion.line>` mit `animate={{ opacity }}` damit der Overlay-Toggle smooth dimmt.
- **Reduced-Motion** — Respektiert `prefers-reduced-motion` via `useReducedMotion()`; in dem Fall werden Animations-Durations auf 0 reduziert.

Keine Schema-Änderungen. Aggregator + API + Layout bleiben unverändert. Tests: Vitest-Suite bleibt grün; build/lint clean.

### 2026-05-12 — Product re-scope: 3D-Verbindungsgraph (θ) ist Must-have

User-Entscheidung: Eine saubere 3D-Darstellung der Verbindungen ist Pflicht. Die fruehere 2D-first/3D-deferred Linie bleibt historisch dokumentiert, ist aber fuer den PROJ-58-Zielzustand superseded.

Konsequenz:

- PROJ-58 wird wieder auf **In Progress** gesetzt, bis `58-θ` gebaut, QA-geprueft und deployed ist.
- Bestehende 2D-SVG-Ansicht bleibt als Fallback und fachliche Basis erhalten.
- `/architecture` muss den 3D-Renderer locken. Da aktuell nur `framer-motion` im Dependency-Tree vorhanden ist und `three`/`@react-three/fiber` noch nicht installiert sind, ist die Dependency-Entscheidung vor Implementierung explizit zu dokumentieren.
- `58-θ` darf keine 3D-Spielerei werden: Akzeptanzkriterium ist lesbare, interaktive, raeumliche Kanten-/Knoten-Semantik fuer echte Projektsteuerung.

## QA Test Results

- 3 aggregator unit tests pinning node-kind counts, dangling-edge filter, empty-project handling.
- 1 Playwright auth-gate smoke.
- 0 Critical / High Bugs.

## Deployment

- **Date deployed:** 2026-05-11 initial graph slices; 2026-05-12 η motion-polish closeout.
- **Production URL:** https://projektplattform-v3.vercel.app
- **Production deployment verified:** `dpl_H2dSdTHDYdg1KUr4NPk59hGnRiYS` — Ready, production alias `https://projektplattform-v3.vercel.app`.
- **Route probe:** `/projects/[id]/graph` returns HTTP 307 to `/login?...`, confirming the auth-gated graph route is registered on production.
- **DB migration:** keine.
- **Rollback plan:** `git revert` of the relevant PROJ-58 commits (`6af5483`, later closing batches, or `1cb86e0` for η only), then Vercel redeploy. Keine DB-Implikationen.
