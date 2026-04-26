# PROJ-14: Connector Framework, Jira Integration, MCP Bridge, Stand-alone Deployment Hooks

## Status: Planned
**Created:** 2026-04-25
**Last Updated:** 2026-04-25

## Summary
Generic connector framework with descriptors, health checks, and admin-only API. Real adapters layer on top: Jira (export → bidirectional), MCP bridge to expose project-aware tools to the LLM, Teams (real outbound), credential setup UI per connector, and stand-alone deployment hooks. Inherits V2 EP-12.

## Dependencies
- Requires: PROJ-1 (Auth, Tenants, Roles)
- Requires: PROJ-9 (Work Items) — Jira sync subject
- Requires: PROJ-12 (KI / MCP) — MCP bridge ties to model routing
- Requires: PROJ-13 (Communication) — Teams adapter shares the channel-adapter pattern
- Influences: PROJ-3 (Stand-alone deployment)

## V2 Reference Material
- **Epic file:** `~/projects/Projeketplattform_v2_D.U/planning/epics/ep-12-integrationen-und-vendoren.md`
- **Stories:** `~/projects/Projeketplattform_v2_D.U/planning/stories/ep-12.md` (ST-01 framework, ST-02 Jira export, ST-03 stand-alone deployment, ST-04 MCP bridge, ST-05 Jira bidirectional sync, ST-06 credential UI per connector, ST-07 Teams real, ST-08 registry status precision)
- **ADRs:** `docs/decisions/connector-framework.md`, `docs/decisions/deployment-modes.md`
- **V2 code paths to study during /architecture and /backend:**
  - `apps/api/src/projektplattform_api/services/connectors/registry.py` — descriptor + ConnectorHealth
  - `apps/api/src/projektplattform_api/services/connectors/adapters/jira.py`
  - `mcp/servers/projektplattform/` — V2's MCP server skeleton
  - `apps/web/app/konnektoren/page.tsx`

## User Stories
- **[V2 EP-12-ST-01]** As the system, I want a generic integration framework so that future connectors plug in cleanly.
- **[V2 EP-12-ST-02]** As a user, I want to export planning units to Jira so that distributed teams can use their tool.
- **[V2 EP-12-ST-03]** As an operator, I want stand-alone deployment hooks (env vars, migration order, AI-provider switches) so enterprise customers can run on their own.
- **[V2 EP-12-ST-04]** As the platform, I want to expose project-aware tools to the LLM via MCP (Model Context Protocol) so AI agents can read/suggest safely.
- **[V2 EP-12-ST-05]** As a project lead, I want bidirectional Jira sync so changes in one tool replicate to the other.
- **[V2 EP-12-ST-06]** As a tenant admin, I want a UI to set per-connector credentials (Jira token, SMTP password, Slack webhook, MCP service token) so I don't need shell access.
- **[V2 EP-12-ST-07]** As a project lead, I want a real Teams outbound adapter so enterprise customers don't need Slack.
- **[V2 EP-12-ST-08]** As a tenant admin, I want the connector list to clearly say "adapter missing" vs "credentials missing" so I know what to do.

## Acceptance Criteria

### Connector framework (ST-01)
- [ ] `ConnectorDescriptor` shape: `{ key, label, summary, capability_tags, credential_schema }`.
- [ ] Registry holds default `UnconfiguredConnector` per known key (Jira, SMTP/Email, Slack, Teams, MCP).
- [ ] Each connector implements `health(): ConnectorHealth` (`ok | error | unconfigured | adapter_missing | adapter_ready_unconfigured | adapter_ready_configured`).
- [ ] `register(connector)` overrides the stub once a real adapter ships.
- [ ] `GET /api/connectors` admin-only; lists each known connector + health.
- [ ] `GET /api/connectors/{key}` admin-only single-connector detail.

### Jira export (ST-02)
- [ ] Export Story/Task/Bug rows from a project to Jira via REST API.
- [ ] Field mapping table (internal status ↔ Jira status, priority mapping, etc.) configurable in tenant settings (PROJ-17).
- [ ] Sync log per export run.
- [ ] Failures retried with exponential backoff (Edge Function or Supabase scheduled job).

### Stand-alone deployment hooks (ST-03)
- [ ] `OPERATION_MODE`, `EXTERNAL_AI_DISABLED`, `OLLAMA_BASE_URL`, etc. — env-var contract documented in `docs/deployment/standalone.md`.
- [ ] All connectors gracefully degrade when credentials absent.
- [ ] Migration apply order documented (matches PROJ-3).

### MCP bridge (ST-04)
- [ ] Edge Function `mcp-server` (deno) implements MCP protocol.
- [ ] Exposes minimal tool set: `list_projects`, `get_project`, `list_work_items`, `create_work_item_suggestion`.
- [ ] Auth: per-tenant service token; principal set before each call (no privilege escalation).
- [ ] Class-3 redaction on responses (per PROJ-12).
- [ ] Health probe per tenant.
- [ ] Documented in `docs/architecture/mcp-server.md`.

### Bidirectional Jira sync (ST-05)
- [ ] Outbound: Create/Update/Delete on work_items queue Jira ops.
- [ ] Inbound: Jira webhook hits an Edge Function; mapped to internal IDs via `external_refs` table.
- [ ] Conflict policy: later timestamp wins; conflict logged.
- [ ] Field whitelist (title, description, status, priority); no comments/attachments/custom fields v1.
- [ ] Sync activatable per project.

### Credential UI (ST-06)
- [ ] Table `tenant_secrets`: `id, tenant_id, connector_key, payload (encrypted JSONB), encrypted_at, created_by`.
- [ ] Encryption via Supabase Vault or PG_PGP; key in env (`SECRETS_ENCRYPTION_KEY`).
- [ ] UI under `/konnektoren` admin-only; per-connector form pulled from the descriptor's credential_schema.
- [ ] Test-Connection button calls the connector's health probe.
- [ ] Secrets masked in UI after save.
- [ ] Backward compat: when `tenant_secrets` is empty, env vars take effect.

### Teams real (ST-07)
- [ ] Real adapter via Microsoft Graph or Teams Incoming Webhook (decided in DoR).
- [ ] Failures land in `communication_outbox.status = failed`.
- [ ] Retry policy via outbox.
- [ ] Stub fallback for dev.

### Registry status precision (ST-08)
- [ ] Status enum: `adapter_missing`, `adapter_ready_unconfigured`, `adapter_ready_configured`.
- [ ] UI text per state matches V2's strings.

## Edge Cases
- **Connector with credentials in both env AND tenant_secrets** → tenant_secrets win.
- **Encrypted credential decryption fails** → connector reports `error`; admin sees clear message.
- **Bidirectional Jira loop** (echo) → `external_refs` table prevents re-emit when source is the other side.
- **MCP service token leak** → admin can rotate; rotation increments version, old token rejected.
- **Cross-tenant credential access** → blocked by RLS on `tenant_secrets`.
- **Stand-alone with no external connectors at all** → all connectors show `unconfigured`; UI offers "All disabled" as a state.

## Technical Requirements
- **Stack:** Next.js 16 + Supabase + Edge Functions (Deno) + dedicated MCP-server Edge Function.
- **Multi-tenant:** `tenant_secrets`, `external_refs`, `connector_health_log` MUST have `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`. RLS: tenant admin only.
- **Validation:** Zod schemas for credential payloads per descriptor.
- **Auth:** Supabase Auth + tenant_admin enforcement.
- **Privacy:** Same class-3 redaction logic as PROJ-12 + PROJ-10.
- **Encryption:** Tenant secrets encrypted at rest. Decrypted only inside Edge Functions / route handlers (never sent to client).

## Out of Scope (deferred or explicit non-goals)
- Vault/HSM backend for secrets (later).
- Inbound MCP write actions without going through the proposal/review flow (PROJ-12 enforces).
- Card/AdaptiveCard templating for Teams.
- Inbound Teams messages.
- Sub-task hierarchy in Jira (flat objects v1).
- Jira → platform initial bulk import.
- Manual conflict resolution UI for Jira sync.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## Implementation Notes
_To be added by /frontend and /backend_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
