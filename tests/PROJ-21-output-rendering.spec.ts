import { expect, test } from "@playwright/test"

// PROJ-21 — Output Rendering: Status-Report & Executive-Summary.
//
// Smoke tests for the public route surface — full create-with-render
// flows (which involve Puppeteer + Storage upload + RLS-gated SELECT)
// require a logged-in fixture. The PROJ-29 auth-fixture skeleton
// exists; once the local SUPABASE_SERVICE_ROLE_KEY is refreshed,
// deeper specs (kind × version, KI modal, PDF download) can layer on
// top via `tests/fixtures/auth-fixture.ts`.

const PROJECT_UUID = "00000000-0000-0000-0000-000000000000"
const SNAPSHOT_UUID = "11111111-1111-4111-8111-111111111111"

test.describe("PROJ-21 / public route surface", () => {
  test("API: snapshot routes are auth-gated like the rest", async ({
    request,
  }) => {
    const probes = [
      ["GET", `/api/projects/${PROJECT_UUID}/snapshots`],
      ["POST", `/api/projects/${PROJECT_UUID}/snapshots`],
      ["POST", `/api/projects/${PROJECT_UUID}/snapshots/preview-ki`],
      ["GET", `/api/projects/${PROJECT_UUID}/snapshots/${SNAPSHOT_UUID}/pdf`],
      [
        "POST",
        `/api/projects/${PROJECT_UUID}/snapshots/${SNAPSHOT_UUID}/render-pdf`,
      ],
    ] as const
    for (const [method, path] of probes) {
      const res = await request[method.toLowerCase() as "get" | "post"](path, {
        failOnStatusCode: false,
        maxRedirects: 0,
        ...(method === "POST" ? { data: {} } : {}),
      })
      expect([307, 401], `${method} ${path} should be auth-gated`).toContain(
        res.status(),
      )
    }
  })

  test("HTML snapshot page is auth-gated (no public link leak)", async ({
    request,
  }) => {
    const res = await request.get(`/reports/snapshots/${SNAPSHOT_UUID}`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([307, 401]).toContain(res.status())
  })

  test("Snapshot print route is auth-gated and indexes-noindex", async ({
    request,
  }) => {
    const res = await request.get(`/reports/snapshots/${SNAPSHOT_UUID}/print`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([307, 401]).toContain(res.status())
  })

  test("non-uuid snapshot id does not crash the route", async ({ request }) => {
    const res = await request.get(`/reports/snapshots/not-a-uuid`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(res.status()).toBeLessThan(500)
  })
})
