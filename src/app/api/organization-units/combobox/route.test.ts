/**
 * PROJ-Y-143n — module gate on the shared organization-unit typeahead.
 *
 * This endpoint is the one with reach beyond its own page: it feeds parent
 * pickers and bulk-move, and PROJ-62 earmarked it for the PROJ-57 person form.
 * Leaving it ungated would have kept unit names readable through a picker in a
 * workspace whose organization surface is switched off.
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

const url = "http://localhost/api/organization-units/combobox?q=ac"

beforeEach(() => harness.reset())

describe("GET /api/organization-units/combobox", () => {
  it("answers 404 with the organization module off", async () => {
    harness.activeModules = withoutOrganization()
    const res = await GET(new Request(url))
    expect(res.status).toBe(404)
  })

  it("leaks no unit names in the disabled response", async () => {
    harness.activeModules = withoutOrganization()
    harness.table("organization_units").result = {
      data: [
        {
          id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
          parent_id: null,
          name: "Acme Holding",
          type: "company",
          is_active: true,
        },
      ],
      error: null,
    }
    const res = await GET(new Request(url))
    expect(await res.text()).not.toContain("Acme")
  })

  it("still answers with the module on", async () => {
    harness.role = "member"
    harness.table("organization_units").result = {
      data: [
        {
          id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
          parent_id: null,
          name: "Acme Holding",
          type: "company",
          is_active: true,
        },
      ],
      error: null,
    }
    const res = await GET(new Request(url))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: Array<{ name: string }> }
    expect(body.items.map((i) => i.name)).toEqual(["Acme Holding"])
  })
})
