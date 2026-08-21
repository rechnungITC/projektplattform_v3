/**
 * PROJ-Y-143n — module gate on the read-only landscape view.
 *
 * The view joins `organization_units` with PROJ-15 `vendors`. Whether a
 * surface that spans two modules should consult both switches is a separate
 * question the spec explicitly parks; this gate covers the `organization`
 * half, which is the module that owns the route.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createModuleGateHarness,
  withoutOrganization,
} from "@/test/module-gate-harness"

const harness = createModuleGateHarness()
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => harness.client),
}))

import { GET } from "./route"

beforeEach(() => harness.reset())

describe("GET /api/organization-landscape", () => {
  it("answers 404 with the organization module off", async () => {
    harness.activeModules = withoutOrganization()
    const res = await GET()
    expect(res.status).toBe(404)
  })

  it("still serves the landscape with the module on", async () => {
    harness.role = "member"
    harness.table("tenant_organization_landscape").result = {
      data: [
        {
          id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
          tenant_id: "11111111-1111-4111-8111-111111111111",
          name: "Acme",
          kind: "unit",
          type: "company",
          parent_id: null,
          location_id: null,
        },
      ],
      error: null,
    }
    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[] }
    expect(body.items).toHaveLength(1)
  })
})
