# PROJ-50: Bidirectional Jira Sync

## Status

Deployed — 2026-06-15 (Tag `v1.93.0-PROJ-50`). α backend + β frontend + γ QA; 0 Critical/0 High. Code live via PR #136; QA-Closure 2026-06-15 (Prod-State + Routen live re-verifiziert, Migration-Versions-Drift bereinigt).

## Deployment

- **Date:** 2026-06-15 (Closure; Code seit PR #136 / `b468d84` auf main + Vercel-Auto-Deploy, 2 Migrations seit 2026-06-11/12 via MCP in Prod).
- **Tag:** `v1.93.0-PROJ-50`
- **Prod-Verify 2026-06-15 (live):**
  - DB: 3/3 Tabellen (`jira_inbound_events`, `jira_sync_conflicts`, `jira_webhook_tokens`), Idempotenz-Index `jira_inbound_events_delivery_unique` + `jira_sync_conflicts_resolved_shape_check` vorhanden; beide Migrations in `schema_migrations` registriert.
  - Routen: `POST /api/connectors/jira/webhook/<bad>` → **401** generic (kein Tenant-Leak), `GET` → 405 (POST-only); `/api/connectors/jira/webhook-token` → 307 (admin-gated); `/api/cron/jira-inbound-process` → 401 (CRON_SECRET).
- **Migration-Versions-Drift bereinigt:** MCP registrierte die Migrations unter `20260611202524` / `20260612063017`, die Repo-Dateien hießen aber `20260616100000` / `20260616110000`. Da die Migrations **nicht idempotent** sind (`create table` ohne `if not exists`), hätte der Drift `supabase db push` gebrochen (Tooling matcht per Versions-String → hätte Re-Apply versucht → `create table` auf existierende Tabelle). Repo-Dateien auf die prod-registrierten Versionen umbenannt (reproduziert echte Apply-Reihenfolge, keine Kollision mit Nachbarn). Analog zum PROJ-69-Fund.
- **Abgrenzung unverändert:** status conflict-only in α (kind/parent inbound deferred); kein Jira-Outbound-Write im Inbound-Pfad (read + local apply only).

> **α backend built 2026-06-12** (branch `proj-48-49-50/connector-architecture`, off `origin/main`; NOT yet committed). Two migrations live in Prod (`20260616100000` jira_inbound_events + jira_sync_conflicts; `20260616110000` jira_webhook_tokens) — DB smoke ✓. Public webhook receiver `/api/connectors/jira/webhook/[token]` (token-hash→tenant via `jira_webhook_tokens`, idempotent upsert on `(tenant_id, delivery_id)`, fast 200, no token logging) + admin token issue/list/revoke `/api/connectors/jira/webhook-token` + added to `PUBLIC_ROUTES` (only `/webhook/` sub-path; admin route stays gated). Drain cron `/api/cron/jira-inbound-process` (Bearer CRON_SECRET + service-role) + `src/lib/jira/inbound.ts` conflict engine: clean fast-forward auto-apply on title/description (V3 unchanged since last sync), else reviewable `jira_sync_conflicts` row (no silent overwrite — ST-03 + invariant #2); status conflict-only in α; kind/parent inbound deferred. Conflict API GET list + POST resolve (v3_wins/jira_wins/manual; jira_wins applies title/description through RLS+CHECK). **Gates:** lint 0, tsc 13 baseline/0 new, vitest 1798/1798 (+58 PROJ-50), build clean. **Live DB smoke vs Prod** (DO-block + rollback marker, 0 residue): idempotent replay, conflict-CHECK both directions, baseline round-trip. **γ /qa** still open.

> **β frontend built 2026-06-12** (same branch, uncommitted). Webhook-token route aligned to server-side active-tenant resolution (mirror `/api/connectors`, no client tenantId). FE client `src/lib/jira/inbound-api.ts` (issue/list/revoke token + list/resolve conflicts, fetch+safeError). **Webhook-registration panel** `jira-webhook-tokens.tsx` mounted in the Jira connector drawer (`connectors-page-client.tsx`): issue token → reveal-once URL+token callout with copy + warning, list (label/created/last-used/revoked badge), revoke-with-confirm. **Conflict-review** `jira-conflicts-dialog.tsx` mounted in `backlog-client.tsx` behind the existing `canEdit` gate: pending conflicts as V3-vs-Jira side-by-side rows, three resolve actions (V3 behalten / Jira übernehmen / Manuell erledigt) wired to the resolve route, sonner toasts (incl. applied-vs-recorded + α status-record-only hint), empty state, 409-resync. Fetch-on-open via onOpenChange (no effect). **Gates:** lint 0, tsc 13 baseline/0 new, vitest 1805/1805 (+7 inbound-api client tests), build clean. **γ /qa** (security probes: token verification/replay/unknown-key; resolution paths; Playwright) still open.

## Summary

Extend the Jira export connector into bidirectional sync with inbound webhooks, external references, conflict handling, and audit visibility. This starts only after PROJ-47 has proven outbound mapping and job logging.

## Source Requirements

- `features/PROJ-14-integrations-connectors.md`
- `features/PROJ-47-jira-export-connector.md`
- `features/JIRA-IMPORT-2026-04-30.md`

## Dependencies

- Requires: PROJ-47 Jira export connector
- Requires: PROJ-9 work item model
- Requires: PROJ-10 audit/versioning
- Influences: PROJ-46 software extension

## User Stories

### ST-01 Inbound Webhook Receiver
As an integration owner, I want Jira webhooks received and verified so that Jira-side changes can be considered by V3.

Acceptance criteria:
- [ ] Webhooks are authenticated/verified.
- [ ] Unknown Jira issue keys are ignored or quarantined.
- [ ] Webhook processing is idempotent.

### ST-02 External References
As the system, I want stable external refs between V3 work items and Jira issues so that sync state is reliable.

Acceptance criteria:
- [ ] External refs store provider, project key, issue key, external URL, and last sync timestamp.
- [ ] External refs are tenant-scoped.
- [ ] Deleting a V3 item does not silently delete Jira issues.

### ST-03 Conflict Resolution
As a project lead, I want conflicts to be surfaced for review so that Jira and V3 do not overwrite each other silently.

Acceptance criteria:
- [ ] Last-writer conflicts create reviewable sync conflicts.
- [ ] Users can choose V3 wins, Jira wins, or manual merge for supported fields.
- [ ] Conflict decisions are audited.

## Out of Scope

- Full Jira workflow migration.
- Syncing every custom Jira field.
- Automatic destructive deletes across systems.

## Technical Requirements

- Use queued/background-safe processing for webhook bursts.
- Store sanitized raw webhook metadata only as allowed by tenant retention policy.
- All inbound changes must pass the same validation as native API mutations.

## V2 Reference Material

- `docs/decisions/connector-framework.md`
- `features/JIRA-IMPORT-2026-04-30.md`

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
**Added:** 2026-06-11 · Connector-family block design (sibling of PROJ-48/49). **Extends the DEPLOYED PROJ-47 export connector** — reuses its Jira REST client, `external_refs`, and the in-table job pattern. **No new queue technology** (reuses the existing in-table-job + Vercel-cron pattern already in the stack), so **no CIA needed** for the background model; this is a spec-following extension. Webhook-verification design is the one security-sensitive fork (resolved below, not deferred to a new dep).

### What gets built (PM view)
PROJ-47 pushes V3 → Jira (outbound, idempotent via `external_refs`). PROJ-50 adds the **inbound** direction: when an issue changes in Jira, V3 receives a verified webhook, matches it to the linked work item, and either applies the change or — if both sides changed — raises a **reviewable conflict** instead of silently overwriting.

**1. Reuse (already deployed)**
- **`external_refs`** already maps work_item ↔ Jira issue with unique `(tenant_id, provider, external_key)` and `(tenant_id, provider, entity_type, entity_id)` — this is the lookup that turns an inbound Jira issue key into a V3 work item (ST-02). We add a `last_synced_in_at` + a `remote_hash`/`local_hash` marker in its existing `metadata` JSONB (no new columns strictly required).
- **Jira REST client** (`src/lib/jira/client.ts`) + `sanitizeJiraError` reused for any read-back/verification call.
- **In-table job + Vercel-cron pattern** (PROJ-47 `jira_export_jobs`, the `/api/cron/*` + `CRON_SECRET` + service-role pattern) reused verbatim for background-safe inbound processing — webhooks land fast, processing is drained by cron.

**2. Data model additions (all `tenant_id` + RLS)**
- `jira_inbound_events` (the queue) — `tenant_id`, `provider='jira'`, `jira_issue_key`, `delivery_id` (Jira's `X-Atlassian-Webhook-Identifier` for **idempotency** — unique per tenant), `raw_payload_digest` (sanitized/retained per tenant retention policy, never raw secrets), `event_type`, `status` (`received|processed|ignored|quarantined|failed`), `received_at`, `processed_at`, `sanitized_error`. Append-only; cron drains `received` rows.
- `jira_sync_conflicts` — `tenant_id`, `project_id`, `work_item_id`, `external_ref_id`, `field`, `v3_value`, `jira_value`, `detected_at`, `resolution` (`pending|v3_wins|jira_wins|manual`), `resolved_by`, `resolved_at`. RLS: project lead/editor + tenant-admin. Drives the conflict-review UI (ST-03).
- Reuses `tenant_secrets` (`connector_key='jira'`) for the webhook shared secret.

**3. API / runtime surface**
- **Inbound receiver** `POST /api/connectors/jira/webhook` — a **public route** (no user session; Jira calls it). Verifies authenticity (see security), looks up tenant via the routing scheme, writes a `jira_inbound_events` row, returns 200 fast. **Does not process inline** (webhook bursts stay cheap).
- **Drain cron** `GET /api/cron/jira-inbound-process` (`Bearer CRON_SECRET`, service-role) — picks `received` events, resolves work item via `external_refs`, computes conflict vs. last-synced hash, applies non-conflicting changes through the **same validation path as native mutations** (ST technical req), or writes a `jira_sync_conflicts` row. Unknown issue keys → `ignored`/`quarantined` (ST-01).
- **Conflict review** `GET /api/projects/[id]/jira/conflicts` + `POST .../conflicts/[cid]/resolve` (`v3_wins|jira_wins|manual` — audited).

**4. Security model**
- **Webhook verification** (the key fork — resolved, no new dep): Jira Cloud webhooks are not HMAC-signed by default, so we authenticate by a **high-entropy secret path/param** issued per tenant at registration (the secret lives in `tenant_secrets`, the registered Jira webhook URL embeds an opaque token that maps to the tenant). Optionally tighten with an IP allow-list of Atlassian ranges. Constant-time token compare; unknown/invalid token → 401, no tenant leak.
- **Idempotency** via unique `delivery_id` per tenant — replays are no-ops.
- Inbound changes pass the **same server-side validation as native API mutations** (no privileged bypass). Destructive cross-system deletes are never auto-applied (out-of-scope). No secrets logged.

**5. Conflict & failure behavior (ST-03)**
- Conflict = both V3 and Jira changed the same field since `last_synced`. Detected via stored hash/marker; surfaced as a `pending` conflict row, never silently overwritten. User picks winner (audited). 
- Failed processing → `failed` event with sanitized error; cron retries with backoff (attempt counter), bounded.

### CIA note
The background/queue model **reuses the deployed in-table-job + cron pattern** → no new technology, **no CIA gate**. (If pilot load later demands a real streaming queue — e.g. Vercel Queues — that becomes a separate CIA'd follow-up, flagged here, not now.)

### Explicitly deferred
- Full Jira workflow migration, syncing every custom field, automatic destructive cross-system deletes (all spec out-of-scope).
- Real-time streaming queue (in-table + cron is the V1).
- Inbound for entity types beyond `work_item`.

### Slice plan (handoff)
- **α /backend**: `jira_inbound_events` + `jira_sync_conflicts` migrations (RLS), webhook receiver route + verification, drain cron, conflict detection via `external_refs` hash, apply-through-native-validation. Live-RPC/route smoke incl. replay-idempotency + unknown-key quarantine. (~3 PT)
- **β /frontend**: conflict-review surface (list + resolve) in the project Jira/connector area; webhook-registration helper in `/konnektoren`. (~1.5 PT)
- **γ /qa**: signature/secret verification, idempotent replay, unknown-key quarantine, conflict create + each resolution path audited, no-secret-logging. (~1 PT)

## QA Test Results
**Tested:** 2026-06-12 · branch `proj-48-49-50/connector-architecture` (uncommitted) · scope = α backend + β frontend.

### Acceptance Criteria
| AC | Result | Evidence |
|---|---|---|
| ST-01 webhook authenticated/verified | ✅ PASS | Playwright: unknown token → 401, too-short token → 401 (no tenant leak in body); vitest webhook route: unknown/revoked → 401, no queue insert. |
| ST-01 unknown issue key ignored/quarantined | ✅ PASS | `inbound.test.ts`: no external_ref → `ignored`; deleted work item → `quarantined`. |
| ST-01 idempotent processing | ✅ PASS | Live DB smoke: duplicate `(tenant_id, delivery_id)` upsert → 1 row; unique index `jira_inbound_events_delivery_unique`. |
| ST-02 stable tenant-scoped external refs | ✅ PASS | Reuses deployed `external_refs` (unique `(tenant_id,provider,external_key)` + `(…,entity_id)`); inbound baseline stored in `metadata.inbound_last_synced`. |
| ST-02 deleting V3 item never deletes Jira issue | ✅ PASS | Inbound path has no Jira write/delete call (read + local apply only). |
| ST-03 conflicts reviewable, no silent overwrite | ✅ PASS | `inbound.test.ts`: divergent V3+Jira → conflict row, `work_items` never updated; first-inbound-without-baseline → conflict (safe). |
| ST-03 user picks v3_wins/jira_wins/manual | ✅ PASS | resolve route test: jira_wins applies title/description; manual records only; status jira_wins record-only (α). |
| ST-03 decisions audited | ✅ PASS | `resolved_by`/`resolved_at` + RLS-gated update; `jira_sync_conflicts_resolved_shape_check` enforces resolved rows carry `resolved_at`. |

### Security Probes (red-team)
| Probe | Result |
|---|---|
| Invalid / too-short / revoked webhook token → 401 generic | ✅ blocked (Playwright + vitest) |
| Tenant existence leak in webhook 401 body | ✅ none (asserted) |
| Raw token persisted? | ✅ no — only `token_hash` (sha256, CHECK length=64); raw shown once in issue response, never stored/logged |
| Token/secret in logs or error bodies | ✅ none (no `console.*` in PROJ-50 routes; sanitized errors) |
| Idempotent replay (at-least-once) | ✅ no-op on duplicate delivery_id |
| Cron without/with wrong CRON_SECRET → never 200 | ✅ 401 (vitest) / Playwright 401-or-500, never processes |
| RLS cross-tenant / non-member isolation | ✅ live probe: non-member `authenticated` role sees 0 rows in all 3 tables |
| Admin `/webhook-token` route exposed by PUBLIC_ROUTES prefix? | ✅ no — prefix match requires trailing `/webhook/`; `/webhook-token` stays session-gated (Playwright 307/401/403) |
| Inbound bypasses native validation? | ✅ no — applies via `work_items` update hitting the same DB CHECKs; no privileged column writes; no cross-system deletes |

### Tests
- vitest: **1805/1805** green (incl. 35 PROJ-50: engine 11 + client 7 + webhook 5 + cron 4 + resolve 8).
- Playwright `tests/PROJ-50-bidirectional-jira-sync.spec.ts`: **9/9** (chromium) — route auth-gates + public-webhook bad-token + cron secret.
- Live DB smoke (DO-block + rollback marker, **0 residue**): idempotency, conflict CHECK both directions, baseline round-trip, RLS default-deny.
- Gates: lint 0 · tsc 13 baseline/0 new · build clean.

### Documented α deviations (not bugs — scoped in Tech Design)
- **D-1** status conflicts are record-only in α (no reverse status-map auto-apply); `jira_wins` on `status` acknowledges without writing. Deferred to β.
- **D-2** first inbound for a ref with no baseline → conflict (safe, no silent overwrite) rather than fast-forward; a future export-seeds-baseline improvement reduces this.
- **D-3** auto-apply whitelist = title/description only; `kind`/parent reparenting inbound out of scope.
- **D-4** webhook authenticity = per-tenant opaque URL token (Jira Cloud has no default HMAC signing); optional Atlassian IP allow-list noted as a hardening follow-up.

### Verdict
**0 Critical / 0 High.** PRODUCTION-READY for the α+β scope. Status → Approved.

