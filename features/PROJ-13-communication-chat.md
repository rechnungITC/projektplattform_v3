# PROJ-13: Communication Center, Email/Slack/Teams Send, Internal Project Chat

## Status: Planned
**Created:** 2026-04-25
**Last Updated:** 2026-04-25

## Summary
Project-scoped communication center with an outbox pattern: drafts, send status, channel-agnostic API. Real channels (email via SMTP/Resend, Slack, Teams) plug in via channel adapters. Plus a rudimentary internal project chat for cases without external tools. Inherits V2 EP-11.

## Dependencies
- Requires: PROJ-7 (Project Room) — communication tab
- Requires: PROJ-8 (Stakeholders) — recipients
- Requires: PROJ-14 (Connector framework) — channel adapters live in connector registry
- Requires: PROJ-12 (KI privacy) — class-3 redaction in stored bodies; also covers KI-drafted message content traceability

## V2 Reference Material
- **Epic file:** `~/projects/Projeketplattform_v2_D.U/planning/epics/ep-11-kommunikation-und-chat.md`
- **Stories:** `~/projects/Projeketplattform_v2_D.U/planning/stories/ep-11.md` (ST-01 communication center, ST-02 email send, ST-03 Slack/Teams, ST-04 internal chat)
- **ADRs:** `docs/decisions/communication-framework.md`
- **V2 code paths to study during /architecture and /backend:**
  - `apps/api/src/projektplattform_api/services/communication/outbox.py` — outbox pattern + ChannelAdapter Protocol
  - `apps/api/src/projektplattform_api/services/communication/channels/{internal,email,slack,teams}.py`
  - `db/migrations/versions/0011_communication_outbox.py`

## User Stories
- **[V2 EP-11-ST-01]** As a user, I want a central communication area for drafts and send status so that project comms is steerable.
- **[V2 EP-11-ST-02]** As a user, I want to send drafts as email so I reach stakeholders directly from the platform.
- **[V2 EP-11-ST-03]** As a user, I want to send drafts to Slack and Teams so existing work channels are usable.
- **[V2 EP-11-ST-04]** As a user, I want a rudimentary internal project chat so that project-bound communication works without external tools.

## Acceptance Criteria

### Communication center (ST-01)
- [ ] Table `communication_outbox`: `id, tenant_id, project_id, channel (internal|email|slack|teams), recipient, subject, body, metadata (JSONB), status (queued|sent|failed|suppressed), error_detail, sent_at, created_by, created_at, updated_at`.
- [ ] `body` and `recipient` classified as class-3 (per data-privacy registry).
- [ ] Communication tab in the project room shows the outbox sorted by created_at desc.
- [ ] Filter by status, channel.
- [ ] Drafts (status=draft is added to enum if a separate draft state is needed; or use metadata) are visible separately from sent.

### Email send (ST-02)
- [ ] Channel adapter `EmailChannel` calls a real provider (Resend / SMTP via Supabase Edge Function).
- [ ] On success → status `sent`, `sent_at` set.
- [ ] On failure → status `failed`, `error_detail` set.
- [ ] AI-drafted bodies marked via metadata (per PROJ-12 F12.2).
- [ ] Only project_editor+ can send.

### Slack/Teams send (ST-03)
- [ ] `SlackChannel` adapter via incoming webhook.
- [ ] `TeamsChannel` adapter via incoming webhook or Microsoft Graph (decided in /architecture).
- [ ] Stub fallback for dev environments returns `failed: "no-adapter-yet"` per V2 ADR.
- [ ] Channel selection persisted on the outbox row.

### Internal chat (ST-04)
- [ ] Table `project_chat_messages`: `id, tenant_id, project_id, sender_user_id, body, created_at`.
- [ ] Each project has its own chat panel.
- [ ] Realtime via Supabase Realtime subscriptions (anon channel scoped per project).
- [ ] Read/write only for project members (RLS).
- [ ] Messages stored permanently with the project.

## Edge Cases
- **Cross-tenant chat eavesdrop attempt** → RLS blocks subscription join.
- **Send fails partway through a multi-recipient send** → each row tracked individually; partial failures highlighted.
- **AI-drafted body containing class-3 content sent to external channel** → blocked at outbox enqueue if classification triggers external channel block (per PROJ-12 logic; the channel itself is external).
- **Chat with deleted user** → sender displayed as "Removed user"; message body retained for project history.
- **Admin disables the email module via tenant_settings** → POST returns 403; UI hides the channel option.
- **User without project access tries to read outbox** → 404 (RLS).

## Technical Requirements
- **Stack:** Next.js 16 + Supabase + Edge Functions for outbound delivery.
- **Multi-tenant:** `communication_outbox`, `project_chat_messages` MUST have `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`. RLS scoped per project membership.
- **Validation:** Zod for outbox enqueue (channel, recipient format depending on channel, body length).
- **Auth:** Supabase Auth + project role checks.
- **Privacy:** Class-3 fields auto-redacted on tenant export (PROJ-17) and audit export (PROJ-10).
- **Performance:** Index on `(project_id, status, created_at DESC)`; chat realtime via Supabase channel.

## Out of Scope (deferred or explicit non-goals)
- Bidirectional chat (Slack/Teams → platform).
- Reading existing Slack/Teams histories.
- Bot interactions.
- Email reply parsing.
- File attachments in chat or outbox.
- Reactions / emoji.
- Recipient resolution (user vs stakeholder vs raw email) — deferred (caller passes raw string).
- Retry worker for failed outbox rows (deferred to ops story).

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
