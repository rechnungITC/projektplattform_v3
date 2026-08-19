/**
 * PROJ-Y-143n — module gate on the single-location handlers, and the proof for
 * the first of the two special cases the slice had to solve.
 *
 * These handlers do not resolve the tenant from the active-workspace cookie;
 * they take it from the row they just loaded. The gate follows that anchor
 * rather than introducing a second one, so the test makes the two tenants
 * differ and asserts which one the gate consulted. A gate reading the caller's
 * *active* tenant would pass a naive "module off → 403" test while checking
 * the wrong tenant's settings.
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

function seedRow(extra: Record<string, unknown> = {}) {
  harness.table("locations").maybeSingle = vi.fn(async () => ({
    data: { id: ID, tenant_id: ROW_TENANT, updated_at: UPDATED_AT, name: "Berlin", ...extra },
    error: null,
  }))
}

function makePatch(body: unknown): Request {
  return new Request(`http://localhost/api/locations/${ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => harness.reset())

describe("PATCH /api/locations/[id]", () => {
  it("answers 403 with the organization module off", async () => {
    seedRow()
    harness.activeModules = withoutOrganization()
    const res = await PATCH(makePatch({ expected_updated_at: UPDATED_AT, name: "X" }), ctx)
    expect(res.status).toBe(403)
  })

  it("gates on the row's tenant, not on the active workspace", async () => {
    seedRow()
    harness.activeTenantId = OTHER_TENANT
    harness.activeModules = withoutOrganization()
    await PATCH(makePatch({ expected_updated_at: UPDATED_AT, name: "X" }), ctx)
    expect(harness.settingsLookups).toEqual([ROW_TENANT])
  })

  it("gates before the update, and before the body is even validated", async () => {
    seedRow()
    harness.activeModules = withoutOrganization()
    const res = await PATCH(makePatch({ nonsense: true }), ctx)
    expect(res.status).toBe(403)
    expect(harness.table("locations").update).not.toHaveBeenCalled()
  })

  it("still 404s an unknown row before consulting any module", async () => {
    harness.table("locations").maybeSingle = vi.fn(async () => ({
      data: null,
      error: null,
    }))
    const res = await PATCH(makePatch({ expected_updated_at: UPDATED_AT, name: "X" }), ctx)
    expect(res.status).toBe(404)
    expect(harness.settingsLookups).toEqual([])
  })

  it("still updates with the module on", async () => {
    seedRow()
    harness.table("locations").single = vi.fn(async () => ({
      data: { id: ID, tenant_id: ROW_TENANT, name: "X" },
      error: null,
    }))
    const res = await PATCH(makePatch({ expected_updated_at: UPDATED_AT, name: "X" }), ctx)
    expect(res.status).toBe(200)
  })
})

describe("DELETE /api/locations/[id]", () => {
  it("answers 403 with the organization module off", async () => {
    seedRow()
    harness.activeModules = withoutOrganization()
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), ctx)
    expect(res.status).toBe(403)
    expect(harness.table("locations").delete).not.toHaveBeenCalled()
  })

  it("gates on the row's tenant", async () => {
    seedRow()
    harness.activeTenantId = OTHER_TENANT
    harness.activeModules = withoutOrganization()
    await DELETE(new Request("http://localhost", { method: "DELETE" }), ctx)
    expect(harness.settingsLookups).toEqual([ROW_TENANT])
  })

  it("still deletes with the module on", async () => {
    seedRow()
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), ctx)
    expect(res.status).toBe(204)
  })
})
