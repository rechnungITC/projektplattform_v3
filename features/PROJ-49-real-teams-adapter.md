# PROJ-49: Real Microsoft Teams Adapter

## Status

Planned

## Summary

Replace the Teams stub path with a real Microsoft Teams delivery adapter using Microsoft Graph or approved webhook integration. The adapter must plug into PROJ-13 communication outbox and PROJ-14 connector secrets.

## Source Requirements

- `features/PROJ-13-communication-chat.md`
- `features/PROJ-14-integrations-connectors.md`
- `docs/decisions/communication-framework.md`

## Dependencies

- Requires: PROJ-13 communication outbox
- Requires: PROJ-14 connector registry and tenant secrets
- Influences: PROJ-34 communication tracking

## User Stories

### ST-01 Teams Credential Setup
As a tenant admin, I want to configure Teams credentials and target channels so that project communication can be delivered to Teams.

Acceptance criteria:
- [ ] Credentials are stored through tenant secrets.
- [ ] Test connection validates permission to send to configured targets.
- [ ] Misconfiguration surfaces actionable errors.

### ST-02 Outbox Delivery
As a project lead, I want outbox messages to be sent to Teams so that stakeholders receive project updates in their working channel.

Acceptance criteria:
- [ ] Outbox rows can target Teams.
- [ ] Delivery status is updated after send attempt.
- [ ] Failures are retryable and sanitized.

### ST-03 Audit and Tracking
As a compliance owner, I want Teams sends logged so that project communication remains traceable.

Acceptance criteria:
- [ ] Sent messages record channel, target, timestamp, and sanitized delivery metadata.
- [ ] Message content follows privacy classification rules.
- [ ] PROJ-34 can later consume delivery/response metadata.

## Out of Scope

- Inbound Teams messages.
- Rich adaptive cards beyond a minimal text payload.
- Tenant-wide Teams app installation automation.

## Technical Requirements

- Keep adapter behind connector module gates.
- Do not log access tokens or raw Graph errors containing secrets.
- Respect outbox append-only semantics.

## V2 Reference Material

- `docs/decisions/communication-framework.md`
- `docs/decisions/connector-framework.md`

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
**Added:** 2026-06-11 · Connector-family block design (sibling of PROJ-48/50). **Replaces one stub file** (`src/lib/communication/channels/stub-teams.ts`) with a real transport. **⚠️ Microsoft Teams is a NEW external service → CIA review MANDATORY** before committing to the transport/auth model and any dependency.

### What gets built (PM view)
The Teams channel that today returns `no-adapter-yet` becomes a **real delivery transport** that posts project messages into a Teams channel, plugging into the existing `communication_outbox` (PROJ-13) and tenant-secret storage (PROJ-14). Almost everything around it already exists — this is a single-adapter swap plus credential plumbing.

**1. Reuse (no new infra)**
- **Outbox is unchanged**: `communication_outbox` already has `channel='teams'`, the 5-state status machine (`draft→queued→sent/failed/suppressed`), `error_detail`, `sent_at`, and the audit trigger. `outbox-service.ts` already routes to a channel adapter and already enforces the Class-3 block before any external send. We only replace the adapter the selector hands `teams` rows to.
- **Credentials** ride the existing `tenant_secrets` (`connector_key='teams'`, pgcrypto-encrypted, admin-only) and the `/api/connectors/[key]` PATCH/DELETE/test routes. The Teams connector descriptor gets a real `credential_schema` + `health()` probe (flip `credential_editable: true`).

**2. The transport fork — ⚠️ CIA + product decision (see open questions)**
- **Option A — Incoming Webhook (recommended MVP)**: tenant admin pastes a Teams channel **Incoming Webhook URL** (or Workflows/Power Automate URL) as the secret. Delivery = a single authenticated HTTPS POST of a text payload. **No app registration, no OAuth, no new npm dependency** (plain `fetch`). Mirrors exactly how the Slack stub→real path is meant to work and how Resend email already works. Matches the spec's "approved webhook" wording and the out-of-scope "no tenant-wide app install automation".
- **Option B — Microsoft Graph**: app registration + client-credentials token management + channel/team IDs; richer (true channel targeting, future inbound), but heavier setup, token lifecycle, and a likely dependency. Spec lists it as an alternative.
- Recommendation: **A for V1**, keep the adapter interface clean so B can replace it later without touching the outbox.
- **🔒 DECISION (2026-06-11, user):** build **Option B — Microsoft Graph**. Implies app registration + client-credentials token flow + team/channel-ID targeting and a **new dependency (or raw Graph REST)** → the CIA review below is **still mandatory before PROJ-49 /backend** to lock the SDK-vs-REST + supply-chain (PROJ-74) + token-cache storage. The adapter interface stays outbox-clean regardless.

**3. Data model additions**
- **None required for Option A** beyond the Teams credential row in `tenant_secrets` (already supported). Delivery metadata (target label, message id returned by Teams, attempt counter) lives in the existing `communication_outbox.metadata` JSONB — so **PROJ-34 can later consume delivery/response metadata** (ST-03) with no schema change.
- Option B would add token-cache columns/table — deferred with the option.

**4. Credential setup + test-connection (ST-01)**
- Admin enters the webhook URL in `/konnektoren`; the connector `health()`/`test` route does a lightweight validation POST and surfaces an **actionable, sanitized error** on misconfiguration (bad URL, 404 channel, revoked). No token/URL ever logged (reuse the `sanitizeJiraError` discipline as the pattern).

**5. Delivery, retry, idempotency (ST-02)**
- Send flow already exists: a `queued` row → adapter `deliver()` (MUST NOT throw, returns `(status, error_detail)`) → row flipped to `sent`+`sent_at` or `failed`+sanitized `error_detail`. Append-only semantics preserved.
- **Retry**: re-dispatch a `queued`/`failed` row; attempt counter in `metadata`. (A background retry-worker stays deferred per the PROJ-13 ADR open point — manual/endpoint re-send for V1.)
- **Idempotency**: Teams Incoming Webhooks are at-least-once and not natively idempotent; we accept possible duplicate on retry for V1 (documented), or carry a client dedupe key in `metadata` — to confirm with CIA.

**6. Privacy**
- `outbox.body`/`recipient` are Class-3; the existing Class-3 **block before external send** is honored automatically (a message tied to a Class-3 KI run is `suppressed`, never sent to Teams). No new privacy code.

### CIA-gated open questions (MANDATORY before /backend)
1. **Transport/auth**: Incoming Webhook (Option A, no dep) vs. Microsoft Graph (Option B, app-registration + likely dep). Drives setup burden + whether any npm dependency enters the stack.
2. **Dependency**: confirm Option A needs **none**; if Graph, which SDK (or raw REST) + supply-chain (PROJ-74).
3. **Idempotency/dedupe** on retry for at-least-once webhooks.

### Explicitly deferred
- Inbound Teams messages, rich Adaptive Cards (beyond minimal text), tenant-wide app-install automation (all spec out-of-scope).
- Background retry-worker (PROJ-13 ADR open point).

### Slice plan (handoff)
- **CIA review** (transport + dep + idempotency) → GO/adjust.
- **α /backend**: Teams connector descriptor (`credential_schema` + `health()`), real `TeamsChannel` adapter replacing the stub, wired through the existing dispatch + Class-3 block; sanitized errors; metadata attempt counter. Live send-smoke against a real test webhook (or documented deviation if none available). (~1.5 PT)
- **β /frontend**: Teams credential form + test-connection in `/konnektoren` (reuses the existing connector form pattern). (~0.5 PT)
- **γ /qa**: happy-path send, misconfig error, Class-3 suppression, retry, no-token-logging audit. (~0.5 PT)

