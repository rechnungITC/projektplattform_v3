/**
 * PROJ-75 — Class-3 re-classification backfill, QA auth-gate spec.
 *
 * Route-level security probes (no session). The backfill route is PUBLIC in
 * the session-middleware sense (H-1 fix: added to PUBLIC_ROUTES) BUT is guarded
 * by the CRON_SECRET Bearer token in the handler — same model as /api/cron and
 * /api/mcp. These probes prove:
 *   - the request REACHES the handler (not a 307 /login redirect), proving the
 *     PUBLIC_ROUTES entry works, AND
 *   - without the correct secret it is rejected (401 when CRON_SECRET is set,
 *     500 when it is not configured in the test webServer) — never a processed
 *     200/ok:true result.
 *
 * The DB-layer semantics (monotone upgrade, fail-safe unverified flag,
 * idempotency, index/query) are proven by the live prod DB smoke (0 residue,
 * A1–A6) + vitest (reclassify-backfill/route.test.ts, file-parser.test.ts).
 */

import { expect, test } from "./fixtures/auth-fixture"

const BAD_SECRET = "Bearer " + "z".repeat(32)

test.describe("PROJ-75 / reclassify-backfill API auth-gate", () => {
  test("POST without Authorization is blocked (reaches handler, not /login)", async ({
    request,
  }) => {
    const res = await request.post(
      "/api/context-sources/reclassify-backfill",
      { data: {}, failOnStatusCode: false, maxRedirects: 0 },
    )
    // Must NOT be a session redirect (proves PUBLIC_ROUTES fix) and NOT a
    // processed success.
    expect(res.status()).not.toBe(307)
    expect(res.status()).not.toBe(200)
    expect([401, 500]).toContain(res.status())
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean }
    expect(body.ok).not.toBe(true)
  })

  test("POST with a wrong Bearer secret is rejected, never processes", async ({
    request,
  }) => {
    const res = await request.post(
      "/api/context-sources/reclassify-backfill",
      {
        headers: { authorization: BAD_SECRET },
        data: { limit: 5 },
        failOnStatusCode: false,
        maxRedirects: 0,
      },
    )
    expect(res.status()).not.toBe(200)
    expect([401, 500]).toContain(res.status())
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      upgraded?: number
    }
    expect(body.ok).not.toBe(true)
    expect(body.upgraded).toBeUndefined()
  })

  test("GET is not allowed (POST-only route)", async ({ request }) => {
    const res = await request.get(
      "/api/context-sources/reclassify-backfill",
      { failOnStatusCode: false, maxRedirects: 0 },
    )
    // Method-not-allowed (405) or handler-absent — never a processed 200.
    expect(res.status()).not.toBe(200)
  })
})
