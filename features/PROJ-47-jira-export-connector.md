# PROJ-47: Jira Export Connector

## Status

Architected (CIA-reviewed 2026-05-31; ready for backend-first implementation)

## Summary

Implement the first real Jira adapter on top of PROJ-14 connector plumbing. The scope is outbound export from V3 to Jira with field mapping, credential lookup, retry behavior, and sync logs. Bidirectional sync is explicitly split into PROJ-50.

## Source Requirements

- `features/PROJ-14-integrations-connectors.md`
- `features/JIRA-IMPORT-2026-04-30.md`
- `docs/decisions/connector-framework.md`

## Dependencies

- Requires: PROJ-14 connector registry and tenant secrets
- Requires: PROJ-9 work item model
- Influences: PROJ-46 software extension
- Precedes: PROJ-50 bidirectional Jira sync

## User Stories

### ST-01 Jira Connection
As a tenant admin, I want to configure Jira base URL and credentials so that the platform can export work items.

Acceptance criteria:
- [ ] Credentials are stored via tenant secrets.
- [ ] Test connection validates authentication without leaking secrets.
- [ ] Connector health is visible.

### ST-02 Field Mapping
As a project lead, I want V3 work item fields mapped to Jira issue fields so that exported tickets are useful immediately.

Acceptance criteria:
- [ ] Mapping covers title, description, type, priority, status, assignee, labels, and project key.
- [ ] Unsupported fields are reported before export.
- [ ] Mapping can be tenant-configured later without schema rewrite.

### ST-03 Export Job and Sync Log
As an integration owner, I want exports to run as jobs with visible results so that failures can be retried and audited.

Acceptance criteria:
- [ ] Export results store external Jira issue key and URL.
- [ ] Failures store sanitized error messages.
- [ ] Re-export is idempotent where an external ref already exists.

## Out of Scope

- Jira webhooks.
- Conflict resolution.
- Inbound changes from Jira.

## Technical Requirements

- Use PROJ-14 connector descriptors and tenant secrets.
- Add tenant-scoped sync log/external reference records if existing structures are insufficient.
- Never expose provider credentials in logs or client payloads.

## Continuous Improvement Report - 2026-05-31

### 1. Kurzfazit

PROJ-47 bleibt korrekt als **Outbound-only Jira Export Connector** geschnitten. Der Slice darf nicht in PROJ-50 hineinwachsen, braucht aber trotzdem minimale Persistenz fuer Export-Jobs, Export-Logs und externe Jira-Referenzen. Diese Grundlage ist kein separater Prep-Slice wert, solange sie strikt auf Outbound-Idempotenz, Auditierbarkeit und Retry beschraenkt bleibt.

### 2. Analysierter Bereich

- Architektur: PROJ-14 Connector Registry, Descriptor-Modell, Health-Status, Route-Struktur.
- Security/Governance: `tenant_secrets`, Admin-only Connector APIs, Credential-Leak-Risiken, Mandantentrennung.
- Requirements: PROJ-47, PROJ-50-Abgrenzung, Jira-Import-Mapping PP-114/PP-55.
- Datenmodell: Export-Jobs, Sync-Log, externe Referenzen, Field-Mapping.
- UX: `/konnektoren`, Credential-Test, Export-Start, Status-/Fehleranzeige.
- Testing/Operations: Mocked Jira API, Retry, Idempotenz, Schema/RLS, Logs ohne Secrets.

### 3. Wichtigste Findings

| Prioritaet | Kategorie | Finding | Risiko | Empfehlung |
|---|---|---|---|---|
| Must-have | Security/Governance | Jira-Credentials duerfen nie in Client-Payloads, Logs, Fehlertexten oder Sync-Logs auftauchen. | Hoch | Nur `tenant_secrets` nutzen, Jira-Errors sanitizen, Tests fuer Secret-Masking erzwingen. |
| Must-have | Architektur | PROJ-47 darf die Connector Registry nicht umbauen. | Mittel | Jira als echten Connector registrieren: Descriptor bleibt, `health()` + Export-Service werden ergaenzt. |
| Must-have | Datenmodell | Outbound-Idempotenz braucht externe Referenzen schon in PROJ-47. | Mittel | Minimales External-Ref-Modell jetzt anlegen, aber nur fuer V3 -> Jira Create/Update verwenden. |
| Must-have | Datenmodell | Export-Jobs und Sync-Log sind fachlicher Kern, nicht optionales Ops-Logging. | Mittel | Tenant- und projektgebundene Export-Jobs und Logs mit sanitized result/error einfuehren. |
| Should-have | Scope | Field-Mapping muss konfigurierbar vorbereitet sein, aber kein Jira-Custom-Field-Editor werden. | Mittel | MVP-Mapping fuer Standardfelder plus validierte Konfiguration; komplexe Mapping-UI spaeter. |
| Should-have | Operations | Jira-API-Ratenlimits und temporaere Fehler sind wahrscheinlich. | Mittel | Begrenztes Retry/Backoff, statusbasierte Wiederaufnahme, keine endlosen Server-Requests. |
| Should-have | UX | Nutzer brauchen vor Export eine Preview, sonst entstehen falsche Jira-Issues. | Mittel | Dry-run/Validation-Schritt fuer fehlende Keys, unsupported fields und Mapping-Luecken. |
| Should-have | Testing | Tenant-Isolation und Admin-only-Zugriff sind kritischer als Happy-Path-Export. | Hoch | Route-Tests fuer 401/403, Cross-Tenant, RLS-/tenant_id-Invarianten. |

### 4. Empfohlene Requirements

- Jira nutzt das bestehende PROJ-14-Modell: Descriptor, Health, Credential-Schema, Registry-Eintrag, Admin-only APIs.
- Jira-Credentials bleiben ausschliesslich in `tenant_secrets`; der Client sieht nur Maskierungsstatus, Health und Metadaten.
- `health()` validiert Base-URL und Authentifizierung ueber einen kleinen Jira-REST-Call, ohne Credential-Werte im Response.
- Export-Jobs speichern Status, Actor, Scope, Counts und sanitized Fehler.
- Export-Logs speichern pro Work Item Ergebnis, Jira-Key, Jira-URL, Versuchszahl, sanitized error und Zeitstempel.
- Externe Referenzen sind minimal: Tenant, Projekt, Work Item, Provider `jira`, externer Key, URL, letzte Exportzeit.
- Re-Export ist idempotent: vorhandene externe Referenz erzeugt kein zweites Jira-Issue.

### 5. Nicht empfohlene Änderungen

- Keine bidirektionale Synchronisation, Webhooks, Inbound-Events oder Konfliktaufloesung in PROJ-47.
- Kein Registry-Refactor und kein schweres Jira SDK als Default.
- Kein OAuth-Flow im ersten Slice, sofern API-Token/PAT fuer den Zieltenant ausreicht.
- Keine Kommentare, Attachments, Subtasks, Sprint-Zuweisungen, Delete-Propagation oder Custom-Field-Vollabdeckung im MVP.
- Keine neue Queue-Plattform, solange begrenztes Batching fuer den MVP-Umfang reicht.

### 6. Risiken

- Credential-Leak ueber Jira-Fehlerpfade. Mitigation: Fehler normalisieren und Tests fuer Secret-Masking.
- Scope-Creep Richtung PROJ-50. Mitigation: Webhooks, Inbound und Konflikte bleiben explizit out of scope.
- Jira-Feldmodell variiert stark pro Projekt. Mitigation: Preview/Validation statt automatischem Raten.
- Rate Limits und Teilfehler. Mitigation: Batch-Status, Retry-Limits und nachvollziehbares Log.

### 7. Offene Fragen

- Field-Mapping tenantweit oder pro V3-Projekt ueberschreibbar?
- Erste Auth-Variante: API Token, PAT oder OAuth?
- Export-Scope: manuell selektierte Work Items, projektweit oder beide?
- MVP-Kinds: Story/Task/Bug nur oder auch Epic/Subtask/Work Package?
- Re-Export: bestehende Jira-Issues aktualisieren oder nur als `already exported` melden?

### 8. Nächste Schritte

1. Backend-first Slice starten: Datenmodell, Jira-Service, mocked Route-Tests.
2. Danach UI anbinden: `/konnektoren` Health/Credentials, Mapping, Preview, Export-Job-Status.
3. PROJ-50-Abgrenzung in jedem Implementierungs-PR pruefen.

**Mein Vorschlag:** PROJ-47 als Backend-first Slice mit minimaler UI starten; PROJ-50 bleibt vollstaendig getrennt.

## Tech Design (Solution Architect) - 2026-05-31

### Scope Lock

PROJ-47 liefert den ersten echten Jira-Outbound-Adapter auf dem bestehenden PROJ-14-Plumbing. Es wird keine neue Integrationsarchitektur gebaut. Der bestehende Jira-Descriptor wird zu einem echten Adapter aufgewertet, Credential-Pflege wird fuer Jira aktiviert, und der Export-Pfad wird als nachvollziehbarer Job ausgefuehrt.

PROJ-47 erzeugt oder aktualisiert Jira-Issues aus V3 Work Items. Jira schreibt in diesem Slice nichts zurueck nach V3.

### Component Structure

```text
/konnektoren
+-- Connector list
|   +-- Jira card: health, credential source, last test result
|   +-- Configure dialog: base URL, auth identity, token, default project key
|   +-- Test connection action
+-- Jira export area
    +-- Mapping status
    +-- Export preview
    +-- Start export action
    +-- Job status and per-item log

Project work item context
+-- Export selected work items to Jira
+-- Re-export status for already linked Jira issues
```

### Data Model

Each Jira credential stays in the existing `tenant_secrets` store. PROJ-47 adds no plain-text credential table.

Each Jira mapping stores the tenant, optional project override, Jira project key, issue-type mapping, status mapping, priority mapping, label behavior and assignee behavior. The model is intentionally simple so PROJ-50 can later extend it for inbound rules without rewriting the MVP.

Each export job stores tenant, project, actor, selected Work Items or export scope, current status, counters, timestamps and a sanitized summary. This is the user's operational view of the export run.

Each export log row stores one Work Item result: skipped, created, updated, failed, Jira key, Jira URL, attempt count, sanitized error and timestamp.

Each external reference stores the outbound relationship from one V3 Work Item to one Jira issue. It is used only for idempotent re-export in PROJ-47.

### Backend Surfaces

- Connector detail/test keeps using `/api/connectors/[key]` and `/api/connectors/[key]/test`.
- Jira mapping has read/update endpoints behind tenant-admin or project-lead permissions.
- Export preview validates selected Work Items, Jira credentials and field mapping before any Jira write.
- Export start creates a job, runs bounded batches and records per-item log rows.
- Job detail returns status and sanitized log data for the UI.

### Security And Governance

- Credentials never leave the server decrypted.
- Jira error bodies are normalized before persistence or response.
- Every new table is tenant-scoped and RLS-protected.
- Project-scoped exports require access to that project.
- Cross-tenant external refs are impossible by schema and RLS.
- Logs store provider metadata, never tokens, Authorization headers or full request payloads.

### Tech Decisions

- Use native Jira REST calls via the existing runtime fetch stack; no new Jira SDK in this slice.
- Keep retry local and bounded for MVP. A dedicated queue is deferred until pilot load proves the need.
- Treat field mapping as validated configuration, not as a full Jira administration UI.
- Keep the connector registry stable. PROJ-47 docks into it; it does not redesign it.

### QA Gates

- Unit/route tests for connector health, credential validation, save/delete/test paths and secret masking.
- Backend tests with mocked Jira responses for success, auth failure, validation failure, rate limit, timeout and partial failure.
- Idempotency tests proving re-export does not create duplicate Jira issues.
- Tenant-isolation tests for jobs, logs, mappings and external refs.
- UI smoke for configure/test/preview/start/status happy path with mocked APIs.
- `npm run lint`, targeted Vitest, then full `npm run test` before merge.

### Handoff Slices

1. Backend alpha: data model, RLS, Jira adapter service, mocked route tests.
2. Frontend beta: connector credential UI, mapping UI, preview and job status.
3. QA gamma: idempotency, tenant isolation, rate-limit/partial-failure coverage, deploy runbook.

## V2 Reference Material

- `docs/decisions/connector-framework.md`
- `features/JIRA-IMPORT-2026-04-30.md`
