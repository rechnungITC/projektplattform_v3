import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-144 — Verwerfen eines Sprach-Entwurfs.
// Wichtig: fremd, nicht vorhanden und „nicht mehr offen" sind absichtlich
// dieselbe Antwort (404) — sonst verrät die Route die Existenz fremder Entwürfe.

const mocks = vi.hoisted(() => ({
  supabase: { from: vi.fn() },
  getAuthenticatedUserId: vi.fn(),
  resolveActiveTenantId: vi.fn(),
  requireTenantMember: vi.fn(),
  requireModuleActive: vi.fn(),
}))

vi.mock("@/app/api/_lib/route-helpers", async () => {
  const actual = await vi.importActual<
    typeof import("@/app/api/_lib/route-helpers")
  >("@/app/api/_lib/route-helpers")
  return {
    ...actual,
    getAuthenticatedUserId: mocks.getAuthenticatedUserId,
    requireTenantMember: mocks.requireTenantMember,
  }
})

vi.mock("@/app/api/_lib/active-tenant", () => ({
  resolveActiveTenantId: mocks.resolveActiveTenantId,
}))

vi.mock("@/lib/tenant-settings/server", () => ({
  requireModuleActive: mocks.requireModuleActive,
}))

import { DELETE } from "./route"

const USER_ID = "22222222-2222-4222-8222-222222222222"
const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const DRAFT_ID = "44444444-4444-4444-8444-444444444444"

let eqCalls: Array<[string, unknown]> = []
let updatePayload: Record<string, unknown> | null = null
let updateResult: { data: unknown; error: unknown } = { data: null, error: null }

beforeEach(() => {
  vi.clearAllMocks()
  eqCalls = []
  updatePayload = null
  updateResult = { data: { id: DRAFT_ID }, error: null }
  mocks.getAuthenticatedUserId.mockResolvedValue({
    userId: USER_ID,
    supabase: mocks.supabase,
  })
  mocks.resolveActiveTenantId.mockResolvedValue(TENANT_ID)
  mocks.requireTenantMember.mockResolvedValue(null)
  mocks.requireModuleActive.mockResolvedValue(null)
  mocks.supabase.from.mockImplementation(() => chain())
})

describe("DELETE /api/assistant/work-item-drafts/[draftId]", () => {
  it("weist eine ungültige Kennung mit 400 ab", async () => {
    expect((await DELETE(req(), params("nope"))).status).toBe(400)
  })

  it("antwortet 401 ohne Anmeldung", async () => {
    mocks.getAuthenticatedUserId.mockResolvedValue({
      userId: null,
      supabase: mocks.supabase,
    })
    expect((await DELETE(req(), params())).status).toBe(401)
  })

  it("setzt den Entwurf auf verworfen und filtert auf eigene, offene Zeilen", async () => {
    const res = await DELETE(req(), params())
    expect(res.status).toBe(200)
    expect(updatePayload).toEqual({ status: "discarded" })
    expect(eqCalls).toEqual(
      expect.arrayContaining([
        ["id", DRAFT_ID],
        ["tenant_id", TENANT_ID],
        ["user_id", USER_ID],
        ["status", "open"],
      ]),
    )
  })

  it("antwortet 404 wenn nichts Offenes getroffen wurde", async () => {
    updateResult = { data: null, error: null }
    const res = await DELETE(req(), params())
    expect(res.status).toBe(404)
  })
})

function params(draftId: string = DRAFT_ID) {
  return { params: Promise.resolve({ draftId }) }
}

function req(): Request {
  return new Request("http://localhost/api/assistant/work-item-drafts/x", {
    method: "DELETE",
  })
}

function chain() {
  const api: Record<string, unknown> = {
    update: vi.fn((payload: Record<string, unknown>) => {
      updatePayload = payload
      return api
    }),
    select: vi.fn(() => api),
    eq: vi.fn((column: string, value: unknown) => {
      eqCalls.push([column, value])
      return api
    }),
    maybeSingle: vi.fn(async () => updateResult),
  }
  return api
}
