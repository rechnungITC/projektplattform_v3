/**
 * PROJ-Y-143n — module gate on the move endpoint: the second special case.
 *
 * This route had no tenant reference of its own; `move_organization_unit`, a
 * SECURITY DEFINER RPC, was the only thing gating it. The gate needs a tenant,
 * so the route now loads the unit first — the same anchor its PATCH/DELETE
 * siblings use, deliberately not a second one.
 *
 * The tests hold both halves of the requirement: the module now blocks the
 * move, and the RPC keeps every check it had (it is never reached when the gate
 * closes, and it is still the thing that decides admin rights, cycles and the
 * optimistic lock when the gate opens).
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

import { POST } from "./route"

const ROW_TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const OTHER_TENANT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const PARENT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"

const ctx = { params: Promise.resolve({ id: ID }) }

function seedRow() {
  harness.table("organization_units").maybeSingle = vi.fn(async () => ({
    data: { id: ID, tenant_id: ROW_TENANT },
    error: null,
  }))
}

function makeMove(body: unknown = {
  new_parent_id: PARENT,
  expected_updated_at: "2026-05-09T00:00:00Z",
}): Request {
  return new Request(`http://localhost/api/organization-units/${ID}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => harness.reset())

describe("POST /api/organization-units/[id]/move", () => {
  it("answers 403 with the organization module off", async () => {
    seedRow()
    harness.activeModules = withoutOrganization()
    const res = await POST(makeMove(), ctx)
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("module_disabled")
  })

  it("never reaches the RPC when the gate closes", async () => {
    // The important half: the RPC is SECURITY DEFINER, so if it ran it would
    // move the unit regardless of the module state.
    seedRow()
    harness.activeModules = withoutOrganization()
    await POST(makeMove(), ctx)
    expect(harness.client.rpc).not.toHaveBeenCalled()
  })

  it("gates on the unit's tenant, not on the active workspace", async () => {
    seedRow()
    harness.activeTenantId = OTHER_TENANT
    harness.activeModules = withoutOrganization()
    await POST(makeMove(), ctx)
    expect(harness.settingsLookups).toEqual([ROW_TENANT])
  })

  it("404s an unknown unit without consulting the module", async () => {
    harness.table("organization_units").maybeSingle = vi.fn(async () => ({
      data: null,
      error: null,
    }))
    const res = await POST(makeMove(), ctx)
    expect(res.status).toBe(404)
    expect(harness.settingsLookups).toEqual([])
    expect(harness.client.rpc).not.toHaveBeenCalled()
  })

  it("still delegates to the RPC with the module on", async () => {
    seedRow()
    harness.client.rpc.mockResolvedValue({
      data: { id: ID, tenant_id: ROW_TENANT },
      error: null,
    })
    const res = await POST(makeMove(), ctx)
    expect(res.status).toBe(200)
    expect(harness.client.rpc).toHaveBeenCalledWith("move_organization_unit", {
      p_unit_id: ID,
      p_new_parent_id: PARENT,
      p_expected_updated_at: "2026-05-09T00:00:00Z",
    })
  })

  it("still surfaces the RPC's own refusals with the module on", async () => {
    // The route adds a gate; it does not take the RPC's checks over.
    seedRow()
    for (const [message, status] of [
      ["forbidden", 403],
      ["version_conflict", 409],
      ["cycle_detected", 409],
    ] as const) {
      harness.client.rpc.mockResolvedValue({ data: null, error: { message } })
      const res = await POST(makeMove(), ctx)
      expect(res.status).toBe(status)
    }
  })
})
