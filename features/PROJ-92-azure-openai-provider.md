# PROJ-92: Azure OpenAI Provider (Class-1/2) — fünfter Provider-Typ

## Status: Architected (Tech Design 2026-07-01 — fifth provider via existing OpenAI-compatible factory, no new dep, no new fork; CIA-locks intact. → /backend)
**Created:** 2026-06-10
**Last Updated:** 2026-07-01
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

_Added by /architecture 2026-07-01. PM-friendly; no code. All CIA forks were pre-locked (2026-06-10) — this pass confirms no new open fork surfaced (see "Open Forks" below)._

### The one-sentence shape
Azure OpenAI becomes a **fifth entry in a list that already has four** (Anthropic, OpenAI, Google, Ollama). Everything that today treats "which provider runs this generation" as a choice among four values now sees five — no new machinery, no new library, no change to how Class-3 data is protected.

### Why this is small (and why that's deliberate)
The deployed PROJ-32 multi-provider system already does the hard parts: per-tenant encrypted keys, a priority matrix that picks a provider per (purpose, data-class), cost-caps, and an audit trail in `ki_runs`. Adding OpenAI + Google in PROJ-32b was exactly this same "add a value to the whitelists" move. Azure reuses that precedent verbatim. Crucially, Azure speaks the **same wire protocol as OpenAI**, so the existing "OpenAI-compatible" connection factory (the one the Ollama provider already uses) talks to Azure with only a different base address — **no new dependency**, as the CIA locked.

### A) Where Azure plugs in (component view)

```
Tenant Admin → Settings → KI-Provider
  └── NEW: "Azure OpenAI" provider form
        · Endpoint URL   · Deployment name   · API key (encrypted like every key)
        · api-version (required, validated)  · Azure region (required, EU-allowlist)
        └── Save → key-validator probes the real Azure deployment → audit event

Generation request (risks / narrative / trajectory / cross-project-links / backlog)
  └── Priority matrix picks a provider for (purpose, data-class)
        ├── data-class 1/2  →  azure is now a valid pick (alongside the other clouds)
        └── data-class 3    →  ONLY ollama, unchanged  ← the invariant
  └── Chosen "azure" → OpenAI-compatible factory, pointed at the tenant's Azure deployment
        └── Result recorded in ki_runs with provider = 'azure'
```

### B) What gets stored (data model, plain language)

An Azure provider config (encrypted, per tenant, same table + column as all other providers) holds:

- **Endpoint URL** — the tenant's own Azure OpenAI resource address (in their Azure tenant).
- **Deployment name** — which model deployment to call (Azure addresses models by deployment, not model id).
- **API key** — stored encrypted exactly like every other provider key.
- **api-version** — required, validated; Azure hard-rejects deprecated versions, so a wrong value must fail loudly at save time, not silently at generation time.
- **Azure region** — required, checked against a **static EU-region allowlist** held as a server constant (`westeurope`, `germanywestcentral`, `northeurope`, `swedencentral`), with a test and a documented update path. A non-EU region is refused at save; the config is never persisted.

No new table. Azure is a new **shape** of the existing provider-config, and a new **value** in the provider whitelists.

### C) The four whitelists that move in lockstep (+ one code enum)

Adding a provider value in only some places would let a config save but fail to route (or vice-versa). So five things change together — the exact set PROJ-32b touched for OpenAI/Google:

1. **Code:** the `AIKeyProvider` union (`anthropic | ollama | openai | google` → `+ azure`).
2. **DB — provider whitelist** on the tenant-providers table (accept `azure`).
3. **DB — known-providers whitelist** on the priority-matrix table (allow `azure` inside a priority order array).
4. **DB — `ki_runs` provider check** (allow `azure` to be recorded as the run's provider).
5. **DB — audit RPC validator** (`record_tenant_ai_provider_audit` accepts `azure`).

One migration, following the reference `20260505100000` + `20260505100200` pattern. **Migration-naming note (PROJ-134, now enforced):** the file is created first as `YYYYMMDDHHMMSS_proj92_*.sql` (minute-rastered) and applied under that exact name.

### D) The Class-3 invariant — structurally unchanged (AC-92.4)

This is the part that must be provably untouched. Two independent guards already keep Class-3 on Ollama only, and Azure passes through **neither**:

- **Default order for data-class 3** returns `["ollama"]` and nothing else — Azure can never be the fallback pick.
- **The priority-matrix Class-3 path** filters any configured order down to local providers only; a cloud value like `azure` is dropped, same as `openai`/`google` are today.

So Azure needs *no new blocking code* — it is blocked for Class-3 by the same mechanism that already blocks the other clouds. The slice adds a regression test that proves "Azure is not selectable for Class-3", and leaves the `class3_local_only` matrix check literally unedited.

### E) All five cloud purposes + regression (AC-92.3)

Azure implements the five cloud purposes (risks, narrative, trajectory-sequence, cross-project-links, proposal-from-context) by reusing the shared purpose prompts/schemas — the provider only supplies the connection, the prompt logic is shared (the PROJ-85 lesson: never let a provider silently no-op a purpose). A **capability-matrix regression test** (the PROJ-85 pattern) asserts Azure covers exactly the five cloud purposes and — deliberately — not `resource_swap` (Ollama-only by design).

### F) Cost-caps + priority matrix (AC-92.5)

Because Azure runs through the same generate path, token usage is counted and the existing cost-cap enforcement applies with no special-casing — a test proves an Azure run is capped. The priority matrix accepts `azure` in Class-1/2 order arrays (via whitelist #3 above).

### G) Admin UI (AC-92.6)

A new "Azure OpenAI" form in Settings → KI-Provider, mirroring the existing provider forms: the five fields above, a **Save-time key validator** that probes the real deployment (so a bad endpoint / deployment / api-version fails with an actionable message, never a silent stub), and an audit event on create/rotate/delete/validate.

### H) Live proof (AC-92.7)

`ki_runs` shows Azure runs as `provider='azure'`. A live smoke against a real Azure resource is the goal; if no test resource exists at deploy time, the documented stub path + a recorded deviation is acceptable (per AC-92.7).

### Backend vs frontend
Both. **Backend:** the enum, the lockstep migration, the Azure provider (connection + 5 purposes), the key-validator, EU-region constant, cost-cap + matrix wiring, capability + Class-3 + cost-cap tests. **Frontend:** the admin provider form + validation surface. Recommended order: `/backend` first (the provider must exist before the form can save/validate against it), then `/frontend`, then `/qa`.

### Dependencies
- **No new npm package** (CIA-locked: reuse `@ai-sdk/openai-compatible`, already in the tree for Ollama).
- Requires deployed PROJ-32 (all slices), PROJ-85 (capability-matrix test pattern), PROJ-42 (schema-drift guard will see the new columns/values) — all live.

### Open Forks
**None.** The CIA review (2026-06-10) locked all five decisions (factory-not-SDK, 92/93 split keeping the invariant out of scope, EU-allowlist as server constant, cost-cap mandatory, api-version validated). This architecture pass surfaced **no new fork** — every AC maps to an existing, deployed pattern. No fresh CIA pass required (spec-following extension of a reviewed architecture). If `/backend` discovers that Azure's OpenAI-compatible surface needs a request-shape quirk the factory can't express (e.g. the `api-version` must ride as a query parameter the factory doesn't forward), that is a backend implementation detail — flag it then, but it does not reopen an architecture fork.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
