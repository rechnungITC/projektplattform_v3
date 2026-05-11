import { expect, test } from "@playwright/test"

/** PROJ-44 — context-sources public-surface smoke. */

test.describe("PROJ-44 / context-sources public surface", () => {
  test("API: GET /api/context-sources is auth-gated", async ({ request }) => {
    const res = await request.get("/api/context-sources", {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([307, 401]).toContain(res.status())
  })
  test("API: POST /api/context-sources is auth-gated", async ({ request }) => {
    const res = await request.post("/api/context-sources", {
      data: { kind: "document", title: "Test" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([307, 401]).toContain(res.status())
  })
})
