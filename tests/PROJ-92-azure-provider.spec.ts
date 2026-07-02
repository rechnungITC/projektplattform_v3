/**
 * PROJ-92 — Azure OpenAI provider API surface: auth-gate verification.
 *
 * The Azure provider reuses the generic per-provider routes
 * (`/api/tenants/[id]/ai-providers/[provider]` + `/validate`), now with
 * `azure` in ALLOWED_PROVIDERS. Without a session every method must be
 * gated (307 redirect to login, or 401/403) — never reachable unauthenticated.
 *
 * Mirrors the PROJ-89 / PROJ-88 auth-gate pattern (307/401/403 without a
 * session). The functional behavior (whitelist accepts azure, class3 rejects
 * azure, EU-region gate) is proven by the backend/QA live prod smoke +
 * router-azure/capability-matrix/route unit suites; this spec pins the
 * route-level auth boundary for the new azure provider value.
 */

import { expect, test } from "./fixtures/auth-fixture"

const DUMMY_TENANT = "00000000-0000-0000-0000-000000000000"
const AZURE = `/api/tenants/${DUMMY_TENANT}/ai-providers/azure`

const VALID_AZURE_BODY = {
  endpoint_url: "https://res.openai.azure.com",
  deployment_name: "gpt-4o",
  api_key: "az-secret-key-1234567890",
  api_version: "2024-10-21",
  azure_region: "westeurope",
}

test.describe("PROJ-92 / Azure provider API auth-gates", () => {
  test("GET azure provider is auth-gated", async ({ request }) => {
    const res = await request.get(AZURE, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([307, 401, 403]).toContain(res.status())
  })

  test("PUT azure provider is auth-gated", async ({ request }) => {
    const res = await request.put(AZURE, {
      data: VALID_AZURE_BODY,
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([307, 401, 403]).toContain(res.status())
  })

  test("POST azure validate is auth-gated", async ({ request }) => {
    const res = await request.post(`${AZURE}/validate`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([307, 401, 403]).toContain(res.status())
  })

  test("DELETE azure provider is auth-gated", async ({ request }) => {
    const res = await request.delete(AZURE, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([307, 401, 403]).toContain(res.status())
  })

  test("PUT azure with a non-EU region is auth-gated (gate before region check)", async ({
    request,
  }) => {
    // Even a would-be-rejected non-EU region must not leak past the auth gate.
    const res = await request.put(AZURE, {
      data: { ...VALID_AZURE_BODY, azure_region: "eastus" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([307, 401, 403]).toContain(res.status())
  })
})
