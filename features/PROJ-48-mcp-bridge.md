# PROJ-48: MCP Bridge

## Status

Planned

## Summary

Expose a tenant-scoped MCP bridge for safe external tool access. The bridge should provide a minimal, auditable tool surface over project data and enforce Class-3 redaction before any external model/tool boundary.

## Source Requirements

- `features/PROJ-14-integrations-connectors.md`
- `docs/decisions/connector-framework.md`
- `docs/decisions/v3-ai-proposal-architecture.md`
- `docs/PRD.md`

## Dependencies

- Requires: PROJ-12 privacy classification
- Requires: PROJ-14 connector framework and tenant secrets
- Requires: PROJ-17 tenant administration
- Influences: PROJ-38 assistant runtime

## User Stories

### ST-01 Tenant-Scoped Tool Server
As a tenant admin, I want a tenant-scoped MCP endpoint so that approved tools can access project data without cross-tenant leakage.

Acceptance criteria:
- [ ] Every request is authenticated with tenant-scoped credentials.
- [ ] Tool access is module-gated and auditable.
- [ ] No tool can query data outside the tenant.

### ST-02 Minimal Tool Set
As an assistant/runtime developer, I want a small initial tool set so that tool behavior is predictable.

Acceptance criteria:
- [ ] Initial tools cover project lookup, project status, work item lookup, and report snapshot lookup.
- [ ] Mutating tools are excluded from V1.
- [ ] Tool outputs are typed and documented.

### ST-03 Class-3 Redaction
As a privacy owner, I want sensitive fields redacted before tool output leaves the platform.

Acceptance criteria:
- [ ] Class-3 fields are blocked or redacted by default.
- [ ] Redaction decisions are test-covered.
- [ ] Tool responses include redaction metadata, not raw hidden values.

## Out of Scope

- Open-ended SQL/query tools.
- Mutating project tools.
- Public unauthenticated MCP access.

## Technical Requirements

- Prefer Supabase Edge Function or route-handler implementation consistent with PROJ-14.
- Store tool calls in audit/ki telemetry.
- Rate limit per tenant and token.

## V2 Reference Material

- `docs/decisions/connector-framework.md`
- `docs/decisions/data-privacy-classification.md`

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
**Added:** 2026-06-11 · Connector-family block design (sibling of PROJ-49/50). **Introduces a brand-new MCP server runtime** (none exists today — the `mcpDescriptor` in `src/lib/connectors/descriptors.ts` is a placeholder reporting `adapter_missing`). **⚠️ CIA review MANDATORY before build** (new external protocol + new dependency).

### What gets built (PM view)
A **read-only, tenant-scoped MCP endpoint** that lets an approved external agent (e.g. a tenant's own Claude/LLM client) pull structured project facts through a small, audited tool set — without ever touching personal data or being able to change anything.

**1. The tool surface (read-only, 4 tools — ST-02)**
- `project.lookup` — find projects by name/id within the tenant.
- `project.status` — lifecycle state, phase/milestone summary, health snapshot.
- `work_item.lookup` — backlog items by id/filter (title, kind, status — no assignee personal data).
- `report.snapshot` — the latest rendered Status-Report/Executive-Summary metadata (PROJ-21).
- **No mutating tools, no open-ended query tool** (explicit out-of-scope). Every tool output is a typed, documented shape.

**2. Data model additions (all `tenant_id` + RLS)**
- `mcp_access_tokens` — one row per issued tool-access token: `tenant_id`, `token_hash` (never the raw token), `label`, `created_by`, `last_used_at`, `revoked_at`, `expires_at`. Admin-only RLS (mirrors `tenant_secrets`). The raw token is shown once at creation, then only the hash is stored.
- `mcp_tool_calls` (audit) — `tenant_id`, `token_id`, `tool_name`, `arguments_digest` (hashed/redacted, never raw Class-3), `result_row_count`, `redaction_count`, `status`, `latency_ms`, `created_at`. Feeds the existing audit/telemetry surface. Admin-readable.
- Reuses **`tenant_secrets`** (`connector_key='mcp'`) for any shared service secret; flips the existing `mcpDescriptor` to `credential_editable: true` with a real `health()` probe.

**3. API / runtime surface**
- A **Next.js route handler** under `/api/mcp/...` (Fluid Compute / Node runtime — NOT an edge function, per current Vercel guidance). Speaks the MCP **streamable-HTTP transport**. Chosen over a Supabase edge function because the tool logic must reuse the existing TypeScript data-access + `classifyField()` redaction layer that already lives in the Next app.
- Auth: every request carries a tenant-scoped bearer token → looked up by hash in `mcp_access_tokens` → resolves the tenant; all queries run tenant-scoped (RLS + explicit `tenant_id` filter). No token → 401. Revoked/expired → 401.
- Admin UI: a small panel under the existing `/konnektoren` connector page to issue/label/revoke tokens and see last-used + recent tool-call audit.

**4. Security model (the core of this feature — ST-03)**
- **Class-3 redaction before the boundary**: every field a tool would emit is run through the deployed `classifyField(table, column)` registry (`src/lib/ai/data-privacy-registry.ts`). Class-3 fields are **dropped or masked** (names → `***`, emails → `[redacted]`); the response carries `redaction` metadata (counts/fields), never the raw hidden value (AC ST-03). Default-deny: unknown columns classify as 3 and are withheld.
- Tool allow-list is static (no dynamic SQL). Per-tenant + per-token **rate limit** (token-bucket in-table or header-based), so a leaked token can't scrape.
- No token logging (mirror PROJ-47 `sanitizeJiraError` discipline); `arguments_digest` is hashed.
- Cross-tenant isolation proven by test: a token for tenant A can never resolve tenant B rows.

**5. Failure / idempotency**
- Read-only → naturally idempotent; retries are safe. A failing tool returns a typed MCP error, never a stack trace. Rate-limit breach → typed "slow down" error.

### CIA-gated open questions (MANDATORY before /backend)
1. **New dependency**: `@modelcontextprotocol/sdk` (TypeScript MCP server) vs. hand-rolling the streamable-HTTP envelope to avoid a dep. → CIA tech-stack-fit + supply-chain (PROJ-74 bundle).
2. **Runtime placement**: confirm Next route handler vs. Supabase edge function for the MCP transport under Vercel Fluid Compute.
3. **Rate-limit mechanism**: reuse an in-table counter vs. a new primitive.

### Explicitly deferred
- Mutating tools, open-ended/SQL tools, public unauthenticated access (all spec out-of-scope).
- OAuth / dynamic client registration — static issued tokens only for V1.
- Streaming/long-running tools.

### Slice plan (handoff)
- **CIA review** (dep + runtime + rate-limit) → GO/adjust.
- **α /backend**: `mcp_access_tokens` + `mcp_tool_calls` migration (RLS), token issue/revoke RPCs, the MCP route + 4 read-only tools wired through `classifyField()` redaction, rate limit, audit writes. Live-RPC-smoke for token lookup + redaction. (~2.5 PT)
- **β /frontend**: token-management + audit panel in `/konnektoren`. (~1 PT)
- **γ /qa**: cross-tenant isolation probes, Class-3 redaction coverage, rate-limit, revoked-token, MCP-client smoke. (~0.5 PT)

