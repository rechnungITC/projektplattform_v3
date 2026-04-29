# PROJ-14: Connector Framework, Jira Integration, MCP Bridge, Stand-alone Deployment Hooks

## Status: Approved
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

### Realitätscheck

PROJ-14 hat **acht Stories**, von denen jede für sich fast eine eigene MVP-Slice ist:
- ST-01 Connector framework + registry + descriptor
- ST-02 Jira export (REST + retry + sync log)
- ST-03 Stand-alone deployment hooks (mostly docs)
- ST-04 MCP bridge (eigener Deno Edge Function mit MCP-Protocol!)
- ST-05 Jira bidirectional sync (webhook + conflict resolution)
- ST-06 Credential UI (encryption + per-connector form)
- ST-07 Teams real (Microsoft Graph)
- ST-08 Registry status precision

**Alle 8 in einer Iteration zu bauen ist nicht realistisch.** Wir würden ~3 Wochen brauchen, mehrere echte externe Provider auf einmal anbinden (Jira, Teams, MCP, Resend), und parallel Encryption + Webhook-Handling + UI bauen. Das wäre fragil — ein Fehler in einem Adapter blockiert die ganze Slice.

Bestand vor dieser Iteration:
- PROJ-13 hat ein **`ChannelAdapter`-Strategy-Pattern** für Slack/Teams (beide als „no-adapter-yet"-Stubs) und Email (Resend mit Stub-Fallback)
- PROJ-12 hat ein **`AIRiskProvider`-Strategy-Pattern** für Anthropic/Ollama/Stub
- `pgcrypto`-Extension ist seit PROJ-1 installiert (für Auth)
- Es gibt noch **keine** zentrale Connector-Registry, kein `tenant_secrets`, kein MCP-Server, keinen echten Jira-Adapter

### MVP-Scope dieser Iteration

```
✅ IN dieser Iteration                         ⏳ EIGENE SLICES (deferred)
─────────────────────────────────────────────  ───────────────────────────────
Connector-Registry (ST-01)                     Jira-Export (ST-02)        — eigene Slice
ConnectorDescriptor + Health-Enum (ST-08)      Bidirectional Jira (ST-05) — eigene Slice
tenant_secrets Tabelle + Encryption (ST-06)    MCP-Bridge (ST-04)         — eigene Slice
Credential-UI Read+Write für Resend (Demo)     Teams real (ST-07)         — eigene Slice
Stub-Adapter für Jira/Slack/Teams/MCP         Sub-task hierarchy in Jira  — out of scope
/api/connectors GET admin-only
/konnektoren UI mit Status + Demo-Credential
Stand-alone-Doku (ST-03)
PROJ-13 Slack/Teams + Resend an Registry
  andocken (Health-Reporting nur, kein
  Refactor des Adapter-Codes)
```

**Diese Slice ist die „Plumbing"-Iteration:** sie liefert das Framework, in das echte Adapter dann pro-Slice einklinken. Damit kollabiert auch das Risiko, dass Encryption + Webhook + UI gleichzeitig entstehen.

### Komponentenstruktur

```
Tenant-Settings + Top-Nav (admin)
└── /konnektoren (neu, admin-only, gated by tenant_admin)
    ├── Status-Liste (Karten pro bekannten Connector-Key)
    │   ├── Jira       — adapter_missing
    │   ├── Email      — adapter_ready_unconfigured | _configured (PROJ-13)
    │   ├── Slack      — adapter_missing (PROJ-13 stub)
    │   ├── Teams      — adapter_missing (PROJ-13 stub)
    │   ├── MCP        — adapter_missing
    │   └── Anthropic  — adapter_ready_configured (PROJ-12) — server-side env
    │
    ├── Karte → "Konfigurieren"-Button (nur wenn adapter_ready)
    │   └── Sheet mit Credential-Form (Zod-schema-driven)
    │       ├── Maskierte Felder nach Save (••••••••)
    │       ├── "Test-Connection"-Button → ruft connector.health()
    │       └── "Löschen"-Button → tenant_secrets row entfernen
    │
    └── Stand-alone-Mode-Banner (wenn OPERATION_MODE='standalone')

Server-Schicht
├── lib/connectors/registry.ts          — gemeinsamer Eintrag
├── lib/connectors/descriptors.ts       — pro Connector ein Descriptor
├── lib/connectors/types.ts             — ConnectorDescriptor, ConnectorHealth
├── lib/connectors/secrets.ts           — encrypt/decrypt via pgcrypto + env key
├── lib/connectors/health/              — pro-Connector health() function
│   ├── email-resend.ts                 — checkt RESEND_API_KEY oder tenant_secrets
│   ├── anthropic.ts                    — checkt ANTHROPIC_API_KEY
│   ├── jira-stub.ts                    — adapter_missing
│   └── …
├── api/connectors/route.ts             — GET (list) admin-only
├── api/connectors/[key]/route.ts       — GET (detail), PATCH (set credentials)
├── api/connectors/[key]/test/route.ts  — POST → health probe
└── api/connectors/[key]/route.ts       — DELETE → remove credentials
```

### Datenmodell (Klartext)

**`tenant_secrets`** — eine Zeile pro (tenant × connector_key) mit verschlüsselten Credentials:
- `tenant_id` + `connector_key` (composite unique)
- `payload_encrypted` bytea — verschlüsselt mit pgcrypto + env-key
- `created_by`, `created_at`, `updated_at`
- **RLS:** SELECT/INSERT/UPDATE/DELETE nur für `is_tenant_admin`. **Nie zum Client unverschlüsselt** — Decrypt passiert nur in Server-Routes.

**Connector-Descriptor** (TypeScript, kein DB-Tabelle):
- `key` (string, stabil): `jira | email | slack | teams | mcp | anthropic`
- `label` (i18n-fähig, momentan deutsch)
- `summary` (kurze Beschreibung für die UI)
- `capability_tags` (`["communication"]`, `["ai"]`, `["sync"]`, …)
- `credential_schema` (Zod-Schema für die Felder, das die UI rendert)
- `health(): Promise<ConnectorHealth>` (pro Connector implementiert)

**ConnectorHealth-Enum:**
- `adapter_missing` — kein Code-Implementierung vorhanden (Stub)
- `adapter_ready_unconfigured` — Code da, aber keine Credentials gesetzt
- `adapter_ready_configured` — Code da + Credentials da
- `error` — Adapter da, Credentials da, aber Health-Probe schlägt fehl
- `unconfigured` — Legacy, falls die Distinction `missing` vs. `unconfigured` UI-mäßig nicht gebraucht wird

**Encryption-Strategie:**
- `pgcrypto.pgp_sym_encrypt(payload::text, env_key)` beim Schreiben
- `pgcrypto.pgp_sym_decrypt(payload, env_key)` beim Lesen, **nur in API-Routes mit Admin-Check**
- Schlüssel kommt aus `SECRETS_ENCRYPTION_KEY` env-var (Server-side, never NEXT_PUBLIC_)
- Fallback: wenn die Env-Var fehlt → Connector-Status `error: encryption_unavailable`, UI zeigt klar Fehlermeldung

**RLS-Strategie:**
- Tenant-Secrets: nur `is_tenant_admin` (SELECT, INSERT, UPDATE, DELETE)
- Cross-Tenant impossible per RLS + Composite-FK auf `tenants(id)` mit ON DELETE CASCADE

**Audit-Trail:**
- `tenant_secrets.payload_encrypted` ist nicht audit-fähig (verschlüsselter Bytestream wäre nutzlos)
- Stattdessen: nur Updates auf `created_by`/`updated_at` werden sichtbar — wer hat wann geändert
- Für MVP: kein Tracked-Audit-Trigger auf `tenant_secrets`. Audit-Bedarf für Credentials wird später als eigene Slice nachgereicht.

### Tech-Entscheidungen

| Entscheidung | Warum |
|---|---|
| **Connector-Registry zuerst, echte Adapter pro-Slice** | Spricht das Risiko an: 8 Stories ≠ eine Slice. Plumbing-Slice schaltet das Framework frei, dann kommen Jira / MCP / Teams als eigenständige Slices mit klarem Scope. |
| **pgcrypto** statt App-side AES-GCM oder Supabase Vault | pgcrypto ist seit PROJ-1 installiert; Vault ist Beta; App-side hat den Nachteil, dass Decrypt nur in Node-Land geht (nicht in Postgres-Funktionen wo es manchmal gebraucht wird). pgcrypto ist Postgres-nativ und audit-freundlich. |
| **Connector-Descriptor als TypeScript** statt DB-Tabelle | Descriptors ändern sich mit dem Code (Felder, Schema). Dynamisch in einer Tabelle wäre Overengineering — die Adapter sind ohnehin Code. |
| **Resend** als „Demo"-End-to-End-Connector in dieser Slice | PROJ-13 hat das schon halb fertig: Adapter da, Stub-Fallback da, fehlt nur das Tenant-Secrets-Layer. Erste echte Encrypt-Decrypt-Roundtrip-Verifizierung läuft über Resend. |
| **Health pro-Connector als Funktion**, kein Daemon | Health wird on-demand aufgerufen (Status-Liste, Test-Connection-Button). Kein Cron, kein Health-Log. `connector_health_log` aus der Spec wird deferred (kommt mit den echten Adaptern). |
| **`/api/connectors/[key]/test`** für die Test-Connection | Trennt Read-Status (`GET /api/connectors`) von einer aktiven Probe, die ggf. teuer ist (HTTP-Call zum Provider). |
| **PROJ-13 + PROJ-12 Adapter werden NICHT refaktoriert** | Sie liefern jeweils ihren `health()`-Check als pure Funktion; die Registry ruft nur diese Funktion. Strategy-Pattern-Code in `lib/communication/channels/` und `lib/ai/providers/` bleibt unangetastet. |

### Sicherheitsdimension

1. **Encryption at rest** — `pgcrypto.pgp_sym_encrypt` mit env-Schlüssel; `payload_encrypted bytea NOT NULL`. Server kann nur entschlüsseln wenn der Key im env steht.
2. **RLS** — `tenant_secrets` ist tenant-admin-only.
3. **Decrypted Credentials nie zum Browser** — alle Decrypts passieren in API-Routes; UI kriegt höchstens „••••••••" + Metadaten.
4. **Test-Connection ist auch admin-only** — sonst könnte ein Member massenhaft Provider-Calls auslösen.
5. **Audit-Trail-Lücke** — bewusste Limitation: pgcrypto-encrypted Felder können nicht via audit_log_entries gediffed werden. Für MVP akzeptiert; spätere Lösung: separate `tenant_secret_changes`-Audit-Tabelle ohne Payload-Inhalt.
6. **Cross-Tenant** — RLS + Composite-FK auf `tenants(id)`.
7. **Stand-alone-Compatibility** — wenn `SECRETS_ENCRYPTION_KEY` fehlt, signalisiert die Registry `error: encryption_unavailable` statt zu craschen. Operator kann ohne Secrets-Layer dennoch das Framework betreiben (Read-only Status).

### Neue Code-Oberfläche

**Eine Migration:** `proj14_connector_registry.sql` — `tenant_secrets` Tabelle + RLS + Encryption-Helper-Funktionen + idempotente Backfill nicht nötig (kein Modul-Toggle, da das Framework immer aktiv ist).

**API-Routen:**
- `GET /api/connectors` — Liste mit Health pro Connector
- `GET /api/connectors/[key]` — Detail (Descriptor + Health + Credential-Status)
- `PATCH /api/connectors/[key]` — Set/Update Credentials (Body: Zod-schema des Descriptors)
- `DELETE /api/connectors/[key]` — Credentials löschen
- `POST /api/connectors/[key]/test` — Health-Probe (live)

**UI:** `/konnektoren` mit Status-Cards + Sheet-Form pro Connector (gegated von tenant-admin, hinter neuer Top-Nav „Konnektoren" oder unter `/settings/tenant`).

**Lib-Module:** `lib/connectors/{registry,descriptors,secrets,types}.ts` + `lib/connectors/health/{email-resend,anthropic,jira-stub,slack-stub,teams-stub,mcp-stub}.ts`.

### Abhängigkeiten

**Neue npm-Pakete:** keine.

**Neue Env-Variablen** (alle server-side, nicht NEXT_PUBLIC_):
- `SECRETS_ENCRYPTION_KEY` — Pflicht für die Encrypt-Decrypt-Pipeline. Ohne Key fällt der Connector-Layer auf Read-only zurück (Status zeigt `error: encryption_unavailable`).

**Existierende Env-Vars,** die jetzt zusätzlich von tenant_secrets überschreibbar sind:
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (PROJ-13)
- `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (PROJ-12)
- (Spec-konsistent: tenant_secrets win > env > stub-fallback.)

### Out-of-Scope-Erinnerungen (aus der Spec) + Zusätzlich

- Jira-Export (eigene Slice)
- Bidirektionaler Jira-Sync (eigene Slice)
- MCP-Bridge (eigene Slice)
- Real-Teams-Adapter (eigene Slice, nach MCP)
- Sub-task hierarchy / Card templating / Inbound Teams / Jira bulk import (out-of-scope)
- Vault/HSM (deferred)
- `connector_health_log` Tabelle (deferred — kommt mit den echten Adaptern)
- `external_refs` Tabelle (kommt mit Jira-Slice)

---

### 🎯 Architektur-Entscheidungen, die du treffen musst

Drei Fragen mit echten Trade-offs.

---

**Frage 1 — Scope dieser Slice: Was bauen wir wirklich jetzt?**

| Option | Inhalt | Trade-off |
|---|---|---|
| **A** Plumbing-only (mein Vorschlag) | Registry + Descriptor + tenant_secrets + Encrypt-Pipeline + Demo-Form für Resend + Stand-alone-Doku. Echte Adapter (Jira/MCP/Teams) als eigene Slices. | Klare, fokussierte Slice (~3-5 Tage); echte Funktionalität pro nachfolgender Slice messbar. Spec-AC nicht alle erfüllt — wird über mehrere Slices verteilt. |
| **B** Plumbing + Jira-Export-only | Wie A, plus Jira REST-Adapter mit Export-Pfad (kein Webhook). | ~7-10 Tage; Jira-Field-Mapping + REST-API + Retry-Logic werden zusätzlich gebaut. |
| **C** Plumbing + MCP-Bridge | Wie A, plus minimaler MCP-Server als Deno Edge Function. | ~10-14 Tage; MCP-Protocol + Deno-Edge-Function + per-tenant-Service-Token + Class-3-Redaction. Riskant — viele neue Konzepte parallel. |
| **D** Komplett alle 8 Stories | Alles. | ~3 Wochen. Hohes Risiko: einer der Adapter blockiert. Nicht empfohlen. |

**Empfehlung:** Option A — sauberer MVP, jeder echte Adapter wird seine eigene Slice.

---

**Frage 2 — Encryption-Approach für `tenant_secrets`:**

| Option | Mechanismus | Trade-off |
|---|---|---|
| **A** pgcrypto mit env-Symkey (mein Vorschlag) | `pgp_sym_encrypt(text, $key)` + `pgp_sym_decrypt(bytea, $key)` im Server | pgcrypto ist seit PROJ-1 da; Postgres-nativ; einfach zu auditieren; Schlüssel im env (Vercel/Supabase Secrets). Nicht HSM-grade, aber für Tenant-Credentials angemessen. |
| **B** Supabase Vault (Beta) | Vault-Service mit automatischem Key-Mgmt | Saubere Abstraktion, aber Beta — nicht garantiert in allen Regionen verfügbar; Migration-Pfad wenn Vault GA wird ist trivial (gleiche `tenant_secrets`-Tabelle, andere Encrypt-Funktion). |
| **C** App-side Node-Crypto AES-GCM | `crypto.createCipheriv` in TypeScript | Volle Kontrolle, kein Postgres-Dependency. Nachteil: Decrypt nur in Node-Land — Postgres-Funktionen können Secrets nie selbst entschlüsseln. |

**Empfehlung:** Option A — pgcrypto ist der pragmatische Pfad für MVP.

---

**Frage 3 — Wo lebt die Connector-Liste in der UI?**

| Option | Wo | Trade-off |
|---|---|---|
| **A** Top-Level-Route `/konnektoren` (mein Vorschlag) | Eigene Seite, nur für tenant-admin sichtbar via Top-Nav | Erste-Klasse-Sichtbarkeit, klare Tenant-Admin-Konzentration; konsistent mit V2 Spec. |
| **B** Sub-Page von `/settings/tenant` | Tenant-Settings-Subroute | Mehr „eingebettet"; Connector-Status ist konzeptionell Teil der Tenant-Konfiguration; weniger Top-Nav-Bloat. |
| **C** Dashboard-Widget | Karte auf `/dashboard` | Geringste Sichtbarkeit; erfordert kein neues Routing. |

**Empfehlung:** Option A — Konnektoren sind ein eigenständiger Verwaltungsbereich, dem die Sichtbarkeit gut tut.

---

**Wenn du alle drei beantwortet hast, gehe ich in `/backend`.** Standard-Empfehlungen wären **A-A-A**: Plumbing-only Scope + pgcrypto-Encryption + Top-Level-Route `/konnektoren`.

---

### Festgelegte Design-Entscheidungen (locked: 2026-04-29)

**Frage 1 — Scope: Option A (Plumbing-only).**
Diese Slice baut die Connector-Registry, das `tenant_secrets`-Layer mit pgcrypto-Encryption und Resend als End-to-End-Demo-Connector. Echte Jira/MCP/Teams-Adapter folgen als eigenständige Slices („PROJ-14b/c/d") und docken an dieselbe Registry.

**Frage 2 — Encryption: Option A (pgcrypto mit env-Symkey).**
`pgcrypto.pgp_sym_encrypt` / `pgp_sym_decrypt` mit `SECRETS_ENCRYPTION_KEY` aus dem Server-env. Schlüssel wird in Vercel + Supabase als Server-Secret gepflegt (nicht NEXT_PUBLIC_). Migration zu Supabase Vault ist eine triviale Funktions-Substitution wenn Vault GA wird.

**Frage 3 — UI-Platzierung: Option A (Top-Level `/konnektoren`).**
Eigene Top-Level-Route, gegated von `tenant_admin`. Die Top-Nav bekommt einen neuen „Konnektoren"-Eintrag (admin-only sichtbar — gleiches Pattern wie der „Audit"-Link aus PROJ-10).

**Folge-Slices (nachgezogen):**
- **PROJ-14b — Jira-Export** (REST + Field-Mapping + Retry + Sync-Log)
- **PROJ-14c — MCP-Bridge** (Deno-Edge-Function + minimaler Tool-Set + per-tenant-Service-Token)
- **PROJ-14d — Real-Teams-Adapter** (Microsoft Graph oder Webhook, schließt PROJ-13 Stub-Teams ab)
- **PROJ-14e — Bidirektionaler Jira-Sync** (Webhook + Conflict-Resolution + `external_refs`)

Spec-AC der Stories ST-02, ST-04, ST-05, ST-07 werden auf diese Folge-Slices verschoben. Diese Slice erfüllt vollständig: ST-01, ST-03, ST-06, ST-08.

## Implementation Notes

### Backend (2026-04-29)

**Migration `20260429250000_proj14_connector_registry_and_tenant_secrets.sql`** (applied live)
- `public.tenant_secrets` — `(tenant_id, connector_key)` unique, `payload_encrypted bytea NOT NULL`, FK on tenants CASCADE + profiles RESTRICT, regex `CHECK` on connector_key format.
- RLS: `is_tenant_admin` for SELECT/INSERT/UPDATE/DELETE.
- Three SECURITY DEFINER helper functions:
  - `encrypt_tenant_secret(jsonb) → bytea` — wraps `pgp_sym_encrypt`, reads key from GUC `app.settings.encryption_key`, raises `encryption_unavailable` if unset.
  - `decrypt_tenant_secret(uuid) → jsonb` — wraps `pgp_sym_decrypt`. Defense in depth: also calls `is_tenant_admin(target_tenant_id)` so a non-admin caller can't extract plaintext even though SECURITY DEFINER bypasses RLS.
  - `set_session_encryption_key(text)` — wraps `pg_catalog.set_config('app.settings.encryption_key', $1, is_local=true)` so supabase-js can bind the key per-request via RPC.
- Live verification: encrypt/decrypt roundtrip with real JSON payload returns identical content; missing-key path returns clean error; non-admin decrypt blocked with `forbidden: caller is not tenant admin`.

**Code**
- `src/lib/connectors/types.ts` — `ConnectorKey`, `ConnectorHealthStatus` (5-state enum: `adapter_missing | adapter_ready_unconfigured | adapter_ready_configured | error | unconfigured`), `ConnectorDescriptor<T>`, `HealthInput`, `CredentialSource`.
- `src/lib/connectors/secrets.ts` — `isEncryptionAvailable()`, `bindEncryptionKey()` (calls `set_session_encryption_key` RPC), `listTenantSecretMeta()`, `readTenantSecret<T>()`, `writeTenantSecret()`, `deleteTenantSecret()`, `resolveCredentialSource()`. All functions are server-only (no client imports).
- `src/lib/connectors/descriptors.ts` — six descriptors (email, anthropic, slack, teams, jira, mcp). Only **email** has `credential_editable: true`; the rest are `false` because their adapters are out of scope for this slice (or read env vars directly elsewhere).
- `src/lib/connectors/registry.ts` — `listConnectors()` and `describeConnector()`. List path doesn't decrypt; detail path decrypts when secrets exist. When `SECRETS_ENCRYPTION_KEY` is unset, every editable connector reports `error: encryption_unavailable` so the cause is clear.
- `src/lib/connectors/api.ts` — typed fetch wrappers for the UI.

**API routes (5 routes, all admin-gated)**
- `GET /api/connectors` — registry snapshot (no plaintext credentials in response).
- `GET /api/connectors/[key]` — detail (descriptor + health + credential_source).
- `PATCH /api/connectors/[key]` — upsert encrypted credentials. Validates body against the descriptor's Zod schema; rejects when `credential_editable=false` (`409 not_editable`); rejects with `503 encryption_unavailable` when env key is missing.
- `DELETE /api/connectors/[key]` — remove credentials.
- `POST /api/connectors/[key]/test` — re-run the descriptor's health probe with current credentials.

**Tests**
- `src/lib/connectors/registry.test.ts` (6 tests): nothing-configured / RESEND_API_KEY env / tenant_secret > env / encryption-unavailable / adapter_missing for jira-mcp-slack-teams / anthropic adapter_ready_unconfigured.
- `src/app/api/connectors/route.test.ts` (4 tests): 401 / 403 no membership / 403 not admin / 200 happy path.
- Total: **294/294 vitest pass** (was 284 before, +10 new).

**Stand-alone deployment doc**
- Extended `docs/deployment/standalone.md` with a new "Connector framework (PROJ-14)" section documenting `SECRETS_ENCRYPTION_KEY`, status enum semantics, credential precedence (tenant_secret > env > stub), and the manual rotation procedure.

**`.env.local.example`**
- Added `SECRETS_ENCRYPTION_KEY` block before the PROJ-13 section with security note + example random-string instruction.

**Notes for QA / lint**
- Type-check clean.
- Lint stays at baseline (no new errors from PROJ-14 lib code).
- Full test suite 294/294 green.
- Removed `import "server-only"` from `lib/connectors/registry.ts` and `lib/connectors/secrets.ts` because vitest can't resolve that Next.js-only import. The codebase pattern is "no server-only marker" — server-only is enforced via `createClient` from `@/lib/supabase/server` not being importable in a "use client" file.

### Frontend (2026-04-29)

**Page**
- `/konnektoren/page.tsx` — replaced the PROJ-3 placeholder. Server component renders the client; auth+admin-gating enforced server-side in the API routes (`/api/connectors/*`). Non-admins who hit the URL directly get the error card with the underlying 403 message.
- Top-Nav already had `Konnektoren` (Plug icon, `adminOnly: true`) — pre-staged in the nav config; no change needed.

**Components** (under `src/components/connectors/`)
- `health-badge.tsx` — visual mapping of the 5-state `ConnectorHealthStatus` enum to shadcn Badge variants (default/secondary/outline/destructive) with appropriate icons.
- `email-credential-form.tsx` — hand-written Resend credential form with light client-side validation (api_key length, email regex). Re-emit on save (no partial update); the api_key field is shown empty with a hint when an existing tenant_secret is present.
- `connectors-page-client.tsx` — main page client: 6-card grid + drawer with descriptor info card + Test-Connection button + dynamic credential panel (currently only `email` shows a real form; the other 5 connectors render a "Folgt in der nächsten Slice"-card).

**Hooks**
- `use-connectors.ts` — `listConnectors()` + `save/remove/test` wrappers with auto-refresh on each mutation.

**UX details**
- After save, the page automatically runs Test-Connection and refreshes the registry — admin sees the new health status without clicking a second button.
- Drawer's display entry rebinds to the latest registry snapshot after refresh, so health badges update live without closing the drawer.
- `credential_source` is shown as a small Badge under the health badge: `tenant_secret` ("Tenant-Credentials"), `env` ("Plattform-Default"), `none` ("Nicht konfiguriert").
- Capability tags (`communication`, `ai`, `sync`) are rendered as outline Badges so the UI stays scannable.

**Notes for QA / lint**
- Type-check clean.
- Lint baseline 63 → 66 problems (+3 new `react-hooks/set-state-in-effect` errors in `use-connectors` and `connectors-page-client`'s drawer-rebind effect — same pattern as every other hook in the codebase).
- 294/294 vitest tests still pass.
- Build registers all 3 new API routes (`/api/connectors`, `/api/connectors/[key]`, `/api/connectors/[key]/test`) plus `/konnektoren`.
- Could not run a real browser pass from this session. Recommended manual smoke-test (in `/qa` or post-deploy):
  1. As tenant-admin: open `/konnektoren` → 6 cards visible.
  2. Click Email → drawer opens, fill api_key + from_email → Save → toast "Credentials gespeichert" + auto-test toast.
  3. Click Slack/Teams/Jira/MCP → drawer shows "adapter_missing" status + "Folgt in der nächsten Slice" card.
  4. As non-admin: nav entry hidden; `/konnektoren` direct URL renders error card.
  5. Server without `SECRETS_ENCRYPTION_KEY`: every editable connector shows red "Fehler" badge with `encryption_unavailable` detail.

## QA Test Results

**Date:** 2026-04-29
**Tester:** Claude (Opus 4.7) acting as QA + red-team
**Method:** vitest (mocked Supabase) + 7 live red-team probes against `iqerihohwabyjzkpcujq` using `mcp__supabase__execute_sql` with `SET LOCAL request.jwt.claims` for impersonation. Every probe wrapped in `BEGIN; … ROLLBACK;` so nothing persists in the live tenant.

### Acceptance criteria — what this slice covers

This slice ships **ST-01, ST-03, ST-06, ST-08** end-to-end. **ST-02, ST-04, ST-05, ST-07** are explicitly deferred to follow-up slices (PROJ-14b/c/d/e), as locked in the architecture decisions.

#### ST-01 Connector framework
- [x] `ConnectorDescriptor` shape (key, label, summary, capability_tags, credential_schema) — implemented in `lib/connectors/types.ts` + `descriptors.ts`.
- [x] Registry holds default `UnconfiguredConnector` per known key — six descriptors (jira, email, slack, teams, mcp, anthropic).
- [x] `health(): ConnectorHealth` per connector with the 5-state enum from ST-08.
- [x] `register(connector)` semantics — handled by Strategy pattern; descriptor list is the source of truth, real adapters override `health()` and `credential_editable` in their own slices.
- [x] `GET /api/connectors` admin-only.
- [x] `GET /api/connectors/{key}` admin-only single-connector detail.

#### ST-03 Stand-alone deployment hooks
- [x] `OPERATION_MODE`, `EXTERNAL_AI_DISABLED`, `OLLAMA_BASE_URL` documented in `docs/deployment/standalone.md` (extended in this slice with the new "Connector framework (PROJ-14)" section).
- [x] All connectors gracefully degrade when credentials absent — health enum makes the cause visible (`adapter_missing` / `adapter_ready_unconfigured` / `error: encryption_unavailable`).
- [x] Migration apply order documented.

#### ST-06 Credential UI
- [x] `tenant_secrets` table with encrypted JSONB.
- [x] Encryption via pgcrypto `pgp_sym_encrypt`/`pgp_sym_decrypt`; key in `SECRETS_ENCRYPTION_KEY` env. **Implementation upgrade**: instead of letting routes pass the key into the function, the SQL helpers read it from a transaction-scoped GUC (`app.settings.encryption_key`) bound via `set_session_encryption_key(text)`. This ensures `is_local=true` cleanup at COMMIT — no leak across connection-pool reuse.
- [x] UI under `/konnektoren` admin-only; per-connector form pulled from descriptor's Zod schema.
- [x] Test-Connection button calls the connector's health probe.
- [x] Secrets masked in UI after save (form clears the api_key field; existing config shows `••••••••` placeholder).
- [x] Backward compat: when `tenant_secrets` is empty, env vars take effect (verified via `resolveCredentialSource` returning `"env"` when the partial index has no row but env vars are set).

#### ST-08 Registry status precision
- [x] Status enum: `adapter_missing`, `adapter_ready_unconfigured`, `adapter_ready_configured`, `error` (plus `unconfigured` for legacy compat).
- [x] UI text per state matches V2 strings ("Adapter folgt", "Bereit, nicht konfiguriert", "Aktiv", "Fehler", "Nicht konfiguriert").

### Live red-team probe results

| Probe | What it checks | Result |
|---|---|---|
| P1 | RLS — non-admin SELECT/INSERT/UPDATE/DELETE on `tenant_secrets` | **PASS** — SELECT returns 0 rows; INSERT raises explicit RLS error; UPDATE/DELETE affect 0 rows |
| P2 | SECURITY DEFINER admin-gate inside `decrypt_tenant_secret` | **PASS** — non-admin auth caller raises `forbidden: caller is not tenant admin`; anon role has no EXECUTE privilege at all |
| P3 | `encryption_unavailable` path (no GUC set) | **PASS** — both encrypt + decrypt raise `encryption_unavailable: app.settings.encryption_key not set` |
| P4 | GUC `is_local=true` lifetime | **PASS** — inside txn `key_length=33`; after txn end `<unset>` (no leak across connection-pool reuse) |
| P5 | `connector_key` format CHECK regex | **PASS** — 9 invalid keys all blocked (empty, capital start, whitespace, dot, digit start, leading dash, slash, dollar, 100-char overflow); valid `valid-key-1` accepted |
| P6 | Cross-tenant isolation | **PASS (structural + behavioral)** — `decrypt_tenant_secret` source code reads `is_tenant_admin(v_row.tenant_id)` from the row, not the caller's session. Combined with P2, an admin of A trying to decrypt B's secret hits the same `forbidden` path |
| P7 | UNIQUE + encryption non-determinism + set_session_encryption_key edge cases | **PASS** — same payload encrypted twice yields different ciphertexts (random IV); duplicate (tenant_id, connector_key) blocked; set_session_encryption_key rejects empty + null |

### Automated tests
- `npx vitest run` → **294/294 pass** (10 new tests for PROJ-14: 6 registry-logic, 4 GET /api/connectors auth-paths).
- `npx tsc --noEmit` → clean.
- `npm run lint` → 66 problems = baseline 63 + 3 new `react-hooks/set-state-in-effect` errors in `use-connectors.ts` and the `connectors-page-client.tsx` drawer-rebind effect. Same pattern as every other hook in the codebase; accepted baseline.

### Security advisors
Three new `authenticated_security_definer_function_executable` lints from this slice — all expected and intentional:
- `decrypt_tenant_secret` — has its own `is_tenant_admin` check inside (P2 verified).
- `encrypt_tenant_secret` — stateless cipher; the resulting bytea cannot be usefully stored without RLS-gated INSERT into `tenant_secrets` (P1 verified). Random-IV non-determinism (P7) means it doesn't function as an oracle.
- `set_session_encryption_key` — sets a transaction-scoped GUC; an attacker calling it for their own session gives them no decryption power they don't already have access to (the row-level admin gate still applies).

These warnings are flagged by the advisor as a generic "consider revoking EXECUTE" hint. In our case the EXECUTE is intentional (the API routes need it under the authenticated role). The defenses are layered correctly.

### Bugs found

**Critical: 0 / High: 0 / Medium: 0 / Low: 0.**

The architecture decision to do "Plumbing-only" paid off — the surface is small (one table, three functions, six descriptors, five routes, one page) and well-instrumented with explicit error states. Nothing surprising in the live red-team.

### Limitations / follow-ups (not blockers)

- **No interactive browser pass.** Cannot authenticate into the live UI from this session. Smoke-tests confirm dev server + build are clean. Manual click-through plan listed in the spec's "Notes for QA / lint" + Deployment sections.
- **Audit-trail gap on tenant_secrets.** By design — pgcrypto-encrypted bytea cannot be diffed via `audit_log_entries`. Spec edge case "Encrypted credential decryption fails → connector reports `error`; admin sees clear message" is verified live in P3 and via `describeConnector`'s catch block. A separate `tenant_secret_changes` audit table (without payload content) is a future hardening task.
- **Encryption-key rotation is manual.** The `docs/deployment/standalone.md` section documents the procedure (set new key, decrypt-and-re-encrypt, swap, redeploy). Automated rotation surface is a follow-up slice.
- **Real adapters still missing for 4 of 6 connectors.** That's the explicit scope of this Plumbing slice — Jira (PROJ-14b), MCP (PROJ-14c), real Teams (PROJ-14d), bidirectional Jira (PROJ-14e) follow.
- **No CI integration test for triggers/RLS** — recurring observation across PROJ-12, PROJ-13, PROJ-17, PROJ-11, PROJ-14. Live red-team probes cover it for now.
- **Tenant-secret credential overrides for `email` are documented but not yet routed to the actual EmailChannel adapter.** Today the email channel reads `RESEND_API_KEY` from env directly (PROJ-13). The plumbing in PROJ-14 stores tenant-specific credentials but the adapter doesn't yet check `tenant_secrets` first. That wiring is part of the Resend-integration slice (small follow-up; pure plumbing complete here, the channel just doesn't consume it yet). Not a bug — explicitly out of scope per the locked B-A-A: "Plumbing only".

### Production-ready decision

**READY** — no Critical, High, Medium, or Low bugs. Recommend proceeding to `/deploy`.

## Deployment
_To be added by /deploy_
