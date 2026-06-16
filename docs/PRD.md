# Product Requirements Document

## Vision

A modular, web-based, AI-supported **project orchestration platform** that turns fragmented project information into structured, actionable project logic.

This is **not** a generic to-do tool, ticket board, or execution-only tracker. It is built to support real enterprise projects — across **ERP implementations**, **construction**, and **software projects** — on a shared foundation that handles the full lifecycle: from project initiation, through structured planning and decision-making, into operational delivery and management steering.

The product thesis: enterprise projects fail at the seams between execution, governance, and communication — not at task tracking. The platform's job is to bridge those seams using a shared project core plus type-specific extensions, with AI that pre-analyzes and proposes structure from emails, meeting notes, and documents — always reviewable, never opaque.

## Target Users

- **Project leads and project managers** running enterprise projects (ERP rollouts, construction projects, software delivery)
- **Project sponsors and steering committee members** who need decision-ready summaries, not raw task lists
- **Key users and business stakeholders** who provide requirements, sign off on milestones, and depend on clear governance
- **Functional roles around the project**: IT, purchasing, works council / staff council, external partners

**Pain points the platform addresses:**
- project information is fragmented across emails, meeting notes, and documents — never structured
- decisions, approvals, and escalations are ad-hoc; no audit trail
- generic PM tools (Trello, Jira) collapse all project types into one flat model and ignore governance
- specialized tools (e.g. construction scheduling) don't share data with the rest of project context
- AI features in existing tools are opaque and not traceable back to the original input

## Core Features (Roadmap)

| ID | Priority | Feature | Status |
|----|----------|---------|--------|
| PROJ-1 | P0 (MVP) | Authentication, Tenants, Role-Based Membership (Supabase Auth + RLS) | In Progress |
| PROJ-2 | P0 (MVP) | Project CRUD + Lifecycle State Machine (Draft → Active → Paused → Completed/Canceled) | Planned |
| PROJ-3 | P0 (MVP) | Tenant Operations and Deployment Modes (Stand-alone vs SaaS) | Planned |
| PROJ-4 | P0 (MVP) | Platform Foundation: Navigation, Project Roles, RBAC Enforcement | Planned |
| PROJ-5 | P0 (MVP) | Guided Project Creation Wizard with Type/Method-Aware Questions | Planned |
| PROJ-6 | P0 (MVP) | Project Types, Methods Catalog, and Rule Engine | Planned |
| PROJ-19 | P0 (MVP) | Shared core: Phases, Milestones (cross-cutting schedule backbone) | Planned |
| PROJ-9 | P0 (MVP) | Shared core: Work Items (Epic/Story/Task/Subtask/Bug/Work Package) | Planned |
| PROJ-7 | P0 (MVP) | Project Room with Internal Kanban / Scrum / Gantt Modules + Risks/Budget | Planned |
| PROJ-8 | P0 (MVP) | Shared core: Stakeholders | Planned |
| PROJ-20 | P0 (MVP) | Shared core: Risks (cross-link), Decisions, Open Items | Planned |
| PROJ-10 | P0 (MVP) | Change Management: field-level versioning, compare, undo, copy, audit | Planned |
| PROJ-15 | P1 | ERP extension: vendor evaluation, vendor master data, document slots | Planned |
| PROJ-12 | P1 | Context ingestion + AI-supported proposals (Claude, traceable, reviewable) | Planned |
| PROJ-13 | P1 | Communication center, email/Slack/Teams send, internal project chat | Planned |
| PROJ-11 | P1 | Resources, capacities, utilization across projects | Planned |
| PROJ-14 | P1 | Connector framework + Jira integration + MCP bridge | Planned |
| PROJ-16 | P1 | Master Data UI: users, stakeholder rollup, catalog overrides | Planned |
| PROJ-17 | P1 | Tenant Administration: branding, modules, privacy defaults, export, offboarding | Planned |
| PROJ-18 | P1 | Compliance Automatik & Process Templates (ISO/DSGVO/MS-365/vendor-eval/...) | Planned |
| _TBD_ | P2 | Construction extension: trades, sections, schedule logic, Gantt views | Planned |
| _TBD_ | P2 | Software project extension: sprints, releases, technical dependencies | Planned |
| PROJ-21 | P2 | Output rendering: Status-Report + Executive-Summary (HTML+PDF). Gantt, PPTX, Markdown deferred to PROJ-21b/c. | Deployed |
| PROJ-22 | P1 | Budget-Modul: 3 Ebenen (Kategorien/Posten/Buchungen) + Vendor-Invoice-Integration + Multi-Currency mit FX. Schließt P0-Lücke aus PROJ-7. | Planned |
| PROJ-23 | P2 | Globale Sidebar-Navigation: Top-Level + Project-Room als vertikale Sidebar links, mit Branding + Hotkeys + Persistenz. Reine UI-Foundation. | Planned |
| PROJ-24 | P2 | Cost-Stack: role_rates (versioniert), Velocity-Modell für Stories, generische work_item_cost_lines mit source_type für spätere Erweiterung (LV, Stückliste). | Planned |
| PROJ-25 | P2 | Drag-and-Drop: Backlog↔Sprint, Gantt-Verschieben/Resize/Dependencies-Linien. Erweiterung PROJ-7 + PROJ-19. | Deployed (Gantt half) |
| PROJ-25b | P2 | Backlog↔Sprint DnD via `@dnd-kit/core` + a11y-Polish (aria-live, Keyboard-DnD, Escape-Cancel) + Multi-Select (Ctrl/Shift + Bulk-API) + Perf-Benchmark (60fps). Schließt PROJ-25-Deferred-Items D-1 bis D-5. | Planned |
| PROJ-28 | P2 | Method-aware Project-Room Navigation: Sidebar-Labels + URL-Slugs (Wasserfall: /arbeitspakete, /phasen; Scrum: /releases) per Methode. Schließt PROJ-26 deferred-frontend (L1). | Planned |
| PROJ-29 | P2 | Hygiene-Slice: ESLint-Baseline auf 0 (97→0), 3 Supabase-Functions search_path-hardenen, Playwright-Logged-In-Auth-Fixture-Skelett. Quick-Win vor PROJ-21. | Planned |
| PROJ-30 | P1 | KI-Narrative-Purpose: Erweiterung des PROJ-12 AI-Routers um `narrative`-Purpose; ersetzt PROJ-21 preview-ki Stub durch echten AI-Call mit Class-3-Defense-in-Depth. Validates Multi-Purpose-Pattern für PROJ-33. | Deployed |
| PROJ-31 | P1 | Approval-Gates für formale Decisions: paralleles Quorum (M von N), methoden-/phasen-getriebene Gate-Trigger via PROJ-6 Catalog, Stakeholder-as-Approver mit Magic-Link für externe Approver, append-only Audit-Trail. Schließt PRD-Erfolgsmetrik "100% Audit bei formalen Decisions". | Deployed |
| PROJ-32 | P1 | Tenant Custom AI Provider Keys (Anthropic / OpenAI / Google / Ollama) — SaaS-Mandate: Tenants müssen eigene Keys hinterlegen können, Class-3-Routing erzwingt Tenant-Provider. 4 Sub-Slices (32a Anthropic / 32b OpenAI+Google / 32c Ollama+Priority / 32d Cost-Caps). | Planned |
| PROJ-33 | P1 | Erweitertes Stakeholder-Management — qualitative Felder, Skill-Profile, Big5/OCEAN-Persönlichkeit, Self-Assessment via Magic-Link analog PROJ-31. Setup für PROJ-34/35/36-Familie. | Planned |
| PROJ-35 | P1 | Stakeholder-Wechselwirkungs-Engine — tenant-konfigurierbarer Risk-Score (influence × impact × attitude × Big5-modifier), 4 Eskalations-Patterns (MVP-Pflicht), 32-Kombinations-Big5-Tonalitäts-Lookup, Critical-Path-Risk, Health-Dashboard (Page + Tab-Shortcut). 3 Phasen (35-α/β/γ), ~8 PT. | Planned |
| PROJ-36 | P1 | **Waterfall-WBS Hierarchy & Roll-up** — explizite 4-Ebenen-Hierarchie `projects → phases → work_packages → todos` (per ADR-004), WBS-Codes (auto + override), `outline_path ltree`, Hybrid-Roll-up (derived + own additiv, OpenProject-Pattern), polymorphe `dependencies`-Tabelle (`from_type`/`to_type`/`constraint_type` — ersetzt PROJ-9 work-item-only-Dependencies und PROJ-25-geplante `phase_dependencies`), Tree-View neben Liste mit Indent/Outdent. Voraussetzung für PROJ-25 Gantt + PROJ-11b Resource-Roll-up. ~6 PT. | Planned |
| PROJ-37 | P1 | Voice Agent Assistant ("Hey Sven") — sprach-/textgesteuerter In-App-Assistent mit Push-to-Talk/Wake-Modus, Gesprächs-Overlay, Statusabfragen, Navigation und bestätigungspflichtiger Aktionsausführung. | Planned |
| PROJ-38 | P1 | Assistant Orchestrator & Intent Runtime — sichere Laufzeitschicht für Intent-Erkennung, Confirmation-Gates, Session-Kontext, Tool-/API-Orchestrierung und Audit hinter dem Assistant. | Planned |
| PROJ-39 | P1 | Assistant Action Packs — erste produktive Assistant-Fähigkeiten: Projektstatus, Navigation, Projekt-Suche/Öffnen und dialogische Projektanlage über den bestehenden Wizard. | Planned |
| PROJ-40 | P1 | Assistant Conversation Audit & Transcript Governance — Governance-Schicht für Assistant-Sessions, Turn-Audit, Transcript-Retention, Redaction, Export und Tenant-Policies. | Planned |
| PROJ-41 | P1 | Assistant Speech, Provider & Wake-Word Infrastructure — Speech-/Provider-Basis für STT, TTS, Wake-/Push-to-Talk, Mikrofon-/Browser-Voraussetzungen und Fallback-Verhalten. | Planned |
| PROJ-42 | P1 | Schema-Drift-CI-Guard — GitHub-Actions-Workflow als Required-Check auf `main`, der `.from(...).select(...)`-Calls in `src/` via TypeScript-AST gegen `information_schema.columns` einer Docker-Shadow-DB prüft. Hard-Fail bei Drift. Reaktion auf 2026-05-04 PROJ-36-α/γ-Inzident. α-Slice: SELECT-only; β/γ später. | Deployed |
| PROJ-43 | P1 | Stakeholder-Health Critical-Path Detection — Korrektheits- und Coverage-Fix für PROJ-35-γ Detection-Query. α: `responsible_user_id`-Pfad + `linked_user_id`-only-Resources + Projekt-Filter (must-have, kein Schema-Change). β: `sprints.is_critical` + Method-Gating für Scrum (should-have). γ: zweiter computed-Flag aus `compute_critical_path_phases` ohne Trigger (deferred). CIA-reviewed 2026-05-05. | Planned |
| PROJ-55 | P1 | Tenant Context, Settings Schema & Audit Hardening — Stabilisiert Active-Tenant-Aufloesung, Module-Settings-Schema und Audit-Tracked-Columns fuer Ressourcen/Allokationen. Muss vor weiterem Resource-/Dashboard-Ausbau laufen. | Planned |
| PROJ-56 | P1 | Project Readiness & Health Command Center — Projektleiter-Cockpit mit Readiness-Checkliste, echten Health-Scores, Next-Best-Actions und Report-Integration statt Health-Stub. | Planned |
| PROJ-57 | P1 | Participant, Stakeholder & Resource Linking Operating Model — Gefuehrte Verknuepfung von Tenant Member, Project Member, Stakeholder, Resource, Rolle und Tagessatz inkl. Class-3-Masking und Rate-Source-Klarheit. | Planned |
| PROJ-58 | P1 | Interactive Project Graph & Decision Simulation — 2D-first Graph-Ansicht fuer Projektobjekte, Abhaengigkeiten, Critical Path, Stakeholder, Risiken, Entscheidungen, Budgetwirkungen und KI-reviewbare Simulationsvorschlaege. | Planned |
| PROJ-64 | P1 | Global Dashboard / My Work Inbox — operative Startseite mit My Work, Approvals, Portfolio-Health, Budget-/Risk-Alerts und Quick Actions statt Dashboard-Placeholder. | Architected |
| _TBD_ | P2 | Governance workflows: approval gates, escalations, formal decisions | Planned |
| _TBD_ | P2 | **Erweitertes Stakeholder-Management**: Skill-/Persönlichkeitsprofile (DISG, lizenz-geklärt), Kommunikations-Tracking (Sentiment/Kooperation/Reaktionszeit), KI-Coaching-Purpose, kritischer-Pfad-Indikator. Domain-Wissen: `docs/Stakeholderwissen/`. Promotion via `/requirements` (Single-Responsibility-Split in 3-4 Specs) + CIA-Review (überschneidet PROJ-8/13/12/30). | Domain-Knowledge |
| PROJ-70 | P1 | Auto-Generated Backlog from Project Kickoff — User lädt Kickoff-Artefakt (PDF/DOCX/.msg/.eml/Text) hoch → KI generiert methodenadäquate Backlog-Hierarchie (Wasserfall/Scrum/Hybrid) → Review-Drawer mit single/bulk-accept + DnD-reparenting → akzeptierte Items werden zu `work_items` mit `ki_provenance`-Trace. Vereinigt PROJ-44-δ + PROJ-44-ε + PROJ-12 `work_items`-Purpose. 5 Sub-Slices α/β/γ/δ/ε. Class-3-Inputs → tenant-Ollama-only. Schließt PRD-Metriken "Time-to-structure < 1h" + "≥ 70% AI-Vorschläge ohne Rework akzeptiert". | In Progress (α + β deployed; γ architected pending CIA done) |
| PROJ-71 | P2 | OCR-Slice für Scan-PDFs — bildbasierte Scan-PDFs liefern aktuell leeres Excerpt. CIA-Followup aus PROJ-70-γ. | Planned (Followup) |
| PROJ-72 | P2 | Streaming-Parse für File-Upload-Skalierung — Buffer-basiertes Parsing sprengt bei > 50 parallelen 25-MB-Uploads die Vercel-Function-Memory. CIA-Followup aus PROJ-70-γ. | Planned (Followup) |
| PROJ-73 | P2 | Mehr Context-Source-Formate (PPTX, XLSX, MD, EML) — PROJ-44 listet diese als Zielquellen; γ deckt nur PDF+DOCX. CIA-Followup. | Planned (Followup) |
| PROJ-74 | P1 | Supply-Chain-Audit-CI — `npm audit --omit=dev` + Snyk-CI als Required-Check analog PROJ-42 Schema-Drift-Guard. CIA-Followup; Hygiene-Slice analog PROJ-29. | Deployed (Required-Checks enforced 2026-06-10; SNYK_TOKEN-Handoff offen) |
| PROJ-75 | P1 | Class-3-Re-Classification nach Parse — `detectClass3Markers` läuft auf 8000-char-Excerpt; Original-PDF kann mehr PII enthalten. CIA-Followup mit DSGVO-Implikation. | Planned (Followup) |
| PROJ-86 | P1 | Class-3-Klassifizierer DE-False-Positive-Fix — `NAME_PATTERN` matcht jedes deutsche Großschreib-Bigramm → jedes DE-Dokument fälschlich Class-3 → Cloud gesperrt → Stub → 0 Vorschläge (live belegt: 9/9 Prod-Läufe). Fix: anrede-/label-gebundene Namenserkennung, Email/Phone behalten, Defense-in-depth bleibt. Entsperrt PROJ-70. Sicherheitsrelevant/DSGVO. | Deployed |
| PROJ-91 | P1 | AI Backlog Grounding in Project Intent — Generierung sieht das Wizard-„Vorhaben" (`projects.description`) nicht → KI validiert Kickoff-Inhalte nicht gegen das Projektziel. Fix: Vorhaben in Kontext+Prompt (Grounding) + `relevance`-Flag (`on_goal`/`off_goal`) + „≠ Ziel"-Badge. „Grounding + Relevanz-Flag" (kein Block). | Deployed |
| PROJ-87 | P1 | AIProposalDrawer Surfacing in Backlog + Gantt — KI-Backlog-Einstieg dort, wo PMs arbeiten, statt nur im Trajektorien-Graphen. Reuse PROJ-70-Routen, kein neuer Backend-Code. | Deployed |
| PROJ-88 | P1 | KI-Stakeholder-Vorschläge aus Kontext — `proposal_stakeholders_from_context`: Stakeholder aus Kickoff → Resource/Project-Member + Rolle (PROJ-57-Brücke). Class-3 → Ollama-only by design. Geschwister von PROJ-70. | Deployed |
| PROJ-89 | P1 | KI-Risiko-Vorschläge aus Kontext — `proposal_risks_from_context`: Risiken AUS dem Kickoff-Dokument (Abgrenzung zu PROJ-12 `risks`). Class-2-fähig → Cloud. Persistiert in PROJ-20. Geschwister von PROJ-70. | Deployed |
| PROJ-90 | P1 | Orchestrierter „Projekt befüllen" — Multi-Tab Generate-All + Accept-All über Backlog/Stakeholder/Risiken nach Wizard-Finalize; methoden-adäquat in bestehende Strukturen, 30s-Undo, auditierbar. Implementiert „Generate-All + Accept-All" (kein stilles Mutieren). Epic-Klammer über PROJ-87/88/89. | Deployed |
| PROJ-92 | P1 | Azure OpenAI Provider (Class-1/2) — fünfter Provider-Typ (tenant-eigene Azure-Ressource, EU-Region-Allowlist, openai-compatible Factory ohne neues Dep). Invariante #3 unberührt. | Planned |
| PROJ-93 | P1 | Trusted-EU-Processor — kontrollierte, opt-in Class-3-Freigabe NUR für DPA-attestiertes Azure OpenAI im EU-Kunden-Tenant; DPA-konditionaler DB-CHECK, ADR + Invariante-#3-Präzisierung. Ohne Attest: Ollama-only unverändert. | Planned |
| PROJ-134 | P1 | Migration-Versions-Drift-Guard & Naming-Konvention — MCP `apply_migration` vergibt eigene Timestamps ≠ Repo-Dateiname → `supabase db push`-Bruch + Präfix-Kollisionen (3× belegt: PROJ-69/89/50). Prozessregel + Repo-lokaler Required-Check (Kollision/Format hard-fail, Idempotenz/Sekunden-Timestamp warn) + Bestands-Verifikation. CIA-reviewed; Hygiene-Slice analog PROJ-42; kein neuer Dep. | Planned |
| PROJ-135 | P1 | Dialogische Wizard-Rückfragen — aus PROJ-90 „Next/Later" promotet. Neuer AIPurpose `clarifying_questions_from_context`: KI stellt nach Kickoff-Upload VOR Finalize EINE Runde 3–6 überspringbarer Rückfragen zu Dokument-Lücken; Antworten als Q&A-Addendum am `context_source` (Vorhaben unberührt → PROJ-91-Invariante), von PROJ-70/88/89-Generierung mitgelesen. Standard-Routing (Class-3 Ollama-only, ohne Ollama graceful skip), Cost-Cap, kein stilles Mutieren. CIA-Review bei /architecture. | Planned |

### Recommended Delivery Sequence — Assistant Track

To avoid a flashy but unreliable assistant, the voice/agent roadmap should be delivered as a controlled sequence rather than a broad MVP dump:

1. **Release 1 — Controlled Assistant Core**
   - PROJ-37 baseline shell only (overlay, text-first or push-to-talk entry)
   - PROJ-38 core runtime (intent schema, confirmation gates, session context, policy checks)
   - PROJ-39 first action packs (project status, project lookup/open, navigation, project creation via wizard draft/review)
   - Goal: useful assistant behavior without uncontrolled mutation or free-form agent drift

2. **Release 2 — Governance & Audit Hardening**
   - PROJ-40 conversation audit, transcript governance, retention, export/redaction compatibility
   - Goal: assistant becomes enterprise-safe, not just usable

3. **Release 3 — Speech / Provider Infrastructure**
   - PROJ-41 speech-to-text, text-to-speech, provider controls, browser/deployment readiness, optional wake-word behind flag
   - Goal: voice UX becomes robust after runtime and governance are stable

4. **Release 4 — Domain Expansion**
   - later assistant domain packs beyond the initial project-status/navigation/creation scope
   - Goal: broaden capability only after the core is reliable

This sequence is deliberate: **runtime first, governed actions second, compliance third, comfort last**.

## Success Metrics

_To be refined with stakeholders. Initial proposals:_

- **Adoption (3 months):** ≥ 1 ERP project actively managed end-to-end on the platform
- **Coverage:** ≥ 80% of project artifacts (tasks, risks, decisions, stakeholders) created or proposed by the platform rather than parallel tools
- **AI quality:** ≥ 70% of AI-derived proposals accepted by the user without significant rework
- **Governance:** 100% of formal decisions and approvals have a traceable audit trail
- **Time-to-structure:** initial project setup from kick-off email/document to structured project plan in < 1 hour (vs. days manually)

## Constraints

**Technical:**
- Stack is fixed: **Next.js 16 (App Router) + TypeScript + Supabase** (PostgreSQL, Auth, Storage, Realtime, Edge Functions)
- No separate Python/FastAPI services in MVP — business logic lives in API routes and Edge Functions
- LLM: **Claude** as primary model (via Anthropic SDK in Edge Functions). Other models optional later.
- Tool connectivity: **MCP-first** for external integrations
- Deployment: Vercel (frontend) + Supabase (backend)

**Architectural:**
- Multi-tenant from day 1 — Supabase Row-Level Security on every table
- Shared project core, project-type-specific extensions — never blur them
- AI proposals must be **traceable** (link back to source context) and **reviewable** (human accepts/rejects)
- Incremental delivery — bounded, reviewable increments only

**Product:**
- Reuse V2's validated domain model (entities, lifecycle states, role distinctions) — do not reopen those decisions
- Build the shared core first; ERP extension second; construction and software extensions architecturally accommodated but deprioritized for MVP

## Non-Goals

- ❌ A generic to-do tool, Kanban board, or Trello/Jira clone
- ❌ Execution-only tracking without governance, decisions, or analysis layers
- ❌ One flat data model that collapses ERP, construction, and software projects together
- ❌ Opaque AI automation that creates artifacts without human review or source traceability
- ❌ Reintroducing V2's heavier stack (FastAPI, Redis workers, custom S3) in MVP — only revisit if Supabase Edge Functions prove insufficient
- ❌ Building all 12 epics at once — strictly P0 first, then P1, then P2

---

_Use `/requirements` to create detailed feature specifications for each item in the roadmap above._
