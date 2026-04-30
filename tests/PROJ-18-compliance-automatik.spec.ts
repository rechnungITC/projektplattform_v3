import { expect, test } from "@playwright/test"

// PROJ-18 — Compliance Automatik
//
// E2E coverage focuses on the auth-gate and route shape since the
// drawer flow requires a logged-in tenant member with project-edit
// access. The full attach-tag → trigger-fire path is validated at the
// service-role layer in the QA SQL probes; here we cover the public
// behavior of the API routes.

test.describe("PROJ-18 / public route surface", () => {
  test("GET /api/compliance-tags requires authentication", async ({
    request,
  }) => {
    const res = await request.get("/api/compliance-tags", {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    // 401 (unauthorized) or 307 (auth redirect to /login) are both valid.
    expect([307, 401]).toContain(res.status())
  })

  test("phase-warnings route resolves under /[pid] slug", async ({ request }) => {
    const res = await request.get(
      "/api/projects/00000000-0000-0000-0000-000000000000/phases/00000000-0000-0000-0000-000000000000/compliance-warnings",
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    // Route must exist (no 404 from a missing handler). 401/307 both acceptable.
    expect([307, 401]).toContain(res.status())
  })

  test("phase transition requires authentication", async ({ request }) => {
    const res = await request.post(
      "/api/projects/00000000-0000-0000-0000-000000000000/phases/00000000-0000-0000-0000-000000000000/transition",
      {
        data: { to_status: "completed" },
        failOnStatusCode: false,
        maxRedirects: 0,
      }
    )
    expect([307, 401]).toContain(res.status())
  })

  test("POST /api/projects requires authentication", async ({ request }) => {
    const res = await request.post("/api/projects", {
      data: {
        tenant_id: "00000000-0000-0000-0000-000000000000",
        name: "QA E2E Probe",
      },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([307, 401]).toContain(res.status())
  })
})
