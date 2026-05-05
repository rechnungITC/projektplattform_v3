# Feature Index

> Central tracking for all features. Updated by skills automatically.

## Status Legend
- **Planned** - `/requirements` done, spec written, architecture not yet designed
- **Architected** - `/architecture` done, tech design approved, ready to build
- **In Progress** - `/frontend` or `/backend` active or completed, not yet in QA
- **In Review** - `/qa` active, testing in progress
- **Approved** - `/qa` passed, no critical/high bugs, ready to deploy
- **Deployed** - `/deploy` done, live in production

## Features

| ID | Feature | Status | Spec | Created |
|----|---------|--------|------|---------|
| PROJ-1 | Authentication, Tenants, Role-Based Membership | Deployed | [Spec](PROJ-1-auth-tenants-roles.md) | 2026-04-25 |
| PROJ-2 | Project CRUD + Lifecycle State Machine | Deployed | [Spec](PROJ-2-project-crud-lifecycle.md) | 2026-04-25 |
| PROJ-3 | Tenant Operations and Deployment Modes (Stand-alone vs SaaS) | Deployed | [Spec](PROJ-3-tenant-ops-deployment-modes.md) | 2026-04-25 |
| PROJ-4 | Platform Foundation — Navigation, Project Roles, RBAC Enforcement | Deployed | [Spec](PROJ-4-platform-foundation-navigation-rbac.md) | 2026-04-25 |
| PROJ-5 | Guided Project Creation Wizard with Type/Method-Aware Questions | Deployed | [Spec](PROJ-5-guided-project-creation-wizard.md) | 2026-04-25 |
| PROJ-6 | Project Types, Methods Catalog, and Rule Engine | Deployed | [Spec](PROJ-6-project-types-methods-rule-engine.md) | 2026-04-25 |
| PROJ-7 | Project Room with Internal Kanban / Scrum / Gantt Modules | Deployed (MVP slice) | [Spec](PROJ-7-project-room-internal-modules.md) | 2026-04-25 |
| PROJ-8 | Stakeholders and Organization | Deployed | [Spec](PROJ-8-stakeholders-organization.md) | 2026-04-25 |
| PROJ-9 | Work Item Metamodel — Backlog Structure (+ Round-2: polymorphic dependencies · outline_path · extended ALLOWED_PARENT_KINDS) | Deployed (R1 + R2 live) | [Spec](PROJ-9-work-item-metamodel-backlog.md) | 2026-04-25 |
| PROJ-10 | Change Management — Field-level Versioning, Compare, Undo, Copy, Audit | Deployed | [Spec](PROJ-10-change-management-versioning.md) | 2026-04-25 |
| PROJ-11 | Resources, Capacities, and Schedule Logic | Deployed | [Spec](PROJ-11-resources-capacity-schedule.md) | 2026-04-25 |
| PROJ-12 | KI Assistance and Data-Privacy Paths | Deployed | [Spec](PROJ-12-ki-assistance-privacy-paths.md) | 2026-04-25 |
| PROJ-13 | Communication Center, Email/Slack/Teams Send, Internal Project Chat | Deployed | [Spec](PROJ-13-communication-chat.md) | 2026-04-25 |
| PROJ-14 | Connector Framework, Jira Integration, MCP Bridge, Stand-alone Hooks | Deployed (Plumbing slice) | [Spec](PROJ-14-integrations-connectors.md) | 2026-04-25 |
| PROJ-15 | Vendor and Procurement (Stammdaten, Eval Matrix, Document Slots) | Deployed | [Spec](PROJ-15-vendor-procurement.md) | 2026-04-25 |
| PROJ-16 | Master Data UI — Users, Stakeholder Rollup, Catalog Overrides | Deployed | [Spec](PROJ-16-master-data-ui.md) | 2026-04-25 |
| PROJ-17 | Tenant Administration — Branding, Modules, Privacy, Export, Offboarding | Deployed | [Spec](PROJ-17-tenant-administration.md) | 2026-04-25 |
| PROJ-18 | Compliance Automatik & Process Templates | Deployed | [Spec](PROJ-18-compliance-automatik.md) | 2026-04-25 |
| PROJ-19 | Phases & Milestones — Cross-cutting Schedule Backbone | Deployed | [Spec](PROJ-19-phases-milestones-cross-cutting.md) | 2026-04-25 |
| PROJ-20 | Risks & Decisions Catalog (Cross-cutting Governance Backbone) | Deployed | [Spec](PROJ-20-risks-decisions-catalog.md) | 2026-04-25 |
| PROJ-21 | Output Rendering — Status-Report & Executive-Summary | Deployed | [Spec](PROJ-21-output-rendering.md) | 2026-04-30 |
| PROJ-22 | Budget-Modul mit Historisierung, Vendor-Integration & Multi-Currency | Deployed | [Spec](PROJ-22-budget-modul.md) | 2026-04-30 |
| PROJ-23 | Globale Sidebar-Navigation (UI-Refactor) | Deployed | [Spec](PROJ-23-sidebar-global.md) | 2026-04-30 |
| PROJ-24 | Cost-Stack — Tagessätze pro Rolle, Velocity-Modell & Kosten pro Work-Item | Deployed (24-α/β/γ/δ/ε live in production) | [Spec](PROJ-24-cost-stack.md) | 2026-04-30 |
| PROJ-25 | Drag-and-Drop Stack — Backlog↔Sprint + Gantt voll (SVAR React Gantt MIT · polymorphe Deps · Critical-Path manuell · Phasen-Container-Mitziehen) | Deployed (Gantt half live — Stages 1-5 + Today/Zoom/Edit-Dialog; Backlog↔Sprint DnD deferred to PROJ-25b) | [Spec](PROJ-25-dnd-stack.md) | 2026-04-30 |
| PROJ-26 | Method-Gating für Schedule-Constructs (Sprints, Phasen, Milestones) | Deployed | [Spec](PROJ-26-method-gating-schedule-constructs.md) | 2026-05-01 |
| PROJ-27 | Cross-Project Work-Item Links + Sub-Project Bridge | Architected | [Spec](PROJ-27-cross-project-links-and-subproject-bridge.md) | 2026-05-01 |
| PROJ-28 | Method-aware Project-Room Navigation (Labels + Routes) | Deployed | [Spec](PROJ-28-method-aware-navigation.md) | 2026-05-01 |
| PROJ-29 | Hygiene-Slice (Lint-Baseline · Function-Hardening · Auth-Fixture-Skelett) | Deployed | [Spec](PROJ-29-hygiene-slice.md) | 2026-05-01 |
| PROJ-30 | KI-Narrative-Purpose Erweiterung des AI-Routers | Deployed | [Spec](PROJ-30-narrative-purpose-extension.md) | 2026-05-01 |
| PROJ-31 | Approval-Gates für formale Decisions (Quorum, Magic-Link für externe Stakeholder) | Deployed | [Spec](PROJ-31-approval-gates-for-decisions.md) | 2026-05-02 |
| PROJ-32 | Tenant Custom AI Provider Keys (Multi-Provider Anthropic / OpenAI / Google / Ollama) — 4 Sub-Slices | Deployed (full slice: 32a + 32b + 32c + 32d all live) | [Spec](PROJ-32-tenant-ai-provider-keys.md) | 2026-05-04 |
| PROJ-33 | Erweitertes Stakeholder-Management (qualitative Felder + Skill/Big5-Profile + Self-Assessment Magic-Link) | Deployed (33-α + β + γ + δ live) | [Spec](PROJ-33-stakeholder-extension.md) | 2026-05-02 |
| PROJ-34 | Stakeholder Communication Tracking (Interaktionshistorie, Sentiment, Kooperationssignale, Reaktionsverhalten, Coaching-Kontext) | Planned | [Spec](PROJ-34-stakeholder-communication-tracking.md) | 2026-05-06 |
| PROJ-35 | Stakeholder-Wechselwirkungs-Engine (Risiko-Score, Eskalations-Indikatoren, Tonalitäts-Empfehlungen, Critical-Path-Risk, Stakeholder-Health-Dashboard) | Deployed (alle 3 Phasen α + β + γ live) | [Spec](PROJ-35-stakeholder-interaction-engine.md) | 2026-05-02 |
| PROJ-36 | Waterfall-WBS UI/UX Layer — WBS-Code (auto+override) · Hybrid Roll-up · Tree-View (react-arborist) · Indent/Outdent. Schema-Backbone in PROJ-9-R2. | Deployed (α re-deployed 2026-05-04 + γ live, β deferred) | [Spec](PROJ-36-waterfall-wbs-hierarchy-rollup.md) | 2026-05-03 |
| PROJ-37 | Voice Agent Assistant ("Hey Sven") — sprachgesteuerter Projektassistent mit Wake/Push-to-Talk, Gesprächs-Overlay, Statusabfragen, Navigation und gesicherter Aktionsausführung über bestehende Flows. | Planned | [Spec](PROJ-37-voice-agent-assistant.md) | 2026-05-04 |
| PROJ-38 | Assistant Orchestrator & Intent Runtime — technische Laufzeitschicht für Intent-Erkennung, Bestätigungsgates, Tool-/API-Ausführung, Session-Kontext und Audit hinter dem Voice/Text-Assistenten. | Planned | [Spec](PROJ-38-assistant-orchestrator-intent-runtime.md) | 2026-05-04 |
| PROJ-39 | Assistant Action Packs — konkrete v1-Fähigkeiten für Projektstatus, Navigation, Projekt-Suche/Öffnen und dialogische Projektanlage über Wizard-/Report-/Project-Room-Integrationen. | Planned | [Spec](PROJ-39-assistant-action-packs-project-status-navigation-creation.md) | 2026-05-04 |
| PROJ-40 | Assistant Conversation Audit & Transcript Governance — Persistenz-, Redaktions-, Audit-, Retention- und Export-Governance für Assistant-Sessions, Turns und Transkripte. | Planned | [Spec](PROJ-40-assistant-conversation-audit-transcript-governance.md) | 2026-05-04 |
| PROJ-41 | Assistant Speech, Provider & Wake-Word Infrastructure — Speech-to-Text, Text-to-Speech, Wake-/Push-to-Talk-Modi, Providerwahl, Fallbacks und Deployment-/Mikrofonvoraussetzungen. | Planned | [Spec](PROJ-41-assistant-speech-provider-wakeword-infrastructure.md) | 2026-05-04 |
| PROJ-42 | Schema-Drift-CI-Guard — GitHub-Actions-Workflow als Required-Check auf `main`, der `.from(...).select(...)`-Calls in `src/` via TypeScript-AST gegen `information_schema.columns` einer Docker-Shadow-DB prüft. Hard-Fail bei Drift. α-Slice: SELECT-only; β/γ deferred (INSERT/UPDATE/Zod, Prod-Drift). | Deployed (α live; manual branch-protection setup pending) | [Spec](PROJ-42-schema-drift-ci-guard.md) | 2026-05-04 |
| PROJ-25b | Backlog ↔ Sprint Drag-and-Drop — `@dnd-kit/core` + a11y-Polish (aria-live, Keyboard-DnD, Escape-Cancel) + Multi-Select (Ctrl/Shift-Click + Bulk-API) + Performance-Benchmark (60fps Target). Schließt PROJ-25-Deferred-Items D-1 bis D-5. | Approved (QA passed 2026-05-06; E2E + Perf-Bench deferred as PROJ-25b-α) | [Spec](PROJ-25b-backlog-sprint-dnd.md) | 2026-05-05 |
| PROJ-43 | Stakeholder-Health Critical-Path Detection — Korrektheits- und Coverage-Fix. α: `responsible_user_id`-Pfad + `linked_user_id`-only-Resources + Projekt-Filter (must-have, kein Schema-Change). β: `sprints.is_critical` + Method-Gating für Scrum (should-have). γ: zweiter computed-Flag aus `compute_critical_path_phases` ohne Trigger (deferred). CIA-reviewed. | Deployed (α live 2026-05-06) + In Progress (β backend: migration + method-gated route + 4 tests; awaiting /frontend Sprint-checkbox + /qa) | [Spec](PROJ-43-stakeholder-critical-path-detection-fix.md) | 2026-05-05 |
| PROJ-44 | Context Ingestion Pipeline — Dokumente, E-Mails und Meeting-Notizen als strukturierte Context Sources mit Normalisierung, Privacy-Klassifizierung und Proposal-Queue | Planned | [Spec](PROJ-44-context-ingestion-pipeline.md) | 2026-05-06 |
| PROJ-45 | Construction Extension — Gewerke, Bauabschnitte, Abnahmen, Mängel und bauprojektspezifische Termin-/Fortschrittssignale | Planned | [Spec](PROJ-45-construction-extension.md) | 2026-05-06 |
| PROJ-46 | Software Project Extension — Releases, technische Abhängigkeiten, Test-/Abnahme-Traceability und Jira-kompatible Mapping-Felder | Planned | [Spec](PROJ-46-software-extension.md) | 2026-05-06 |
| PROJ-47 | Jira Export Connector — echter Jira-Outbound-Adapter auf PROJ-14-Plumbing mit Field-Mapping, Export-Jobs, Sync-Log und Retry-Verhalten | Planned | [Spec](PROJ-47-jira-export-connector.md) | 2026-05-06 |
| PROJ-48 | MCP Bridge — tenant-scoped MCP Tool Surface mit Class-3-Redaction, minimalem Tool-Set und Audit | Planned | [Spec](PROJ-48-mcp-bridge.md) | 2026-05-06 |
| PROJ-49 | Real Microsoft Teams Adapter — Microsoft Graph/Webhook-Delivery fuer PROJ-13 Outbox statt Stub-Transport | Planned | [Spec](PROJ-49-real-teams-adapter.md) | 2026-05-06 |
| PROJ-50 | Bidirectional Jira Sync — Webhooks, External References, Konfliktauflösung und auditierbare Inbound-Updates | Planned | [Spec](PROJ-50-bidirectional-jira-sync.md) | 2026-05-06 |
| PROJ-51 | Modern UI/UX & Motion System — Design-System-Audit, Corporate-Farben, Interaction Tokens, shadcn/Radix Refresh, Motion Layer und View-Transition-Pruefung | Planned | [Spec](PROJ-51-modern-ui-ux-motion-system.md) | 2026-05-06 |

<!-- Add features above this line -->

## Next Available ID: PROJ-52
