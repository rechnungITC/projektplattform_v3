# Open, Deferred, and Partial Feature Status

**Stand:** 2026-06-05
**Quellen:** [features/INDEX.md](INDEX.md) plus Quercheck der verlinkten PROJ-Specs.
**Zweck:** Diese Datei ist der Planungs- und QA-Guardrail fuer bewusst offene
Feature-Reste. Vor neuen `/requirements`, `/architecture`, `/qa` oder
`/deploy`-Entscheidungen pruefen, ob ein Punkt hier betroffen ist.

## Pflege-Regel

- Wenn ein PROJ-Status in [features/INDEX.md](INDEX.md) geaendert wird, diese
  Datei im selben PR/Commit mitpruefen.
- Wenn ein Deferred durch einen neuen PROJ geschlossen oder superseded wird,
  hier von "offen" nach "geschlossen/superseded" umhaengen oder entfernen.
- Historische `PARTIAL`-QA-Bloecke in Specs nicht blind als offen zaehlen:
  zuerst spaetere Fix-, QA-, Deployment- oder Status-Closure-Abschnitte
  pruefen.
- Bei `/qa`: ein Feature ist nur dann "vollstaendig", wenn offene Punkte aus
  dieser Datei entweder geloest, bewusst deferred oder als Out-of-Scope
  bestaetigt sind.

## Nicht abgeschlossen

| PROJ | Status laut Index | Offen / warum |
|---|---|---|
| [PROJ-45](PROJ-45-construction-extension.md) | Planned | Construction Extension noch nicht gebaut. Wartet auf dedizierten Extension-Slice fuer Gewerke, Bauabschnitte, Abnahmen, Maengel. |
| [PROJ-46](PROJ-46-software-extension.md) | Planned | Software Extension noch nicht gebaut. Release-/Test-/Tech-Dependency-Modell soll nicht den Shared Core aufblasen. |
| [PROJ-47](PROJ-47-jira-export-connector.md) | Approved | Outbound-Jira-MVP ist fertig, aber im Index noch nicht Deployed. Offen/deferred: dedizierter Playwright-Jira-Mock-Flow; inbound/webhooks/conflicts bleiben PROJ-50. |
| [PROJ-48](PROJ-48-mcp-bridge.md) | Planned | MCP Bridge noch nicht gebaut. Braucht tenant-scoped Tool-Surface, Class-3-Redaction und Audit. |
| [PROJ-49](PROJ-49-real-teams-adapter.md) | Planned | Echter Teams-Adapter noch nicht gebaut. Aktuell nur Stub/Framework; Graph/Webhook-Delivery kommt separat. |
| [PROJ-50](PROJ-50-bidirectional-jira-sync.md) | Planned | Bidirectional Jira Sync noch nicht gebaut. Wartet auf PROJ-47 als Outbound-Basis; Webhooks, Konflikte, Inbound-Updates sind eigener Slice. |
| [PROJ-67](PROJ-67-codebase-review-quality-hardening.md) | In Progress | Quality-Hardening offen: Visual-Regression, Full-E2E/WebKit-Infra, Hydration-Warnungen, lokaler Schema-Drift-Pfad, GitNexus-Query-FTS. |
| [PROJ-69](PROJ-69-db-index-audit.md) | In Progress | Triage erledigt; DB-Migrationen fehlen noch: Add-Missing-FK-Indexes, Drop-Unused-Indexes, Audit-Comments, Advisor-Recheck. |
| [PROJ-70](PROJ-70-auto-generated-backlog-from-kickoff.md) | Approved / In Progress / Planned | Alpha + beta approved/deployed. Gamma Backend gebaut, aber QA-Pass offen. Delta `.msg`/`.eml` + DnD-Reparenting planned. Epsilon Wizard-Integration planned. |
| PROJ-71 | Planned (Followup) | OCR fuer Scan-PDFs aus PROJ-70-gamma-Followup. Spec pending; pilot-feedback-getrieben. |
| PROJ-72 | Planned (Followup) | Streaming/Chunked Parse fuer Upload-Skalierung. Spec pending; erst bei realer Last relevant. |
| PROJ-73 | Planned (Followup) | Mehr Context-Source-Formate: PPTX, XLSX, MD, EML. Spec pending; knuepft an PROJ-44/70 an. |
| PROJ-74 | Planned (Followup) | Supply-Chain-Audit-CI mit `npm audit --omit=dev`/Snyk als Required-Check. Spec pending. |
| PROJ-75 | Planned (Followup) | Class-3-Re-Classification nach Parse/Volltext. Spec pending; Security-Hardening aus PROJ-70-gamma. |

## Deployed, aber mit bewussten Deferreds / Partial-Coverage

Diese Punkte sind nicht automatisch Blocker. Sie muessen aber bei Scope,
Pilot-Freigabe, QA und neuen Slices explizit beruecksichtigt werden.

| PROJ | Status laut Index | Deferred / Partial |
|---|---|---|
| [PROJ-1](PROJ-1-auth-tenants-roles.md) | Deployed | PARTIAL laut Spec: Domain-Claim UI nicht browsergetestet; Invite/Role-Management live an korrektem `SUPABASE_SERVICE_ROLE_KEY` und Multi-User-Test gekoppelt. |
| [PROJ-2](PROJ-2-project-crud-lifecycle.md) | Deployed | PARTIAL: Live-Hard-Delete wegen Service-Role-Key damals nicht testbar; optimistic concurrency bewusst P1/deferred. |
| [PROJ-7](PROJ-7-project-room-internal-modules.md) | Deployed (MVP slice) | Project-Room nur MVP-Schnitt; u.a. WIP-Limits, Velocity/Burndown, Resource-Swimlanes, Phase-Gates, tenant-konfigurierbare Health-Thresholds deferred oder spaeteren PROJs zugeordnet. |
| [PROJ-14](PROJ-14-integrations-connectors.md) | Deployed (Plumbing slice) | Nur Connector-Plumbing. Echte Adapter/Folgeslices: Jira outbound PROJ-47, MCP PROJ-48, Teams PROJ-49, bidirectional Jira PROJ-50. |
| [PROJ-18](PROJ-18-compliance-automatik.md) | Deployed | ST-06 Template-UI deferred zu PROJ-18b; Carry-over bleibt INSERT-Provenance nur in `attributes`. Geschlossen am 2026-06-05: Plattform-Default-Tags sind nicht mehr umbenennbar; Phase-Close zeigt Compliance-Warnungen als Confirm-Modal. |
| [PROJ-23](PROJ-23-sidebar-global.md) | Deployed | PARTIAL: server-side viewport default nicht implementiert; mobile wird clientseitig ueber shadcn geregelt. |
| [PROJ-25](PROJ-25-dnd-stack.md) | Deployed (Gantt half) | Backlog-Sprint-DnD ist durch PROJ-25b geschlossen; offen bleiben Gantt-Followups wie Auto-Schedule, Touch-Polish, Realtime-Cursors, Undo, erweiterte Dependency-/Critical-Path-Math. |
| [PROJ-25b](PROJ-25b-backlog-sprint-dnd.md) | Deployed | PROJ-25b-alpha Coverage-Uplift am 2026-06-05 gelandet: Selection-Perf-Smoke + authentifizierter Playwright Backlog-DnD-Smoke. Weitere DnD/Gantt-Followups bleiben in 25c/25d. |
| [PROJ-28](PROJ-28-method-aware-navigation.md) | Deployed | Feature-Flag/Kill-Switch + strukturierter `Sentry.addBreadcrumb` am 2026-06-05 nachgezogen. Offen bleibt nur die vollstaendige logged-in Method-x-Section Playwright-Matrix. |
| [PROJ-37](PROJ-37-voice-agent-assistant.md)-[41](PROJ-41-assistant-speech-provider-wakeword-infrastructure.md) | Deployed (Assistant core MVP) | Assistant bewusst MVP: Wake-word off, external speech providers inactive, always-listening/autonome Workflows deferred; volle Cross-Browser-Voice-Validierung offen. |
| [PROJ-42](PROJ-42-schema-drift-ci-guard.md) | Deployed (alpha) | Beta/gamma deferred: INSERT/UPDATE/Zod-Drift und Shadow-vs-Prod-Drift. |
| [PROJ-44](PROJ-44-context-ingestion-pipeline.md) | Deployed (alpha+beta foundation) | Gamma Privacy-Classifier deferred; delta/epsilon durch PROJ-70 ersetzt/superseded. |
| [PROJ-53](PROJ-53-gantt-timeline-scale.md) | Deployed (alpha+beta) | Gamma intentionally deferred bis Pilotbedarf: Memo-Split, Custom-Kalender, Multi-Locale, PNG/PDF-Export. |
| [PROJ-54](PROJ-54-resource-day-rate-assignment.md) | Deployed (alpha+beta+gamma) | Delta deferred: versionierte `resource_rate_overrides`-Tabelle. |
| [PROJ-62](PROJ-62-organization-master-data-tree-view.md) | Deployed | Carry-over: API-`requireModuleActive('organization')` nicht wired; Move-Confirm fuer kritische Strukturaenderungen fehlt; UX-Polish + E2E offen. |
| [PROJ-63](PROJ-63-organization-csv-import.md) | Deployed | Bewusst enger Import: nur 2 fixe CSV-Layouts. Deferred: dynamisches Mapping, XLSX, Entra-ID Sync, Free-Form-Erkennung, Vendor-Import, inkrementelle Re-Imports. |

## Bookkeeping-Konflikte / nicht als offen zaehlen

| PROJ | Beobachtung | Handlung |
|---|---|---|
| [PROJ-36](PROJ-36-waterfall-wbs-hierarchy-rollup.md) | Bookkeeping-Konflikt geschlossen am 2026-06-05: `INDEX.md` und Spec sagen jetzt beide, dass 36-beta durch PROJ-9-R2 absorbiert wurde. | Nicht als offen zaehlen. |
| [PROJ-34](PROJ-34-stakeholder-communication-tracking.md) | Alte QA-Bloecke enthalten PARTIAL/F-9, aber Index und Spec-Header sagen Status-Closure inkl. F-9 audit-restore live. | Nicht als offen zaehlen; nur historische Spec-Bloecke sind unaufgeraeumt. |
| [PROJ-64](PROJ-64-global-dashboard-my-work-inbox.md) / [PROJ-65](PROJ-65-project-trajectory-graph-decision-steering.md) | Alte PARTIAL-Bloecke wurden spaeter geschlossen. | Nicht in offene Liste aufnehmen, solange Index/Spec-Closure aktuell bleibt. |

## Checkliste fuer neue Arbeit

Vor Start eines neuen Slices:

1. Pruefen, ob der neue Scope einen Punkt aus "Nicht abgeschlossen" oder
   "Deployed, aber..." beruehrt.
2. Wenn ja: im neuen PROJ-Spec explizit nennen, ob der Punkt geschlossen,
   superseded oder weiter deferred wird.
3. Bei `/qa`: die betroffenen Zeilen aus dieser Datei als QA-Frage aufnehmen.
4. Bei `/deploy`: wenn ein Punkt geschlossen wurde, diese Datei und
   [features/INDEX.md](INDEX.md) zusammen aktualisieren.
