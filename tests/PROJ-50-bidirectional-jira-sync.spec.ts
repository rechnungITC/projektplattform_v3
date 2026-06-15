/**
 * PROJ-50 — Bidirectional Jira Sync, γ QA auth-gate spec.
 *
 * Route-level security probes (no session), mirroring the PROJ-70/88 pattern:
 *   - admin token-management route is session-gated (307/401/403),
 *   - project-scoped conflict routes are session-gated,
 *   - the PUBLIC inbound webhook accepts unauth requests but rejects a bad
 *     token with 401 (generic, no tenant leak),
 *   - the drain cron rejects a missing/wrong CRON_SECRET with 401.
 *
 * DB-level invariants (idempotent replay, conflict CHECK, RLS) are proven by
 * the live DB smoke + vitest (src/lib/jira/inbound.test.ts + route tests).
 */

import { expect, test } from "./fixtures/auth-fixture"

const DUMMY_PROJECT = "00000000-0000-0000-0000-000000000000"
const DUMMY_CONFLICT = "00000000-0000-0000-0000-000000000001"
const BAD_TOKEN = "f".repeat(64) // well-formed but unknown → must 401

test.describe("PROJ-50 / Jira inbound sync API auth-gates", () => {
  // --- admin token management: session-gated ---
  test("GET /api/connectors/jira/webhook-token is auth-gated", async ({ request }) => {
    const res = await request.get("/api/connectors/jira/webhook-token", {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([307, 401, 403]).toContain(res.status())
  })

  test("POST /api/connectors/jira/webhook-token is auth-gated", async ({ request }) => {
    const res = await request.post("/api/connectors/jira/webhook-token", {
      data: { label: "x" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([307, 401, 403]).toContain(res.status())
  })

  test("DELETE /api/connectors/jira/webhook-token is auth-gated", async ({ request }) => {
    const res = await request.delete(
      "/api/connectors/jira/webhook-token?id=00000000-0000-0000-0000-000000000000",
      { failOnStatusCode: false, maxRedirects: 0 },
    )
    expect([307, 401, 403]).toContain(res.status())
  })

  // --- project-scoped conflicts: session-gated ---
  test("GET /jira/conflicts is auth-gated", async ({ request }) => {
    const res = await request.get(
      `/api/projects/${DUMMY_PROJECT}/jira/conflicts`,
      { failOnStatusCode: false, maxRedirects: 0 },
    )
    expect([307, 401, 403]).toContain(res.status())
  })

  test("POST /jira/conflicts/[cid]/resolve is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${DUMMY_PROJECT}/jira/conflicts/${DUMMY_CONFLICT}/resolve`,
      { data: { resolution: "manual" }, failOnStatusCode: false, maxRedirects: 0 },
    )
    expect([307, 401, 403]).toContain(res.status())
  })

  // --- PUBLIC webhook: reachable without a session, but bad token → 401 ---
  test("POST /api/connectors/jira/webhook/[token] rejects an unknown token (401, no redirect)", async ({
    request,
  }) => {
    const res = await request.post(
      `/api/connectors/jira/webhook/${BAD_TOKEN}`,
      {
        data: { webhookEvent: "jira:issue_updated", issue: { key: "P-1" } },
        failOnStatusCode: false,
        maxRedirects: 0,
      },
    )
    // Public route (no auth redirect) but the token is unknown → generic 401.
    expect(res.status()).toBe(401)
    const body = await res.json().catch(() => ({}))
    // No tenant existence leak in the body.
    expect(JSON.stringify(body)).not.toContain("tenant")
  })

  test("POST /api/connectors/jira/webhook/[token] rejects a too-short token (401)", async ({
    request,
  }) => {
    const res = await request.post("/api/connectors/jira/webhook/short", {
      data: {},
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(res.status()).toBe(401)
  })

  // --- drain cron: rejects missing/wrong CRON_SECRET ---
  test("GET /api/cron/jira-inbound-process rejects a missing secret (401)", async ({
    request,
  }) => {
    const res = await request.get("/api/cron/jira-inbound-process", {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    // Never processes without a valid secret (401, or 500 if env unset).
    expect([401, 500]).toContain(res.status())
  })

  test("GET /api/cron/jira-inbound-process rejects a wrong secret", async ({
    request,
  }) => {
    const res = await request.get("/api/cron/jira-inbound-process", {
      headers: { authorization: "Bearer wrong-secret" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([401, 500]).toContain(res.status())
  })
})
