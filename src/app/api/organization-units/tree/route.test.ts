/**
 * PROJ-Y-143n — module gate on the organization tree endpoint.
 *
 * Read intent, so a disabled module must answer 404 (not 403): the gate exists
 * so it does not reveal the surface it hides.
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

describe("GET /api/organization-units/tree", () => {
  it("answers 404 with the organization module off", async () => {
    harness.activeModules = withoutOrganization()
    const res = await GET()
    expect(res.status).toBe(404)
    // Generic body: a caller must not learn that the tree exists at all.
    expect(await res.json()).toEqual({
      error: { code: "not_found", message: "Resource not found." },
    })
  })

  it("still serves the tree with the module on", async () => {
    harness.role = "member"
    harness.table("organization_units").result = {
      data: [
        {
          id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
          tenant_id: "11111111-1111-4111-8111-111111111111",
          parent_id: null,
          name: "Acme",
          code: null,
          type: "company",
          location_id: null,
          import_id: null,
          description: null,
          is_active: true,
          sort_order: null,
          created_at: "2026-05-09T00:00:00Z",
          updated_at: "2026-05-09T00:00:00Z",
        },
      ],
      error: null,
    }
    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { tree: Array<{ name: string }> }
    expect(body.tree.map((n) => n.name)).toEqual(["Acme"])
  })

  it("fails open when the tenant has no settings row", async () => {
    // Matches `requireModuleActive`: a legacy tenant without settings keeps
    // working rather than losing its data behind a 404.
    harness.activeModules = null
    harness.role = "member"
    const res = await GET()
    expect(res.status).toBe(200)
  })

  it("still answers 401 unauthenticated and 403 without membership", async () => {
    harness.userId = null
    expect((await GET()).status).toBe(401)
    harness.reset()
    harness.activeTenantId = null
    expect((await GET()).status).toBe(403)
  })
})
