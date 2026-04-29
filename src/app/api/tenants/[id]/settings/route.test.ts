import { beforeEach, describe, expect, it, vi } from "vitest"

const getUserMock = vi.fn()

const tenantMembershipChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}
const settingsChain = {
  select: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const fromMock = vi.fn((table: string) => {
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "tenant_settings") return settingsChain
  throw new Error(`unexpected table ${table}`)
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

import { GET, PATCH } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const USER_ID = "22222222-2222-4222-8222-222222222222"

const SETTINGS_ROW = {
  tenant_id: TENANT_ID,
  active_modules: ["risks", "decisions"],
  privacy_defaults: { default_class: 3 },
  ai_provider_config: { external_provider: "none" },
  retention_overrides: {},
  created_at: "2026-04-29T00:00:00Z",
  updated_at: "2026-04-29T00:00:00Z",
}

beforeEach(() => {
  vi.clearAllMocks()
  tenantMembershipChain.select.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.eq.mockReturnValue(tenantMembershipChain)
  settingsChain.select.mockReturnValue(settingsChain)
  settingsChain.update.mockReturnValue(settingsChain)
  settingsChain.eq.mockReturnValue(settingsChain)

  tenantMembershipChain.maybeSingle.mockResolvedValue({
    data: { role: "admin" },
    error: null,
  })
})

describe("GET /api/tenants/[id]/settings", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: TENANT_ID }),
    })
    expect(res.status).toBe(401)
  })

  it("returns 403 when caller is not tenant_admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    tenantMembershipChain.maybeSingle.mockResolvedValue({
      data: { role: "member" },
      error: null,
    })
    const res = await GET(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: TENANT_ID }),
    })
    expect(res.status).toBe(403)
  })

  it("returns 200 with the settings row", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    settingsChain.maybeSingle.mockResolvedValue({
      data: SETTINGS_ROW,
      error: null,
    })
    const res = await GET(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: TENANT_ID }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { settings: typeof SETTINGS_ROW }
    expect(body.settings.tenant_id).toBe(TENANT_ID)
  })
})

describe("PATCH /api/tenants/[id]/settings", () => {
  function makeReq(body: unknown): Request {
    return new Request("http://localhost/x", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  }

  it("returns 400 on empty body", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PATCH(makeReq({}), {
      params: Promise.resolve({ id: TENANT_ID }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 400 on invalid privacy_defaults default_class", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PATCH(
      makeReq({ privacy_defaults: { default_class: 4 } }),
      { params: Promise.resolve({ id: TENANT_ID }) }
    )
    expect(res.status).toBe(400)
  })

  it("returns 400 on invalid module key", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PATCH(
      makeReq({ active_modules: ["risks", "fake_module"] }),
      { params: Promise.resolve({ id: TENANT_ID }) }
    )
    expect(res.status).toBe(400)
  })

  it("updates active_modules on valid input", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    settingsChain.maybeSingle.mockResolvedValue({
      data: { ...SETTINGS_ROW, active_modules: ["risks"] },
      error: null,
    })
    const res = await PATCH(makeReq({ active_modules: ["risks"] }), {
      params: Promise.resolve({ id: TENANT_ID }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { settings: { active_modules: string[] } }
    expect(body.settings.active_modules).toEqual(["risks"])
  })

  it("returns 403 when caller is not tenant_admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    tenantMembershipChain.maybeSingle.mockResolvedValue({
      data: { role: "member" },
      error: null,
    })
    const res = await PATCH(makeReq({ active_modules: ["risks"] }), {
      params: Promise.resolve({ id: TENANT_ID }),
    })
    expect(res.status).toBe(403)
  })
})
