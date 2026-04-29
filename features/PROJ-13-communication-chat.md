# PROJ-13: Communication Center, Email/Slack/Teams Send, Internal Project Chat

## Status: Architected
**Created:** 2026-04-25
**Last Updated:** 2026-04-29

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

### Realitätscheck und Scope

PROJ-13 hat vier Stories, die ein gemeinsames Datenmodell teilen (Outbox + Chat) aber drei sehr unterschiedlich aufwendige Channel-Integrationen enthalten:
- **Internal** (intern speichern) — trivial
- **Email** — externer Provider (Resend), benötigt API-Key + Edge-Function-tauglichen Sender
- **Slack/Teams** — externe Webhooks/Graph-API, jeder mit eigenem Auth-Schema
- **Internal Chat** — Supabase Realtime + neues Schema

PROJ-14 (Connector Framework) ist die natürliche Heimat für die Channel-Adapter-Registry, aber **PROJ-14 ist noch nicht gebaut**. Wir bauen die Adapter-Abstraktion jetzt lokal in PROJ-13, mit einer expliziten Refactor-Empfehlung an PROJ-14, wenn das später zentralisiert wird — gleicher Ansatz wie bei PROJ-12s `lib/ai/providers/`.

Bestand vor dieser Iteration:
- Kein `communication_outbox`-Tabelle, kein `project_chat_messages`
- Kein „Kommunikation"-Tab im Project Room
- Keine Resend- oder SMTP-Pakete installiert
- `communication` ist im `tenant_settings`-Schema bereits als reservierter Modul-Key vorgesehen (PROJ-17), aktuell als „Demnächst" UI-deaktiviert

### MVP-Scope (diese Iteration)

```
✅ IN dieser Iteration                       ⏳ DEFERRED (eigene Slices)
─────────────────────────────────────────    ───────────────────────────────
Outbox-Tabelle + RLS + Audit                 Real-Slack-Webhook-Adapter
Communication-Tab im Project Room            Real-Teams-Webhook/Graph-Adapter
4 Channel-Adapter (Strategy-Pattern)         Bidirektionale Sync (Slack→Plattform)
  - Internal: voll                           Reactions / Emoji / Attachments
  - Email: Resend (mit Stub-Fallback)        Retry-Worker für gescheiterte Sends
  - Slack: Stub „no-adapter-yet"             Recipient-Resolver (User/Stakeholder→Email)
  - Teams: Stub „no-adapter-yet"             Email-Reply-Parsing
Outbox-Enqueue + Send-API                    PROJ-14-Refactor: Adapter-Registry
Project-Chat + Supabase Realtime             unifizieren mit Connector-Framework
"communication" Modul-Key wird aktivierbar
Klasse-3-Block bei externen Channels
```

### Komponentenstruktur

```
Projektraum
└── Tab „Kommunikation" (neu — gated by communication-Modul)
    ├── Sub-Tab „Outbox"
    │   ├── Filter-Bar (Status, Channel, Suche)
    │   ├── Outbox-Liste (Drafts oben, dann Sent, dann Failed)
    │   │   └── Outbox-Karte
    │   │       ├── Channel-Badge (E-Mail/Slack/Teams/Intern)
    │   │       ├── Status-Badge (Entwurf/Gesendet/Fehlgeschlagen/Unterdrückt)
    │   │       ├── Empfänger + Betreff-Preview
    │   │       ├── KI-Provenance-Badge (PROJ-12 Hook)
    │   │       └── Aktionen: Bearbeiten / Senden / Verwerfen / Erneut senden
    │   └── „Neue Nachricht"-Button
    │       └── Draft-Form (Channel-Picker, Empfänger, Betreff, Body)
    │
    └── Sub-Tab „Chat"
        ├── Nachrichten-Liste (chronologisch, Auto-Scroll)
        │   └── Message-Bubble (Sender, Body, Timestamp, „Removed user"-Fallback)
        └── Compose-Footer (Textfeld + Send-Button)

Server-Schicht
├── lib/communication/types.ts                — gemeinsame Typen
├── lib/communication/channels/
│   ├── types.ts                              — ChannelAdapter-Interface
│   ├── internal.ts                           — voll, schreibt nur ins Outbox
│   ├── email-resend.ts                       — Resend-SDK mit Klasse-3-Block
│   ├── stub-slack.ts                         — „no-adapter-yet" Fail
│   ├── stub-teams.ts                         — dito
│   └── selector.ts                           — Channel→Adapter-Lookup
├── lib/communication/outbox-service.ts       — enqueue + dispatch + class-3 check
├── lib/communication/chat-realtime.ts        — Supabase Realtime client wrapper
├── api/projects/[id]/communication/outbox    — GET (list), POST (enqueue)
├── api/communication/outbox/[id]             — GET, PATCH (edit draft), DELETE (verwerfen)
├── api/communication/outbox/[id]/send        — POST (dispatch via channel adapter)
├── api/projects/[id]/communication/chat      — GET (history), POST (post message)
└── api/communication/chat/[id]               — DELETE (admin only — out of MVP)
```

### Datenmodell (Klartext)

**`communication_outbox`** — ein Eintrag pro ausgehender Nachricht/Draft:
- Tenant + Project Scope (RLS via `is_project_member`)
- `channel`: `internal | email | slack | teams`
- `status`: `draft | queued | sent | failed | suppressed`
- `recipient`: Freitext (Spec-explizit: kein Resolver in MVP — caller übergibt rohen String)
- `subject`, `body`: Klasse-3-klassifiziert in `data-privacy-registry.ts` → werden bei externer Channel-Wahl + Klasse-3-Hard-Block geprüft
- `metadata` JSONB: KI-Drafted-Flag, ki_run_id (PROJ-12 F12.2), Retry-Counter
- `error_detail` (nur bei `failed`)
- `sent_at` timestamptz (nur nach erfolgreichem Send)
- `created_by`, `created_at`, `updated_at`

**`project_chat_messages`** — eine Zeile pro internem Chat-Beitrag:
- Tenant + Project Scope (RLS via `is_project_member`)
- `sender_user_id` FK auf `profiles` mit ON DELETE SET NULL (Edge-Case „Removed user")
- `body` (Klasse 3 — bleibt im Tenant, nie extern)
- `created_at`
- Kein `updated_at`/Edit-Pfad in MVP (Append-only-Chat)

**RLS-Strategie:**
- Outbox: SELECT für project_member; INSERT/UPDATE für editor+; DELETE für lead+/admin
- Chat: SELECT + INSERT für project_member; kein UPDATE (Append-only); DELETE deferred
- Cross-Tenant: 404 (RLS scoped per is_project_member)

**Audit-Erweiterung:** Outbox-Status-Übergänge sollten audit-log-fähig sein (status, sent_at, error_detail) — Erweiterung der PROJ-10-Whitelist um `communication_outbox`. Chat-Messages sind nicht audit-relevant (sind selbst die historische Aufzeichnung).

### Tech-Entscheidungen

| Entscheidung | Warum |
|---|---|
| Channel-Adapter als Strategy-Pattern jetzt, PROJ-14-Registry später | PROJ-14 ist noch nicht gebaut. Wir spiegeln das Muster aus `lib/ai/providers/`: ein Interface, mehrere Implementierungen, ein Selector. PROJ-14 kann das später in seine Connector-Registry hochheben — Refactor ist dann lokal. |
| Email via **Resend** (nicht SMTP) | TypeScript-natives SDK, Edge-Function-tauglich, Schreib-API genauso einfach wie ein HTTP-Call. SMTP via Edge Function bräuchte einen pure-JS-SMTP-Client und Konfiguration. Resend ist der Standard auf Vercel. |
| Resend-Adapter mit **automatischem Stub-Fallback** | Wie `ANTHROPIC_API_KEY` bei PROJ-12: ohne `RESEND_API_KEY` greift die Stub-Implementierung — deterministischer „sent" für Tests + Demos. Stand-alone-Setups bleiben ohne Resend-Account funktional. |
| Slack + Teams = **Stub-Only in MVP** | Echte Webhook-Adapter brauchen Tenant-Konfiguration für die Webhook-URL (PROJ-14-Connectors-Surface) und Klasse-3-Compliance-Review. Als Stubs mit klarer Fehlermeldung („no-adapter-yet") liefern sie Spec-AC-Compliance jetzt; echter Send kommt mit der eigenen Slice. |
| Internal-Chat via **Supabase Realtime** | Bewährter Pfad. Auf der Client-Seite ein dünner React-Hook, auf der Server-Seite nur RLS und ein INSERT-Endpoint. Keine zusätzliche Infrastruktur. |
| Outbox-Status mit **expliziter `draft`-Stufe** | Spec deutet optional an („use metadata or add to enum"). Eigene Status-Stufe ist klarer für Filter und State-Machine, kostet keine Komplexität. |
| **`communication`-Modul wird per PROJ-17 aktivierbar** | PROJ-17 hat den Modul-Key `communication` schon im Schema (als „Demnächst"). Diese Slice macht ihn zum echten Toggle: Tenant-Admins können das Kommunikations-Center pro Tenant ein-/ausschalten. Als „Demnächst" in der UI bleibt der Toggle so lange aus, bis dieser Slice live ist; danach wird er ein normaler Toggle. |
| **Klasse-3-Hard-Block** für externe Channels | `recipient` + `subject` + `body` sind class-3 (PII). Beim Senden über `email`/`slack`/`teams` (extern) prüft der Outbox-Service `classifyPayload`-style: enthält der Body Klasse-3-Daten und ist der Channel extern → Status `suppressed` mit klarer Meldung. **`internal` ist nicht extern** — Klasse-3 darf hier durch. |
| **PROJ-12-Hook**: KI-drafted-Flag in `metadata` | Kein DB-Schema-Aufwand; einfach `metadata.ki_run_id` setzen wenn der Caller den Draft aus PROJ-12 generiert. UI rendert dann ein Sparkles-Badge. |

### Sicherheitsdimension

1. **RLS** — alle Tabellen tenant- + project-scoped via `is_project_member()`/`has_project_role()`. Cross-Tenant 404.
2. **Editor+-Schreibschutz** — POST/PATCH/DELETE auf Outbox erfordern `editor` oder höher.
3. **Klasse-3-Block für externe Channels** — keine PII in externe Webhooks; geprüft im Outbox-Service vor dem Channel-Adapter-Call.
4. **Audit-Trail** — Outbox-Status-Übergänge (queued → sent / failed / suppressed) werden via PROJ-10-Trigger geloggt.
5. **Provider-Tenancy** — Resend-API-Key ist platform-wide (nicht per Tenant). Für Stand-alone-Customer mit eigenem Resend-Account bleibt der Stub greifbar; spätere Slice (PROJ-17 Erweiterung) kann pro-Tenant-Resend-Konfiguration ergänzen.
6. **Realtime-Channel-Authorization** — Supabase Realtime authentifiziert via JWT; RLS auf `project_chat_messages` filtert die abonnierten Rows automatisch. Cross-Tenant-Eavesdropping ist technisch unmöglich.

### Neue Code-Oberfläche

**Eine Migration:** `proj13_communication_outbox_and_chat.sql` — zwei Tabellen, RLS, Indexe, Audit-Whitelist-Erweiterung.

**API-Routen:**
- `GET /api/projects/[id]/communication/outbox` (Liste mit Filter)
- `POST /api/projects/[id]/communication/outbox` (Enqueue als Draft oder direkt Senden)
- `GET /api/communication/outbox/[id]`
- `PATCH /api/communication/outbox/[id]` (Edit Draft)
- `DELETE /api/communication/outbox/[id]` (Verwerfen)
- `POST /api/communication/outbox/[id]/send` (Dispatch via Adapter)
- `GET /api/projects/[id]/communication/chat` (History, paginiert)
- `POST /api/projects/[id]/communication/chat` (Post Message)

**Lib-Module:** wie oben skizziert.

**UI:** Project-Room-Tab + Outbox-Liste + Draft-Form + Chat-Panel + Realtime-Hook.

### Abhängigkeiten

**Neue npm-Pakete:**
- `resend` — TypeScript-SDK für E-Mail-Versand, optional über `RESEND_API_KEY`

**Neue Env-Variablen** (alle server-side, nicht NEXT_PUBLIC_):
- `RESEND_API_KEY` — Pflicht für realen E-Mail-Versand; ohne den Key fällt der Adapter automatisch auf den Stub zurück
- `RESEND_FROM_EMAIL` — Absender-Adresse (z. B. `noreply@itworks.de`)

### Out-of-Scope-Erinnerungen (aus der Spec)

- Bidirektionale Synchronisation (Slack/Teams → Plattform)
- Reading existing Slack/Teams histories
- Bot-Interaktionen
- Email-Reply-Parsing
- File-Attachments in Chat oder Outbox
- Reactions/Emoji
- Recipient-Resolution (User vs Stakeholder vs Raw-Email) — caller übergibt rohen String
- Retry-Worker für failed-Outbox-Rows

### Festgelegte Design-Entscheidungen

**Frage 1 — Outbox-Status-Enum: Option A.** `draft | queued | sent | failed | suppressed` — `suppressed` als eigener Endzustand für Klasse-3-Block, getrennt von echten Provider-Fehlern. State-Machine ist explizit, Filter sind eindeutig.

**Frage 2 — Modul-Aktivierung: Option A.** Migration aktiviert `communication` für alle bestehenden Tenants automatisch (UPDATE auf `tenant_settings.active_modules`, idempotent — fügt den Key nur hinzu wenn er fehlt). Reserviert-Status in `RESERVED_MODULES` wird auf toggle-bar verschoben (`TOGGLEABLE_MODULES` erweitert um `communication`). Admins können in `/settings/tenant` direkt deaktivieren.

**Frage 3 — Email-Provider: Option A.** Resend-Adapter mit automatischem Stub-Fallback bei fehlendem `RESEND_API_KEY`. Deployt heute funktional ohne Konfig; UI zeigt einen Hinweis-Banner im Stub-Modus („Demo: kein echter Versand"). Identisch zum PROJ-12 Anthropic-Pattern.

Alle drei Entscheidungen sind backend-/schema-identisch — sie steuern nur Defaults und UI-Feedback.

## Implementation Notes
_To be added by /frontend and /backend_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
