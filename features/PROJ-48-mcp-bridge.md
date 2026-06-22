# PROJ-48: MCP Bridge

## Status

Deployed (α + β + γ live — 0 Critical/0 High; merged to main via PR #157, tag `v1.95.0-PROJ-48`, 2026-06-19; prod-verified: POST /api/mcp no-token→401, bad-token→401 no-leak, admin token route→307)

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

---

## Implementation Notes — α /backend (2026-06-18)

**CIA-gated questions resolved (S480 GO):** (1) dependency → `@modelcontextprotocol/sdk@1.29.0` adopted; (2) runtime → Next.js route handler on the Node runtime (`/api/mcp`, `runtime = "nodejs"`), not an edge function; (3) rate-limit → in-table sliding-window count over `mcp_tool_calls` inside the authorize RPC (no new primitive).

**Migration** `supabase/migrations/20260618165722_proj48_mcp_bridge.sql` (live in Prod-DB; repo filename matches the prod-registered version `20260618165722` so `supabase db push` skips the non-idempotent `create table`s — same drift-avoidance as PROJ-50):
- `mcp_access_tokens` (sha256-hash only, never raw; `label`, `created_by`, `last_used_at`, `revoked_at`, `expires_at`) — admin-only RLS, hash-unique index, mirrors PROJ-50 `jira_webhook_tokens`.
- `mcp_tool_calls` (append-only audit: `tool_name`, hashed `arguments_digest`, `result_row_count`, `redaction_count`, `status`, `latency_ms`) — admin-read RLS, no insert policy (service-role writes only).
- RPC `mcp_authorize_call(p_token_hash, p_window_seconds, p_max_calls)` `SECURITY DEFINER` → validates token (invalid/revoked/expired), enforces per-token sliding-window rate limit by counting recent `mcp_tool_calls`, bumps `last_used_at`. `EXECUTE` revoked from `public/anon/authenticated`, granted only to `service_role` (verified: it does NOT appear in the Supabase security-advisor anon/authenticated-executable lists).

**Runtime / lib (`src/lib/mcp/`)**:
- `tokens.ts` — `generateMcpToken` (`mcp_` + 32-byte hex), `hashMcpToken` (sha256), `extractBearerToken`, `digestArguments`.
- `redaction.ts` — `redactRow`/`redactRows`: drop every Class-3 (and unknown → default-deny) field via deployed `classifyField()`; return only Class-1/2 + redaction metadata (counts/fields), never the raw hidden value.
- `transport.ts` — `OneShotTransport`: SDK-native `Transport` that injects one JSON-RPC message and resolves the single response (stateless JSON mode; no SSE / Node-http bridge). Empirically verified `tools/list` + `tools/call` + `initialize` all work on a fresh per-request server without a prior handshake.
- `server.ts` — `buildMcpServer(ctx)`: 4 read-only tools (`project.lookup`, `project.status`, `work_item.lookup`, `report.snapshot`) with zod input schemas. Every query is tenant-scoped (`.eq('tenant_id', …)`), soft-delete-filtered, and **need-to-know-gated** (only `confidentiality_level = 'standard'` rows — PROJ-100a defense, since the service-role client bypasses the RESTRICTIVE RLS gate). Tools SELECT explicit safe-column projections so PII columns (`responsible_user_id`, `generated_by`, `content`) are never even fetched.

**Routes**:
- `POST /api/mcp` (public route, bearer-authed) — extract token → `mcp_authorize_call` (401 invalid / 429 rate-limited + audit) → dispatch one JSON-RPC message through a fresh tenant server → audit row → JSON-RPC response. Added to middleware `PUBLIC_ROUTES`.
- `POST/GET/DELETE /api/connectors/mcp/tokens` (session-gated, tenant-admin) — issue (raw token shown once + `mcp_url`, optional `expires_in_days`), list metadata, revoke. Mirrors the PROJ-50 webhook-token route.
- `mcpDescriptor` flipped `adapter_missing` → `adapter_ready_unconfigured` (runtime live; access via issued tokens, card stays non-editable).

**Privacy-registry additions** (`data-privacy-registry.ts`): registered the structural/metadata columns the tools emit as Class 1 (`projects.id`, `phases.id`, `milestones.id`, `work_items.{id,parent_id,wbs_code}`, `report_snapshots.*` metadata). `report_snapshots.content`/`generated_by`/`pdf_storage_key` deliberately left unregistered → default-deny Class 3 → never emitted.

**Quality gates:** vitest **1863/1863** (+29 new: redaction 8, tokens 8, server 4, route 6, token-route 9; registry test updated for the descriptor flip); lint 0; tsc 13 baseline / 0 new; build clean (both routes registered). **Live-RPC smoke (mandatory)** against Prod passed with 0 residue: valid→allowed + `last_used_at` bump, 5-call window→`rate_limited`, revoked→`revoked_token`, unknown→`invalid_token`. No new Supabase security-advisor warnings.

**Deferred to β/γ:** token-management + audit panel UI in `/konnektoren` (β); cross-tenant isolation / redaction-coverage / rate-limit / revoked-token / real MCP-client Playwright smoke (γ).

**Followup noted:** `mcp_access_tokens.created_by` FK is unindexed (admin-rare lookups; consistent with the PROJ-69 FK-index triage policy of skipping rare-access FKs).

## Implementation Notes — β /frontend (2026-06-18)

Token-management + audit panel surfaced in the existing `/konnektoren` connector drawer (mounted when `descriptor.key === "mcp"`, mirroring the PROJ-50 `JiraWebhookTokens` pattern):
- `src/components/connectors/mcp-access-tokens.tsx` — `McpAccessTokens`: issue form (optional label + optional 1–365-day expiry) → reveal-once callout (raw bearer token + `mcp_url`, copy buttons, never shown again); token list with active / **expired** / revoked badge + created/last-used/expires + revoke; recent-tool-call audit section (tool, status-tinted, redaction count, latency, time). shadcn primitives only (Card/Input/Label/Button/Badge) + sonner toasts.
- `src/lib/mcp/tokens-api.ts` — FE client wrappers (`issueMcpToken`/`listMcpTokens`/`revokeMcpToken`/`listMcpToolCalls`), fetch + safeError mirror of `jira/inbound-api.ts`.
- **New read route** `GET /api/connectors/mcp/audit` (tenant-admin, RLS-gated) → 50 most recent `mcp_tool_calls` (no raw args — only the hashed digest is stored anyway). The token-mgmt routes already existed from α.
- `connectors-page-client.tsx` mounts the panel; no other connector behavior changed.

**Quality gates:** vitest **1866/1866** (+3 audit-route tests: 401/403/happy); lint 0; tsc 13 baseline/0 new; build clean (audit route registered). No new RPC → no live-RPC smoke required (read-only RLS select; auth gate test-covered). γ /qa (cross-tenant isolation, redaction coverage, rate-limit, revoked/expired-token, real MCP-client smoke, Playwright auth-gates) remains.

## QA Test Results — γ (2026-06-19)

**Verdict: PRODUCTION-READY (0 Critical / 0 High).** vitest **1871/1871** (+5 γ); Playwright **7/7** chromium; live DB security probe passed (0 residue); lint 0; tsc 13 baseline.

### Acceptance criteria

**ST-01 Tenant-Scoped Tool Server**
- ✅ Every request authenticated with tenant-scoped credentials — bearer → `mcp_authorize_call`; missing/unknown token → 401 (route.test + Playwright + α live-RPC smoke).
- ✅ Tool access module-gated + auditable — every dispatch writes an `mcp_tool_calls` row incl. rate-limited/error paths (route.test); connector module gating via descriptor.
- ✅ No tool can query outside the tenant — explicit `.eq('tenant_id', …)` on every query (server.test asserts the eq calls); **live isolation probe**: no project id shared across two real tenants, standard-only query structurally cannot surface other tenants' rows.

**ST-02 Minimal Tool Set**
- ✅ 4 tools cover project lookup/status, work-item lookup, report snapshot — real SDK `Client.listTools()` returns exactly those 4 (server.integration.test).
- ✅ Mutating tools excluded — integration test asserts no `create/update/delete/write/mutate/set` tool exists; unknown tool → typed MCP error, no stack-trace leak.
- ✅ Typed + documented outputs — zod `inputSchema` + title/description per tool, verified over a real MCP handshake.

**ST-03 Class-3 Redaction**
- ✅ Class-3 (+ unknown → default-deny) fields dropped by default — redaction.test (8 cases); real client round-trip drops `responsible_user_id`.
- ✅ Redaction decisions test-covered — redaction unit tests + integration round-trip.
- ✅ Responses carry redaction metadata, never the raw hidden value — `payload.redaction.{count,fields}` present; raw PII value never appears in the response text.

### Security audit (red-team)
| Probe | Result |
|---|---|
| Cross-tenant isolation (token A → tenant B rows) | ✅ Blocked — live probe + explicit tenant filter |
| Need-to-know (confidential/strict rows via MCP) | ✅ Blocked — standard-only gate (server.test + live probe) |
| Per-token rate limit | ✅ `mcp_authorize_call` → `rate_limited` (α live smoke) → route 429 + audit (route.test) |
| Revoked / expired token | ✅ `revoked_token` / `expired_token` → 401 (α live smoke + RPC) |
| Missing / unknown bearer token | ✅ 401, **no tenant existence leak** in body (Playwright) |
| Token at rest | ✅ sha256-hash only; raw shown once (tokens.test) |
| Tool arguments in audit | ✅ hashed `arguments_digest`, never raw (tokens.test) |
| Admin routes (tokens / audit) without session | ✅ 307/401/403 (Playwright) |
| `mcp_authorize_call` exposed to anon/authenticated | ✅ Not exposed — `EXECUTE` granted only to `service_role` (advisor-verified in α) |
| Malformed JSON-RPC body | ✅ 400 (Playwright + route.test) |

### Bugs / deviations
- **0 Critical, 0 High, 0 Medium, 0 Low.**
- **D-1 (env, not a product bug):** Mobile-Safari/WebKit Playwright project skipped — host libs missing (`sudo npx playwright install-deps webkit`), same as PROJ-67 F2. Chromium full pass.
- **D-2 (deferred, NICE-TO-HAVE):** A real external MCP client over live HTTP against a running server with seeded data was not run; coverage is provided instead by (a) a real in-process SDK `Client`↔`McpServer` round-trip, (b) Playwright route auth-gates, and (c) the live DB security probe. A pilot-time external-client smoke can be added when a tenant first wires up an agent.

### Tests added
- `src/lib/mcp/server.integration.test.ts` — real SDK `Client` over `InMemoryTransport` (listTools / callTool-redaction / unknown-tool error).
- `src/lib/mcp/server.test.ts` — +need-to-know gate coverage for `work_item.lookup` + `report.snapshot`.
- `tests/PROJ-48-mcp-bridge.spec.ts` — 7 Playwright route auth-gates (admin routes session-gated; public `/api/mcp` token-required + no-leak + 400).
- `src/app/api/connectors/mcp/audit/route.test.ts` (β) — audit route auth/authz/happy.

