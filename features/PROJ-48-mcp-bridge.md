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

