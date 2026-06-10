# PROJ-92: Azure OpenAI Provider (Class-1/2) — fünfter Provider-Typ

## Status: Planned
**Created:** 2026-06-10
**Last Updated:** 2026-06-10
**Origin:** PO-Entscheidung 2026-06-10 (Pilotkunden ohne Ollama-Betrieb) · CIA-Review 2026-06-10 (GO, Split 92a/92b)
**Priority:** P1 — Should-have

## Summary
Azure OpenAI Service wird fünfter Provider-Typ der PROJ-32-Multi-Provider-Architektur (neben Anthropic / OpenAI / Google / Ollama). In dieser Slice verhält sich Azure wie ein normaler Cloud-Provider: **nur Class-1/2-Purposes**, die Class-3-Invariante #3 bleibt unberührt. Tenants hinterlegen ihre eigene Azure-OpenAI-Ressource (Endpoint im eigenen Kunden-Azure-Tenant, EU-Region, Deployment-Name, API-Key, api-version). Die Class-3-Freigabe für attestierte EU-Endpoints ist **bewusst ausgeklammert** → PROJ-93.

**Kein neues Dependency** (CIA-Lock): Anbindung über die bereits produktive `createOpenAICompatible`-Factory (Pattern aus dem Ollama-Provider), nicht über `@ai-sdk/azure`.

## Problem / Context
Die SaaS-Mandate (PROJ-32) verlangt tenant-eigene Keys. Enterprise-Kunden haben häufig bereits Azure-OpenAI-Verträge (Microsoft-DPA, EU Data Boundary, eigener Azure-Tenant) und wollen diese statt OpenAI-direkt nutzen. Heute gibt es keinen Azure-Provider-Typ; `AIKeyProvider` kennt nur `anthropic | ollama | openai | google`.

## User Stories
- Als Tenant-Admin möchte ich meine eigene Azure-OpenAI-Ressource (Endpoint, Deployment, Key, api-version, Region) hinterlegen, damit Cloud-Purposes über meinen eigenen Azure-Vertrag laufen.
- Als Tenant-Admin möchte ich Azure in der Provider-Prioritätsmatrix einsortieren können, damit es wie jeder andere Cloud-Provider gewählt wird.
- Als PM möchte ich, dass Generierungen (Risiken, Backlog, Cross-Project-Links, Trajectory, Narrative) transparent über Azure laufen, wenn mein Admin das konfiguriert hat — sichtbar in `ki_runs`.
- Als Compliance-Officer möchte ich, dass Azure in dieser Ausbaustufe für Class-3 strukturell NICHT wählbar ist, damit die Invariante #3 unverändert gilt.

## Acceptance Criteria
- [ ] **AC-92.1**: `AIKeyProvider` wird um `"azure"` erweitert; DB-Whitelists (`tenant_ai_keys`-CHECK, `tenant_ai_provider`-Tabellen, `ki_runs`-Provider-CHECK) werden in Lockstep migriert (Pattern: Migration 20260505100200).
- [ ] **AC-92.2**: Azure-Provider-Config trägt mindestens: Endpoint-URL, Deployment-Name, API-Key (verschlüsselt wie alle Keys), `api_version` (Pflichtfeld, validiert), `azure_region` (Pflichtfeld). Region wird gegen eine statische **EU-Allowlist** validiert (`westeurope`, `germanywestcentral`, `northeurope`, `swedencentral`; Server-Konstante mit Test + dokumentiertem Update-Pfad).
- [ ] **AC-92.3**: Der Azure-Provider implementiert **alle 5 Cloud-Purposes** (risks, narrative, trajectory_sequence, cross_project_links, proposal_from_context) über die vorhandene `createOpenAICompatible`-Factory mit Azure-Base-URL (`{endpoint}/openai/deployments/{deployment}` + `api-version`); Capability-Matrix-Regressionstest (PROJ-85-Muster) deckt ihn ab.
- [ ] **AC-92.4**: Class-3-Clamp unverändert: `defaultProviderOrder(3)` bleibt exakt `["ollama"]`; der `class3_local_only`-CHECK der Priority-Matrix bleibt in dieser Slice unangetastet. Ein Test beweist, dass Azure für Class-3 strukturell nicht wählbar ist.
- [ ] **AC-92.5**: Cost-Caps (PROJ-32d) greifen für Azure-Läufe (Token-Zählung + Cap-Enforcement getestet); Priority-Matrix (PROJ-32c) akzeptiert `azure` für Class-1/2-Arrays.
- [ ] **AC-92.6**: Tenant-Admin-UI (Einstellungen → KI-Provider) bietet Azure-Formular mit Key-Validierung (Pattern der bestehenden Key-Validatoren) und Audit-Event via `record_tenant_ai_provider_audit`.
- [ ] **AC-92.7**: `ki_runs` weist Azure-Läufe als `provider='azure'` aus; Live-Smoke gegen eine echte Azure-Ressource ODER dokumentierter Stub-Pfad, falls beim Deploy keine Test-Ressource verfügbar (Deviation dokumentieren).

## Edge Cases
- Falsche/abgelaufene `api_version` → Azure lehnt ab; Key-Validator liefert actionable Fehlermeldung (Azure deprecated api-versions hart).
- Nicht-EU-Region eingegeben → Validierungsfehler beim Speichern, Config wird nicht persistiert.
- Deployment-Name existiert nicht in der Azure-Ressource → Validator-Fehler, kein stiller Stub-Fallback.
- Tenant hat Azure UND OpenAI konfiguriert → Priority-Matrix entscheidet; kein implizites Bevorzugen.

## Non-Goals / Out of Scope
- **Jede Class-3-Nutzung von Azure** (→ PROJ-93; Anti-Scope per CIA: keine generische Cloud-für-Class-3-Option).
- DPA-Attestierung / Trusted-Processor-Semantik (→ PROJ-93).
- `@ai-sdk/azure` als Dependency (CIA-abgelehnt zugunsten der vorhandenen Factory).
- Azure-Non-OpenAI-Modelle (z.B. Azure AI Foundry Kataloge).

## Dependencies
- Requires: PROJ-32 (alle 4 Slices, deployed), PROJ-85 (Capability-Matrix-Pattern), PROJ-42 (Schema-Drift-Guard erfasst neue Spalten).
- Unblocks: PROJ-93 (Trusted-EU-Processor Class-3-Freigabe).

## CIA-Review (2026-06-10, Kurzfassung)
GO. Locks: (1) openai-compatible Factory statt neuem SDK-Dep; (2) Split 92a/92b — diese Slice berührt die Invariante NICHT; (3) EU-Region-Allowlist als Server-Konstante; (4) Cost-Cap-Integration ist Pflicht (Class-3 später = teuerster Pfad); (5) api-version als validiertes Pflichtfeld. Vollständiger Report in der Session 2026-06-10.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
