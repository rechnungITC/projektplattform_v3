/**
 * PROJ-Y-143n — module gate on the locations collection.
 *
 * The two intents differ on purpose: reading answers 404 so the gate does not
 * reveal the surface, writing answers 403 because a caller that POSTs here has
 * demonstrably already found it.
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

import { GET, POST } from "./route"

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/locations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => harness.reset())

describe("GET /api/locations", () => {
  it("answers 404 with the organization module off", async () => {
    harness.activeModules = withoutOrganization()
    const res = await GET()
    expect(res.status).toBe(404)
  })

  it("still lists locations with the module on", async () => {
    harness.role = "member"
    harness.table("locations").result = {
      data: [{ id: "l1", tenant_id: "t1", name: "Berlin" }],
      error: null,
    }
    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { locations: unknown[] }
    expect(body.locations).toHaveLength(1)
  })
})

describe("POST /api/locations", () => {
  it("answers 403 with the organization module off", async () => {
    harness.activeModules = withoutOrganization()
    const res = await POST(makePost({ name: "Berlin" }))
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("module_disabled")
  })

  it("gates before writing anything", async () => {
    harness.activeModules = withoutOrganization()
    await POST(makePost({ name: "Berlin" }))
    expect(harness.table("locations").insert).not.toHaveBeenCalled()
  })

  it("gates before the admin check, so a member sees the module reason", async () => {
    // Both answer 403; the module reason is the more useful of the two, and it
    // matches the order PROJ-63 and PROJ-45-α already use.
    harness.activeModules = withoutOrganization()
    harness.role = "member"
    const res = await POST(makePost({ name: "Berlin" }))
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("module_disabled")
  })

  it("still refuses a non-admin with the module on", async () => {
    harness.role = "member"
    const res = await POST(makePost({ name: "Berlin" }))
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("forbidden")
  })

  it("still creates for an admin with the module on", async () => {
    harness.table("locations").single = vi.fn(async () => ({
      data: { id: "l1", tenant_id: "t1", name: "Berlin" },
      error: null,
    }))
    const res = await POST(makePost({ name: "Berlin" }))
    expect(res.status).toBe(201)
  })
})
