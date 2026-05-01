import { expect, test } from "@playwright/test"

// PROJ-28 — Method-aware Project-Room Navigation
//
// The label/route-rename behavior requires an authenticated session
// AND a real project with a known project_method, neither of which is
// wired into Playwright fixtures yet (cf. PROJ-23 spec). The smoke
// tests below cover what's verifiable without auth:
//
//   1. New alias routes (arbeitspakete / phasen / releases) sit
//      behind the same auth gate as their canonical siblings — no
//      route accidentally became public.
//   2. Existing canonical routes still redirect to /login for
//      unauthenticated users (no regression).
//   3. Bare project root and non-existent slugs go through the auth
//      gate cleanly — the proxy doesn't 500 on edge URLs.
//
// Once a logged-in test fixture lands, the deeper checks (visible
// sidebar labels per method, 308 from /backlog → /arbeitspakete in a
// Waterfall project, mobile viewport parity) become automated.

const PROJECT_UUID = "00000000-0000-0000-0000-000000000000"

test.describe("PROJ-28 / public route surface", () => {
  test("new alias routes are auth-gated like the canonical routes", async ({
    request,
  }) => {
    for (const slug of ["arbeitspakete", "phasen", "releases"]) {
      const res = await request.get(`/projects/${PROJECT_UUID}/${slug}`, {
        failOnStatusCode: false,
        maxRedirects: 0,
      })
      expect(
        [307, 401].includes(res.status()),
        `alias /${slug} should be auth-gated, got ${res.status()}`,
      ).toBe(true)
    }
  })

  test("canonical routes still 307 to /login (no regression)", async ({
    request,
  }) => {
    for (const slug of ["backlog", "planung", "abhaengigkeiten", "governance"]) {
      const res = await request.get(`/projects/${PROJECT_UUID}/${slug}`, {
        failOnStatusCode: false,
        maxRedirects: 0,
      })
      expect([307, 401]).toContain(res.status())
    }
  })

  test("project root + unknown slugs do not crash the proxy", async ({
    request,
  }) => {
    const probes = [
      `/projects/${PROJECT_UUID}`,
      `/projects/${PROJECT_UUID}/`,
      `/projects/${PROJECT_UUID}/totally-unknown-slug`,
    ]
    for (const path of probes) {
      const res = await request.get(path, {
        failOnStatusCode: false,
        maxRedirects: 0,
      })
      // Auth gate (307/401) or NotFound rendering (200/404) — none should 500.
      expect(res.status()).toBeLessThan(500)
    }
  })

  test("non-uuid project ids do not crash the proxy", async ({ request }) => {
    // The middleware UUID guard should keep /projects/new/wizard and
    // /projects/drafts working as today (auth-gated, not affected by
    // PROJ-28's method lookup).
    for (const path of ["/projects/new/wizard", "/projects/drafts"]) {
      const res = await request.get(path, {
        failOnStatusCode: false,
        maxRedirects: 0,
      })
      expect([307, 401]).toContain(res.status())
    }
  })
})
