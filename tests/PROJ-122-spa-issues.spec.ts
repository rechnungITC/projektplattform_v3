import { expect, test } from "@playwright/test"

// PROJ-122 — SPA Issues auth-gate spec.
//
// This spec only guards the HTTP surface: nothing under /spa-issues may be
// reachable without a session. The real authorization depth (role gate,
// need-to-know, no self-escalation, RPC-only writes, aggregate-leak) is proven
// by tests/sql/PROJ-122-spa-issues-pentest.sql, which runs live against the
// database — an HTTP test cannot reach those layers.

const DUMMY = "00000000-0000-0000-0000-000000000000"
const ISSUE = "11111111-1111-4111-8111-111111111111"
const GATE = [307, 401, 403]
const GATE_OR_400 = [307, 400, 401, 403]

test.describe("PROJ-122 / SPA Issues auth-gates", () => {
  test("GET .../spa-issues is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/projects/${DUMMY}/spa-issues`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST .../spa-issues is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/projects/${DUMMY}/spa-issues`, {
      data: { title: "Unauthorized issue" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("PATCH .../spa-issues/[issueId] is auth-gated", async ({ request }) => {
    const res = await request.patch(
      `/api/projects/${DUMMY}/spa-issues/${ISSUE}`,
      {
        data: { title: "Hijack" },
        failOnStatusCode: false,
        maxRedirects: 0,
      }
    )
    expect(GATE).toContain(res.status())
  })

  test("POST .../spa-issues/[issueId]/status is auth-gated", async ({
    request,
  }) => {
    const res = await request.post(
      `/api/projects/${DUMMY}/spa-issues/${ISSUE}/status`,
      {
        data: { status: "agreed" },
        failOnStatusCode: false,
        maxRedirects: 0,
      }
    )
    expect(GATE).toContain(res.status())
  })

  test("GET .../spa-issues/summary is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/projects/${DUMMY}/spa-issues/summary`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("GET .../spa-issues/export is auth-gated (no CSV leak)", async ({
    request,
  }) => {
    const res = await request.get(`/api/projects/${DUMMY}/spa-issues/export`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
    // Must never hand out a CSV body to an anonymous caller.
    expect(res.headers()["content-type"] ?? "").not.toContain("text/csv")
  })

  test("SPA Issues page is auth-gated", async ({ page }) => {
    const res = await page.goto(`/projects/${DUMMY}/spa-issues`, {
      waitUntil: "domcontentloaded",
    })
    expect(page.url()).toContain("/login")
    expect(res?.status() ?? 200).toBeLessThan(500)
  })

  test("invalid project UUID returns 400 or auth-gate", async ({ request }) => {
    const res = await request.get(`/api/projects/not-a-uuid/spa-issues`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE_OR_400).toContain(res.status())
  })
})
