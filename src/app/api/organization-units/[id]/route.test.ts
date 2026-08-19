/**
 * PROJ-Y-143n — module gate on the single organization-unit handlers.
 *
 * Same special case as the locations equivalent: the tenant comes from the
 * loaded row, not from the active workspace, so the gate is anchored there and
 * the tests make the two tenants differ to prove it.
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

import { DELETE, PATCH } from "./route"

const ROW_TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const OTHER_TENANT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const UPDATED_AT = "2026-05-09T00:00:00Z"

const ctx = { params: Promise.resolve({ id: ID }) }

function seedRow() {
  harness.table("organization_units").maybeSingle = vi.fn(async () => ({
    data: { id: ID, tenant_id: ROW_TENANT, updated_at: UPDATED_AT, name: "Eng" },
    error: null,
  }))
}

function makePatch(body: unknown): Request {
  return new Request(`http://localhost/api/organization-units/${ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => harness.reset())

describe("PATCH /api/organization-units/[id]", () => {
  it("answers 403 with the organization module off", async () => {
    seedRow()
    harness.activeModules = withoutOrganization()
    const res = await PATCH(makePatch({ expected_updated_at: UPDATED_AT, name: "X" }), ctx)
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("module_disabled")
  })

  it("gates on the row's tenant, not on the active workspace", async () => {
    seedRow()
    harness.activeTenantId = OTHER_TENANT
    harness.activeModules = withoutOrganization()
    await PATCH(makePatch({ expected_updated_at: UPDATED_AT, name: "X" }), ctx)
    expect(harness.settingsLookups).toEqual([ROW_TENANT])
  })

  it("gates before the update", async () => {
    seedRow()
    harness.activeModules = withoutOrganization()
    await PATCH(makePatch({ expected_updated_at: UPDATED_AT, name: "X" }), ctx)
    expect(harness.table("organization_units").update).not.toHaveBeenCalled()
  })

  it("still updates with the module on", async () => {
    seedRow()
    harness.table("organization_units").single = vi.fn(async () => ({
      data: { id: ID, tenant_id: ROW_TENANT, name: "X" },
      error: null,
    }))
    const res = await PATCH(makePatch({ expected_updated_at: UPDATED_AT, name: "X" }), ctx)
    expect(res.status).toBe(200)
  })

  it("keeps the optimistic lock with the module on", async () => {
    seedRow()
    const res = await PATCH(makePatch({ expected_updated_at: "stale", name: "X" }), ctx)
    expect(res.status).toBe(409)
  })
})

describe("DELETE /api/organization-units/[id]", () => {
  it("answers 403 with the organization module off", async () => {
    seedRow()
    harness.activeModules = withoutOrganization()
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), ctx)
    expect(res.status).toBe(403)
    expect(harness.table("organization_units").delete).not.toHaveBeenCalled()
  })

  it("gates on the row's tenant", async () => {
    seedRow()
    harness.activeTenantId = OTHER_TENANT
    harness.activeModules = withoutOrganization()
    await DELETE(new Request("http://localhost", { method: "DELETE" }), ctx)
    expect(harness.settingsLookups).toEqual([ROW_TENANT])
  })

  it("still deletes an unblocked unit with the module on", async () => {
    seedRow()
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), ctx)
    expect(res.status).toBe(204)
  })

  it("still reports dependency blockers with the module on", async () => {
    seedRow()
    harness.table("stakeholders").result = {
      data: [{ id: "s1", name: "Anna" }],
      error: null,
      count: 1,
    }
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), ctx)
    expect(res.status).toBe(409)
    const body = (await res.json()) as { blockers: Array<{ kind: string }> }
    expect(body.blockers.map((b) => b.kind)).toContain("stakeholders")
  })
})
