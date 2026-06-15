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
**Added:** 2026-06-11 · Connector-family block design (sibling of PROJ-48/50). **Replaces one stub file** (`src/lib/communication/channels/stub-teams.ts`) with a real transport. **✅ CIA review done 2026-06-15** → transport = **Workflows-Webhook** (Graph app-only blocked), **no new dependency**. See § CIA Review Outcome.

### What gets built (PM view)
The Teams channel that today returns `no-adapter-yet` becomes a **real delivery transport** that posts project messages into a Teams channel, plugging into the existing `communication_outbox` (PROJ-13) and tenant-secret storage (PROJ-14). Almost everything around it already exists — this is a single-adapter swap plus credential plumbing.

**1. Reuse (no new infra)**
- **Outbox is unchanged**: `communication_outbox` already has `channel='teams'`, the 5-state status machine (`draft→queued→sent/failed/suppressed`), `error_detail`, `sent_at`, and the audit trigger. `outbox-service.ts` already routes to a channel adapter and already enforces the Class-3 block before any external send. We only replace the adapter the selector hands `teams` rows to.
- **Credentials** ride the existing `tenant_secrets` (`connector_key='teams'`, pgcrypto-encrypted, admin-only) and the `/api/connectors/[key]` PATCH/DELETE/test routes. The Teams connector descriptor gets a real `credential_schema` + `health()` probe (flip `credential_editable: true`).

**2. The transport fork — ⚠️ CIA + product decision (see open questions)**
- **Option A — Incoming Webhook (recommended MVP)**: tenant admin pastes a Teams channel **Incoming Webhook URL** (or Workflows/Power Automate URL) as the secret. Delivery = a single authenticated HTTPS POST of a text payload. **No app registration, no OAuth, no new npm dependency** (plain `fetch`). Mirrors exactly how the Slack stub→real path is meant to work and how Resend email already works. Matches the spec's "approved webhook" wording and the out-of-scope "no tenant-wide app install automation".
- **Option B — Microsoft Graph**: app registration + client-credentials token management + channel/team IDs; richer (true channel targeting, future inbound), but heavier setup, token lifecycle, and a likely dependency. Spec lists it as an alternative.
- Recommendation: **A for V1**, keep the adapter interface clean so B can replace it later without touching the outbox.
- **🔒 DECISION (2026-06-11, user):** build Option B — Microsoft Graph. → **REVISED 2026-06-15 (CIA-review, user-accepted): build the Workflows-Webhook variant of Option A.** See § CIA Review Outcome.

### CIA Review Outcome (2026-06-15) — transport REVISED
> Mandatory pre-build CIA review (full report in session history) overturned the Graph lock with primary-source evidence:
> - **Graph app-only channel-post is structurally unavailable.** The Graph v1.0 reference for `POST /teams/{id}/channels/{id}/messages` admits only the `Teamwork.Migrate.All` application permission, explicitly limited to **data migration** (target channel must be in migration mode; metered). Regular sending requires **delegated** auth (`ChannelMessage.Send`, user context). A server-to-server outbox worker therefore **cannot** post via Graph app-only.
> - The classic **Incoming-Webhook connector is retired** (final 18–22 May 2026). Microsoft's successor is the **Workflows webhook** (Power Automate): a plain authenticated HTTPS POST of a MessageCard/text payload, **no app registration, no admin consent, no Graph permissions, no npm dependency**.
> - **Decision (user-accepted): drop the Graph lock; build the dep-free Workflows-Webhook adapter** (raw `fetch`, mirror `EmailChannel`/`sanitizeJiraError`). Real Graph posting (delegated auth + refresh-token store) is split into a **separate follow-up spec (PROJ-133)** for when a pilot needs messages from a named user/bot.
> - **Dependency verdict:** none — raw `fetch` (matches PROJ-47 Jira raw-client + PROJ-32 precedent; clears PROJ-74 supply-chain).

**Locked transport = Workflows-Webhook (Option A).** Tenant admin stores ONLY a Workflows webhook URL in `tenant_secrets` (`connector_key='teams'`). Delivery = one HTTPS POST. No tenant/client/secret/team/channel-ID tuple, no token acquisition/cache. The rest of this design (outbox reuse, Class-3 block, retry, privacy) is unchanged and was always transport-agnostic.

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

### CIA-gated open questions — RESOLVED (2026-06-15)
1. ~~Transport/auth~~ → **Workflows-Webhook** (Graph app-only is blocked; classic connector retired). No OAuth, no app registration.
2. ~~Dependency~~ → **none**; raw `fetch`.
3. **Idempotency/dedupe** → Workflows webhook is at-least-once and not natively idempotent → carry the outbox-row id as a correlation marker in the payload; retries reuse the same outbox row (no new row). Mandatory AC below.

### Mandatory hardening ACs (from CIA — required for /backend)
- **AC-H1** Webhook URL only in `tenant_secrets` (pgcrypto); never in logs/Sentry/error text (`sanitizeTeamsError`, mirror `sanitizeJiraError`).
- **AC-H2** Class-3 block before send stays in force — regression test required.
- **AC-H3** Retry with backoff on 429/5xx + max-attempts → then `failed`; no infinite retry.
- **AC-H4** Idempotency: outbox-row id as correlation marker; retry never creates a new outbox row.
- **AC-H5** No Adaptive Cards / buttons (out of scope held hard — minimal MessageCard text only).
- **AC-H6** Test-connection probe sanitized; Teams 4xx → clear admin message ("URL ungültig/Workflow gelöscht"), no raw body.

### Explicitly deferred
- Inbound Teams messages, rich Adaptive Cards (beyond minimal text), tenant-wide app-install automation (all spec out-of-scope).
- Background retry-worker (PROJ-13 ADR open point).
- **Real Graph posting from a named user/bot → PROJ-133** (delegated auth + refresh-token store), only on pilot demand.

### Slice plan (handoff) — Workflows-Webhook variant, dep-free
- ✅ **CIA review done** (2026-06-15) → GO, transport revised to Workflows-Webhook.
- **α /backend**: Teams connector descriptor (`credential_schema` = webhook URL + `health()`), real `TeamsChannel` adapter (raw `fetch` POST, MessageCard minimal payload) replacing `stub-teams.ts`, wired through the existing dispatch + Class-3 block; `sanitizeTeamsError`; retry/backoff + correlation-marker idempotency (AC-H1..H6). Live send-smoke against a real test Workflows webhook (or documented deviation). (~1.5 PT)
- **β /frontend**: Teams webhook-URL field + test-connection in `/konnektoren` (reuses the existing connector form pattern). (~0.5 PT)
- **γ /qa**: happy-path send, misconfig error, Class-3 suppression, retry, no-token-logging audit. (~0.5 PT)

