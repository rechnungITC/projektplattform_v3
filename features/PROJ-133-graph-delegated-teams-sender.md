# PROJ-133: Graph-delegated Teams Sender (named user/bot)

## Status

Planned (Followup)

**Created:** 2026-06-15
**Origin:** CIA review of PROJ-49 (2026-06-15) — split-out of the heavier transport.
**Priority:** P2 — pilot-demand-driven.

## Summary

Send Microsoft Teams **channel** messages from a **named user or bot identity** via Microsoft Graph with **delegated** authentication. This is the heavier alternative to the PROJ-49 Workflows-Webhook adapter, deliberately split out: it requires an OAuth2 authorization-code flow, a per-tenant **refresh-token store**, admin consent for `ChannelMessage.Send`, and a real sender identity that appears on each message (`from.user`).

Build this **only when a pilot explicitly needs** messages to originate from a recognizable user/bot (not the generic "Workflows" sender that PROJ-49 produces).

## Problem / Context

CIA (2026-06-15) established that Microsoft Graph **app-only** (client-credentials) channel posting is structurally unavailable — `POST /teams/{id}/channels/{id}/messages` admits only the `Teamwork.Migrate.All` application permission, limited to data migration. The only Graph path to a real channel post is **delegated** (user context). PROJ-49 therefore ships the dep-free Workflows-Webhook adapter; this spec captures the delegated-Graph path as a separate, larger effort.

## Why this is its own spec (not part of PROJ-49)

- New persistence pattern: per-tenant **refresh-token store** (encrypted), token-refresh lifecycle, expiry/offboarding handling.
- New auth surface: OAuth2 authorization-code consent flow + admin-consent prerequisites.
- Sender-identity coupling: a real user/service identity whose offboarding breaks delivery.
- Likely a dependency decision revisited (`@azure/identity`/MSAL vs raw OAuth2) — CIA-gated.

These would each blow past the lean single-adapter PROJ-49 outbox swap (>5 files, new pattern).

## Provisional User Stories (to refine via `/requirements` when promoted)

- As a tenant admin, I want to connect a Teams sender identity via Microsoft consent, so channel messages appear from a recognizable user/bot.
- As the system, I want refresh tokens stored encrypted and auto-refreshed, so delivery survives access-token expiry without re-consent.
- As a compliance owner, I want delegated-send audited and the Class-3 block honored unchanged.

## Dependencies

- Requires: PROJ-49 (Workflows-Webhook adapter + Teams connector wiring), PROJ-13 outbox, PROJ-14 tenant_secrets.
- CIA review MANDATORY before build (delegated-auth model + dependency + refresh-token storage).

## Out of Scope (until promoted)

- Inbound Teams, Adaptive Cards/buttons (own follow-ups), tenant-wide app-install automation.

## Notes

Promote via `/requirements` (split into proper user stories + ACs) + CIA review only on concrete pilot demand. Until then this is a parking spot so the PROJ-49 CIA decision isn't lost.
