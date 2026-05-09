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

