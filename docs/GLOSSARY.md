# GLOSSARY — Fachbegriffe DE/EN

Einzige Quelle für Terminologie dieses Projekts.
Wo ein Begriff mehrdeutig ist oder DE/EN auseinanderlaufen, steht die Entscheidung hier.

## Abgrenzungen (wichtig)

### Stakeholder ≠ User
- **Stakeholder** — fachliche Rolle im Projekt (z. B. Lenkungskreis, Fachbereichsleiter, Lieferant). Projekt-Domain.
- **User** — technischer Account im System (RBAC-Domain). Nicht zwingend Stakeholder.
- Ein User kann mehrere Stakeholder-Rollen haben; ein Stakeholder kann ohne User existieren.
- Detail: [planning/decisions/stakeholder-vs-user.md](planning/decisions/stakeholder-vs-user.md)

### Projekt vs. Projekt-Typ
- **Projekt** — konkrete Instanz (z. B. „SAP-Rollout 2026").
- **Projekt-Typ** — Klassifikation (ERP / Bau / Software). Steuert Extension-Module.

### Core vs. Extension
- **Core** — für **alle** Projekt-Typen gültig: Projects, Phases, Milestones, Tasks, Dependencies, Risks, Stakeholders, Decisions.
- **Extension** — typ-spezifisch: ERP-Vendor-Prozess, Bau-Gewerke, Software-Releases.

### Kontextquelle (Context Source)
- Externe Informationsquelle: E-Mail, Meeting-Protokoll, Vertrag, Dokument.
- Registriert, verfolgbar, KI-analysefähig. Nicht identisch mit „Anhang".

### Orchestrierung vs. Workflow-Engine
- **Orchestrierung** — unser internes State-Machine-/Workflow-Modul (`services/orchestrator/`). Framework-unabhängig, LangGraph-kompatibel entworfen.
- **Workflow-Engine** — hypothetischer Adapter zu einer externen Engine (z. B. LangGraph). Nicht der Kern.

## DE → EN (fachlich)

| Deutsch | Englisch | Hinweis |
|---|---|---|
| Aufgabe | Task | Core-Entität |
| Abhängigkeit | Dependency | zwischen Tasks |
| Meilenstein | Milestone | |
| Phase | Phase | |
| Stammdaten | Master Data | Projekt-Stammdaten |
| Lifecycle-Status | Lifecycle Status | Entwurf / Aktiv / Abgeschlossen |
| Risiko | Risk | |
| Offener Punkt | Open Item | |
| Entscheidung | Decision | ADR, wenn architektonisch |
| Rückverfolgbarkeit | Traceability | Source-Traceability |
| Lieferantenprozess | Vendor Process | ERP-Extension |
| Bewertungsmatrix | Evaluation Matrix | |
| Genehmigung | Approval | Governance |
| Eskalation | Escalation | |
| Vorschlag (KI) | Proposal | reviewable, traceable |

## Technische Kurzformen

- **ADR** — Architecture Decision Record. Format: `planning/decisions/<slug>.md`.
- **RBAC** — Role-Based Access Control. Implementierung auf API-Ebene (FastAPI Dependencies).
- **MCP** — Model Context Protocol. Tool-Connectivity-Standard für LLMs.
- **LLM** — Large Language Model (primär Claude).

## Sprachregel

- **Fachlich / produktseitig** (`planning/`, `workspace/`, Vision, Stories) → **Deutsch**.
- **Technisch / Claude-seitig** (`CLAUDE.md`, `build/`, `docs/architecture/`, Code, Kommentare) → **Englisch**, bis auf direkte Fachzitate.
- Gemischte Dokumente sind erlaubt, wenn sie Domäne + Technik verbinden (z. B. `build/CONTEXT.md`).
